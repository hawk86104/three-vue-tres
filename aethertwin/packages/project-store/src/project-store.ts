import { CommandBus, commandIntent } from "@aethertwin/command-bus";
import {
  parseManifest,
  parseSnapshot,
  type ProjectManifest,
  type ProjectSnapshot,
  type SaveState,
} from "@aethertwin/core-model";
import type { FloorChange, PlanEditIntent } from "@aethertwin/plan-engine";
import type {
  CheckpointResult,
  CreateProjectRequest,
  OpenedProject,
  ProjectBackend,
  RecoveryConfirmation,
} from "./backend";
import { renameProjectCommand, setProjectTagsCommand } from "./project-commands";
import { patchFloorCommand, patchPlanEntitiesCommand } from "./plan-commands";
import {
  patchSnapshotRecordsCommand,
  type AnySnapshotRecordsPatch,
} from "./snapshot-records-command";

export interface ProjectStoreState {
  readonly projectPath: string | null;
  readonly manifest: ProjectManifest | null;
  readonly snapshot: ProjectSnapshot | null;
  readonly recovered: boolean;
  readonly saveState: SaveState;
  readonly error: Error | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export interface ProjectStoreOptions {
  readonly autosaveDelayMs?: number;
  readonly setTimeout?: typeof globalThis.setTimeout;
  readonly clearTimeout?: typeof globalThis.clearTimeout;
}

type StateListener = () => void;
type TimerHandle = ReturnType<typeof globalThis.setTimeout>;
type MutationOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: unknown };

const successfulMutationOutcome: MutationOutcome = Object.freeze({ ok: true });

interface PreparedProject {
  readonly projectPath: string;
  readonly manifest: ProjectManifest;
  readonly snapshot: ProjectSnapshot;
  readonly recovered: boolean;
  readonly bus: CommandBus<ProjectSnapshot>;
}

const initialState = (): ProjectStoreState =>
  Object.freeze({
    projectPath: null,
    manifest: null,
    snapshot: null,
    recovered: false,
    saveState: "saved",
    error: null,
    canUndo: false,
    canRedo: false,
  });

