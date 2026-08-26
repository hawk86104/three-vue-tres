// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { R3FSceneSurface } from "./r3f-backend";
import type { SceneRendererDependencies } from "./types";

const domRoot = vi.hoisted(() => ({
  render: vi.fn(),
  unmount: vi.fn(),
}));

vi.mock("react-dom/client", () => ({
  createRoot: vi.fn(() => domRoot),
}));

const dependencies: SceneRendererDependencies = {
  assetSource: {
    async resolve(assetId) {
      return { assetId, url: `asset://localhost/${assetId}`, mediaType: "image/png" };
    },
  },
  issueReporter: {
    report() {},
    clear() {},
  },
};

describe("R3F nested React root lifecycle", () => {
  it("requests the supported percentage shadow mode from R3F Canvas", async () => {
    domRoot.render.mockClear();
    domRoot.unmount.mockClear();
    const surface = new R3FSceneSurface(dependencies);
    const initialization = surface.init(document.createElement("div"), {
      onSelectionChange() {},
      onCameraChange() {},
      onContextLost() {},
    }).catch((error: unknown) => error);
    const rendered = domRoot.render.mock.lastCall?.[0] as {
      readonly props: { readonly children: { readonly props: { readonly shadows: unknown } } };
    };

    expect(rendered.props.children.props.shadows).toBe("percentage");
    surface.destroy();
    await Promise.resolve();
    await expect(initialization).resolves.toEqual(expect.any(Error));
  });

  it("uses the supported PCF shadow map for the live renderer", () => {
    const surface = new R3FSceneSurface(dependencies);
    const renderer = {
      domElement: document.createElement("canvas"),
      getContext: vi.fn(),
      outputColorSpace: "",
      readRenderTargetPixelsAsync: vi.fn(),
      shadowMap: { enabled: false, type: -1 },
      toneMapping: -1,
    };

    surface.handleCreated({ gl: renderer, invalidate: vi.fn() } as never);

    expect(renderer.shadowMap).toEqual({ enabled: true, type: 1 });
  });

  it("rejects initialization when the WebGL renderer factory fails", async () => {
    const failure = new Error("WebGL unavailable");
    const surface = new R3FSceneSurface(
      dependencies,
      undefined,
      () => {
        throw failure;
      },
    );
    const initialization = surface.init(document.createElement("div"), {
      onSelectionChange() {},
      onCameraChange() {},
      onContextLost() {},
    }).catch((error: unknown) => error);
    const rendered = domRoot.render.mock.lastCall?.[0] as {
      readonly props: {
        readonly children: {
          readonly props: {
            readonly gl: (parameters: {
              readonly canvas: HTMLCanvasElement;
              readonly antialias: boolean;
              readonly alpha: boolean;
              readonly powerPreference: string;
            }) => unknown;
          };
        };
      };
    };

    try {
      expect(typeof rendered.props.children.props.gl).toBe("function");
      expect(() => rendered.props.children.props.gl({
        canvas: document.createElement("canvas"),
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      })).toThrow(failure);
      await expect(initialization).resolves.toBe(failure);
    } finally {
      surface.destroy();
      await initialization;
    }
  });

  it("defers nested root unmount until the parent cleanup commit completes", async () => {
    domRoot.render.mockClear();
    domRoot.unmount.mockClear();
    const surface = new R3FSceneSurface(dependencies);
    const initialization = surface.init(document.createElement("div"), {
      onSelectionChange() {},
      onCameraChange() {},
      onContextLost() {},
    }).catch((error: unknown) => error);

    surface.destroy();

    expect(domRoot.unmount).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(domRoot.unmount).toHaveBeenCalledOnce();
    await expect(initialization).resolves.toEqual(expect.any(Error));
  });
});
