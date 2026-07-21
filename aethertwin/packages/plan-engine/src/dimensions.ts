import type {
  DimensionAnchor,
  DimensionAnnotation,
  Point2,
  SpatialEntity,
  Transform2D,
} from "@aethertwin/core-model";
import { entityWorldVertices } from "./bounds";
import { planFailure, planSuccess, type PlanResult } from "./result";
import { applyTransform, normalizeTransform } from "./transforms";
import { formatLength, type DisplayUnit } from "./units";

export interface ResolvedDimensionAnchors {
  readonly start: Point2;
  readonly end: Point2;
}

export interface DimensionLineSegment {
  readonly start: Point2;
  readonly end: Point2;
}

export interface DimensionGeometry {
  readonly extensionLines: readonly [DimensionLineSegment, DimensionLineSegment];
  readonly dimensionLine: DimensionLineSegment;
  readonly labelPoint: Point2;
  readonly measuredMillimetres: number;
  readonly label: string;
}

interface EntityAnchorPath {
  readonly points: readonly Point2[];
  readonly closed: boolean;
}

const DISPLAY_UNITS = new Set<DisplayUnit>(["m", "cm", "mm"]);

function isFinitePoint(point: Point2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function isValidTransform(transform: Transform2D): boolean {
  return normalizeTransform(transform).ok;
}

function invalidAnchor(dimension: DimensionAnnotation, detail: string): PlanResult<never> {
  return planFailure(
    "INVALID_DIMENSION_ANCHOR",
    `Invalid dimension anchor: ${detail}`,
    dimension.id,
  );
}

function entityAnchorPath(entity: SpatialEntity): EntityAnchorPath | null {
  switch (entity.type) {
    case "boundary":
    case "zone":
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

function stableCoordinate(start: number, end: number, t: number): number {
  if (start === end) return start;

  const delta = end - start;
  if (Number.isFinite(delta)) return start + delta * t;

  return t === 0.5
    ? start / 2 + end / 2
    : (1 - t) * start + t * end;
}

function resolvedAnchor(
  point: Point2,
  dimension: DimensionAnnotation,
  detail: string,
): PlanResult<Point2> {
  return isFinitePoint(point) ? planSuccess(point) : invalidAnchor(dimension, detail);
}

function resolveAnchor(
  anchor: DimensionAnchor,
  dimension: DimensionAnnotation,
  entitiesById: ReadonlyMap<string, SpatialEntity>,
): PlanResult<Point2> {
  if (anchor.kind === "point") {
    if (!isFinitePoint(anchor.point) || !isValidTransform(dimension.transform)) {
      return invalidAnchor(dimension, "local point or dimension transform is invalid.");
    }
    return resolvedAnchor(
      applyTransform(anchor.point, dimension.transform),
      dimension,
      "transformed local point is not finite.",
    );
  }

  const target = entitiesById.get(anchor.entityId);
  if (target === undefined) return invalidAnchor(dimension, "referenced entity is missing.");
  if (!isValidTransform(target.transform)) {
    return invalidAnchor(dimension, "referenced entity transform is invalid.");
  }
  if (anchor.locator === "origin") {
    return resolvedAnchor(
      applyTransform({ x: 0, y: 0 }, target.transform),
      dimension,
      "transformed entity origin is not finite.",
    );
  }

  const path = entityAnchorPath(target);
  if (path === null || !path.points.every(isFinitePoint)) {
    return invalidAnchor(dimension, "locator is unsupported by the referenced entity.");
  }
  const locator = anchor.locator;
  if ("vertex" in locator) {
    if (!Number.isInteger(locator.vertex) || locator.vertex < 0 || locator.vertex >= path.points.length) {
      return invalidAnchor(dimension, "vertex index is out of range.");
    }
    return resolvedAnchor(
      path.points[locator.vertex]!,
      dimension,
      "transformed entity vertex is not finite.",
    );
  }

  const segmentCount = path.closed ? path.points.length : Math.max(0, path.points.length - 1);
  if (
    !Number.isInteger(locator.segment)
    || locator.segment < 0
    || locator.segment >= segmentCount
    || !Number.isFinite(locator.t)
    || locator.t < 0
    || locator.t > 1
  ) {
    return invalidAnchor(dimension, "segment locator is out of range.");
  }
  const start = path.points[locator.segment]!;
  const end = path.points[path.closed
    ? (locator.segment + 1) % path.points.length
    : locator.segment + 1]!;
  const point = locator.t === 0
    ? start
    : locator.t === 1
      ? end
      : {
          x: stableCoordinate(start.x, end.x, locator.t),
          y: stableCoordinate(start.y, end.y, locator.t),
        };
  return resolvedAnchor(point, dimension, "interpolated segment point is not finite.");
}

export function resolveDimensionAnchors(
  dimension: DimensionAnnotation,
  entitiesById: ReadonlyMap<string, SpatialEntity>,
): PlanResult<ResolvedDimensionAnchors> {
  const start = resolveAnchor(dimension.start, dimension, entitiesById);
  if (!start.ok) return start;
  const end = resolveAnchor(dimension.end, dimension, entitiesById);
  if (!end.ok) return end;
  return planSuccess({ start: start.value, end: end.value });
}

function invalidGeometry(dimension: DimensionAnnotation, detail: string): PlanResult<never> {
  return planFailure(
    "INVALID_DIMENSION_GEOMETRY",
    `Invalid dimension geometry: ${detail}`,
    dimension.id,
  );
}

export function dimensionGeometry(
  dimension: DimensionAnnotation,
  entitiesById: ReadonlyMap<string, SpatialEntity>,
  defaultUnit: DisplayUnit = "mm",
): PlanResult<DimensionGeometry> {
  if (!Number.isFinite(dimension.offset)) {
    return invalidGeometry(dimension, "offset must be finite.");
  }
  const displayUnit = dimension.displayUnit ?? defaultUnit;
  if (!DISPLAY_UNITS.has(displayUnit)) {
    return invalidGeometry(dimension, "display unit must be supported.");
  }

  const anchors = resolveDimensionAnchors(dimension, entitiesById);
  if (!anchors.ok) return anchors;
  const deltaX = anchors.value.end.x - anchors.value.start.x;
  const deltaY = anchors.value.end.y - anchors.value.start.y;
  const measuredMillimetres = Math.hypot(deltaX, deltaY);
  if (!Number.isFinite(measuredMillimetres) || measuredMillimetres <= 0) {
    return invalidGeometry(dimension, "anchor distance must be positive and finite.");
  }

  const offsetX = -deltaY / measuredMillimetres * dimension.offset;
  const offsetY = deltaX / measuredMillimetres * dimension.offset;
  const dimensionStart = {
    x: anchors.value.start.x + offsetX,
    y: anchors.value.start.y + offsetY,
  };
  const dimensionEnd = {
    x: anchors.value.end.x + offsetX,
    y: anchors.value.end.y + offsetY,
  };
  if (!isFinitePoint(dimensionStart) || !isFinitePoint(dimensionEnd)) {
    return invalidGeometry(dimension, "offset geometry must be finite.");
  }
  const labelPoint = {
    x: stableCoordinate(dimensionStart.x, dimensionEnd.x, 0.5),
    y: stableCoordinate(dimensionStart.y, dimensionEnd.y, 0.5),
  };
  if (!isFinitePoint(labelPoint)) {
    return invalidGeometry(dimension, "label midpoint must be finite.");
  }

  return planSuccess({
    extensionLines: [
      { start: anchors.value.start, end: dimensionStart },
      { start: anchors.value.end, end: dimensionEnd },
    ],
    dimensionLine: { start: dimensionStart, end: dimensionEnd },
    labelPoint,
    measuredMillimetres,
    label: formatLength(measuredMillimetres, displayUnit),
  });
}
