import type { Bounds2, Point2, SpatialEntity } from "@aethertwin/core-model";
import { entityWorldBounds, entityWorldVertices } from "./bounds";
import { planFailure, planSuccess, type PlanResult } from "./result";
import type { SpatialIndex } from "./spatial-index";
import { applyTransform, invertTransform } from "./transforms";

export interface HitTestOptions {
  readonly point: Point2;
  readonly tolerance: number;
  readonly entities: readonly SpatialEntity[];
  readonly index: SpatialIndex;
  readonly selectableIds?: ReadonlySet<string>;
}

export interface BoxSelectOptions {
  readonly bounds: Bounds2;
  readonly mode: "intersect" | "contain";
  readonly entities: readonly SpatialEntity[];
  readonly index: SpatialIndex;
  readonly selectableIds?: ReadonlySet<string>;
}

function squaredDistance(left: Point2, right: Point2): number {
  const x = left.x - right.x;
  const y = left.y - right.y;
  return x * x + y * y;
}

function distanceToSegment(point: Point2, start: Point2, end: Point2): number {
  const x = end.x - start.x;
  const y = end.y - start.y;
  const lengthSquared = x * x + y * y;
  if (lengthSquared === 0) return Math.sqrt(squaredDistance(point, start));
  const projection = Math.max(0, Math.min(1,
    ((point.x - start.x) * x + (point.y - start.y) * y) / lengthSquared,
  ));
  return Math.hypot(point.x - (start.x + projection * x), point.y - (start.y + projection * y));
}

function pointInPolygon(point: Point2, vertices: readonly Point2[]): boolean {
  let inside = false;
  for (let current = 0, previous = vertices.length - 1; current < vertices.length; previous = current++) {
    const start = vertices[current]!;
    const end = vertices[previous]!;
    if (
      (start.y > point.y) !== (end.y > point.y)
      && point.x < ((end.x - start.x) * (point.y - start.y)) / (end.y - start.y) + start.x
    ) inside = !inside;
  }
  return inside;
}

function polygonHit(point: Point2, tolerance: number, vertices: readonly Point2[]): boolean {
  if (vertices.length < 2) return false;
  if (vertices.length >= 3 && pointInPolygon(point, vertices)) return true;
  return vertices.some((vertex, index) => (
    distanceToSegment(point, vertex, vertices[(index + 1) % vertices.length]!) <= tolerance
  ));
}

function wallHalfWidth(
  start: Point2,
  end: Point2,
  entity: Extract<SpatialEntity, { type: "wall" }>,
): number {
  const authoredHalfWidth = Math.max(0, entity.thickness) / 2;
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);
  const scaleX = Math.abs(entity.transform.scale.x);
  const scaleY = Math.abs(entity.transform.scale.y);
  if (length === 0) return authoredHalfWidth * Math.max(scaleX, scaleY);

  const tangentScale = Math.hypot(deltaX * scaleX, deltaY * scaleY) / length;
  return tangentScale === 0
    ? 0
    : authoredHalfWidth * scaleX * scaleY / tangentScale;
}

function wallHit(
  point: Point2,
  tolerance: number,
  entity: Extract<SpatialEntity, { type: "wall" }>,
): boolean {
  const world = entityWorldVertices(entity);
  if (world.length === 1) {
    const radius = wallHalfWidth(entity.centerLine[0]!, entity.centerLine[0]!, entity);
    return distanceToSegment(point, world[0]!, world[0]!) <= radius + tolerance;
  }
  return world.slice(0, -1).some((start, index) => {
    const radius = wallHalfWidth(
      entity.centerLine[index]!,
      entity.centerLine[index + 1]!,
      entity,
    );
    return distanceToSegment(point, start, world[index + 1]!) <= radius + tolerance;
  });
}

interface PoiEllipse {
  readonly center: Point2;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly cosine: number;
  readonly sine: number;
}

