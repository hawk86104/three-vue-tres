import { describe, expect, it } from "vitest";
import {
  renderSceneOffscreen,
  SceneOffscreenQueue,
  type SceneOffscreenDriver,
} from "./offscreen-render";
import type {
  SceneCameraState,
  SceneProjection,
} from "./types";

interface FakeState {
  readonly target: string;
  readonly viewport: readonly number[];
}

interface FakeTarget {
  readonly id: string;
}

interface FakeRenderable {
  readonly id: string;
}

function projection(): SceneProjection {
  return {
    records: [],
    bounds: null,
    requiredTextureAssetIds: [],
    environment: null,

    issues: [],
  };
}

class Deferred<T> {
  readonly promise: Promise<T>;
  private resolvePromise!: (value: T) => void;

  constructor() {
    this.promise = new Promise<T>((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  resolve(value: T): void {
    this.resolvePromise(value);
  }
}

const camera: SceneCameraState = {
  position: { x: 4, y: 5, z: 6 },
  target: { x: 0, y: 0, z: 0 },
  fieldOfView: 45,
};

function driverHarness(options: {
  readonly rejectRead?: Error;
  readonly readGate?: Promise<void>;
  readonly rejectRestore?: Error;
} = {}) {
  const events: string[] = [];
  const visibleState: FakeState = { target: "visible", viewport: [0, 0, 900, 600] };
  const target: FakeTarget = { id: "offscreen-target" };
  const renderable: FakeRenderable = { id: "captured-scene" };
  const driver: SceneOffscreenDriver<FakeState, FakeTarget, FakeRenderable> = {
    captureVisibleState() {
      events.push("capture-state");
      return visibleState;
    },
    createRenderable(scene, cameraState, width, height) {
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
      expect(scene).toBeDefined();
      expect(cameraState).toEqual(camera);
      events.push("create-renderable");
      return renderable;
    },
    createRenderTarget(width, height) {
      events.push(`create-target:${width}x${height}`);
      return target;
    },
    bindRenderTarget(nextTarget, width, height) {
      expect(nextTarget).toBe(target);
      events.push(`bind-target:${width}x${height}`);
    },
    render(nextRenderable) {
      expect(nextRenderable).toBe(renderable);
      events.push("render");
    },
    async readRgba(nextTarget, width, height, rgba) {
      expect(nextTarget).toBe(target);
      expect(rgba).toHaveLength(width * height * 4);
      events.push("read");
      if (options.rejectRead !== undefined) throw options.rejectRead;
      await options.readGate;
      rgba.set([1, 2, 3, 4]);
    },
    restoreVisibleState(state) {
      expect(state).toBe(visibleState);
      events.push("restore-state");
      if (options.rejectRestore !== undefined) throw options.rejectRestore;
    },
    disposeRenderTarget(nextTarget) {
      expect(nextTarget).toBe(target);
      events.push("dispose-target");
    },
    disposeRenderable(nextRenderable) {
      expect(nextRenderable).toBe(renderable);
      events.push("dispose-renderable");
    },
  };
  return { driver, events };
}

describe("offscreen scene rendering", () => {
  it("reads unflipped RGBA asynchronously, restores visible state, and releases temporary owners", async () => {
    const { driver, events } = driverHarness();
    const rgba = await renderSceneOffscreen(
      driver,
      projection(),
      camera,
      { width: 2, height: 1 },
    );

    expect([...rgba]).toEqual([1, 2, 3, 4, 0, 0, 0, 0]);
    expect(events).toEqual([
      "capture-state",
      "create-renderable",
      "create-target:2x1",
      "bind-target:2x1",
      "render",
      "read",
      "restore-state",
      "dispose-target",
      "dispose-renderable",
    ]);
  });

  it("still restores visible state and disposes both temporary owners when readback fails", async () => {
    const failure = new Error("readback failed");
    const { driver, events } = driverHarness({ rejectRead: failure });

    await expect(renderSceneOffscreen(
      driver,
      projection(),
      camera,
      { width: 1, height: 1 },
    )).rejects.toBe(failure);

    expect(events.slice(-3)).toEqual([
      "restore-state",
      "dispose-target",
      "dispose-renderable",
    ]);
  });

  it("restores the visible renderer before asynchronous readback settles", async () => {
    const readGate = new Deferred<void>();
    const { driver, events } = driverHarness({ readGate: readGate.promise });

    const pending = renderSceneOffscreen(
      driver,
      projection(),
      camera,
      { width: 1, height: 1 },
    );
    await Promise.resolve();

    expect(events).toContain("read");
    expect(events).toContain("restore-state");
    expect(events).not.toContain("dispose-target");
    expect(events).not.toContain("dispose-renderable");
    expect(events.filter((event) => event === "restore-state")).toHaveLength(1);

    readGate.resolve(undefined);
    await pending;
    expect(events.slice(-2)).toEqual([
      "dispose-target",
      "dispose-renderable",
    ]);
    expect(events.filter((event) => event === "restore-state")).toHaveLength(1);
    expect(events.filter((event) => event === "dispose-target")).toHaveLength(1);
    expect(events.filter((event) => event === "dispose-renderable")).toHaveLength(1);
  });

  it("serializes concurrent offscreen jobs even when the first readback is pending", async () => {
    const queue = new SceneOffscreenQueue();
    const firstGate = new Deferred<void>();
    const events: string[] = [];
    const first = queue.run(async () => {
      events.push("first-start");
      await firstGate.promise;
      events.push("first-end");
      return 1;
    });
    const second = queue.run(async () => {
      events.push("second-start");
      events.push("second-end");
      return 2;
    });

    await Promise.resolve();
    expect(events).toEqual(["first-start"]);
    firstGate.resolve(undefined);
    await expect(first).resolves.toBe(1);
    await expect(second).resolves.toBe(2);
    expect(events).toEqual([
      "first-start",
      "first-end",
      "second-start",
      "second-end",
    ]);
  });

  it("prefers the readback operation error over a visible-state cleanup error", async () => {
    const readFailure = new Error("read failed");
    const restoreFailure = new Error("restore failed");
    const { driver, events } = driverHarness({
      rejectRead: readFailure,
      rejectRestore: restoreFailure,
    });

    await expect(renderSceneOffscreen(
      driver,
      projection(),
      camera,
      { width: 1, height: 1 },
    )).rejects.toBe(readFailure);

    expect(events).toContain("restore-state");
    expect(events).toContain("dispose-target");
    expect(events).toContain("dispose-renderable");
  });
});
