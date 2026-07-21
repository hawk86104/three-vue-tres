import type {
  Boundary,
  DimensionAnnotation,
  Fixture,
  PointOfInterest,
  SpaceUnit,
  SpatialEntityBase,
  Wall,
  Zone,
} from "@aethertwin/core-model";
import { describe, expect, it } from "vitest";
import { entityWorldBounds, entityWorldVertices } from "./index";

const floorId = "00000000-0000-4000-8000-000000000001";
const layerId = "00000000-0000-4000-8000-000000000002";
const identityTransform = {
  translation: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
} as const;

function base(id: string): SpatialEntityBase {
  return {
    id,
    name: id,
    tags: [],
    floorId,
    layerId,
    locked: false,
    transform: identityTransform,
  };
}

describe("entity world geometry", () => {
  it("transforms fixture vertices and derives their axis-aligned bounds", () => {
    const fixture: Fixture = {
      ...base("fixture"),
      type: "fixture",
      kind: "generic",
      size: { width: 10, height: 20 },
      transform: {
        translation: { x: 100, y: 200 },
        rotation: Math.PI / 2,
        scale: { x: 2, y: 3 },
      },
    };

    expect(entityWorldVertices(fixture)).toEqual([
      { x: 100, y: 200 },
      { x: 100, y: 220 },
      { x: 40, y: 220 },
      { x: 40, y: 200 },
    ]);
    expect(entityWorldBounds(fixture)).toEqual({
      min: { x: 40, y: 200 },
      max: { x: 100, y: 220 },
    });
  });

  it("uses each polygon entity's authored vertices", () => {
    const polygon = [{ x: -10, y: 5 }, { x: 30, y: 5 }, { x: 10, y: 25 }];
    const entities: readonly (Boundary | Zone | SpaceUnit)[] = [
      { ...base("boundary"), type: "boundary", polygon },
      { ...base("zone"), type: "zone", polygon, purpose: "test", color: "#fff" },
      { ...base("space"), type: "space-unit", footprint: polygon, kind: "room" },
    ];

    for (const entity of entities) {
      expect(entityWorldVertices(entity)).toEqual(polygon);
      expect(entityWorldBounds(entity)).toEqual({
        min: { x: -10, y: 5 },
        max: { x: 30, y: 25 },
      });
    }
  });

  it("expands wall and POI bounds by their transformed authored radii", () => {
    const wall: Wall = {
      ...base("wall"),
      type: "wall",
      centerLine: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      thickness: 20,
    };
    const poi: PointOfInterest = {
      ...base("poi"),
      type: "poi",
      kind: "entrance",
      radius: 10,
      transform: {
        translation: { x: 10, y: 20 },
        rotation: Math.PI / 2,
        scale: { x: 2, y: 3 },
      },
    };

    expect(entityWorldVertices(wall)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(entityWorldBounds(wall)).toEqual({
      min: { x: -10, y: -10 },
      max: { x: 110, y: 10 },
    });
    expect(entityWorldVertices(poi)).toEqual([{ x: 10, y: 20 }]);
    expect(entityWorldBounds(poi)).toEqual({
      min: { x: -20, y: 0 },
      max: { x: 40, y: 40 },
    });
  });

  it("exposes point-anchored dimension geometry for viewport culling", () => {
    const dimension: DimensionAnnotation = {
      ...base("dimension"),
      type: "dimension",
      start: { kind: "point", point: { x: -20, y: 10 } },
      end: { kind: "point", point: { x: 80, y: 30 } },
      offset: 0,
      transform: {
        translation: { x: 100, y: 50 },
        rotation: 0,
        scale: { x: 1, y: 1 },
      },
    };

    expect(entityWorldVertices(dimension)).toEqual([{ x: 80, y: 60 }, { x: 180, y: 80 }]);
    expect(entityWorldBounds(dimension)).toEqual({
      min: { x: 80, y: 60 },
      max: { x: 180, y: 80 },
    });
  });
});
