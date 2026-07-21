import type { Point2 } from "@aethertwin/core-model";

export interface ViewportTransform {
  readonly width: number;
  readonly height: number;
  readonly center: Point2;
  readonly pixelsPerMillimetre: number;
}

function assertValidViewport(viewport: ViewportTransform): void {
  if (
    !Number.isFinite(viewport.width)
    || !Number.isFinite(viewport.height)
    || !Number.isFinite(viewport.center.x)
    || !Number.isFinite(viewport.center.y)
    || !Number.isFinite(viewport.pixelsPerMillimetre)
    || viewport.pixelsPerMillimetre <= 0
  ) {
    throw new RangeError("Viewport values must be finite and pixelsPerMillimetre must be positive.");
  }
}

export function worldToScreen(point: Point2, viewport: ViewportTransform): Point2 {
  assertValidViewport(viewport);
  return {
    x: viewport.width / 2 + (point.x - viewport.center.x) * viewport.pixelsPerMillimetre,
    y: viewport.height / 2 - (point.y - viewport.center.y) * viewport.pixelsPerMillimetre,
  };
}

export function screenToWorld(point: Point2, viewport: ViewportTransform): Point2 {
  assertValidViewport(viewport);
  return {
    x: viewport.center.x + (point.x - viewport.width / 2) / viewport.pixelsPerMillimetre,
    y: viewport.center.y - (point.y - viewport.height / 2) / viewport.pixelsPerMillimetre,
  };
}
