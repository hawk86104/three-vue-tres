import type {
  SceneBounds3,
  SceneCameraState,
  SceneFrameTarget,
  SceneProjection,
  SceneVector3,
} from "./types";

function unionBounds(
  records: SceneProjection["records"],
): SceneBounds3 | null {
  if (records.length === 0) return null;
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const { bounds } of records) {
    min.x = Math.min(min.x, bounds.min.x);
    min.y = Math.min(min.y, bounds.min.y);
    min.z = Math.min(min.z, bounds.min.z);
    max.x = Math.max(max.x, bounds.max.x);
    max.y = Math.max(max.y, bounds.max.y);
    max.z = Math.max(max.z, bounds.max.z);
  }
  return { min, max };
}

function targetBounds(
  projection: SceneProjection,
  target: SceneFrameTarget,
): SceneBounds3 | null {
  if (target === "scene") return projection.bounds;
  if (target === "selection") {
    return unionBounds(projection.records.filter(({ selected }) => selected));
  }
  return unionBounds(projection.records.filter(({ kind }) => kind === "route"));
}

function normalizedDirection(camera: SceneCameraState): SceneVector3 {
  const x = camera.position.x - camera.target.x;
  const y = camera.position.y - camera.target.y;
  const z = camera.position.z - camera.target.z;
  const length = Math.hypot(x, y, z);
  if (length > 1e-9) {
    return { x: x / length, y: y / length, z: z / length };
  }
  const fallback = 1 / Math.sqrt(3);
  return { x: fallback, y: fallback, z: fallback };
}

function normalizedCross(
  left: SceneVector3,
  right: SceneVector3,
): SceneVector3 {
  const x = left.y * right.z - left.z * right.y;
  const y = left.z * right.x - left.x * right.z;
  const z = left.x * right.y - left.y * right.x;
  const length = Math.hypot(x, y, z);
  return { x: x / length, y: y / length, z: z / length };
}

function cameraAxes(backward: SceneVector3): {
  readonly right: SceneVector3;
  readonly up: SceneVector3;
} {
  const referenceUp = Math.abs(backward.y) > 0.99
    ? { x: 0, y: 0, z: 1 }
    : { x: 0, y: 1, z: 0 };
  const right = normalizedCross(referenceUp, backward);
  return { right, up: normalizedCross(backward, right) };
}

function dot(left: SceneVector3, right: SceneVector3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function boundsCorners(bounds: SceneBounds3): SceneVector3[] {
  const corners: SceneVector3[] = [];
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        corners.push({ x, y, z });
      }
    }
  }
  return corners;
}

export function frameCameraToProjection(
  projection: SceneProjection,
  camera: SceneCameraState,
  target: SceneFrameTarget,
  aspectRatio = 1,
): SceneCameraState | null {
  const bounds = targetBounds(projection, target);
  if (bounds === null) return null;
  const center = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  };
  const halfFov = Math.max(1, Math.min(179, camera.fieldOfView)) * Math.PI / 360;
  const direction = normalizedDirection(camera);
  const axes = cameraAxes(direction);
  const verticalTangent = Math.tan(halfFov);
  const horizontalTangent = verticalTangent * Math.max(1e-6, aspectRatio);
  let distance = 0.1;
  for (const corner of boundsCorners(bounds)) {
    const offset = {
      x: corner.x - center.x,
      y: corner.y - center.y,
      z: corner.z - center.z,
    };
    const towardCamera = dot(offset, direction);
    const horizontal = Math.abs(dot(offset, axes.right));
    const vertical = Math.abs(dot(offset, axes.up));
    distance = Math.max(
      distance,
      towardCamera + Math.max(
        horizontal / horizontalTangent,
        vertical / verticalTangent,
      ) * 1.15 + 0.01,
    );
  }
  return Object.freeze({
    position: Object.freeze({
      x: center.x + direction.x * distance,
      y: center.y + direction.y * distance,
      z: center.z + direction.z * distance,
    }),
    target: Object.freeze(center),
    fieldOfView: camera.fieldOfView,
  });
}
