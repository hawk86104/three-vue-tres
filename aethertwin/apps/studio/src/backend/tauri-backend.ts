import {
  parseManifest,
  parseSnapshotV3,
  type AssetMediaType,
  type AssetRecord,
  type ProjectSnapshot,
} from "@aethertwin/core-model";
import type {
  CheckpointResult,
  CreateProjectRequest,
  OpenedProject,
  ProjectBackend,
  RecoveryConfirmation,
} from "@aethertwin/project-store";
import {
  PROJECT_EXPORT_MAX_CHUNK_BYTES,
  type ProjectExportBackend,
  type ProjectExportBeginRequest,
  type ProjectExportBeginResult,
  type ProjectExportDimensions,
  type ProjectExportResult,
} from "@aethertwin/exporter";
import { Channel, invoke } from "@tauri-apps/api/core";
import { ProjectBackendError } from "./project-backend-error";

export { ProjectBackendError } from "./project-backend-error";

type UnknownRecord = Record<string, unknown>;
const ASSET_IMPORT_STAGES = [
  "capture",
  "validate",
  "hash",
  "publish",
  "complete",
] as const;
type AssetImportStage = (typeof ASSET_IMPORT_STAGES)[number];
type AssetImportRole = "plan-reference" | "content-image" | "content-video" | "material-texture";
type AssetImportSource =
  | {
      readonly kind: "native-path";
      readonly path: string;
      readonly displayName: string;
    }
  | {
      readonly kind: "sandbox-blob";
      readonly blob: Blob;
      readonly displayName: string;
    };
interface AssetImportRequest {
  readonly operationId: string;
  readonly role: AssetImportRole;
  readonly source: AssetImportSource;
}
interface AssetImportProgress {
  readonly operationId: string;
  readonly stage: AssetImportStage;
  readonly completedBytes: number;
  readonly totalBytes: number;
}
type AssetMediaFacts =
  | { readonly kind: "image"; readonly width: number; readonly height: number }
  | { readonly kind: "video" };
interface AssetImportResult {
  readonly asset: AssetRecord;
  readonly facts: AssetMediaFacts;
}

const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MEDIA_TYPES = new Set<AssetMediaType>([
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
]);
const IMAGE_MEDIA_TYPES = new Set<AssetMediaType>([
  "image/png",
  "image/jpeg",
  "image/svg+xml",
]);
const MEDIA_EXTENSIONS: Readonly<Record<AssetMediaType, string>> = Object.freeze({
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
});
const IMPORT_ROLES = new Set<AssetImportRole>([
  "plan-reference",
  "content-image",
  "content-video",
  "material-texture",
]);
const VIDEO_MEDIA_TYPES = new Set<AssetMediaType>(["video/mp4", "video/webm"]);

function assertAssetImportRequest(input: AssetImportRequest): void {
  if (!SESSION_ID_PATTERN.test(input.operationId)) {
    throw new Error("Invalid asset import operation id: expected a canonical UUID");
  }
  if (!IMPORT_ROLES.has(input.role)) {
    throw new Error("Invalid asset import role");
  }
  if (
    typeof input.source.displayName !== "string" ||
    input.source.displayName.trim().length === 0
  ) {
    throw new Error("Invalid asset import display name");
  }
  if (
    input.source.kind === "native-path" &&
    (typeof input.source.path !== "string" || input.source.path.length === 0)
  ) {
    throw new Error("Invalid native-path asset import source");
  }
}

function assertAssetImportProgressTransition(
  previous: AssetImportProgress | null,
  next: AssetImportProgress,
): void {
  if (
    !SESSION_ID_PATTERN.test(next.operationId) ||
    !ASSET_IMPORT_STAGES.includes(next.stage) ||
    !Number.isSafeInteger(next.completedBytes) ||
    !Number.isSafeInteger(next.totalBytes) ||
    next.completedBytes < 0 ||
    next.totalBytes < 0 ||
    next.completedBytes > next.totalBytes ||
    (next.stage === "complete" && next.completedBytes !== next.totalBytes)
  ) {
    throw new Error("Invalid asset import progress");
  }
  if (previous === null) return;
  if (
    previous.operationId !== next.operationId ||
    previous.totalBytes !== next.totalBytes ||
    previous.completedBytes > next.completedBytes ||
    ASSET_IMPORT_STAGES.indexOf(previous.stage) >
      ASSET_IMPORT_STAGES.indexOf(next.stage)
  ) {
    throw new Error("Asset import progress must be monotonic and cannot move backwards");
  }
}

