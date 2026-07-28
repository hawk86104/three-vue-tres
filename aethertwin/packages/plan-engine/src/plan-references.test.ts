import type { Fixture, PlanReference } from "@aethertwin/core-model";
import { describe, expect, it } from "vitest";
import {
  hitTestPlan,
  planReferenceSourceToWorld,
  planReferenceWorldBounds,
  planReferenceWorldPolygon,
  planReferenceWorldToSource,
  UniformGridSpatialIndex,
  type PlanResult,
  type SpatialIndex,
} from "./index";

const floorId = "00000000-0000-4000-8000-000000000001";
const layerId = "00000000-0000-4000-8000-000000000002";
const referenceId = "00000000-0000-4000-8000-000000000911";
const secondReferenceId = "00000000-0000-4000-8000-000000000912";
const fixtureId = "00000000-0000-4000-8000-000000000913";

function makeReference(overrides: Partial<PlanReference> = {}): PlanReference {
  return {
    id: referenceId,
    name: "Plan reference",
    tags: ["source"],
    floorId,
    layerId,
    assetId: "00000000-0000-4000-8000-000000000003",
    intrinsicSize: { width: 100, height: 50 },
    transform: { translation: { x: 10, y: 20 }, rotation: 0, scale: { x: 2, y: 3 } },
    opacity: 0.65,
    locked: false,
    calibration: null,
    ...overrides,
  };
}

function makeFixture(): Fixture {
  return {
    id: fixtureId,
    name: "Fixture",
    tags: [],
    floorId,
    layerId,
    type: "fixture",
    kind: "generic",
    size: { width: 40, height: 40 },
    transform: { translation: { x: 20, y: 30 }, rotation: 0, scale: { x: 1, y: 1 } },
    locked: false,
  };
}

function valueOf<T>(result: PlanResult<T>): T {
  if (!result.ok) throw new Error(`${result.issue.code}: ${result.issue.message}`);
  return result.value;
}

describe("plan-reference coordinate conversion", () => {
  it("converts source pixels to world millimetres", () => {
    expect(planReferenceSourceToWorld(makeReference(), { x: 25, y: 10 })).toEqual({
      ok: true,
      value: { x: 60, y: 50 },
    });
  });

  it("round-trips a point through a rotated non-uniform transform", () => {
    const reference = makeReference({
      transform: {
        translation: { x: -20, y: 30 },
        rotation: Math.PI / 3,
        scale: { x: 4, y: 2 },
      },
    });
    const source = { x: 12.5, y: 7.5 };
    const world = valueOf(planReferenceSourceToWorld(reference, source));
    const roundTrip = valueOf(planReferenceWorldToSource(reference, world));

    expect(roundTrip.x).toBeCloseTo(source.x, 12);
    expect(roundTrip.y).toBeCloseTo(source.y, 12);
  });

  it("round-trips with positive scales above the shared zero threshold", () => {
    const reference = makeReference({
      transform: {
        translation: { x: 20, y: -30 },
        rotation: 0.4,
        scale: { x: 2e-9, y: 3e-9 },
      },
    });
    const source = { x: 75, y: 25 };
    const world = valueOf(planReferenceSourceToWorld(reference, source));
    const roundTrip = valueOf(planReferenceWorldToSource(reference, world));

    expect(roundTrip.x).toBeCloseTo(source.x, 5);
    expect(roundTrip.y).toBeCloseTo(source.y, 5);
  });

  it.each([
    ["negative", { x: -1, y: 1 }],
    ["exactly threshold", { x: 1e-9, y: 1 }],
    ["sub-threshold positive", { x: 5e-10, y: 1 }],
  ] as const)("rejects %s scale before world-to-source inversion", (_name, scale) => {
    const reference = makeReference({
      transform: { translation: { x: 0, y: 0 }, rotation: 0, scale },
    });

    expect(planReferenceWorldToSource(reference, { x: 0, y: 0 })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PLAN_REFERENCE_GEOMETRY", entityId: reference.id },
    });
  });

  it("does not mutate frozen conversion inputs", () => {
    const reference = Object.freeze(makeReference({
      intrinsicSize: Object.freeze({ width: 100, height: 50 }),
      transform: Object.freeze({
        translation: Object.freeze({ x: 10, y: 20 }),
        rotation: 0,
        scale: Object.freeze({ x: 2, y: 3 }),
      }),
    }));
    const point = Object.freeze({ x: 25, y: 10 });

    expect(valueOf(planReferenceSourceToWorld(reference, point))).toEqual({ x: 60, y: 50 });
    expect(reference.transform.translation).toEqual({ x: 10, y: 20 });
    expect(point).toEqual({ x: 25, y: 10 });
  });

  it.each([
    ["source", planReferenceSourceToWorld, Object.freeze({ x: Number.NaN, y: 0 })],
    ["world", planReferenceWorldToSource, Object.freeze({ x: 0, y: Number.POSITIVE_INFINITY })],
  ] as const)("rejects a non-finite %s point without throwing or mutating", (_name, convert, point) => {
    const reference = makeReference();
    const before = JSON.stringify(reference);
    let result: ReturnType<typeof planReferenceSourceToWorld> | undefined;

    expect(() => { result = convert(reference, point); }).not.toThrow();
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PLAN_REFERENCE_GEOMETRY", entityId: reference.id },
    });
    expect(JSON.stringify(reference)).toBe(before);
    expect(Object.isFrozen(point)).toBe(true);
  });
});

