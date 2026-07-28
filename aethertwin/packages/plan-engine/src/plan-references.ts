import type {
  Bounds2,
  CalibrationEvidence,
  PlanReference,
  Point2,
  SpatialEntity,
  Transform2D,
} from "@aethertwin/core-model";
import { planFailure, planSuccess, type PlanResult } from "./result";
import { hitTest } from "./selection";
import type { SpatialIndex } from "./spatial-index";
import { invertTransform, normalizeTransform } from "./transforms";

export const PLAN_REFERENCE_WORLD_LIMIT_MM = 1_000_000_000;

export type PlanHit =
  | { readonly kind: "entity"; readonly entityId: string }
  | { readonly kind: "plan-reference"; readonly referenceId: string }
  | null;

export interface HitTestPlanOptions {
  readonly point: Point2;
  readonly tolerance: number;
  readonly entities: readonly SpatialEntity[];
  readonly index: SpatialIndex;
  readonly references: readonly PlanReference[];
  readonly selectableIds?: ReadonlySet<string>;
}

function invalidGeometry(reference: PlanReference, message: string): PlanResult<never> {
  return planFailure("INVALID_PLAN_REFERENCE_GEOMETRY", message, reference.id);
}

function outOfRange(reference: PlanReference): PlanResult<never> {
  return planFailure(
    "PLAN_REFERENCE_OUT_OF_RANGE",
    `Plan-reference geometry must stay within +/-${PLAN_REFERENCE_WORLD_LIMIT_MM} mm.`,
    reference.id,
  );
}

function finitePoint(point: Point2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function worldPointInRange(point: Point2): boolean {
  return finitePoint(point)
    && Math.abs(point.x) <= PLAN_REFERENCE_WORLD_LIMIT_MM
    && Math.abs(point.y) <= PLAN_REFERENCE_WORLD_LIMIT_MM;
}

function validReferenceShape(reference: PlanReference): boolean {
  const { intrinsicSize } = reference;
  return Number.isFinite(intrinsicSize.width)
    && Number.isFinite(intrinsicSize.height)
    && intrinsicSize.width > 0
    && intrinsicSize.height > 0
    && normalizeTransform(reference.transform).ok;
}

function transformPoint(point: Point2, transform: Transform2D): Point2 {
  const scaledX = point.x * transform.scale.x;
  const scaledY = point.y * transform.scale.y;
  const cosine = Math.cos(transform.rotation);
  const sine = Math.sin(transform.rotation);
  return {
    x: scaledX * cosine - scaledY * sine + transform.translation.x,
    y: scaledX * sine + scaledY * cosine + transform.translation.y,
  };
}

function checkedWorldPolygon(
  reference: PlanReference,
): PlanResult<readonly [Point2, Point2, Point2, Point2]> {
  if (!validReferenceShape(reference)) {
    return invalidGeometry(reference, "Plan-reference size and transform must be finite and non-degenerate.");
  }
  const normalized = normalizeTransform(reference.transform);
  if (!normalized.ok) {
    return invalidGeometry(reference, "Plan-reference size and transform must be finite and non-degenerate.");
  }
  const { width, height } = reference.intrinsicSize;
  const polygon = [
    transformPoint({ x: 0, y: 0 }, normalized.value),
    transformPoint({ x: width, y: 0 }, normalized.value),
    transformPoint({ x: width, y: height }, normalized.value),
    transformPoint({ x: 0, y: height }, normalized.value),
  ] as const;
  return polygon.every(worldPointInRange) ? planSuccess(polygon) : outOfRange(reference);
}

export function clonePlanReference(
  reference: PlanReference,
  transform: Transform2D = reference.transform,
  calibration: CalibrationEvidence | null = reference.calibration,
): PlanReference {
  return {
    ...reference,
    tags: [...reference.tags],
    intrinsicSize: { ...reference.intrinsicSize },
    transform: {
      translation: { ...transform.translation },
      rotation: transform.rotation,
      scale: { ...transform.scale },
    },
    calibration: calibration === null ? null : {
      sourcePointA: { ...calibration.sourcePointA },
      sourcePointB: { ...calibration.sourcePointB },
      measuredDistanceMm: calibration.measuredDistanceMm,
    },
  };
}

export function planReferenceSourceToWorld(
  reference: PlanReference,
  point: Point2,
): PlanResult<Point2> {
  if (!finitePoint(point)) {
    return invalidGeometry(reference, "Plan-reference conversion points must be finite.");
  }
  const polygon = checkedWorldPolygon(reference);
  if (!polygon.ok) return polygon;
  const normalized = normalizeTransform(reference.transform);
  if (!normalized.ok) {
    return invalidGeometry(reference, "Plan-reference size and transform must be finite and non-degenerate.");
  }
  const world = transformPoint(point, normalized.value);
  return worldPointInRange(world) ? planSuccess(world) : outOfRange(reference);
}

export function planReferenceWorldToSource(
  reference: PlanReference,
  point: Point2,
): PlanResult<Point2> {
  if (!finitePoint(point)) {
    return invalidGeometry(reference, "Plan-reference conversion points must be finite.");
  }
  if (!worldPointInRange(point)) return outOfRange(reference);
  const polygon = checkedWorldPolygon(reference);
  if (!polygon.ok) return polygon;
  const source = invertTransform(point, reference.transform);
  if (!source.ok || !finitePoint(source.value)) {
    return invalidGeometry(reference, "Plan-reference transform cannot be inverted.");
  }
  return planSuccess({ ...source.value });
}

export function planReferenceWorldPolygon(
  reference: PlanReference,
): PlanResult<readonly [Point2, Point2, Point2, Point2]> {
  const polygon = checkedWorldPolygon(reference);
  if (!polygon.ok) return polygon;
  return planSuccess([
    { ...polygon.value[0] },
    { ...polygon.value[1] },
    { ...polygon.value[2] },
    { ...polygon.value[3] },
  ]);
}

export function planReferenceWorldBounds(reference: PlanReference): PlanResult<Bounds2> {
  const polygon = checkedWorldPolygon(reference);
  if (!polygon.ok) return polygon;
  const xs = polygon.value.map((point) => point.x);
  const ys = polygon.value.map((point) => point.y);
  return planSuccess({
    min: { x: Math.min(...xs), y: Math.min(...ys) },
    max: { x: Math.max(...xs), y: Math.max(...ys) },
  });
}

export function applyPlanReferenceTransform(
  reference: PlanReference,
  transform: Transform2D,
): PlanResult<PlanReference> {
  if (reference.locked) {
    return planFailure(
      "PLAN_REFERENCE_LOCKED",
      "Locked plan references cannot be transformed.",
      reference.id,
    );
  }
  const normalized = normalizeTransform(transform);
  if (!normalized.ok) {
    return invalidGeometry(reference, "Plan-reference size and transform must be finite and non-degenerate.");
  }
  const after = clonePlanReference(reference, normalized.value);
  const polygon = checkedWorldPolygon(after);
  return polygon.ok ? planSuccess(after) : polygon;
}

function squaredDistance(left: Point2, right: Point2): number {
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
}

function distanceToSegment(point: Point2, start: Point2, end: Point2): number {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared === 0) return Math.sqrt(squaredDistance(point, start));
  const projection = Math.max(0, Math.min(1,
    ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared,
  ));
  return Math.hypot(
    point.x - (start.x + projection * deltaX),
    point.y - (start.y + projection * deltaY),
  );
}

