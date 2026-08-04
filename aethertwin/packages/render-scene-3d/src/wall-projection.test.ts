import {
  createInitialSnapshot,
  type Floor,
  type Opening,
  type ProjectSnapshot,
  type SpaceUnit,
  type Wall,
} from "@aethertwin/core-model";
import {
  projectScene,
  type SceneRecord,
  type SceneRendererInput,
} from "@aethertwin/render-scene-3d";
import { describe, expect, it } from "vitest";

const uuid = (value: number): string => (
  `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`
);

const initialIds = [1, 2, 3].map(uuid);
const base = createInitialSnapshot({
  name: "3D walls",
  profile: "showroom",
  uuid: () => initialIds.shift()!,
});
const floor: Floor = base.project.floors[0]!;
const layerId = floor.layers[0]!.id;

function wall(
  id: number,
  centerLine: Wall["centerLine"],
  overrides: Partial<Wall> = {},
): Wall {
  return {
    id: uuid(id),
    name: `Wall ${id}`,
    tags: [],
    type: "wall",
    floorId: floor.id,
    layerId,
    locked: false,
    transform: {
      translation: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    centerLine,
    thickness: 200,
    ...overrides,
  };
}

function opening(
  id: number,
  wallId: string,
  overrides: Partial<Opening> = {},
): Opening {
  return {
    id: uuid(id),
    name: `Opening ${id}`,
    tags: [],
    wallId,
    kind: "door",
    distanceAlongWall: 2_000,
    width: 1_000,
    height: 2_100,
    sillHeight: 0,
    ...overrides,
  };
}

function floorRoom(id: number): SpaceUnit {
  return {
    id: uuid(id),
    name: "Room",
    tags: [],
    type: "space-unit",
    kind: "room",
    floorId: floor.id,
    layerId,
    locked: false,
    transform: {
      translation: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    footprint: [
      { x: 0, y: 0 },
      { x: 2_000, y: 0 },
      { x: 0, y: 2_000 },
    ],
  };
}

function snapshotWith(
  walls: readonly Wall[],
  openings: readonly Opening[] = [],
  extraEntities: readonly SpaceUnit[] = [],
): ProjectSnapshot {
  return {
    ...base,
    project: {
      ...base.project,
      entities: [...extraEntities, ...walls],
      openings,
    },
  };
}

function inputFor(
  snapshot: ProjectSnapshot,
  selectedIds: ReadonlySet<string> = new Set(),
): SceneRendererInput {
  return {
    snapshot,
    activeFloorId: floor.id,
    selectedIds,
    activeGuidedRoute: null,
    camera: {
      position: { x: 4, y: 5, z: 6 },
      target: { x: 0, y: 0, z: 0 },
      fieldOfView: 45,
    },
    assetIssues: [],
  };
}

function recordByKey(records: readonly SceneRecord[], key: string): SceneRecord {
  const record = records.find((candidate) => candidate.key === key);
  if (record === undefined) throw new Error(`Missing scene record ${key}`);
  return record;
}

describe("projectScene wall projection", () => {
  it("creates one square-ended full-height prism with the default wall height", () => {
    const source = wall(50, [{ x: 0, y: 0 }, { x: 4_000, y: 0 }]);

    const projection = projectScene(inputFor(snapshotWith([source])));
    const record = recordByKey(projection.records, `wall-piece:${source.id}:0:full:0`);

    expect(projection.issues).toEqual([]);
    expect(projection.records).toHaveLength(1);
    expect(record).toMatchObject({
      kind: "wall-piece",
      sourceIds: [source.id],
      selectionId: source.id,
      selected: false,
      bounds: {
        min: { x: 0, y: 0, z: -0.1 },
        max: { x: 4, y: 3, z: 0.1 },
      },
      geometry: { topology: "triangles" },
      material: { role: "wall", baseColor: "#c8d2d8", opacity: 1 },
    });
    expect(record.geometry.positions).toHaveLength(72);
    expect(record.geometry.normals).toHaveLength(72);
    expect(record.geometry.indices).toHaveLength(36);
  });

  it("projects every segment of a bent wall with explicit elevation and height", () => {
    const source = wall(51, [
      { x: 0, y: 0 },
      { x: 2_000, y: 0 },
      { x: 2_000, y: 3_000 },
    ], { spatial3D: { elevation: 500, height: 2_400 } });

    const projection = projectScene(inputFor(snapshotWith([source])));

    expect(projection.records.map(({ key }) => key)).toEqual([
      `wall-piece:${source.id}:0:full:0`,
      `wall-piece:${source.id}:1:full:0`,
    ]);
    expect(recordByKey(
      projection.records,
      `wall-piece:${source.id}:1:full:0`,
    ).bounds).toEqual({
      min: { x: 1.9, y: 0.5, z: -3 },
      max: { x: 2.1, y: 2.9, z: 0 },
    });
    expect(projection.bounds).toEqual({
      min: { x: 0, y: 0.5, z: -3 },
      max: { x: 2.1, y: 2.9, z: 0.1 },
    });
  });

  it("splits multiple openings into full-height, lintel, and sill pieces", () => {
    const source = wall(60, [{ x: 0, y: 0 }, { x: 10_000, y: 0 }], {
      spatial3D: { elevation: 100, height: 3_000 },
    });
    const door = opening(62, source.id);
    const windowOpening = opening(61, source.id, {
      kind: "window",
      distanceAlongWall: 6_000,
      width: 2_000,
      height: 1_200,
      sillHeight: 900,
    });

    const projection = projectScene(inputFor(
      snapshotWith([source], [windowOpening, door]),
      new Set([source.id, windowOpening.id]),
    ));
    const pieces = projection.records.filter(({ kind }) => kind === "wall-piece");
    const proxies = projection.records.filter(({ kind }) => kind === "opening");

    expect(pieces).toHaveLength(6);
    expect(proxies).toHaveLength(2);
    expect(pieces.map(({ key }) => key)).toEqual([
      `wall-piece:${source.id}:0:full:0`,
      `wall-piece:${source.id}:0:full:1`,
      `wall-piece:${source.id}:0:full:2`,
      `wall-piece:${source.id}:0:lintel:${windowOpening.id}`,
      `wall-piece:${source.id}:0:lintel:${door.id}`,
      `wall-piece:${source.id}:0:sill:${windowOpening.id}`,
    ].sort());
    expect(recordByKey(
      projection.records,
      `wall-piece:${source.id}:0:lintel:${door.id}`,
    ).bounds).toMatchObject({ min: { x: 1.5, y: 2.2 }, max: { x: 2.5, y: 3.1 } });
    expect(recordByKey(
      projection.records,
      `wall-piece:${source.id}:0:sill:${windowOpening.id}`,
    ).bounds).toMatchObject({ min: { x: 5, y: 0.1 }, max: { x: 7, y: 1 } });
    expect(recordByKey(
      projection.records,
      `wall-piece:${source.id}:0:lintel:${windowOpening.id}`,
    ).bounds).toMatchObject({ min: { x: 5, y: 2.2 }, max: { x: 7, y: 3.1 } });
    expect(pieces.every(({ selectionId, selected }) => selectionId === source.id && selected)).toBe(true);

    const doorProxy = recordByKey(projection.records, `opening:${door.id}`);
    const windowProxy = recordByKey(projection.records, `opening:${windowOpening.id}`);
    expect(doorProxy).toMatchObject({
      kind: "opening",
      sourceIds: [source.id, door.id].sort(),
      selectionId: door.id,
      selected: false,
      bounds: { min: { x: 1.5, y: 0.1 }, max: { x: 2.5, y: 2.2 } },
      geometry: { topology: "lines" },
      material: { opacity: 0.24 },
    });
    expect(windowProxy).toMatchObject({
      sourceIds: [source.id, windowOpening.id].sort(),
      selectionId: windowOpening.id,
      selected: true,
      bounds: { min: { x: 5, y: 1 }, max: { x: 7, y: 2.2 } },
    });
    expect(doorProxy.geometry.indices).toHaveLength(24);
  });

  it("locates an opening by cumulative distance on the second bent segment", () => {
    const source = wall(70, [
      { x: 0, y: 0 },
      { x: 2_000, y: 0 },
      { x: 2_000, y: 4_000 },
    ]);
    const door = opening(71, source.id, { distanceAlongWall: 3_500 });

    const projection = projectScene(inputFor(snapshotWith([source], [door])));
    const proxy = recordByKey(projection.records, `opening:${door.id}`);

    expect(proxy.bounds).toEqual({
      min: { x: 1.9, y: 0, z: -2 },
      max: { x: 2.1, y: 2.1, z: -1 },
    });
    expect(projection.records.some(({ key }) => (
      key === `wall-piece:${source.id}:1:lintel:${door.id}`
    ))).toBe(true);
  });

  it("fails closed with sorted source IDs when wall geometry is invalid", () => {
    const validFloor = floorRoom(80);
    const invalidWall = wall(82, [{ x: 0, y: 0 }, { x: 0, y: 0 }]);
    const invalidOpening = opening(81, invalidWall.id);

    const projection = projectScene(inputFor(snapshotWith(
      [invalidWall],
      [invalidOpening],
      [validFloor],
    )));

    expect(projection).toEqual({
      records: [],
      bounds: null,
      requiredTextureAssetIds: [],
      issues: [{
        code: "SCENE_WALL_PROJECTION_FAILED",
        sourceIds: [invalidOpening.id, invalidWall.id].sort(),
      }],
    });
  });
});
