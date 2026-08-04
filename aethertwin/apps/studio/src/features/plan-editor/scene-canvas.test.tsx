// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  parseSnapshotV3,
  type GuidedRoute,
  type RouteEdge,
  type RouteNetwork,
  type RouteNode,
} from "@aethertwin/core-model";
import type { ProjectStore } from "@aethertwin/project-store";
import type {
  SceneCameraState,
  SceneRendererDependencies,
  SceneRendererFactory,
} from "@aethertwin/render-scene-3d";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SceneCanvas, type SceneCanvasProps } from "./scene-canvas";
import { createPlanEditorTestHarness } from "./plan-editor.test-support";
import { deferred, FakeSceneRenderer } from "./scene-canvas.test-support";

interface ResizeEntry {
  readonly contentRect: { readonly width: number; readonly height: number };
}

class FakeResizeObserver {
  static readonly instances: FakeResizeObserver[] = [];
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();

  constructor(
    private readonly callback: (entries: readonly ResizeEntry[]) => void,
  ) {
    FakeResizeObserver.instances.push(this);
  }

  publish(width: number, height: number): void {
    this.callback([{ contentRect: { width, height } }]);
  }
}

const CAMERA: SceneCameraState = Object.freeze({
  position: Object.freeze({ x: 4, y: 5, z: 6 }),
  target: Object.freeze({ x: 1, y: 0, z: -2 }),
  fieldOfView: 50,
});

function createFixture(renderer: FakeSceneRenderer) {
  const harness = createPlanEditorTestHarness();
  harness.store.getState().setViewMode("3d");
  const resolveAsset = vi.fn(async (assetId: string) => ({
    assetId,
    url: "blob:aethertwin/" + assetId,
    mediaType: "image/png" as const,
  }));
  const reportRendererAssetIssue = vi.fn();
  const clearRendererAssetIssue = vi.fn();
  const store = {
    resolveAsset,
    reportRendererAssetIssue,
    clearRendererAssetIssue,
  } as unknown as ProjectStore;
  let rendererDependencies: SceneRendererDependencies | null = null;
  const rendererFactory: SceneRendererFactory = (dependencies) => {
    rendererDependencies = dependencies;
    return renderer;
  };
  const onError = vi.fn();
  const props: SceneCanvasProps = {
    store,
    assetSourceEpoch: 7,
    snapshot: harness.snapshot,
    assetIssues: [{
      assetId: "00000000-0000-4000-8000-000000000090",
      code: "ASSET_CODEC_PREVIEW_UNAVAILABLE",
    }],
    activeFloorId: harness.floorA.id,
    sessionStore: harness.store,
    rendererFactory,
    onError,
  };
  return {
    harness,
    props,
    store,
    onError,
    resolveAsset,
    reportRendererAssetIssue,
    clearRendererAssetIssue,
    rendererDependencies: () => rendererDependencies,
  };
}