function pointInPolygon(point: Point2, polygon: readonly Point2[]): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current, current += 1) {
    const start = polygon[current]!;
    const end = polygon[previous]!;
    if (
      (start.y > point.y) !== (end.y > point.y)
      && point.x < ((end.x - start.x) * (point.y - start.y)) / (end.y - start.y) + start.x
    ) inside = !inside;
  }
  return inside;
}

function polygonHit(point: Point2, tolerance: number, polygon: readonly Point2[]): boolean {
  if (pointInPolygon(point, polygon)) return true;
  return polygon.some((start, index) => (
    distanceToSegment(point, start, polygon[(index + 1) % polygon.length]!) <= tolerance
  ));
}

export function hitTestPlan(options: HitTestPlanOptions): PlanResult<PlanHit> {
  const entityResult = hitTest({
    point: options.point,
    tolerance: options.tolerance,
    entities: options.entities,
    index: options.index,
    ...(options.selectableIds === undefined ? {} : { selectableIds: options.selectableIds }),
  });
  if (!entityResult.ok) return entityResult;
  if (entityResult.value !== null) {
    return planSuccess({ kind: "entity", entityId: entityResult.value });
  }

  for (let index = options.references.length - 1; index >= 0; index -= 1) {
    const reference = options.references[index]!;
    if (options.selectableIds !== undefined && !options.selectableIds.has(reference.id)) continue;
    const polygon = planReferenceWorldPolygon(reference);
    if (!polygon.ok) return polygon;
    if (polygonHit(options.point, options.tolerance, polygon.value)) {
      return planSuccess({ kind: "plan-reference", referenceId: reference.id });
    }
  }
  return planSuccess(null);
}