function poiEllipse(entity: Extract<SpatialEntity, { type: "poi" }>): PoiEllipse {
  const radius = Math.max(0, entity.radius ?? 0);
  return {
    center: applyTransform({ x: 0, y: 0 }, entity.transform),
    radiusX: radius * Math.abs(entity.transform.scale.x),
    radiusY: radius * Math.abs(entity.transform.scale.y),
    cosine: Math.cos(entity.transform.rotation),
    sine: Math.sin(entity.transform.rotation),
  };
}

function poiPrincipalCoordinates(point: Point2, ellipse: PoiEllipse): Point2 {
  const translatedX = point.x - ellipse.center.x;
  const translatedY = point.y - ellipse.center.y;
  return {
    x: Math.abs(translatedX * ellipse.cosine + translatedY * ellipse.sine),
    y: Math.abs(-translatedX * ellipse.sine + translatedY * ellipse.cosine),
  };
}

function distanceToPoiEllipse(
  point: Point2,
  entity: Extract<SpatialEntity, { type: "poi" }>,
): number {
  const ellipse = poiEllipse(entity);
  if (ellipse.radiusX === 0 || ellipse.radiusY === 0) {
    return Math.sqrt(squaredDistance(point, ellipse.center));
  }
  const principal = poiPrincipalCoordinates(point, ellipse);

  const radiusXSquared = ellipse.radiusX * ellipse.radiusX;
  const radiusYSquared = ellipse.radiusY * ellipse.radiusY;
  const equation = (lambda: number) => (
    (ellipse.radiusX * principal.x / (lambda + radiusXSquared)) ** 2
    + (ellipse.radiusY * principal.y / (lambda + radiusYSquared)) ** 2
  );
  if (equation(0) <= 1) return 0;

  let low = 0;
  let high = Math.max(radiusXSquared, radiusYSquared, 1);
  while (equation(high) > 1) high *= 2;
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const middle = (low + high) / 2;
    if (equation(middle) > 1) low = middle;
    else high = middle;
  }
  const closestX = radiusXSquared * principal.x / (high + radiusXSquared);
  const closestY = radiusYSquared * principal.y / (high + radiusYSquared);
  return Math.hypot(principal.x - closestX, principal.y - closestY);
}

function poiHit(
  point: Point2,
  tolerance: number,
  entity: Extract<SpatialEntity, { type: "poi" }>,
): boolean {
  return distanceToPoiEllipse(point, entity) <= tolerance;
}

function fixtureHit(
  point: Point2,
  tolerance: number,
  entity: Extract<SpatialEntity, { type: "fixture" }>,
): boolean {
  const local = invertTransform(point, entity.transform);
  if (!local.ok) return false;
  const minX = Math.min(0, entity.size.width);
  const maxX = Math.max(0, entity.size.width);
  const minY = Math.min(0, entity.size.height);
  const maxY = Math.max(0, entity.size.height);
  const closest = {
    x: Math.max(minX, Math.min(maxX, local.value.x)),
    y: Math.max(minY, Math.min(maxY, local.value.y)),
  };
  if (closest.x === local.value.x && closest.y === local.value.y) return true;
  return Math.sqrt(squaredDistance(point, applyTransform(closest, entity.transform))) <= tolerance;
}

function entityHit(entity: SpatialEntity, point: Point2, tolerance: number): boolean {
  switch (entity.type) {
    case "wall":
      return wallHit(point, tolerance, entity);
    case "poi":
      return poiHit(point, tolerance, entity);
    case "fixture":
      return fixtureHit(point, tolerance, entity);
    case "boundary":
    case "zone":
    case "space-unit":
      return polygonHit(point, tolerance, entityWorldVertices(entity));
    case "dimension":
      return false;
  }
}

