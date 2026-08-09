import {
  createInitialSnapshot,
  type AssetRecord,
  type MaterialAssignment,
  type MaterialDefinition,
  type ProjectSnapshot,
  type SpaceUnit,
} from "@aethertwin/core-model";
import { describe, expect, it } from "vitest";
import {
  createSceneRenderer,
  type SceneRendererBackend,
  type SceneRendererBackendEvents,
  type SceneRendererBackendFactory,
} from "./renderer";
import type {
  SceneCameraState,
  SceneExportRenderRequest,
  SceneGpuLimits,
  SceneProjection,
  SceneRendererEventSink,
  SceneRendererInput,
  SceneRendererStatus,
} from "./types";

const uuid = (value: number): string => (
  `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`
);

class Deferred<T> {
  readonly promise: Promise<T>;
  private resolvePromise!: (value: T) => void;
  private rejectPromise!: (reason: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
  }

  resolve(value: T): void {
    this.resolvePromise(value);
  }

  reject(reason: unknown): void {
    this.rejectPromise(reason);
  }
}

class FakeBackend implements SceneRendererBackend {
  readonly updateCalls: Array<{
    readonly projection: SceneProjection;
    readonly camera: SceneCameraState;
  }> = [];
  readonly resizeCalls: Array<{
    readonly width: number;
    readonly height: number;
    readonly devicePixelRatio: number;
  }> = [];
  readonly frameCalls: string[] = [];
  readonly waitCalls: Array<readonly string[]> = [];
  readonly renderCalls: Array<{
    readonly projection: SceneProjection;
    readonly camera: SceneCameraState;
    readonly request: SceneExportRenderRequest;
  }> = [];
  initHost: HTMLElement | null = null;
  events: SceneRendererBackendEvents | null = null;
  destroyCount = 0;
  destroyFailure: Error | null = null;
  limits: SceneGpuLimits = {
    maxTextureSize: 8192,
    maxRenderbufferSize: 4096,
    maxSamples: 4,
  };
  renderResult = new Uint8Array([1, 2, 3, 4]);
  waitImpl: () => Promise<void> = async () => undefined;

  constructor(
    private readonly initImpl: () => Promise<void> = async () => undefined,
  ) {}

  async init(host: HTMLElement, events: SceneRendererBackendEvents): Promise<void> {
    this.initHost = host;
    this.events = events;
    await this.initImpl();
  }

  update(projection: SceneProjection, camera: SceneCameraState): void {
    this.updateCalls.push({ projection, camera });
  }

  resize(width: number, height: number, devicePixelRatio: number): void {
    this.resizeCalls.push({ width, height, devicePixelRatio });
  }

  frame(target: "scene" | "selection" | "route"): void {
    this.frameCalls.push(target);
  }

  getLimits(): SceneGpuLimits {
    return this.limits;
  }

  async waitForTextures(assetIds: readonly string[]): Promise<void> {
    this.waitCalls.push([...assetIds]);
    await this.waitImpl();
  }

  async renderOffscreen(
    projection: SceneProjection,
    camera: SceneCameraState,
    request: SceneExportRenderRequest,
  ): Promise<Uint8Array> {
    this.renderCalls.push({ projection, camera, request });
    return this.renderResult;
  }

  destroy(): void {
    this.destroyCount += 1;
    if (this.destroyFailure !== null) throw this.destroyFailure;
  }
}

function backendQueue(backends: readonly FakeBackend[]): SceneRendererBackendFactory {
  let index = 0;
  return () => {
    const backend = backends[index];
    if (backend === undefined) throw new Error("Unexpected backend creation");
    index += 1;
    return backend;
  };
}

const initialIds = [1, 2, 3].map(uuid);
const baseSnapshot = createInitialSnapshot({
  name: "Task 11 renderer",
  profile: "showroom",
  uuid: () => initialIds.shift()!,
});
const floor = baseSnapshot.project.floors[0]!;
const layerId = floor.layers[0]!.id;

function camera(x = 4): SceneCameraState {
  return {
    position: { x, y: 5, z: 6 },
    target: { x: 0, y: 0, z: 0 },
    fieldOfView: 45,
  };
}

function inputFor(
  snapshot: ProjectSnapshot = baseSnapshot,
  overrides: Partial<Omit<SceneRendererInput, "snapshot">> = {},
): SceneRendererInput {
  return {
    snapshot,
    activeFloorId: floor.id,
    selectedIds: new Set(),
    activeGuidedRoute: null,
    camera: camera(),
    assetIssues: [],
    ...overrides,
  };
}

