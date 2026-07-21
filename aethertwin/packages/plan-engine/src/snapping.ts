import type { Point2 } from "@aethertwin/core-model";
import { planFailure, planSuccess, type PlanResult } from "./result";

export type SnapMode = "endpoint" | "midpoint" | "edge" | "alignment" | "grid" | "angle";
export type PointSnapMode = Exclude<SnapMode, "angle">;

export interface PointSnapCandidate {
  readonly mode: PointSnapMode;
  readonly point: Point2;
  readonly entityId?: string;
  readonly guide?: { readonly start: Point2; readonly end: Point2 };
}

export interface SnapResult {
  readonly candidate: PointSnapCandidate | null;
  readonly delta: Point2;
}

export interface FindSnapInput {
  readonly worldPoint: Point2;
  readonly pixelsPerMillimetre: number;
  readonly tolerancePixels: number;
  readonly modes: ReadonlySet<PointSnapMode>;
  readonly gridSize: number;
  readonly candidates: readonly PointSnapCandidate[];
}

export interface AlignmentGuidesInput {
  readonly worldPoint: Point2;
  readonly referencePoints: readonly Point2[];
}

const POINT_PRIORITY: readonly PointSnapMode[] = [
  "endpoint",
  "midpoint",
  "edge",
  "alignment",
  "grid",
];
const POINT_MODES = new Set<PointSnapMode>(POINT_PRIORITY);
const TAU = Math.PI * 2;

function isFinitePoint(point: Point2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function invalidSnap(message: string): PlanResult<never> {
  return planFailure("INVALID_SNAP_INPUT", message);
}

function isPointMode(value: unknown): value is PointSnapMode {
  return typeof value === "string" && POINT_MODES.has(value as PointSnapMode);
}

function isValidCandidate(candidate: PointSnapCandidate): boolean {
  return isPointMode(candidate.mode)
    && isFinitePoint(candidate.point)
    && (candidate.entityId === undefined || typeof candidate.entityId === "string")
    && (candidate.guide === undefined
      || (isFinitePoint(candidate.guide.start) && isFinitePoint(candidate.guide.end)));
}

function validateFindSnapInput(input: FindSnapInput): PlanResult<true> {
  if (!isFinitePoint(input.worldPoint)) return invalidSnap("World point must be finite.");
  if (!Number.isFinite(input.pixelsPerMillimetre) || input.pixelsPerMillimetre <= 0) {
    return invalidSnap("Pixels per millimetre must be positive and finite.");
  }
  if (!Number.isFinite(input.tolerancePixels) || input.tolerancePixels < 0) {
    return invalidSnap("Pixel tolerance must be nonnegative and finite.");
  }
  if (!Number.isFinite(input.gridSize) || input.gridSize <= 0) {
    return invalidSnap("Grid size must be positive and finite.");
  }
  for (const mode of input.modes) {
    if (!isPointMode(mode)) return invalidSnap("Point snap modes must be recognized.");
  }
  if (!input.candidates.every(isValidCandidate)) {
    return invalidSnap("Snap candidates and guides must contain finite points.");
  }
  return planSuccess(true);
}

function synthesizedGridCandidate(worldPoint: Point2, gridSize: number): PointSnapCandidate | null {
  const point = {
    x: Math.round(worldPoint.x / gridSize) * gridSize,
    y: Math.round(worldPoint.y / gridSize) * gridSize,
  };
  return isFinitePoint(point) ? { mode: "grid", point } : null;
}

export function findSnap(input: FindSnapInput): PlanResult<SnapResult> {
  const valid = validateFindSnapInput(input);
  if (!valid.ok) return valid;

  const candidates = [...input.candidates];
  if (input.modes.has("grid")) {
    const gridCandidate = synthesizedGridCandidate(input.worldPoint, input.gridSize);
    if (gridCandidate === null) return invalidSnap("Synthesized grid point must be finite.");
    candidates.push(gridCandidate);
  }

  for (const mode of POINT_PRIORITY) {
    if (!input.modes.has(mode)) continue;
    let best: PointSnapCandidate | null = null;
    let bestDistancePixels = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      if (candidate.mode !== mode) continue;
      const distancePixels = Math.hypot(
        candidate.point.x - input.worldPoint.x,
        candidate.point.y - input.worldPoint.y,
      ) * input.pixelsPerMillimetre;
      if (distancePixels <= input.tolerancePixels && distancePixels < bestDistancePixels) {
        best = candidate;
        bestDistancePixels = distancePixels;
      }
    }
    if (best !== null) {
      return planSuccess({
        candidate: best,
        delta: {
          x: best.point.x - input.worldPoint.x,
          y: best.point.y - input.worldPoint.y,
        },
      });
    }
  }

  return planSuccess({ candidate: null, delta: { x: 0, y: 0 } });
}

export function alignmentGuides(
  input: AlignmentGuidesInput,
): PlanResult<readonly PointSnapCandidate[]> {
  if (!isFinitePoint(input.worldPoint) || !input.referencePoints.every(isFinitePoint)) {
    return invalidSnap("Alignment points must be finite.");
  }

  const seenX = new Set<number>();
  const seenY = new Set<number>();
  const candidates: PointSnapCandidate[] = [];
  for (const reference of input.referencePoints) {
    if (!seenX.has(reference.x)) {
      seenX.add(reference.x);
      candidates.push({
        mode: "alignment",
        point: { x: reference.x, y: input.worldPoint.y },
        guide: {
          start: reference,
          end: { x: reference.x, y: input.worldPoint.y },
        },
      });
    }
    if (!seenY.has(reference.y)) {
      seenY.add(reference.y);
      candidates.push({
        mode: "alignment",
        point: { x: input.worldPoint.x, y: reference.y },
        guide: {
          start: reference,
          end: { x: input.worldPoint.x, y: reference.y },
        },
      });
    }
  }
  return planSuccess(candidates);
}

function normalizeAngle(angle: number): number {
  let normalized = angle % TAU;
  if (normalized >= Math.PI) normalized -= TAU;
  if (normalized < -Math.PI) normalized += TAU;
  return Object.is(normalized, -0) ? 0 : normalized;
}

export function findAngleSnap(
  angleRadians: number,
  incrementRadians: number,
  toleranceRadians: number,
): PlanResult<number> {
  if (
    !Number.isFinite(angleRadians)
    || !Number.isFinite(incrementRadians)
    || incrementRadians <= 0
    || !Number.isFinite(toleranceRadians)
    || toleranceRadians < 0
  ) {
    return invalidSnap("Angle, positive increment, and nonnegative tolerance must be finite.");
  }

  const normalizedInput = normalizeAngle(angleRadians);
  const snapped = Math.round(normalizedInput / incrementRadians) * incrementRadians;
  if (!Number.isFinite(snapped)) return invalidSnap("Snapped angle must be finite.");
  const normalizedSnapped = normalizeAngle(snapped);
  const circularDistance = Math.abs(normalizeAngle(normalizedSnapped - normalizedInput));
  return planSuccess(
    circularDistance <= toleranceRadians ? normalizedSnapped : normalizedInput,
  );
}
