import {
  parseManifest,
  parseSnapshot,
  type ProjectSnapshot,
} from "@aethertwin/core-model";
import type {
  CheckpointResult,
  CreateProjectRequest,
  OpenedProject,
  ProjectBackend,
  RecoveryConfirmation,
} from "@aethertwin/project-store";
import { invoke } from "@tauri-apps/api/core";
import { ProjectBackendError } from "./project-backend-error";

export { ProjectBackendError } from "./project-backend-error";

type UnknownRecord = Record<string, unknown>;

const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function asRecord(value: unknown, label: string): UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected an object`);
  }
  return value as UnknownRecord;
}

function requiredString(record: UnknownRecord, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${label}.${key}: expected a non-empty string`);
  }
  return value;
}

function trustedSessionId(value: unknown): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const sessionId = (value as UnknownRecord).sessionId;
  if (typeof sessionId !== "string" || !SESSION_ID_PATTERN.test(sessionId)) {
    return null;
  }
  return sessionId;
}

function trustedProjectPath(value: unknown): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const projectPath = (value as UnknownRecord).projectPath;
  if (typeof projectPath !== "string" || projectPath.trim().length === 0) {
    return null;
  }
  return projectPath;
}

function projectBackendError(value: unknown): ProjectBackendError | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as UnknownRecord;
  if (
    typeof record.code !== "string" ||
    typeof record.message !== "string" ||
    typeof record.logRef !== "string" ||
    !("details" in record)
  ) {
    return null;
  }
  return new ProjectBackendError(
    record.code,
    record.message,
    record.details,
    record.logRef,
  );
}

function sanitizeInvocationError(value: unknown): Error {
  return (
    projectBackendError(value) ??
    new ProjectBackendError(
      "NATIVE_INVOCATION_FAILED",
      "桌面项目操作失败，请重试",
      null,
      "",
    )
  );
}

async function invokeNative<T>(command: string, payload: UnknownRecord): Promise<T> {
  try {
    return await invoke<T>(command, { payload });
  } catch (error) {
    throw sanitizeInvocationError(error);
  }
}

interface ParsedOpenedProject extends OpenedProject {
  readonly sessionId: string;
}

function parseOpenedProject(value: unknown): ParsedOpenedProject {
  const record = asRecord(value, "native opened project response");
  const sessionId = requiredString(record, "sessionId", "native opened project response");
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error("Invalid native opened project response.sessionId: expected a UUID");
  }
  const projectPath = requiredString(record, "projectPath", "native opened project response");
  if (typeof record.recovered !== "boolean") {
    throw new Error("Invalid native opened project response.recovered: expected a boolean");
  }
  return Object.freeze({
    sessionId,
    projectPath,
    manifest: parseManifest(record.manifest),
    snapshot: parseSnapshot(record.snapshot),
    recovered: record.recovered,
  });
}

function parseCheckpointResult(
  value: unknown,
  expected: ProjectSnapshot,
): CheckpointResult {
  const record = asRecord(value, "native checkpoint response");
  const manifest = parseManifest(record.manifest);
  const snapshot = parseSnapshot(record.snapshot);
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
    throw new Error("Invalid native checkpoint response: manifest and snapshot must be coherent");
  }
  return Object.freeze({ manifest, snapshot });
}

export class TauriProjectBackend implements ProjectBackend {
  readonly mode = "desktop" as const;

  private readonly sessions = new Map<string, string>();
  private readonly pendingCleanup = new Map<string, string | null>();
  private operationTail: Promise<void> = Promise.resolve();
  private disposed = false;
  private disposePromise: Promise<void> | null = null;

  createProject(request: CreateProjectRequest): Promise<OpenedProject> {
    const ownedRequest = Object.freeze({ ...request });
    return this.enqueue(async () => {
      await this.drainPendingCleanup();
      const response = await invokeNative<unknown>("create_project", {
        name: ownedRequest.name,
        parent: ownedRequest.location,
        profile: ownedRequest.profile,
      });
      return this.acceptOpenedProject(response);
    });
  }

  openProject(projectPath: string): Promise<OpenedProject> {
    return this.enqueue(async () => {
      await this.drainPendingCleanup();
      const response = await invokeNative<unknown>("open_project", {
        path: projectPath,
        recoverStaleLock: false,
      });
      return this.acceptOpenedProject(response);
    });
  }

