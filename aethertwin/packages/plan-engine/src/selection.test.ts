import type {
  Boundary,
  DimensionAnnotation,
  Fixture,
  PointOfInterest,
  SpaceUnit,
  SpatialEntity,
  SpatialEntityBase,
  Wall,
  Zone,
} from "@aethertwin/core-model";
import { describe, expect, it } from "vitest";
import { boxSelect, hitTest, type SpatialIndex, UniformGridSpatialIndex } from "./index";

const floorId = "00000000-0000-4000-8000-000000000001";
const layerId = "00000000-0000-4000-8000-000000000002";
const fixedId = (index: number) => `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
const identityTransform = {
  translation: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
} as const;

function base(id: string, locked = false): SpatialEntityBase {
  return {
    id,
    name: id,
    tags: [],
    floorId,
    layerId,
    locked,
    transform: identityTransform,
  };
}

const makeFixture = (
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 100,
  locked = false,
): Fixture => ({
  ...base(id, locked),
  type: "fixture",
  transform: { translation: { x, y }, rotation: 0, scale: { x: 1, y: 1 } },
  kind: "generic",
  size: { width, height },
});

describe("hitTest", () => {
  it("returns the topmost visible unlocked hit using world tolerance", () => {
    const bottomFixture = makeFixture(fixedId(10), 450, 450);
    const lockedFixture = makeFixture(fixedId(11), 450, 450, 100, 100, true);
    const hiddenFixture = makeFixture(fixedId(12), 450, 450);
    const topFixture = makeFixture(fixedId(13), 450, 450);
    const entities = [bottomFixture, lockedFixture, hiddenFixture, topFixture];
    const index = UniformGridSpatialIndex.from(entities);

    expect(hitTest({
      point: { x: 555, y: 500 },
      tolerance: 5,
      entities,
      index,
      selectableIds: new Set([bottomFixture.id, lockedFixture.id, topFixture.id]),
    })).toEqual({ ok: true, value: topFixture.id });

    expect(hitTest({
      point: { x: 500, y: 500 },
      tolerance: 5,
      entities: [bottomFixture, lockedFixture, hiddenFixture],
      index,
      selectableIds: new Set([bottomFixture.id, lockedFixture.id]),
    })).toEqual({ ok: true, value: bottomFixture.id });
  });

  it("uses distance to wall segments plus half thickness", () => {
    const wall: Wall = {
      ...base(fixedId(20)),
      type: "wall",
      centerLine: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
      thickness: 20,
    };
    const index = UniformGridSpatialIndex.from([wall]);

    expect(hitTest({ point: { x: 50, y: 14 }, tolerance: 5, entities: [wall], index }))
      .toEqual({ ok: true, value: wall.id });
    expect(hitTest({ point: { x: 50, y: 16 }, tolerance: 5, entities: [wall], index }))
      .toEqual({ ok: true, value: null });
  });

  it("uses the POI anchor radius", () => {
    const poi: PointOfInterest = {
      ...base(fixedId(21)),
      type: "poi",
      kind: "entrance",
      radius: 20,
    };
    const index = UniformGridSpatialIndex.from([poi]);

    expect(hitTest({ point: { x: 24, y: 0 }, tolerance: 5, entities: [poi], index }))
      .toEqual({ ok: true, value: poi.id });
    expect(hitTest({ point: { x: 26, y: 0 }, tolerance: 5, entities: [poi], index }))
      .toEqual({ ok: true, value: null });
  });

  it.each([
    ["boundary", (id: string): Boundary => ({
      ...base(id), type: "boundary", polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }],
    })],
    ["zone", (id: string): Zone => ({
      ...base(id), type: "zone", polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }],
      purpose: "test", color: "#fff",
    })],
    ["space-unit", (id: string): SpaceUnit => ({
      ...base(id), type: "space-unit", footprint: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }],
      kind: "room",
    })],
  ] as const)("uses polygon interiors and edge tolerance for %s entities", (_type, makeEntity) => {
    const entity = makeEntity(fixedId(30));
    const index = UniformGridSpatialIndex.from([entity]);

    expect(hitTest({ point: { x: 50, y: 40 }, tolerance: 0, entities: [entity], index }))
      .toEqual({ ok: true, value: entity.id });
    expect(hitTest({ point: { x: 50, y: -4 }, tolerance: 5, entities: [entity], index }))
      .toEqual({ ok: true, value: entity.id });
    expect(hitTest({ point: { x: 50, y: -6 }, tolerance: 5, entities: [entity], index }))
      .toEqual({ ok: true, value: null });
  });

  it("inverse-transforms points for rotated rectangle local bounds", () => {
    const fixture: Fixture = {
      ...makeFixture(fixedId(40), 100, 100, 100, 50),
      transform: { translation: { x: 100, y: 100 }, rotation: Math.PI / 2, scale: { x: 1, y: 1 } },
    };
    const index = UniformGridSpatialIndex.from([fixture]);

    expect(hitTest({ point: { x: 75, y: 150 }, tolerance: 0, entities: [fixture], index }))
      .toEqual({ ok: true, value: fixture.id });
    expect(hitTest({ point: { x: 49, y: 150 }, tolerance: 0, entities: [fixture], index }))
      .toEqual({ ok: true, value: null });
  });

  it("keeps dimensions in culling but out of hit order", () => {
    const dimension: DimensionAnnotation = {
      ...base(fixedId(50)),
      type: "dimension",
      start: { kind: "point", point: { x: 0, y: 0 } },
      end: { kind: "point", point: { x: 100, y: 0 } },
      offset: 0,
    };
    const index = UniformGridSpatialIndex.from([dimension]);

    expect(index.query({ min: { x: 0, y: 0 }, max: { x: 100, y: 0 } })).toEqual([dimension.id]);
    expect(hitTest({ point: { x: 50, y: 0 }, tolerance: 10, entities: [dimension], index }))
      .toEqual({ ok: true, value: null });
  });

  it("rejects finite hit inputs when their derived query bounds overflow", () => {
    const index: SpatialIndex = {
      rebuild: () => undefined,
      query: () => {
        throw new Error("hitTest queried invalid derived bounds");
      },
    };

    expect(hitTest({
      point: { x: Number.MAX_VALUE, y: Number.MAX_VALUE },
      tolerance: Number.MAX_VALUE,
      entities: [],
      index,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_SELECTION" } });
  });

  it("terminates extreme finite hit tests through the index fallback", () => {
    const fixture = makeFixture(
      fixedId(55),
      Number.MAX_VALUE,
      Number.MAX_VALUE,
      100,
      100,
    );
    const index = UniformGridSpatialIndex.from([fixture], 100);

    expect(hitTest({
      point: { x: Number.MAX_VALUE, y: Number.MAX_VALUE },
      tolerance: 0,
      entities: [fixture],
      index,
    })).toEqual({ ok: true, value: fixture.id });
  });

  it("uses transformed perpendicular wall width under non-uniform scale", () => {
    const wall: Wall = {
      ...base(fixedId(51)),
      type: "wall",
      centerLine: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      thickness: 20,
      transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 2, y: 1 } },
    };
    const index = UniformGridSpatialIndex.from([wall]);
    const midpoint = { x: 100, y: 50 };
    const worldNormal = { x: -1 / Math.sqrt(5), y: 2 / Math.sqrt(5) };
    const pointAt = (distance: number) => ({
      x: midpoint.x + worldNormal.x * distance,
      y: midpoint.y + worldNormal.y * distance,
    });

    expect(hitTest({ point: pointAt(12), tolerance: 0, entities: [wall], index }))
      .toEqual({ ok: true, value: wall.id });
    expect(hitTest({ point: pointAt(14), tolerance: 0, entities: [wall], index }))
      .toEqual({ ok: true, value: null });
  });

  it("uses a deliberate maximum-scale radius for degenerate wall segments", () => {
    const wall: Wall = {
      ...base(fixedId(52)),
      type: "wall",
      centerLine: [{ x: 0, y: 0 }],
      thickness: 20,
      transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 2, y: 1 } },
    };
    const index = UniformGridSpatialIndex.from([wall]);

    expect(hitTest({ point: { x: 19, y: 0 }, tolerance: 0, entities: [wall], index }))
      .toEqual({ ok: true, value: wall.id });
    expect(hitTest({ point: { x: 21, y: 0 }, tolerance: 0, entities: [wall], index }))
      .toEqual({ ok: true, value: null });
  });

  it("uses true world distance to rotated non-uniform POI ellipses", () => {
    const poi: PointOfInterest = {
      ...base(fixedId(53)),
      type: "poi",
      kind: "entrance",
      radius: 10,
      transform: { translation: { x: 0, y: 0 }, rotation: Math.PI / 2, scale: { x: 2, y: 1 } },
    };
    const index = UniformGridSpatialIndex.from([poi]);

    expect(hitTest({ point: { x: -8, y: 18 }, tolerance: 3, entities: [poi], index }))
      .toEqual({ ok: true, value: poi.id });
    expect(hitTest({ point: { x: -8, y: 18 }, tolerance: 2.5, entities: [poi], index }))
      .toEqual({ ok: true, value: null });
  });

  it("treats a zero-radius POI as its transformed anchor point", () => {
    const poi: PointOfInterest = {
      ...base(fixedId(54)),
      type: "poi",
      kind: "entrance",
      radius: 0,
      transform: { translation: { x: 5, y: 6 }, rotation: Math.PI / 3, scale: { x: 2, y: 3 } },
    };
    const index = UniformGridSpatialIndex.from([poi]);

    expect(hitTest({ point: { x: 8, y: 10 }, tolerance: 5, entities: [poi], index }))
      .toEqual({ ok: true, value: poi.id });
    expect(hitTest({ point: { x: 8, y: 10 }, tolerance: 4.9, entities: [poi], index }))
      .toEqual({ ok: true, value: null });
  });
});

describe("boxSelect", () => {
  it("supports intersect and contain modes in stable entity order", () => {
    const contained = makeFixture(fixedId(60), 10, 10, 20, 20);
    const crossing = makeFixture(fixedId(61), 90, 90, 30, 30);
    const surrounding: Boundary = {
      ...base(fixedId(62)),
      type: "boundary",
      polygon: [{ x: -10, y: -10 }, { x: 110, y: -10 }, { x: 110, y: 110 }, { x: -10, y: 110 }],
    };
    const outside = makeFixture(fixedId(63), 200, 200, 20, 20);
    const hidden = makeFixture(fixedId(64), 20, 20, 20, 20);
    const dimension: DimensionAnnotation = {
      ...base(fixedId(65)),
      type: "dimension",
      start: { kind: "point", point: { x: 10, y: 50 } },
      end: { kind: "point", point: { x: 90, y: 50 } },
      offset: 0,
    };
    const entities: readonly SpatialEntity[] = [contained, crossing, surrounding, outside, hidden, dimension];
    const index = UniformGridSpatialIndex.from(entities, 50);
    const selectableIds = new Set([contained.id, crossing.id, surrounding.id, outside.id, dimension.id]);
    const bounds = { min: { x: 0, y: 0 }, max: { x: 100, y: 100 } };

    expect(boxSelect({ bounds, mode: "intersect", entities, index, selectableIds })).toEqual({
      ok: true,
      value: [contained.id, crossing.id, surrounding.id],
    });
    expect(boxSelect({ bounds, mode: "contain", entities, index, selectableIds })).toEqual({
      ok: true,
      value: [contained.id],
    });
  });

  it("uses exact wall distance and rejects expanded-box corner false positives", () => {
    const wall: Wall = {
      ...base(fixedId(70)),
      type: "wall",
      centerLine: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      thickness: 10,
    };
    const index = UniformGridSpatialIndex.from([wall]);

    expect(boxSelect({
      bounds: { min: { x: 104, y: 4 }, max: { x: 104, y: 4 } },
      mode: "intersect",
      entities: [wall],
      index,
    })).toEqual({ ok: true, value: [] });
  });

  it("tests the transformed POI ellipse instead of accepting AABB overlap", () => {
    const poi: PointOfInterest = {
      ...base(fixedId(71)),
      type: "poi",
      kind: "entrance",
      radius: 10,
    };
    const index = UniformGridSpatialIndex.from([poi]);

    expect(boxSelect({
      bounds: { min: { x: 9, y: 9 }, max: { x: 11, y: 11 } },
      mode: "intersect",
      entities: [poi],
      index,
    })).toEqual({ ok: true, value: [] });
  });

  it("rejects runtime-invalid selection modes", () => {
    const fixture = makeFixture(fixedId(72), 0, 0, 10, 10);
    const index = UniformGridSpatialIndex.from([fixture]);

    expect(boxSelect({
      bounds: { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } },
      mode: "invalid" as "intersect",
      entities: [fixture],
      index,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_SELECTION" } });
  });
});
