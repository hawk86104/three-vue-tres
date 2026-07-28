import type { Bounds2, PlanReference, Point2 } from "@aethertwin/core-model";
import {
  clonePlanReference,
  planReferenceWorldBounds,
} from "./plan-references";
import { planFailure, planSuccess, type PlanResult } from "./result";

export interface CalibrationInput {
  readonly sourcePointA: Point2;
  readonly sourcePointB: Point2;
  readonly measuredDistanceMm: number;
}

export interface CalibrationPreview {
  readonly millimetresPerPixel: number;
  readonly bounds: Bounds2;
  readonly after: PlanReference;
}

function finitePoint(point: Point2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function pointInIntrinsicBounds(reference: PlanReference, point: Point2): boolean {
  return point.x >= 0
    && point.x <= reference.intrinsicSize.width
    && point.y >= 0
    && point.y <= reference.intrinsicSize.height;
}

function invalidCalibration(reference: PlanReference, message: string): PlanResult<never> {
  return planFailure("INVALID_CALIBRATION", message, reference.id);
}

export function previewCalibration(
  reference: PlanReference,
  input: CalibrationInput,
): PlanResult<CalibrationPreview> {
  if (reference.locked) {
    return planFailure(
      "PLAN_REFERENCE_LOCKED",
      "Locked plan references cannot be calibrated.",
      reference.id,
    );
  }

  const beforeBounds = planReferenceWorldBounds(reference);
  if (!beforeBounds.ok) return beforeBounds;
  if (
    !finitePoint(input.sourcePointA)
    || !finitePoint(input.sourcePointB)
    || !Number.isFinite(input.measuredDistanceMm)
    || input.measuredDistanceMm <= 0
  ) {
    return invalidCalibration(reference, "Calibration points and measured distance must be finite and positive.");
  }
  if (
    !pointInIntrinsicBounds(reference, input.sourcePointA)
    || !pointInIntrinsicBounds(reference, input.sourcePointB)
  ) {
    return invalidCalibration(reference, "Calibration points must lie inside the intrinsic image rectangle.");
  }

  const pixelDistance = Math.hypot(
    input.sourcePointB.x - input.sourcePointA.x,
    input.sourcePointB.y - input.sourcePointA.y,
  );
  if (!Number.isFinite(pixelDistance) || pixelDistance <= 0) {
    return invalidCalibration(reference, "Calibration points must be distinct and produce a finite distance.");
  }
  const millimetresPerPixel = input.measuredDistanceMm / pixelDistance;
  if (!Number.isFinite(millimetresPerPixel) || millimetresPerPixel <= 0) {
    return invalidCalibration(reference, "Calibration must produce a finite positive scale.");
  }

  const evidence = {
    sourcePointA: { ...input.sourcePointA },
    sourcePointB: { ...input.sourcePointB },
    measuredDistanceMm: input.measuredDistanceMm,
  };
  const after = clonePlanReference(reference, {
    translation: { ...reference.transform.translation },
    rotation: reference.transform.rotation,
    scale: { x: millimetresPerPixel, y: millimetresPerPixel },
  }, evidence);
  const bounds = planReferenceWorldBounds(after);
  if (!bounds.ok) return bounds;

  return planSuccess({
    millimetresPerPixel,
    bounds: { min: { ...bounds.value.min }, max: { ...bounds.value.max } },
    after,
  });
}
