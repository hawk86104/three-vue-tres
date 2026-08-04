import type { Point2, Transform2D } from "@aethertwin/core-model";
import { applyTransform } from "@aethertwin/plan-engine";
import { millimetresToScenePoint } from "./coordinates";
import type { SceneBounds3, SceneGeometry, SceneVector3 } from "./types";

export interface LocalBox3 {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
}

function subtract(left: SceneVector3, right: SceneVector3): SceneVector3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function cross(left: SceneVector3, right: SceneVector3): SceneVector3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function normalized(value: SceneVector3): SceneVector3 | null {
  const length = Math.hypot(value.x, value.y, value.z);
  return Number.isFinite(length) && length > 0
    ? { x: value.x / length, y: value.y / length, z: value.z / length }
    : null;
}

function appendFace(
  geometry: { positions: number[]; indices: number[]; normals: number[]; uvs: number[] },
  points: readonly [SceneVector3, SceneVector3, SceneVector3, SceneVector3],
  uvs: readonly [number, number, number, number, number, number, number, number],
): boolean {
  const normal = normalized(cross(subtract(points[1], points[0]), subtract(points[2], points[0])));
  if (normal === null) return false;
  const offset = geometry.positions.length / 3;
  for (const point of points) {
    geometry.positions.push(point.x, point.y, point.z);
    geometry.normals.push(normal.x, normal.y, normal.z);
  }
  geometry.uvs.push(...uvs);
  geometry.indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  return true;
}

export function transformedBoxGeometry(
  box: LocalBox3,
  transform: Transform2D,
  elevation: number,
  uvBounds: LocalBox3 = box,
): SceneGeometry | null {
  if (
    Object.values(box).some((value) => !Number.isFinite(value))
    || Object.values(uvBounds).some((value) => !Number.isFinite(value))
    || !Number.isFinite(elevation)
    || box.maxX <= box.minX
    || box.maxY <= box.minY
    || box.maxZ <= box.minZ
    || uvBounds.maxX <= uvBounds.minX
    || uvBounds.maxY <= uvBounds.minY
    || uvBounds.maxZ <= uvBounds.minZ
  ) return null;

  const localPoints: readonly Point2[] = [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY },
  ];
  let bottom: readonly SceneVector3[];
  let top: readonly SceneVector3[];
  try {
    const world = localPoints.map((point) => applyTransform(point, transform));
    bottom = world.map((point) => millimetresToScenePoint(point, elevation + box.minZ));
    top = world.map((point) => millimetresToScenePoint(point, elevation + box.maxZ));
  } catch {
    return null;
  }
  const [bottom00, bottom10, bottom11, bottom01] = bottom;
  const [top00, top10, top11, top01] = top;
  if (
    bottom00 === undefined || bottom10 === undefined || bottom11 === undefined || bottom01 === undefined
    || top00 === undefined || top10 === undefined || top11 === undefined || top01 === undefined
  ) return null;

  const x0 = (box.minX - uvBounds.minX) / (uvBounds.maxX - uvBounds.minX);
  const x1 = (box.maxX - uvBounds.minX) / (uvBounds.maxX - uvBounds.minX);
  const y0 = (box.minY - uvBounds.minY) / (uvBounds.maxY - uvBounds.minY);
  const y1 = (box.maxY - uvBounds.minY) / (uvBounds.maxY - uvBounds.minY);
  const z0 = (box.minZ - uvBounds.minZ) / (uvBounds.maxZ - uvBounds.minZ);
  const z1 = (box.maxZ - uvBounds.minZ) / (uvBounds.maxZ - uvBounds.minZ);
  const geometry = { positions: [] as number[], indices: [] as number[], normals: [] as number[], uvs: [] as number[] };
  const valid = [
    appendFace(geometry, [bottom00, bottom01, bottom11, bottom10], [x0, y0, x0, y1, x1, y1, x1, y0]),
    appendFace(geometry, [top00, top10, top11, top01], [x0, y0, x1, y0, x1, y1, x0, y1]),
    appendFace(geometry, [bottom00, top00, top01, bottom01], [y0, z0, y0, z1, y1, z1, y1, z0]),
    appendFace(geometry, [bottom10, bottom11, top11, top10], [y0, z0, y1, z0, y1, z1, y0, z1]),
    appendFace(geometry, [bottom00, bottom10, top10, top00], [x0, z0, x1, z0, x1, z1, x0, z1]),
    appendFace(geometry, [bottom01, top01, top11, bottom11], [x0, z0, x0, z1, x1, z1, x1, z0]),
  ].every(Boolean);
  return valid ? { topology: "triangles", ...geometry } : null;
}

export function geometryBounds(geometry: SceneGeometry): SceneBounds3 {
  const min = { x: geometry.positions[0]!, y: geometry.positions[1]!, z: geometry.positions[2]! };
  const max = { ...min };
  for (let index = 3; index < geometry.positions.length; index += 3) {
    const x = geometry.positions[index]!;
    const y = geometry.positions[index + 1]!;
    const z = geometry.positions[index + 2]!;
    min.x = Math.min(min.x, x);
    min.y = Math.min(min.y, y);
    min.z = Math.min(min.z, z);
    max.x = Math.max(max.x, x);
    max.y = Math.max(max.y, y);
    max.z = Math.max(max.z, z);
  }
  return { min, max };
}
