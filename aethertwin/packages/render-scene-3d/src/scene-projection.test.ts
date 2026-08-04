import {
  createInitialSnapshot,
  type Boundary,
  type DimensionAnnotation,
  type Floor,
  type PlanLayer,
  type PlanReference,
  type PointOfInterest,
  type ProjectSnapshot,
  type SpaceUnit,
  type SpatialEntity,
  type SpatialEntityBase,
  type Zone,
} from "@aethertwin/core-model";
import {
  millimetresToScenePoint,
  projectScene,
  type SceneRendererInput,
} from "@aethertwin/render-scene-3d";
import { describe, expect, it } from "vitest";

const uuid = (value: number): string => (
  `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`
);

const initialIds = [1, 2, 3].map(uuid);
const base = createInitialSnapshot({
  name: "3D projection",
  profile: "showroom",
  uuid: () => initialIds.shift()!,
});
const baseFloor = base.project.floors[0]!;
const hiddenLayer: PlanLayer = {
  id: uuid(4), name: "Hidden", tags: [], visible: false, locked: false,
};
const floorA: Floor = { ...baseFloor, layers: [...baseFloor.layers, hiddenLayer] };
const floorB: Floor = {
  id: uuid(5), name: "Floor B", tags: [],
  layers: [{ id: uuid(6), name: "Default", tags: [], visible: true, locked: false }],
};

function entityBase(id: number, overrides: Partial<SpatialEntityBase> = {}): SpatialEntityBase {
  return {
    id: uuid(id), name: `Entity ${id}`, tags: [], floorId: floorA.id,
    layerId: floorA.layers[0]!.id, locked: false,
    transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
    ...overrides,
  };
}

function space(id: number, footprint: SpaceUnit["footprint"], overrides: Partial<SpaceUnit> = {}): SpaceUnit {
  return { ...entityBase(id), type: "space-unit", kind: "room", footprint, ...overrides };
}

function zone(id: number, polygon: Zone["polygon"], overrides: Partial<Zone> = {}): Zone {
  return {
    ...entityBase(id), type: "zone", purpose: "gallery", color: "#223344", polygon, ...overrides,
  };
}

function snapshotWith(
  entities: readonly SpatialEntity[],
  planReferences: readonly PlanReference[] = [],
): ProjectSnapshot {
  return {
    ...base,
    project: { ...base.project, floors: [floorA, floorB], entities, planReferences },
  };
}

function inputFor(
  snapshot: ProjectSnapshot,
  overrides: Partial<Omit<SceneRendererInput, "snapshot">> = {},
): SceneRendererInput {
  return {
    snapshot,
    activeFloorId: floorA.id,
    selectedIds: new Set<string>(),
    activeGuidedRoute: null,
    camera: {
      position: { x: 4, y: 5, z: 6 }, target: { x: 0, y: 0, z: 0 }, fieldOfView: 45,
    },
    assetIssues: [],
    ...overrides,
  };
}

describe("millimetresToScenePoint", () => {
  it("maps positive and negative plan axes into the fixed Three coordinate system", () => {
    expect(millimetresToScenePoint({ x: -2_500, y: 1_750 }, -500)).toEqual({
      x: -2.5, y: -0.5, z: -1.75,
    });
  });
});

