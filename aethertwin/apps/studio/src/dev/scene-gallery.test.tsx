// @vitest-environment jsdom
/// <reference types="vite/client" />

import "@testing-library/jest-dom/vitest";
import { DEFAULT_SCENE_ENVIRONMENT } from "@aethertwin/core-model";
import { SHOWROOM_FIXTURE_CATALOGUE } from "@aethertwin/mode-showroom";
import type { SceneRendererFactory } from "@aethertwin/render-scene-3d";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type AppProps } from "../app";
import { FakeSceneRenderer } from "../features/plan-editor/scene-canvas.test-support";

interface SceneGalleryAppProps extends AppProps {
  readonly sceneRendererFactory?: SceneRendererFactory;
}

const SceneGalleryApp = App as ComponentType<SceneGalleryAppProps>;

class FakeResizeObserver {
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    void callback;
  }
}

beforeEach(() => {
  vi.stubEnv("DEV", true);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal("devicePixelRatio", 1);
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  cleanup();
  vi.doUnmock("./scene-gallery");
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("development scene gallery", () => {
  it("routes only in development and publishes the complete offline showroom input", async () => {
    window.history.replaceState({}, "", "/dev/scene-gallery");
    const renderer = new FakeSceneRenderer();

    render(
      <SceneGalleryApp
        forceBackend="sandbox"
        sceneRendererFactory={() => renderer}
      />,
    );

    expect(await screen.findByRole("heading", {
      name: "AetherTwin 3D Scene Gallery",
    })).toBeVisible();
    await waitFor(() => expect(renderer.updateInputs).toHaveLength(1));

    const input = renderer.updateInputs[0]!;
    const { project, assets } = input.snapshot;
    const fixtures = project.entities.filter((entity) => entity.type === "fixture");
    const concaveFloor = project.entities.find(
      (entity) => entity.type === "space-unit" && entity.name === "Concave gallery floor",
    );
    const hotspot = project.entities.find(
      (entity) => entity.type === "poi" && entity.kind === "product-hotspot",
    );
    const texturedMaterial = project.materials.find(({ assetId }) => assetId !== null);

    expect(input.snapshot.schemaVersion).toBe(3);
    expect(project.profile).toBe("showroom");
    expect(input.activeFloorId).toBe(project.floors[0]?.id);
    expect(input.selectedIds.size).toBe(0);
    expect(project.sceneEnvironment).toEqual(DEFAULT_SCENE_ENVIRONMENT);
    expect(fixtures.map(({ kind }) => kind)).toEqual(
      SHOWROOM_FIXTURE_CATALOGUE.map(({ kind }) => kind),
    );
    expect(concaveFloor).toMatchObject({
      type: "space-unit",
      footprint: expect.arrayContaining([
        { x: 0, y: 0 },
        { x: 6_000, y: 4_000 },
        { x: 2_000, y: 2_000 },
      ]),
    });
    expect(concaveFloor?.type === "space-unit" ? concaveFloor.footprint : []).toHaveLength(6);
    expect(project.entities.filter(({ type }) => type === "wall")).toHaveLength(1);
    expect(project.openings.map(({ kind }) => kind).sort()).toEqual(["door", "window"]);
    expect(hotspot).toBeDefined();
    expect(project.routeNetworks).toHaveLength(1);
    expect(project.guidedRoutes).toHaveLength(1);
    expect(input.activeGuidedRoute).toMatchObject({
      guidedRouteId: project.guidedRoutes[0]?.id,
      routeNetworkId: project.routeNetworks[0]?.id,
      resolvedRoute: { nodeIds: expect.any(Array), edgeIds: expect.any(Array) },
    });
    expect(texturedMaterial?.assetId).not.toBeNull();
    expect(assets.some(({ id }) => id === texturedMaterial?.assetId)).toBe(true);
    expect(input.assetIssues).toEqual([{
      assetId: texturedMaterial?.assetId,
      code: "ASSET_MISSING",
    }]);
    expect(JSON.stringify(input.snapshot)).not.toMatch(/https?:\/\//i);
    expect(renderer.frameInputs).toEqual(["scene"]);
  });

  it("publishes byte-for-byte deterministic gallery snapshots across remounts", async () => {
    window.history.replaceState({}, "", "/dev/scene-gallery");
    const firstRenderer = new FakeSceneRenderer();
    const first = render(
      <SceneGalleryApp sceneRendererFactory={() => firstRenderer} />,
    );
    await waitFor(() => expect(firstRenderer.updateInputs).toHaveLength(1));
    const firstSnapshot = JSON.stringify(firstRenderer.updateInputs[0]!.snapshot);
    first.unmount();

    const secondRenderer = new FakeSceneRenderer();
    render(<SceneGalleryApp sceneRendererFactory={() => secondRenderer} />);
    await waitFor(() => expect(secondRenderer.updateInputs).toHaveLength(1));

    expect(JSON.stringify(secondRenderer.updateInputs[0]!.snapshot)).toBe(firstSnapshot);
  });

  it("does not expose the scene gallery route in production mode", async () => {
    vi.stubEnv("DEV", false);
    window.history.replaceState({}, "", "/dev/scene-gallery");
    const renderer = new FakeSceneRenderer();

    render(
      <SceneGalleryApp
        forceBackend="sandbox"
        sceneRendererFactory={() => renderer}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("WEB_SANDBOX_DISABLED");
    expect(screen.queryByRole("heading", {
      name: "AetherTwin 3D Scene Gallery",
    })).not.toBeInTheDocument();
    expect(renderer.initCount).toBe(0);
  });

  it("does not evaluate the scene gallery module when the production App loads", async () => {
    vi.stubEnv("DEV", false);
    vi.resetModules();
    const moduleEvaluation = vi.fn();
    vi.doMock("./scene-gallery", () => {
      moduleEvaluation();
      return { SceneGallery: () => null };
    });

    const { App: ProductionApp } = await import("../app");

    expect(moduleEvaluation).not.toHaveBeenCalled();
    render(<ProductionApp forceBackend="sandbox" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("WEB_SANDBOX_DISABLED");
    expect(moduleEvaluation).not.toHaveBeenCalled();
  });
});
