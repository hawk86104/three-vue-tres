import { projectScene } from "./scene-projection";
import { createR3FSceneBackend } from "./r3f-backend";
import type {
  SceneCameraState,
  SceneExportCapture,
  SceneExportFrame,
  SceneExportProvenance,
  SceneExportRenderRequest,
  SceneFrameTarget,
  SceneGpuLimits,
  SceneProjection,
  SceneRenderer,
  SceneRendererDependencies,
  SceneRendererEventSink,
  SceneRendererInput,
  SceneRendererStatus,
} from "./types";

export interface SceneRendererBackendEvents {
  onSelectionChange(selectedIds: ReadonlySet<string>): void;
  onCameraChange(camera: SceneCameraState): void;
  onContextLost(): void;
}

export interface SceneRendererBackend {
  init(host: HTMLElement, events: SceneRendererBackendEvents): Promise<void>;
  update(projection: SceneProjection, camera: SceneCameraState): void;
  resize(width: number, height: number, devicePixelRatio: number): void;
  frame(target: SceneFrameTarget): void;
  getLimits(): SceneGpuLimits;
  waitForTextures(assetIds: readonly string[]): Promise<void>;
  renderOffscreen(
    projection: SceneProjection,
    camera: SceneCameraState,
    request: SceneExportRenderRequest,
  ): Promise<Uint8Array>;
  destroy(): void;
}

export type SceneRendererBackendFactory = (
  dependencies: SceneRendererDependencies,
) => SceneRendererBackend;

interface RendererSize {
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio: number;
}

function freezeCamera(camera: SceneCameraState): SceneCameraState {
  return Object.freeze({
    position: Object.freeze({ ...camera.position }),
    target: Object.freeze({ ...camera.target }),
    fieldOfView: camera.fieldOfView,
  });
}

function freezeLimits(limits: SceneGpuLimits): SceneGpuLimits {
  return Object.freeze({ ...limits });
}

function freezeProvenance(input: SceneRendererInput): SceneExportProvenance {
  return Object.freeze({
    projectId: input.snapshot.project.id,
    snapshotSequence: input.snapshot.sequence,
    activeFloorId: input.activeFloorId,
  });
}

function rendererUnavailable(): Error {
  return new Error("Scene renderer is not ready");
}

class DefaultSceneRenderer implements SceneRenderer {
  readonly exportPort = {
    capture: (): SceneExportCapture => this.capture(),
    waitForTextures: (capture: SceneExportCapture): Promise<void> => (
      this.waitForTextures(capture)
    ),
    render: (
      capture: SceneExportCapture,
      request: SceneExportRenderRequest,
    ): Promise<SceneExportFrame> => this.renderExport(capture, request),
  };

  private host: HTMLElement | null = null;
  private sink: SceneRendererEventSink | null = null;
  private backend: SceneRendererBackend | null = null;
  private backendReady = false;
  private backendGeneration = 0;
  private autoRecoveryUsed = false;
  private destroyed = false;
  private currentProjection: SceneProjection | null = null;
  private currentCamera: SceneCameraState | null = null;
  private currentInput: SceneRendererInput | null = null;
  private size: RendererSize | null = null;
  private readonly retiredBackends = new WeakSet<object>();
  private readonly captureGenerations = new WeakMap<SceneExportCapture, number>();

  constructor(
    private readonly dependencies: SceneRendererDependencies,
    private readonly backendFactory: SceneRendererBackendFactory,
  ) {}

  async init(host: HTMLElement, sink: SceneRendererEventSink): Promise<void> {
    if (this.destroyed) throw new Error("Scene renderer is destroyed");
    if (this.host !== null) throw new Error("Scene renderer is already initialized");
    this.host = host;
    this.sink = sink;
    this.autoRecoveryUsed = false;
    await this.activateBackend("initializing", "failed");
  }

  update(input: SceneRendererInput): void {
    if (this.destroyed) return;
    const projection = projectScene(input);
    const nextCamera = freezeCamera(input.camera);
    this.currentInput = input;
    this.currentProjection = projection;
    this.currentCamera = nextCamera;
    if (this.backendReady && this.backend !== null) {
      this.backend.update(projection, nextCamera);
    }
  }

  resize(width: number, height: number, devicePixelRatio: number): void {
    if (this.destroyed) return;
    this.size = { width, height, devicePixelRatio };
    if (this.backendReady && this.backend !== null) {
      this.backend.resize(width, height, devicePixelRatio);
    }
  }

  frame(target: SceneFrameTarget): void {
    if (!this.backendReady || this.backend === null || this.destroyed) return;
    this.backend.frame(target);
  }

  async retry(): Promise<void> {
    if (this.destroyed) return;
    if (this.host === null || this.sink === null) {
      throw new Error("Scene renderer has not been initialized");
    }
    this.autoRecoveryUsed = false;
    this.retireActiveBackend();
    await this.activateBackend("initializing", "failed");
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.backendGeneration += 1;
    this.backendReady = false;
    const cleanupError = this.retireActiveBackend();
    this.currentInput = null;
    this.currentProjection = null;
    this.currentCamera = null;
    this.notifyStatus("destroyed", cleanupError);
  }

