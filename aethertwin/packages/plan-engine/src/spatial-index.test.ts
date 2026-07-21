import type { DimensionAnnotation, Fixture, Wall } from "@aethertwin/core-model";
import { describe, expect, it } from "vitest";
import { entityWorldBounds, UniformGridSpatialIndex } from "./index";

const floorId = "00000000-0000-4000-8000-000000000001";
const layerId = "00000000-0000-4000-8000-000000000002";
const fixedId = (index: number) => `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
const makeFixture = (id: string, x: number, y: number, width = 100, height = 100): Fixture => ({
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
});

describe("UniformGridSpatialIndex", () => {
  it("queries 2,000 rectangles without returning off-viewport ids", () => {
    const entities = Array.from({ length: 2_000 }, (_, index) => {
      const row = Math.floor(index / 50);
      const column = index % 50;
      return makeFixture(fixedId(index + 100), column * 120, row * 120);
    });
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    const viewport = { min: { x: 0, y: 0 }, max: { x: 1000, y: 1000 } };
    const index = UniformGridSpatialIndex.from(entities, 1000);
    const ids = index.query(viewport);

    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => {
      const bounds = entityWorldBounds(byId.get(id)!);
      return bounds.max.x >= viewport.min.x && bounds.min.x <= viewport.max.x
        && bounds.max.y >= viewport.min.y && bounds.min.y <= viewport.max.y;
    })).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("de-duplicates multi-cell entities in stable order across negative and boundary cells", () => {
    const spanning = makeFixture(fixedId(1), -100, -100, 100, 200);
    const positive = makeFixture(fixedId(2), 0, 0, 100, 100);
    const later = makeFixture(fixedId(3), -50, -50, 200, 200);
    const index = UniformGridSpatialIndex.from([spanning, positive, later], 100);

    expect(index.query({ min: { x: 0, y: 0 }, max: { x: 0, y: 0 } })).toEqual([
      spanning.id,
      positive.id,
      later.id,
    ]);
    expect(index.query({ min: { x: -75, y: -75 }, max: { x: 75, y: 75 } })).toEqual([
      spanning.id,
      positive.id,
      later.id,
    ]);
  });

  it("rebuilds replacement contents and includes dimensions for culling", () => {
    const original = makeFixture(fixedId(10), 0, 0);
    const replacement = makeFixture(fixedId(11), 500, 500);
    const dimension: DimensionAnnotation = {
      type: "dimension",
      id: fixedId(12),
      name: "Dimension",
      tags: [],
      floorId,
      layerId,
      locked: false,
      transform: { translation: { x: 500, y: 500 }, rotation: 0, scale: { x: 1, y: 1 } },
      start: { kind: "point", point: { x: 0, y: 0 } },
      end: { kind: "point", point: { x: 200, y: 0 } },
      offset: 0,
    };
    const index = UniformGridSpatialIndex.from([original], 100);

    index.rebuild([replacement, dimension]);

    expect(index.query({ min: { x: 0, y: 0 }, max: { x: 100, y: 100 } })).toEqual([]);
    expect(index.query({ min: { x: 500, y: 500 }, max: { x: 700, y: 500 } })).toEqual([
      replacement.id,
      dimension.id,
    ]);
  });

  it("rejects non-finite query bounds before cell iteration", () => {
    const index = UniformGridSpatialIndex.from([makeFixture(fixedId(20), 0, 0)], 100);

    expect(() => index.query({
      min: { x: Number.NaN, y: 0 },
      max: { x: 100, y: 100 },
    })).toThrow(RangeError);
    expect(() => index.query({
      min: { x: 0, y: 0 },
      max: { x: Number.POSITIVE_INFINITY, y: 100 },
    })).toThrow(RangeError);
  });

  it("falls back exactly for over-budget queries and ungridded entity bounds", () => {
    const wide = makeFixture(fixedId(27), 0, 0, 2_000_000, 100);
    const local = makeFixture(fixedId(28), 0, 0, 100, 100);
    const extreme = makeFixture(
      fixedId(29),
      Number.MAX_VALUE,
      Number.MAX_VALUE,
      100,
      100,
    );
    const index = UniformGridSpatialIndex.from([wide, local, extreme], 100);

    expect(index.query({ min: { x: 50, y: 50 }, max: { x: 50, y: 50 } })).toEqual([
      wide.id,
      local.id,
    ]);
    expect(index.query({
      min: { x: 1_500_000, y: 50 },
      max: { x: 1_500_000, y: 50 },
    })).toEqual([wide.id]);
    expect(index.query({
      min: { x: 0, y: 0 },
      max: { x: 2_000_000, y: 100 },
    })).toEqual([wide.id, local.id]);
    expect(index.query({
      min: { x: Number.MAX_VALUE, y: Number.MAX_VALUE },
      max: { x: Number.MAX_VALUE, y: Number.MAX_VALUE },
    })).toEqual([extreme.id]);
  });

  it("returns duplicate input ids once in first stable entity order", () => {
    const duplicateId = fixedId(21);
    const first = makeFixture(duplicateId, 0, 0);
    const duplicate = makeFixture(duplicateId, 25, 25);
    const later = makeFixture(fixedId(22), 50, 50);
    const index = UniformGridSpatialIndex.from([first, duplicate, later], 50);

    expect(index.query({ min: { x: 0, y: 0 }, max: { x: 150, y: 150 } })).toEqual([
      duplicateId,
      later.id,
    ]);
  });

  it("resolves entity-backed dimension anchors and offset geometry during rebuild", () => {
    const target: Wall = {
      type: "wall",
      id: fixedId(23),
      name: "Anchor target",
      tags: [],
      floorId,
      layerId,
      locked: false,
      transform: { translation: { x: 1000, y: 1000 }, rotation: 0, scale: { x: 1, y: 1 } },
      centerLine: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
      thickness: 10,
    };
    const originToVertex: DimensionAnnotation = {
      type: "dimension",
      id: fixedId(24),
      name: "Origin to vertex",
      tags: [],
      floorId,
      layerId,
      locked: false,
      transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
      start: { kind: "entity", entityId: target.id, locator: "origin" },
      end: { kind: "entity", entityId: target.id, locator: { vertex: 1 } },
      offset: 50,
    };
    const vertexToSegment: DimensionAnnotation = {
      ...originToVertex,
      id: fixedId(25),
      name: "Vertex to segment",
      start: { kind: "entity", entityId: target.id, locator: { vertex: 1 } },
      end: { kind: "entity", entityId: target.id, locator: { segment: 1, t: 0.5 } },
      offset: 50,
    };
    const invalidReference: DimensionAnnotation = {
      ...originToVertex,
      id: fixedId(26),
      name: "Invalid reference",
      start: { kind: "entity", entityId: fixedId(999), locator: "origin" },
      end: { kind: "entity", entityId: target.id, locator: { vertex: 99 } },
      offset: 50,
    };
    const index = UniformGridSpatialIndex.from([
      target,
      originToVertex,
      vertexToSegment,
      invalidReference,
    ], 50);

    expect(index.query({ min: { x: 1050, y: 1050 }, max: { x: 1050, y: 1050 } }))
      .toContain(originToVertex.id);
    expect(index.query({ min: { x: 1050, y: 1025 }, max: { x: 1050, y: 1025 } }))
      .toContain(vertexToSegment.id);
    expect(index.query({ min: { x: 0, y: 0 }, max: { x: 0, y: 0 } }))
      .not.toContain(invalidReference.id);
  });
});
