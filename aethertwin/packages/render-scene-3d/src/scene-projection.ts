import type {
  Point2,
  SpaceUnit,
  Zone,
} from "@aethertwin/core-model";
import { applyTransform } from "@aethertwin/plan-engine";
import type {
  SceneBounds3,
  SceneGeometry,
  SceneMaterialProjection,
  SceneProjection,
  SceneProjectionIssueCode,
  SceneRecord,
  SceneRendererInput,
  SceneVector3,
} from "./types";

const MILLIMETRES_PER_METRE = 1_000;

interface FloorProjectionFailure {
  readonly code: SceneProjectionIssueCode;
  readonly sourceId: string;
}

type FloorEntity = SpaceUnit | Zone;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

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

function cross(a: Point2, b: Point2, c: Point2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: Point2, b: Point2, point: Point2): boolean {
  return Math.min(a.x, b.x) <= point.x
    && point.x <= Math.max(a.x, b.x)
    && Math.min(a.y, b.y) <= point.y
    && point.y <= Math.max(a.y, b.y);
}

function segmentsIntersect(a: Point2, b: Point2, c: Point2, d: Point2): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (abC === 0 && onSegment(a, b, c)) return true;
  if (abD === 0 && onSegment(a, b, d)) return true;
  if (cdA === 0 && onSegment(c, d, a)) return true;
  if (cdB === 0 && onSegment(c, d, b)) return true;
  return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0);
}

function signedTwiceArea(points: readonly Point2[]): number {
  let result = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    result += current.x * next.y - next.x * current.y;
  }
  return result;
}

function isSimplePolygon(points: readonly Point2[]): boolean {
  if (points.length < 3 || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return false;
  }
  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      if (second === first + 1 || (first === 0 && second === points.length - 1)) continue;
      if (segmentsIntersect(
        points[first]!,
        points[(first + 1) % points.length]!,
        points[second]!,
        points[(second + 1) % points.length]!,
      )) return false;
    }
  }
  return signedTwiceArea(points) !== 0;
}

function pointInTriangle(point: Point2, a: Point2, b: Point2, c: Point2): boolean {
  return cross(a, b, point) >= 0
    && cross(b, c, point) >= 0
    && cross(c, a, point) >= 0;
}

function triangulate(points: readonly Point2[]): readonly number[] | null {
  if (!isSimplePolygon(points)) return null;

  const vertices = Array.from({ length: points.length }, (_, index) => index);
  if (signedTwiceArea(points) < 0) vertices.reverse();
  const indices: number[] = [];

  while (vertices.length > 3) {
    let earIndex = -1;
    for (let candidate = 0; candidate < vertices.length; candidate += 1) {
      const previousIndex = vertices[(candidate - 1 + vertices.length) % vertices.length]!;
      const currentIndex = vertices[candidate]!;
      const nextIndex = vertices[(candidate + 1) % vertices.length]!;
      const previous = points[previousIndex]!;
      const current = points[currentIndex]!;
      const next = points[nextIndex]!;
      if (cross(previous, current, next) <= 0) continue;

      const containsVertex = vertices.some((vertexIndex) => (
        vertexIndex !== previousIndex
        && vertexIndex !== currentIndex
        && vertexIndex !== nextIndex
        && pointInTriangle(points[vertexIndex]!, previous, current, next)
      ));
      if (!containsVertex) {
        earIndex = candidate;
        indices.push(previousIndex, currentIndex, nextIndex);
        break;
      }
    }

    if (earIndex >= 0) {
      vertices.splice(earIndex, 1);
      continue;
    }

    const collinearIndex = vertices.findIndex((currentIndex, candidate) => {
      const previousIndex = vertices[(candidate - 1 + vertices.length) % vertices.length]!;
      const nextIndex = vertices[(candidate + 1) % vertices.length]!;
      return cross(points[previousIndex]!, points[currentIndex]!, points[nextIndex]!) === 0;
    });
    if (collinearIndex < 0) return null;
    vertices.splice(collinearIndex, 1);
  }

  const [first, second, third] = vertices;
  if (
    first === undefined
    || second === undefined
    || third === undefined
    || cross(points[first]!, points[second]!, points[third]!) <= 0
  ) return null;
  indices.push(first, second, third);
  return indices;
}

function boundsFromPoints(points: readonly SceneVector3[]): SceneBounds3 {
  const first = points[0]!;
  const min = { ...first };
  const max = { ...first };
  for (const point of points.slice(1)) {
    min.x = Math.min(min.x, point.x);
    min.y = Math.min(min.y, point.y);
    min.z = Math.min(min.z, point.z);
    max.x = Math.max(max.x, point.x);
    max.y = Math.max(max.y, point.y);
    max.z = Math.max(max.z, point.z);
  }
  return { min, max };
}