function assertRoleAllowsMedia(
  role: AssetImportRole,
  mediaType: AssetMediaType,
): void {
  const allowed =
    role === "content-video"
      ? VIDEO_MEDIA_TYPES.has(mediaType)
      : IMAGE_MEDIA_TYPES.has(mediaType);
  if (!allowed) {
    throw new Error("The asset media type is not allowed for the import role");
  }
}

function classifyAssetMedia(input: {
  readonly displayName: string;
  readonly signature: AssetMediaType;
  readonly byteLength: number;
  readonly facts: AssetMediaFacts;
}): void {
  const extension = input.displayName.slice(input.displayName.lastIndexOf(".") + 1);
  if (extension !== MEDIA_EXTENSIONS[input.signature]) {
    throw new Error("The asset extension does not match its media type");
  }
  const limit = IMAGE_MEDIA_TYPES.has(input.signature)
    ? input.signature === "image/svg+xml"
      ? 32 * 1024 * 1024
      : 256 * 1024 * 1024
    : 4 * 1024 * 1024 * 1024;
  if (
    !Number.isSafeInteger(input.byteLength) ||
    input.byteLength < 0 ||
    input.byteLength > limit
  ) {
    throw new Error("The asset exceeds its safe media size limit");
  }
  if (
    (IMAGE_MEDIA_TYPES.has(input.signature) && input.facts.kind !== "image") ||
    (VIDEO_MEDIA_TYPES.has(input.signature) && input.facts.kind !== "video")
  ) {
    throw new Error("The asset media facts do not match its media type");
  }
}

function exactRecord(
  value: unknown,
  label: string,
  expectedKeys: readonly string[],
): UnknownRecord {
  const record = asRecord(value, label);
  const actualKeys = Object.keys(record);
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key) => !expectedKeys.includes(key))
  ) {
    throw new Error(`Invalid ${label}: expected exact fields ${expectedKeys.join(", ")}`);
  }
  return record;
}

function requiredSafeInteger(
  record: UnknownRecord,
  key: string,
  label: string,
): number {
  const value = record[key];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(
      `Invalid ${label}.${key}: expected a non-negative safe integer`,
    );
  }
  return value as number;
}

