import { CommandBus, commandIntent } from "@aethertwin/command-bus";
import {
  ASSET_ISSUE_CODES,
  assertRoleAllowsMedia,
  composeInitialPlanReference,
  type AssetImportProgress,
  type AssetImportRequest,
  type AssetIssue,
  type AssetIssueCode,
  type ComposeInitialPlanReferenceInput,
} from "@aethertwin/asset-pipeline";
import {
  parseManifest,
  parseSnapshot,
  type AssetMediaType,
  type AssetRecord,
  type MediaAsset,
  type ProductContent,
  type ProjectManifest,
  type ProjectSnapshot,
  type PlanReference,
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
import {
  patchBuildingStructureCommand,
  type BuildingStructurePatch,
} from "./building-structure-command";
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
  readonly assetIssues: readonly AssetIssue[];
}

export interface ProjectAssetSource {
  readonly assetId: string;
  readonly url: string;
  readonly mediaType: AssetMediaType;
}

export interface ProductMediaImportInput {
  readonly request: AssetImportRequest;
  readonly media: Omit<MediaAsset, "assetId">;
  readonly contentBefore: ProductContent | null;
  readonly contentAfter: ProductContent;
}

export interface ProductMediaImportResult {
  readonly asset: AssetRecord;
  readonly media: MediaAsset;
  readonly content: ProductContent;
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
    assetIssues: Object.freeze([]),
  });

const assetIssueCodes: ReadonlySet<string> = new Set(ASSET_ISSUE_CODES);

function assetIssueCode(value: unknown): AssetIssueCode | null {
  if (value === null || typeof value !== "object") return null;
  const code = (value as { readonly code?: unknown }).code;
  return typeof code === "string" && assetIssueCodes.has(code)
    ? code as AssetIssueCode
    : null;
}

function safeAssetResolutionError(code: AssetIssueCode): Error & { readonly code: AssetIssueCode } {
  const error = new Error("Asset resolution failed.") as Error & { readonly code: AssetIssueCode };
  Object.defineProperty(error, "code", {
    value: code,
    enumerable: true,
  });
  return error;
}

function isImportCancellation(value: unknown): boolean {
  return value !== null && typeof value === "object" &&
    (value as { readonly code?: unknown }).code === "ASSET_IMPORT_CANCELLED";
}

