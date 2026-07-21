import type {
  Boundary,
  DimensionAnchor,
  DimensionAnnotation,
  Fixture,
  PointOfInterest,
  SpaceUnit,
  SpatialEntity,
  Wall,
  Zone,
} from "@aethertwin/core-model";
import { describe, expect, it } from "vitest";
import { dimensionGeometry, resolveDimensionAnchors } from "./dimensions";

const floorId = "00000000-0000-4000-8000-000000000001";
const layerId = "00000000-0000-4000-8000-000000000002";
const transform = { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } };

const targetWall: Wall = {
  type: "wall", id: "00000000-0000-4000-8000-000000000010", name: "Wall", tags: [],
  floorId, layerId, locked: false, transform,
  centerLine: [{ x: 0, y: 0 }, { x: 1000, y: 0 }], thickness: 100,
};

function dimension(
  start: DimensionAnchor,
  end: DimensionAnchor,
  overrides: Partial<DimensionAnnotation> = {},
): DimensionAnnotation {
  return {
    type: "dimension", id: "00000000-0000-4000-8000-000000000011", name: "Width", tags: [],
    floorId, layerId, locked: false, transform, start, end, offset: 200,
    ...overrides,
  };
}

function expectIssue(
  result: { readonly ok: boolean; readonly issue?: { readonly code: string } },
  code: string,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issue?.code).toBe(code);
}