function errorValue(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function immutableState(state: ProjectStoreState): ProjectStoreState {
  if (state.error !== null && !Object.isFrozen(state.error)) {
    Object.freeze(state.error);
  }
  return Object.freeze({ ...state });
}

function parseCheckpointResult(
  value: CheckpointResult,
  expected: ProjectSnapshot,
): CheckpointResult {
  const manifest = parseManifest(value.manifest);
  const snapshot = parseSnapshot(value.snapshot);
  const expectedWithCheckpoint = parseSnapshot({
    ...expected,
    checkpointSequence: expected.sequence,
  });
  if (
    JSON.stringify(snapshot) !== JSON.stringify(expectedWithCheckpoint) ||
    manifest.schemaVersion !== snapshot.schemaVersion ||
    manifest.projectId !== snapshot.project.id ||
    manifest.name !== snapshot.project.name ||
    manifest.profile !== snapshot.project.profile
  ) {
    throw new Error("Invalid checkpoint result: manifest and snapshot must be coherent");
  }
  return Object.freeze({ manifest, snapshot });
}

export class ProjectStore {
  private readonly listeners = new Set<StateListener>();
  private readonly autosaveDelayMs: number;
  private readonly scheduleTimeout: typeof globalThis.setTimeout;
  private readonly cancelTimeout: typeof globalThis.clearTimeout;
  private state: ProjectStoreState = initialState();
  private bus: CommandBus<ProjectSnapshot> | null = null;
  private autosaveTimer: TimerHandle | null = null;
  private operationTail: Promise<void> = Promise.resolve();
  private latestMutationOutcome: Promise<MutationOutcome> = Promise.resolve(
    successfulMutationOutcome,
  );
  private activeCloseAttempt: Promise<void> | null = null;
  private disposed = false;
  private disposePromise: Promise<void> | null = null;

  constructor(
    private readonly backend: ProjectBackend,
    options: ProjectStoreOptions = {},
  ) {
    this.autosaveDelayMs = options.autosaveDelayMs ?? 1_000;
    this.scheduleTimeout = options.setTimeout ?? globalThis.setTimeout;
    this.cancelTimeout = options.clearTimeout ?? globalThis.clearTimeout;
  }

  getState(): ProjectStoreState {
    return this.state;
  }

  subscribe(listener: StateListener): () => void {
    if (this.disposed) {
      return () => undefined;
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  create(request: CreateProjectRequest): Promise<void> {
    const ownedRequest = Object.freeze({ ...request });
    return this.enqueueMutation(() =>
      this.replaceProject(() => this.backend.createProject(ownedRequest)),
    );
  }

  open(projectPath: string): Promise<void> {
    return this.enqueueMutation(() =>
      this.replaceProject(() => this.backend.openProject(projectPath)),
    );
  }

  recover(projectPath: string, confirmation: RecoveryConfirmation): Promise<void> {
    const ownedConfirmation = Object.freeze({ ...confirmation });
    return this.enqueueMutation(() =>
      this.replaceProject(() => this.backend.recoverProject(projectPath, ownedConfirmation)),
    );
  }

  renameProject(name: string): Promise<void> {
    return this.enqueueMutation(() =>
      this.mutate((bus) => bus.execute(renameProjectCommand, { name })),
    );
  }

  setProjectTags(tags: readonly string[]): Promise<void> {
    const ownedTags = Object.freeze([...tags]);
    return this.enqueueMutation(() =>
      this.mutate((bus) => bus.execute(setProjectTagsCommand, { tags: ownedTags })),
    );
  }

  applyPlanEdit(intent: PlanEditIntent): Promise<void> {
    const ownedIntent = structuredClone(intent);
    return this.enqueueMutation(() =>
      this.mutate((bus) => bus.execute(patchPlanEntitiesCommand, ownedIntent)),
    );
  }

  applyFloorPatch(change: FloorChange): Promise<void> {
    const ownedChange = structuredClone(change);
    return this.enqueueMutation(() =>
      this.mutate((bus) => bus.execute(patchFloorCommand, ownedChange)),
    );
  }

  applySnapshotRecordPatches(
    patches: readonly AnySnapshotRecordsPatch[],
  ): Promise<void> {
    const ownedPatches = structuredClone(patches);
    return this.enqueueMutation(() =>
      this.mutate((bus) =>
        bus.transaction(ownedPatches.map((patch) =>
          commandIntent(patchSnapshotRecordsCommand, patch))),
      ),
    );
  }

  undo(): Promise<void> {
    return this.enqueueMutation(() => this.mutate((bus) => bus.undo()));
  }

  redo(): Promise<void> {
    return this.enqueueMutation(() => this.mutate((bus) => bus.redo()));
  }

  save(): Promise<void> {
    return this.enqueueOperation(() => this.performSave());
  }

  flush(): Promise<void> {
    if (this.disposed) {
      return Promise.reject(new Error("ProjectStore is disposed"));
    }
    const operationBoundary = this.operationTail;
    const mutationBoundary = this.latestMutationOutcome;
    return operationBoundary
      .then(() => mutationBoundary)
      .then((outcome) => {
        if (!outcome.ok) {
          throw outcome.error;
        }
      });
  }

  close(): Promise<void> {
    return this.enqueueOperation(() => this.performTrackedClose());
  }

  dispose(): Promise<void> {
    if (this.disposePromise !== null) {
      return this.disposePromise;
    }

    this.disposed = true;
    this.clearAutosaveTimer();
    this.listeners.clear();
    const closeAttempt = this.activeCloseAttempt;
    const pending = this.operationTail.then(() => closeAttempt ?? this.performClose());
    this.operationTail = pending.then(
      () => undefined,
      () => undefined,
    );
    this.disposePromise = pending;
    return pending;
  }

  private performTrackedClose(): Promise<void> {
    const closeAttempt = this.performClose();
    this.activeCloseAttempt = closeAttempt;
    return closeAttempt.finally(() => {
      if (this.activeCloseAttempt === closeAttempt) {
        this.activeCloseAttempt = null;
      }
    });
  }

  private async performClose(): Promise<void> {
    this.clearAutosaveTimer();
    const projectPath = this.state.projectPath;
    if (projectPath === null) {
      this.bus = null;
      this.publish(initialState());
      return;
    }

    try {
      await this.backend.closeProject(projectPath);
      this.bus = null;
      this.publish(initialState());
    } catch (error) {
      this.publish({ ...this.state, saveState: "error", error: errorValue(error) });
      throw error;
    }
  }

  private async replaceProject(openProject: () => Promise<OpenedProject>): Promise<void> {
    const previousPath = this.state.projectPath;
    const previousWasDirty = this.state.saveState === "dirty";
    let opened: OpenedProject | null = null;
    this.clearAutosaveTimer();
    try {
      opened = await openProject();
      const prepared = this.prepareProject(opened);
      if (previousPath !== null) {
        await this.backend.closeProject(previousPath);
      }
      this.install(prepared);
    } catch (error) {
      if (opened !== null && opened.projectPath !== previousPath) {
        try {
          await this.backend.closeProject(opened.projectPath);
        } catch {
          // Preserve the original replacement failure while making a best-effort cleanup.
        }
      }
      this.publish({ ...this.state, saveState: "error", error: errorValue(error) });
      if (previousPath !== null && previousWasDirty) {
        this.scheduleAutosave();
      }
      throw error;
    }
  }

  private prepareProject(opened: OpenedProject): PreparedProject {
    const projectPath = opened.projectPath;
    const manifest = parseManifest(opened.manifest);
    const snapshot = parseSnapshot(opened.snapshot);
    const bus = new CommandBus(snapshot, {
      commit: (batch) => this.backend.commit(projectPath, batch),
    });
    return Object.freeze({
      projectPath,
      manifest,
      snapshot: bus.getSnapshot(),
      recovered: opened.recovered,
      bus,
    });
  }

  private install(prepared: PreparedProject): void {
    const { projectPath, manifest, snapshot, recovered, bus } = prepared;
    this.bus = bus;
    this.publish({
      projectPath,
      manifest,
      snapshot,
      recovered,
      saveState: recovered ? "recovered" : "saved",
      error: null,
      canUndo: false,
      canRedo: false,
    });
  }

  private async mutate(
    operation: (bus: CommandBus<ProjectSnapshot>) => Promise<ProjectSnapshot>,
  ): Promise<void> {
    const bus = this.requireBus();
    const sequence = bus.getSnapshot().sequence;
    try {
      const snapshot = await operation(bus);
      if (this.bus !== bus || snapshot.sequence === sequence) {
        return;
      }
      this.publish({
        ...this.state,
        snapshot,
        saveState: "dirty",
        error: null,
        canUndo: bus.canUndo(),
        canRedo: bus.canRedo(),
      });
      this.scheduleAutosave();
    } catch (error) {
      if (this.bus === bus) {
        this.publish({
          ...this.state,
          snapshot: bus.getSnapshot(),
          saveState: "error",
          error: errorValue(error),
          canUndo: bus.canUndo(),
          canRedo: bus.canRedo(),
        });
      }
      throw error;
    }
  }

  private async performSave(): Promise<void> {
    const bus = this.requireBus();
    const projectPath = this.state.projectPath;
    if (projectPath === null) {
      throw new Error("No project is open");
    }
    const checkpointSnapshot = bus.getSnapshot();
    this.clearAutosaveTimer();
    this.publish({ ...this.state, snapshot: checkpointSnapshot, saveState: "saving", error: null });

    try {
      const checkpoint = parseCheckpointResult(
        await this.backend.checkpoint(projectPath, checkpointSnapshot),
        checkpointSnapshot,
      );
      if (this.bus !== bus) {
        return;
      }
      await bus.acknowledge((snapshot) =>
        snapshot.sequence === checkpoint.snapshot.sequence
          ? checkpoint.snapshot
          : parseSnapshot({
              ...snapshot,
              checkpointSequence: checkpoint.snapshot.checkpointSequence,
            }),
      );
      const currentSnapshot = bus.getSnapshot();
      this.publish({
        ...this.state,
        manifest: checkpoint.manifest,
        snapshot: currentSnapshot,
        recovered: false,
        saveState: currentSnapshot.sequence === checkpointSnapshot.sequence ? "saved" : "dirty",
        error: null,
        canUndo: bus.canUndo(),
        canRedo: bus.canRedo(),
      });
    } catch (error) {
      if (this.bus === bus) {
        this.publish({
          ...this.state,
          snapshot: bus.getSnapshot(),
          saveState: "error",
          error: errorValue(error),
          canUndo: bus.canUndo(),
          canRedo: bus.canRedo(),
        });
      }
      throw error;
    }
  }

  private requireBus(): CommandBus<ProjectSnapshot> {
    if (this.bus === null) {
      throw new Error("No project is open");
    }
    return this.bus;
  }

  private scheduleAutosave(): void {
    if (this.disposed) {
      return;
    }
    this.clearAutosaveTimer();
    this.autosaveTimer = this.scheduleTimeout(() => {
      this.autosaveTimer = null;
      void this.save().catch(() => undefined);
    }, this.autosaveDelayMs);
  }

  private clearAutosaveTimer(): void {
    if (this.autosaveTimer !== null) {
      this.cancelTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  private enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
    if (this.disposed) {
      return Promise.reject(new Error("ProjectStore is disposed"));
    }
    const pending = this.operationTail.then(() => {
      if (this.disposed) {
        throw new Error("ProjectStore is disposed");
      }
      return operation();
    });
    this.operationTail = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.enqueueOperation(operation);
    this.latestMutationOutcome = pending.then(
      () => successfulMutationOutcome,
      (error): MutationOutcome => ({ ok: false, error }),
    );
    return pending;
  }

  private publish(state: ProjectStoreState): void {
    this.state = immutableState(state);
    if (this.disposed) {
      return;
    }
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Subscribers observe state; they cannot roll back an already durable operation.
      }
    }
  }
}
