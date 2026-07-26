/// <reference types="vite/client" />

import {
  createInitialSnapshot,
  parseSnapshotV3,
  type Boundary,
  type DimensionAnnotation,
  type Fixture,
  type Floor,
  type PlanLayer,
  type PointOfInterest,
  type ProjectSnapshot,
  type SpaceUnit,
  type SpatialEntity,
  type SpatialEntityBase,
  type Wall,
  type Zone,
} from "@aethertwin/core-model";
import {
  applyTransform,
  entityWorldBounds,
  worldToScreen,
} from "@aethertwin/plan-engine";
import { describe, expect, it, vi } from "vitest";
import { projectScene } from "@aethertwin/render-plan-2d/scene-projection";
import type { PlanRendererInput } from "./types";
import { createPlanEditorTestHarness } from "../../../apps/studio/src/features/plan-editor/plan-editor.test-support";

vi.mock("@aethertwin/render-plan-2d", () => ({
  PixiPlanRenderer: class {
    async init(): Promise<void> {}
    update(): void {}
    resize(): void {}
    destroy(): void {}
  },
}));

const uuid = (value: number): string => (
  `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`
);

const initialIds = [1, 2, 3].map(uuid);
const base = createInitialSnapshot({
  name: "Render",
  profile: "market",
  uuid: () => initialIds.shift()!,
});
const originalFloor = base.project.floors[0]!;
const hiddenLayer: PlanLayer = {
  id: uuid(6),
  name: "Hidden",
  tags: [],
  visible: false,
  locked: false,
};
const floorA: Floor = {
  ...originalFloor,
  layers: [...originalFloor.layers, hiddenLayer],
};
const floorB: Floor = {
  id: uuid(4),
  name: "Floor B",
  tags: [],
  layers: [{ id: uuid(5), name: "Default", tags: [], visible: true, locked: false }],
};
const viewport = {
  width: 800,
  height: 600,
  center: { x: 0, y: 0 },
  pixelsPerMillimetre: 1,
};

