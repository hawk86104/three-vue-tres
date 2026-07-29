import type { ProjectBackend } from "./backend";
import {
  createInitialSnapshot,
  identityTransform2D,
  parseSnapshot,
  type AssetRecord,
  type Boundary,
  type Fixture,
  type PlanReference,
  type ProjectSnapshot,
} from "@aethertwin/core-model";
import type {
  AssetImportProgress,
  AssetImportRequest,
  AssetImportResult,
  AssetIssue,
  ComposeInitialPlanReferenceInput,
} from "@aethertwin/asset-pipeline";
import { rectangularArray, type FloorChange, type PlanEditIntent } from "@aethertwin/plan-engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ProjectStore,
  RecentProjects,
  SandboxProjectBackend,
  renameProjectCommand,
  setProjectTagsCommand,
  type KeyValueStorage,
} from "./index";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function fixtureFor(snapshot: ProjectSnapshot, id = "00000000-0000-4000-8000-000000000010", name = "Fixture"): Fixture {
  const floor = snapshot.project.floors[0]!;
  return {
    type: "fixture",
    id,
    name,
    tags: [],
    floorId: floor.id,
    layerId: floor.layers[0]!.id,
    locked: false,
    transform: identityTransform2D,
    kind: "generic",
    size: { width: 1000, height: 500 },
  };
}

type PlanReferenceSeed = Omit<
  ComposeInitialPlanReferenceInput,
  "asset" | "facts"
>;

interface ProjectAssetSource {
  readonly assetId: string;
  readonly url: string;
  readonly mediaType: AssetRecord["mediaType"];
}

interface Task8ProjectStoreState {
  readonly assetIssues: readonly AssetIssue[];
}

interface Task8ProjectStore {
  importPlanReference(
    request: AssetImportRequest,
    reference: PlanReferenceSeed,
    onProgress: (value: AssetImportProgress) => void,
  ): Promise<PlanReference>;
  cancelAssetImport(operationId: string): Promise<void>;
  replaceBrokenPlanReference(
    referenceId: string,
    request: AssetImportRequest,
    onProgress: (value: AssetImportProgress) => void,
  ): Promise<PlanReference>;
  resolveAsset(assetId: string): Promise<ProjectAssetSource>;
  getState(): ReturnType<ProjectStore["getState"]> & Task8ProjectStoreState;
}

interface BackendAssetSource {
  readonly assetId: string;
  readonly url: string;
}

interface Task8ProjectBackend {
  importAsset(
    projectPath: string,
    request: AssetImportRequest,
    onProgress: (value: AssetImportProgress) => void,
  ): Promise<AssetImportResult>;
  cancelAssetImport(projectPath: string, operationId: string): Promise<void>;
  resolveAsset(projectPath: string, assetId: string): Promise<BackendAssetSource>;
  dispose(): Promise<void>;
}

const PRIVATE_SOURCE_PATH = "E:\\Private\\native-floor-plan.png";
const IMPORT_OPERATION_A = "30000000-0000-4000-8000-000000000001";
const IMPORT_OPERATION_B = "30000000-0000-4000-8000-000000000002";
const ASSET_A = "40000000-0000-4000-8000-000000000001";
const ASSET_B = "40000000-0000-4000-8000-000000000002";
const REFERENCE_A = "50000000-0000-4000-8000-000000000001";
const REFERENCE_B = "50000000-0000-4000-8000-000000000002";

function task8Store(store: ProjectStore): Task8ProjectStore {
  return store as unknown as Task8ProjectStore;
}

function task8Backend(backend: SandboxProjectBackend): Task8ProjectBackend {
  return backend as unknown as Task8ProjectBackend;
}

function projectAssetDelegates(backend: SandboxProjectBackend) {
  const task8 = task8Backend(backend);
  return {
    importAsset: (...args: Parameters<Task8ProjectBackend["importAsset"]>) =>
      task8.importAsset(...args),
    cancelAssetImport: (...args: Parameters<Task8ProjectBackend["cancelAssetImport"]>) =>
      task8.cancelAssetImport(...args),
    resolveAsset: (...args: Parameters<Task8ProjectBackend["resolveAsset"]>) =>
      task8.resolveAsset(...args),
  };
}

function nativeAsset(
  id: string,
  character: string,
  mediaType: AssetRecord["mediaType"] = "image/png",
  size = 42,
): AssetRecord {
  const sha256 = character.repeat(64);
  const extension: Record<AssetRecord["mediaType"], string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  return {
    id,
    sha256,
    relativePath: `assets/sha256/${sha256.slice(0, 2)}/${sha256}.${extension[mediaType]}`,
    mediaType,
    size,
  };
}

function nativeImportResult(
  asset = nativeAsset(ASSET_A, "a"),
  width = 640,
  height = 480,
): AssetImportResult {
  return { asset, facts: { kind: "image", width, height } };
}

function nativeImportRequest(
  operationId = IMPORT_OPERATION_A,
  displayName = "native-floor-plan.png",
): AssetImportRequest {
  return {
    operationId,
    role: "plan-reference",
    source: {
      kind: "native-path",
      path: PRIVATE_SOURCE_PATH,
      displayName,
    },
  };
}

function referenceSeed(
  snapshot: ProjectSnapshot,
  id = REFERENCE_A,
  name = "Ground floor",
): PlanReferenceSeed {
  const floor = snapshot.project.floors[0]!;
  return {
    id,
    name,
    tags: ["imported"],
    floorId: floor.id,
    layerId: floor.layers[0]!.id,
  };
}

function pngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(45);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  new DataView(bytes.buffer).setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  bytes.set([8, 6, 0, 0, 0], 24);
  bytes.set([0x49, 0x45, 0x4e, 0x44], 37);
  return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const ownedBytes = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", ownedBytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")).join("");
}

function sandboxImportRequest(
  bytes: Uint8Array,
  operationId: string,
  displayName = "floor-plan.png",
): AssetImportRequest {
  return {
    operationId,
    role: "plan-reference",
    source: {
      kind: "sandbox-blob",
      blob: new Blob([
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
      ], { type: "application/octet-stream" }),
      displayName,
    },
  };
}

function cancellable<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

class ControlledAssetBackend extends SandboxProjectBackend {
  readonly importCalls: Array<{
    readonly projectPath: string;
    readonly request: AssetImportRequest;
  }> = [];
  readonly cancelCalls: Array<{
    readonly projectPath: string;
    readonly operationId: string;
  }> = [];
  readonly resolveCalls: Array<{
    readonly projectPath: string;
    readonly assetId: string;
  }> = [];
  nextImportResult: AssetImportResult = nativeImportResult();
  importImplementation: (() => Promise<AssetImportResult>) | null = null;
  cancelImplementation: (() => Promise<void>) | null = null;
  resolveImplementation: (() => Promise<BackendAssetSource>) | null = null;
  resolvedSource: BackendAssetSource = {
    assetId: ASSET_A,
    url: `aethertwin-asset://asset/session/${ASSET_A}`,
  };
  resolveFailure: unknown = null;

  async importAsset(
    projectPath: string,
    request: AssetImportRequest,
    _onProgress: (value: AssetImportProgress) => void,
  ): Promise<AssetImportResult> {
    void _onProgress;
    this.importCalls.push({ projectPath, request });
    if (this.importImplementation !== null) {
      return this.importImplementation();
    }
    return structuredClone(this.nextImportResult);
  }

  async cancelAssetImport(projectPath: string, operationId: string): Promise<void> {
    this.cancelCalls.push({ projectPath, operationId });
    if (this.cancelImplementation !== null) {
      return this.cancelImplementation();
    }
  }

  async resolveAsset(projectPath: string, assetId: string): Promise<BackendAssetSource> {
    this.resolveCalls.push({ projectPath, assetId });
    if (this.resolveImplementation !== null) return this.resolveImplementation();
    if (this.resolveFailure !== null) {
      throw this.resolveFailure;
    }
    return { ...this.resolvedSource };
  }
}

function installObjectUrlRecorder(): {
  readonly createObjectURL: ReturnType<typeof vi.fn>;
  readonly revokeObjectURL: ReturnType<typeof vi.fn>;
} {
  const NativeUrl = URL;
  let nextUrl = 1;
  const createObjectURL = vi.fn(() => `blob:aethertwin-owned-${nextUrl++}`);
  const revokeObjectURL = vi.fn();
  class TestUrl extends NativeUrl {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = revokeObjectURL;
  }
  vi.stubGlobal("URL", TestUrl);
  return { createObjectURL, revokeObjectURL };
}

async function importSandboxReference(
  baseStore: ProjectStore,
  bytes: Uint8Array,
  operationId: string,
  referenceId: string,
  onProgress: (value: AssetImportProgress) => void = () => undefined,
): Promise<PlanReference> {
  const store = task8Store(baseStore);
  return store.importPlanReference(
    sandboxImportRequest(bytes, operationId),
    referenceSeed(store.getState().snapshot!, referenceId),
    onProgress,
  );
}