function texturedSnapshot(): { readonly snapshot: ProjectSnapshot; readonly assetId: string } {
  const room: SpaceUnit = {
    id: uuid(10),
    name: "Textured room",
    tags: [],
    type: "space-unit",
    kind: "room",
    floorId: floor.id,
    layerId,
    locked: false,
    transform: {
      translation: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    footprint: [
      { x: 0, y: 0 },
      { x: 2_000, y: 0 },
      { x: 2_000, y: 2_000 },
      { x: 0, y: 2_000 },
    ],
  };
  const asset: AssetRecord = {
    id: uuid(11),
    sha256: "a".repeat(64),
    relativePath: "assets/sha256/aa/" + "a".repeat(64) + ".png",
    mediaType: "image/png",
    size: 128,
  };
  const material: MaterialDefinition = {
    id: uuid(12),
    name: "Floor texture",
    tags: [],
    baseColor: "#445760",
    roughness: 0.9,
    metalness: 0,
    opacity: 1,
    assetId: asset.id,
  };
  const assignment: MaterialAssignment = {
    id: uuid(13),
    name: "Floor assignment",
    tags: [],
    materialId: material.id,
    targetKind: "space-floor",
    targetId: room.id,
  };
  return {
    assetId: asset.id,
    snapshot: {
      ...baseSnapshot,
      project: {
        ...baseSnapshot.project,
        entities: [room],
        materials: [material],
        materialAssignments: [assignment],
      },
      assets: [asset],
    },
  };
}

function sinkHarness(): {
  readonly sink: SceneRendererEventSink;
  readonly statuses: Array<{
    readonly status: SceneRendererStatus;
    readonly error: Error | null;
  }>;
  readonly cameras: SceneCameraState[];
  readonly selections: ReadonlySet<string>[];
} {
  const statuses: Array<{ status: SceneRendererStatus; error: Error | null }> = [];
  const cameras: SceneCameraState[] = [];
  const selections: ReadonlySet<string>[] = [];
  return {
    statuses,
    cameras,
    selections,
    sink: {
      onSelectionChange(selectedIds) {
        selections.push(selectedIds);
      },
      onCameraChange(nextCamera) {
        cameras.push(nextCamera);
      },
      onStatusChange(status, error) {
        statuses.push({ status, error });
      },
    },
  };
}

function dependencies() {
  return {
    assetSource: {
      async resolve(assetId: string) {
        return {
          assetId,
          url: "asset://localhost/" + assetId,
          mediaType: "image/png" as const,
        };
      },
    },
    issueReporter: {
      report() {},
      clear() {},
    },
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("scene renderer lifecycle", () => {
  it("queues input and resize through initialization, then forwards camera, selection, and frame events", async () => {
    const initialized = new Deferred<void>();
    const backend = new FakeBackend(() => initialized.promise);
    const renderer = createSceneRenderer(dependencies(), backendQueue([backend]));
    const { sink, statuses, cameras, selections } = sinkHarness();
    const host = {} as HTMLElement;

    const initPromise = renderer.init(host, sink);
    const input = inputFor();
    renderer.update(input);
    renderer.resize(900, 600, 1.5);

    expect(statuses.map(({ status }) => status)).toEqual(["initializing"]);
    expect(backend.updateCalls).toEqual([]);
    initialized.resolve(undefined);
    await initPromise;

    expect(statuses.map(({ status }) => status)).toEqual(["initializing", "ready"]);
    expect(backend.initHost).toBe(host);
    expect(backend.updateCalls).toHaveLength(1);
    expect(backend.updateCalls[0]?.camera).toEqual(input.camera);
    expect(backend.resizeCalls).toEqual([{ width: 900, height: 600, devicePixelRatio: 1.5 }]);

    const nextCamera = camera(12);
    backend.events?.onCameraChange(nextCamera);
    backend.events?.onSelectionChange(new Set(["selected"]));
    renderer.frame("selection");
    renderer.frame("route");

    expect(cameras).toEqual([nextCamera]);
    expect([...selections[0]!]).toEqual(["selected"]);
    expect(backend.frameCalls).toEqual(["selection", "route"]);
  });

  it("auto-recovers one context loss, disables on the second, and explicit retry starts a new round", async () => {
    const first = new FakeBackend();
    const replacement = new FakeBackend();
    const retry = new FakeBackend();
    const afterRetryRecovery = new FakeBackend();
    const renderer = createSceneRenderer(
      dependencies(),
      backendQueue([first, replacement, retry, afterRetryRecovery]),
    );
    const { sink, statuses } = sinkHarness();
    await renderer.init({} as HTMLElement, sink);
    renderer.update(inputFor());

    first.events?.onContextLost();
    await flushMicrotasks();
    expect(first.destroyCount).toBe(1);
    expect(replacement.updateCalls).toHaveLength(1);
    expect(statuses.map(({ status }) => status)).toEqual([
      "initializing",
      "ready",
      "recovering",
      "ready",
    ]);

    replacement.events?.onContextLost();
    await flushMicrotasks();
    expect(replacement.destroyCount).toBe(1);
    expect(statuses.at(-1)?.status).toBe("disabled");

    await renderer.retry();
    expect(retry.updateCalls).toHaveLength(1);
    expect(statuses.slice(-2).map(({ status }) => status)).toEqual([
      "initializing",
      "ready",
    ]);

    replacement.events?.onContextLost();
    await flushMicrotasks();
    expect(retry.destroyCount).toBe(0);

    retry.events?.onContextLost();
    await flushMicrotasks();
    expect(retry.destroyCount).toBe(1);
    expect(afterRetryRecovery.updateCalls).toHaveLength(1);

    renderer.destroy();
    renderer.destroy();
    expect(afterRetryRecovery.destroyCount).toBe(1);
    expect(statuses.at(-1)?.status).toBe("destroyed");
  });

  it("reports WebGL initialization failure, allows retry, and rejects late initialization after destroy", async () => {
    const failure = new Error("WebGL unavailable");
    const failed = new FakeBackend(async () => {
      throw failure;
    });
    const recovered = new FakeBackend();
    const lateInit = new Deferred<void>();
    const late = new FakeBackend(() => lateInit.promise);
    const renderer = createSceneRenderer(
      dependencies(),
      backendQueue([failed, recovered]),
    );
    const firstSink = sinkHarness();

    await expect(renderer.init({} as HTMLElement, firstSink.sink)).rejects.toBe(failure);
    expect(firstSink.statuses.at(-1)).toEqual({ status: "failed", error: failure });
    expect(failed.destroyCount).toBe(1);

    await renderer.retry();
    expect(firstSink.statuses.at(-1)?.status).toBe("ready");

    const secondRenderer = createSceneRenderer(dependencies(), backendQueue([late]));
    const secondSink = sinkHarness();
    const pending = secondRenderer.init({} as HTMLElement, secondSink.sink);
    secondRenderer.destroy();
    lateInit.resolve(undefined);
    await pending;

    expect(late.destroyCount).toBe(1);
    expect(secondSink.statuses.map(({ status }) => status)).toEqual([
      "initializing",
      "destroyed",
    ]);
  });

  it("does not let backend cleanup failures block recovery or destroyed status", async () => {
    const retiredFailure = new Error("retired cleanup failed");
    const finalFailure = new Error("final cleanup failed");
    const first = new FakeBackend();
    first.destroyFailure = retiredFailure;
    const replacement = new FakeBackend();
    replacement.destroyFailure = finalFailure;
    const renderer = createSceneRenderer(
      dependencies(),
      backendQueue([first, replacement]),
    );
    const { sink, statuses } = sinkHarness();
    await renderer.init({} as HTMLElement, sink);
    renderer.update(inputFor());

    expect(() => first.events?.onContextLost()).not.toThrow();
    await flushMicrotasks();
    expect(replacement.updateCalls).toHaveLength(1);
    expect(statuses.at(-1)?.status).toBe("ready");

    expect(() => renderer.destroy()).not.toThrow();
    expect(replacement.destroyCount).toBe(1);
    expect(statuses.at(-1)).toEqual({
      status: "destroyed",
      error: finalFailure,
    });
  });
});

describe("scene renderer export port", () => {
  it("freezes provenance from the input that produced the scene", async () => {
    const backend = new FakeBackend();
    const renderer = createSceneRenderer(dependencies(), backendQueue([backend]));
    const { sink } = sinkHarness();
    const projectId = uuid(20);
    await renderer.init({} as HTMLElement, sink);

    renderer.update(inputFor({
      ...baseSnapshot,
      sequence: 17,
      project: { ...baseSnapshot.project, id: projectId },
    }));
    const capture = renderer.exportPort.capture();

    expect(capture.provenance).toEqual({
      projectId,
      snapshotSequence: 17,
      activeFloorId: floor.id,
    });
    expect(Object.isFrozen(capture.provenance)).toBe(true);

    renderer.update(inputFor({
      ...baseSnapshot,
      sequence: 18,
      project: { ...baseSnapshot.project, id: projectId },
    }));
    expect(capture.provenance.snapshotSequence).toBe(17);
  });

  it("rejects capture before the renderer is ready", () => {
    const renderer = createSceneRenderer(dependencies(), backendQueue([new FakeBackend()]));

    expect(() => renderer.exportPort.capture()).toThrow("Scene renderer is not ready");
  });

  it("captures immutable scene/camera/limits, waits exact textures, and returns bottom-left RGBA", async () => {
    const backend = new FakeBackend();
    const renderer = createSceneRenderer(dependencies(), backendQueue([backend]));
    const { sink } = sinkHarness();
    await renderer.init({} as HTMLElement, sink);
    const textured = texturedSnapshot();
    const sourceCamera = camera(8);
    renderer.update(inputFor(textured.snapshot, { camera: sourceCamera }));

    const capture = renderer.exportPort.capture();
    expect(Object.isFrozen(capture)).toBe(true);
    expect(Object.isFrozen(capture.camera)).toBe(true);
    expect(Object.isFrozen(capture.camera.position)).toBe(true);
    expect(Object.isFrozen(capture.scene)).toBe(true);
    expect(Object.isFrozen(capture.requiredTextureAssetIds)).toBe(true);
    expect(Object.isFrozen(capture.limits)).toBe(true);
    expect(capture.requiredTextureAssetIds).toEqual([textured.assetId]);
    expect(capture.limits).toEqual(backend.limits);

    (backend.limits as { maxTextureSize: number }).maxTextureSize = 4_096;
    expect(capture.limits.maxTextureSize).toBe(8_192);

    (sourceCamera.position as { x: number }).x = 99;
    expect(capture.camera.position.x).toBe(8);

    await renderer.exportPort.waitForTextures(capture);
    expect(backend.waitCalls).toEqual([[textured.assetId]]);

    const request = { width: 320, height: 180 };
    const frame = await renderer.exportPort.render(capture, request);
    expect(backend.renderCalls).toEqual([{
      projection: capture.scene,
      camera: capture.camera,
      request,
    }]);
    expect(frame).toEqual({
      width: 320,
      height: 180,
      origin: "bottom-left",
      rgba: backend.renderResult,
    });
  });

  it("invalidates a capture when its backend generation is replaced during texture wait", async () => {
    const waitGate = new Deferred<void>();
    const first = new FakeBackend();
    first.waitImpl = () => waitGate.promise;
    const replacement = new FakeBackend();
    const renderer = createSceneRenderer(
      dependencies(),
      backendQueue([first, replacement]),
    );
    const { sink } = sinkHarness();
    await renderer.init({} as HTMLElement, sink);
    const textured = texturedSnapshot();
    renderer.update(inputFor(textured.snapshot));
    const capture = renderer.exportPort.capture();

    const pendingWait = renderer.exportPort.waitForTextures(capture);
    const waitAssertion = expect(pendingWait).rejects.toThrow("capture expired");
    expect(first.waitCalls).toEqual([[textured.assetId]]);
    first.events?.onContextLost();
    await flushMicrotasks();
    waitGate.reject(new Error("retired backend"));
    await waitAssertion;
    await expect(renderer.exportPort.render(
      capture,
      { width: 16, height: 16 },
    )).rejects.toThrow("capture expired");
    expect(replacement.waitCalls).toEqual([]);
    expect(replacement.renderCalls).toEqual([]);
  });

  it("rejects old captures after context loss, retry, backend replacement, and destroy", async () => {
    const first = new FakeBackend();
    const replacement = new FakeBackend();
    const retry = new FakeBackend();
    const renderer = createSceneRenderer(
      dependencies(),
      backendQueue([first, replacement, retry]),
    );
    const { sink } = sinkHarness();
    await renderer.init({} as HTMLElement, sink);
    renderer.update(inputFor());

    const beforeContextLoss = renderer.exportPort.capture();
    first.events?.onContextLost();
    await flushMicrotasks();
    await expect(renderer.exportPort.render(
      beforeContextLoss,
      { width: 16, height: 16 },
    )).rejects.toThrow("capture expired");

    const beforeRetry = renderer.exportPort.capture();
    await renderer.retry();
    await expect(renderer.exportPort.render(
      beforeRetry,
      { width: 16, height: 16 },
    )).rejects.toThrow("capture expired");

    const beforeDestroy = renderer.exportPort.capture();
    renderer.destroy();
    await expect(renderer.exportPort.render(
      beforeDestroy,
      { width: 16, height: 16 },
    )).rejects.toThrow("capture expired");
  });
});
