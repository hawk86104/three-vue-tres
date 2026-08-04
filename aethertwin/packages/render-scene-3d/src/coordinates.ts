import type { Point2 } from "@aethertwin/core-model";
import type { SceneVector3 } from "./types";

const MILLIMETRES_PER_METRE = 1_000;

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

export function millimetresToScenePoint(point: Point2, elevation: number): SceneVector3 {
  return {
    x: normalizeZero(point.x / MILLIMETRES_PER_METRE),
    y: normalizeZero(elevation / MILLIMETRES_PER_METRE),
    z: normalizeZero(-point.y / MILLIMETRES_PER_METRE),
  };
}
