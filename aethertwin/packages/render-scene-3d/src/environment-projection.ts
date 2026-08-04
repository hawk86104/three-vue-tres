import type { SceneEnvironment } from "@aethertwin/core-model";
import type {
  SceneBounds3,
  SceneEnvironmentProjection,
  SceneVector3,
} from "./types";

function finite(values: readonly number[]): boolean {
  return values.every(Number.isFinite);
}

function normalizedKeyPosition(direction: readonly [number, number, number]): SceneVector3 | null {
  if (
    !finite(direction)
    || direction.some((component) => component < -100 || component > 100)
  ) return null;
  const length = Math.hypot(...direction);
  if (!Number.isFinite(length) || length === 0) return null;
  const coordinate = (value: number): number => {
    const result = value / length * 10;
    return Object.is(result, -0) ? 0 : result;
  };
  return {
    x: coordinate(direction[0]),
    y: coordinate(direction[1]),
    z: coordinate(direction[2]),
  };
}

function paddedBounds(bounds: SceneBounds3): SceneBounds3 {
  const padding = {
    x: (bounds.max.x - bounds.min.x) * 0.1,
    y: (bounds.max.y - bounds.min.y) * 0.1,
    z: (bounds.max.z - bounds.min.z) * 0.1,
  };
  return {
    min: {
      x: bounds.min.x - padding.x,
      y: bounds.min.y - padding.y,
      z: bounds.min.z - padding.z,
    },
    max: {
      x: bounds.max.x + padding.x,
      y: bounds.max.y + padding.y,
      z: bounds.max.z + padding.z,
    },
  };
}

export function projectEnvironment(
  environment: SceneEnvironment,
  bounds: SceneBounds3 | null,
): SceneEnvironmentProjection | null {
  const position = normalizedKeyPosition(environment.key.direction);
  if (
    position === null
    || !finite([
      environment.ambient.intensity,
      environment.key.intensity,
      environment.shadowSoftness,
    ])
    || environment.ambient.intensity < 0
    || environment.ambient.intensity > 4
    || environment.key.intensity < 0
    || environment.key.intensity > 8
    || environment.shadowSoftness < 0
    || environment.shadowSoftness > 1
  ) return null;
  return {
    backgroundColor: environment.backgroundColor,
    ambient: { ...environment.ambient },
    key: {
      color: environment.key.color,
      intensity: environment.key.intensity,
      position,
    },
    shadows: {
      enabled: environment.shadowsEnabled,
      radius: 1 + 7 * environment.shadowSoftness,
      cameraBounds: environment.shadowsEnabled && bounds !== null
        ? paddedBounds(bounds)
        : null,
    },
  };
}