function validPoint(point: Point2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function normalizedBounds(bounds: Bounds2): Bounds2 {
  return {
    min: { x: Math.min(bounds.min.x, bounds.max.x), y: Math.min(bounds.min.y, bounds.max.y) },
    max: { x: Math.max(bounds.min.x, bounds.max.x), y: Math.max(bounds.min.y, bounds.max.y) },
  };
}

function pointInBounds(point: Point2, bounds: Bounds2): boolean {
  return point.x >= bounds.min.x && point.x <= bounds.max.x
    && point.y >= bounds.min.y && point.y <= bounds.max.y;
}

function boundsContain(outer: Bounds2, inner: Bounds2): boolean {
  return inner.min.x >= outer.min.x && inner.max.x <= outer.max.x
    && inner.min.y >= outer.min.y && inner.max.y <= outer.max.y;
}

function orientation(first: Point2, second: Point2, third: Point2): number {
  return (second.x - first.x) * (third.y - first.y)
    - (second.y - first.y) * (third.x - first.x);
}

function segmentsIntersect(a: Point2, b: Point2, c: Point2, d: Point2): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC === 0 && distanceToSegment(c, a, b) === 0) return true;
  if (abD === 0 && distanceToSegment(d, a, b) === 0) return true;
  if (cdA === 0 && distanceToSegment(a, c, d) === 0) return true;
  if (cdB === 0 && distanceToSegment(b, c, d) === 0) return true;
  return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0);
}

function boundsCorners(bounds: Bounds2): readonly Point2[] {
  return [
    bounds.min,
    { x: bounds.max.x, y: bounds.min.y },
    bounds.max,
    { x: bounds.min.x, y: bounds.max.y },
  ];
}

function polygonIntersectsBounds(vertices: readonly Point2[], bounds: Bounds2): boolean {
  if (vertices.some((vertex) => pointInBounds(vertex, bounds))) return true;
  const corners = boundsCorners(bounds);
  if (vertices.length >= 3 && corners.some((corner) => pointInPolygon(corner, vertices))) return true;
  return vertices.some((start, index) => {
    const end = vertices[(index + 1) % vertices.length]!;
    return corners.some((corner, cornerIndex) => (
      segmentsIntersect(start, end, corner, corners[(cornerIndex + 1) % corners.length]!)
    ));
  });
}

function pointToBoundsDistance(point: Point2, bounds: Bounds2): number {
  const deltaX = Math.max(bounds.min.x - point.x, 0, point.x - bounds.max.x);
  const deltaY = Math.max(bounds.min.y - point.y, 0, point.y - bounds.max.y);
  return Math.hypot(deltaX, deltaY);
}

function segmentToBoundsDistance(start: Point2, end: Point2, bounds: Bounds2): number {
  if (pointInBounds(start, bounds) || pointInBounds(end, bounds)) return 0;
  const corners = boundsCorners(bounds);
  if (corners.some((corner, index) => (
    segmentsIntersect(start, end, corner, corners[(index + 1) % corners.length]!)
  ))) return 0;
  return Math.min(
    pointToBoundsDistance(start, bounds),
    pointToBoundsDistance(end, bounds),
    ...corners.map((corner) => distanceToSegment(corner, start, end)),
  );
}

function wallIntersectsBounds(
  entity: Extract<SpatialEntity, { type: "wall" }>,
  bounds: Bounds2,
): boolean {
  const vertices = entityWorldVertices(entity);
  if (vertices.length === 1) {
    const radius = wallHalfWidth(entity.centerLine[0]!, entity.centerLine[0]!, entity);
    return pointToBoundsDistance(vertices[0]!, bounds) <= radius;
  }
  return vertices.slice(0, -1).some((start, index) => {
    const radius = wallHalfWidth(
      entity.centerLine[index]!,
      entity.centerLine[index + 1]!,
      entity,
    );
    return segmentToBoundsDistance(start, vertices[index + 1]!, bounds) <= radius;
  });
}