  recoverProject(
    projectPath: string,
    confirmation: RecoveryConfirmation,
  ): Promise<OpenedProject> {
    return this.enqueue(async () => {
      await this.drainPendingCleanup();
      const response = await invokeNative<unknown>("recover_project", {
        path: projectPath,
        confirm: confirmation.confirmed,
      });
      return this.acceptOpenedProject(response);
    });
  }

  commit(
    projectPath: string,
    batch: Parameters<ProjectBackend["commit"]>[1],
  ): Promise<void> {
    return this.enqueue(async () => {
      const sessionId = this.requireSession(projectPath);
      await invokeNative<void>("commit_project", { sessionId, batch });
    });
  }

  checkpoint(
    projectPath: string,
    snapshot: ProjectSnapshot,
  ): Promise<CheckpointResult> {
    return this.enqueue(async () => {
      const sessionId = this.requireSession(projectPath);
      const response = await invokeNative<unknown>("checkpoint_project", { sessionId });
      return parseCheckpointResult(response, snapshot);
    });
  }

  closeProject(projectPath: string): Promise<void> {
    return this.enqueue(() => this.closeProjectNow(projectPath));
  }

  dispose(): Promise<void> {
    if (this.disposePromise !== null) {
      return this.disposePromise;
    }
    this.disposed = true;
    const pending = this.operationTail.then(() => this.closeAllSessions());
    this.operationTail = pending.then(
      () => undefined,
      () => undefined,
    );
    let disposeAttempt: Promise<void>;
    disposeAttempt = pending.catch((error) => {
      if (this.disposePromise === disposeAttempt) {
        this.disposePromise = null;
      }
      throw error;
    });
    this.disposePromise = disposeAttempt;
    return disposeAttempt;
  }

  private async acceptOpenedProject(value: unknown): Promise<OpenedProject> {
    let parsed: ParsedOpenedProject;
    try {
      parsed = parseOpenedProject(value);
    } catch (error) {
      const sessionId = trustedSessionId(value);
      if (sessionId !== null) {
        try {
          await invokeNative<void>("close_project", { sessionId });
        } catch {
          this.pendingCleanup.set(sessionId, trustedProjectPath(value));
        }
      }
      throw error;
    }

    this.sessions.set(parsed.projectPath, parsed.sessionId);
    return Object.freeze({
      projectPath: parsed.projectPath,
      manifest: parsed.manifest,
      snapshot: parsed.snapshot,
      recovered: parsed.recovered,
    });
  }

  private requireSession(projectPath: string): string {
    const sessionId = this.sessions.get(projectPath);
    if (sessionId === undefined) {
      throw new Error(`No active Tauri session for project: ${projectPath}`);
    }
    return sessionId;
  }

  private async closeProjectNow(projectPath: string): Promise<void> {
    const activeSessionId = this.sessions.get(projectPath);
    const pendingSessionIds = [...this.pendingCleanup]
      .filter(([, pendingPath]) => pendingPath === projectPath)
      .map(([sessionId]) => sessionId);
    if (activeSessionId === undefined && pendingSessionIds.length === 0) {
      throw new Error(`No active Tauri session for project: ${projectPath}`);
    }

    if (activeSessionId !== undefined) {
      await invokeNative<void>("close_project", { sessionId: activeSessionId });
      this.sessions.delete(projectPath);
    }
    for (const sessionId of pendingSessionIds) {
      await invokeNative<void>("close_project", { sessionId });
      this.pendingCleanup.delete(sessionId);
    }
  }

  private async closeAllSessions(): Promise<void> {
    const sessionIds = new Set([
      ...this.sessions.values(),
      ...this.pendingCleanup.keys(),
    ]);
    let firstFailure: Error | null = null;

    for (const sessionId of sessionIds) {
      try {
        await invokeNative<void>("close_project", { sessionId });
        for (const [projectPath, activeSessionId] of this.sessions) {
          if (activeSessionId === sessionId) {
            this.sessions.delete(projectPath);
          }
        }
        this.pendingCleanup.delete(sessionId);
      } catch (error) {
        if (firstFailure === null) {
          firstFailure = error instanceof Error ? error : new Error(String(error));
        }
      }
    }

    if (firstFailure !== null) {
      throw firstFailure;
    }
  }

  private async drainPendingCleanup(): Promise<void> {
    for (const sessionId of this.pendingCleanup.keys()) {
      await invokeNative<void>("close_project", { sessionId });
      this.pendingCleanup.delete(sessionId);
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    if (this.disposed) {
      return Promise.reject(new Error("TauriProjectBackend is disposed"));
    }
    const pending = this.operationTail.then(operation);
    this.operationTail = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }
}