describe("resolveDimensionAnchors", () => {
  it("keeps an entity-backed dimension attached after the entity moves", () => {
    const attached = dimension(
      { kind: "entity", entityId: targetWall.id, locator: "origin" },
      { kind: "entity", entityId: targetWall.id, locator: { vertex: 1 } },
    );
    const movedWall: Wall = {
      ...targetWall,
      transform: { ...targetWall.transform, translation: { x: 500, y: 0 } },
    };

    expect(resolveDimensionAnchors(attached, new Map([[targetWall.id, movedWall]]))).toEqual({
      ok: true,
      value: { start: { x: 500, y: 0 }, end: { x: 1500, y: 0 } },
    });
  });

  it("treats point anchors as dimension-local and applies its scale, rotation, and translation", () => {
    const local = dimension(
      { kind: "point", point: { x: 10, y: 20 } },
      { kind: "point", point: { x: 0, y: 0 } },
      { transform: { translation: { x: 100, y: 200 }, rotation: Math.PI / 2, scale: { x: 2, y: 3 } } },
    );

    expect(resolveDimensionAnchors(local, new Map())).toEqual({
      ok: true,
      value: { start: { x: 40, y: 220 }, end: { x: 100, y: 200 } },
    });
  });

  it("resolves vertex and segment+t locators from transformed world vertices", () => {
    const movedWall: Wall = {
      ...targetWall,
      transform: { translation: { x: 100, y: 50 }, rotation: Math.PI / 2, scale: { x: 1, y: 1 } },
    };
    const attached = dimension(
      { kind: "entity", entityId: movedWall.id, locator: { vertex: 1 } },
      { kind: "entity", entityId: movedWall.id, locator: { segment: 0, t: 0.5 } },
    );

    const result = resolveDimensionAnchors(attached, new Map([[movedWall.id, movedWall]]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.start.x).toBeCloseTo(100);
      expect(result.value.start.y).toBeCloseTo(1050);
      expect(result.value.end.x).toBeCloseTo(100);
      expect(result.value.end.y).toBeCloseTo(550);
    }
  });

  const closedEntities: readonly (Boundary | Zone | SpaceUnit)[] = [
    {
      type: "boundary", id: "00000000-0000-4000-8000-000000000020", name: "Boundary", tags: [],
      floorId, layerId, locked: false, transform: { ...transform, translation: { x: 10, y: 0 } },
      polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
    },
    {
      type: "zone", id: "00000000-0000-4000-8000-000000000021", name: "Zone", tags: [],
      floorId, layerId, locked: false, transform: { ...transform, translation: { x: 10, y: 0 } },
      polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], purpose: "test", color: "#fff",
    },
    {
      type: "space-unit", id: "00000000-0000-4000-8000-000000000022", name: "Space", tags: [],
      floorId, layerId, locked: false, transform: { ...transform, translation: { x: 10, y: 0 } },
      footprint: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], kind: "room",
    },
  ];
  for (const entity of closedEntities) {
    it(`uses the closing segment for ${entity.type} anchors`, () => {
      const attached = dimension(
        { kind: "entity", entityId: entity.id, locator: { segment: 2, t: 0.5 } },
        { kind: "entity", entityId: entity.id, locator: { vertex: 0 } },
      );
      expect(resolveDimensionAnchors(attached, new Map([[entity.id, entity]]))).toEqual({
        ok: true,
        value: { start: { x: 60, y: 50 }, end: { x: 10, y: 0 } },
      });
    });
  }

  it("treats wall paths as open and rejects a closing segment", () => {
    const attached = dimension(
      { kind: "entity", entityId: targetWall.id, locator: { segment: 1, t: 0.5 } },
      { kind: "entity", entityId: targetWall.id, locator: "origin" },
    );
    expectIssue(resolveDimensionAnchors(attached, new Map([[targetWall.id, targetWall]])), "INVALID_DIMENSION_ANCHOR");
  });

  it("allows origin locators for entities without anchor paths", () => {
    const fixture: Fixture = {
      type: "fixture", id: "00000000-0000-4000-8000-000000000030", name: "Fixture", tags: [],
      floorId, layerId, locked: false,
      transform: { translation: { x: 25, y: 50 }, rotation: 0, scale: { x: 1, y: 1 } },
      kind: "generic", size: { width: 100, height: 50 },
    };
    const attached = dimension(
      { kind: "entity", entityId: fixture.id, locator: "origin" },
      { kind: "point", point: { x: 0, y: 0 } },
    );
    expect(resolveDimensionAnchors(attached, new Map([[fixture.id, fixture]]))).toEqual({
      ok: true,
      value: { start: { x: 25, y: 50 }, end: { x: 0, y: 0 } },
    });
  });

  const poi: PointOfInterest = {
    type: "poi", id: "00000000-0000-4000-8000-000000000031", name: "POI", tags: [],
    floorId, layerId, locked: false, transform, kind: "entrance",
  };
  it.each([
    ["a missing entity", { kind: "entity", entityId: "missing", locator: "origin" } as const, []],
    ["an unsupported fixture vertex", { kind: "entity", entityId: "00000000-0000-4000-8000-000000000030", locator: { vertex: 0 } } as const, [{ ...targetWall, type: "fixture", id: "00000000-0000-4000-8000-000000000030", kind: "generic", size: { width: 1, height: 1 } } as Fixture]],
    ["an unsupported POI segment", { kind: "entity", entityId: poi.id, locator: { segment: 0, t: 0.5 } } as const, [poi]],
    ["an out-of-range vertex", { kind: "entity", entityId: targetWall.id, locator: { vertex: 2 } } as const, [targetWall]],
    ["an out-of-range segment parameter", { kind: "entity", entityId: targetWall.id, locator: { segment: 0, t: 1.1 } } as const, [targetWall]],
  ])("returns INVALID_DIMENSION_ANCHOR for %s", (_name, anchor, entities) => {
    const attached = dimension(anchor, { kind: "point", point: { x: 0, y: 0 } });
    const entitiesById = new Map((entities as readonly SpatialEntity[]).map((entity) => [entity.id, entity]));
    expectIssue(resolveDimensionAnchors(attached, entitiesById), "INVALID_DIMENSION_ANCHOR");
  });

  it("returns INVALID_DIMENSION_ANCHOR for non-finite free points and invalid transforms", () => {
    const invalidPoint = dimension(
      { kind: "point", point: { x: Number.NaN, y: 0 } },
      { kind: "point", point: { x: 1, y: 0 } },
    );
    const invalidTransform = dimension(
      { kind: "point", point: { x: 0, y: 0 } },
      { kind: "point", point: { x: 1, y: 0 } },
      { transform: { ...transform, scale: { x: 0, y: 1 } } },
    );
    expectIssue(resolveDimensionAnchors(invalidPoint, new Map()), "INVALID_DIMENSION_ANCHOR");
    expectIssue(resolveDimensionAnchors(invalidTransform, new Map()), "INVALID_DIMENSION_ANCHOR");
  });

  it("returns INVALID_DIMENSION_ANCHOR instead of throwing for a dimension transform below Task 3 epsilon", () => {
    const tinyScale = dimension(
      { kind: "point", point: { x: 0, y: 0 } },
      { kind: "point", point: { x: 1, y: 0 } },
      { transform: { ...transform, scale: { x: 1e-10, y: 1 } } },
    );
    const resolve = () => resolveDimensionAnchors(tinyScale, new Map());

    expect(resolve).not.toThrow();
    expectIssue(resolve(), "INVALID_DIMENSION_ANCHOR");
  });

  it("returns INVALID_DIMENSION_ANCHOR instead of throwing for an entity transform below Task 3 epsilon", () => {
    const tinyScaleWall: Wall = {
      ...targetWall,
      transform: { ...transform, scale: { x: 1e-10, y: 1 } },
    };
    const attached = dimension(
      { kind: "entity", entityId: tinyScaleWall.id, locator: "origin" },
      { kind: "point", point: { x: 1, y: 0 } },
    );
    const resolve = () => resolveDimensionAnchors(
      attached,
      new Map([[tinyScaleWall.id, tinyScaleWall]]),
    );

    expect(resolve).not.toThrow();
    expectIssue(resolve(), "INVALID_DIMENSION_ANCHOR");
  });

  it("rejects a finite point anchor whose transform overflows", () => {
    const overflow = dimension(
      { kind: "point", point: { x: Number.MAX_VALUE, y: 0 } },
      { kind: "point", point: { x: 0, y: 0 } },
      { transform: { ...transform, scale: { x: 2, y: 1 } } },
    );

    expectIssue(resolveDimensionAnchors(overflow, new Map()), "INVALID_DIMENSION_ANCHOR");
  });

  it("uses stable interpolation for finite large segment endpoints", () => {
    const largeWall: Wall = {
      ...targetWall,
      centerLine: [
        { x: -Number.MAX_VALUE, y: 0 },
        { x: Number.MAX_VALUE, y: 0 },
      ],
    };
    const attached = dimension(
      { kind: "entity", entityId: largeWall.id, locator: { segment: 0, t: 0.5 } },
      { kind: "entity", entityId: largeWall.id, locator: "origin" },
    );

    expect(resolveDimensionAnchors(attached, new Map([[largeWall.id, largeWall]]))).toEqual({
      ok: true,
      value: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
    });
  });

  it("preserves an identical subnormal coordinate during segment interpolation", () => {
    const subnormalWall: Wall = {
      ...targetWall,
      centerLine: [
        { x: Number.MIN_VALUE, y: 0 },
        { x: Number.MIN_VALUE, y: 10 },
      ],
    };
    const attached = dimension(
      { kind: "entity", entityId: subnormalWall.id, locator: { segment: 0, t: 0.5 } },
      { kind: "entity", entityId: subnormalWall.id, locator: "origin" },
    );

    const result = resolveDimensionAnchors(
      attached,
      new Map([[subnormalWall.id, subnormalWall]]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.start).toEqual({ x: Number.MIN_VALUE, y: 5 });
    }
  });

  it("rejects entity vertices that overflow during their world transform", () => {
    const overflowWall: Wall = {
      ...targetWall,
      centerLine: [{ x: Number.MAX_VALUE, y: 0 }, { x: 0, y: 0 }],
      transform: { ...transform, scale: { x: 2, y: 1 } },
    };
    const attached = dimension(
      { kind: "entity", entityId: overflowWall.id, locator: { vertex: 0 } },
      { kind: "entity", entityId: overflowWall.id, locator: "origin" },
    );
    expectIssue(resolveDimensionAnchors(attached, new Map([[overflowWall.id, overflowWall]])), "INVALID_DIMENSION_ANCHOR");
  });
});

