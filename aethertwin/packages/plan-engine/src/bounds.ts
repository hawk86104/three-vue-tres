import type {
  Bounds2,
  DimensionAnchor,
  Point2,
  SpatialEntity,
  Transform2D,
} from "@aethertwin/core-model";
import { applyTransform } from "./transforms";

function fixtureVertices(width: number, height: number): readonly Point2[] {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

function localVertices(entity: SpatialEntity): readonly Point2[] {
  switch (entity.type) {
    case "boundary":
    case "zone":
      return entity.polygon;
    case "space-unit":
      return entity.footprint;
    case "wall":
      return entity.centerLine;
    case "fixture":
      return fixtureVertices(entity.size.width, entity.size.height);
    case "poi":
      return [{ x: 0, y: 0 }];
    case "dimension":
      return [entity.start, entity.end].flatMap((anchor) => (
        anchor.kind === "point" ? [anchor.point] : []
      ));
  }
}

function transformPoints(points: readonly Point2[], transform: Transform2D): readonly Point2[] {
  return points.map((point) => applyTransform(point, transform));
}

function boundsFromPoints(points: readonly Point2[], fallback: Point2): Bounds2 {
  if (points.length === 0) return { min: fallback, max: fallback };

  let minX = points[0]!.x;
  let minY = points[0]!.y;
  let maxX = minX;
  let maxY = minY;
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

function expandedWallPoints(entity: Extract<SpatialEntity, { type: "wall" }>): readonly Point2[] {
  const halfThickness = Math.max(0, entity.thickness) / 2;
  return entity.centerLine.flatMap((point) => [
    { x: point.x - halfThickness, y: point.y - halfThickness },
    { x: point.x + halfThickness, y: point.y - halfThickness },
    { x: point.x + halfThickness, y: point.y + halfThickness },
    { x: point.x - halfThickness, y: point.y + halfThickness },
  ]);
}

function poiBounds(entity: Extract<SpatialEntity, { type: "poi" }>): Bounds2 {
  const radius = Math.max(0, entity.radius ?? 0);
  const { rotation, scale } = entity.transform;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const extentX = radius * Math.hypot(cosine * scale.x, sine * scale.y);
  const extentY = radius * Math.hypot(sine * scale.x, cosine * scale.y);
  const center = applyTransform({ x: 0, y: 0 }, entity.transform);
  return {
    min: { x: center.x - extentX, y: center.y - extentY },
    max: { x: center.x + extentX, y: center.y + extentY },
  };
}

interface EntityAnchorPath {
  readonly points: readonly Point2[];
  readonly closed: boolean;
}

function entityAnchorPath(entity: SpatialEntity): EntityAnchorPath | null {
  switch (entity.type) {
    case "boundary":
    case "zone":
      return { points: entityWorldVertices(entity), closed: true };
    case "space-unit":
      return { points: entityWorldVertices(entity), closed: true };
    case "wall":
      return { points: entityWorldVertices(entity), closed: false };
    case "fixture":
    case "poi":
    case "dimension":
      return null;
  }
}

function resolveDimensionAnchor(
  anchor: DimensionAnchor,
  dimension: Extract<SpatialEntity, { type: "dimension" }>,
  entitiesById: ReadonlyMap<string, SpatialEntity>,
): Point2 | null {
  if (anchor.kind === "point") return applyTransform(anchor.point, dimension.transform);

  const target = entitiesById.get(anchor.entityId);
  if (target === undefined) return null;
  if (anchor.locator === "origin") return applyTransform({ x: 0, y: 0 }, target.transform);

  const path = entityAnchorPath(target);
  if (path === null) return null;
  const locator = anchor.locator;
  if ("vertex" in locator) {
    return Number.isInteger(locator.vertex) && locator.vertex >= 0
      ? path.points[locator.vertex] ?? null
      : null;
  }

  const segmentCount = path.closed ? path.points.length : Math.max(0, path.points.length - 1);
  if (
    !Number.isInteger(locator.segment)
    || locator.segment < 0
    || locator.segment >= segmentCount
    || !Number.isFinite(locator.t)
    || locator.t < 0
    || locator.t > 1
  ) return null;

  const start = path.points[locator.segment]!;
  const end = path.points[path.closed
    ? (locator.segment + 1) % path.points.length
    : locator.segment + 1]!;
  return {
    x: start.x + (end.x - start.x) * locator.t,
    y: start.y + (end.y - start.y) * locator.t,
  };
}

function dimensionCullingPoints(
  dimension: Extract<SpatialEntity, { type: "dimension" }>,
  entitiesById: ReadonlyMap<string, SpatialEntity>,
): readonly Point2[] {
  const start = resolveDimensionAnchor(dimension.start, dimension, entitiesById);
  const end = resolveDimensionAnchor(dimension.end, dimension, entitiesById);
  const points: Point2[] = [];
  if (start !== null) points.push(start);
  if (end !== null) points.push(end);

  if (start !== null && end !== null && Number.isFinite(dimension.offset)) {
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const length = Math.hypot(deltaX, deltaY);
    if (length > 0) {
      const offsetX = -deltaY / length * dimension.offset;
      const offsetY = deltaX / length * dimension.offset;
      points.push(
        { x: start.x + offsetX, y: start.y + offsetY },
        { x: end.x + offsetX, y: end.y + offsetY },
      );
    }
  }
  return points;
}

export function entityWorldVertices(entity: SpatialEntity): readonly Point2[] {
  return transformPoints(localVertices(entity), entity.transform);
}

export function entityWorldBounds(entity: SpatialEntity): Bounds2 {
  if (entity.type === "poi") return poiBounds(entity);

  const fallback = applyTransform({ x: 0, y: 0 }, entity.transform);
  const points = entity.type === "wall"
    ? transformPoints(expandedWallPoints(entity), entity.transform)
    : entityWorldVertices(entity);
  return boundsFromPoints(points, fallback);
}

export function entityWorldCullingBounds(
  entity: SpatialEntity,
  entitiesById: ReadonlyMap<string, SpatialEntity>,
): Bounds2 | null {
  if (entity.type !== "dimension") return entityWorldBounds(entity);

  const points = dimensionCullingPoints(entity, entitiesById);
  if (points.length === 0) return null;
  return boundsFromPoints(points, points[0]!);
}
