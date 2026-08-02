/// <reference types="vite/client" />

import {
  createInitialSnapshot,
  parseSnapshotV3,
  type AssetRecord,
  type Boundary,
  type DimensionAnnotation,
  type Fixture,
  type Floor,
  type PlanReference,
  type PlanLayer,
  type PointOfInterest,
  type ProductContent,
  type ProjectSnapshot,
  type RouteNetwork,
  type SpaceUnit,
  type SpatialEntity,
  type SpatialEntityBase,
  type Wall,
  type Zone,
} from "@aethertwin/core-model";
import {
  applyTransform,
  entityWorldBounds,
  previewCalibration,
  worldToScreen,
} from "@aethertwin/plan-engine";
import type { ResolvedRoute } from "@aethertwin/route-engine";
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
const lockedLayer: PlanLayer = {
  id: uuid(7),
  name: "Locked references",
  tags: [],
  visible: true,
  locked: true,
};
const floorA: Floor = {
  ...originalFloor,
  layers: [...originalFloor.layers, hiddenLayer, lockedLayer],
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

function assetRecord(assetId: string, index: number): AssetRecord {
  const digit = ((index + 10) % 16).toString(16);
  const sha256 = digit.repeat(64);
  return {
    id: assetId,
    sha256,
    relativePath: `assets/sha256/${digit}${digit}/${sha256}.png`,
    mediaType: "image/png",
    size: 42,
  };
}

function planReferenceAt(
  id: string,
  assetId: string,
  floor: Floor,
  overrides: Partial<PlanReference> = {},
): PlanReference {
  return {
    id,
    name: id,
    tags: [],
    floorId: floor.id,
    layerId: floor.layers[0]!.id,
    assetId,
    intrinsicSize: { width: 100, height: 50 },
    transform: {
      translation: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    opacity: 0.65,
    locked: false,
    calibration: null,
    ...overrides,
  };
}

function snapshotWith(
  entities: readonly SpatialEntity[],
  planReferences: readonly PlanReference[] = [],
  projectOverrides: Partial<ProjectSnapshot["project"]> = {},
): ProjectSnapshot {
  const assetIds = [...new Set(planReferences.map(({ assetId }) => assetId))];
  return parseSnapshotV3({
    ...base,
    project: {
      ...base.project,
      floors: [floorA, floorB],
      entities,
      ...projectOverrides,
      planReferences,
    },
    assets: assetIds.map(assetRecord),
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
    calibrationPreview: null,
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

  it("projects verified reference identity and transformed corners between grid and content", () => {
    const fixture = fixtureAt(uuid(40), floorA, 0);
    const reference = planReferenceAt(uuid(41), uuid(42), floorA, {
      layerId: lockedLayer.id,
      intrinsicSize: { width: 100, height: 50 },
      transform: {
        translation: { x: -50, y: 40 },
        rotation: Math.PI / 2,
        scale: { x: 2, y: 2 },
      },
      opacity: 0.42,
    });
    const scene = projectScene(inputFor(snapshotWith([fixture], [reference]), {
      selectedIds: new Set([reference.id]),
    }));
    const node = scene.nodes.find((candidate) => candidate.entityId === reference.id);

    expect(node).toMatchObject({
      layer: "reference",
      styleToken: "plan-reference",
      selected: true,
      locked: true,
    });
    expect(node?.geometry).toMatchObject({
      kind: "image",
      assetId: reference.assetId,
      opacity: 0.42,
    });
    if (node === undefined || node.geometry.kind !== "image") return;
    const expectedCorners = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ].map((point) => worldToScreen(applyTransform(point, reference.transform), viewport));
    expect(node.geometry.corners).toEqual(expectedCorners);
    expect(Object.keys(node.geometry).sort()).toEqual([
      "assetId", "corners", "kind", "opacity",
    ]);
    expect(node.bounds).toEqual({
      min: {
        x: Math.min(...expectedCorners.map(({ x }) => x)),
        y: Math.min(...expectedCorners.map(({ y }) => y)),
      },
      max: {
        x: Math.max(...expectedCorners.map(({ x }) => x)),
        y: Math.max(...expectedCorners.map(({ y }) => y)),
      },
    });
    const selection = scene.nodes.find((candidate) => (
      candidate.entityId === reference.id && candidate.layer === "overlay"
    ));
    expect(selection).toMatchObject({
      key: `__aethertwin:selection:${reference.id}`,
      styleToken: "selection-plan-reference",
      selected: true,
      locked: true,
      geometry: {
        kind: "polygon",
        points: expectedCorners,
        closed: true,
      },
    });

    const lastGrid = scene.nodes.reduce((lastIndex, candidate, index) => (
      candidate.layer === "grid" ? index : lastIndex
    ), -1);
    const referenceIndex = scene.nodes.findIndex(({ layer }) => layer === "reference");
    const contentIndex = scene.nodes.findIndex(({ layer }) => layer === "content");
    expect(lastGrid).toBeLessThan(referenceIndex);
    expect(referenceIndex).toBeLessThan(contentIndex);
  });

  it("filters references by floor, visible layer, and viewport while merging lock state", () => {
    const visible = planReferenceAt(uuid(43), uuid(44), floorA, {
      layerId: lockedLayer.id,
    });
    const entityLocked = planReferenceAt(uuid(45), uuid(46), floorA, {
      locked: true,
      transform: {
        translation: { x: 120, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
      },
    });
    const hidden = planReferenceAt(uuid(47), uuid(48), floorA, {
      layerId: hiddenLayer.id,
    });
    const otherFloor = planReferenceAt(uuid(49), uuid(50), floorB);
    const offscreen = planReferenceAt(uuid(51), uuid(52), floorA, {
      transform: {
        translation: { x: 10_000, y: 10_000 },
        rotation: 0,
        scale: { x: 1, y: 1 },
      },
    });
    const scene = projectScene(inputFor(snapshotWith([], [
      visible, entityLocked, hidden, otherFloor, offscreen,
    ])));
    const references = scene.nodes.filter(({ layer }) => layer === "reference");

    expect(references.map(({ entityId }) => entityId)).toEqual([
      visible.id,
      entityLocked.id,
    ].sort());
    expect(references.every(({ locked }) => locked)).toBe(true);
    expect(scene.nodes.some(({ entityId }) => entityId === hidden.id)).toBe(false);
    expect(scene.nodes.some(({ entityId }) => entityId === otherFloor.id)).toBe(false);
    expect(scene.nodes.some(({ entityId }) => entityId === offscreen.id)).toBe(false);
  });

  it("uses calibration preview geometry without mutating the durable snapshot", () => {
    const reference = planReferenceAt(uuid(53), uuid(54), floorA);
    const snapshot = snapshotWith([], [reference]);
    const snapshotBefore = JSON.stringify(snapshot);
    const preview = previewCalibration(reference, {
      sourcePointA: { x: 0, y: 0 },
      sourcePointB: { x: 100, y: 0 },
      measuredDistanceMm: 250,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    const scene = projectScene(inputFor(snapshot, {
      calibrationPreview: preview.value,
    }));
    const node = scene.nodes.find(({ entityId }) => entityId === reference.id);
    expect(node?.geometry.kind).toBe("image");
    if (node === undefined || node.geometry.kind !== "image") return;
    const expectedCorners = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ].map((point) => worldToScreen(applyTransform(point, preview.value.after.transform), viewport));

    expect(node.geometry.corners).toEqual(expectedCorners);
    expect(JSON.stringify(snapshot)).toBe(snapshotBefore);
    expect(snapshot.project.planReferences[0]?.transform.scale).toEqual({ x: 1, y: 1 });
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
      calibrationPreview: null,
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
describe("projectScene M2.2 building overlays", () => {
  it("projects visible openings with stable keys, symbols, selection, and culling", () => {
    const supportingWall: Wall = {
      ...entityBase(80),
      type: "wall",
      centerLine: [{ x: -200, y: 0 }, { x: 200, y: 0 }],
      thickness: 20,
    };
    const hiddenWall: Wall = {
      ...supportingWall,
      id: uuid(81),
      layerId: hiddenLayer.id,
    };
    const offscreenWall: Wall = {
      ...supportingWall,
      id: uuid(82),
      transform: {
        ...supportingWall.transform,
        translation: { x: 10_000, y: 0 },
      },
    };
    const door = {
      id: uuid(83),
      name: "Door",
      tags: [],
      wallId: supportingWall.id,
      kind: "door" as const,
      distanceAlongWall: 100,
      width: 50,
      height: 2100,
      sillHeight: 0,
    };
    const windowOpening = {
      id: uuid(84),
      name: "Window",
      tags: [],
      wallId: supportingWall.id,
      kind: "window" as const,
      distanceAlongWall: 300,
      width: 50,
      height: 1200,
      sillHeight: 900,
    };
    const hiddenOpening = {
      ...door,
      id: uuid(85),
      wallId: hiddenWall.id,
      distanceAlongWall: 200,
    };
    const offscreenOpening = {
      ...door,
      id: uuid(86),
      wallId: offscreenWall.id,
      distanceAlongWall: 200,
    };
    const structural = snapshotWith([supportingWall, hiddenWall, offscreenWall]);
    const valid = parseSnapshotV3({
      ...structural,
      project: {
        ...structural.project,
        openings: [door, windowOpening, hiddenOpening, offscreenOpening],
      },
    });
    const invalidReference = {
      ...door,
      id: uuid(87),
      wallId: uuid(999),
    };
    const corrupted: ProjectSnapshot = {
      ...valid,
      project: {
        ...valid.project,
        openings: [...valid.project.openings, invalidReference],
      },
    };

    const scene = projectScene(inputFor(corrupted, {
      selectedIds: new Set([door.id]),
    }));
    const openingNodes = scene.nodes.filter(
      (node) => node.geometry.kind === "opening",
    );
    const baseSymbols = openingNodes.filter(
      (node) => node.layer === "content",
    );

    expect(baseSymbols.map(({ key }) => key)).toEqual([door.id, windowOpening.id]);
    expect(baseSymbols.map(({ styleToken }) => styleToken)).toEqual([
      "opening-door",
      "opening-window",
    ]);
    expect(baseSymbols[0]?.geometry).toEqual({
      kind: "opening",
      symbol: {
        key: door.id,
        openingId: door.id,
        kind: "door",
        center: { x: 300, y: 300 },
        angle: 0,
        width: 50,
        wallThickness: 20,
        selected: true,
      },
    });
    expect(openingNodes.some(
      (node) => node.key === `__aethertwin:selection:${door.id}`,
    )).toBe(true);
    expect(openingNodes.some(({ entityId }) => entityId === hiddenOpening.id)).toBe(false);
    expect(openingNodes.some(({ entityId }) => entityId === offscreenOpening.id)).toBe(false);
    expect(openingNodes.some(({ entityId }) => entityId === invalidReference.id)).toBe(false);
  });

  it("uses explicit fixture-kind style tokens for all eight durable kinds", () => {
    const kinds = [
      "display-case",
      "display-table",
      "shelf",
      "checkout",
      "screen",
      "partition",
      "signage",
      "generic",
    ] as const;
    const fixtures = kinds.map((kind, index) => ({
      ...fixtureAt(uuid(100 + index), floorA, -350 + index * 90),
      kind,
      size: { width: 60, height: 60 },
    }));
    const scene = projectScene(inputFor(snapshotWith(fixtures)));
    const fixtureTokens = scene.nodes
      .filter((node) => node.layer === "content")
      .map(({ styleToken }) => styleToken)
      .sort();

    expect(fixtureTokens).toEqual(
      kinds.map((kind) => `entity-fixture-${kind}`).sort(),
    );
  });

  it("projects, culls, and deterministically orders transient room candidates", () => {
    const input = inputFor(snapshotWith([]), {
      roomCandidates: [
        {
          key: "z-room",
          footprint: [
            { x: 0, y: 0 },
            { x: 50, y: 0 },
            { x: 50, y: 50 },
            { x: 0, y: 50 },
          ],
          represented: true,
          selected: false,
        },
        {
          key: "a-room",
          footprint: [
            { x: -100, y: -100 },
            { x: -50, y: -100 },
            { x: -50, y: -50 },
            { x: -100, y: -50 },
          ],
          represented: false,
          selected: true,
        },
        {
          key: "offscreen-room",
          footprint: [
            { x: 10_000, y: 10_000 },
            { x: 10_050, y: 10_000 },
            { x: 10_050, y: 10_050 },
          ],
          represented: false,
          selected: false,
        },
      ],
    });
    const first = projectScene(input);
    const repeated = projectScene(input);
    const candidates = first.nodes.filter(
      (node) => node.geometry.kind === "room-candidate",
    );

    expect(candidates.map((node) => (
      node.geometry.kind === "room-candidate"
        ? node.geometry.candidate.key
        : ""
    ))).toEqual(["a-room", "z-room"]);
    expect(candidates[0]?.geometry).toEqual({
      kind: "room-candidate",
      candidate: {
        key: "a-room",
        ring: [
          { x: 300, y: 400 },
          { x: 350, y: 400 },
          { x: 350, y: 350 },
          { x: 300, y: 350 },
        ],
        represented: false,
        selected: true,
      },
    });
    expect(repeated.nodes.map(({ key }) => key)).toEqual(
      first.nodes.map(({ key }) => key),
    );
  });
});

describe("projectScene M2.3 showroom routes", () => {
  function showroomNetwork(): RouteNetwork {
    const entrance = {
      id: uuid(300),
      name: "Entrance",
      tags: [],
      position: { x: -100, y: 0 },
      floorId: floorA.id,
      kind: "entrance" as const,
    };
    const stop = {
      id: uuid(301),
      name: "Product stop",
      tags: [],
      position: { x: 100, y: 0 },
      floorId: floorA.id,
      kind: "showroom-stop" as const,
    };
    const junction = {
      id: uuid(302),
      name: "Turn",
      tags: [],
      position: { x: 100, y: 100 },
      floorId: floorA.id,
      kind: "junction" as const,
    };
    const otherStart = {
      id: uuid(303),
      name: "Other floor start",
      tags: [],
      position: { x: 0, y: 0 },
      floorId: floorB.id,
      kind: "entrance" as const,
    };
    const otherEnd = {
      id: uuid(304),
      name: "Other floor end",
      tags: [],
      position: { x: 50, y: 0 },
      floorId: floorB.id,
      kind: "junction" as const,
    };
    return {
      id: uuid(320),
      name: "Showroom network",
      tags: [],
      nodes: [junction, otherEnd, entrance, stop, otherStart],
      edges: [
        {
          id: uuid(311),
          name: "Stop to turn",
          tags: [],
          from: stop.id,
          to: junction.id,
          distance: 100,
          bidirectional: true,
          accessible: true,
          enabled: true,
          width: 1200,
          weight: 1,
        },
        {
          id: uuid(312),
          name: "Other floor edge",
          tags: [],
          from: otherStart.id,
          to: otherEnd.id,
          distance: 50,
          bidirectional: true,
          accessible: true,
          enabled: true,
          width: 1200,
          weight: 1,
        },
        {
          id: uuid(310),
          name: "Entrance to stop",
          tags: [],
          from: entrance.id,
          to: stop.id,
          distance: 200,
          bidirectional: false,
          accessible: true,
          enabled: true,
          width: 1200,
          weight: 1,
        },
      ],
    };
  }

  it("uses a distinct product-hotspot style without changing durable identity", () => {
    const hotspot: PointOfInterest = {
      ...entityBase(330),
      type: "poi",
      kind: "product-hotspot",
      radius: 12,
    };
    const content: ProductContent = {
      id: uuid(331),
      name: "Hotspot content",
      tags: [],
      targetEntityId: hotspot.id,
      description: "Local product media",
      mediaAssetIds: [],
    };
    const snapshot = snapshotWith([hotspot], [], { productContents: [content] });

    const node = projectScene(inputFor(snapshot, {
      selectedIds: new Set([hotspot.id]),
    })).nodes.find(({ key }) => key === hotspot.id);

    expect(node).toMatchObject({
      key: hotspot.id,
      entityId: hotspot.id,
      styleToken: "entity-poi-product-hotspot",
      selected: true,
    });
  });

  it("projects one active-floor network with durable IDs and ordered route overlays", () => {
    const network = showroomNetwork();
    const inactiveStart = {
      id: uuid(340),
      name: "Inactive start",
      tags: [],
      position: { x: -200, y: -100 },
      floorId: floorA.id,
      kind: "entrance" as const,
    };
    const inactiveEnd = {
      id: uuid(341),
      name: "Inactive end",
      tags: [],
      position: { x: -150, y: -100 },
      floorId: floorA.id,
      kind: "junction" as const,
    };
    const inactiveEdge = {
      id: uuid(342),
      name: "Inactive edge",
      tags: [],
      from: inactiveStart.id,
      to: inactiveEnd.id,
      distance: 50,
      bidirectional: true,
      accessible: true,
      enabled: true,
      width: 1200,
      weight: 1,
    };
    const inactiveNetwork: RouteNetwork = {
      id: uuid(343),
      name: "Inactive network",
      tags: [],
      nodes: [inactiveStart, inactiveEnd],
      edges: [inactiveEdge],
    };
    const [junction, otherEnd, entrance, stop, otherStart] = network.nodes;
    const [bidirectional, otherFloorEdge, directed] = network.edges;
    const resolvedRoute: ResolvedRoute = {
      nodeIds: [entrance!.id, stop!.id, junction!.id],
      edgeIds: [directed!.id, bidirectional!.id],
      totalDistance: 300,
      turnPoints: [entrance!.position, stop!.position, junction!.position],
    };
    const snapshot = snapshotWith([], [], { routeNetworks: [inactiveNetwork, network] });
    const scene = projectScene(inputFor(snapshot, {
      activeRouteNetworkId: network.id,
      resolvedRoute,
      selectedIds: new Set([entrance!.id, directed!.id]),
    }));
    const routeNodes = scene.nodes.filter(({ geometry, layer }) => (
      geometry.kind === "route-node" && layer === "content"
    ));
    const authoredEdges = scene.nodes.filter(({ geometry, layer }) => (
      geometry.kind === "route-edge" && !geometry.resolved && layer === "content"
    ));
    const resolvedEdges = scene.nodes.filter(({ geometry }) => (
      geometry.kind === "route-edge" && geometry.resolved
    ));

    expect(routeNodes.map(({ key, entityId, styleToken }) => ({ key, entityId, styleToken }))).toEqual([
      { key: entrance!.id, entityId: entrance!.id, styleToken: "route-node-entrance" },
      { key: stop!.id, entityId: stop!.id, styleToken: "route-node-showroom-stop" },
      { key: junction!.id, entityId: junction!.id, styleToken: "route-node-junction" },
    ].sort((left, right) => left.key.localeCompare(right.key)));
    expect(routeNodes.find(({ key }) => key === entrance!.id)?.geometry).toEqual({
      kind: "route-node",
      center: { x: 300, y: 300 },
      nodeKind: "entrance",
    });
    expect(routeNodes.some(({ entityId }) => (
      entityId === otherStart!.id || entityId === otherEnd!.id
    ))).toBe(false);
    expect(routeNodes.some(({ entityId }) => (
      entityId === inactiveStart.id || entityId === inactiveEnd.id
    ))).toBe(false);
    expect(authoredEdges.map(({ key, entityId, styleToken, geometry }) => ({
      key,
      entityId,
      styleToken,
      geometry,
    }))).toEqual([
      {
        key: directed!.id,
        entityId: directed!.id,
        styleToken: "route-edge-directed",
        geometry: {
          kind: "route-edge",
          start: { x: 300, y: 300 },
          end: { x: 500, y: 300 },
          resolved: false,
        },
      },
      {
        key: bidirectional!.id,
        entityId: bidirectional!.id,
        styleToken: "route-edge-bidirectional",
        geometry: {
          kind: "route-edge",
          start: { x: 500, y: 300 },
          end: { x: 500, y: 200 },
          resolved: false,
        },
      },
    ].sort((left, right) => left.key.localeCompare(right.key)));
    expect(authoredEdges.some(({ entityId }) => entityId === otherFloorEdge!.id)).toBe(false);
    expect(authoredEdges.some(({ entityId }) => entityId === inactiveEdge.id)).toBe(false);
    expect(resolvedEdges.map(({ entityId }) => entityId)).toEqual([
      directed!.id,
      bidirectional!.id,
    ]);
    expect(resolvedEdges.every(({ styleToken }) => styleToken === "route-edge-resolved")).toBe(true);

    const selectionKeys = scene.nodes
      .filter(({ styleToken }) => styleToken.startsWith("selection-route-"))
      .map(({ key }) => key);
    expect(selectionKeys).toEqual([
      `__aethertwin:selection:${directed!.id}`,
      `__aethertwin:selection:${entrance!.id}`,
    ].sort());
    const lastAuthoredIndex = Math.max(...authoredEdges.map((edge) => scene.nodes.indexOf(edge)));
    const firstResolvedIndex = Math.min(...resolvedEdges.map((edge) => scene.nodes.indexOf(edge)));
    const firstSelectionIndex = Math.min(...selectionKeys.map((key) => (
      scene.nodes.findIndex((node) => node.key === key)
    )));
    expect(lastAuthoredIndex).toBeLessThan(firstResolvedIndex);
    expect(firstResolvedIndex).toBeLessThan(firstSelectionIndex);
  });
  it("hides authored and resolved route records for null or unknown active IDs", () => {
    const network = showroomNetwork();
    const snapshot = snapshotWith([], [], { routeNetworks: [network] });

    for (const activeRouteNetworkId of [null, uuid(999)]) {
      const scene = projectScene(inputFor(snapshot, {
        activeRouteNetworkId,
        resolvedRoute: null,
      }));

      expect(scene.nodes.some(({ geometry }) => (
        geometry.kind === "route-node" || geometry.kind === "route-edge"
      ))).toBe(false);
    }
  });
});
