import type {
  SceneCameraState,
  SceneExportRenderRequest,
  SceneProjection,
} from "./types";

export interface SceneOffscreenDriver<State, Target, Renderable> {
  captureVisibleState(): State;
  createRenderable(
    projection: SceneProjection,
    camera: SceneCameraState,
    width: number,
    height: number,
  ): Renderable;
  createRenderTarget(width: number, height: number): Target;
  bindRenderTarget(target: Target, width: number, height: number): void;
  render(renderable: Renderable): void;
  readRgba(
    target: Target,
    width: number,
    height: number,
    rgba: Uint8Array,
  ): Promise<void>;
  restoreVisibleState(state: State): void;
  disposeRenderTarget(target: Target): void;
  disposeRenderable(renderable: Renderable): void;
}

export class SceneOffscreenQueue {
  private tail: Promise<void> = Promise.resolve();

  run<T>(job: () => Promise<T>): Promise<T> {
    const pending = this.tail.then(job, job);
    this.tail = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }
}

function validateRequest(request: SceneExportRenderRequest): number {
  if (
    !Number.isSafeInteger(request.width)
    || !Number.isSafeInteger(request.height)
    || request.width <= 0
    || request.height <= 0
  ) {
    throw new Error("Offscreen render dimensions must be positive safe integers");
  }
  const byteLength = request.width * request.height * 4;
  if (!Number.isSafeInteger(byteLength)) {
    throw new Error("Offscreen render dimensions exceed safe RGBA bounds");
  }
  return byteLength;
}

export async function renderSceneOffscreen<State, Target, Renderable>(
  driver: SceneOffscreenDriver<State, Target, Renderable>,
  projection: SceneProjection,
  camera: SceneCameraState,
  request: SceneExportRenderRequest,
): Promise<Uint8Array> {
  const byteLength = validateRequest(request);
  const visibleState = driver.captureVisibleState();
  let renderable: Renderable | undefined;
  let target: Target | undefined;
  let rgba: Uint8Array | undefined;
  let operationFailure: unknown;
  let cleanupFailure: unknown;
  let visibleStateRestored = false;

  try {
    renderable = driver.createRenderable(
      projection,
      camera,
      request.width,
      request.height,
    );
    target = driver.createRenderTarget(request.width, request.height);
    driver.bindRenderTarget(target, request.width, request.height);
    driver.render(renderable);
    rgba = new Uint8Array(byteLength);
    const readback = driver.readRgba(
      target,
      request.width,
      request.height,
      rgba,
    );
    try {
      driver.restoreVisibleState(visibleState);
      visibleStateRestored = true;
    } catch (error) {
      cleanupFailure = error;
    }
    try {
      await readback;
    } catch (error) {
      operationFailure = error;
    }
  } catch (error) {
    operationFailure = error;
  } finally {
    const cleanups: Array<() => void> = [];
    if (!visibleStateRestored) {
      cleanups.push(() => driver.restoreVisibleState(visibleState));
    }
    if (target !== undefined) {
      cleanups.push(() => driver.disposeRenderTarget(target!));
    }
    if (renderable !== undefined) {
      cleanups.push(() => driver.disposeRenderable(renderable!));
    }
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch (error) {
        if (cleanupFailure === undefined) cleanupFailure = error;
      }
    }
  }

  if (operationFailure !== undefined) throw operationFailure;
  if (cleanupFailure !== undefined) throw cleanupFailure;
  if (rgba === undefined) throw new Error("Offscreen RGBA readback did not complete");
  return rgba;
}
