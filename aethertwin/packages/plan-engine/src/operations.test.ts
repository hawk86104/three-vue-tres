import type {
  Boundary,
  DimensionAnnotation,
  Fixture,
  Point2,
  PointOfInterest,
  SpaceUnit,
  SpatialEntity,
  Wall,
  Zone,
} from "@aethertwin/core-model";
import {
  createInitialSnapshot,
  parseSnapshotV3,
} from "@aethertwin/core-model";
import { describe, expect, it } from "vitest";
import {
  alignEntities,
  distributeEntities,
  duplicateEntities,
  entityWorldBounds,
  linearArray,
  rectangularArray,
  resizeEntities,
  rotateEntities,
  translateEntities,
  type PlanEditIntent,
  type PlanResult,
} from "./index";

const floorId = "00000000-0000-4000-8000-000000000001";
const layerId = "00000000-0000-4000-8000-000000000002";

function fixtureAt(
  id: string,
  x: number,
  width = 100,
  y = 0,
  height = 100,
): Fixture {
  return {
    type: "fixture",
    id,
    name: `Fixture ${id}`,
    tags: [],
    floorId,
    layerId,
    locked: false,
    transform: { translation: { x, y }, rotation: 0, scale: { x: 1, y: 1 } },
    kind: "generic",
    size: { width, height },
  };
}

function boundaryAt(id: string): Boundary {
  return {
    type: "boundary",
    id,
    name: "Boundary",
    tags: [],
    floorId,
    layerId,
    locked: false,
    transform: {
      translation: { x: 10, y: 20 },
      rotation: 0,
      scale: { x: 2, y: 3 },
    },
    polygon: [{ x: 1, y: 2 }, { x: 5, y: 2 }, { x: 5, y: 7 }],
  };
}

function canonicalBoundary(id: string, polygon: readonly Point2[]): Boundary {
  const ids = [
    "00000000-0000-4000-8000-000000000100",
    "00000000-0000-4000-8000-000000000101",
    "00000000-0000-4000-8000-000000000102",
  ];
  const snapshot = createInitialSnapshot({
    name: "Canonical polygon test",
    profile: "market",
    uuid: () => ids.shift()!,
  });
  const floor = snapshot.project.floors[0]!;
  const boundary: Boundary = {
    ...boundaryAt(id),
    floorId: floor.id,
    layerId: floor.layers[0]!.id,
    transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
    polygon,
  };
  const parsed = parseSnapshotV3({
    ...snapshot,
    project: { ...snapshot.project, entities: [boundary] },
  });
  return parsed.project.entities[0] as Boundary;
}