  private async activateBackend(
    pendingStatus: "initializing" | "recovering",
    failureStatus: "failed" | "disabled",
  ): Promise<void> {
    const host = this.host;
    if (host === null) throw new Error("Scene renderer has not been initialized");
    const backend = this.backendFactory(this.dependencies);
    const generation = this.backendGeneration + 1;
    this.backendGeneration = generation;
    this.backend = backend;
    this.backendReady = false;
    this.notifyStatus(pendingStatus, null);

    const events: SceneRendererBackendEvents = {
      onSelectionChange: (selectedIds) => {
        if (!this.isCurrentBackend(backend, generation)) return;
        this.sink?.onSelectionChange(new Set(selectedIds));
      },
      onCameraChange: (camera) => {
        if (!this.isCurrentBackend(backend, generation)) return;
        const nextCamera = freezeCamera(camera);
        this.currentCamera = nextCamera;
        this.sink?.onCameraChange(nextCamera);
      },
      onContextLost: () => {
        if (!this.isCurrentBackend(backend, generation)) return;
        this.handleContextLost();
      },
    };

    try {
      await backend.init(host, events);
      if (!this.isCurrentBackend(backend, generation)) {
        this.retireBackend(backend);
        return;
      }
      this.backendReady = true;
      if (this.currentProjection !== null && this.currentCamera !== null) {
        backend.update(this.currentProjection, this.currentCamera);
      }
      if (this.size !== null) {
        backend.resize(
          this.size.width,
          this.size.height,
          this.size.devicePixelRatio,
        );
      }
      this.notifyStatus("ready", null);
    } catch (error) {
      if (!this.isCurrentBackend(backend, generation)) {
        this.retireBackend(backend);
        return;
      }
      this.backend = null;
      this.backendReady = false;
      this.backendGeneration += 1;
      this.retireBackend(backend);
      const normalized = error instanceof Error
        ? error
        : new Error("Scene renderer initialization failed");
      this.notifyStatus(failureStatus, normalized);
      throw error;
    }
  }

  private handleContextLost(): void {
    this.retireActiveBackend();
    if (this.autoRecoveryUsed) {
      this.notifyStatus("disabled", new Error("WebGL context recovery failed"));
      return;
    }
    this.autoRecoveryUsed = true;
    void this.activateBackend("recovering", "disabled").catch(() => undefined);
  }

  private isCurrentBackend(
    backend: SceneRendererBackend,
    generation: number,
  ): boolean {
    return !this.destroyed
      && this.backend === backend
      && this.backendGeneration === generation;
  }

  private retireActiveBackend(): Error | null {
    const backend = this.backend;
    this.backend = null;
    this.backendReady = false;
    this.backendGeneration += 1;
    if (backend === null) return null;
    return this.retireBackend(backend);
  }

  private retireBackend(backend: SceneRendererBackend): Error | null {
    if (this.retiredBackends.has(backend)) return null;
    this.retiredBackends.add(backend);
    try {
      backend.destroy();
      return null;
    } catch (error) {
      return error instanceof Error
        ? error
        : new Error("Scene renderer backend cleanup failed", {
            cause: error,
          });
    }
  }

  private notifyStatus(status: SceneRendererStatus, error: Error | null): void {
    this.sink?.onStatusChange(status, error);
  }

  private requireReadyBackend(): SceneRendererBackend {
    if (!this.backendReady || this.backend === null || this.destroyed) {
      throw rendererUnavailable();
    }
    return this.backend;
  }

  private capture(): SceneExportCapture {
    const backend = this.requireReadyBackend();
    if (this.currentProjection === null || this.currentCamera === null || this.currentInput === null) {
      throw new Error("Scene renderer has no scene to capture");
    }
    const capture = Object.freeze({
      scene: this.currentProjection,
      camera: freezeCamera(this.currentCamera),
      provenance: freezeProvenance(this.currentInput),
      requiredTextureAssetIds: Object.freeze([
        ...this.currentProjection.requiredTextureAssetIds,
      ]),
      limits: freezeLimits(backend.getLimits()),
    });
    this.captureGenerations.set(capture, this.backendGeneration);
    return capture;
  }

  private requireCaptureBackend(capture: SceneExportCapture): {
    readonly backend: SceneRendererBackend;
    readonly generation: number;
  } {
    const generation = this.captureGenerations.get(capture);
    if (generation === undefined || generation !== this.backendGeneration) {
      throw new Error("Scene export capture expired");
    }
    return { backend: this.requireReadyBackend(), generation };
  }

  private assertCaptureCurrent(
    capture: SceneExportCapture,
    backend: SceneRendererBackend,
    generation: number,
  ): void {
    if (
      this.destroyed
      || !this.backendReady
      || this.backend !== backend
      || this.backendGeneration !== generation
      || this.captureGenerations.get(capture) !== generation
    ) {
      throw new Error("Scene export capture expired");
    }
  }

  private async waitForTextures(capture: SceneExportCapture): Promise<void> {
    const { backend, generation } = this.requireCaptureBackend(capture);
    try {
      await backend.waitForTextures(capture.requiredTextureAssetIds);
    } catch (error) {
      this.assertCaptureCurrent(capture, backend, generation);
      throw error;
    }
    this.assertCaptureCurrent(capture, backend, generation);
  }

  private async renderExport(
    capture: SceneExportCapture,
    request: SceneExportRenderRequest,
  ): Promise<SceneExportFrame> {
    const { backend, generation } = this.requireCaptureBackend(capture);
    let rgba: Uint8Array;
    try {
      rgba = await backend.renderOffscreen(
        capture.scene,
        capture.camera,
        request,
      );
    } catch (error) {
      this.assertCaptureCurrent(capture, backend, generation);
      throw error;
    }
    this.assertCaptureCurrent(capture, backend, generation);
    return Object.freeze({
      width: request.width,
      height: request.height,
      origin: "bottom-left" as const,
      rgba,
    });
  }
}

export function createSceneRenderer(
  dependencies: SceneRendererDependencies,
  backendFactory: SceneRendererBackendFactory = createR3FSceneBackend,
): SceneRenderer {
  return new DefaultSceneRenderer(dependencies, backendFactory);
}