beforeEach(() => {
  FakeResizeObserver.instances.length = 0;
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal("devicePixelRatio", 3);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SceneCanvas synchronized lifecycle", () => {
  it("publishes scene input, shares selection and camera, consumes frames, and adapts assets", async () => {
    const renderer = new FakeSceneRenderer();
    const fixture = createFixture(renderer);
    const view = render(<SceneCanvas {...fixture.props} />);

    await waitFor(() => expect(renderer.initCount).toBe(1));
    await waitFor(() => expect(renderer.updateInputs).toHaveLength(1));
    expect(renderer.updateInputs[0]).toMatchObject({
      snapshot: fixture.harness.snapshot,
      activeFloorId: fixture.harness.floorA.id,
      assetIssues: fixture.props.assetIssues,
    });
    expect(renderer.updateInputs[0]?.selectedIds.size).toBe(0);
    expect(renderer.frameInputs).toEqual(["scene"]);

    act(() => renderer.emitStatus("ready"));
    expect(fixture.harness.store.getState().rendererStatus).toBe("ready");

    act(() => renderer.emitSelection(new Set([fixture.harness.fixture.id])));
    expect(fixture.harness.store.getState().selectedIds.has(
      fixture.harness.fixture.id,
    )).toBe(true);

    const updateCountBeforeCamera = renderer.updateInputs.length;
    act(() => renderer.emitCamera(CAMERA));
    expect(fixture.harness.store.getState().sceneCamera).toEqual(CAMERA);
    expect(renderer.updateInputs).toHaveLength(updateCountBeforeCamera);

    act(() => {
      fixture.harness.store.getState().requestSceneFrame("selection");
    });
    await waitFor(() => expect(renderer.frameInputs.at(-1)).toBe("selection"));
    expect(fixture.harness.store.getState().sceneFrameRequest).toBeNull();
    expect(renderer.updateInputs).toHaveLength(updateCountBeforeCamera);

    const observer = FakeResizeObserver.instances[0]!;
    act(() => observer.publish(640, 480));
    expect(renderer.resizeInputs.at(-1)).toEqual([640, 480, 2]);
    expect(observer.observe).toHaveBeenCalledWith(
      screen.getByRole("region", { name: "三维场景" }),
    );

    const dependencies = fixture.rendererDependencies();
    await expect(dependencies?.assetSource.resolve("asset-1")).resolves.toEqual({
      assetId: "asset-1",
      url: "blob:aethertwin/asset-1",
      mediaType: "image/png",
    });
    dependencies?.issueReporter.report({
      assetId: "asset-1",
      code: "ASSET_CODEC_PREVIEW_UNAVAILABLE",
    });
    dependencies?.issueReporter.clear("asset-1");
    expect(fixture.reportRendererAssetIssue).toHaveBeenCalledWith({
      assetId: "asset-1",
      code: "ASSET_CODEC_PREVIEW_UNAVAILABLE",
    }, 7);
    expect(fixture.clearRendererAssetIssue).toHaveBeenCalledWith("asset-1", 7);

    view.unmount();
    expect(renderer.destroyCount).toBe(1);
    expect(observer.disconnect).toHaveBeenCalledOnce();
  });

  it("replaces by floor and rejects late selection, camera, status, and init work", async () => {
    const first = new FakeSceneRenderer();
    const second = new FakeSceneRenderer();
    const fixture = createFixture(first);
    const renderers = [first, second];
    const rendererFactory: SceneRendererFactory = vi.fn(() => renderers.shift()!);
    const view = render(
      <SceneCanvas {...fixture.props} rendererFactory={rendererFactory} />,
    );
    await waitFor(() => expect(first.updateInputs).toHaveLength(1));
    act(() => first.emitStatus("ready"));

    act(() => {
      fixture.harness.store.getState().setActiveFloor(fixture.harness.floorB.id);
    });
    view.rerender(
      <SceneCanvas
        {...fixture.props}
        activeFloorId={fixture.harness.floorB.id}
        rendererFactory={rendererFactory}
      />,
    );
    await waitFor(() => expect(second.initCount).toBe(1));
    await waitFor(() => expect(second.updateInputs.at(-1)?.activeFloorId)
      .toBe(fixture.harness.floorB.id));
    expect(first.destroyCount).toBe(1);

    act(() => {
      first.emitSelection(new Set([fixture.harness.fixture.id]));
      first.emitCamera(CAMERA);
      first.emitStatus("failed", new Error("late failure"));
    });
    expect(fixture.harness.store.getState().selectedIds.size).toBe(0);
    expect(fixture.harness.store.getState().sceneCamera).toBeNull();
    expect(fixture.harness.store.getState().rendererStatus).not.toBe("failed");

    act(() => second.emitSelection(new Set([fixture.harness.fixture.id])));
    expect(fixture.harness.store.getState().selectedIds.has(
      fixture.harness.fixture.id,
    )).toBe(true);

    view.unmount();
    expect(first.destroyCount).toBe(1);
    expect(second.destroyCount).toBe(1);
  });

  it("fails closed to 2D when initialization rejects", async () => {
    const renderer = new FakeSceneRenderer();
    const gate = deferred();
    const failure = new Error("scene init failed");
    renderer.initResult = gate.promise;
    const fixture = createFixture(renderer);
    const view = render(<SceneCanvas {...fixture.props} />);
    await waitFor(() => expect(renderer.initCount).toBe(1));

    gate.reject(failure);
    await waitFor(() => expect(fixture.harness.store.getState()).toMatchObject({
      viewMode: "2d",
      rendererStatus: "failed",
      rendererError: "scene init failed",
    }));
    expect(fixture.onError).toHaveBeenCalledWith(failure);
    expect(renderer.updateInputs).toEqual([]);

    view.unmount();
    expect(renderer.destroyCount).toBe(1);
  });

  it("drops a pending init and every late event after unmount", async () => {
    const renderer = new FakeSceneRenderer();
    const gate = deferred();
    renderer.initResult = gate.promise;
    const fixture = createFixture(renderer);
    const view = render(<SceneCanvas {...fixture.props} />);
    await waitFor(() => expect(renderer.initCount).toBe(1));

    view.unmount();
    gate.resolve();
    await gate.promise;
    await Promise.resolve();
    act(() => {
      renderer.emitSelection(new Set([fixture.harness.fixture.id]));
      renderer.emitCamera(CAMERA);
      renderer.emitStatus("failed", new Error("late failure"));
    });

    expect(renderer.updateInputs).toEqual([]);
    expect(renderer.frameInputs).toEqual([]);
    expect(renderer.destroyCount).toBe(1);
    expect(fixture.harness.store.getState().selectedIds.size).toBe(0);
    expect(fixture.harness.store.getState().sceneCamera).toBeNull();
    expect(fixture.harness.store.getState().rendererStatus).toBe("destroyed");
  });

  it("does not start initialization after an immediate unmount", async () => {
    const renderer = new FakeSceneRenderer();
    const fixture = createFixture(renderer);
    const view = render(<SceneCanvas {...fixture.props} />);

    view.unmount();
    await Promise.resolve();
    await Promise.resolve();

    expect(renderer.initCount).toBe(0);
    expect(renderer.destroyCount).toBe(1);
  });

  it("restores a focused 3D-only host to its keyed floor replacement", async () => {
    const first = new FakeSceneRenderer();
    const second = new FakeSceneRenderer();
    const fixture = createFixture(first);
    const renderers = [first, second];
    const rendererFactory: SceneRendererFactory = vi.fn(() => renderers.shift()!);
    const scene = (floorId: string, key: string) => (
      <div className="studio-plan-workspace">
        <SceneCanvas
          key={key}
          {...fixture.props}
          activeFloorId={floorId}
          rendererFactory={rendererFactory}
        />
      </div>
    );
    const view = render(scene(fixture.harness.floorA.id, "floor-a"));
    await waitFor(() => expect(first.initCount).toBe(1));
    const firstHost = view.container.querySelector<HTMLElement>(
      ".studio-scene-canvas",
    );
    expect(firstHost).not.toBeNull();
    firstHost!.focus();
    expect(firstHost).toHaveFocus();

    act(() => {
      fixture.harness.store.getState().setActiveFloor(fixture.harness.floorB.id);
    });
    view.rerender(scene(fixture.harness.floorB.id, "floor-b"));
    await waitFor(() => expect(second.initCount).toBe(1));
    const secondHost = view.container.querySelector<HTMLElement>(
      ".studio-scene-canvas",
    );
    expect(secondHost).not.toBeNull();
    expect(secondHost).not.toBe(firstHost);
    await Promise.resolve();

    expect(secondHost).toHaveFocus();
    expect(first.destroyCount).toBe(1);
  });

  it("tracks the single saved guided route and clears it when the snapshot changes", async () => {
    const renderer = new FakeSceneRenderer();
    const fixture = createFixture(renderer);
    const nodeA: RouteNode = {
      id: "00000000-0000-4000-8000-000000000101",
      name: "Arrival",
      tags: [],
      floorId: fixture.harness.floorA.id,
      kind: "entrance",
      position: { x: 0, y: 0 },
    };
    const nodeB: RouteNode = {
      id: "00000000-0000-4000-8000-000000000102",
      name: "Gallery",
      tags: [],
      floorId: fixture.harness.floorA.id,
      kind: "showroom-stop",
      position: { x: 1000, y: 0 },
    };
    const edge: RouteEdge = {
      id: "00000000-0000-4000-8000-000000000103",
      name: "Arrival to gallery",
      tags: [],
      from: nodeA.id,
      to: nodeB.id,
      distance: 1000,
      bidirectional: true,
      accessible: true,
      enabled: true,
      width: 1200,
      weight: 1,
    };
    const network: RouteNetwork = {
      id: "00000000-0000-4000-8000-000000000104",
      name: "Visitor route",
      tags: [],
      nodes: [nodeA, nodeB],
      edges: [edge],
    };
    const route: GuidedRoute = {
      id: "00000000-0000-4000-8000-000000000105",
      name: "Tour",
      tags: [],
      routeNetworkId: network.id,
      stopNodeIds: [nodeA.id, nodeB.id],
    };
    const routedSnapshot = parseSnapshotV3({
      ...fixture.harness.snapshot,
      project: {
        ...fixture.harness.snapshot.project,
        profile: "showroom",
        routeNetworks: [network],
        guidedRoutes: [route],
      },
    });
    const view = render(
      <SceneCanvas {...fixture.props} snapshot={routedSnapshot} />,
    );

    await waitFor(() => expect(
      renderer.updateInputs.at(-1)?.activeGuidedRoute,
    ).toMatchObject({
      guidedRouteId: route.id,
      routeNetworkId: network.id,
      resolvedRoute: {
        nodeIds: [nodeA.id, nodeB.id],
        edgeIds: [edge.id],
      },
    }));

    const withoutRoute = parseSnapshotV3({
      ...routedSnapshot,
      project: {
        ...routedSnapshot.project,
        guidedRoutes: [],
      },
    });
    view.rerender(<SceneCanvas {...fixture.props} snapshot={withoutRoute} />);
    await waitFor(() => expect(
      renderer.updateInputs.at(-1)?.activeGuidedRoute,
    ).toBeNull());
  });

  it("replaces the renderer when the project session identity changes", async () => {
    const first = new FakeSceneRenderer();
    const second = new FakeSceneRenderer();
    const fixture = createFixture(first);
    const renderers = [first, second];
    const rendererFactory: SceneRendererFactory = vi.fn(() => renderers.shift()!);
    render(<SceneCanvas {...fixture.props} rendererFactory={rendererFactory} />);
    await waitFor(() => expect(first.updateInputs).toHaveLength(1));

    act(() => {
      fixture.harness.store.getState().replaceSession(
        "replacement-project-session",
        fixture.harness.floorA.id,
      );
      fixture.harness.store.getState().setViewMode("3d");
    });
    await waitFor(() => expect(second.initCount).toBe(1));
    await waitFor(() => expect(second.updateInputs).toHaveLength(1));
    expect(first.destroyCount).toBe(1);

    act(() => {
      first.emitSelection(new Set([fixture.harness.fixture.id]));
      first.emitCamera(CAMERA);
      first.emitStatus("failed", new Error("stale project event"));
    });
    expect(fixture.harness.store.getState().selectedIds.size).toBe(0);
    expect(fixture.harness.store.getState().sceneCamera).toBeNull();
    expect(fixture.harness.store.getState().rendererStatus).not.toBe("failed");
  });
});
