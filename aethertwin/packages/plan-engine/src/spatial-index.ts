import type { Bounds2, SpatialEntity } from "@aethertwin/core-model";
import { entityWorldCullingBounds } from "./bounds";

export interface SpatialIndex {
  rebuild(entities: readonly SpatialEntity[]): void;
  query(bounds: Bounds2): readonly string[];
}

interface IndexedEntity {
  readonly id: string;
  readonly bounds: Bounds2;
}

interface CellRange {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

const MAX_ENUMERABLE_CELL_COUNT = 10_000;

function cellRange(bounds: Bounds2, cellSizeMillimetres: number): CellRange | null {
  const minX = Math.floor(bounds.min.x / cellSizeMillimetres);
  const minY = Math.floor(bounds.min.y / cellSizeMillimetres);
  const maxX = Math.floor(bounds.max.x / cellSizeMillimetres);
  const maxY = Math.floor(bounds.max.y / cellSizeMillimetres);
  if (![minX, minY, maxX, maxY].every(Number.isSafeInteger)) return null;

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width <= 0
    || height <= 0
    || width > MAX_ENUMERABLE_CELL_COUNT
    || height > Math.floor(MAX_ENUMERABLE_CELL_COUNT / width)
  ) return null;

  return { minX, minY, width, height };
}

function hasFiniteBounds(bounds: Bounds2): boolean {
  return Number.isFinite(bounds.min.x)
    && Number.isFinite(bounds.min.y)
    && Number.isFinite(bounds.max.x)
    && Number.isFinite(bounds.max.y);
}

function normalizedBounds(bounds: Bounds2): Bounds2 {
  return {
    min: {
      x: Math.min(bounds.min.x, bounds.max.x),
      y: Math.min(bounds.min.y, bounds.max.y),
    },
    max: {
      x: Math.max(bounds.min.x, bounds.max.x),
      y: Math.max(bounds.min.y, bounds.max.y),
    },
  };
}

function intersects(left: Bounds2, right: Bounds2): boolean {
  return left.max.x >= right.min.x
    && left.min.x <= right.max.x
    && left.max.y >= right.min.y
    && left.min.y <= right.max.y;
}

export class UniformGridSpatialIndex implements SpatialIndex {
  readonly cellSizeMillimetres: number;
  readonly #cells = new Map<string, string[]>();
  readonly #ungriddedEntityIds = new Set<string>();
  #entities: readonly IndexedEntity[] = [];

  constructor(cellSizeMillimetres = 1000) {
    if (!Number.isFinite(cellSizeMillimetres) || cellSizeMillimetres <= 0) {
      throw new RangeError("Spatial index cell size must be a positive finite length.");
    }
    this.cellSizeMillimetres = cellSizeMillimetres;
  }

  static from(
    entities: readonly SpatialEntity[],
    cellSizeMillimetres?: number,
  ): UniformGridSpatialIndex {
    const index = new UniformGridSpatialIndex(cellSizeMillimetres);
    index.rebuild(entities);
    return index;
  }

  rebuild(entities: readonly SpatialEntity[]): void {
    this.#cells.clear();
    this.#ungriddedEntityIds.clear();
    const entitiesById = new Map<string, SpatialEntity>();
    for (const entity of entities) {
      if (!entitiesById.has(entity.id)) entitiesById.set(entity.id, entity);
    }
    this.#entities = entities.flatMap((entity) => {
      const bounds = entityWorldCullingBounds(entity, entitiesById);
      if (bounds === null) return [];
      if (!hasFiniteBounds(bounds)) {
        throw new RangeError("Spatial entity bounds must be finite.");
      }
      return [{ id: entity.id, bounds: normalizedBounds(bounds) }];
    });

    for (const entity of this.#entities) {
      const range = cellRange(entity.bounds, this.cellSizeMillimetres);
      if (range === null) {
        this.#ungriddedEntityIds.add(entity.id);
        continue;
      }
      this.#forEachCell(range, (key) => {
        const ids = this.#cells.get(key);
        if (ids === undefined) this.#cells.set(key, [entity.id]);
        else ids.push(entity.id);
      });
    }
  }

  query(bounds: Bounds2): readonly string[] {
    if (!hasFiniteBounds(bounds)) {
      throw new RangeError("Spatial index query bounds must be finite.");
    }
    const queryBounds = normalizedBounds(bounds);
    const range = cellRange(queryBounds, this.cellSizeMillimetres);
    if (range === null) return this.#exactMatches(queryBounds);

    const candidateIds = new Set(this.#ungriddedEntityIds);
    this.#forEachCell(range, (key) => {
      for (const id of this.#cells.get(key) ?? []) candidateIds.add(id);
    });
    return this.#exactMatches(queryBounds, candidateIds);
  }

  #exactMatches(queryBounds: Bounds2, candidateIds?: ReadonlySet<string>): readonly string[] {
    const emittedIds = new Set<string>();
    const result: string[] = [];
    for (const entity of this.#entities) {
      if (
        !emittedIds.has(entity.id)
        && (candidateIds === undefined || candidateIds.has(entity.id))
        && intersects(entity.bounds, queryBounds)
      ) {
        emittedIds.add(entity.id);
        result.push(entity.id);
      }
    }
    return result;
  }

  #forEachCell(range: CellRange, visit: (key: string) => void): void {
    for (let yOffset = 0; yOffset < range.height; yOffset += 1) {
      const y = range.minY + yOffset;
      for (let xOffset = 0; xOffset < range.width; xOffset += 1) {
        visit(`${range.minX + xOffset}:${y}`);
      }
    }
  }
}
