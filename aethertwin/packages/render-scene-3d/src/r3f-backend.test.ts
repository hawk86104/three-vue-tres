import { PerspectiveCamera, Scene, Texture } from "three";
import { describe, expect, it } from "vitest";
import {
  disposeOffscreenRenderable,
  R3FSceneSurface,
} from "./r3f-backend";
import type {
  SceneDisposableResource,
  SceneRecordBinding,
} from "./scene-reconciler";
import type { SceneTextureLoader } from "./three-resources";
import type { SceneAssetSource, SceneRendererDependencies } from "./types";

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

function source(assetId: string): SceneAssetSource {
  return {
    assetId,
    url: `asset://localhost/${assetId}`,
    mediaType: "image/png",
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("R3F offscreen resource cleanup", () => {
  it("attempts every temporary owner when an earlier disposer fails", () => {
    const events: string[] = [];
    const failure = new Error("detach failed");
    const binding = {
      attach() {},
      update() {},
      detach() {
        events.push("detach");
        throw failure;
      },
      dispose() {
        events.push("dispose-binding");
      },
    } satisfies SceneRecordBinding;
    const geometry = {
      dispose() {
        events.push("dispose-geometry");
        throw new Error("geometry failed");
      },
    } satisfies SceneDisposableResource;
    const material = {
      dispose() {
        events.push("dispose-material");
      },
    } satisfies SceneDisposableResource;
    const shadowOwner = {
      dispose() {
        events.push("dispose-shadow");
      },
    };

    expect(() => disposeOffscreenRenderable({
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      bindings: [binding],
      geometries: [geometry],
      materials: [material],
      shadowOwners: [shadowOwner],
    })).toThrow(failure);

    expect(events).toEqual([
      "detach",
      "dispose-binding",
      "dispose-geometry",
      "dispose-material",
      "dispose-shadow",
    ]);
  });

  it("disposes a late decoded texture silently after the surface retires", async () => {
    const decoded = new Deferred<Texture>();
    const loaderCalls: string[] = [];
    const issueEvents: string[] = [];
    const loader: SceneTextureLoader = {
      loadAsync(url) {
        loaderCalls.push(url);
        return decoded.promise;
      },
    };
    const dependencies: SceneRendererDependencies = {
      assetSource: {
        async resolve(assetId) {
          return source(assetId);
        },
      },
      issueReporter: {
        report(issue) {
          issueEvents.push(`report:${issue.assetId}`);
        },
        clear(assetId) {
          issueEvents.push(`clear:${assetId}`);
        },
      },
    };
    const surface = new R3FSceneSurface(dependencies, loader);
    const pending = surface.waitForExportTextures(["asset-b", "asset-b"]);
    await flushMicrotasks();
    expect(loaderCalls).toEqual(["asset://localhost/asset-b"]);

    surface.destroy();
    const texture = new Texture();
    let disposeCount = 0;
    texture.dispose = () => {
      disposeCount += 1;
    };
    decoded.resolve(texture);

    await expect(pending).rejects.toThrow("destroyed");
    expect(disposeCount).toBe(1);
    expect(issueEvents).toEqual([]);
  });

  it("disposes every cached texture and clears ownership when one disposer throws", async () => {
    const first = new Texture();
    const second = new Texture();
    const failure = new Error("first texture dispose failed");
    let firstDisposals = 0;
    let secondDisposals = 0;
    first.dispose = () => {
      firstDisposals += 1;
      throw failure;
    };
    second.dispose = () => {
      secondDisposals += 1;
    };
    const loader: SceneTextureLoader = {
      async loadAsync(url) {
        return url.endsWith("asset-a") ? first : second;
      },
    };
    const dependencies: SceneRendererDependencies = {
      assetSource: {
        async resolve(assetId) {
          return source(assetId);
        },
      },
      issueReporter: {
        report() {},
        clear() {},
      },
    };
    const surface = new R3FSceneSurface(dependencies, loader);
    await surface.waitForExportTextures(["asset-b", "asset-a"]);

    expect(() => surface.destroy()).toThrow(failure);
    expect(firstDisposals).toBe(1);
    expect(secondDisposals).toBe(1);
    expect(() => surface.destroy()).not.toThrow();
    expect(firstDisposals).toBe(1);
    expect(secondDisposals).toBe(1);
  });
});
