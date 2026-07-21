import type { Point2, Transform2D } from "@aethertwin/core-model";
import { planFailure, planSuccess, type PlanResult } from "./result";

const TAU = Math.PI * 2;
const ZERO_EPSILON = 1e-9;

function snapZero(value: number): number {
  return Math.abs(value) <= ZERO_EPSILON ? 0 : value;
}

function normalizeRotation(rotation: number): number {
  let normalized = rotation % TAU;
  if (normalized >= Math.PI) normalized -= TAU;
  if (normalized < -Math.PI) normalized += TAU;
  return snapZero(normalized);
}

function invalidTransform(message: string): PlanResult<Transform2D> {
  return planFailure("INVALID_TRANSFORM", message);
}

function hasFiniteValues(transform: Transform2D): boolean {
  return [
    transform.translation.x,
    transform.translation.y,
    transform.rotation,
    transform.scale.x,
    transform.scale.y,
  ].every(Number.isFinite);
}

function applyNormalizedTransform(point: Point2, transform: Transform2D): Point2 {
  const scaledX = point.x * transform.scale.x;
  const scaledY = point.y * transform.scale.y;
  const cosine = snapZero(Math.cos(transform.rotation));
  const sine = snapZero(Math.sin(transform.rotation));

  return {
    x: scaledX * cosine - scaledY * sine + transform.translation.x,
    y: scaledX * sine + scaledY * cosine + transform.translation.y,
  };
}

interface LinearMatrix {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
}

function toLinearMatrix(transform: Transform2D): LinearMatrix {
  const cosine = snapZero(Math.cos(transform.rotation));
  const sine = snapZero(Math.sin(transform.rotation));
  return {
    a: cosine * transform.scale.x,
    b: -sine * transform.scale.y,
    c: sine * transform.scale.x,
    d: cosine * transform.scale.y,
  };
}

function multiplyMatrices(left: LinearMatrix, right: LinearMatrix): LinearMatrix {
  return {
    a: left.a * right.a + left.b * right.c,
    b: left.a * right.b + left.b * right.d,
    c: left.c * right.a + left.d * right.c,
    d: left.c * right.b + left.d * right.d,
  };
}

function decomposeMatrix(matrix: LinearMatrix, translation: Point2): PlanResult<Transform2D> {
  const scaleX = Math.hypot(matrix.a, matrix.c);
  const scaleY = Math.hypot(matrix.b, matrix.d);
  const dotProduct = matrix.a * matrix.b + matrix.c * matrix.d;
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;

  if (
    !Number.isFinite(scaleX)
    || !Number.isFinite(scaleY)
    || !Number.isFinite(dotProduct)
    || !Number.isFinite(determinant)
    || scaleX <= 0
    || scaleY <= 0
  ) {
    return planFailure("NON_REPRESENTABLE_TRANSFORM", "Transform composition is not finite.");
  }

  if (
    determinant <= 0
    || Math.abs(dotProduct) > ZERO_EPSILON * scaleX * scaleY
  ) {
    return planFailure(
      "NON_REPRESENTABLE_TRANSFORM",
      "Transform composition introduces shear or reflection.",
    );
  }

  return normalizeTransform({
    translation,
    rotation: Math.atan2(matrix.c, matrix.a),
    scale: { x: scaleX, y: scaleY },
  });
}

export function normalizeTransform(transform: Transform2D): PlanResult<Transform2D> {
  if (!hasFiniteValues(transform)) return invalidTransform("Transform values must be finite.");

  const scaleX = snapZero(transform.scale.x);
  const scaleY = snapZero(transform.scale.y);
  if (scaleX <= 0 || scaleY <= 0) {
    return invalidTransform("Transform scale must be positive.");
  }

  return planSuccess({
    translation: {
      x: snapZero(transform.translation.x),
      y: snapZero(transform.translation.y),
    },
    rotation: normalizeRotation(transform.rotation),
    scale: { x: scaleX, y: scaleY },
  });
}

export function applyTransform(point: Point2, transform: Transform2D): Point2 {
  const normalized = normalizeTransform(transform);
  if (!normalized.ok) throw new RangeError(normalized.issue.message);
  return applyNormalizedTransform(point, normalized.value);
}

export function invertTransform(point: Point2, transform: Transform2D): PlanResult<Point2> {
  const normalized = normalizeTransform(transform);
  if (!normalized.ok) return normalized;

  const translatedX = point.x - normalized.value.translation.x;
  const translatedY = point.y - normalized.value.translation.y;
  const cosine = snapZero(Math.cos(normalized.value.rotation));
  const sine = snapZero(Math.sin(normalized.value.rotation));

  return planSuccess({
    x: (translatedX * cosine + translatedY * sine) / normalized.value.scale.x,
    y: (-translatedX * sine + translatedY * cosine) / normalized.value.scale.y,
  });
}

export function composeTransform(
  first: Transform2D,
  second: Transform2D,
): PlanResult<Transform2D> {
  const normalizedFirst = normalizeTransform(first);
  if (!normalizedFirst.ok) return normalizedFirst;

  const normalizedSecond = normalizeTransform(second);
  if (!normalizedSecond.ok) return normalizedSecond;

  return decomposeMatrix(
    multiplyMatrices(
      toLinearMatrix(normalizedSecond.value),
      toLinearMatrix(normalizedFirst.value),
    ),
    applyNormalizedTransform(normalizedFirst.value.translation, normalizedSecond.value),
  );
}