describe("projectScene floor projection", () => {
  it("applies Transform2D before converting millimetres and entity elevation", () => {
    const room = space(10, [
      { x: -1_000, y: -500 }, { x: 1_000, y: -500 },
      { x: 1_000, y: 500 }, { x: -1_000, y: 500 },
    ], {
      transform: {
        translation: { x: 2_000, y: -3_000 }, rotation: Math.PI / 2, scale: { x: 2, y: 1 },
      },
      spatial3D: { elevation: 1_500, height: 2_700 },
    });

    const projection = projectScene(inputFor(snapshotWith([room])));

    expect(projection.issues).toEqual([]);
    expect(projection.records).toHaveLength(1);
    expect(projection.records[0]).toMatchObject({
      key: `floor:${room.id}`, kind: "floor", sourceIds: [room.id],
      selectionId: room.id, selected: false,
      bounds: { min: { x: 1.5, y: 1.5, z: 1 }, max: { x: 2.5, y: 1.5, z: 5 } },
    });
    expect(projection.records[0]!.geometry.positions).toEqual([
      2.5, 1.5, 5, 2.5, 1.5, 1, 1.5, 1.5, 1, 1.5, 1.5, 5,
    ]);
  });

  it("triangulates a concave polygon and normalizes floor UVs once in local bounds", () => {
    const room = space(11, [
      { x: 0, y: 0 }, { x: 3_000, y: 0 }, { x: 3_000, y: 1_000 },
      { x: 1_000, y: 1_000 }, { x: 1_000, y: 3_000 }, { x: 0, y: 3_000 },
    ]);

    const projection = projectScene(inputFor(snapshotWith([room])));
    const geometry = projection.records[0]!.geometry;

    expect(geometry.topology).toBe("triangles");
    expect(geometry.indices).toHaveLength(12);
    expect(geometry.indices.every((index) => index >= 0 && index < 6)).toBe(true);
    expect(geometry.normals).toEqual([
      0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    ]);
    expect(geometry.uvs).toEqual([
      0, 0, 1, 0, 1, 1 / 3, 1 / 3, 1 / 3, 1 / 3, 1, 0, 1,
    ]);
    expect(projection.bounds).toEqual({
      min: { x: 0, y: 0, z: -3 }, max: { x: 3, y: 0, z: 0 },
    });
  });

  it("filters inactive and hidden layers and explicitly ignores non-floor sources", () => {
    const visibleZone = zone(20, [
      { x: 0, y: 0 }, { x: 1_000, y: 0 }, { x: 0, y: 1_000 },
    ]);
    const hiddenZone = zone(21, visibleZone.polygon, { layerId: hiddenLayer.id });
    const otherFloorRoom = space(22, visibleZone.polygon, {
      floorId: floorB.id, layerId: floorB.layers[0]!.id,
    });
    const boundary: Boundary = { ...entityBase(23), type: "boundary", polygon: visibleZone.polygon };
    const poi: PointOfInterest = { ...entityBase(24), type: "poi", kind: "entrance" };
    const dimension: DimensionAnnotation = {
      ...entityBase(25), type: "dimension",
      start: { kind: "point", point: { x: 0, y: 0 } },
      end: { kind: "point", point: { x: 1_000, y: 0 } }, offset: 100,
    };
    const reference: PlanReference = {
      id: uuid(26), name: "Reference", tags: [], floorId: floorA.id,
      layerId: floorA.layers[0]!.id, assetId: uuid(27),
      intrinsicSize: { width: 100, height: 100 }, transform: entityBase(26).transform,
      opacity: 0.5, locked: false, calibration: null,
    };

    const projection = projectScene(inputFor(snapshotWith([
      boundary, dimension, hiddenZone, otherFloorRoom, poi, visibleZone,
    ], [reference])));

    expect(projection.issues).toEqual([]);
    expect(projection.records.map((record) => record.key)).toEqual([`floor:${visibleZone.id}`]);
  });

  it("sorts stable keys, owns selection state, and deeply freezes the result", () => {
    const later = zone(31, [
      { x: 0, y: 0 }, { x: 1_000, y: 0 }, { x: 0, y: 1_000 },
    ]);
    const earlier = space(30, later.polygon);
    const projection = projectScene(inputFor(snapshotWith([later, earlier]), {
      selectedIds: new Set([later.id]),
    }));

    expect(projection.records.map((record) => record.key)).toEqual([
      `floor:${earlier.id}`, `floor:${later.id}`,
    ]);
    expect(projection.records.map((record) => record.selected)).toEqual([false, true]);
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.records)).toBe(true);
    expect(Object.isFrozen(projection.records[0])).toBe(true);
    expect(Object.isFrozen(projection.records[0]!.geometry.positions)).toBe(true);
    expect(Object.isFrozen(projection.records[0]!.bounds.min)).toBe(true);
    expect(JSON.stringify(projectScene(inputFor(snapshotWith([later, earlier]))))).toBe(
      JSON.stringify(projectScene(inputFor(snapshotWith([later, earlier])))),
    );
  });

  it("sorts all failed source IDs and publishes no partial scene", () => {
    const valid = space(40, [
      { x: 0, y: 0 }, { x: 1_000, y: 0 }, { x: 0, y: 1_000 },
    ]);
    const selfIntersecting = space(42, [
      { x: 0, y: 0 }, { x: 1_000, y: 1_000 },
      { x: 0, y: 1_000 }, { x: 1_000, y: 0 },
    ]);
    const collinear = zone(41, [
      { x: 0, y: 0 }, { x: 1_000, y: 0 }, { x: 2_000, y: 0 },
    ]);

    const projection = projectScene(inputFor(snapshotWith([selfIntersecting, valid, collinear])));

    expect(projection).toEqual({
      records: [], bounds: null, requiredTextureAssetIds: [], environment: null,
      issues: [{
        code: "SCENE_FLOOR_TRIANGULATION_FAILED",
        sourceIds: [collinear.id, selfIntersecting.id],
      }],
    });
    expect(Object.isFrozen(projection.issues[0]!.sourceIds)).toBe(true);
  });
});