describe("plan-reference polygon and bounds", () => {
  it("returns the exact four transformed corners in source winding order", () => {
    expect(planReferenceWorldPolygon(makeReference())).toEqual({
      ok: true,
      value: [
        { x: 10, y: 20 },
        { x: 210, y: 20 },
        { x: 210, y: 170 },
        { x: 10, y: 170 },
      ],
    });
  });

  it("returns exact axis-aligned world bounds for the corner polygon", () => {
    expect(planReferenceWorldBounds(makeReference())).toEqual({
      ok: true,
      value: { min: { x: 10, y: 20 }, max: { x: 210, y: 170 } },
    });
  });

  it.each([
    ["zero intrinsic width", { intrinsicSize: { width: 0, height: 50 } }],
    ["negative intrinsic height", { intrinsicSize: { width: 100, height: -1 } }],
    ["NaN intrinsic size", { intrinsicSize: { width: Number.NaN, height: 50 } }],
    ["non-finite transform", {
      transform: { translation: { x: 0, y: 0 }, rotation: Number.NaN, scale: { x: 1, y: 1 } },
    }],
    ["degenerate transform", {
      transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 0, y: 1 } },
    }],
    ["negative scale", {
      transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: -1, y: 1 } },
    }],
    ["scale at the zero threshold", {
      transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 1e-9, y: 1 } },
    }],
    ["scale below the zero threshold", {
      transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 5e-10, y: 1 } },
    }],
  ] as const)("rejects %s with INVALID_PLAN_REFERENCE_GEOMETRY", (_name, override) => {
    expect(planReferenceWorldPolygon(makeReference(override))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PLAN_REFERENCE_GEOMETRY", entityId: referenceId },
    });
  });

  it("rejects a finite corner beyond the safe world range", () => {
    const reference = makeReference({
      transform: {
        translation: { x: 999_999_901, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
      },
    });

    expect(planReferenceWorldBounds(reference)).toMatchObject({
      ok: false,
      issue: { code: "PLAN_REFERENCE_OUT_OF_RANGE", entityId: referenceId },
    });
  });
});