function unionBounds(records: readonly SceneRecord[]): SceneBounds3 | null {
  if (records.length === 0) return null;
  const bounds = {
    min: { ...records[0]!.bounds.min },
    max: { ...records[0]!.bounds.max },
  };
  for (const record of records.slice(1)) {
    bounds.min.x = Math.min(bounds.min.x, record.bounds.min.x);
    bounds.min.y = Math.min(bounds.min.y, record.bounds.min.y);
    bounds.min.z = Math.min(bounds.min.z, record.bounds.min.z);
    bounds.max.x = Math.max(bounds.max.x, record.bounds.max.x);
    bounds.max.y = Math.max(bounds.max.y, record.bounds.max.y);
    bounds.max.z = Math.max(bounds.max.z, record.bounds.max.z);
  }
  return bounds;
}

function floorGeometry(
  localPoints: readonly Point2[],
  worldPoints: readonly Point2[],
  elevation: number,
  indices: readonly number[],
): SceneGeometry | null {
  const localXs = localPoints.map((point) => point.x);
  const localYs = localPoints.map((point) => point.y);
  const minX = Math.min(...localXs);
  const maxX = Math.max(...localXs);
  const minY = Math.min(...localYs);
  const maxY = Math.max(...localYs);
  const width = maxX - minX;
  const height = maxY - minY;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;

  const scenePoints = worldPoints.map((point) => millimetresToScenePoint(point, elevation));
  if (scenePoints.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z))) {
    return null;
  }
  return {
    topology: "triangles",
    positions: scenePoints.flatMap((point) => [point.x, point.y, point.z]),
    indices: [...indices],
    normals: scenePoints.flatMap(() => [0, 1, 0]),
    uvs: localPoints.flatMap((point) => [
      normalizeZero((point.x - minX) / width),
      normalizeZero((point.y - minY) / height),
    ]),
  };
}

function defaultFloorMaterial(selected: boolean): SceneMaterialProjection {
  return {
    role: "space-floor",
    definitionId: null,
    baseColor: "#445760",
    roughness: 0.9,
    metalness: 0,
    opacity: 1,
    textureAssetId: null,
    selectedOverlay: selected,
  };
}

function projectFloor(
  entity: FloorEntity,
  selectedIds: ReadonlySet<string>,
): SceneRecord | FloorProjectionFailure {
  const localPoints = entity.type === "zone" ? entity.polygon : entity.footprint;
  const indices = triangulate(localPoints);
  if (indices === null) {
    return { code: "SCENE_FLOOR_TRIANGULATION_FAILED", sourceId: entity.id };
  }

  const elevation = entity.spatial3D?.elevation ?? 0;
  if (!Number.isFinite(elevation)) return { code: "SCENE_INVALID_RECORD", sourceId: entity.id };

  let worldPoints: readonly Point2[];
  try {
    worldPoints = localPoints.map((point) => applyTransform(point, entity.transform));
  } catch {
    return { code: "SCENE_INVALID_RECORD", sourceId: entity.id };
  }
  const geometry = floorGeometry(localPoints, worldPoints, elevation, indices);
  if (geometry === null) return { code: "SCENE_INVALID_RECORD", sourceId: entity.id };

  const scenePoints = Array.from({ length: worldPoints.length }, (_, index) => ({
    x: geometry.positions[index * 3]!,
    y: geometry.positions[index * 3 + 1]!,
    z: geometry.positions[index * 3 + 2]!,
  }));
  const selected = selectedIds.has(entity.id);
  return {
    key: `floor:${entity.id}`,
    kind: "floor",
    sourceIds: [entity.id],
    selectionId: entity.id,
    selected,
    bounds: boundsFromPoints(scenePoints),
    geometry,
    material: defaultFloorMaterial(selected),
  };
}

function isFailure(value: SceneRecord | FloorProjectionFailure): value is FloorProjectionFailure {
  return "code" in value;
}

export function projectScene(input: SceneRendererInput): SceneProjection {
  const floor = input.snapshot.project.floors.find(({ id }) => id === input.activeFloorId);
  const visibleLayerIds = new Set(
    floor?.layers.filter(({ visible }) => visible).map(({ id }) => id) ?? [],
  );
  const selectedIds = new Set(input.selectedIds);
  const records: SceneRecord[] = [];
  const failures = new Map<SceneProjectionIssueCode, Set<string>>();

  for (const entity of input.snapshot.project.entities) {
    if (
      entity.floorId !== input.activeFloorId
      || !visibleLayerIds.has(entity.layerId)
      || (entity.type !== "space-unit" && entity.type !== "zone")
    ) continue;

    const projected = projectFloor(entity, selectedIds);
    if (isFailure(projected)) {
      const sourceIds = failures.get(projected.code) ?? new Set<string>();
      sourceIds.add(projected.sourceId);
      failures.set(projected.code, sourceIds);
    } else {
      records.push(projected);
    }
  }

  if (failures.size > 0) {
    return deepFreeze({
      records: [],
      bounds: null,
      requiredTextureAssetIds: [],
      issues: [...failures.entries()]
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([code, sourceIds]) => ({ code, sourceIds: [...sourceIds].sort() })),
    });
  }

  records.sort(({ key: left }, { key: right }) => left < right ? -1 : left > right ? 1 : 0);
  return deepFreeze({
    records,
    bounds: unionBounds(records),
    requiredTextureAssetIds: [],
    issues: [],
  });
}
