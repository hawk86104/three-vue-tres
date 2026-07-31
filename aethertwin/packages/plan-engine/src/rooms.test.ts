import {
  createInitialSnapshot,
  type Fixture,
  type Floor,
  type PlanLayer,
  type Point2,
  type ProjectSnapshot,
  type SpaceUnit,
  type Wall,
} from "@aethertwin/core-model";
import { describe, expect, it } from "vitest";
import {
  recognizeClosedRooms,
  representedRoomCandidateKeys,
  roomCreationIntent,
  roomInputFingerprint,
  roomReplacementIntent,
  type PlanEditIntent,
  type RoomCandidate,
} from "./index";

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

const FLOOR_ID = uuid(1);
const LAYER_ID = uuid(2);

function layer(
  id: string,
  overrides: Partial<PlanLayer> = {},
): PlanLayer {
  return {
    id,
    name: id,
    tags: [],
    visible: true,
    locked: false,
    ...overrides,
  };
}

function floor(
  layers: readonly PlanLayer[] = [layer(LAYER_ID)],
  overrides: Partial<Floor> = {},
): Floor {
  return {
    id: FLOOR_ID,
    name: "Floor",
    tags: [],
    layers,
    ...overrides,
  };
}

function wall(
  id: string,
  centerLine: readonly Point2[],
  overrides: Partial<Wall> = {},
): Wall {
  return {
    type: "wall",
    id,
    name: id,
    tags: [],
    floorId: FLOOR_ID,
    layerId: LAYER_ID,
    transform: {
      translation: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    spatial3D: { elevation: 0, height: 3000 },
    locked: false,
    centerLine,
    thickness: 100,
    ...overrides,
  };
}

function squareWalls(
  startId: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): readonly Wall[] {
  return [
    wall(uuid(startId), [{ x: minX, y: minY }, { x: maxX, y: minY }]),
    wall(uuid(startId + 1), [{ x: maxX, y: minY }, { x: maxX, y: maxY }]),
    wall(uuid(startId + 2), [{ x: maxX, y: maxY }, { x: minX, y: maxY }]),
    wall(uuid(startId + 3), [{ x: minX, y: maxY }, { x: minX, y: minY }]),
  ];
}

function room(
  id: string,
  footprint: readonly Point2[],
  overrides: Partial<SpaceUnit> = {},
): SpaceUnit {
  return {
    type: "space-unit",
    kind: "room",
    id,
    name: "Existing Room",
    tags: ["keep"],
    floorId: FLOOR_ID,
    layerId: LAYER_ID,
    transform: {
      translation: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    locked: false,
    footprint,
    ...overrides,
  };
}

function fixture(id: string, overrides: Partial<Fixture> = {}): Fixture {
  return {
    type: "fixture",
    kind: "generic",
    id,
    name: "Fixture",
    tags: [],
    floorId: FLOOR_ID,
    layerId: LAYER_ID,
    transform: {
      translation: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    locked: false,
    size: { width: 100, height: 100 },
    ...overrides,
  };
}

function snapshot(input: {
  readonly floors?: readonly Floor[];
  readonly entities?: ProjectSnapshot["project"]["entities"];
} = {}): ProjectSnapshot {
  let nextId = 1000;
  const initial = createInitialSnapshot({
    name: "Rooms",
    profile: "showroom",
    uuid: () => uuid(nextId++),
  });
  return {
    ...initial,
    project: {
      ...initial.project,
      floors: input.floors ?? [floor()],
      entities: input.entities ?? [],
    },
  };
}

function expectCandidates(
  result: ReturnType<typeof recognizeClosedRooms>,
): readonly RoomCandidate[] {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Expected room candidates, received ${result.issue.code}`);
  return result.value;
}

function expectIntent(
  result:
    | ReturnType<typeof roomCreationIntent>
    | ReturnType<typeof roomReplacementIntent>,
): PlanEditIntent {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Expected room intent, received ${result.issue.code}`);
  return result.value;
}

function candidate(
  key: string,
  footprint: readonly Point2[],
  overrides: Partial<RoomCandidate> = {},
): RoomCandidate {
  return {
    key,
    footprint,
    wallIds: [],
    area: 1_000_000,
    perimeter: 4000,
    ...overrides,
  };
}

describe("recognizeClosedRooms", () => {
  it("walks angularly ordered half-edges and returns only the two bounded faces", () => {
    const walls = [
      ...squareWalls(10, 0, 0, 1000, 1000),
      wall(uuid(20), [{ x: 0, y: 0 }, { x: 1000, y: 1000 }]),
    ];
    const rooms = expectCandidates(recognizeClosedRooms({
      walls,
      toleranceMm: 0.1,
    }));

    expect(rooms).toHaveLength(2);
    expect(rooms.map(({ footprint }) => footprint)).toEqual([
      [
        { x: 0, y: 0 },
        { x: 1000, y: 1000 },
        { x: 0, y: 1000 },
      ],
      [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
        { x: 1000, y: 1000 },
      ],
    ]);
    expect(rooms.every(({ area }) => area === 500_000)).toBe(true);
  });

  it("normalizes counter-clockwise rings, removes collinear points, and uses the lexicographically smallest start", () => {
    const walls = [
      wall(uuid(30), [
        { x: 1000, y: 0 },
        { x: 500, y: 0 },
        { x: 0, y: 0 },
      ]),
      wall(uuid(31), [{ x: 0, y: 0 }, { x: 0, y: 1000 }]),
      wall(uuid(32), [{ x: 0, y: 1000 }, { x: 1000, y: 1000 }]),
      wall(uuid(33), [{ x: 1000, y: 1000 }, { x: 1000, y: 0 }]),
    ];
    const [recognized] = expectCandidates(recognizeClosedRooms({
      walls,
      toleranceMm: 0.1,
    }));

    expect(recognized?.footprint).toEqual([
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ]);
    expect(recognized?.wallIds).toEqual([
      uuid(30),
      uuid(31),
      uuid(32),
      uuid(33),
    ]);
    expect(recognized?.area).toBe(1_000_000);
    expect(recognized?.perimeter).toBe(4000);
  });

  it("uses unrounded ECMAScript number serialization for the transient canonical key", () => {
    const width = 1000.1 + 0.2;
    const [recognized] = expectCandidates(recognizeClosedRooms({
      walls: squareWalls(40, 0.1, 0.2, width, 1000.4),
      toleranceMm: 0.01,
    }));

    expect(recognized?.key).toBe(JSON.stringify(recognized?.footprint));
    expect(recognized?.key).toContain(String(width));
    expect(recognized?.key).not.toMatch(/room-|00000000-/);
  });

  it("retains exactly 250,000 square millimetres and filters smaller bounded faces", () => {
    const result = recognizeClosedRooms({
      walls: [
        ...squareWalls(50, 0, 0, 500, 500),
        ...squareWalls(60, 1000, 0, 1499, 500),
      ],
      toleranceMm: 0.1,
    });
    const rooms = expectCandidates(result);

    expect(rooms).toHaveLength(1);
    expect(rooms[0]?.area).toBe(250_000);
    expect(result).toMatchObject({
      ok: true,
      diagnostics: [{
        code: "FILTERED_SMALL_FACE",
        wallIds: [uuid(60), uuid(61), uuid(62), uuid(63)],
        area: 249_500,
      }],
    });
  });

  it("returns deterministic topology and dangling-edge diagnostics with candidates", () => {
    const result = recognizeClosedRooms({
      walls: [
        ...squareWalls(64, 0, 0, 1000, 1000),
        wall(uuid(68), [{ x: 1000, y: 1000 }, { x: 1500, y: 1500 }]),
        wall(uuid(69), [{ x: 2000, y: 2000 }, { x: 2000, y: 2000 }]),
      ],
      toleranceMm: 0.1,
    });

    expectCandidates(result);
    expect(result).toMatchObject({
      ok: true,
      diagnostics: [
        { code: "DANGLING_EDGE", wallIds: [uuid(68)] },
        {
          code: "ZERO_LENGTH_SEGMENT",
          wallIds: [uuid(69)],
          segmentIndices: [0],
        },
      ],
    });
  });

  it("returns nested and disconnected rooms in area, centroid, then key order", () => {
    const rooms = expectCandidates(recognizeClosedRooms({
      walls: [
        ...squareWalls(70, 0, 0, 2000, 2000),
        ...squareWalls(80, 500, 500, 1500, 1500),
        ...squareWalls(90, 3000, 0, 4000, 1000),
      ],
      toleranceMm: 0.1,
    }));

    expect(rooms).toHaveLength(3);
    expect(rooms.map(({ area }) => area)).toEqual([
      1_000_000,
      1_000_000,
      4_000_000,
    ]);
    expect(rooms.slice(0, 2).map(({ footprint }) => footprint[0])).toEqual([
      { x: 500, y: 500 },
      { x: 3000, y: 0 },
    ]);
  });

  it("returns byte-identical candidates under wall order, segment direction, and transforms", () => {
    const walls = squareWalls(100, 0, 0, 1000, 1000).map((candidateWall) => ({
      ...candidateWall,
      transform: {
        translation: { x: 200, y: 300 },
        rotation: Math.PI / 2,
        scale: { x: 2, y: 1 },
      },
    }));
    const permuted = [...walls].reverse().map((candidateWall) => ({
      ...candidateWall,
      centerLine: [...candidateWall.centerLine].reverse(),
    }));

    const original = recognizeClosedRooms({ walls, toleranceMm: 0.1 });
    const reordered = recognizeClosedRooms({ walls: permuted, toleranceMm: 0.1 });
    expect(JSON.stringify(reordered)).toBe(JSON.stringify(original));
  });

  it("propagates deterministic topology failures without partial candidates", () => {
    const result = recognizeClosedRooms({
      walls: [
        wall(uuid(110), [{ x: 0, y: 0 }, { x: 1000, y: 0 }]),
        wall(uuid(111), [{ x: 500, y: 0 }, { x: 1500, y: 0 }]),
      ],
      toleranceMm: 0.1,
    });

    expect(result).toMatchObject({
      ok: false,
      issue: { code: "COLLINEAR_OVERLAP" },
    });
    expect("value" in result).toBe(false);
  });
});

describe("representedRoomCandidateKeys", () => {
  it("matches exact normalized world rings and ignores non-room entities", () => {
    const exact = candidate("exact", [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ]);
    const different = candidate("different", [
      { x: 2000, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 1000 },
      { x: 2000, y: 1000 },
    ]);
    const existing = room(uuid(120), [
      { x: -100, y: -200 },
      { x: 900, y: -200 },
      { x: 900, y: 800 },
      { x: -100, y: 800 },
    ], {
      transform: {
        translation: { x: 100, y: 200 },
        rotation: 0,
        scale: { x: 1, y: 1 },
      },
    });

    expect(representedRoomCandidateKeys({
      candidates: [different, exact],
      entities: [fixture(uuid(121)), existing],
    })).toEqual(["exact"]);
  });
});

describe("roomCreationIntent", () => {
  it("creates one or all unrepresented candidates in one ordered intent", () => {
    const first = candidate("first", [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ]);
    const represented = candidate("represented", [
      { x: 2000, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 1000 },
      { x: 2000, y: 1000 },
    ]);
    const third = candidate("third", [
      { x: 4000, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 1000 },
      { x: 4000, y: 1000 },
    ]);
    const existingRoom = room(uuid(130), represented.footprint, {
      name: "Room 1",
    });
    const project = snapshot({
      floors: [
        floor([
          layer(uuid(131), { locked: true }),
          layer(uuid(132), { visible: false }),
          layer(uuid(133)),
        ]),
      ],
      entities: [
        existingRoom,
        fixture(uuid(134), { name: "Room 3" }),
      ],
    });
    const ids = [uuid(135), uuid(136)];
    const intent = expectIntent(roomCreationIntent({
      snapshot: project,
      floorId: FLOOR_ID,
      candidates: [first, represented, third],
      makeId: () => ids.shift()!,
    }));

    expect(intent.reason).toBe("create");
    expect(intent.changes).toHaveLength(2);
    expect(intent.changes.map(({ before }) => before)).toEqual([null, null]);
    expect(intent.changes.map(({ after }) => after)).toEqual([
      {
        type: "space-unit",
        kind: "room",
        id: uuid(135),
        name: "Room 2",
        tags: [],
        floorId: FLOOR_ID,
        layerId: uuid(133),
        transform: {
          translation: { x: 0, y: 0 },
          rotation: 0,
          scale: { x: 1, y: 1 },
        },
        locked: false,
        footprint: first.footprint,
      },
      {
        type: "space-unit",
        kind: "room",
        id: uuid(136),
        name: "Room 4",
        tags: [],
        floorId: FLOOR_ID,
        layerId: uuid(133),
        transform: {
          translation: { x: 0, y: 0 },
          rotation: 0,
          scale: { x: 1, y: 1 },
        },
        locked: false,
        footprint: third.footprint,
      },
    ]);

    const one = expectIntent(roomCreationIntent({
      snapshot: snapshot(),
      floorId: FLOOR_ID,
      candidates: [third],
      makeId: () => uuid(137),
    }));
    expect(one.changes).toHaveLength(1);
  });

  it("returns exact failures when no creation layer or no unrepresented candidate exists", () => {
    const target = candidate("target", squareWalls(140, 0, 0, 1000, 1000)
      .map((candidateWall) => candidateWall.centerLine[0]!));
    expect(roomCreationIntent({
      snapshot: snapshot({
        floors: [floor([layer(LAYER_ID, { locked: true })])],
      }),
      floorId: FLOOR_ID,
      candidates: [target],
      makeId: () => uuid(145),
    })).toMatchObject({
      ok: false,
      issue: { code: "NO_EDITABLE_CREATION_LAYER" },
    });

    expect(roomCreationIntent({
      snapshot: snapshot({ entities: [room(uuid(146), target.footprint)] }),
      floorId: FLOOR_ID,
      candidates: [target],
      makeId: () => uuid(147),
    })).toMatchObject({
      ok: false,
      issue: { code: "NO_UNREPRESENTED_ROOM_CANDIDATES" },
    });
  });
});

describe("roomReplacementIntent", () => {
  it("preserves identity and metadata while replacing the world footprint and resetting transform", () => {
    const existing = room(uuid(150), [
      { x: 0, y: 0 },
      { x: 500, y: 0 },
      { x: 500, y: 500 },
      { x: 0, y: 500 },
    ], {
      name: "Keep Name",
      tags: ["keep", "metadata"],
      layerId: LAYER_ID,
      locked: false,
      transform: {
        translation: { x: 100, y: 200 },
        rotation: Math.PI / 4,
        scale: { x: 2, y: 2 },
      },
      spatial3D: { elevation: 25, height: 2750 },
    });
    const replacement = candidate("replacement", [
      { x: 1000, y: 1000 },
      { x: 2000, y: 1000 },
      { x: 2000, y: 2000 },
      { x: 1000, y: 2000 },
    ]);
    const intent = expectIntent(roomReplacementIntent({
      snapshot: snapshot({ entities: [existing] }),
      roomId: existing.id,
      candidate: replacement,
    }));

    expect(intent).toEqual({
      reason: "properties",
      changes: [{
        id: existing.id,
        before: existing,
        after: {
          ...existing,
          footprint: replacement.footprint,
          transform: {
            translation: { x: 0, y: 0 },
            rotation: 0,
            scale: { x: 1, y: 1 },
          },
        },
      }],
    });
  });

  it.each([
    ["a locked room", { roomLocked: true, layerLocked: false, layerVisible: true }],
    ["a locked layer", { roomLocked: false, layerLocked: true, layerVisible: true }],
    ["a hidden layer", { roomLocked: false, layerLocked: false, layerVisible: false }],
  ])("rejects replacement for %s", (_label, state) => {
    const target = room(uuid(160), [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ], { locked: state.roomLocked });
    const result = roomReplacementIntent({
      snapshot: snapshot({
        floors: [floor([layer(LAYER_ID, {
          locked: state.layerLocked,
          visible: state.layerVisible,
        })])],
        entities: [target],
      }),
      roomId: target.id,
      candidate: candidate("replacement", target.footprint),
    });
    expect(result).toMatchObject({
      ok: false,
      issue: {
        code: "INVALID_ROOM_REPLACEMENT",
        entityId: target.id,
      },
    });
  });
});

describe("roomInputFingerprint", () => {
  it("changes for relevant floor, visibility, wall order, geometry, transform, thickness, or tolerance changes", () => {
    const first = wall(uuid(170), [{ x: 0, y: 0 }, { x: 1000, y: 0 }]);
    const second = wall(uuid(171), [{ x: 1000, y: 0 }, { x: 1000, y: 1000 }]);
    const base = snapshot({ entities: [first, second] });
    const fingerprint = roomInputFingerprint({
      snapshot: base,
      floorId: FLOOR_ID,
      toleranceMm: 5,
    });
    const changedInputs: ProjectSnapshot[] = [
      { ...base, project: { ...base.project, floors: [floor([], { id: uuid(172) })] } },
      {
        ...base,
        project: {
          ...base.project,
          floors: [floor([layer(LAYER_ID, { visible: false })])],
        },
      },
      { ...base, project: { ...base.project, entities: [second, first] } },
      {
        ...base,
        project: {
          ...base.project,
          entities: [{ ...first, centerLine: [{ x: 0, y: 0 }, { x: 999, y: 0 }] }, second],
        },
      },
      {
        ...base,
        project: {
          ...base.project,
          entities: [{
            ...first,
            transform: { ...first.transform, translation: { x: 1, y: 0 } },
          }, second],
        },
      },
      {
        ...base,
        project: {
          ...base.project,
          entities: [{ ...first, thickness: 101 }, second],
        },
      },
    ];

    for (const changed of changedInputs) {
      expect(roomInputFingerprint({
        snapshot: changed,
        floorId: changed.project.floors[0]?.id ?? FLOOR_ID,
        toleranceMm: 5,
      })).not.toBe(fingerprint);
    }
    expect(roomInputFingerprint({
      snapshot: base,
      floorId: FLOOR_ID,
      toleranceMm: 5.1,
    })).not.toBe(fingerprint);
  });

  it("ignores project metadata, fixtures, hidden-wall geometry, wall lock, and layer lock", () => {
    const visibleWall = wall(uuid(180), [{ x: 0, y: 0 }, { x: 1000, y: 0 }]);
    const hiddenLayerId = uuid(181);
    const hiddenWall = wall(uuid(182), [{ x: 0, y: 0 }, { x: 0, y: 1000 }], {
      layerId: hiddenLayerId,
    });
    const base = snapshot({
      floors: [floor([
        layer(LAYER_ID),
        layer(hiddenLayerId, { visible: false }),
      ])],
      entities: [visibleWall, hiddenWall, fixture(uuid(183))],
    });
    const changed: ProjectSnapshot = {
      ...base,
      sequence: base.sequence + 100,
      project: {
        ...base.project,
        name: "Ignored metadata",
        tags: ["ignored"],
        floors: [floor([
          layer(LAYER_ID, { name: "Renamed", locked: true }),
          layer(hiddenLayerId, { visible: false }),
        ])],
        entities: [
          { ...visibleWall, name: "Renamed", tags: ["ignored"], locked: true },
          {
            ...hiddenWall,
            centerLine: [{ x: 9999, y: 9999 }, { x: 10000, y: 10000 }],
          },
          fixture(uuid(184), { size: { width: 999, height: 999 } }),
        ],
      },
    };

    expect(roomInputFingerprint({
      snapshot: changed,
      floorId: FLOOR_ID,
      toleranceMm: 5,
    })).toBe(roomInputFingerprint({
      snapshot: base,
      floorId: FLOOR_ID,
      toleranceMm: 5,
    }));
  });
});