function wallAt(id: string): Wall {
  return {
    type: "wall",
    id,
    name: "Wall",
    tags: [],
    floorId,
    layerId,
    locked: false,
    transform: {
      translation: { x: 10, y: 20 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    centerLine: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    thickness: 10,
  };
}
function zoneAt(id: string): Zone {
  return {
    ...boundaryAt(id),
    type: "zone",
    name: "Zone",
    purpose: "test",
    color: "#123456",
  };
}

function spaceUnitAt(id: string): SpaceUnit {
  const { polygon, ...base } = boundaryAt(id);
  return {
    ...base,
    type: "space-unit",
    name: "Space",
    kind: "room",
    footprint: polygon,
  };
}

function poiAt(id: string): PointOfInterest {
  const { size, ...base } = fixtureAt(id, 0);
  void size;
  return {
    ...base,
    type: "poi",
    name: "POI",
    kind: "entrance",
    radius: 10,
  };
}

function dimensionAt(id: string): DimensionAnnotation {
  const { size, ...base } = fixtureAt(id, 0);
  void size;
  return {
    ...base,
    type: "dimension",
    name: "Dimension",
    start: { kind: "point", point: { x: 0, y: 0 } },
    end: { kind: "point", point: { x: 100, y: 0 } },
    offset: 10,
  };
}

function centerX(entity: SpatialEntity): number {
  const bounds = entityWorldBounds(entity);
  return bounds.min.x + (bounds.max.x - bounds.min.x) / 2;
}

function intentOf(result: PlanResult<PlanEditIntent>): PlanEditIntent {
  if (!result.ok) throw new Error(`${result.issue.code}: ${result.issue.message}`);
  return result.value;
}

function afterById(intent: PlanEditIntent): ReadonlyMap<string, SpatialEntity> {
  return new Map(intent.changes.flatMap((change) => (
    change.after === null ? [] : [[change.id, change.after] as const]
  )));
}

describe("plan batch transform operations", () => {
  it("translates every entity in one exact transform intent without mutating inputs", () => {
    const first = fixtureAt("00000000-0000-4000-8000-000000000010", 25, 100, 40);
    const second = fixtureAt("00000000-0000-4000-8000-000000000011", -5, 50, 70);
    const originalJson = JSON.stringify([first, second]);

    const intent = intentOf(translateEntities([first, second], { x: 15, y: -20 }));

    expect(intent).toEqual({
      reason: "transform",
      changes: [
        {
          id: first.id,
          before: first,
          after: {
            ...first,
            transform: { ...first.transform, translation: { x: 40, y: 20 } },
          },
        },
        {
          id: second.id,
          before: second,
          after: {
            ...second,
            transform: { ...second.transform, translation: { x: 10, y: 50 } },
          },
        },
      ],
    });
    expect(JSON.stringify([first, second])).toBe(originalJson);
  });

  it("rotates transforms by a finite delta and normalizes the resulting angle", () => {
    const fixture = fixtureAt("00000000-0000-4000-8000-000000000010", 25);
    const input: Fixture = {
      ...fixture,
      transform: { ...fixture.transform, rotation: Math.PI * 1.5 },
    };

    const intent = intentOf(rotateEntities([input], Math.PI));

    expect(intent.reason).toBe("transform");
    expect(intent.changes[0]).toEqual({
      id: input.id,
      before: input,
      after: {
        ...input,
        transform: { ...input.transform, rotation: Math.PI / 2 },
      },
    });
  });

  it("bakes rectangle dimensions and polygon vertices into identity scale", () => {
    const fixture = fixtureAt("00000000-0000-4000-8000-000000000010", 25, 100, 40, 50);
    const scaledFixture: Fixture = {
      ...fixture,
      transform: { ...fixture.transform, scale: { x: 2, y: 3 } },
    };
    const boundary = boundaryAt("00000000-0000-4000-8000-000000000011");

    const intent = intentOf(resizeEntities([scaledFixture, boundary], { x: 0.5, y: 2 }));
    const after = afterById(intent);

    expect(intent.reason).toBe("transform");
    expect(after.get(scaledFixture.id)).toEqual({
      ...scaledFixture,
      transform: { ...scaledFixture.transform, scale: { x: 1, y: 1 } },
      size: { width: 100, height: 300 },
    });
    expect(after.get(boundary.id)).toEqual({
      ...boundary,
      transform: { ...boundary.transform, scale: { x: 1, y: 1 } },
      polygon: [{ x: 1, y: 12 }, { x: 5, y: 12 }, { x: 5, y: 42 }],
    });
  });

  it("bakes uniform wall scale and rejects a non-uniform wall request deterministically", () => {
    const wall = wallAt("00000000-0000-4000-8000-000000000010");

    const intent = intentOf(resizeEntities([wall], { x: 2, y: 2 }));
    expect(intent.changes[0]!.after).toEqual({
      ...wall,
      transform: { ...wall.transform, scale: { x: 1, y: 1 } },
      centerLine: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
      thickness: 20,
    });

    const rejected = resizeEntities([wall], { x: 2, y: 1 });
    expect(rejected).toEqual({
      ok: false,
      issue: {
        code: "NON_UNIFORM_WALL_SCALE",
        message: "Walls require a uniform resize scale.",
        entityId: wall.id,
      },
    });
  });


  it("resizes zone, space-unit, POI, and dimension values into representable owned entities", () => {
    const zone = zoneAt("00000000-0000-4000-8000-000000000020");
    const space = spaceUnitAt("00000000-0000-4000-8000-000000000021");
    const poi = poiAt("00000000-0000-4000-8000-000000000022");
    const dimension = dimensionAt("00000000-0000-4000-8000-000000000023");

    const intent = intentOf(resizeEntities([zone, space, poi, dimension], { x: 2, y: 2 }));
    const after = afterById(intent);

    expect(after.get(zone.id)).toMatchObject({
      type: "zone",
      transform: { scale: { x: 1, y: 1 } },
      polygon: [{ x: 4, y: 12 }, { x: 20, y: 12 }, { x: 20, y: 42 }],
    });
    expect(after.get(space.id)).toMatchObject({
      type: "space-unit",
      transform: { scale: { x: 1, y: 1 } },
      footprint: [{ x: 4, y: 12 }, { x: 20, y: 12 }, { x: 20, y: 42 }],
    });
    expect(after.get(poi.id)).toMatchObject({
      type: "poi",
      transform: { scale: { x: 2, y: 2 } },
      radius: 10,
    });
    expect(after.get(dimension.id)).toMatchObject({
      type: "dimension",
      transform: { scale: { x: 2, y: 2 } },
      offset: 10,
    });
    for (const entity of [zone, space, poi, dimension]) {
      expect(after.get(entity.id)).not.toBe(entity);
    }
  });

  it("rejects a canonical narrow U polygon that becomes self-touching after resize", () => {
    const boundary = canonicalBoundary(
      "00000000-0000-4000-8000-000000000045",
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 3, y: 4 },
        { x: 3, y: Number.MIN_VALUE },
        { x: 1, y: Number.MIN_VALUE },
        { x: 1, y: 4 },
        { x: 0, y: 4 },
      ],
    );

    expect(resizeEntities([boundary], { x: 1, y: 0.5 })).toEqual({
      ok: false,
      issue: {
        code: "INVALID_RESIZE",
        message: "Resize result must contain finite, positive, non-degenerate geometry.",
        entityId: boundary.id,
      },
    });
  });

  it("accepts an identity resize of a canonical finite polygon with overflowing area arithmetic", () => {
    const boundary = canonicalBoundary(
      "00000000-0000-4000-8000-000000000046",
      [
        { x: 0, y: 0 },
        { x: Number.MAX_VALUE, y: 0 },
        { x: 0, y: Number.MAX_VALUE },
      ],
    );

    const result = resizeEntities([boundary], { x: 1, y: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.issue.message);
    expect(result.value.changes[0]!.after).toEqual(boundary);
    expect(result.value.changes[0]!.after).not.toBe(boundary);
  });

  it("accepts an identity resize of a canonical mixed-magnitude polygon", () => {
    const boundary = canonicalBoundary(
      "00000000-0000-4000-8000-000000000047",
      [
        { x: 0, y: 0 },
        { x: 2, y: 2 },
        { x: Number.MAX_VALUE, y: 2 },
        { x: 2, y: 3 },
        { x: 0, y: 1 },
      ],
    );

    const result = resizeEntities([boundary], { x: 1, y: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.issue.message);
    expect(result.value.changes[0]!.after).toEqual(boundary);
    expect(result.value.changes[0]!.after).not.toBe(boundary);
  });

  it("accepts identity resize when exact orientation survives infinite-product cancellation", () => {
    const magnitude = 2 ** 1022;
    const epsilon = 2 ** -52;
    const boundary = canonicalBoundary(
      "00000000-0000-4000-8000-000000000048",
      [
        { x: 0, y: 0 },
        { x: magnitude * (1 + epsilon), y: magnitude },
        { x: 2 * magnitude, y: 0 },
        { x: magnitude, y: magnitude * (1 - epsilon) },
        { x: 0, y: -magnitude },
      ],
    );

    const result = resizeEntities([boundary], { x: 1, y: 1 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.issue.message);
    expect(result.value.changes[0]!.after).toEqual(boundary);
    expect(result.value.changes[0]!.after).not.toBe(boundary);
  });

  const identityTransform = {
    translation: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
  };
  const overflowTriangle = [
    { x: 0, y: 0 },
    { x: Number.MAX_VALUE, y: 0 },
    { x: 0, y: 1 },
  ];
  const unitTriangle = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
  const invalidResizeCases: readonly [
    string,
    SpatialEntity,
    Point2,
  ][] = [
    ["fixture overflow", {
      ...fixtureAt("00000000-0000-4000-8000-000000000030", 0),
      size: { width: Number.MAX_VALUE, height: 1 },
    }, { x: 2, y: 2 }],
    ["fixture underflow", {
      ...fixtureAt("00000000-0000-4000-8000-000000000031", 0),
      size: { width: Number.MIN_VALUE, height: 1 },
    }, { x: 0.5, y: 0.5 }],
    ["boundary overflow", {
      ...boundaryAt("00000000-0000-4000-8000-000000000032"),
      transform: identityTransform,
      polygon: overflowTriangle,
    }, { x: 2, y: 2 }],
    ["boundary underflow", {
      ...boundaryAt("00000000-0000-4000-8000-000000000033"),
      transform: identityTransform,
      polygon: unitTriangle,
    }, { x: Number.MIN_VALUE, y: Number.MIN_VALUE }],
    ["zone overflow", {
      ...zoneAt("00000000-0000-4000-8000-000000000034"),
      transform: identityTransform,
      polygon: overflowTriangle,
    }, { x: 2, y: 2 }],
    ["zone underflow", {
      ...zoneAt("00000000-0000-4000-8000-000000000035"),
      transform: identityTransform,
      polygon: unitTriangle,
    }, { x: Number.MIN_VALUE, y: Number.MIN_VALUE }],
    ["space-unit overflow", {
      ...spaceUnitAt("00000000-0000-4000-8000-000000000036"),
      transform: identityTransform,
      footprint: overflowTriangle,
    }, { x: 2, y: 2 }],
    ["space-unit underflow", {
      ...spaceUnitAt("00000000-0000-4000-8000-000000000037"),
      transform: identityTransform,
      footprint: unitTriangle,
    }, { x: Number.MIN_VALUE, y: Number.MIN_VALUE }],
    ["wall overflow", {
      ...wallAt("00000000-0000-4000-8000-000000000038"),
      transform: identityTransform,
      centerLine: [{ x: 0, y: 0 }, { x: Number.MAX_VALUE, y: 0 }],
    }, { x: 2, y: 2 }],
    ["wall underflow", {
      ...wallAt("00000000-0000-4000-8000-000000000039"),
      transform: identityTransform,
      centerLine: [{ x: 0, y: 0 }, { x: Number.MIN_VALUE, y: 0 }],
      thickness: Number.MIN_VALUE,
    }, { x: 0.5, y: 0.5 }],
    ["POI overflow", {
      ...poiAt("00000000-0000-4000-8000-000000000040"),
      transform: identityTransform,
      radius: Number.MAX_VALUE,
    }, { x: 2, y: 2 }],
    ["POI underflow", {
      ...poiAt("00000000-0000-4000-8000-000000000041"),
      transform: { ...identityTransform, scale: { x: Number.MIN_VALUE, y: Number.MIN_VALUE } },
    }, { x: 0.5, y: 0.5 }],
    ["dimension overflow", {
      ...dimensionAt("00000000-0000-4000-8000-000000000042"),
      transform: identityTransform,
      end: { kind: "point", point: { x: Number.MAX_VALUE, y: 0 } },
    }, { x: 2, y: 2 }],
    ["dimension underflow", {
      ...dimensionAt("00000000-0000-4000-8000-000000000043"),
      transform: { ...identityTransform, scale: { x: Number.MIN_VALUE, y: Number.MIN_VALUE } },
    }, { x: 0.5, y: 0.5 }],
  ];

  it.each(invalidResizeCases)(
    "rejects unrepresentable %s post-resize geometry without mutating the source",
    (_name, entity, scale) => {
      const originalJson = JSON.stringify(entity);
      const result = resizeEntities([entity], scale);

      expect(result).toEqual({
        ok: false,
        issue: {
          code: "INVALID_RESIZE",
          message: "Resize result must contain finite, positive, non-degenerate geometry.",
          entityId: entity.id,
        },
      });
      expect(JSON.stringify(entity)).toBe(originalJson);
    },
  );

  it("rejects an exactly unequal near-equal wall scale", () => {
    const wall = wallAt("00000000-0000-4000-8000-000000000044");
    const result = resizeEntities([wall], { x: 1, y: 1 + Number.EPSILON });

    expect(result).toEqual({
      ok: false,
      issue: {
        code: "NON_UNIFORM_WALL_SCALE",
        message: "Walls require a uniform resize scale.",
        entityId: wall.id,
      },
    });
  });
});

describe("plan duplication and array operations", () => {
  it("duplicates source entities with deep-owned values and canonical supplied IDs", () => {
    const fixture: Fixture = {
      ...fixtureAt("00000000-0000-4000-8000-000000000010", 10),
      tags: ["owned"],
    };
    const queue = ["00000000-0000-4000-8000-000000000011"];

    const intent = intentOf(duplicateEntities([fixture], { x: 25, y: -5 }, () => queue.shift()!));
    const copy = intent.changes[0]!.after as Fixture;

    expect(intent.reason).toBe("duplicate");
    expect(intent.changes[0]).toEqual({ id: copy.id, before: null, after: copy });
    expect(copy).toEqual({
      ...fixture,
      id: "00000000-0000-4000-8000-000000000011",
      transform: { ...fixture.transform, translation: { x: 35, y: -5 } },
    });
    expect(copy).not.toBe(fixture);
    expect(copy.tags).not.toBe(fixture.tags);
    expect(copy.transform).not.toBe(fixture.transform);
    expect(copy.size).not.toBe(fixture.size);

    (fixture.tags as string[]).push("caller mutation");
    (fixture.size as { width: number; height: number }).width = 999;
    expect(copy.tags).toEqual(["owned"]);
    expect(copy.size.width).toBe(100);
  });

  it("creates a source-major linear array while retaining source-relative layout", () => {
    const first = fixtureAt("00000000-0000-4000-8000-000000000010", 0);
    const second = fixtureAt("00000000-0000-4000-8000-000000000011", 100);
    const generatedIds = [12, 13, 14, 15].map(
      (value) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`,
    );
    const queue = [...generatedIds];

    const intent = intentOf(linearArray(
      [first, second],
      { count: 3, delta: { x: 10, y: 20 } },
      () => queue.shift()!,
    ));

    expect(intent.reason).toBe("array");
    expect(intent.changes.map((change) => change.id)).toEqual(generatedIds);
    expect(intent.changes.map((change) => change.after!.transform.translation)).toEqual([
      { x: 10, y: 20 },
      { x: 20, y: 40 },
      { x: 110, y: 20 },
      { x: 120, y: 40 },
    ]);
  });

  it("creates one rectangular-array intent with fresh deterministic UUIDs", () => {
    const fixture = fixtureAt("00000000-0000-4000-8000-000000000010", 0);
    const generatedIds = [11, 12, 13, 14, 15].map(
      (value) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`,
    );
    const queue = [...generatedIds];
    const result = rectangularArray(
      [fixture],
      { rows: 2, columns: 3, rowGap: 200, columnGap: 300 },
      () => queue.shift()!,
    );
    if (!result.ok) throw new Error(result.issue.message);
    expect(result.value.reason).toBe("array");
    expect(result.value.changes).toHaveLength(5);
    expect(result.value.changes.map((change) => change.after?.id)).toEqual(generatedIds);
    expect(result.value.changes.map((change) => change.after!.transform.translation)).toEqual([
      { x: 300, y: 0 },
      { x: 600, y: 0 },
      { x: 0, y: 200 },
      { x: 300, y: 200 },
      { x: 600, y: 200 },
    ]);
  });

  it("rejects unsafe array counts before consuming generated IDs", () => {
    const fixture = fixtureAt("00000000-0000-4000-8000-000000000010", 0);
    let calls = 0;
    const makeId = () => {
      calls += 1;
      return "00000000-0000-4000-8000-000000000011";
    };

    for (const count of [0, 1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      const result = linearArray([fixture], { count, delta: { x: 1, y: 1 } }, makeId);
      expect(result.ok, String(count)).toBe(false);
    }
    for (const input of [
      { rows: 1, columns: 1, rowGap: 1, columnGap: 1 },
      { rows: 0, columns: 2, rowGap: 1, columnGap: 1 },
      { rows: 2, columns: 1.5, rowGap: 1, columnGap: 1 },
      { rows: Number.MAX_SAFE_INTEGER, columns: 2, rowGap: 1, columnGap: 1 },
    ]) {
      expect(rectangularArray([fixture], input, makeId).ok, JSON.stringify(input)).toBe(false);
    }
    expect(calls).toBe(0);
  });

  it("rejects invalid, repeated, and source-colliding generated IDs without publishing an intent", () => {
    const first = fixtureAt("00000000-0000-4000-8000-000000000010", 0);
    const second = fixtureAt("00000000-0000-4000-8000-000000000011", 100);
    const generated = "00000000-0000-4000-8000-000000000012";

    for (const makeId of [
      () => "not-a-uuid",
      () => first.id,
      (() => {
        const queue = [generated, generated];
        return () => queue.shift()!;
      })(),
      () => { throw new Error("generator failed"); },
    ]) {
      const result = duplicateEntities([first, second], { x: 1, y: 1 }, makeId);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issue.code).toBe("INVALID_GENERATED_ID");
    }
  });


  it.each([
    ["linear batch limit", (entities: readonly SpatialEntity[], makeId: () => string) =>
      linearArray(entities, { count: 10_002, delta: { x: 1, y: 1 } }, makeId)],
    ["linear source multiplication", (entities: readonly SpatialEntity[], makeId: () => string) =>
      linearArray(
        [entities[0]!, fixtureAt("00000000-0000-4000-8000-000000000099", 100)],
        { count: 5_002, delta: { x: 1, y: 1 } },
        makeId,
      )],
    ["rectangular batch limit", (entities: readonly SpatialEntity[], makeId: () => string) =>
      rectangularArray(
        entities,
        { rows: 101, columns: 100, rowGap: 1, columnGap: 1 },
        makeId,
      )],
  ] as const)("rejects %s before allocation or ID consumption", (_name, call) => {
    const fixture = fixtureAt("00000000-0000-4000-8000-000000000010", 0);
    let calls = 0;
    const result = call([fixture], () => {
      calls += 1;
      return "00000000-0000-4000-8000-000000000011";
    });

    expect(result).toEqual({
      ok: false,
      issue: {
        code: "ARRAY_LIMIT_EXCEEDED",
        message: "Array operations may create at most 10000 entities.",
      },
    });
    expect(calls).toBe(0);
  });

  it("rejects MAX_SAFE_INTEGER linear count without throwing or consuming an ID", () => {
    const fixture = fixtureAt("00000000-0000-4000-8000-000000000010", 0);
    let calls = 0;
    let result: PlanResult<PlanEditIntent> | undefined;

    expect(() => {
      result = linearArray(
        [fixture],
        { count: Number.MAX_SAFE_INTEGER, delta: { x: 1, y: 1 } },
        () => {
          calls += 1;
          return "00000000-0000-4000-8000-000000000011";
        },
      );
    }).not.toThrow();
    expect(result).toEqual({
      ok: false,
      issue: {
        code: "ARRAY_LIMIT_EXCEEDED",
        message: "Array operations may create at most 10000 entities.",
      },
    });
    expect(calls).toBe(0);
  });
});

describe("plan alignment and distribution operations", () => {
  it.each([
    ["left", [{ x: 0, y: 20 }, { x: 0, y: 80 }]],
    ["center-x", [{ x: 75, y: 20 }, { x: 100, y: 80 }]],
    ["right", [{ x: 150, y: 20 }, { x: 200, y: 80 }]],
    ["top", [{ x: 0, y: 20 }, { x: 200, y: 20 }]],
    ["center-y", [{ x: 0, y: 50 }, { x: 200, y: 50 }]],
    ["bottom", [{ x: 0, y: 80 }, { x: 200, y: 80 }]],
  ] as const)("aligns entity bounds to %s in one ordered intent", (axis, translations) => {
    const first = fixtureAt("00000000-0000-4000-8000-000000000010", 0, 100, 20);
    const second = fixtureAt("00000000-0000-4000-8000-000000000011", 200, 50, 80);

    const intent = intentOf(alignEntities([first, second], axis));

    expect(intent.reason).toBe("align");
    expect(intent.changes.map((change) => change.id)).toEqual([first.id, second.id]);
    expect(intent.changes.map((change) => change.after!.transform.translation)).toEqual(translations);
    expect(intent.changes.map((change) => change.before)).toEqual([first, second]);
  });

  it("distributes three entities by equal edge gap without moving endpoints", () => {
    const left = fixtureAt("00000000-0000-4000-8000-000000000020", 0);
    const middle = fixtureAt("00000000-0000-4000-8000-000000000021", 150);
    const right = fixtureAt("00000000-0000-4000-8000-000000000022", 500);
    const result = distributeEntities([left, middle, right], "horizontal", "gap");
    if (!result.ok) throw new Error(result.issue.message);
    const afterByEntityId = new Map(
      result.value.changes.map((change) => [change.id, change.after!]),
    );
    const after = [left, middle, right].map((entity) => afterByEntityId.get(entity.id) ?? entity);
    const bounds = after.map(entityWorldBounds);
    expect(after[0]!.transform).toEqual(left.transform);
    expect(after[2]!.transform).toEqual(right.transform);
    expect(bounds[1]!.min.x - bounds[0]!.max.x).toBe(bounds[2]!.min.x - bounds[1]!.max.x);
  });

  it("distributes vertical centers in spatial order while preserving endpoint transforms", () => {
    const top = fixtureAt("00000000-0000-4000-8000-000000000020", 0, 100, 0);
    const middle = fixtureAt("00000000-0000-4000-8000-000000000021", 0, 100, 100);
    const bottom = fixtureAt("00000000-0000-4000-8000-000000000022", 0, 100, 400);

    const intent = intentOf(distributeEntities([middle, bottom, top], "vertical", "centers"));
    const after = afterById(intent);

    expect(after.get(top.id)!.transform).toEqual(top.transform);
    expect(after.get(bottom.id)!.transform).toEqual(bottom.transform);
    expect(after.get(middle.id)!.transform.translation).toEqual({ x: 0, y: 200 });
  });


  it("preserves distribution endpoint transforms exactly while deep-owning them", () => {
    const left: Fixture = {
      ...fixtureAt("00000000-0000-4000-8000-000000000020", 0),
      transform: {
        translation: { x: -0, y: 1e-12 },
        rotation: Math.PI * 3,
        scale: { x: 1, y: 1 },
      },
    };
    const middle = fixtureAt("00000000-0000-4000-8000-000000000021", 150);
    const right: Fixture = {
      ...fixtureAt("00000000-0000-4000-8000-000000000022", 600),
      transform: {
        translation: { x: 600, y: -1e-12 },
        rotation: -Math.PI * 3,
        scale: { x: 1, y: 1 },
      },
    };

    const intent = intentOf(distributeEntities([middle, right, left], "horizontal", "centers"));
    const after = afterById(intent);
    const afterLeft = after.get(left.id)!;
    const afterRight = after.get(right.id)!;

    expect(afterLeft.transform).toEqual(left.transform);
    expect(afterRight.transform).toEqual(right.transform);
    expect(Object.is(afterLeft.transform.translation.x, -0)).toBe(true);
    expect(afterLeft).not.toBe(left);
    expect(afterLeft.transform).not.toBe(left.transform);
    expect(afterRight).not.toBe(right);
  });

  it("keeps equal signed negative edge gaps with fixed endpoints", () => {
    const left = fixtureAt("00000000-0000-4000-8000-000000000020", 0, 200);
    const middle = fixtureAt("00000000-0000-4000-8000-000000000021", 50, 200);
    const right = fixtureAt("00000000-0000-4000-8000-000000000022", 200, 200);

    const intent = intentOf(distributeEntities([left, middle, right], "horizontal", "gap"));
    const after = afterById(intent);
    const ordered = [left, middle, right].map((entity) => after.get(entity.id)!);
    const bounds = ordered.map(entityWorldBounds);
    const firstGap = bounds[1]!.min.x - bounds[0]!.max.x;
    const secondGap = bounds[2]!.min.x - bounds[1]!.max.x;

    expect(firstGap).toBe(-100);
    expect(secondGap).toBe(-100);
    expect(ordered[0]!.transform).toEqual(left.transform);
    expect(ordered[2]!.transform).toEqual(right.transform);
  });

  it("breaks center ties by UUID independently of input order", () => {
    const endpoint = fixtureAt("00000000-0000-4000-8000-000000000020", 0);
    const tied = fixtureAt("00000000-0000-4000-8000-000000000021", 0);
    const right = fixtureAt("00000000-0000-4000-8000-000000000022", 300);

    const intent = intentOf(distributeEntities([tied, right, endpoint], "horizontal", "centers"));
    const after = afterById(intent);

    expect(after.get(endpoint.id)!.transform).toEqual(endpoint.transform);
    expect(after.get(tied.id)!.transform.translation).toEqual({ x: 150, y: 0 });
    expect(after.get(right.id)!.transform).toEqual(right.transform);
  });

  it("aligns same-sign extreme finite bounds without midpoint overflow", () => {
    const magnitude = Number.MAX_VALUE / 4;
    const first = fixtureAt(
      "00000000-0000-4000-8000-000000000020",
      magnitude * 2,
      magnitude,
    );
    const second = fixtureAt(
      "00000000-0000-4000-8000-000000000021",
      magnitude * 2.5,
      magnitude,
    );

    const intent = intentOf(alignEntities([first, second], "center-x"));
    const after = [...afterById(intent).values()];

    expect(after.every((entity) => Number.isFinite(entity.transform.translation.x))).toBe(true);
    const centers = after.map(centerX);
    const relativeError = Math.abs(centers[0]! - centers[1]!)
      / Math.max(Math.abs(centers[0]!), Math.abs(centers[1]!));
    expect(relativeError).toBeLessThanOrEqual(Number.EPSILON);
  });

  it("distributes same-sign extreme finite centers without midpoint overflow", () => {
    const magnitude = Number.MAX_VALUE / 16;
    const left = fixtureAt(
      "00000000-0000-4000-8000-000000000020",
      magnitude * 8,
      magnitude,
    );
    const middle = fixtureAt(
      "00000000-0000-4000-8000-000000000021",
      magnitude * 9,
      magnitude,
    );
    const right = fixtureAt(
      "00000000-0000-4000-8000-000000000022",
      magnitude * 12,
      magnitude,
    );

    const intent = intentOf(distributeEntities([middle, right, left], "horizontal", "centers"));
    const after = afterById(intent);

    expect(centerX(after.get(middle.id)!)).toBe(centerX(left) + (centerX(right) - centerX(left)) / 2);
    expect(after.get(left.id)!.transform).toEqual(left.transform);
    expect(after.get(right.id)!.transform).toEqual(right.transform);
  });

  it("aligns rotated and scaled entities by their world AABBs", () => {
    const rotated: Fixture = {
      ...fixtureAt("00000000-0000-4000-8000-000000000020", 20, 80, 30, 40),
      transform: {
        translation: { x: 20, y: 30 },
        rotation: Math.PI / 2,
        scale: { x: 2, y: 0.5 },
      },
    };
    const plain = fixtureAt("00000000-0000-4000-8000-000000000021", 300, 50, 80, 60);

    const intent = intentOf(alignEntities([rotated, plain], "right"));
    const after = [...afterById(intent).values()].map(entityWorldBounds);

    expect(after[0]!.max.x).toBeCloseTo(after[1]!.max.x, 10);
  });

  it("distributes rotated and scaled entities by equal world-AABB gaps", () => {
    const left: Fixture = {
      ...fixtureAt("00000000-0000-4000-8000-000000000020", 100, 40, 0, 80),
      transform: {
        translation: { x: 100, y: 0 },
        rotation: Math.PI / 2,
        scale: { x: 1.5, y: 0.5 },
      },
    };
    const middle: Fixture = {
      ...fixtureAt("00000000-0000-4000-8000-000000000021", 220, 60),
      transform: {
        translation: { x: 220, y: 0 },
        rotation: Math.PI / 4,
        scale: { x: 1.25, y: 0.75 },
      },
    };
    const right = fixtureAt("00000000-0000-4000-8000-000000000022", 600, 100);

    const intent = intentOf(distributeEntities([middle, right, left], "horizontal", "gap"));
    const after = afterById(intent);
    const ordered = [left, middle, right].map((entity) => entityWorldBounds(after.get(entity.id)!));
    const firstGap = ordered[1]!.min.x - ordered[0]!.max.x;
    const secondGap = ordered[2]!.min.x - ordered[1]!.max.x;

    expect(firstGap).toBeCloseTo(secondGap, 8);
  });
});

describe("deterministic batch validation", () => {
  const id = "00000000-0000-4000-8000-000000000010";
  const generatedId = "00000000-0000-4000-8000-000000000011";
  const calls: readonly [string, (entities: readonly SpatialEntity[]) => PlanResult<PlanEditIntent>][] = [
    ["translate", (entities) => translateEntities(entities, { x: 1, y: 2 })],
    ["rotate", (entities) => rotateEntities(entities, Math.PI / 2)],
    ["resize", (entities) => resizeEntities(entities, { x: 2, y: 2 })],
    ["duplicate", (entities) => duplicateEntities(entities, { x: 1, y: 2 }, () => generatedId)],
    ["linear-array", (entities) => linearArray(entities, { count: 2, delta: { x: 1, y: 2 } }, () => generatedId)],
    ["rectangular-array", (entities) => rectangularArray(entities, { rows: 1, columns: 2, rowGap: 1, columnGap: 2 }, () => generatedId)],
    ["align", (entities) => alignEntities(entities, "left")],
    ["distribute", (entities) => distributeEntities(entities, "horizontal", "gap")],
  ];

  it.each(calls)("rejects an empty %s selection", (_name, call) => {
    const result = call([]);
    expect(result).toEqual({
      ok: false,
      issue: { code: "EMPTY_SELECTION", message: "Select at least one entity." },
    });
  });

  it.each(calls)("rejects a locked entity in a %s selection", (_name, call) => {
    const locked = { ...fixtureAt(id, 0), locked: true };
    const result = call([locked]);
    expect(result).toEqual({
      ok: false,
      issue: {
        code: "LOCKED_ENTITY",
        message: "Locked entities cannot be edited.",
        entityId: id,
      },
    });
  });

  it("rejects duplicate selection IDs and invalid numeric transform inputs", () => {
    const fixture = fixtureAt(id, 0);
    const duplicate = translateEntities([fixture, fixture], { x: 1, y: 1 });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.issue.code).toBe("DUPLICATE_ENTITY_ID");

    for (const result of [
      translateEntities([fixture], { x: Number.NaN, y: 0 }),
      rotateEntities([fixture], Number.POSITIVE_INFINITY),
      resizeEntities([fixture], { x: 0, y: 1 }),
      resizeEntities([fixture], { x: 1, y: -1 }),
    ]) {
      expect(result.ok).toBe(false);
    }
  });
});

describe("fixture kind and vertical metadata preservation", () => {
  const fixture: Fixture = {
    ...fixtureAt("00000000-0000-4000-8000-000000000070", 10, 900, 20, 350),
    kind: "shelf",
    spatial3D: { elevation: 125, height: 1_800 },
  };

  it("resizes only the 2D width and depth", () => {
    const intent = intentOf(resizeEntities([fixture], { x: 2, y: 3 }));
    const after = intent.changes[0]!.after as Fixture;

    expect(after.size).toEqual({ width: 1_800, height: 1_050 });
    expect(after.kind).toBe("shelf");
    expect(after.spatial3D).toEqual({ elevation: 125, height: 1_800 });
  });

  it("preserves kind and owned spatial3D through duplicate/copy-paste semantics", () => {
    const result = duplicateEntities(
      [fixture],
      { x: 100, y: -100 },
      () => "00000000-0000-4000-8000-000000000071",
    );
    const intent = intentOf(result);
    const copy = intent.changes[0]!.after as Fixture;

    expect(copy.kind).toBe("shelf");
    expect(copy.spatial3D).toEqual({ elevation: 125, height: 1_800 });
    expect(copy.spatial3D).not.toBe(fixture.spatial3D);
  });

  it("preserves kind and spatial3D for every linear and rectangular array copy", () => {
    const ids = [72, 73, 74, 75].map(
      (value) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`,
    );
    const queue = [...ids];
    const linear = intentOf(linearArray(
      [fixture],
      { count: 3, delta: { x: 100, y: 0 } },
      () => queue.shift()!,
    ));
    const rectangular = intentOf(rectangularArray(
      [fixture],
      { rows: 1, columns: 3, rowGap: 0, columnGap: 100 },
      () => queue.shift()!,
    ));

    for (const change of [...linear.changes, ...rectangular.changes]) {
      expect(change.after).toMatchObject({
        type: "fixture",
        kind: "shelf",
        spatial3D: { elevation: 125, height: 1_800 },
      });
    }
  });
});