function fixtureAt(id: string, floor: Floor, x: number, layerId = floor.layers[0]!.id): Fixture {
  return {
    type: "fixture",
    id,
    name: id,
    tags: [],
    floorId: floor.id,
    layerId,
    locked: false,
    transform: { translation: { x, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
    kind: "generic",
    size: { width: 100, height: 100 },
  };
}

function snapshotWith(entities: readonly SpatialEntity[]): ProjectSnapshot {
  return parseSnapshotV3({
    ...base,
    project: {
      ...base.project,
      floors: [floorA, floorB],
      entities,
    },
  });
}

function inputFor(
  snapshot: ProjectSnapshot,
  overrides: Partial<Omit<PlanRendererInput, "snapshot">> = {},
): PlanRendererInput {
  return {
    snapshot,
    activeFloorId: floorA.id,
    viewport,
    selectedIds: new Set<string>(),
    draft: null,
    ...overrides,
  };
}

function entityBase(id: number, overrides: Partial<SpatialEntityBase> = {}): SpatialEntityBase {
  return {
    id: uuid(id),
    name: `Entity ${id}`,
    tags: [],
    floorId: floorA.id,
    layerId: floorA.layers[0]!.id,
    locked: false,
    transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
    ...overrides,
  };
}

describe("projectScene", () => {
  it("projects only visible entities from the active floor and viewport", () => {
    const visibleFixture = fixtureAt(uuid(10), floorA, 0);
    const hiddenFixture = fixtureAt(uuid(11), floorA, 0, hiddenLayer.id);
    const floorBFixture = fixtureAt(uuid(12), floorB, 0);
    const offscreenFixture = fixtureAt(uuid(13), floorA, 10_000);
    const snapshot = snapshotWith([
      visibleFixture,
      hiddenFixture,
      floorBFixture,
      offscreenFixture,
    ]);

    const scene = projectScene(inputFor(snapshot));
    const contentIds = scene.nodes
      .filter((node) => node.layer === "content")
      .map((node) => node.entityId);

    expect(contentIds).toEqual([visibleFixture.id]);
    expect(scene.nodes.some((node) => node.entityId === hiddenFixture.id)).toBe(false);
    expect(scene.nodes.some((node) => node.entityId === floorBFixture.id)).toBe(false);
    expect(scene.nodes.some((node) => node.entityId === offscreenFixture.id)).toBe(false);
  });

  it("projects every spatial variant plus dimensions, selection, and drafts to stable layers", () => {
    const boundary: Boundary = {
      ...entityBase(20),
      type: "boundary",
      polygon: [{ x: -50, y: -50 }, { x: 50, y: -50 }, { x: 0, y: 50 }],
    };
    const wall: Wall = {
      ...entityBase(21, { locked: true }),
      type: "wall",
      centerLine: [{ x: -80, y: 0 }, { x: 80, y: 0 }],
      thickness: 20,
    };
    const zone: Zone = {
      ...entityBase(22),
      type: "zone",
      polygon: [{ x: -40, y: -40 }, { x: 40, y: -40 }, { x: 0, y: 40 }],
      purpose: "Retail",
      color: "#334455",
    };
    const spaceUnit: SpaceUnit = {
      ...entityBase(23),
      type: "space-unit",
      kind: "shop",
      footprint: [{ x: -30, y: -30 }, { x: 30, y: -30 }, { x: 0, y: 30 }],
    };
    const fixture: Fixture = {
      ...entityBase(24),
      type: "fixture",
      kind: "generic",
      size: { width: 60, height: 40 },
    };
    const poi: PointOfInterest = {
      ...entityBase(25),
      type: "poi",
      kind: "entrance",
      radius: 15,
    };
    const dimension: DimensionAnnotation = {
      ...entityBase(26),
      type: "dimension",
      start: { kind: "point", point: { x: -25, y: 0 } },
      end: { kind: "point", point: { x: 25, y: 0 } },
      offset: 10,
      displayUnit: "mm",
    };
    const draft = fixtureAt(uuid(27), floorA, 120);
    const snapshot = snapshotWith([
      boundary,
      wall,
      zone,
      spaceUnit,
      fixture,
      poi,
      dimension,
    ]);

    const scene = projectScene(inputFor(snapshot, {
      selectedIds: new Set([boundary.id]),
      draft: [draft],
    }));
    const content = scene.nodes.filter((node) => node.layer === "content");
    const annotation = scene.nodes.filter((node) => node.layer === "annotation");
    const overlay = scene.nodes.filter((node) => node.layer === "overlay");

    expect(content.map((node) => node.entityId).sort()).toEqual([
      boundary.id,
      wall.id,
      zone.id,
      spaceUnit.id,
      fixture.id,
      poi.id,
    ].sort());
    expect(annotation.map((node) => node.entityId)).toEqual([dimension.id]);
    expect(overlay.map((node) => node.entityId).sort()).toEqual([boundary.id, draft.id].sort());
    expect(content.find((node) => node.entityId === wall.id)?.locked).toBe(true);
    expect(content.find((node) => node.entityId === boundary.id)?.selected).toBe(true);
    expect(content.find((node) => node.entityId === boundary.id)?.geometry.kind).toBe("polygon");
    expect(content.find((node) => node.entityId === wall.id)?.geometry.kind).toBe("polyline");
    expect(content.find((node) => node.entityId === poi.id)?.geometry.kind).toBe("circle");
    expect(annotation[0]?.geometry.kind).toBe("dimension");
    expect(overlay.some((node) => node.key === `__aethertwin:selection:${boundary.id}`)).toBe(true);
    expect(overlay.some((node) => node.key === `__aethertwin:draft:${draft.id}`)).toBe(true);
  });

  it("projects a rotated anisotropic POI as a deterministic transformed polygon", () => {
    const poi: PointOfInterest = {
      ...entityBase(28, {
        transform: {
          translation: { x: 30, y: -40 },
          rotation: Math.PI / 4,
          scale: { x: 2, y: 0.5 },
        },
      }),
      type: "poi",
      kind: "entrance",
      radius: 20,
    };
    const anisotropicViewport = { ...viewport, pixelsPerMillimetre: 2 };
    const scene = projectScene(inputFor(snapshotWith([poi]), {
      viewport: anisotropicViewport,
    }));
    const node = scene.nodes.find((candidate) => candidate.entityId === poi.id);

    expect(node).toBeDefined();
    expect(node?.geometry).toMatchObject({ kind: "polygon", closed: true });
    if (node === undefined || node.geometry.kind !== "polygon") return;
    expect(node.geometry.points).toHaveLength(32);

    const center = worldToScreen(
      applyTransform({ x: 0, y: 0 }, poi.transform),
      anisotropicViewport,
    );
    const radii = node.geometry.points.map((point) => Math.hypot(
      point.x - center.x,
      point.y - center.y,
    ));
    expect(Math.max(...radii)).toBeCloseTo(80, 10);
    expect(Math.min(...radii)).toBeCloseTo(20, 10);
    expect(Math.max(...radii) / Math.min(...radii)).toBeCloseTo(4, 10);

    const expectedFirst = worldToScreen(
      applyTransform({ x: 20, y: 0 }, poi.transform),
      anisotropicViewport,
    );
    const expectedQuarter = worldToScreen(
      applyTransform({ x: 0, y: 20 }, poi.transform),
      anisotropicViewport,
    );
    expect(node.geometry.points[0]?.x).toBeCloseTo(expectedFirst.x, 10);
    expect(node.geometry.points[0]?.y).toBeCloseTo(expectedFirst.y, 10);
    expect(node.geometry.points[8]?.x).toBeCloseTo(expectedQuarter.x, 10);
    expect(node.geometry.points[8]?.y).toBeCloseTo(expectedQuarter.y, 10);

    const worldBounds = entityWorldBounds(poi);
    const expectedTopLeft = worldToScreen(
      { x: worldBounds.min.x, y: worldBounds.max.y },
      anisotropicViewport,
    );
    const expectedBottomRight = worldToScreen(
      { x: worldBounds.max.x, y: worldBounds.min.y },
      anisotropicViewport,
    );
    expect(node.bounds.min.x).toBeCloseTo(expectedTopLeft.x, 10);
    expect(node.bounds.min.y).toBeCloseTo(expectedTopLeft.y, 10);
    expect(node.bounds.max.x).toBeCloseTo(expectedBottomRight.x, 10);
    expect(node.bounds.max.y).toBeCloseTo(expectedBottomRight.y, 10);
    expect(node.geometry.points.every((point) => (
      point.x >= node.bounds.min.x - 1e-10
      && point.x <= node.bounds.max.x + 1e-10
      && point.y >= node.bounds.min.y - 1e-10
      && point.y <= node.bounds.max.y + 1e-10
    ))).toBe(true);
  });

  it("keeps a minimum visual marker without widening tiny POI business bounds", () => {
    const poi: PointOfInterest = {
      ...entityBase(29, {
        transform: {
          translation: { x: 30, y: -40 },
          rotation: Math.PI / 4,
          scale: { x: 2, y: 0.5 },
        },
      }),
      type: "poi",
      kind: "entrance",
      radius: 0.1,
    };
    const scene = projectScene(inputFor(snapshotWith([poi])));
    const node = scene.nodes.find((candidate) => candidate.entityId === poi.id);
    const center = worldToScreen(applyTransform({ x: 0, y: 0 }, poi.transform), viewport);
    const worldBounds = entityWorldBounds(poi);
    const expectedTopLeft = worldToScreen(
      { x: worldBounds.min.x, y: worldBounds.max.y },
      viewport,
    );
    const expectedBottomRight = worldToScreen(
      { x: worldBounds.max.x, y: worldBounds.min.y },
      viewport,
    );

    expect(node?.geometry).toEqual({ kind: "circle", center, radius: 6 });
    expect(node?.bounds.min.x).toBeCloseTo(expectedTopLeft.x, 10);
    expect(node?.bounds.min.y).toBeCloseTo(expectedTopLeft.y, 10);
    expect(node?.bounds.max.x).toBeCloseTo(expectedBottomRight.x, 10);
    expect(node?.bounds.max.y).toBeCloseTo(expectedBottomRight.y, 10);
  });

  it("emits collision-safe deterministic adaptive grid nodes from the viewport", () => {
    const fixture = fixtureAt(uuid(30), floorA, 0);
    const snapshot = snapshotWith([fixture]);
    const first = projectScene(inputFor(snapshot));
    const repeated = projectScene(inputFor(snapshot));
    const zoomed = projectScene(inputFor(snapshot, {
      viewport: { ...viewport, pixelsPerMillimetre: 0.05 },
    }));
    const grid = first.nodes.filter((node) => node.layer === "grid");
    const zoomedGrid = zoomed.nodes.filter((node) => node.layer === "grid");

    expect(grid.length).toBeGreaterThan(0);
    expect(repeated.nodes).toEqual(first.nodes);
    expect(zoomedGrid).not.toEqual(grid);
    expect(grid.every((node) => node.key.startsWith("__aethertwin:grid:"))).toBe(true);
    expect(grid.every((node) => node.entityId.startsWith("__aethertwin:grid:"))).toBe(true);
    expect(new Set(grid.map((node) => node.key)).size).toBe(grid.length);
    expect(grid.some((node) => node.key === fixture.id || node.entityId === fixture.id)).toBe(false);
    expect(grid.filter((node) => node.styleToken === "grid-axis")).toHaveLength(2);
    expect(grid.every((node) => (
      node.geometry.kind === "polyline"
      && node.geometry.points.every((point) => (
        point.x >= 0 && point.x <= viewport.width && point.y >= 0 && point.y <= viewport.height
      ))
    ))).toBe(true);
  });
});

describe("projectScene 2,000-entity culling fixture", () => {
  it("projects only intersecting visible active-floor fixture IDs", () => {
    const harness = createPlanEditorTestHarness();
    const hiddenLayer: PlanLayer = {
      id: "00000000-0000-4000-8000-000000000006",
      name: "Hidden",
      tags: [],
      visible: false,
      locked: false,
    };
    const floorA: Floor = {
      ...harness.floorA,
      layers: [...harness.floorA.layers, hiddenLayer],
    };
    const entities = Array.from({ length: 2_000 }, (_, index) => ({
      ...harness.fixture,
      id: `00000000-0000-4000-8001-${index.toString().padStart(12, "0")}`,
      transform: {
        ...harness.fixture.transform,
        translation: {
          x: (index % 50) * 120,
          y: Math.floor(index / 50) * 120,
        },
      },
    }));
    const otherFloor = {
      ...harness.fixture,
      id: "00000000-0000-4000-8002-000000000001",
      name: "Other floor",
      floorId: harness.floorB.id,
      layerId: harness.floorB.layers[0]!.id,
    };
    const hidden = {
      ...harness.fixture,
      id: "00000000-0000-4000-8002-000000000002",
      name: "Hidden layer",
      layerId: hiddenLayer.id,
    };
    const snapshot = parseSnapshotV3({
      ...harness.snapshot,
      project: {
        ...harness.snapshot.project,
        floors: [floorA, harness.floorB],
        entities: [...entities, otherFloor, hidden],
      },
    });
    const cullingViewport = {
      width: 500,
      height: 500,
      center: { x: 240, y: 240 },
      pixelsPerMillimetre: 1,
    };
    const expectedIds = entities
      .filter((entity) => (
        entity.transform.translation.x - 50 <= 490
        && entity.transform.translation.x + 50 >= -10
        && entity.transform.translation.y - 50 <= 490
        && entity.transform.translation.y + 50 >= -10
      ))
      .map((entity) => entity.id)
      .sort();

    const scene = projectScene({
      snapshot,
      activeFloorId: floorA.id,
      viewport: cullingViewport,
      selectedIds: new Set<string>(),
      draft: null,
    });
    const actualIds = scene.nodes
      .filter((node) => node.layer === "content")
      .map((node) => node.entityId)
      .sort();

    expect(expectedIds).toHaveLength(25);
    expect(actualIds).toEqual(expectedIds);
    expect(actualIds).not.toContain(otherFloor.id);
    expect(actualIds).not.toContain(hidden.id);
  });
});
