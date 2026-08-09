// @vitest-environment jsdom

import type { Fixture } from "@aethertwin/core-model";
import { parseSnapshotV3 } from "@aethertwin/core-model";
import { SHOWROOM_FIXTURE_CATALOGUE } from "@aethertwin/mode-showroom";
import { projectScene as projectPlanScene } from "@aethertwin/render-plan-2d";
import { projectScene as projectThreeScene } from "@aethertwin/render-scene-3d";
import { resolveGuidedRoute } from "@aethertwin/route-engine";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import showroomFixture from "../../../../../fixtures/contracts/showroom-m2-4.v3.json";
import { createPlanEditorStore } from "./editor-session";
import { SceneCanvas } from "./scene-canvas";
import { FakeSceneRenderer } from "./scene-canvas.test-support";

const snapshot = parseSnapshotV3(showroomFixture);
const floor = snapshot.project.floors[0]!;
const network = snapshot.project.routeNetworks[0]!;
const route = snapshot.project.guidedRoutes[0]!;
const routeResult = resolveGuidedRoute(network, route);
if (!routeResult.ok) throw new Error("Task 17 fixture must contain a resolvable guided route");
const resolvedRoute = routeResult.value;

class FakeResizeObserver {
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();
  constructor(callback: ResizeObserverCallback) {
    void callback;
  }
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal("devicePixelRatio", 1);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function planProjection(selectedIds: ReadonlySet<string>) {
  return projectPlanScene({
    snapshot,
    activeFloorId: floor.id,
    viewport: {
      width: 1_000,
      height: 800,
      center: { x: 4_000, y: 3_000 },
      pixelsPerMillimetre: 0.1,
    },
    selectedIds,
    draft: null,
    calibrationPreview: null,
    activeRouteNetworkId: network.id,
    resolvedRoute,
  });
}

function threeProjection(selectedIds: ReadonlySet<string>) {
  return projectThreeScene({
    snapshot,
    activeFloorId: floor.id,
    selectedIds,
    activeGuidedRoute: {
      guidedRouteId: route.id,
      routeNetworkId: network.id,
      resolvedRoute,
    },
    camera: {
      position: { x: 9, y: 7, z: 10 },
      target: { x: 4, y: 0, z: -3 },
      fieldOfView: 45,
    },
    assetIssues: [],
  });
}

describe("Task 17 complete M2.4 showroom acceptance", () => {
  it("parses one complete schema-v3 showroom with every required durable record", () => {
    const fixtures = snapshot.project.entities.filter(
      (entity): entity is Fixture => entity.type === "fixture",
    );
    expect(snapshot.schemaVersion).toBe(3);
    expect(snapshot.project.profile).toBe("showroom");
    expect(snapshot.project.entities.filter(({ type }) => type === "space-unit")).toHaveLength(1);
    expect(snapshot.project.entities.filter(({ type }) => type === "zone")).toHaveLength(1);
    expect(snapshot.project.entities.filter(({ type }) => type === "wall")).toHaveLength(1);
    expect(snapshot.project.openings.map(({ kind }) => kind).sort()).toEqual(["door", "window"]);
    expect(fixtures.map(({ kind }) => kind).sort()).toEqual([
      ...SHOWROOM_FIXTURE_CATALOGUE.map(({ kind }) => kind),
      "generic",
    ].sort());
    expect(snapshot.project.entities.some((entity) => (
      entity.type === "poi" && entity.kind === "product-hotspot"
    ))).toBe(true);
    expect(snapshot.project.productContents).toHaveLength(1);
    expect(snapshot.project.routeNetworks).toHaveLength(1);
    expect(snapshot.project.guidedRoutes).toHaveLength(1);
    expect(snapshot.project.materialAssignments.map(({ targetKind }) => targetKind).sort())
      .toEqual(["fixture", "space-floor", "wall"]);
    expect(snapshot.project.materials.some(({ assetId }) => assetId !== null)).toBe(true);
    expect(snapshot.assets).toHaveLength(1);
  });

  it("keeps the same durable IDs, route and selected object in 2D and 3D projections", () => {
    const selected = snapshot.project.entities.find((entity) => (
      entity.type === "fixture" && entity.kind === "display-case"
    ))!;
    const selectedIds = new Set([selected.id]);
    const plan = planProjection(selectedIds);
    const scene = threeProjection(selectedIds);
    const expectedSourceIds = new Set([
      ...snapshot.project.entities.map(({ id }) => id),
      ...snapshot.project.openings.map(({ id }) => id),
      ...network.nodes.map(({ id }) => id),
      ...network.edges.map(({ id }) => id),
    ]);
    const planIds = new Set(plan.nodes.map(({ entityId }) => entityId));
    const sceneIds = new Set(scene.records.flatMap(({ sourceIds }) => sourceIds));

    for (const id of expectedSourceIds) {
      expect(planIds, `2D projection omitted ${id}`).toContain(id);
      expect(sceneIds, `3D projection omitted ${id}`).toContain(id);
    }
    expect(plan.nodes.find(({ entityId }) => entityId === selected.id)?.selected).toBe(true);
    expect(scene.records.some(({ selectionId, selected: value }) => (
      selectionId === selected.id && value
    ))).toBe(true);
    expect(plan.nodes.filter(({ geometry }) => (
      geometry.kind === "route-edge" && geometry.resolved
    )).map(({ entityId }) => entityId)).toEqual(resolvedRoute.edgeIds);
    const routeRecord = scene.records.find(({ kind }) => kind === "route");
    expect(routeRecord).toBeDefined();
    expect(resolvedRoute.edgeIds.every((id) => routeRecord!.sourceIds.includes(id))).toBe(true);
    expect(scene.requiredTextureAssetIds).toEqual([snapshot.assets[0]!.id]);
    for (const assignment of snapshot.project.materialAssignments) {
      const expectedRecordKind = assignment.targetKind === "space-floor"
        ? "floor"
        : assignment.targetKind === "wall"
          ? "wall-piece"
          : "fixture-part";
      const definition = snapshot.project.materials.find(
        ({ id }) => id === assignment.materialId,
      )!;
      const targetRecords = scene.records.filter((record) => (
        record.materialTargetId === assignment.targetId
        && record.kind === expectedRecordKind
      ));
      expect(targetRecords.length).toBeGreaterThan(0);
      for (const record of targetRecords) {
        expect(record.material.definitionId).toBe(assignment.materialId);
        expect(record.material.baseColor).toBe(definition.baseColor);
        expect(record.material.roughness).toBe(definition.roughness);
        expect(record.material.metalness).toBe(definition.metalness);
        expect(record.material.opacity).toBe(definition.opacity);
        expect(record.material.textureAssetId).toBe(definition.assetId);
        expect(record.material.textureColorSpace).toBe(
          definition.assetId === null ? null : "srgb",
        );
      }
    }
  });

  it.each(["3d", "split"] as const)(
    "shares selection in %s, fails closed to 2D, and destroys once",
    async (viewMode) => {
      const selectedId = snapshot.project.entities.find(({ type }) => type === "fixture")!.id;
      const sessionStore = createPlanEditorStore({
        activeFloorId: floor.id,
        sessionId: `task-17-showroom-${viewMode}-session`,
      });
      const renderer = new FakeSceneRenderer();
      const projectStoreAdapter = {
        async resolveAsset(assetId: string) {
          return {
            assetId,
            url: "asset://localhost/" + assetId,
            mediaType: "image/png" as const,
          };
        },
        reportRendererAssetIssue() {},
        clearRendererAssetIssue() {},
      };
      expect(sessionStore.getState().setViewMode(viewMode)).toBe(true);

      const view = render(createElement(SceneCanvas, {
        store: projectStoreAdapter,
        assetSourceEpoch: 1,
        snapshot,
        assetIssues: [],
        activeFloorId: floor.id,
        sessionStore,
        rendererFactory: () => renderer,
        onError: () => undefined,
      }));

      await waitFor(() => expect(renderer.initCount).toBe(1));
      await waitFor(() => expect(renderer.updateInputs).toHaveLength(1));
      expect(renderer.updateInputs[0]?.snapshot).toBe(snapshot);
      expect(sessionStore.getState().viewMode).toBe(viewMode);

      act(() => renderer.emitSelection(new Set([selectedId])));
      const sharedSelection = sessionStore.getState().selectedIds;
      expect([...sharedSelection]).toEqual([selectedId]);
      expect(planProjection(sharedSelection).nodes.find(({ entityId }) => entityId === selectedId))
        .toMatchObject({ selected: true });
      expect(threeProjection(sharedSelection).records.some(({ selectionId, selected }) => (
        selectionId === selectedId && selected
      ))).toBe(true);

      act(() => renderer.emitStatus(
        "disabled",
        new Error("WebGL context recovery failed"),
      ));
      await waitFor(() => expect(sessionStore.getState()).toMatchObject({
        viewMode: "2d",
        rendererStatus: "disabled",
        rendererError: "WebGL context recovery failed",
      }));
      expect([...sessionStore.getState().selectedIds]).toEqual([selectedId]);
      expect(sessionStore.getState().setViewMode("3d")).toBe(false);
      expect(sessionStore.getState().setViewMode("split")).toBe(false);

      view.unmount();
      expect(renderer.destroyCount).toBe(1);
    },
  );
});