function assertProductMediaRole(
  request: AssetImportRequest,
  kind: MediaAsset["kind"],
): void {
  const expectedRole = kind === "image" ? "content-image" : "content-video";
  if (request.role !== expectedRole) {
    throw new Error("Product media import role must match the media kind.");
  }
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function sameProductContent(
  left: ProductContent,
  right: ProductContent,
): boolean {
  return left.id === right.id
    && left.name === right.name
    && sameStrings(left.tags, right.tags)
    && left.targetEntityId === right.targetEntityId
    && left.description === right.description
    && sameStrings(left.mediaAssetIds, right.mediaAssetIds);
}

function assertProductMediaInput(input: ProductMediaImportInput): void {
  assertProductMediaRole(input.request, input.media.kind);
  const occurrences = input.contentAfter.mediaAssetIds.filter((id) =>
    id === input.media.id).length;
  if (occurrences !== 1) {
    throw new Error(
      "Product content media order must contain the imported media exactly once.",
    );
  }
  if (input.contentBefore !== null) {
    if (input.contentBefore.id !== input.contentAfter.id) {
      throw new Error("Product content identity cannot change during media import.");
    }
    if (input.contentBefore.mediaAssetIds.includes(input.media.id)) {
      throw new Error("Product media is already present before import.");
    }
  }
}

function errorValue(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function immutableState(state: ProjectStoreState): ProjectStoreState {
  if (state.error !== null && !Object.isFrozen(state.error)) {
    Object.freeze(state.error);
  }
  return Object.freeze({
    ...state,
    assetIssues: Object.freeze(state.assetIssues.map((issue) => Object.freeze({ ...issue }))),
  });
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

function samePlanReferenceIdentity(
  before: PlanReference,
  after: PlanReference,
): boolean {
  return before.id === after.id
    && before.floorId === after.floorId
    && before.layerId === after.layerId
    && before.assetId === after.assetId
    && before.intrinsicSize.width === after.intrinsicSize.width
    && before.intrinsicSize.height === after.intrinsicSize.height;
}

function isExactPlanReferenceUnlock(
  before: PlanReference,
  after: PlanReference,
): boolean {
  const sameCalibration = before.calibration === null
    ? after.calibration === null
    : after.calibration !== null
      && before.calibration.sourcePointA.x === after.calibration.sourcePointA.x
      && before.calibration.sourcePointA.y === after.calibration.sourcePointA.y
      && before.calibration.sourcePointB.x === after.calibration.sourcePointB.x
      && before.calibration.sourcePointB.y === after.calibration.sourcePointB.y
      && before.calibration.measuredDistanceMm === after.calibration.measuredDistanceMm;
  return after.locked === false
    && samePlanReferenceIdentity(before, after)
    && before.name === after.name
    && before.tags.length === after.tags.length
    && before.tags.every((tag, index) => tag === after.tags[index])
    && before.transform.translation.x === after.transform.translation.x
    && before.transform.translation.y === after.transform.translation.y
    && before.transform.rotation === after.transform.rotation
    && before.transform.scale.x === after.transform.scale.x
    && before.transform.scale.y === after.transform.scale.y
    && before.opacity === after.opacity
    && sameCalibration;
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
  private assetSourceEpoch = 0;
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

  getAssetSourceEpoch(): number {
    return this.assetSourceEpoch;
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

  applyBuildingStructurePatch(patch: BuildingStructurePatch): Promise<void> {
    const ownedPatch = structuredClone(patch);
    return this.enqueueMutation(() =>
      this.mutate((bus) =>
        bus.execute(patchBuildingStructureCommand, ownedPatch)),
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

  applyPlanReferencePatch(
    before: PlanReference,
    after: PlanReference | null,
  ): Promise<void> {
    const ownedBefore = structuredClone(before);
    const ownedAfter = after === null ? null : structuredClone(after);
    if (ownedAfter !== null && !samePlanReferenceIdentity(ownedBefore, ownedAfter)) {
      return Promise.reject(
        new Error("Plan reference identity cannot be changed by an ordinary patch."),
      );
    }
    if (
      ownedBefore.locked
      && (ownedAfter === null || !isExactPlanReferenceUnlock(ownedBefore, ownedAfter))
    ) {
      return Promise.reject(
        new Error("A locked plan reference can only be unlocked."),
      );
    }
    return this.enqueueMutation(() =>
      this.mutate((bus) =>
        bus.execute(patchSnapshotRecordsCommand, {
          collection: "planReferences",
          changes: [{
            id: ownedBefore.id,
            before: ownedBefore,
            after: ownedAfter,
          }],
        })),
    );
  }

  importPlanReference(
    request: AssetImportRequest,
    reference: Omit<ComposeInitialPlanReferenceInput, "asset" | "facts">,
    onProgress: (value: AssetImportProgress) => void = () => undefined,
  ): Promise<PlanReference> {
    const ownedRequest = structuredClone(request);
    const ownedReference = structuredClone(reference);
    return this.enqueueMutation(() =>
      this.performPlanReferenceImport(ownedRequest, ownedReference, onProgress),
    );
  }

  importProductMedia(
    input: ProductMediaImportInput,
    onProgress: (value: AssetImportProgress) => void = () => undefined,
  ): Promise<ProductMediaImportResult> {
    try {
      const ownedInput = structuredClone(input);
      assertProductMediaInput(ownedInput);
      return this.enqueueMutation(() =>
        this.performProductMediaImport(ownedInput, onProgress));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  cancelAssetImport(operationId: string): Promise<void> {
    if (this.disposed) {
      return Promise.reject(new Error("ProjectStore is disposed"));
    }
    const projectPath = this.state.projectPath;
    if (projectPath === null) {
      return Promise.reject(new Error("No project is open"));
    }
    return this.backend.cancelAssetImport(projectPath, operationId);
  }

  replaceBrokenPlanReference(
    referenceId: string,
    request: AssetImportRequest,
    onProgress: (value: AssetImportProgress) => void = () => undefined,
  ): Promise<PlanReference> {
    const ownedRequest = structuredClone(request);
    return this.enqueueMutation(() =>
      this.performBrokenReferenceReplacement(referenceId, ownedRequest, onProgress),
    );
  }

  replaceBrokenProductMedia(
    mediaAssetId: string,
    request: AssetImportRequest,
    onProgress: (value: AssetImportProgress) => void = () => undefined,
  ): Promise<MediaAsset> {
    const ownedRequest = structuredClone(request);
    return this.enqueueMutation(() =>
      this.performBrokenProductMediaReplacement(
        mediaAssetId,
        ownedRequest,
        onProgress,
      ));
  }

  resolveAsset(assetId: string): Promise<ProjectAssetSource> {
    return this.enqueueOperation(() => this.performResolveAsset(assetId));
  }

  private async performResolveAsset(assetId: string): Promise<ProjectAssetSource> {
    const projectPath = this.state.projectPath;
    const snapshot = this.state.snapshot;
    if (projectPath === null || snapshot === null) {
      throw new Error("No project is open");
    }
    const asset = snapshot.assets.find((candidate) => candidate.id === assetId);
    if (asset === undefined) {
      throw new Error("Asset is not present in the current project snapshot");
    }

    try {
      const source = await this.backend.resolveAsset(projectPath, assetId);
      if (this.disposed || this.state.projectPath !== projectPath) {
        throw new Error("Project changed while resolving an asset");
      }
      const keys = Object.keys(source);
      if (keys.length !== 2 || !keys.includes("assetId") || !keys.includes("url") ||
        source.assetId !== assetId || typeof source.url !== "string") {
        throw new Error("Invalid backend asset source identity");
      }
      const parsed = new URL(source.url);
      const expectedProtocol = this.backend.mode === "desktop"
        ? "aethertwin-asset:"
        : "blob:";
      if (parsed.protocol !== expectedProtocol || source.url.includes("\\")) {
        throw new Error("Invalid or unsafe backend asset URL scheme");
      }
      this.clearAssetIssue(assetId);
      return Object.freeze({ assetId, url: source.url, mediaType: asset.mediaType });
    } catch (error) {
      const code = assetIssueCode(error);
      if (code !== null) {
        this.setAssetIssue({ assetId, code });
        throw safeAssetResolutionError(code);
      }
      throw error;
    }
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

  private async performPlanReferenceImport(
    request: AssetImportRequest,
    reference: Omit<ComposeInitialPlanReferenceInput, "asset" | "facts">,
    onProgress: (value: AssetImportProgress) => void,
  ): Promise<PlanReference> {
    const projectPath = this.requireProjectPath();
    let created: PlanReference | null = null;
    await this.mutate(async (bus) => {
      const result = await this.backend.importAsset(projectPath, request, onProgress);
      created = composeInitialPlanReference({ ...reference, ...result });
      return bus.transaction([
        commandIntent(patchSnapshotRecordsCommand, {
          collection: "assets",
          changes: [{ id: result.asset.id, before: null, after: result.asset }],
        }),
        commandIntent(patchSnapshotRecordsCommand, {
          collection: "planReferences",
          changes: [{ id: created.id, before: null, after: created }],
        }),
      ]);
    });
    if (created === null) throw new Error("Asset import did not create a plan reference");
    return created;
  }

  private async performProductMediaImport(
    input: ProductMediaImportInput,
    onProgress: (value: AssetImportProgress) => void,
  ): Promise<ProductMediaImportResult> {
    const projectPath = this.requireProjectPath();
    const snapshot = this.state.snapshot!;
    const current = input.contentBefore === null
      ? snapshot.project.productContents.find(({ id }) =>
          id === input.contentAfter.id) ?? null
      : snapshot.project.productContents.find(({ id }) =>
          id === input.contentBefore!.id) ?? null;
    if (
      input.contentBefore === null
        ? current !== null
        : current === null || !sameProductContent(current, input.contentBefore)
    ) {
      throw new Error("Product content ownership is stale.");
    }
    if (snapshot.project.mediaAssets.some(({ id }) => id === input.media.id)) {
      throw new Error("Product media record already exists.");
    }
    const targetOwner = snapshot.project.productContents.find(({ targetEntityId }) =>
      targetEntityId === input.contentAfter.targetEntityId);
    if (targetOwner !== undefined && targetOwner.id !== current?.id) {
      throw new Error("Product content target already has an owner.");
    }

    let imported: ProductMediaImportResult | null = null;
    await this.mutate(async (bus) => {
      const result = await this.backend.importAsset(
        projectPath,
        input.request,
        onProgress,
      );
      assertRoleAllowsMedia(input.request.role, result.asset.mediaType);
      const media: MediaAsset = { ...input.media, assetId: result.asset.id };
      imported = {
        asset: result.asset,
        media,
        content: input.contentAfter,
      };
      return bus.transaction([
        commandIntent(patchSnapshotRecordsCommand, {
          collection: "assets",
          changes: [{ id: result.asset.id, before: null, after: result.asset }],
        }),
        commandIntent(patchSnapshotRecordsCommand, {
          collection: "mediaAssets",
          changes: [{ id: media.id, before: null, after: media }],
        }),
        commandIntent(patchSnapshotRecordsCommand, {
          collection: "productContents",
          changes: [{
            id: input.contentAfter.id,
            before: input.contentBefore,
            after: input.contentAfter,
          }],
        }),
      ]);
    });
    if (imported === null) {
      throw new Error("Asset import did not create product media");
    }
    return imported;
  }

  private async performBrokenReferenceReplacement(
    referenceId: string,
    request: AssetImportRequest,
    onProgress: (value: AssetImportProgress) => void,
  ): Promise<PlanReference> {
    const projectPath = this.requireProjectPath();
    const snapshot = this.state.snapshot!;
    const current = snapshot.project.planReferences.find(({ id }) => id === referenceId);
    if (current === undefined) throw new Error("Plan reference not found");
    const issue = this.state.assetIssues.find(({ assetId }) => assetId === current.assetId);
    if (issue === undefined || (issue.code !== "ASSET_MISSING" && issue.code !== "ASSET_CORRUPT")) {
      throw new Error("Plan reference does not have a broken or missing asset issue");
    }

    let repaired: PlanReference | null = null;
    await this.mutate(async (bus) => {
      const result = await this.backend.importAsset(projectPath, request, onProgress);
      const validated = composeInitialPlanReference({
        id: current.id,
        name: current.name,
        tags: current.tags,
        floorId: current.floorId,
        layerId: current.layerId,
        ...result,
      });
      repaired = {
        ...current,
        assetId: validated.assetId,
        intrinsicSize: validated.intrinsicSize,
        calibration: null,
      };
      return bus.transaction([
        commandIntent(patchSnapshotRecordsCommand, {
          collection: "assets",
          changes: [{ id: result.asset.id, before: null, after: result.asset }],
        }),
        commandIntent(patchSnapshotRecordsCommand, {
          collection: "planReferences",
          changes: [{ id: current.id, before: current, after: repaired }],
        }),
      ]);
    });
    if (repaired === null) throw new Error("Asset repair did not replace the plan reference");
    return repaired;
  }

  private async performBrokenProductMediaReplacement(
    mediaAssetId: string,
    request: AssetImportRequest,
    onProgress: (value: AssetImportProgress) => void,
  ): Promise<MediaAsset> {
    const projectPath = this.requireProjectPath();
    const snapshot = this.state.snapshot!;
    const current = snapshot.project.mediaAssets.find(({ id }) =>
      id === mediaAssetId);
    if (current === undefined) throw new Error("Product media not found");
    const issue = this.state.assetIssues.find(({ assetId }) =>
      assetId === current.assetId);
    if (
      issue === undefined
      || (issue.code !== "ASSET_MISSING" && issue.code !== "ASSET_CORRUPT")
    ) {
      throw new Error(
        "Product media does not have a broken or missing asset issue",
      );
    }
    assertProductMediaRole(request, current.kind);

    let repaired: MediaAsset | null = null;
    await this.mutate(async (bus) => {
      const result = await this.backend.importAsset(
        projectPath,
        request,
        onProgress,
      );
      assertRoleAllowsMedia(request.role, result.asset.mediaType);
      repaired = { ...current, assetId: result.asset.id };
      return bus.transaction([
        commandIntent(patchSnapshotRecordsCommand, {
          collection: "assets",
          changes: [{ id: result.asset.id, before: null, after: result.asset }],
        }),
        commandIntent(patchSnapshotRecordsCommand, {
          collection: "mediaAssets",
          changes: [{ id: current.id, before: current, after: repaired }],
        }),
      ]);
    });
    if (repaired === null) {
      throw new Error("Asset repair did not replace product media");
    }
    return repaired;
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
    this.assetSourceEpoch += 1;
    this.publish({
      projectPath,
      manifest,
      snapshot,
      recovered,
      saveState: recovered ? "recovered" : "saved",
      error: null,
      canUndo: false,
      canRedo: false,
      assetIssues: [],
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
        assetIssues: this.reconcileAssetIssues(snapshot),
      });
      this.scheduleAutosave();
    } catch (error) {
      if (isImportCancellation(error)) throw error;
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

  private requireProjectPath(): string {
    if (this.state.projectPath === null) throw new Error("No project is open");
    return this.state.projectPath;
  }

  private setAssetIssue(issue: AssetIssue): void {
    const assetIssues = [
      ...this.state.assetIssues.filter(({ assetId }) => assetId !== issue.assetId),
      issue,
    ];
    this.publish({ ...this.state, assetIssues });
  }

  private clearAssetIssue(assetId: string): void {
    if (!this.state.assetIssues.some((issue) => issue.assetId === assetId)) return;
    this.publish({
      ...this.state,
      assetIssues: this.state.assetIssues.filter((issue) => issue.assetId !== assetId),
    });
  }

  private reconcileAssetIssues(snapshot: ProjectSnapshot): readonly AssetIssue[] {
    const assetIds = new Set(snapshot.assets.map(({ id }) => id));
    const referencedAssetIds = new Set(
      [
        ...snapshot.project.planReferences.map(({ assetId }) => assetId),
        ...snapshot.project.mediaAssets.map(({ assetId }) => assetId),
      ],
    );
    return this.state.assetIssues.filter(({ assetId }) =>
      assetIds.has(assetId) && referencedAssetIds.has(assetId));
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