describe("ProjectStore asset import orchestration", () => {
  it("commits adjacent asset and reference rows atomically and undoes and redoes them as one history step", async () => {
    const backend = new ControlledAssetBackend();
    const baseStore = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    const store = task8Store(baseStore);
    await baseStore.create({ name: "Import", location: "sandbox", profile: "showroom" });
    const initial = store.getState().snapshot!;
    const seed = referenceSeed(initial);
    const commit = vi.spyOn(backend, "commit");

    const created = await store.importPlanReference(
      nativeImportRequest(),
      seed,
      vi.fn(),
    );

    const expectedReference: PlanReference = {
      ...seed,
      assetId: ASSET_A,
      intrinsicSize: { width: 640, height: 480 },
      transform: {
        translation: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
      },
      opacity: 0.65,
      locked: false,
      calibration: null,
    };
    expect(created).toEqual(expectedReference);
    expect(store.getState().snapshot).toMatchObject({
      sequence: initial.sequence + 2,
      assets: [nativeImportResult().asset],
      project: { planReferences: [expectedReference] },
    });
    expect(commit).toHaveBeenCalledOnce();
    const applyBatch = commit.mock.calls[0]![1];
    expect(applyBatch.journal).toHaveLength(2);
    expect(applyBatch.journal.map((row) => row.payload)).toEqual([
      {
        collection: "assets",
        changes: [{ id: ASSET_A, before: null, after: nativeImportResult().asset }],
      },
      {
        collection: "planReferences",
        changes: [{ id: REFERENCE_A, before: null, after: expectedReference }],
      },
    ]);
    expect(applyBatch.journal[0]!.sequence + 1).toBe(applyBatch.journal[1]!.sequence);
    expect(new Set(applyBatch.journal.map((row) => row.transactionId)).size).toBe(1);
    expect(JSON.stringify(applyBatch)).not.toContain(PRIVATE_SOURCE_PATH);
    expect(JSON.stringify(applyBatch)).not.toContain("native-floor-plan.png");

    await baseStore.undo();
    expect(store.getState().snapshot).toMatchObject({
      assets: [],
      project: { planReferences: [] },
    });
    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: true });
    expect(commit.mock.calls[1]![1].journal.map((row) => row.action)).toEqual([
      "undo",
      "undo",
    ]);

    await baseStore.redo();
    expect(store.getState().snapshot).toMatchObject({
      assets: [nativeImportResult().asset],
      project: { planReferences: [expectedReference] },
    });
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: false });
    expect(commit.mock.calls[2]![1].journal.map((row) => row.action)).toEqual([
      "redo",
      "redo",
    ]);
    await baseStore.close();
  });

  it("leaves no durable or in-memory record when the combined journal commit fails", async () => {
    const backend = new ControlledAssetBackend();
    const baseStore = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    const store = task8Store(baseStore);
    await baseStore.create({ name: "Atomic failure", location: "sandbox", profile: "market" });
    const projectPath = store.getState().projectPath!;
    const before = store.getState().snapshot!;
    const failure = new Error("journal fsync failed");
    backend.failNextCommit = failure;
    const commit = vi.spyOn(backend, "commit");

    await expect(store.importPlanReference(
      nativeImportRequest(),
      referenceSeed(before),
      vi.fn(),
    )).rejects.toBe(failure);

    expect(commit).toHaveBeenCalledOnce();
    expect(store.getState().snapshot).toEqual(before);
    expect(store.getState()).toMatchObject({
      saveState: "error",
      canUndo: false,
      canRedo: false,
    });
    const reopened = await backend.openProject(projectPath);
    expect(reopened.snapshot.assets).toEqual([]);
    expect(reopened.snapshot.project.planReferences).toEqual([]);
    await baseStore.close();
  });

  it("cancels an active import without committing records or changing project state", async () => {
    const backend = new ControlledAssetBackend();
    const pending = cancellable<AssetImportResult>();
    const cancellation = Object.assign(new Error("Asset import cancelled"), {
      code: "ASSET_IMPORT_CANCELLED",
    });
    backend.importImplementation = () => pending.promise;
    backend.cancelImplementation = async () => pending.reject(cancellation);
    const commit = vi.spyOn(backend, "commit");
    const baseStore = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    const store = task8Store(baseStore);
    await baseStore.create({ name: "Cancel", location: "sandbox", profile: "showroom" });
    const before = store.getState();

    const importing = store.importPlanReference(
      nativeImportRequest(),
      referenceSeed(before.snapshot!),
      vi.fn(),
    );
    const rejected = expect(importing).rejects.toBe(cancellation);
    await vi.waitFor(() => expect(backend.importCalls).toHaveLength(1));
    await expect(store.cancelAssetImport(IMPORT_OPERATION_A)).resolves.toBeUndefined();
    await rejected;

    expect(backend.cancelCalls).toEqual([{
      projectPath: before.projectPath,
      operationId: IMPORT_OPERATION_A,
    }]);
    expect(commit).not.toHaveBeenCalled();
    expect(store.getState()).toEqual(before);
    await baseStore.close();
  });

  it("reimports only a broken reference while retaining the old immutable asset and clearing calibration", async () => {
    const backend = new ControlledAssetBackend();
    const baseStore = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    const store = task8Store(baseStore);
    await baseStore.create({ name: "Repair", location: "sandbox", profile: "showroom" });
    const first = await store.importPlanReference(
      nativeImportRequest(),
      referenceSeed(store.getState().snapshot!),
      vi.fn(),
    );
    const customized: PlanReference = {
      ...first,
      name: "Placed and calibrated",
      tags: ["surveyed"],
      transform: {
        translation: { x: 1200, y: 800 },
        rotation: 0.25,
        scale: { x: 2, y: 2 },
      },
      opacity: 0.4,
      locked: true,
      calibration: {
        sourcePointA: { x: 10, y: 20 },
        sourcePointB: { x: 110, y: 20 },
        measuredDistanceMm: 200,
      },
    };
    await baseStore.applySnapshotRecordPatches([{
      collection: "planReferences",
      changes: [{ id: first.id, before: first, after: customized }],
    }]);
    const missing = Object.assign(new Error(`Missing bytes at ${PRIVATE_SOURCE_PATH}`), {
      code: "ASSET_MISSING",
      sourcePath: PRIVATE_SOURCE_PATH,
    });
    backend.resolveFailure = missing;
    await expect(store.resolveAsset(ASSET_A)).rejects.toMatchObject({
      code: "ASSET_MISSING",
      message: "Asset resolution failed.",
    });
    expect(store.getState().assetIssues).toEqual([{
      assetId: ASSET_A,
      code: "ASSET_MISSING",
    }]);

    backend.resolveFailure = null;
    backend.nextImportResult = nativeImportResult(
      nativeAsset(ASSET_B, "b"),
      1200,
      900,
    );
    const commit = vi.spyOn(backend, "commit");
    const repaired = await store.replaceBrokenPlanReference(
      REFERENCE_A,
      nativeImportRequest(IMPORT_OPERATION_B, "replacement.png"),
      vi.fn(),
    );

    const expected: PlanReference = {
      ...customized,
      assetId: ASSET_B,
      intrinsicSize: { width: 1200, height: 900 },
      calibration: null,
    };
    expect(repaired).toEqual(expected);
    expect(store.getState().snapshot!.assets).toEqual([
      nativeImportResult().asset,
      backend.nextImportResult.asset,
    ]);
    expect(store.getState().snapshot!.project.planReferences).toEqual([expected]);
    expect(store.getState().assetIssues).toEqual([]);
    expect(commit).toHaveBeenCalledOnce();
    expect(commit.mock.calls[0]![1].journal.map((row) =>
      (row.payload as { collection: string }).collection)).toEqual([
      "assets",
      "planReferences",
    ]);
    expect(commit.mock.calls[0]![1].journal[1]!.payload).toEqual({
      collection: "planReferences",
      changes: [{ id: REFERENCE_A, before: customized, after: expected }],
    });
    expect(JSON.stringify(commit.mock.calls[0]![1])).not.toContain(PRIVATE_SOURCE_PATH);

    await baseStore.undo();
    expect(store.getState().snapshot!.assets).toEqual([nativeImportResult().asset]);
    expect(store.getState().snapshot!.project.planReferences).toEqual([customized]);
    await baseStore.close();
  });

  it("rejects repair before importing unless the target reference has a broken or missing issue", async () => {
    const backend = new ControlledAssetBackend();
    const baseStore = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    const store = task8Store(baseStore);
    await baseStore.create({ name: "Safe repair", location: "sandbox", profile: "market" });
    const created = await store.importPlanReference(
      nativeImportRequest(),
      referenceSeed(store.getState().snapshot!),
      vi.fn(),
    );
    backend.importCalls.length = 0;

    await expect(store.replaceBrokenPlanReference(
      created.id,
      nativeImportRequest(IMPORT_OPERATION_B),
      vi.fn(),
    )).rejects.toThrow(/broken|missing|issue/i);
    await expect(store.replaceBrokenPlanReference(
      REFERENCE_B,
      nativeImportRequest(IMPORT_OPERATION_B),
      vi.fn(),
    )).rejects.toThrow(/reference|not found/i);

    expect(backend.importCalls).toEqual([]);
    expect(store.getState().snapshot!.assets).toEqual([nativeImportResult().asset]);
    expect(store.getState().snapshot!.project.planReferences).toEqual([created]);
    await baseStore.close();
  });

  it("saves, closes, and reopens the exact imported asset and plan reference", async () => {
    const backend = new ControlledAssetBackend();
    const baseStore = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    const store = task8Store(baseStore);
    await baseStore.create({ name: "Reopen import", location: "sandbox", profile: "showroom" });
    const projectPath = store.getState().projectPath!;
    const created = await store.importPlanReference(
      nativeImportRequest(),
      referenceSeed(store.getState().snapshot!),
      vi.fn(),
    );
    const expectedAsset = store.getState().snapshot!.assets[0]!;

    await baseStore.save();
    await baseStore.close();
    await baseStore.open(projectPath);

    expect(store.getState()).toMatchObject({
      saveState: "saved",
      assetIssues: [],
      canUndo: false,
      canRedo: false,
    });
    expect(store.getState().snapshot!.assets).toEqual([expectedAsset]);
    expect(store.getState().snapshot!.project.planReferences).toEqual([created]);
    expect(store.getState().snapshot!.checkpointSequence).toBe(
      store.getState().snapshot!.sequence,
    );
    await baseStore.close();
  });

  it("joins a validated backend URL with snapshot media type and keeps asset issues safe and transient", async () => {
    const backend = new ControlledAssetBackend();
    const baseStore = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    const store = task8Store(baseStore);
    await baseStore.create({ name: "Resolve", location: "sandbox", profile: "showroom" });
    await store.importPlanReference(
      nativeImportRequest(),
      referenceSeed(store.getState().snapshot!),
      vi.fn(),
    );
    const ownedUrl = "blob:https://aethertwin.invalid/owned-asset-a";
    backend.resolvedSource = { assetId: ASSET_A, url: ownedUrl };

    await expect(store.resolveAsset(ASSET_A)).resolves.toEqual({
      assetId: ASSET_A,
      url: ownedUrl,
      mediaType: "image/png",
    });
    expect(Object.keys(await store.resolveAsset(ASSET_A)).sort()).toEqual([
      "assetId",
      "mediaType",
      "url",
    ]);

    backend.resolvedSource = {
      assetId: ASSET_A,
      url: `file:///${PRIVATE_SOURCE_PATH.replaceAll("\\", "/")}`,
    };
    await expect(store.resolveAsset(ASSET_A)).rejects.toThrow(/url|scheme|safe/i);
    expect(store.getState().assetIssues).toEqual([]);

    backend.resolvedSource = { assetId: ASSET_B, url: ownedUrl };
    await expect(store.resolveAsset(ASSET_A)).rejects.toThrow(/asset|identity|match/i);
    expect(store.getState().assetIssues).toEqual([]);

    const corruption = Object.assign(
      new Error(`Digest mismatch at ${PRIVATE_SOURCE_PATH}`),
      {
        code: "ASSET_CORRUPT",
        sourcePath: PRIVATE_SOURCE_PATH,
        details: { nativePath: PRIVATE_SOURCE_PATH },
      },
    );
    backend.resolveFailure = corruption;
    let exposedFailure: unknown;
    try {
      await store.resolveAsset(ASSET_A);
    } catch (error) {
      exposedFailure = error;
    }
    expect(exposedFailure).toBeInstanceOf(Error);
    expect(exposedFailure).not.toBe(corruption);
    expect(exposedFailure).toMatchObject({
      code: "ASSET_CORRUPT",
      message: "Asset resolution failed.",
    });
    expect(Object.keys(exposedFailure as object)).toEqual(["code"]);
    expect(JSON.stringify(exposedFailure)).not.toContain(PRIVATE_SOURCE_PATH);
    expect(String(exposedFailure)).not.toContain(PRIVATE_SOURCE_PATH);
    expect((exposedFailure as Error).stack).not.toContain(PRIVATE_SOURCE_PATH);
    expect(store.getState().assetIssues).toEqual([{
      assetId: ASSET_A,
      code: "ASSET_CORRUPT",
    }]);
    expect(JSON.stringify(store.getState().assetIssues)).not.toContain(PRIVATE_SOURCE_PATH);

    backend.resolveFailure = null;
    backend.resolvedSource = { assetId: ASSET_A, url: ownedUrl };
    await store.resolveAsset(ASSET_A);
    expect(store.getState().assetIssues).toEqual([]);

    backend.resolveFailure = corruption;
    await expect(store.resolveAsset(ASSET_A)).rejects.toMatchObject({
      code: "ASSET_CORRUPT",
      message: "Asset resolution failed.",
    });
    await baseStore.create({ name: "Replacement", location: "sandbox", profile: "market" });
    expect(store.getState().assetIssues).toEqual([]);

    await store.importPlanReference(
      nativeImportRequest(IMPORT_OPERATION_B),
      referenceSeed(store.getState().snapshot!, REFERENCE_B),
      vi.fn(),
    );
    await expect(store.resolveAsset(ASSET_A)).rejects.toMatchObject({
      code: "ASSET_CORRUPT",
      message: "Asset resolution failed.",
    });
    expect(store.getState().assetIssues).toHaveLength(1);
    await baseStore.close();
    expect(store.getState().assetIssues).toEqual([]);
  });

  it("serializes resolution with queued undo so returned media identity stays coherent", async () => {
    const backend = new ControlledAssetBackend();
    const pendingResolution = cancellable<BackendAssetSource>();
    backend.resolveImplementation = () => pendingResolution.promise;
    const baseStore = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    const store = task8Store(baseStore);
    await baseStore.create({ name: "Queued resolve", location: "sandbox", profile: "showroom" });
    await store.importPlanReference(nativeImportRequest(), referenceSeed(store.getState().snapshot!), vi.fn());

    const resolving = store.resolveAsset(ASSET_A);
    await vi.waitFor(() => expect(backend.resolveCalls).toHaveLength(1));
    let undoFinished = false;
    const undoing = baseStore.undo().then(() => { undoFinished = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(undoFinished).toBe(false);
    expect(store.getState().snapshot!.assets).toHaveLength(1);

    pendingResolution.resolve({ assetId: ASSET_A, url: "blob:https://aethertwin.invalid/queued-asset-a" });
    await expect(resolving).resolves.toEqual({
      assetId: ASSET_A,
      url: "blob:https://aethertwin.invalid/queued-asset-a",
      mediaType: "image/png",
    });
    await undoing;
    expect(store.getState().snapshot!.assets).toEqual([]);
    expect(store.getState().snapshot!.project.planReferences).toEqual([]);
    await baseStore.close();
  });

  it("drops repair authorization across delete, undo, and redo snapshot mutations", async () => {
    const backend = new ControlledAssetBackend();
    const baseStore = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    const store = task8Store(baseStore);
    await baseStore.create({ name: "Transient issues", location: "sandbox", profile: "showroom" });
    const reference = await store.importPlanReference(
      nativeImportRequest(), referenceSeed(store.getState().snapshot!), vi.fn(),
    );
    const asset = store.getState().snapshot!.assets[0]!;
    backend.resolveFailure = Object.assign(new Error(`Missing at ${PRIVATE_SOURCE_PATH}`), {
      code: "ASSET_MISSING",
      sourcePath: PRIVATE_SOURCE_PATH,
    });
    await expect(store.resolveAsset(asset.id)).rejects.toMatchObject({ code: "ASSET_MISSING" });
    expect(store.getState().assetIssues).toEqual([{ assetId: asset.id, code: "ASSET_MISSING" }]);

    await baseStore.applySnapshotRecordPatches([
      { collection: "planReferences", changes: [{ id: reference.id, before: reference, after: null }] },
      { collection: "assets", changes: [{ id: asset.id, before: asset, after: null }] },
    ]);
    expect(store.getState().assetIssues).toEqual([]);
    await baseStore.undo();
    expect(store.getState().assetIssues).toEqual([]);
    await expect(store.replaceBrokenPlanReference(
      reference.id, nativeImportRequest(IMPORT_OPERATION_B), vi.fn(),
    )).rejects.toThrow(/broken|issue|repair/i);
    expect(backend.importCalls).toHaveLength(1);
    await baseStore.redo();
    expect(store.getState().snapshot!.assets).toEqual([]);
    expect(store.getState().snapshot!.project.planReferences).toEqual([]);
    expect(store.getState().assetIssues).toEqual([]);
    await baseStore.close();
  });
});