describe("hitTestPlan reference hits", () => {
  it("uses exact world distance for a rotated non-uniform reference", () => {
    const rotation = Math.PI / 3;
    const reference = makeReference({
      transform: {
        translation: { x: 100, y: 200 },
        rotation,
        scale: { x: 2, y: 3 },
      },
    });
    const index = UniformGridSpatialIndex.from([]);
    const hit = (point: { readonly x: number; readonly y: number }, tolerance = 0) => hitTestPlan({
      point, tolerance, entities: [], index, references: [reference],
    });
    const interior = valueOf(planReferenceSourceToWorld(reference, { x: 50, y: 25 }));
    const edge = valueOf(planReferenceSourceToWorld(reference, { x: 50, y: 0 }));
    const corner = valueOf(planReferenceSourceToWorld(reference, { x: 100, y: 50 }));
    const outward = { x: Math.sin(rotation), y: -Math.cos(rotation) };
    const pointAt = (distance: number) => ({
      x: edge.x + outward.x * distance,
      y: edge.y + outward.y * distance,
    });
    const expected = {
      ok: true, value: { kind: "plan-reference", referenceId: reference.id },
    } as const;

    expect(hit(interior)).toEqual(expected);
    expect(hit(edge)).toEqual(expected);
    expect(hit(corner)).toEqual(expected);
    expect(hit(pointAt(4.999), 5)).toEqual(expected);
    expect(hit(pointAt(5.001), 5)).toEqual({ ok: true, value: null });
  });

  it("hits the reference interior, its exact boundary, and world tolerance", () => {
    const reference = makeReference();
    const index = UniformGridSpatialIndex.from([]);
    const call = (x: number, tolerance: number) => hitTestPlan({
      point: { x, y: 80 },
      tolerance,
      entities: [],
      index,
      references: [reference],
    });

    expect(call(50, 0)).toEqual({
      ok: true, value: { kind: "plan-reference", referenceId: reference.id },
    });
    expect(call(10, 0)).toEqual({
      ok: true, value: { kind: "plan-reference", referenceId: reference.id },
    });
    expect(call(5, 5)).toEqual({
      ok: true, value: { kind: "plan-reference", referenceId: reference.id },
    });
    expect(call(4.9, 5)).toEqual({ ok: true, value: null });
  });

  it("returns a business entity before any overlapping reference", () => {
    const fixture = makeFixture();
    const reference = makeReference();
    const index = UniformGridSpatialIndex.from([fixture]);

    expect(hitTestPlan({
      point: { x: 30, y: 40 },
      tolerance: 0,
      entities: [fixture],
      index,
      references: [reference],
    })).toEqual({
      ok: true, value: { kind: "entity", entityId: fixture.id },
    });
  });

  it("considers references only after the entity hit result is null", () => {
    const fixture = makeFixture();
    const reference = makeReference();
    const index = UniformGridSpatialIndex.from([fixture]);

    expect(hitTestPlan({
      point: { x: 150, y: 100 },
      tolerance: 0,
      entities: [fixture],
      index,
      references: [reference],
    })).toEqual({
      ok: true, value: { kind: "plan-reference", referenceId: reference.id },
    });
  });

  it("uses topmost-last reference ordering", () => {
    const bottom = makeReference();
    const top = makeReference({ id: secondReferenceId, name: "Top" });
    const index = UniformGridSpatialIndex.from([]);

    expect(hitTestPlan({
      point: { x: 50, y: 50 },
      tolerance: 0,
      entities: [],
      index,
      references: [bottom, top],
    })).toEqual({
      ok: true, value: { kind: "plan-reference", referenceId: top.id },
    });
  });

  it("applies selectableIds to references without changing their order", () => {
    const bottom = makeReference();
    const top = makeReference({ id: secondReferenceId, name: "Top" });
    const index = UniformGridSpatialIndex.from([]);

    expect(hitTestPlan({
      point: { x: 50, y: 50 },
      tolerance: 0,
      entities: [],
      index,
      references: [bottom, top],
      selectableIds: new Set([bottom.id]),
    })).toEqual({
      ok: true, value: { kind: "plan-reference", referenceId: bottom.id },
    });
    expect(hitTestPlan({
      point: { x: 50, y: 50 },
      tolerance: 0,
      entities: [],
      index,
      references: [bottom, top],
      selectableIds: new Set(),
    })).toEqual({ ok: true, value: null });
  });

  it("keeps locked plan references selectable", () => {
    const reference = makeReference({ locked: true });

    expect(hitTestPlan({
      point: { x: 50, y: 50 },
      tolerance: 0,
      entities: [],
      index: UniformGridSpatialIndex.from([]),
      references: [reference],
    })).toEqual({
      ok: true, value: { kind: "plan-reference", referenceId: reference.id },
    });
  });
});

describe("hitTestPlan validation and ownership", () => {
  it.each([
    ["a non-finite point", { point: { x: Number.NaN, y: 0 }, tolerance: 0 }],
    ["a negative tolerance", { point: { x: 0, y: 0 }, tolerance: -1 }],
    ["a non-finite tolerance", { point: { x: 0, y: 0 }, tolerance: Number.POSITIVE_INFINITY }],
  ] as const)("keeps INVALID_SELECTION for %s", (_name, invalid) => {
    expect(hitTestPlan({
      ...invalid,
      entities: [],
      index: UniformGridSpatialIndex.from([]),
      references: [],
    })).toMatchObject({ ok: false, issue: { code: "INVALID_SELECTION" } });
  });

  it("rejects finite inputs whose derived selection bounds overflow before querying", () => {
    const index: SpatialIndex = {
      rebuild: () => undefined,
      query: () => { throw new Error("queried invalid bounds"); },
    };

    expect(hitTestPlan({
      point: { x: Number.MAX_VALUE, y: Number.MAX_VALUE },
      tolerance: Number.MAX_VALUE,
      entities: [],
      index,
      references: [],
    })).toMatchObject({ ok: false, issue: { code: "INVALID_SELECTION" } });
  });

  it("returns invalid reference geometry only after entity hit testing misses", () => {
    const invalid = makeReference({ intrinsicSize: { width: 0, height: 50 } });

    expect(hitTestPlan({
      point: { x: 50, y: 50 },
      tolerance: 0,
      entities: [],
      index: UniformGridSpatialIndex.from([]),
      references: [invalid],
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PLAN_REFERENCE_GEOMETRY", entityId: invalid.id },
    });
  });

  it("does not mutate caller-owned hit arrays, references, entities, or filters", () => {
    const reference = makeReference();
    const fixture = makeFixture();
    const entities = Object.freeze([fixture]);
    const references = Object.freeze([reference]);
    const selectableIds = new Set([fixture.id, reference.id]);
    const before = JSON.stringify({ fixture, reference });

    expect(hitTestPlan({
      point: Object.freeze({ x: 30, y: 40 }),
      tolerance: 0,
      entities,
      index: UniformGridSpatialIndex.from(entities),
      references,
      selectableIds,
    })).toEqual({ ok: true, value: { kind: "entity", entityId: fixture.id } });
    expect(JSON.stringify({ fixture, reference })).toBe(before);
    expect([...selectableIds]).toEqual([fixture.id, reference.id]);
  });
});