function parseImportProgress(
  value: unknown,
  expectedOperationId: string,
  previous: AssetImportProgress | null,
): AssetImportProgress {
  const label = "native asset import progress";
  const record = exactRecord(value, label, [
    "operationId",
    "stage",
    "completedBytes",
    "totalBytes",
  ]);
  const operationId = requiredString(record, "operationId", label);
  if (!SESSION_ID_PATTERN.test(operationId)) {
    throw new Error(`Invalid ${label}.operationId: expected a canonical UUID`);
  }
  if (operationId !== expectedOperationId) {
    throw new Error(`Invalid ${label}: operation id does not match the request`);
  }
  const stage = record.stage;
  if (
    typeof stage !== "string" ||
    !ASSET_IMPORT_STAGES.includes(stage as AssetImportProgress["stage"])
  ) {
    throw new Error(`Invalid ${label}.stage`);
  }
  const next: AssetImportProgress = Object.freeze({
    operationId,
    stage: stage as AssetImportProgress["stage"],
    completedBytes: requiredSafeInteger(record, "completedBytes", label),
    totalBytes: requiredSafeInteger(record, "totalBytes", label),
  });
  try {
    assertAssetImportProgressTransition(previous, next);
  } catch (error) {
    throw new Error(
      `Invalid native asset import progress transition: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
  return next;
}

function parseImportFacts(
  value: unknown,
  mediaType: AssetMediaType,
): AssetMediaFacts {
  const label = "native asset import result.facts";
  const source = asRecord(value, label);
  if (IMAGE_MEDIA_TYPES.has(mediaType)) {
    const record = exactRecord(source, label, ["kind", "width", "height"]);
    if (record.kind !== "image") {
      throw new Error(`Invalid ${label}.kind: expected image`);
    }
    const width = requiredSafeInteger(record, "width", label);
    const height = requiredSafeInteger(record, "height", label);
    if (
      width < 1 ||
      height < 1 ||
      width > 16_384 ||
      height > 16_384 ||
      width * height > 268_435_456
    ) {
      throw new Error(`Invalid ${label}: image dimensions are outside safe limits`);
    }
    return Object.freeze({ kind: "image", width, height });
  }

  const record = exactRecord(source, label, ["kind"]);
  if (record.kind !== "video") {
    throw new Error(`Invalid ${label}.kind: expected video`);
  }
  return Object.freeze({ kind: "video" });
}

function parseImportResult(
  value: unknown,
  role: AssetImportRole,
): AssetImportResult {
  const label = "native asset import result";
  const record = exactRecord(value, label, ["asset", "facts"]);
  const assetRecord = exactRecord(record.asset, `${label}.asset`, [
    "id",
    "sha256",
    "relativePath",
    "mediaType",
    "size",
  ]);
  const id = requiredString(assetRecord, "id", `${label}.asset`);
  if (!SESSION_ID_PATTERN.test(id)) {
    throw new Error(`Invalid ${label}.asset.id: expected a canonical UUID`);
  }
  const sha256 = requiredString(assetRecord, "sha256", `${label}.asset`);
  if (!SHA256_PATTERN.test(sha256)) {
    throw new Error(`Invalid ${label}.asset.sha256`);
  }
  const mediaTypeValue = requiredString(
    assetRecord,
    "mediaType",
    `${label}.asset`,
  );
  if (!MEDIA_TYPES.has(mediaTypeValue as AssetMediaType)) {
    throw new Error(`Invalid ${label}.asset.mediaType`);
  }
  const mediaType = mediaTypeValue as AssetMediaType;
  const relativePath = requiredString(
    assetRecord,
    "relativePath",
    `${label}.asset`,
  );
  const expectedPath =
    `assets/sha256/${sha256.slice(0, 2)}/${sha256}.${MEDIA_EXTENSIONS[mediaType]}`;
  if (relativePath !== expectedPath) {
    throw new Error(`Invalid ${label}.asset.relativePath`);
  }
  const size = requiredSafeInteger(assetRecord, "size", `${label}.asset`);
  const asset: AssetRecord = Object.freeze({
    id,
    sha256,
    relativePath,
    mediaType,
    size,
  });
  const facts = parseImportFacts(record.facts, mediaType);
  try {
    classifyAssetMedia({
      displayName: relativePath,
      signature: mediaType,
      byteLength: size,
      facts,
    });
    assertRoleAllowsMedia(role, mediaType);
  } catch (error) {
    throw new Error(
      `Invalid native asset import result media policy: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
  return Object.freeze({ asset, facts });
}

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

async function invokeNative<T>(
  command: string,
  payload: UnknownRecord,
  invokeArguments: UnknownRecord = {},
): Promise<T> {
  try {
    return await invoke<T>(command, { payload, ...invokeArguments });
  } catch (error) {
    throw sanitizeInvocationError(error);
  }
}

interface ParsedOpenedProject extends OpenedProject {
  readonly sessionId: string;
}

function storedSchemaVersion(value: unknown, label: string): number {
  const source = asRecord(value, label);
  if (!Number.isSafeInteger(source.schemaVersion)) {
    throw new Error(`Invalid ${label}.schemaVersion: expected a safe integer`);
  }
  return source.schemaVersion as number;
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
  const manifestSchemaVersion = storedSchemaVersion(record.manifest, "native manifest");
  const snapshotSchemaVersion = storedSchemaVersion(record.snapshot, "native snapshot");
  if (manifestSchemaVersion !== 3 || snapshotSchemaVersion !== 3) {
    throw new Error(
      "Invalid native opened project response.schemaVersion: expected manifest and snapshot schemaVersion 3",
    );
  }
  const manifest = parseManifest(record.manifest);
  const snapshot = parseSnapshotV3(record.snapshot);
  if (
    manifest.projectId !== snapshot.project.id ||
    manifest.name !== snapshot.project.name ||
    manifest.profile !== snapshot.project.profile
  ) {
    throw new Error(
      "Invalid native opened project response: manifest and snapshot must be coherent",
    );
  }

  return Object.freeze({
    sessionId,
    projectPath,
    manifest,
    snapshot,
    recovered: record.recovered,
  });
}

function parseCheckpointResult(
  value: unknown,
  expected: ProjectSnapshot,
): CheckpointResult {
  const record = asRecord(value, "native checkpoint response");
  const manifestSchemaVersion = storedSchemaVersion(
    record.manifest,
    "native checkpoint manifest",
  );
  const snapshotSchemaVersion = storedSchemaVersion(
    record.snapshot,
    "native checkpoint snapshot",
  );
  if (manifestSchemaVersion !== 3 || snapshotSchemaVersion !== 3) {
    throw new Error(
      "Invalid native checkpoint response.schemaVersion: expected manifest and snapshot schemaVersion 3",
    );
  }
  const manifest = parseManifest(record.manifest);
  const snapshot = parseSnapshotV3(record.snapshot);
  const expectedWithCheckpoint = parseSnapshotV3({
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
function parseProjectExportDimensions(
  record: UnknownRecord,
  label: string,
): ProjectExportDimensions {
  const preset = record.preset;
  const width = record.width;
  const height = record.height;
  if (preset === "full-hd" && width === 1920 && height === 1080) {
    return Object.freeze({ preset, width, height });
  }
  if (preset === "ultra-hd" && width === 3840 && height === 2160) {
    return Object.freeze({ preset, width, height });
  }
  throw new Error(`Invalid ${label}: preset and dimensions do not match`);
}

function parseProjectExportBeginResult(value: unknown): ProjectExportBeginResult {
  const label = "native project export begin response";
  const record = exactRecord(value, label, [
    "exportId",
    "preset",
    "width",
    "height",
    "expectedByteLength",
    "maxChunkBytes",
  ]);
  const exportId = requiredString(record, "exportId", label);
  if (!SESSION_ID_PATTERN.test(exportId)) {
    throw new Error(`Invalid ${label}.exportId: expected a canonical UUID`);
  }
  const dimensions = parseProjectExportDimensions(record, label);
  const expectedByteLength = requiredSafeInteger(record, "expectedByteLength", label);
  if (expectedByteLength < 1) {
    throw new Error(`Invalid ${label}.expectedByteLength`);
  }
  if (record.maxChunkBytes !== PROJECT_EXPORT_MAX_CHUNK_BYTES) {
    throw new Error(`Invalid ${label}.maxChunkBytes`);
  }
  return Object.freeze({
    exportId,
    ...dimensions,
    expectedByteLength,
    maxChunkBytes: PROJECT_EXPORT_MAX_CHUNK_BYTES,
  });
}

function parseProjectExportResult(value: unknown): ProjectExportResult {
  const label = "native project export finish response";
  const record = exactRecord(value, label, [
    "preset",
    "width",
    "height",
    "relativePath",
    "byteSize",
    "sha256",
  ]);
  const dimensions = parseProjectExportDimensions(record, label);
  const relativePath = requiredString(record, "relativePath", label);
  const pathSegments = relativePath.split("/");
  if (
    pathSegments[0] !== "exports" ||
    pathSegments.length < 2 ||
    pathSegments.some((segment) =>
      segment.length === 0 || segment === "." || segment === ".." || segment.includes("\\")
    )
  ) {
    throw new Error(`Invalid ${label}.relativePath`);
  }
  const byteSize = requiredSafeInteger(record, "byteSize", label);
  if (byteSize < 1) {
    throw new Error(`Invalid ${label}.byteSize`);
  }
  const sha256 = requiredString(record, "sha256", label);
  if (!SHA256_PATTERN.test(sha256)) {
    throw new Error(`Invalid ${label}.sha256`);
  }
  return Object.freeze({ ...dimensions, relativePath, byteSize, sha256 });
}


export class TauriProjectBackend implements ProjectBackend, ProjectExportBackend {
  readonly mode = "desktop" as const;

  private readonly sessions = new Map<string, string>();
  private readonly pendingCleanup = new Map<string, string | null>();
  private readonly activeExports = new Map<string, ReadonlySet<string>>();
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
      const response = await invokeNative<unknown>("checkpoint_project", { sessionId, snapshot });
      return parseCheckpointResult(response, snapshot);
    });
  }

  importAsset(
    projectPath: string,
    request: AssetImportRequest,
    onProgress: (progress: AssetImportProgress) => void,
  ): Promise<AssetImportResult> {
    if (request.source.kind !== "native-path") {
      return Promise.reject(
        new Error("Tauri asset import requires a native-path source"),
      );
    }
    try {
      assertAssetImportRequest(request);
      if (
        !SESSION_ID_PATTERN.test(request.operationId) ||
        request.source.path !== request.source.path.trim() ||
        !/^(?:[a-zA-Z]:[\\/]|\\\\|\/)/.test(request.source.path)
      ) {
        throw new Error(
          "Tauri asset import requires a canonical operation id and an absolute native-path",
        );
      }
    } catch (error) {
      return Promise.reject(error);
    }

    const ownedRequest = Object.freeze({
      operationId: request.operationId,
      role: request.role,
      sourcePath: request.source.path,
    });
    return this.enqueueImportStart(() => {
      const sessionId = this.requireSession(projectPath);
      const channel = new Channel<unknown>();
      let previous: AssetImportProgress | null = null;
      let progressFailed = false;
      let releaseKickoff!: () => void;
      let kickoffReleased = false;
      const kickoff = new Promise<void>((resolve) => {
        releaseKickoff = () => {
          if (!kickoffReleased) {
            kickoffReleased = true;
            resolve();
          }
        };
      });
      let rejectProgress!: (reason: unknown) => void;
      const progressFailure = new Promise<never>((_resolve, reject) => {
        rejectProgress = reject;
      });

      channel.onmessage = (value: unknown) => {
        if (progressFailed) return;
        try {
          const next = parseImportProgress(
            value,
            ownedRequest.operationId,
            previous,
          );
          previous = next;
          onProgress(next);
          releaseKickoff();
        } catch (error) {
          progressFailed = true;
          releaseKickoff();
          rejectProgress(error);
        }
      };

      const nativeCompletion = invokeNative<unknown>(
        "import_project_asset",
        {
          sessionId,
          operationId: ownedRequest.operationId,
          role: ownedRequest.role,
          sourcePath: ownedRequest.sourcePath,
        },
        { onProgress: channel },
      );
      void nativeCompletion.then(releaseKickoff, releaseKickoff);
      const completion = Promise.race([
        nativeCompletion,
        progressFailure,
      ]).then((value) => parseImportResult(value, ownedRequest.role));
      return { kickoff, completion };
    });
  }

  cancelAssetImport(
    projectPath: string,
    operationId: string,
  ): Promise<void> {
    if (!SESSION_ID_PATTERN.test(operationId)) {
      return Promise.reject(
        new Error("Invalid asset import operation id: expected a canonical UUID"),
      );
    }
    return this.enqueue(async () => {
      const sessionId = this.requireSession(projectPath);
      await invokeNative<void>("cancel_project_asset_import", {
        sessionId,
        operationId,
      });
    });
  }

  resolveAsset(
    projectPath: string,
    assetId: string,
  ): Promise<{ readonly assetId: string; readonly url: string }> {
    if (!SESSION_ID_PATTERN.test(assetId)) {
      return Promise.reject(
        new Error("Invalid asset id: expected a canonical UUID"),
      );
    }
    try {
      const sessionId = this.requireSession(projectPath);
      return Promise.resolve(Object.freeze({
        assetId,
        url: `aethertwin-asset://asset/${sessionId}/${assetId}`,
      }));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  begin(
    projectPath: string,
    request: ProjectExportBeginRequest,
  ): Promise<ProjectExportBeginResult> {
    const ownedRequest = Object.freeze({
      provenance: Object.freeze({ ...request.provenance }),
      preset: request.preset,
    });
    return this.enqueue(async () => {
      const sessionId = this.requireSession(projectPath);
      const response = await invokeNative<unknown>("begin_project_export", {
        sessionId,
        projectId: ownedRequest.provenance.projectId,
        snapshotSequence: ownedRequest.provenance.snapshotSequence,
        activeFloorId: ownedRequest.provenance.activeFloorId,
        preset: ownedRequest.preset,
      });
      const result = parseProjectExportBeginResult(response);
      this.activeExports.set(
        projectPath,
        new Set([...(this.activeExports.get(projectPath) ?? []), result.exportId]),
      );
      return result;
    });
  }

  writeChunk(
    projectPath: string,
    exportId: string,
    chunkIndex: number,
    bytes: Uint8Array,
  ): Promise<void> {
    return this.enqueue(async () => {
      const sessionId = this.requireSession(projectPath);
      try {
        await invoke("write_project_export_chunk", bytes, { headers: {
          "X-Aether-Session-Id": sessionId,
          "X-Aether-Export-Id": exportId,
          "X-Aether-Chunk-Index": String(chunkIndex),
        } });
      } catch (error) {
        throw sanitizeInvocationError(error);
      }
    });
  }

  finish(projectPath: string, exportId: string): Promise<ProjectExportResult> {
    return this.enqueue(async () => {
      const sessionId = this.requireSession(projectPath);
      const response = await invokeNative<unknown>("finish_project_export", { sessionId, exportId });
      const result = parseProjectExportResult(response);
      this.forgetActiveExport(projectPath, exportId);
      return result;
    });
  }

  cancel(projectPath: string, exportId: string): Promise<void> {
    return this.enqueue(async () => {
      const sessionId = this.requireSession(projectPath);
      await invokeNative<void>("cancel_project_export", { sessionId, exportId });
      this.forgetActiveExport(projectPath, exportId);
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
    const disposeAttempt = pending.catch((error) => {
      if (this.disposePromise === disposeAttempt) {
        this.disposePromise = null;
      }
      throw error;
    });
    this.disposePromise = disposeAttempt;
    return disposeAttempt;
  }

  private async acceptOpenedProject(value: unknown): Promise<OpenedProject> {
    try {
      const parsed = parseOpenedProject(value);
      this.sessions.set(parsed.projectPath, parsed.sessionId);
      return Object.freeze({
        projectPath: parsed.projectPath,
        manifest: parsed.manifest,
        snapshot: parsed.snapshot,
        recovered: parsed.recovered,
      });
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
      const cancelFailure = await this.cancelSessionExports(activeSessionId);
      if (cancelFailure !== null) throw cancelFailure;
      await invokeNative<void>("close_project", { sessionId: activeSessionId });
      this.sessions.delete(projectPath);
      this.activeExports.delete(projectPath);
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
        const cancelFailure = await this.cancelSessionExports(sessionId);
        await invokeNative<void>("close_project", { sessionId });
        for (const [projectPath, activeSessionId] of this.sessions) {
          if (activeSessionId === sessionId) {
            this.activeExports.delete(projectPath);
            this.sessions.delete(projectPath);
          }
        }
        this.pendingCleanup.delete(sessionId);
        if (cancelFailure !== null && firstFailure === null) {
          firstFailure = cancelFailure;
        }
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
  private forgetActiveExport(projectPath: string, exportId: string): void {

    const exportIds = this.activeExports.get(projectPath);
    if (exportIds === undefined || !exportIds.has(exportId)) return;
    const remaining = new Set(exportIds);
    remaining.delete(exportId);
    if (remaining.size === 0) {
      this.activeExports.delete(projectPath);
    } else {
      this.activeExports.set(projectPath, remaining);
    }
  }

  private async cancelSessionExports(sessionId: string): Promise<Error | null> {
    const projectPaths = [...this.sessions]
      .filter(([, activeSessionId]) => activeSessionId === sessionId)
      .map(([projectPath]) => projectPath);
    let firstFailure: Error | null = null;
    for (const projectPath of projectPaths) {
      for (const exportId of this.activeExports.get(projectPath) ?? []) {
        try {
          await invokeNative<void>("cancel_project_export", { sessionId, exportId });
          this.forgetActiveExport(projectPath, exportId);
        } catch (error) {
          if (firstFailure === null) {
            firstFailure = error instanceof Error ? error : new Error(String(error));
          }
        }
      }
    }
    return firstFailure;
  }

  private enqueueImportStart<T>(
    operation: () => {
      readonly kickoff: Promise<void>;
      readonly completion: Promise<T>;
    },
  ): Promise<T> {
    if (this.disposed) {
      return Promise.reject(new Error("TauriProjectBackend is disposed"));
    }
    let completion: Promise<T> | null = null;
    const kickoff = this.operationTail.then(() => {
      const started = operation();
      completion = started.completion;
      return started.kickoff;
    });
    this.operationTail = kickoff.then(
      () => undefined,
      () => undefined,
    );
    return kickoff.then(() => {
      if (completion === null) {
        throw new Error("Tauri asset import failed to initialize");
      }
      return completion;
    });
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