describe("SandboxProjectBackend asset equivalence", () => {
  it("rejects an oversized Blob before allocating or reading its bytes", async () => {
    const arrayBuffer = vi.fn(async (): Promise<ArrayBuffer> => {
      throw new Error("oversized Blob bytes must not be read");
    });
    class OversizedBlob extends Blob {
      constructor() {
        super();
        Object.defineProperty(this, "size", { value: 32 * 1024 * 1024 + 1 });
      }

      override arrayBuffer(): Promise<ArrayBuffer> {
        return arrayBuffer();
      }
    }

    const backend = new SandboxProjectBackend();
    const baseStore = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await baseStore.create({ name: "Oversized Blob", location: "sandbox", profile: "showroom" });
    const before = baseStore.getState();
    const commit = vi.spyOn(backend, "commit");
    const request: AssetImportRequest = {
      operationId: IMPORT_OPERATION_A,
      role: "plan-reference",
      source: {
        kind: "sandbox-blob",
        blob: new OversizedBlob(),
        displayName: "oversized-floor-plan.png",
      },
    };

    await expect(task8Backend(backend).importAsset(
      before.projectPath!,
      request,
      vi.fn(),
    )).rejects.toMatchObject({ code: "ASSET_TOO_LARGE" });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(baseStore.getState()).toEqual(before);
    await baseStore.close();
  });

  it("cancels from the complete callback without committing snapshot or journal state", async () => {
    const backend = new SandboxProjectBackend();
    const baseStore = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    const store = task8Store(baseStore);
    await baseStore.create({ name: "Cancel complete", location: "sandbox", profile: "showroom" });
    const before = structuredClone(store.getState());
    const commit = vi.spyOn(backend, "commit");
    let cancellation: Promise<void> | null = null;

    const importing = store.importPlanReference(
      sandboxImportRequest(pngBytes(10, 11), IMPORT_OPERATION_A),
      referenceSeed(store.getState().snapshot!),
      (event) => {
        if (event.stage === "complete") cancellation = store.cancelAssetImport(IMPORT_OPERATION_A);
      },
    );
    await expect(importing).rejects.toMatchObject({ code: "ASSET_IMPORT_CANCELLED" });
    await cancellation;
    expect(commit).not.toHaveBeenCalled();
    expect(store.getState()).toEqual(before);
    await baseStore.close();
  });

  it.each([
    ["UTF-8 BOM", "\uFEFF<svg width=\"16\" height=\"8\"/>"] ,
    ["entity reference", "<svg width=\"16\" height=\"8\"><text>&amp;</text></svg>"],
    ["XML declaration", "<?xml version=\"1.0\"?><svg width=\"16\" height=\"8\"/>"] ,
    ["processing instruction", "<svg width=\"16\" height=\"8\"><?unsafe data?></svg>"],
    ["doctype", "<!DOCTYPE svg><svg width=\"16\" height=\"8\"/>"] ,
    ["forbidden element", "<svg width=\"16\" height=\"8\"><image href=\"#local\"/></svg>"],
    ["event attribute", "<svg width=\"16\" height=\"8\" onload=\"alert(1)\"/>"] ,
    ["style attribute", "<svg width=\"16\" height=\"8\" style=\"fill:red\"/>"] ,
    ["unsafe href", "<svg width=\"16\" height=\"8\"><use href=\"https://example.test/x\"/></svg>"],
    ["absolute local href", "<svg width=\"16\" height=\"8\"><use href=\"/x\"/></svg>"],
    ["unsafe presentation URL", "<svg width=\"16\" height=\"8\"><rect fill=\"url(https://example.test/x)\"/></svg>"],
    ["CSS comment trick", "<svg width=\"16\" height=\"8\"><rect fill=\"red/**/blue\"/></svg>"],
    ["duplicate normalized attributes", "<svg xmlns:xlink=\"http://www.w3.org/1999/xlink\" width=\"16\" height=\"8\"><use href=\"#a\" xlink:href=\"#a\"/></svg>"],
    ["second root", "<svg width=\"16\" height=\"8\"/><svg width=\"16\" height=\"8\"/>"] ,
    ["fractional dimensions", "<svg width=\"16.5\" height=\"8\"/>"] ,
    ["oversized dimensions", "<svg width=\"16385\" height=\"8\"/>"] ,
  ])("rejects native-rejected SVG input: %s", async (_caseName, svg) => {
    const backend = new SandboxProjectBackend();
    const baseStore = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await baseStore.create({ name: "SVG parity", location: "sandbox", profile: "showroom" });
    await expect(task8Backend(backend).importAsset(
      baseStore.getState().projectPath!,
      sandboxImportRequest(new TextEncoder().encode(svg), IMPORT_OPERATION_A, "unsafe.svg"),
      vi.fn(),
    )).rejects.toThrow();
    await baseStore.close();
  });

  it("accepts a well-formed SVG with a safe local fragment presentation URL", async () => {
    const backend = new SandboxProjectBackend();
    const baseStore = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await baseStore.create({ name: "SVG local fragment", location: "sandbox", profile: "showroom" });
    const svg = "<svg width=\"16px\" height=\"8\"><defs><linearGradient id=\"g\"/></defs><rect fill=\"url(#g)\"/></svg>";
    await expect(task8Backend(backend).importAsset(
      baseStore.getState().projectPath!,
      sandboxImportRequest(new TextEncoder().encode(svg), IMPORT_OPERATION_A, "safe.svg"),
      vi.fn(),
    )).resolves.toMatchObject({
      asset: { mediaType: "image/svg+xml" },
      facts: { kind: "image", width: 16, height: 8 },
    });
    await baseStore.close();
  });

  it("hashes real Blob bytes with Web Crypto, deduplicates the canonical Blob, and reuses one owned URL", async () => {
    const urls = installObjectUrlRecorder();
    const bytes = pngBytes(37, 23);
    const expectedDigest = await sha256Hex(bytes);
    const backend = new SandboxProjectBackend();
    const baseStore = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    const store = task8Store(baseStore);
    await baseStore.create({ name: "Sandbox dedup", location: "sandbox", profile: "showroom" });
    const firstProgress: AssetImportProgress[] = [];
    const secondProgress: AssetImportProgress[] = [];

    const firstReference = await importSandboxReference(
      baseStore,
      bytes,
      IMPORT_OPERATION_A,
      REFERENCE_A,
      (value) => firstProgress.push(value),
    );
    const secondReference = await importSandboxReference(
      baseStore,
      bytes,
      IMPORT_OPERATION_B,
      REFERENCE_B,
      (value) => secondProgress.push(value),
    );

    const assets = store.getState().snapshot!.assets;
    expect(assets).toHaveLength(2);
    expect(assets[0]!.id).not.toBe(assets[1]!.id);
    expect(assets.map(({ sha256, relativePath, mediaType, size }) => ({
      sha256,
      relativePath,
      mediaType,
      size,
    }))).toEqual([0, 1].map(() => ({
      sha256: expectedDigest,
      relativePath: `assets/sha256/${expectedDigest.slice(0, 2)}/${expectedDigest}.png`,
      mediaType: "image/png",
      size: bytes.byteLength,
    })));
    expect(firstReference).toMatchObject({
      assetId: assets[0]!.id,
      intrinsicSize: { width: 37, height: 23 },
    });
    expect(secondReference).toMatchObject({
      assetId: assets[1]!.id,
      intrinsicSize: { width: 37, height: 23 },
    });
    for (const [operationId, events] of [
      [IMPORT_OPERATION_A, firstProgress],
      [IMPORT_OPERATION_B, secondProgress],
    ] as const) {
      expect(events.map((event) => event.stage)).toEqual([
        "capture",
        "validate",
        "hash",
        "publish",
        "complete",
      ]);
      expect(events.every((event) =>
        event.operationId === operationId &&
        event.totalBytes === bytes.byteLength &&
        event.completedBytes >= 0 &&
        event.completedBytes <= event.totalBytes)).toBe(true);
      expect(events.every((event, index) =>
        index === 0 || event.completedBytes >= events[index - 1]!.completedBytes)).toBe(true);
    }

    const firstSource = await store.resolveAsset(assets[0]!.id);
    const secondSource = await store.resolveAsset(assets[1]!.id);
    expect(firstSource.url).toBe("blob:aethertwin-owned-1");
    expect(secondSource.url).toBe(firstSource.url);
    expect(urls.createObjectURL).toHaveBeenCalledOnce();
    const ownedBlob = urls.createObjectURL.mock.calls[0]![0] as Blob;
    expect(new Uint8Array(await ownedBlob.arrayBuffer())).toEqual(bytes);
    expect(JSON.stringify(store.getState().snapshot)).not.toContain("blob:aethertwin-owned");
    await baseStore.close();
  });

  it("keeps a shared URL while one canonical asset remains and revokes it when the last record is invalidated", async () => {
    const urls = installObjectUrlRecorder();
    const bytes = pngBytes(8, 9);
    const backend = new SandboxProjectBackend();
    const baseStore = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    const store = task8Store(baseStore);
    await baseStore.create({ name: "Invalidate", location: "sandbox", profile: "market" });
    await importSandboxReference(baseStore, bytes, IMPORT_OPERATION_A, REFERENCE_A);
    await importSandboxReference(baseStore, bytes, IMPORT_OPERATION_B, REFERENCE_B);
    const [firstAsset, secondAsset] = store.getState().snapshot!.assets;
    const source = await store.resolveAsset(firstAsset!.id);
    await store.resolveAsset(secondAsset!.id);

    await baseStore.undo();
    expect(store.getState().snapshot!.assets).toEqual([firstAsset]);
    expect(urls.revokeObjectURL).not.toHaveBeenCalled();
    expect((await store.resolveAsset(firstAsset!.id)).url).toBe(source.url);

    await baseStore.undo();
    expect(store.getState().snapshot!.assets).toEqual([]);
    expect(urls.revokeObjectURL).toHaveBeenCalledOnce();
    expect(urls.revokeObjectURL).toHaveBeenCalledWith(source.url);
    await baseStore.close();
  });

  it("revokes project-owned URLs on project replacement and explicit close", async () => {
    const urls = installObjectUrlRecorder();
    const backend = new SandboxProjectBackend();
    const baseStore = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    const store = task8Store(baseStore);
    await baseStore.create({ name: "First blobs", location: "sandbox", profile: "showroom" });
    const firstReference = await importSandboxReference(
      baseStore,
      pngBytes(10, 11),
      IMPORT_OPERATION_A,
      REFERENCE_A,
    );
    const firstUrl = (await store.resolveAsset(firstReference.assetId)).url;

    await baseStore.create({ name: "Second blobs", location: "sandbox", profile: "market" });
    expect(urls.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(urls.revokeObjectURL).toHaveBeenNthCalledWith(1, firstUrl);

    const secondReference = await importSandboxReference(
      baseStore,
      pngBytes(12, 13),
      IMPORT_OPERATION_B,
      REFERENCE_B,
    );
    const secondUrl = (await store.resolveAsset(secondReference.assetId)).url;
    expect(secondUrl).not.toBe(firstUrl);

    await baseStore.close();
    expect(urls.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(urls.revokeObjectURL).toHaveBeenNthCalledWith(2, secondUrl);
  });

  it("revokes every owned URL when the sandbox backend is disposed", async () => {
    const urls = installObjectUrlRecorder();
    const backend = new SandboxProjectBackend();
    const baseStore = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    const store = task8Store(baseStore);
    await baseStore.create({ name: "Dispose blobs", location: "sandbox", profile: "showroom" });
    const reference = await importSandboxReference(
      baseStore,
      pngBytes(14, 15),
      IMPORT_OPERATION_A,
      REFERENCE_A,
    );
    const source = await store.resolveAsset(reference.assetId);

    await expect(task8Backend(backend).dispose()).resolves.toBeUndefined();

    expect(urls.revokeObjectURL).toHaveBeenCalledOnce();
    expect(urls.revokeObjectURL).toHaveBeenCalledWith(source.url);
    await expect(task8Backend(backend).dispose()).resolves.toBeUndefined();
    expect(urls.revokeObjectURL).toHaveBeenCalledOnce();
  });
});

describe("ProjectStore", () => {
  it("advances the asset source epoch only after a project replacement is installed", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend);
    const sourceEpoch = () => (
      store as unknown as { getAssetSourceEpoch(): number }
    ).getAssetSourceEpoch();

    expect(sourceEpoch()).toBe(0);
    await store.create({ name: "Epoch", location: "sandbox", profile: "showroom" });
    const path = store.getState().projectPath!;
    expect(sourceEpoch()).toBe(1);

    const failure = new Error("replacement failed");
    vi.spyOn(backend, "openProject").mockRejectedValueOnce(failure);
    await expect(store.open(path)).rejects.toBe(failure);
    expect(sourceEpoch()).toBe(1);

    await store.open(path);
    expect(sourceEpoch()).toBe(2);
    await store.renameProject("Ordinary edit");
    expect(sourceEpoch()).toBe(2);
  });

  it("creates only showroom or market projects", async () => {
    const store = new ProjectStore(new SandboxProjectBackend());
    await store.create({ name: "Market", location: "sandbox", profile: "market" });
    expect(store.getState().snapshot?.project.profile).toBe("market");

    await expect(
      store.create({ name: "Invalid", location: "sandbox", profile: "iot" as never }),
    ).rejects.toThrow(/profile/i);
    expect(store.getState().snapshot?.project.profile).toBe("market");
  });

  it("moves from dirty to saved after an autosave checkpoint", async () => {
    vi.useFakeTimers();
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 500 });
    await store.create({ name: "Demo", location: "sandbox", profile: "showroom" });
    await store.renameProject("Renamed");
    expect(store.getState().saveState).toBe("dirty");
    await vi.advanceTimersByTimeAsync(500);
    expect(store.getState().saveState).toBe("saved");
    expect(backend.checkpointCount).toBe(1);
  });

  it("surfaces persistence failure without publishing the rename", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend);
    await store.create({ name: "Old", location: "sandbox", profile: "market" });
    backend.failNextCommit = new Error("disk full");
    await expect(store.renameProject("New")).rejects.toThrow("disk full");
    expect(store.getState().snapshot?.project.name).toBe("Old");
    expect(store.getState().saveState).toBe("error");
  });

  it("publishes a mutation only after its durable commit finishes", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend);
    await store.create({ name: "Old", location: "sandbox", profile: "market" });
    let release!: () => void;
    vi.spyOn(backend, "commit").mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const pending = store.renameProject("New");

    await Promise.resolve();
    expect(store.getState().snapshot?.project.name).toBe("Old");
    release();
    await pending;
    expect(store.getState().snapshot?.project.name).toBe("New");
    expect(store.getState().saveState).toBe("dirty");
  });

  it("normalizes commands and delegates undo and redo to the open project's command bus", async () => {
    vi.useFakeTimers();
    const store = new ProjectStore(new SandboxProjectBackend(), { autosaveDelayMs: 60_000 });
    await store.create({ name: "Old", location: "sandbox", profile: "showroom" });

    await store.renameProject("  New  ");
    await store.setProjectTags([" featured ", "", "featured", " summer "]);
    expect(store.getState().snapshot?.project).toMatchObject({
      name: "New",
      tags: ["featured", "summer"],
    });
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: false });

    await store.undo();
    expect(store.getState().snapshot?.project.tags).toEqual([]);
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: true });
    await store.redo();
    expect(store.getState().snapshot?.project.tags).toEqual(["featured", "summer"]);
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: false });
  });

  it("trims project names and rejects an empty rename before persistence", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend);
    await store.create({ name: "Old", location: "sandbox", profile: "market" });
    const commit = vi.spyOn(backend, "commit");

    await expect(store.renameProject("   ")).rejects.toThrow(/name/i);

    expect(commit).not.toHaveBeenCalled();
    expect(store.getState().snapshot?.project.name).toBe("Old");
  });

  it("replaces the pending autosave timer after each committed mutation", async () => {
    vi.useFakeTimers();
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 500 });
    await store.create({ name: "Old", location: "sandbox", profile: "market" });
    await store.renameProject("First");
    await vi.advanceTimersByTimeAsync(400);
    await store.renameProject("Second");
    await vi.advanceTimersByTimeAsync(499);
    expect(backend.checkpointCount).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(backend.checkpointCount).toBe(1);
  });

  it("publishes saving and retains the durable current snapshot when checkpoint fails", async () => {
    vi.useFakeTimers();
    class BackendError extends Error {
      readonly code = "CHECKPOINT_FAILED";
      readonly logRef = "log-42";
    }
    const failure = new BackendError("checkpoint failed");
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Old", location: "sandbox", profile: "market" });
    await store.renameProject("Durable");
    const durableSnapshot = store.getState().snapshot;
    vi.spyOn(backend, "checkpoint").mockRejectedValueOnce(failure);
    const states: string[] = [];
    store.subscribe(() => states.push(store.getState().saveState));

    await expect(store.save()).rejects.toBe(failure);

    expect(states).toContain("saving");
    expect(store.getState().snapshot).toBe(durableSnapshot);
    expect(store.getState().snapshot?.project.name).toBe("Durable");
    expect(store.getState().saveState).toBe("error");
    expect(store.getState().error).toBeInstanceOf(BackendError);
    expect(store.getState().error).toMatchObject({ code: "CHECKPOINT_FAILED", logRef: "log-42" });
  });

  it("manual save checkpoints once and cancels the pending autosave", async () => {
    vi.useFakeTimers();
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 500 });
    await store.create({ name: "Old", location: "sandbox", profile: "market" });
    await store.renameProject("New");

    await store.save();
    await vi.advanceTimersByTimeAsync(500);

    expect(backend.checkpointCount).toBe(1);
    expect(store.getState()).toMatchObject({ saveState: "saved", error: null });
    expect(store.getState().manifest?.name).toBe("New");
  });

  it("rebases checkpoint metadata through later mutation, undo, redo, close, and reopen", async () => {
    vi.useFakeTimers();
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Initial", location: "sandbox", profile: "showroom" });
    const path = store.getState().projectPath!;

    await store.renameProject("Checkpointed");
    await store.save();
    expect(store.getState().snapshot).toMatchObject({ sequence: 1, checkpointSequence: 1 });
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: false });

    await store.renameProject("After checkpoint");
    await store.undo();
    await store.redo();
    expect(store.getState().snapshot).toMatchObject({
      sequence: 4,
      checkpointSequence: 1,
      project: { name: "After checkpoint" },
    });
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: false });

    await store.save();
    await store.close();
    await store.open(path);
    expect(store.getState().snapshot).toMatchObject({
      sequence: 4,
      checkpointSequence: 4,
      project: { name: "After checkpoint" },
    });
    expect(store.getState().snapshot?.checkpointSequence).toBe(
      store.getState().snapshot?.sequence,
    );
  });

  it("flush waits for an active operation boundary and reports that operation's failure", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend);
    await store.create({ name: "Old", location: "sandbox", profile: "market" });
    const failure = new Error("rename failed at boundary");
    let markCommitStarted!: () => void;
    let releaseCommit!: () => void;
    const commitStarted = new Promise<void>((resolve) => {
      markCommitStarted = resolve;
    });
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    vi.spyOn(backend, "commit").mockImplementationOnce(async () => {
      markCommitStarted();
      await commitGate;
      throw failure;
    });

    const rename = store.renameProject("Rejected");
    await commitStarted;
    const flushing = store.flush();
    releaseCommit();

    await expect(rename).rejects.toBe(failure);
    await expect(flushing).rejects.toBe(failure);
    expect(store.getState().snapshot?.project.name).toBe("Old");
  });

  it("flush reports the latest operation failure even when it already settled", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend);
    await store.create({ name: "Old", location: "sandbox", profile: "showroom" });
    const failure = new Error("settled rename failed");
    backend.failNextCommit = failure;

    await expect(store.renameProject("Rejected")).rejects.toBe(failure);

    await expect(store.flush()).rejects.toBe(failure);
    expect(store.getState().snapshot?.project.name).toBe("Old");
  });

  it("flush retains a failed mutation after a later manual save succeeds", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend);
    await store.create({ name: "Old", location: "sandbox", profile: "showroom" });
    const failure = new Error("rename failure must survive manual save");
    backend.failNextCommit = failure;

    await expect(store.renameProject("Rejected")).rejects.toBe(failure);
    await expect(store.save()).resolves.toBeUndefined();
    expect(backend.checkpointCount).toBe(1);

    await expect(store.flush()).rejects.toBe(failure);
    expect(store.getState().snapshot?.project.name).toBe("Old");
  });

  it("flush retains a failed mutation after an earlier mutation autosaves", async () => {
    vi.useFakeTimers();
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 500 });
    await store.create({ name: "Old", location: "sandbox", profile: "market" });
    await store.renameProject("Durable");
    const failure = new Error("rename failure must survive autosave");
    backend.failNextCommit = failure;

    await expect(store.renameProject("Rejected")).rejects.toBe(failure);
    await vi.advanceTimersByTimeAsync(500);
    expect(backend.checkpointCount).toBe(1);

    await expect(store.flush()).rejects.toBe(failure);
    expect(store.getState().snapshot?.project.name).toBe("Durable");
  });

  it("flush forgets a prior failure after a later operation succeeds", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Old", location: "sandbox", profile: "market" });
    const failure = new Error("transient rename failure");
    backend.failNextCommit = failure;
    await expect(store.renameProject("Rejected")).rejects.toBe(failure);
    await expect(store.flush()).rejects.toBe(failure);

    await store.renameProject("Recovered");

    await expect(store.flush()).resolves.toBeUndefined();
    expect(store.getState().snapshot?.project.name).toBe("Recovered");
    await store.close();
  });

  it("opens recovered projects in recovered state and clears recovery after saving", async () => {
    const sandbox = new SandboxProjectBackend();
    const opened = await sandbox.createProject({ name: "Recovered", location: "sandbox", profile: "showroom" });
    const backend: ProjectBackend = {
      mode: "sandbox",
      ...projectAssetDelegates(sandbox),
      createProject: (request) => sandbox.createProject(request),
      openProject: async () => ({ ...opened, recovered: true }),
      recoverProject: (path, confirmation) => sandbox.recoverProject(path, confirmation),
      commit: (path, batch) => sandbox.commit(path, batch),
      checkpoint: (path, snapshot) => sandbox.checkpoint(path, snapshot),
      closeProject: (path) => sandbox.closeProject(path),
    };
    const store = new ProjectStore(backend);

    await store.open(opened.projectPath);
    expect(store.getState()).toMatchObject({ recovered: true, saveState: "recovered" });
    await store.save();
    expect(store.getState()).toMatchObject({ recovered: false, saveState: "saved" });
  });

  it("requires explicit confirmation for recovery, installs recovered state, and preserves the current project on failure", async () => {
    const sandbox = new SandboxProjectBackend();
    const current = await sandbox.createProject({
      name: "Current",
      location: "sandbox",
      profile: "market",
    });
    const recovered = {
      ...(await sandbox.createProject({
        name: "Recovered",
        location: "sandbox",
        profile: "showroom",
      })),
      recovered: true,
    };
    const recoveryFailure = new Error("recovery failed");
    const recoverProject = vi
      .fn<ProjectBackend["recoverProject"]>()
      .mockResolvedValueOnce(recovered)
      .mockRejectedValueOnce(recoveryFailure);
    const backend: ProjectBackend = {
      mode: "desktop",
      ...projectAssetDelegates(sandbox),
      createProject: (request) => sandbox.createProject(request),
      openProject: async () => current,
      recoverProject,
      commit: (path, batch) => sandbox.commit(path, batch),
      checkpoint: (path, snapshot) => sandbox.checkpoint(path, snapshot),
      closeProject: (path) => sandbox.closeProject(path),
    };
    const store = new ProjectStore(backend);
    const sourceEpoch = () => (
      store as unknown as { getAssetSourceEpoch(): number }
    ).getAssetSourceEpoch();

    expect(sourceEpoch()).toBe(0);
    await store.open(current.projectPath);
    expect(sourceEpoch()).toBe(1);
    await store.recover(recovered.projectPath, { confirmed: true });
    expect(sourceEpoch()).toBe(2);
    expect(recoverProject).toHaveBeenCalledWith(recovered.projectPath, { confirmed: true });
    expect(store.getState()).toMatchObject({
      projectPath: recovered.projectPath,
      recovered: true,
      saveState: "recovered",
    });

    await expect(
      store.recover("E:\\Projects\\Failed.twinproj", { confirmed: true }),
    ).rejects.toBe(recoveryFailure);
    expect(sourceEpoch()).toBe(2);
    expect(store.getState()).toMatchObject({
      projectPath: recovered.projectPath,
      recovered: true,
      saveState: "error",
      error: recoveryFailure,
    });
  });

  it("closes the backend project, resets state, and cancels pending timers", async () => {
    vi.useFakeTimers();
    const backend = new SandboxProjectBackend();
    const close = vi.spyOn(backend, "closeProject");
    const store = new ProjectStore(backend, { autosaveDelayMs: 500 });
    await store.create({ name: "Demo", location: "sandbox", profile: "showroom" });
    const path = store.getState().projectPath;
    await store.renameProject("Dirty");

    await store.close();
    await vi.advanceTimersByTimeAsync(500);

    expect(close).toHaveBeenCalledWith(path);
    expect(backend.checkpointCount).toBe(0);
    expect(store.getState()).toEqual({
      projectPath: null,
      manifest: null,
      snapshot: null,
      recovered: false,
      saveState: "saved",
      error: null,
      canUndo: false,
      canRedo: false,
      assetIssues: [],
    });
  });

  it("disposes terminally while suppressing in-flight publication and queued backend work", async () => {
    vi.useFakeTimers();
    const backend = new SandboxProjectBackend();
    const createProject = vi.spyOn(backend, "createProject");
    const openProject = vi.spyOn(backend, "openProject");
    const close = vi.spyOn(backend, "closeProject");
    const checkpoint = vi.spyOn(backend, "checkpoint");
    const store = new ProjectStore(backend, { autosaveDelayMs: 500 });
    const listener = vi.fn();
    store.subscribe(listener);
    await store.create({ name: "Demo", location: "sandbox", profile: "showroom" });
    await store.renameProject("Dirty");
    expect(store.getState().saveState).toBe("dirty");

    const commitProject = backend.commit.bind(backend);
    let markCommitStarted!: () => void;
    let releaseCommit!: () => void;
    const commitStarted = new Promise<void>((resolve) => {
      markCommitStarted = resolve;
    });
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const commit = vi.spyOn(backend, "commit").mockImplementationOnce(async (path, batch) => {
      markCommitStarted();
      await commitGate;
      return commitProject(path, batch);
    });

    const inFlightRename = store.renameProject("In flight");
    await commitStarted;
    const queuedTags = store.setProjectTags(["must-not-commit"]);
    listener.mockClear();

    const firstDispose = store.dispose();
    const secondDispose = store.dispose();
    releaseCommit();

    await expect(inFlightRename).resolves.toBeUndefined();
    await expect(queuedTags).rejects.toThrow("ProjectStore is disposed");
    await Promise.all([firstDispose, secondDispose]);
    await vi.advanceTimersByTimeAsync(500);

    expect(listener).not.toHaveBeenCalled();
    expect(checkpoint).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(createProject).toHaveBeenCalledOnce();
    expect(openProject).not.toHaveBeenCalled();

    const queuedPublicOperations = [
      () => store.create({ name: "After dispose", location: "sandbox", profile: "market" }),
      () => store.open("sandbox://after-dispose"),
      () => store.renameProject("After dispose"),
      () => store.setProjectTags(["after-dispose"]),
      () => store.undo(),
      () => store.redo(),
      () => store.save(),
      () => store.close(),
    ];
    for (const operation of queuedPublicOperations) {
      await expect(operation()).rejects.toThrow("ProjectStore is disposed");
    }

    expect(createProject).toHaveBeenCalledOnce();
    expect(openProject).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledOnce();
    expect(checkpoint).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it("adopts an already-running close failure during disposal without retrying it", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend);
    await store.create({ name: "Demo", location: "sandbox", profile: "showroom" });
    const failure = new Error("close failed");
    let markCloseStarted!: () => void;
    let releaseClose!: () => void;
    const closeStarted = new Promise<void>((resolve) => {
      markCloseStarted = resolve;
    });
    const closeGate = new Promise<void>((resolve) => {
      releaseClose = resolve;
    });
    const close = vi.spyOn(backend, "closeProject").mockImplementation(async () => {
      markCloseStarted();
      await closeGate;
      throw failure;
    });

    const closing = store.close();
    await closeStarted;
    const disposing = store.dispose();
    releaseClose();

    await expect(closing).rejects.toBe(failure);
    await expect(disposing).rejects.toBe(failure);
    expect(close).toHaveBeenCalledOnce();
    await expect(store.dispose()).rejects.toBe(failure);
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps normal close retry semantics when the store is not disposed", async () => {
    const backend = new SandboxProjectBackend();
    const closeProject = backend.closeProject.bind(backend);
    const close = vi.spyOn(backend, "closeProject");
    const store = new ProjectStore(backend);
    await store.create({ name: "Demo", location: "sandbox", profile: "market" });
    const projectPath = store.getState().projectPath;
    const failure = new Error("temporary close failure");
    close.mockRejectedValueOnce(failure).mockImplementation(closeProject);

    await expect(store.close()).rejects.toBe(failure);
    expect(store.getState().projectPath).toBe(projectPath);

    await expect(store.close()).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledTimes(2);
    expect(store.getState().projectPath).toBeNull();
  });

  it("cancels a queued close so disposal performs the only backend close", async () => {
    const backend = new SandboxProjectBackend();
    const commitProject = backend.commit.bind(backend);
    const close = vi.spyOn(backend, "closeProject");
    const store = new ProjectStore(backend);
    await store.create({ name: "Demo", location: "sandbox", profile: "showroom" });
    let markCommitStarted!: () => void;
    let releaseCommit!: () => void;
    const commitStarted = new Promise<void>((resolve) => {
      markCommitStarted = resolve;
    });
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    vi.spyOn(backend, "commit").mockImplementationOnce(async (path, batch) => {
      markCommitStarted();
      await commitGate;
      return commitProject(path, batch);
    });

    const rename = store.renameProject("In flight");
    await commitStarted;
    const queuedClose = store.close();
    const disposing = store.dispose();
    releaseCommit();

    await expect(rename).resolves.toBeUndefined();
    await expect(queuedClose).rejects.toThrow("ProjectStore is disposed");
    await expect(disposing).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
  });

  it("returns an inert subscription after disposal and never calls its listener", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend);
    await store.create({ name: "Demo", location: "sandbox", profile: "market" });
    await store.dispose();
    const listener = vi.fn();

    const unsubscribe = store.subscribe(listener);
    await expect(store.renameProject("Rejected")).rejects.toThrow("ProjectStore is disposed");
    await expect(store.dispose()).resolves.toBeUndefined();

    expect(listener).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
    expect(() => unsubscribe()).not.toThrow();
  });

  it("cancels the prior project's timer and installs a fresh command bus on replacement", async () => {
    vi.useFakeTimers();
    const backend = new SandboxProjectBackend();
    const close = vi.spyOn(backend, "closeProject");
    const store = new ProjectStore(backend, { autosaveDelayMs: 500 });
    await store.create({ name: "First", location: "sandbox", profile: "market" });
    const firstPath = store.getState().projectPath;
    await store.renameProject("Dirty First");

    await store.create({ name: "Second", location: "sandbox", profile: "showroom" });
    await vi.advanceTimersByTimeAsync(500);

    expect(close).toHaveBeenCalledWith(firstPath);
    expect(backend.checkpointCount).toBe(0);
    expect(store.getState().snapshot?.project.name).toBe("Second");
    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: false });
  });

  it("does not let an old in-flight checkpoint satisfy save for a replacement project", async () => {
    const backend = new SandboxProjectBackend();
    const createProject = vi.spyOn(backend, "createProject");
    const checkpointProject = backend.checkpoint.bind(backend);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const checkpoint = vi.spyOn(backend, "checkpoint").mockImplementationOnce(async (path, snapshot) => {
      await gate;
      return checkpointProject(path, snapshot);
    });
    const store = new ProjectStore(backend);
    await store.create({ name: "First", location: "sandbox", profile: "market" });
    const firstSave = store.save();
    const replacing = store.create({ name: "Second", location: "sandbox", profile: "showroom" });
    await Promise.resolve();
    expect(createProject).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([firstSave, replacing]);
    await store.save();

    expect(checkpoint).toHaveBeenCalledTimes(2);
    expect(store.getState().manifest?.name).toBe("Second");
  });

  it("queues a save requested after replacement behind the old project's in-flight save", async () => {
    const backend = new SandboxProjectBackend();
    const checkpointProject = backend.checkpoint.bind(backend);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const checkpoint = vi.spyOn(backend, "checkpoint").mockImplementationOnce(async (path, snapshot) => {
      await gate;
      return checkpointProject(path, snapshot);
    });
    const store = new ProjectStore(backend);
    await store.create({ name: "First", location: "sandbox", profile: "market" });

    const firstSave = store.save();
    const replacing = store.create({ name: "Second", location: "sandbox", profile: "showroom" });
    const secondSave = store.save();
    release();
    await Promise.all([firstSave, replacing, secondSave]);

    expect(checkpoint).toHaveBeenCalledTimes(2);
    expect(store.getState()).toMatchObject({ saveState: "saved" });
    expect(store.getState().manifest?.name).toBe("Second");
  });

  it("serializes checkpoint before a later commit so durable state cannot regress", async () => {
    vi.useFakeTimers();
    const backend = new SandboxProjectBackend();
    const checkpointProject = backend.checkpoint.bind(backend);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(backend, "checkpoint").mockImplementationOnce(async (path, snapshot) => {
      await gate;
      return checkpointProject(path, snapshot);
    });
    const commit = vi.spyOn(backend, "commit");
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Old", location: "sandbox", profile: "market" });
    const path = store.getState().projectPath!;

    const saving = store.save();
    const renaming = store.renameProject("New");
    await Promise.resolve();
    expect(commit).not.toHaveBeenCalled();
    release();
    await Promise.all([saving, renaming]);

    expect((await backend.openProject(path)).snapshot.project.name).toBe("New");
    expect(store.getState()).toMatchObject({ saveState: "dirty" });
  });

  it("validates a replacement before closing the old project and cleans up an invalid new one", async () => {
    const sandbox = new SandboxProjectBackend();
    const closeProject = vi.fn<(path: string) => Promise<void>>().mockResolvedValue(undefined);
    const backend: ProjectBackend = {
      mode: "sandbox",
      ...projectAssetDelegates(sandbox),
      createProject: (request) => sandbox.createProject(request),
      openProject: async () => {
        const valid = await sandbox.createProject({
          name: "Invalid replacement",
          location: "sandbox",
          profile: "market",
        });
        return {
          ...valid,
          projectPath: "sandbox://invalid-replacement",
          snapshot: { ...valid.snapshot, schemaVersion: 99 } as never,
        };
      },
      recoverProject: (path, confirmation) => sandbox.recoverProject(path, confirmation),
      commit: (path, batch) => sandbox.commit(path, batch),
      checkpoint: (path, snapshot) => sandbox.checkpoint(path, snapshot),
      closeProject,
    };
    const store = new ProjectStore(backend);
    await store.create({ name: "Old", location: "sandbox", profile: "showroom" });
    const oldPath = store.getState().projectPath;

    await expect(store.open("sandbox://requested")).rejects.toThrow(/schema/i);

    expect(closeProject).toHaveBeenCalledTimes(1);
    expect(closeProject).toHaveBeenCalledWith("sandbox://invalid-replacement");
    expect(closeProject).not.toHaveBeenCalledWith(oldPath);
    expect(store.getState().snapshot?.project.name).toBe("Old");
    expect(store.getState().saveState).toBe("error");
  });

  it("publishes immutable state and supports unsubscribe", async () => {
    const store = new ProjectStore(new SandboxProjectBackend());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    await store.create({ name: "Demo", location: "sandbox", profile: "showroom" });
    unsubscribe();
    await store.renameProject("New");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(store.getState())).toBe(true);
    expect(Object.isFrozen(store.getState().snapshot)).toBe(true);
  });

  it("isolates subscriber failures from durable store operations and later listeners", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend);
    const laterListener = vi.fn();
    store.subscribe(() => {
      throw new Error("listener failed");
    });
    store.subscribe(laterListener);

    await expect(
      store.create({ name: "Old", location: "sandbox", profile: "market" }),
    ).resolves.toBeUndefined();
    await expect(store.renameProject("New")).resolves.toBeUndefined();

    expect(laterListener).toHaveBeenCalledTimes(2);
    expect(store.getState().snapshot?.project.name).toBe("New");
    expect(store.getState().saveState).toBe("dirty");
  });

  it("publishes an actionable backend error when opening from the initial state fails", async () => {
    class BackendError extends Error {
      readonly code = "CORRUPT_PROJECT";
    }
    const failure = new BackendError("corrupt project");
    const backend = new SandboxProjectBackend();
    vi.spyOn(backend, "openProject").mockRejectedValueOnce(failure);
    const store = new ProjectStore(backend);

    await expect(store.open("sandbox://missing")).rejects.toBe(failure);

    expect(store.getState()).toMatchObject({
      projectPath: null,
      snapshot: null,
      saveState: "error",
      error: failure,
    });
    expect(store.getState().error).toBeInstanceOf(BackendError);
  });

  it("takes ownership of a create request before an asynchronous backend reads it", async () => {
    const sandbox = new SandboxProjectBackend();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const backend: ProjectBackend = {
      mode: "sandbox",
      ...projectAssetDelegates(sandbox),
      createProject: async (request) => {
        await gate;
        return sandbox.createProject(request);
      },
      openProject: (path) => sandbox.openProject(path),
      recoverProject: (path, confirmation) => sandbox.recoverProject(path, confirmation),
      commit: (path, batch) => sandbox.commit(path, batch),
      checkpoint: (path, snapshot) => sandbox.checkpoint(path, snapshot),
      closeProject: (path) => sandbox.closeProject(path),
    };
    const store = new ProjectStore(backend);
    const request = { name: "Owned", location: "sandbox", profile: "market" as const };

    const pending = store.create(request);
    request.name = "Caller mutation";
    release();
    await pending;

    expect(store.getState().snapshot?.project.name).toBe("Owned");
  });

  it("publishes a multi-entity patch only after one durable commit and reverses it", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Demo", location: "sandbox", profile: "market" });
    const fixture = fixtureFor(store.getState().snapshot!);
    const commit = vi.spyOn(backend, "commit");
    await store.applyPlanEdit({
      reason: "create", changes: [{ id: fixture.id, before: null, after: fixture }],
    });
    expect(commit).toHaveBeenCalledOnce();
    expect(commit.mock.calls[0]![1].journal).toHaveLength(1);
    expect(commit.mock.calls[0]![1].journal[0]!.commandType).toBe("plan.entities.patch");
    expect(store.getState().snapshot?.project.entities).toContainEqual(fixture);
    await store.undo();
    expect(store.getState().snapshot?.project.entities).toEqual([]);
  });

  it("reopens the exact edited schema-v3 plan after array, undo, redo, and save", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "M1 Demo", location: "sandbox", profile: "market" });
    const initial = store.getState().snapshot!;
    const floor = initial.project.floors[0]!;
    const layer = floor.layers[0]!;
    const boundary: Boundary = {
      type: "boundary",
      id: "00000000-0000-4000-8000-000000000010",
      name: "Boundary",
      tags: [],
      floorId: floor.id,
      layerId: layer.id,
      locked: false,
      transform: identityTransform2D,
      polygon: [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 }],
    };
    const fixture: Fixture = {
      ...fixtureFor(initial, "00000000-0000-4000-8000-000000000011"),
      transform: {
        translation: { x: 500, y: 500 },
        rotation: 0,
        scale: { x: 1, y: 1 },
      },
    };
    await store.applyPlanEdit({
      reason: "create",
      changes: [
        { id: boundary.id, before: null, after: boundary },
        { id: fixture.id, before: null, after: fixture },
      ],
    });

    const beforeArray = store.getState().snapshot!;
    expect(beforeArray.sequence).toBe(initial.sequence + 1);
    expect(beforeArray.project.entities).toEqual([boundary, fixture]);

    const generatedIds = [12, 13, 14, 15, 16].map(
      (value) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`,
    );
    const cloneTranslations = [
      { x: 1000, y: 500 },
      { x: 1500, y: 500 },
      { x: 500, y: 1000 },
      { x: 1000, y: 1000 },
      { x: 1500, y: 1000 },
    ];
    const expectedArrayEntities = [
      boundary,
      fixture,
      ...generatedIds.map((id, index) => ({
        ...fixture,
        id,
        transform: {
          ...fixture.transform,
          translation: cloneTranslations[index]!,
        },
      })),
    ];
    const idQueue = [...generatedIds];
    const result = rectangularArray(
      [fixture],
      { rows: 2, columns: 3, rowGap: 500, columnGap: 500 },
      () => idQueue.shift()!,
    );
    if (!result.ok) throw new Error(result.issue.message);
    expect(idQueue).toEqual([]);
    await store.applyPlanEdit(result.value);

    const afterArray = store.getState().snapshot!;
    expect(afterArray.sequence).toBe(beforeArray.sequence + 1);
    expect(afterArray.checkpointSequence).toBe(beforeArray.checkpointSequence);
    expect(afterArray.project.entities).toEqual(expectedArrayEntities);

    await store.undo();
    const undone = store.getState().snapshot!;
    expect(undone.sequence).toBe(afterArray.sequence + 1);
    expect(undone.checkpointSequence).toBe(beforeArray.checkpointSequence);
    expect(undone.project.entities).toEqual([boundary, fixture]);
    expect(store.getState().canRedo).toBe(true);

    await store.redo();

    const projectPath = store.getState().projectPath!;
    const expected = store.getState().snapshot!;
    expect(expected.schemaVersion).toBe(3);
    expect(expected.sequence).toBe(undone.sequence + 1);
    expect(expected.checkpointSequence).toBe(beforeArray.checkpointSequence);
    expect(expected.project.entities).toEqual(expectedArrayEntities);
    await store.save();
    await store.close();
    await store.open(projectPath);

    expect(store.getState().snapshot).toEqual({
      ...expected,
      checkpointSequence: expected.sequence,
    });
  });

  it("durably preserves middle entity order across delete undo and redo", async () => {
    const backend = new SandboxProjectBackend();
    const commit = vi.spyOn(backend, "commit");
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Demo", location: "sandbox", profile: "market" });
    const snapshot = store.getState().snapshot!;
    const first = fixtureFor(snapshot, "00000000-0000-4000-8000-000000000010", "First");
    const middle = fixtureFor(snapshot, "00000000-0000-4000-8000-000000000011", "Middle");
    const last = fixtureFor(snapshot, "00000000-0000-4000-8000-000000000012", "Last");

    await store.applyPlanEdit({
      reason: "create",
      changes: [
        { id: first.id, before: null, after: first },
        { id: middle.id, before: null, after: middle },
        { id: last.id, before: null, after: last },
      ],
    });
    await store.applyPlanEdit({
      reason: "delete",
      changes: [{ id: middle.id, before: middle, after: null }],
    });
    expect(store.getState().snapshot?.project.entities).toEqual([first, last]);

    await store.undo();
    expect(store.getState().snapshot?.project.entities).toEqual([first, middle, last]);

    await store.redo();
    expect(store.getState().snapshot?.project.entities).toEqual([first, last]);
    expect(commit).toHaveBeenCalledTimes(4);
  });

  it("does not publish or advance history for a rejected plan patch", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Demo", location: "sandbox", profile: "market" });
    const fixture = fixtureFor(store.getState().snapshot!);
    const beforeSequence = store.getState().snapshot!.sequence;
    backend.failNextCommit = new Error("disk full");
    await expect(store.applyPlanEdit({
      reason: "create", changes: [{ id: fixture.id, before: null, after: fixture }],
    })).rejects.toThrow("disk full");
    expect(store.getState().snapshot?.project.entities).toEqual([]);
    expect(store.getState().snapshot?.sequence).toBe(beforeSequence);
    expect(store.getState().canUndo).toBe(false);
    expect(store.getState().canRedo).toBe(false);
  });

  it("persists layer visibility as one reversible floor patch", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Demo", location: "sandbox", profile: "market" });
    const before = store.getState().snapshot!.project.floors[0]!;
    const after = { ...before, layers: before.layers.map((layer) => ({ ...layer, visible: false })) };
    const commit = vi.spyOn(backend, "commit");
    await store.applyFloorPatch({ floorId: before.id, before, after });
    expect(commit).toHaveBeenCalledOnce();
    expect(commit.mock.calls[0]![1].journal[0]!.commandType).toBe("plan.floor.patch");
    expect(store.getState().snapshot!.project.floors[0]!.layers[0]!.visible).toBe(false);
    await store.undo();
    expect(store.getState().snapshot!.project.floors[0]!.layers[0]!.visible).toBe(true);
  });

  it("owns plan and floor patch inputs before their queued mutations start", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Demo", location: "sandbox", profile: "market" });
    const fixture = fixtureFor(store.getState().snapshot!);
    const intent: PlanEditIntent = {
      reason: "create", changes: [{ id: fixture.id, before: null, after: fixture }],
    };
    const pendingIntent = store.applyPlanEdit(intent);
    (intent.changes[0]!.after as { name: string }).name = "Caller mutation";
    await pendingIntent;
    expect(store.getState().snapshot!.project.entities[0]!.name).toBe("Fixture");

    const before = store.getState().snapshot!.project.floors[0]!;
    const after = { ...before, layers: before.layers.map((layer) => ({ ...layer, visible: false })) };
    const change: FloorChange = { floorId: before.id, before, after };
    const pendingFloor = store.applyFloorPatch(change);
    (change.after.layers[0] as { visible: boolean }).visible = true;
    await pendingFloor;
    expect(store.getState().snapshot!.project.floors[0]!.layers[0]!.visible).toBe(false);
  });
});

describe("project commands", () => {
  it("normalizes new values while restoring exact previous values from inverse payloads", () => {
    const initial = createInitialSnapshot({ name: "Initial", profile: "showroom" });
    const snapshot = parseSnapshot({
      ...initial,
      project: {
        ...initial.project,
        name: "  Previous  ",
        tags: [" prior ", "prior"],
      },
    });

    const rename = renameProjectCommand.prepare(snapshot, { name: "  New  " });
    expect(rename.next.project.name).toBe("New");
    expect(rename.inversePayload).toEqual({ name: "  Previous  " });
    expect(renameProjectCommand.applyInverse(rename.next, rename.inversePayload).project.name).toBe(
      "  Previous  ",
    );

    const tags = setProjectTagsCommand.prepare(snapshot, {
      tags: [" featured ", "", "featured"],
    });
    expect(tags.next.project.tags).toEqual(["featured"]);
    expect(tags.inversePayload).toEqual({ tags: [" prior ", "prior"] });
    expect(setProjectTagsCommand.applyInverse(tags.next, tags.inversePayload).project.tags).toEqual([
      " prior ",
      "prior",
    ]);
  });
});

describe("SandboxProjectBackend", () => {
  it("uses deterministic sandbox project paths and returns owned immutable clones", async () => {
    const backend = new SandboxProjectBackend();
    const created = await backend.createProject({ name: "Demo", location: "ignored", profile: "market" });
    expect(created.projectPath).toBe("sandbox://00000000-0000-4000-8000-000000000001");

    const first = await backend.openProject(created.projectPath);
    const second = await backend.openProject(created.projectPath);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.snapshot).not.toBe(second.snapshot);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.snapshot.project.tags)).toBe(true);
  });

  it("clones commit and checkpoint values across the backend boundary", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Old", location: "sandbox", profile: "showroom" });
    const path = store.getState().projectPath!;
    await store.renameProject("New");
    await store.save();

    const opened = await backend.openProject(path);
    expect(opened.snapshot.project.name).toBe("New");
    expect(opened.manifest.name).toBe("New");
    expect(opened.snapshot).not.toBe(store.getState().snapshot);
  });
});

describe("RecentProjects", () => {
  it("normalizes duplicated and out-of-order legacy storage by newest valid timestamp", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "aethertwin.recentProjects.v1",
      JSON.stringify([
        {
          path: "sandbox://one",
          name: "One old",
          profile: "showroom",
          openedAt: "2026-07-17T01:00:00.000Z",
        },
        {
          path: "sandbox://two",
          name: "Two",
          profile: "market",
          openedAt: "2026-07-17T03:00:00.000Z",
        },
        {
          path: "sandbox://one",
          name: "One invalid",
          profile: "market",
          openedAt: "not-a-timestamp",
        },
        {
          path: "sandbox://one",
          name: "One newest",
          profile: "market",
          openedAt: "2026-07-17T04:00:00.000Z",
        },
        {
          path: "sandbox://ONE",
          name: "Case-sensitive path",
          profile: "showroom",
          openedAt: "2026-07-17T02:00:00.000Z",
        },
      ]),
    );
    const recents = new RecentProjects(storage);

    const listed = recents.list();

    expect(listed.map(({ path, name, openedAt }) => ({ path, name, openedAt }))).toEqual([
      {
        path: "sandbox://one",
        name: "One newest",
        openedAt: "2026-07-17T04:00:00.000Z",
      },
      {
        path: "sandbox://two",
        name: "Two",
        openedAt: "2026-07-17T03:00:00.000Z",
      },
      {
        path: "sandbox://ONE",
        name: "Case-sensitive path",
        openedAt: "2026-07-17T02:00:00.000Z",
      },
    ]);
    expect(JSON.parse(storage.getItem("aethertwin.recentProjects.v1")!)).toEqual(listed);
  });

  it("keeps a newer stored record when an older timestamp is recorded later", () => {
    const storage = new MemoryStorage();
    const recents = new RecentProjects(storage);
    recents.record({
      path: "sandbox://one",
      name: "Newest",
      profile: "market",
      openedAt: "2026-07-17T04:00:00.000Z",
    });
    recents.record({
      path: "sandbox://two",
      name: "Two",
      profile: "showroom",
      openedAt: "2026-07-17T03:00:00.000Z",
    });

    recents.record({
      path: "sandbox://one",
      name: "Stale event",
      profile: "showroom",
      openedAt: "2026-07-17T01:00:00.000Z",
    });

    expect(recents.list().map(({ path, name }) => ({ path, name }))).toEqual([
      { path: "sandbox://one", name: "Newest" },
      { path: "sandbox://two", name: "Two" },
    ]);
  });

  it("stores app-local immutable recents newest-first and deduplicates exact paths", () => {
    const storage = new MemoryStorage();
    const recents = new RecentProjects(storage);
    const mutable = {
      path: "sandbox://one",
      name: "One",
      profile: "showroom" as const,
      openedAt: "2026-07-17T00:00:00.000Z",
    };
    recents.record(mutable);
    mutable.name = "Caller mutation";
    recents.record({
      path: "sandbox://two",
      name: "Two",
      profile: "market",
      openedAt: "2026-07-17T01:00:00.000Z",
    });
    recents.record({
      path: "sandbox://one",
      name: "One reopened",
      profile: "showroom",
      openedAt: "2026-07-17T02:00:00.000Z",
    });

    const listed = recents.list();
    expect(listed.map(({ path, name }) => ({ path, name }))).toEqual([
      { path: "sandbox://one", name: "One reopened" },
      { path: "sandbox://two", name: "Two" },
    ]);
    expect(Object.isFrozen(listed)).toBe(true);
    expect(Object.isFrozen(listed[0])).toBe(true);
    expect([...storage.values.keys()]).toEqual(["aethertwin.recentProjects.v1"]);
  });

  it("removes an existing path while preserving an immutable, persisted recent list", () => {
    const storage = new MemoryStorage();
    const recents = new RecentProjects(storage);
    recents.record({
      path: "sandbox://one",
      name: "One",
      profile: "showroom",
      openedAt: "2026-07-17T03:00:00.000Z",
    });
    recents.record({
      path: "sandbox://two",
      name: "Two",
      profile: "market",
      openedAt: "2026-07-17T02:00:00.000Z",
    });
    recents.record({
      path: "sandbox://three",
      name: "Three",
      profile: "showroom",
      openedAt: "2026-07-17T01:00:00.000Z",
    });

    recents.remove("sandbox://two");

    const listed = recents.list();
    expect(listed.map(({ path, name }) => ({ path, name }))).toEqual([
      { path: "sandbox://one", name: "One" },
      { path: "sandbox://three", name: "Three" },
    ]);
    expect(Object.isFrozen(listed)).toBe(true);
    expect(listed.every((project) => Object.isFrozen(project))).toBe(true);
    expect(JSON.parse(storage.getItem("aethertwin.recentProjects.v1")!)).toEqual(listed);
  });

  it("treats an unknown path as an immutable, persistence-preserving no-op", () => {
    const storage = new MemoryStorage();
    const recents = new RecentProjects(storage);
    recents.record({
      path: "sandbox://one",
      name: "One",
      profile: "showroom",
      openedAt: "2026-07-17T03:00:00.000Z",
    });
    const serializedBefore = storage.getItem("aethertwin.recentProjects.v1");

    recents.remove("sandbox://missing");

    const listed = recents.list();
    expect(listed.map(({ path, name }) => ({ path, name }))).toEqual([
      { path: "sandbox://one", name: "One" },
    ]);
    expect(Object.isFrozen(listed)).toBe(true);
    expect(Object.isFrozen(listed[0])).toBe(true);
    expect(storage.getItem("aethertwin.recentProjects.v1")).toBe(serializedBefore);
  });

  it("returns an empty list for malformed preferences without leaking paths into project data", async () => {
    const storage = new MemoryStorage();
    storage.setItem("aethertwin.recentProjects.v1", "{not-json");
    const recents = new RecentProjects(storage);
    expect(recents.list()).toEqual([]);

    const backend = new SandboxProjectBackend();
    const opened = await backend.createProject({ name: "Demo", location: "sandbox", profile: "market" });
    recents.record({
      path: opened.projectPath,
      name: opened.manifest.name,
      profile: opened.manifest.profile,
      openedAt: opened.manifest.updatedAt,
    });

    expect(JSON.stringify(opened.snapshot)).not.toContain(opened.projectPath);
    expect(JSON.stringify(opened.manifest)).not.toContain(opened.projectPath);
  });
});

interface Task12ProjectStore {
  applyPlanReferencePatch(
    before: PlanReference,
    after: PlanReference | null,
  ): Promise<void>;
}

function task12Store(store: ProjectStore): ProjectStore & Task12ProjectStore {
  return store as ProjectStore & Task12ProjectStore;
}

async function createEditablePlanReferenceStore(): Promise<{
  readonly backend: ControlledAssetBackend;
  readonly store: ProjectStore & Task12ProjectStore;
  readonly reference: PlanReference;
}> {
  const backend = new ControlledAssetBackend();
  const baseStore = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
  const store = task12Store(baseStore);
  await store.create({ name: "Reference edits", location: "sandbox", profile: "showroom" });
  const reference = await task8Store(store).importPlanReference(
    nativeImportRequest(),
    referenceSeed(store.getState().snapshot!),
    vi.fn(),
  );
  return { backend, store, reference };
}

describe("ProjectStore plan-reference patches", () => {
  it("durably edits placement and properties in one reversible record intent", async () => {
    const { backend, store, reference } = await createEditablePlanReferenceStore();
    const commit = vi.spyOn(backend, "commit");
    const after: PlanReference = {
      ...reference,
      name: "North concourse",
      tags: ["north", "surveyed"],
      opacity: 0.4,
      locked: true,
      transform: {
        ...reference.transform,
        translation: { x: 1250, y: -375 },
        rotation: Math.PI / 6,
      },
    };

    await store.applyPlanReferencePatch(reference, after);

    expect(store.getState().snapshot!.project.planReferences).toEqual([after]);
    expect(commit).toHaveBeenCalledOnce();
    expect(commit.mock.calls[0]![1].journal).toEqual([
      expect.objectContaining({
        commandType: "snapshot.records.patch",
        payload: {
          collection: "planReferences",
          changes: [{ id: reference.id, before: reference, after }],
        },
        action: "apply",
      }),
    ]);

    await store.undo();
    expect(store.getState().snapshot!.project.planReferences).toEqual([reference]);
    await store.redo();
    expect(store.getState().snapshot!.project.planReferences).toEqual([after]);

    await store.dispose();
  });

  it("deletes one unlocked reference and restores its exact position through undo and redo", async () => {
    const { backend, store, reference } = await createEditablePlanReferenceStore();
    backend.nextImportResult = nativeImportResult(nativeAsset(ASSET_B, "b"));
    const second = await task8Store(store).importPlanReference(
      nativeImportRequest(IMPORT_OPERATION_B),
      referenceSeed(store.getState().snapshot!, REFERENCE_B, "Second"),
      vi.fn(),
    );

    await store.applyPlanReferencePatch(reference, null);
    expect(store.getState().snapshot!.project.planReferences).toEqual([second]);

    await store.undo();
    expect(store.getState().snapshot!.project.planReferences).toEqual([reference, second]);
    await store.redo();
    expect(store.getState().snapshot!.project.planReferences).toEqual([second]);

    await store.dispose();
  });

  it.each([
    ["id", (reference: PlanReference) => ({
      ...reference,
      id: "50000000-0000-4000-8000-000000000099",
    })],
    ["floorId", (reference: PlanReference) => ({
      ...reference,
      floorId: "50000000-0000-4000-8000-000000000098",
    })],
    ["layerId", (reference: PlanReference) => ({
      ...reference,
      layerId: "50000000-0000-4000-8000-000000000097",
    })],
    ["assetId", (reference: PlanReference) => ({
      ...reference,
      assetId: "50000000-0000-4000-8000-000000000096",
    })],
    ["intrinsicSize", (reference: PlanReference) => ({
      ...reference,
      intrinsicSize: { width: reference.intrinsicSize.width + 1, height: 480 },
    })],
  ] as const)("rejects an ordinary patch that changes immutable %s", async (_field, change) => {
    const { store, reference } = await createEditablePlanReferenceStore();

    await expect(store.applyPlanReferencePatch(reference, change(reference)))
      .rejects.toThrow();
    expect(store.getState().snapshot!.project.planReferences).toEqual([reference]);

    await store.dispose();
  });

  it.each([
    ["delete", (reference: PlanReference): PlanReference | null => {
      void reference;
      return null;
    }],
    ["properties", (reference: PlanReference) => ({
      ...reference,
      name: "Changed while locked",
    })],
    ["transform", (reference: PlanReference) => ({
      ...reference,
      transform: {
        ...reference.transform,
        translation: { x: 100, y: 0 },
      },
    })],
    ["calibration", (reference: PlanReference) => ({
      ...reference,
      transform: {
        ...reference.transform,
        scale: { x: 2, y: 2 },
      },
      calibration: {
        sourcePointA: { x: 0, y: 0 },
        sourcePointB: { x: 10, y: 0 },
        measuredDistanceMm: 20,
      },
    })],
  ] as const)("rejects locked-reference %s mutation without publishing state", async (_kind, change) => {
    const { store, reference } = await createEditablePlanReferenceStore();
    const locked = { ...reference, locked: true };
    await store.applyPlanReferencePatch(reference, locked);
    const sequence = store.getState().snapshot!.sequence;

    await expect(store.applyPlanReferencePatch(locked, change(locked)))
      .rejects.toThrow();
    expect(store.getState().snapshot!.sequence).toBe(sequence);
    expect(store.getState().snapshot!.project.planReferences).toEqual([locked]);

    await store.dispose();
  });

  it("allows only an otherwise-identical unlock transition from a locked reference", async () => {
    const { store, reference } = await createEditablePlanReferenceStore();
    const locked = { ...reference, locked: true };
    await store.applyPlanReferencePatch(reference, locked);
    const { name, ...lockedWithoutName } = locked;
    const unlocked: PlanReference = { name, ...lockedWithoutName, locked: false };

    await store.applyPlanReferencePatch(locked, unlocked);

    expect(store.getState().snapshot!.project.planReferences).toEqual([unlocked]);
    await store.undo();
    expect(store.getState().snapshot!.project.planReferences).toEqual([locked]);

    await store.dispose();
  });
});