describe("dimensionGeometry", () => {
  it("returns extension lines, offset dimension line, midpoint, millimetres, and display-unit label", () => {
    const annotated = dimension(
      { kind: "point", point: { x: 0, y: 0 } },
      { kind: "point", point: { x: 1000, y: 0 } },
      {
        transform: { ...transform, translation: { x: 100, y: 50 } },
        offset: 200,
        displayUnit: "cm",
      },
    );

    expect(dimensionGeometry(annotated, new Map(), "mm")).toEqual({
      ok: true,
      value: {
        extensionLines: [
          { start: { x: 100, y: 50 }, end: { x: 100, y: 250 } },
          { start: { x: 1100, y: 50 }, end: { x: 1100, y: 250 } },
        ],
        dimensionLine: { start: { x: 100, y: 250 }, end: { x: 1100, y: 250 } },
        labelPoint: { x: 600, y: 250 },
        measuredMillimetres: 1000,
        label: "100cm",
      },
    });
  });

  it("moves negative offsets to the opposite normal side without changing measurement or label", () => {
    const annotated = dimension(
      { kind: "point", point: { x: 0, y: 0 } },
      { kind: "point", point: { x: 1000, y: 0 } },
      { offset: -200, displayUnit: "cm" },
    );

    expect(dimensionGeometry(annotated, new Map(), "mm")).toEqual({
      ok: true,
      value: {
        extensionLines: [
          { start: { x: 0, y: 0 }, end: { x: 0, y: -200 } },
          { start: { x: 1000, y: 0 }, end: { x: 1000, y: -200 } },
        ],
        dimensionLine: { start: { x: 0, y: -200 }, end: { x: 1000, y: -200 } },
        labelPoint: { x: 500, y: -200 },
        measuredMillimetres: 1000,
        label: "100cm",
      },
    });
  });

  it("computes a finite midpoint without overflowing finite dimension-line endpoints", () => {
    const annotated = dimension(
      { kind: "point", point: { x: Number.MAX_VALUE / 2, y: 0 } },
      { kind: "point", point: { x: Number.MAX_VALUE, y: 0 } },
      { offset: 0 },
    );

    const result = dimensionGeometry(annotated, new Map(), "mm");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.labelPoint).toEqual({ x: Number.MAX_VALUE * 0.75, y: 0 });
      expect(Number.isFinite(result.value.labelPoint.x)).toBe(true);
    }
  });

  it("preserves an identical subnormal coordinate in the label midpoint", () => {
    const subnormalWall: Wall = {
      ...targetWall,
      centerLine: [
        { x: Number.MIN_VALUE, y: 0 },
        { x: Number.MIN_VALUE, y: 10 },
      ],
    };
    const annotated = dimension(
      { kind: "entity", entityId: subnormalWall.id, locator: { vertex: 0 } },
      { kind: "entity", entityId: subnormalWall.id, locator: { vertex: 1 } },
      { offset: 0 },
    );

    const result = dimensionGeometry(
      annotated,
      new Map([[subnormalWall.id, subnormalWall]]),
      "mm",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.labelPoint).toEqual({ x: Number.MIN_VALUE, y: 5 });
      expect(result.value.measuredMillimetres).toBe(10);
      expect(result.value.label).toBe("10mm");
    }
  });

  it("returns INVALID_DIMENSION_GEOMETRY when a finite offset overflows geometry", () => {
    const annotated = dimension(
      { kind: "point", point: { x: 0, y: Number.MAX_VALUE / 2 } },
      { kind: "point", point: { x: 1, y: Number.MAX_VALUE / 2 } },
      { offset: Number.MAX_VALUE },
    );

    expectIssue(dimensionGeometry(annotated, new Map(), "mm"), "INVALID_DIMENSION_GEOMETRY");
  });

  it("uses the supplied default unit when the annotation has no display unit", () => {
    const annotated = dimension(
      { kind: "point", point: { x: 0, y: 0 } },
      { kind: "point", point: { x: 1000, y: 0 } },
      { offset: 0 },
    );
    const result = dimensionGeometry(annotated, new Map(), "m");
    expect(result.ok && result.value.label).toBe("1m");
  });

  it("returns deterministic PlanResult failures for zero length, invalid offset, and invalid unit", () => {
    const zeroLength = dimension(
      { kind: "point", point: { x: 10, y: 10 } },
      { kind: "point", point: { x: 10, y: 10 } },
    );
    const invalidOffset = dimension(
      { kind: "point", point: { x: 0, y: 0 } },
      { kind: "point", point: { x: 10, y: 0 } },
      { offset: Number.NaN },
    );
    const valid = dimension(
      { kind: "point", point: { x: 0, y: 0 } },
      { kind: "point", point: { x: 10, y: 0 } },
    );

    expectIssue(dimensionGeometry(zeroLength, new Map(), "mm"), "INVALID_DIMENSION_GEOMETRY");
    expectIssue(dimensionGeometry(invalidOffset, new Map(), "mm"), "INVALID_DIMENSION_GEOMETRY");
    expectIssue(dimensionGeometry(valid, new Map(), "inch" as "mm"), "INVALID_DIMENSION_GEOMETRY");
  });
});
