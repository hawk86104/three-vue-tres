import type {
  SceneCameraState,
  SceneExportPort,
  SceneFrameTarget,
  SceneRenderer,
  SceneRendererEventSink,
  SceneRendererInput,
  SceneRendererStatus,
} from "@aethertwin/render-scene-3d";

export class FakeSceneRenderer implements SceneRenderer {
  readonly updateInputs: SceneRendererInput[] = [];
  readonly resizeInputs: Array<readonly [number, number, number]> = [];
  readonly frameInputs: SceneFrameTarget[] = [];
  readonly exportPort: SceneExportPort = {
    capture: () => {
      throw new Error("FakeSceneRenderer export is not configured");
    },
    waitForTextures: async () => undefined,
    render: async () => {
      throw new Error("FakeSceneRenderer export is not configured");
    },
  };
  initCount = 0;
  retryCount = 0;
  destroyCount = 0;
  initResult: Promise<void> = Promise.resolve();
  host: HTMLElement | null = null;
  sink: SceneRendererEventSink | null = null;

  async init(host: HTMLElement, sink: SceneRendererEventSink): Promise<void> {
    this.initCount += 1;
    this.host = host;
    this.sink = sink;
    await this.initResult;
  }

  update(input: SceneRendererInput): void {
    this.updateInputs.push(input);
  }

  resize(width: number, height: number, devicePixelRatio: number): void {
    this.resizeInputs.push([width, height, devicePixelRatio]);
  }

  frame(target: SceneFrameTarget): void {
    this.frameInputs.push(target);
  }

  async retry(): Promise<void> {
    this.retryCount += 1;
  }

  destroy(): void {
    this.destroyCount += 1;
  }

  emitSelection(selectedIds: ReadonlySet<string>): void {
    this.requireSink().onSelectionChange(selectedIds);
  }

  emitCamera(camera: SceneCameraState): void {
    this.requireSink().onCameraChange(camera);
  }

  emitStatus(status: SceneRendererStatus, error: Error | null = null): void {
    this.requireSink().onStatusChange(status, error);
  }

  private requireSink(): SceneRendererEventSink {
    if (this.sink === null) throw new Error("Scene renderer has not initialized");
    return this.sink;
  }
}

export function deferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
} {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