function poiIntersectsBounds(
  entity: Extract<SpatialEntity, { type: "poi" }>,
  bounds: Bounds2,
): boolean {
  const ellipse = poiEllipse(entity);
  if (ellipse.radiusX === 0 || ellipse.radiusY === 0) {
    return pointInBounds(ellipse.center, bounds);
  }
  if (pointInBounds(ellipse.center, bounds)) return true;

  const inverseX = 1 / (ellipse.radiusX * ellipse.radiusX);
  const inverseY = 1 / (ellipse.radiusY * ellipse.radiusY);
  const qxx = ellipse.cosine ** 2 * inverseX + ellipse.sine ** 2 * inverseY;
  const qxy = ellipse.cosine * ellipse.sine * (inverseX - inverseY);
  const qyy = ellipse.sine ** 2 * inverseX + ellipse.cosine ** 2 * inverseY;
  const minDeltaX = bounds.min.x - ellipse.center.x;
  const maxDeltaX = bounds.max.x - ellipse.center.x;
  const minDeltaY = bounds.min.y - ellipse.center.y;
  const maxDeltaY = bounds.max.y - ellipse.center.y;
  const quadratic = (deltaX: number, deltaY: number) => (
    qxx * deltaX * deltaX + 2 * qxy * deltaX * deltaY + qyy * deltaY * deltaY
  );
  const clamp = (value: number, minimum: number, maximum: number) => (
    Math.max(minimum, Math.min(maximum, value))
  );
  const verticalMinimum = (deltaX: number) => quadratic(
    deltaX,
    clamp(-qxy * deltaX / qyy, minDeltaY, maxDeltaY),
  );
  const horizontalMinimum = (deltaY: number) => quadratic(
    clamp(-qxy * deltaY / qxx, minDeltaX, maxDeltaX),
    deltaY,
  );
  return Math.min(
    verticalMinimum(minDeltaX),
    verticalMinimum(maxDeltaX),
    horizontalMinimum(minDeltaY),
    horizontalMinimum(maxDeltaY),
  ) <= 1;
}

function entityIntersectsBounds(entity: SpatialEntity, bounds: Bounds2): boolean {
  switch (entity.type) {
    case "wall":
      return wallIntersectsBounds(entity, bounds);
    case "fixture":
    case "boundary":
    case "zone":
    case "space-unit":
      return polygonIntersectsBounds(entityWorldVertices(entity), bounds);
    case "poi":
      return poiIntersectsBounds(entity, bounds);
    case "dimension":
      return false;
  }
}

function isSelectable(entity: SpatialEntity, selectableIds?: ReadonlySet<string>): boolean {
  return entity.type !== "dimension"
    && !entity.locked
    && (selectableIds === undefined || selectableIds.has(entity.id));
}

export function hitTest(options: HitTestOptions): PlanResult<string | null> {
  if (!validPoint(options.point) || !Number.isFinite(options.tolerance) || options.tolerance < 0) {
    return planFailure("INVALID_SELECTION", "Hit-test point and tolerance must be finite and non-negative.");
  }
  const queryBounds = {
    min: { x: options.point.x - options.tolerance, y: options.point.y - options.tolerance },
    max: { x: options.point.x + options.tolerance, y: options.point.y + options.tolerance },
  };
  if (!validPoint(queryBounds.min) || !validPoint(queryBounds.max)) {
    return planFailure("INVALID_SELECTION", "Hit-test query bounds must be finite.");
  }
  const candidates = new Set(options.index.query(queryBounds));
  for (let index = options.entities.length - 1; index >= 0; index -= 1) {
    const entity = options.entities[index]!;
    if (
      candidates.has(entity.id)
      && isSelectable(entity, options.selectableIds)
      && entityHit(entity, options.point, options.tolerance)
    ) return planSuccess(entity.id);
  }
  return planSuccess(null);
}

export function boxSelect(options: BoxSelectOptions): PlanResult<readonly string[]> {
  if (!validPoint(options.bounds.min) || !validPoint(options.bounds.max)) {
    return planFailure("INVALID_SELECTION", "Box-selection bounds must be finite.");
  }
  if (options.mode !== "intersect" && options.mode !== "contain") {
    return planFailure("INVALID_SELECTION", "Box-selection mode must be intersect or contain.");
  }
  const bounds = normalizedBounds(options.bounds);
  const candidates = new Set(options.index.query(bounds));
  const selected = options.entities.filter((entity) => {
    if (!candidates.has(entity.id) || !isSelectable(entity, options.selectableIds)) return false;
    return options.mode === "contain"
      ? boundsContain(bounds, entityWorldBounds(entity))
      : entityIntersectsBounds(entity, bounds);
  });
  return planSuccess(selected.map((entity) => entity.id));
}
