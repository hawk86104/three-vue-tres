import {
  GEOMETRY_EPSILON_MM,
  locateOpening,
  validateOpeningGeometry,
  wallMetricSegments,
  type Opening,
  type OpeningProjection,
  type Point2,
  type Wall,
  type WallMetricSegment,
} from "@aethertwin/core-model";
import { millimetresToScenePoint } from "./coordinates";
import type {
  SceneBounds3,
  SceneGeometry,
  SceneMaterialProjection,
  SceneProjectionIssueCode,
  SceneRecord,
  SceneVector3,
} from "./types";

const DEFAULT_WALL_HEIGHT_MM = 3_000;
const OUTLINE_OPACITY = 0.24;

export interface WallProjectionFailure {
  readonly code: Extract<SceneProjectionIssueCode, "SCENE_WALL_PROJECTION_FAILED">;
  readonly sourceIds: readonly string[];
}

interface LocatedOpening {
  readonly opening: Opening;
  readonly projection: OpeningProjection;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedIds(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort(compareText);
}

function wallFailure(sourceIds: readonly string[]): WallProjectionFailure {
  return {
    code: "SCENE_WALL_PROJECTION_FAILED",
    sourceIds: sortedIds(sourceIds),
  };
}

function defaultWallMaterial(selected: boolean, opacity = 1): SceneMaterialProjection {
  return {
    role: "wall",
    definitionId: null,
    baseColor: "#c8d2d8",
    roughness: 0.82,
    metalness: 0,
    opacity,
    textureAssetId: null,
    selectedOverlay: selected,
  };
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

function dot(left: SceneVector3, right: SceneVector3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function appendQuad(
  geometry: {
    positions: number[];
    indices: number[];
    normals: number[];
    uvs: number[];
  },
  corners: readonly [SceneVector3, SceneVector3, SceneVector3, SceneVector3],
  desiredNormal: SceneVector3,
): void {
  const faceNormal = cross(subtract(corners[1], corners[0]), subtract(corners[2], corners[0]));
  const ordered = dot(faceNormal, desiredNormal) >= 0
    ? corners
    : [corners[0], corners[3], corners[2], corners[1]] as const;
  const offset = geometry.positions.length / 3;
  for (const point of ordered) {
    geometry.positions.push(point.x, point.y, point.z);
    geometry.normals.push(desiredNormal.x, desiredNormal.y, desiredNormal.z);
  }
  geometry.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
  geometry.indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
}

function wallPoint(
  segment: WallMetricSegment,
  distance: number,
  normalOffset: number,
): Point2 {
  return {
    x: segment.start.x
      + segment.tangent.x * distance
      - segment.tangent.y * normalOffset,
    y: segment.start.y
      + segment.tangent.y * distance
      + segment.tangent.x * normalOffset,
  };
}

function prismGeometry(
  segment: WallMetricSegment,
  intervalStart: number,
  intervalEnd: number,
  elevation: number,
  baseHeight: number,
  topHeight: number,
): SceneGeometry | null {
  if (
    !Number.isFinite(intervalStart)
    || !Number.isFinite(intervalEnd)
    || !Number.isFinite(elevation)
    || !Number.isFinite(baseHeight)
    || !Number.isFinite(topHeight)
    || intervalEnd - intervalStart <= GEOMETRY_EPSILON_MM
    || topHeight - baseHeight <= GEOMETRY_EPSILON_MM
  ) return null;

  const halfThickness = segment.effectiveThickness / 2;
  const startLeft = wallPoint(segment, intervalStart, halfThickness);
  const startRight = wallPoint(segment, intervalStart, -halfThickness);
  const endRight = wallPoint(segment, intervalEnd, -halfThickness);
  const endLeft = wallPoint(segment, intervalEnd, halfThickness);
  const bottomElevation = elevation + baseHeight;
  const topElevation = elevation + topHeight;
  const startLeftBottom = millimetresToScenePoint(startLeft, bottomElevation);
  const startRightBottom = millimetresToScenePoint(startRight, bottomElevation);
  const endRightBottom = millimetresToScenePoint(endRight, bottomElevation);
  const endLeftBottom = millimetresToScenePoint(endLeft, bottomElevation);
  const startLeftTop = millimetresToScenePoint(startLeft, topElevation);
  const startRightTop = millimetresToScenePoint(startRight, topElevation);
  const endRightTop = millimetresToScenePoint(endRight, topElevation);
  const endLeftTop = millimetresToScenePoint(endLeft, topElevation);
  const tangent = { x: segment.tangent.x, y: 0, z: -segment.tangent.y };
  const normal = { x: -segment.tangent.y, y: 0, z: -segment.tangent.x };
  const geometry = { positions: [] as number[], indices: [] as number[], normals: [] as number[], uvs: [] as number[] };

  appendQuad(geometry, [startLeftBottom, startRightBottom, endRightBottom, endLeftBottom], { x: 0, y: -1, z: 0 });
  appendQuad(geometry, [startLeftTop, startRightTop, endRightTop, endLeftTop], { x: 0, y: 1, z: 0 });
  appendQuad(geometry, [startLeftBottom, startRightBottom, startRightTop, startLeftTop], {
    x: -tangent.x, y: 0, z: -tangent.z,
  });
  appendQuad(geometry, [endLeftBottom, endRightBottom, endRightTop, endLeftTop], tangent);
  appendQuad(geometry, [startLeftBottom, endLeftBottom, endLeftTop, startLeftTop], normal);
  appendQuad(geometry, [startRightBottom, endRightBottom, endRightTop, startRightTop], {
    x: -normal.x, y: 0, z: -normal.z,
  });
  return { topology: "triangles", ...geometry };
}

function geometryBounds(geometry: SceneGeometry): SceneBounds3 {
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

function prismRecord(
  key: string,
  wall: Wall,
  segment: WallMetricSegment,
  intervalStart: number,
  intervalEnd: number,
  elevation: number,
  baseHeight: number,
  topHeight: number,
  selected: boolean,
  sourceIds: readonly string[],
): SceneRecord | null {
  const geometry = prismGeometry(
    segment,
    intervalStart,
    intervalEnd,
    elevation,
    baseHeight,
    topHeight,
  );
  if (geometry === null) return null;
  return {
    key,
    kind: "wall-piece",
    sourceIds: sortedIds(sourceIds),
    selectionId: wall.id,
    selected,
    bounds: geometryBounds(geometry),
    geometry,
    material: defaultWallMaterial(selected),
  };
}

function openingGeometry(
  segment: WallMetricSegment,
  projection: OpeningProjection,
  opening: Opening,
  elevation: number,
): SceneGeometry {
  const intervalStart = projection.distanceAlongSegment - opening.width / 2;
  const intervalEnd = projection.distanceAlongSegment + opening.width / 2;
  const halfThickness = segment.effectiveThickness / 2;
  const startLeft = wallPoint(segment, intervalStart, halfThickness);
  const startRight = wallPoint(segment, intervalStart, -halfThickness);
  const endRight = wallPoint(segment, intervalEnd, -halfThickness);
  const endLeft = wallPoint(segment, intervalEnd, halfThickness);
  const baseHeight = opening.kind === "door" ? 0 : opening.sillHeight;
  const topHeight = baseHeight + opening.height;
  const points = [
    millimetresToScenePoint(startLeft, elevation + baseHeight),
    millimetresToScenePoint(startRight, elevation + baseHeight),
    millimetresToScenePoint(endRight, elevation + baseHeight),
    millimetresToScenePoint(endLeft, elevation + baseHeight),
    millimetresToScenePoint(startLeft, elevation + topHeight),
    millimetresToScenePoint(startRight, elevation + topHeight),
    millimetresToScenePoint(endRight, elevation + topHeight),
    millimetresToScenePoint(endLeft, elevation + topHeight),
  ];
  return {
    topology: "lines",
    positions: points.flatMap((point) => [point.x, point.y, point.z]),
    indices: [
      0, 1, 1, 2, 2, 3, 3, 0,
      4, 5, 5, 6, 6, 7, 7, 4,
      0, 4, 1, 5, 2, 6, 3, 7,
    ],
    normals: points.flatMap(() => [0, 0, 0]),
    uvs: points.flatMap(() => [0, 0]),
  };
}

function openingRecord(
  wall: Wall,
  segment: WallMetricSegment,
  located: LocatedOpening,
  elevation: number,
  selectedIds: ReadonlySet<string>,
): SceneRecord {
  const geometry = openingGeometry(
    segment,
    located.projection,
    located.opening,
    elevation,
  );
  const selected = selectedIds.has(located.opening.id);
  return {
    key: `opening:${located.opening.id}`,
    kind: "opening",
    sourceIds: sortedIds([wall.id, located.opening.id]),
    selectionId: located.opening.id,
    selected,
    bounds: geometryBounds(geometry),
    geometry,
    material: defaultWallMaterial(selected, OUTLINE_OPACITY),
  };
}

function openingFieldsAreValid(opening: Opening): boolean {
  return Number.isFinite(opening.distanceAlongWall)
    && Number.isFinite(opening.width)
    && opening.width > 0
    && Number.isFinite(opening.height)
    && opening.height > 0
    && Number.isFinite(opening.sillHeight)
    && opening.sillHeight >= 0;
}

function locatedOpenings(
  wall: Wall,
  openings: readonly Opening[],
): readonly LocatedOpening[] | WallProjectionFailure {
  const invalid = openings.filter((opening) => !openingFieldsAreValid(opening));
  if (invalid.length > 0) return wallFailure([wall.id, ...invalid.map(({ id }) => id)]);

  const geometryIssues = validateOpeningGeometry([wall], openings);
  if (geometryIssues.length > 0) {
    return wallFailure([
      wall.id,
      ...geometryIssues.flatMap((issue) => [
        issue.openingId,
        ...(issue.relatedOpeningId === undefined ? [] : [issue.relatedOpeningId]),
      ]),
    ]);
  }

  const located: LocatedOpening[] = [];
  for (const opening of openings) {
    const projection = locateOpening(wall, opening);
    if (projection === undefined) return wallFailure([wall.id, opening.id]);
    located.push({ opening, projection });
  }
  located.sort((left, right) => (
    left.opening.distanceAlongWall - right.opening.distanceAlongWall
    || compareText(left.opening.id, right.opening.id)
  ));
  return located;
}

function isWallFailure(
  value: readonly LocatedOpening[] | WallProjectionFailure,
): value is WallProjectionFailure {
  return "code" in value;
}

export function projectWallRecords(
  wall: Wall,
  openings: readonly Opening[],
  selectedIds: ReadonlySet<string>,
): readonly SceneRecord[] | WallProjectionFailure {
  const segments = wallMetricSegments(wall);
  const elevation = wall.spatial3D?.elevation ?? 0;
  const height = wall.spatial3D?.height ?? DEFAULT_WALL_HEIGHT_MM;
  if (
    segments.length === 0
    || !Number.isFinite(elevation)
    || !Number.isFinite(height)
    || height <= 0
  ) return wallFailure([wall.id, ...openings.map(({ id }) => id)]);

  const located = locatedOpenings(wall, openings);
  if (isWallFailure(located)) return located;

  const records: SceneRecord[] = [];
  const selected = selectedIds.has(wall.id);
  for (const segment of segments) {
    const segmentOpenings = located.filter(({ projection }) => (
      projection.segmentIndex === segment.segmentIndex
    ));
    let cursor = 0;
    let fullIndex = 0;
    for (const item of segmentOpenings) {
      const intervalStart = item.projection.distanceAlongSegment - item.opening.width / 2;
      const intervalEnd = item.projection.distanceAlongSegment + item.opening.width / 2;
      if (intervalStart - cursor > GEOMETRY_EPSILON_MM) {
        const full = prismRecord(
          `wall-piece:${wall.id}:${segment.segmentIndex}:full:${fullIndex}`,
          wall, segment, cursor, intervalStart, elevation, 0, height, selected, [wall.id],
        );
        if (full === null) return wallFailure([wall.id, item.opening.id]);
        records.push(full);
        fullIndex += 1;
      }

      const openingTop = item.opening.kind === "door"
        ? item.opening.height
        : item.opening.sillHeight + item.opening.height;
      if (item.opening.kind === "window" && item.opening.sillHeight > GEOMETRY_EPSILON_MM) {
        const sill = prismRecord(
          `wall-piece:${wall.id}:${segment.segmentIndex}:sill:${item.opening.id}`,
          wall, segment, intervalStart, intervalEnd, elevation,
          0, item.opening.sillHeight, selected, [wall.id, item.opening.id],
        );
        if (sill === null) return wallFailure([wall.id, item.opening.id]);
        records.push(sill);
      }
      if (height - openingTop > GEOMETRY_EPSILON_MM) {
        const lintel = prismRecord(
          `wall-piece:${wall.id}:${segment.segmentIndex}:lintel:${item.opening.id}`,
          wall, segment, intervalStart, intervalEnd, elevation,
          openingTop, height, selected, [wall.id, item.opening.id],
        );
        if (lintel === null) return wallFailure([wall.id, item.opening.id]);
        records.push(lintel);
      }
      records.push(openingRecord(wall, segment, item, elevation, selectedIds));
      cursor = intervalEnd;
    }

    if (segment.length - cursor > GEOMETRY_EPSILON_MM) {
      const full = prismRecord(
        `wall-piece:${wall.id}:${segment.segmentIndex}:full:${fullIndex}`,
        wall, segment, cursor, segment.length, elevation, 0, height, selected, [wall.id],
      );
      if (full === null) return wallFailure([wall.id]);
      records.push(full);
    }
  }
  return records;
}
