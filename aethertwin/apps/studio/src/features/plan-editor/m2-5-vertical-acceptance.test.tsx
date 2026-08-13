// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProjectExportBackend } from "@aethertwin/exporter";
import type {
  SceneExportCapture,
  SceneExportFrame,
  SceneProjection,
} from "@aethertwin/render-scene-3d";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderPlanEditorFixture } from "./plan-editor.test-support";
import { deferred, FakeSceneRenderer } from "./scene-canvas.test-support";

class AcceptanceResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

beforeEach(() => vi.stubGlobal("ResizeObserver", AcceptanceResizeObserver));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const emptyScene: SceneProjection = Object.freeze({
  records: Object.freeze([]),
  bounds: null,
  requiredTextureAssetIds: Object.freeze([]),
  environment: null,
  issues: Object.freeze([]),
});

function frameGate(): {
  readonly promise: Promise<SceneExportFrame>;
  resolve(value: SceneExportFrame): void;
} {
  let resolve!: (value: SceneExportFrame) => void;
  const promise = new Promise<SceneExportFrame>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("M2.5 Studio vertical acceptance", () => {
  it("keeps Showroom modes, 16:9 export, capability policy, progress, focus, and replacement cancellation coherent", async () => {
    const user = userEvent.setup();
    const renderer = new FakeSceneRenderer();
    const renderGate = frameGate();
    const cancelGate = deferred();
    const captureRef: { current?: SceneExportCapture } = {};
    vi.spyOn(renderer.exportPort, "capture").mockImplementation(() => captureRef.current!);
    vi.spyOn(renderer.exportPort, "waitForTextures").mockResolvedValue(undefined);
    const render = vi.spyOn(renderer.exportPort, "render")
      .mockImplementation(async () => renderGate.promise);
    const backend: ProjectExportBackend = {
      begin: vi.fn(async () => ({
        exportId: "e2500000-0000-4000-8000-000000009101",
        preset: "full-hd",
        width: 1920,
        height: 1080,
        expectedByteLength: 8_294_400,
        maxChunkBytes: 1_048_576,
      } as const)),
      writeChunk: vi.fn(async () => undefined),
      finish: vi.fn(async () => ({
        preset: "full-hd",
        width: 1920,
        height: 1080,
        relativePath: "exports/showroom-full-hd.png",
        byteSize: 4096,
        sha256: "a".repeat(64),
      } as const)),
      cancel: vi.fn(() => cancelGate.promise),
    };
    const fixture = renderPlanEditorFixture({
      profile: "showroom",
      sceneRendererFactory: () => renderer,
      exportBackend: backend,
    });
    captureRef.current = Object.freeze({
      scene: emptyScene,
      camera: Object.freeze({
        position: Object.freeze({ x: 4, y: 8, z: 12 }),
        target: Object.freeze({ x: 0, y: 0, z: 0 }),
        fieldOfView: 45,
      }),
      provenance: Object.freeze({
        projectId: fixture.snapshot.project.id,
        snapshotSequence: fixture.snapshot.sequence,
        activeFloorId: fixture.floorA.id,
      }),
      requiredTextureAssetIds: Object.freeze([]),
      limits: Object.freeze({
        maxTextureSize: 2048,
        maxRenderbufferSize: 2048,
        maxSamples: 4,
      }),
    });

    const twoD = screen.getByRole("button", { name: "2D" });
    const threeD = screen.getByRole("button", { name: "3D" });
    const split = screen.getByRole("button", { name: "Split" });
    expect(twoD).toHaveAttribute("aria-pressed", "true");
    await user.click(split);
    await waitFor(() => expect(renderer.initCount).toBe(1));
    act(() => renderer.emitStatus("ready"));
    expect(fixture.sessionStore.getState().viewMode).toBe("split");
    expect(split).toHaveAttribute("aria-pressed", "true");
    await user.click(threeD);
    expect(fixture.sessionStore.getState().viewMode).toBe("3d");

    const exportButton = screen.getByRole("button", { name: "Export" });
    await waitFor(() => expect(exportButton).toBeEnabled());
    await user.click(exportButton);
    const panel = screen.getByRole("complementary", { name: "Export PNG" });
    const options = within(panel).getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveValue("full-hd");
    expect(options[1]).toHaveValue("ultra-hd");
    expect(options[1]).toBeDisabled();
    expect(document.querySelector(".studio-scene-viewport"))
      .toHaveClass("studio-scene-viewport--export");

    await user.click(within(panel).getByRole("button", { name: "Export PNG" }));
    await waitFor(() => expect(render).toHaveBeenCalledWith(captureRef.current, {
      preset: "full-hd",
      width: 1920,
      height: 1080,
    }));
    expect(within(panel).getByRole("status")).toHaveTextContent("Rendering");
    expect(document.querySelector(".studio-scene-input-lock")).toBeInTheDocument();
    expect(twoD).toBeDisabled();
    expect(threeD).toBeDisabled();
    expect(split).toBeDisabled();

    const generation = fixture.sessionStore.getState().sessionGeneration;
    act(() => fixture.replaceProject());
    await waitFor(() => expect(backend.cancel).toHaveBeenCalledOnce());
    expect(fixture.sessionStore.getState().sessionGeneration).toBe(generation);
    expect(panel).toBeVisible();
    cancelGate.resolve();
    await waitFor(() => {
      expect(fixture.sessionStore.getState().sessionGeneration).toBe(generation + 1);
    });
    expect(screen.queryByRole("complementary", { name: "Export PNG" }))
      .not.toBeInTheDocument();
    expect(document.activeElement).not.toHaveAccessibleName("Export");
    renderGate.resolve({
      width: 1920,
      height: 1080,
      origin: "bottom-left",
      rgba: new Uint8Array(8_294_400),
    });
  });

  it("keeps Market purely 2D without preview or export entry points", () => {
    renderPlanEditorFixture({ profile: "market" });
    for (const label of ["2D", "3D", "Split", "Frame Selection", "Frame Route", "Export"]) {
      expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    }
  });
});
