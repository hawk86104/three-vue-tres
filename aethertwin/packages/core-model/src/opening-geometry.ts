import type { Opening } from "./content-model";
import type { Point2 } from "./geometry";
import type { Wall } from "./spatial-entities";

export const GEOMETRY_EPSILON_MM = 1e-7;

const MAX_WORLD_COORDINATE_MM = 1_000_000_000;
const DEFAULT_WALL_HEIGHT_MM = 3000;
const MIN_ENDPOINT_CLEARANCE_MM = 1;
const MIN_OPENING_GAP_MM = 1;

export interface WallMetricSegment {
  readonly segmentIndex: number;
  readonly start: Point2;
  readonly end: Point2;
  readonly tangent: Point2;
  readonly length: number;
  readonly cumulativeStart: number;
  readonly cumulativeEnd: number;
  readonly effectiveThickness: number;
}

export type OpeningGeometryIssueCode =
  | "OPENING_WALL_NOT_FOUND"
  | "OPENING_WALL_GEOMETRY_INVALID"
  | "OPENING_SPAN_CROSSES_JOINT"
  | "OPENING_ENDPOINT_CLEARANCE"
  | "OPENING_OVERLAP"
  | "OPENING_HEIGHT_EXCEEDED"
  | "OPENING_DOOR_SILL_NONZERO"
  | "OPENING_TARGET_LOCKED";

export interface OpeningGeometryIssue {
  readonly code: OpeningGeometryIssueCode;
  readonly openingId: string;
  readonly wallId: string;
  readonly relatedOpeningId?: string;
}

export interface OpeningProjection {
  readonly openingId: string;
  readonly wallId: string;
  readonly segmentIndex: number;
  readonly center: Point2;
  readonly tangent: Point2;
  readonly distanceAlongSegment: number;
  readonly effectiveThickness: number;
}

interface OpeningInterval {
  readonly opening: Opening;
  readonly start: number;
  readonly end: number;
}

function frozenPoint(x: number, y: number): Point2 {
  return Object.freeze({ x, y });
}

function isWorldCoordinate(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= MAX_WORLD_COORDINATE_MM;
}

function transformPoint(wall: Wall, point: Point2): Point2 | undefined {
  const { scale, rotation, translation } = wall.transform;
  if (
    !Number.isFinite(point.x)
    || !Number.isFinite(point.y)
    || !Number.isFinite(scale.x)
    || !Number.isFinite(scale.y)
    || scale.x <= 0
    || scale.y <= 0
    || !Number.isFinite(rotation)
    || !Number.isFinite(translation.x)
    || !Number.isFinite(translation.y)
  ) {
    return undefined;
  }
  const scaledX = point.x * scale.x;
  const scaledY = point.y * scale.y;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const x = scaledX * cosine - scaledY * sine + translation.x;
  const y = scaledX * sine + scaledY * cosine + translation.y;
  return isWorldCoordinate(x) && isWorldCoordinate(y)
    ? frozenPoint(x, y)
    : undefined;
}

export function wallMetricSegments(wall: Wall): readonly WallMetricSegment[] {
  if (
    !Number.isFinite(wall.thickness)
    || wall.thickness <= 0
    || wall.centerLine.length < 2
  ) {
    return Object.freeze([]);
  }

  const worldPoints = wall.centerLine.map((point) => transformPoint(wall, point));
  if (worldPoints.some((point) => point === undefined)) {
    return Object.freeze([]);
  }

  const segments: WallMetricSegment[] = [];
  let cumulativeLength = 0;
  for (let segmentIndex = 0; segmentIndex < wall.centerLine.length - 1; segmentIndex += 1) {
    const localStart = wall.centerLine[segmentIndex]!;
    const localEnd = wall.centerLine[segmentIndex + 1]!;
    const localDeltaX = localEnd.x - localStart.x;
    const localDeltaY = localEnd.y - localStart.y;
    const localLength = Math.hypot(localDeltaX, localDeltaY);
    if (!Number.isFinite(localLength) || localLength === 0) continue;

    const start = worldPoints[segmentIndex]!;
    const end = worldPoints[segmentIndex + 1]!;
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const length = Math.hypot(deltaX, deltaY);
    if (!Number.isFinite(length) || length === 0) continue;

    const tangentScale = Math.hypot(
      localDeltaX * wall.transform.scale.x,
      localDeltaY * wall.transform.scale.y,
    ) / localLength;
    const normalScale = (
      wall.transform.scale.x * wall.transform.scale.y
    ) / tangentScale;
    const effectiveThickness = wall.thickness * normalScale;
    if (!Number.isFinite(effectiveThickness) || effectiveThickness <= 0) {
      return Object.freeze([]);
    }

    const segment = Object.freeze({
      segmentIndex,
      start,
      end,
      tangent: frozenPoint(deltaX / length, deltaY / length),
      length,
      cumulativeStart: cumulativeLength,
      cumulativeEnd: cumulativeLength + length,
      effectiveThickness,
    });
    segments.push(segment);
    cumulativeLength += length;
  }
  return Object.freeze(segments);
}

export function effectiveWallThickness(
  wall: Wall,
  segmentIndex: number,
): number | undefined {
  return wallMetricSegments(wall).find(
    (segment) => segment.segmentIndex === segmentIndex,
  )?.effectiveThickness;
}

export function locateOpening(
  wall: Wall,
  opening: Opening,
): OpeningProjection | undefined {
  if (
    opening.wallId !== wall.id
    || !Number.isFinite(opening.distanceAlongWall)
  ) {
    return undefined;
  }
  const segments = wallMetricSegments(wall);
  const segment = segments.find((candidate) =>
    opening.distanceAlongWall >= candidate.cumulativeStart - GEOMETRY_EPSILON_MM
    && opening.distanceAlongWall <= candidate.cumulativeEnd + GEOMETRY_EPSILON_MM);
  if (segment === undefined) return undefined;

  const distanceAlongSegment =
    opening.distanceAlongWall - segment.cumulativeStart;
  return Object.freeze({
    openingId: opening.id,
    wallId: wall.id,
    segmentIndex: segment.segmentIndex,
    center: frozenPoint(
      segment.start.x + segment.tangent.x * distanceAlongSegment,
      segment.start.y + segment.tangent.y * distanceAlongSegment,
    ),
    tangent: segment.tangent,
    distanceAlongSegment,
    effectiveThickness: segment.effectiveThickness,
  });
}

function issue(
  code: OpeningGeometryIssueCode,
  opening: Opening,
  relatedOpeningId?: string,
): OpeningGeometryIssue {
  return Object.freeze(relatedOpeningId === undefined
    ? { code, openingId: opening.id, wallId: opening.wallId }
    : { code, openingId: opening.id, wallId: opening.wallId, relatedOpeningId });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareIssues(left: OpeningGeometryIssue, right: OpeningGeometryIssue): number {
  return compareText(left.openingId, right.openingId)
    || compareText(left.code, right.code)
    || compareText(left.relatedOpeningId ?? "", right.relatedOpeningId ?? "");
}

export function validateOpeningGeometry(
  walls: readonly Wall[],
  openings: readonly Opening[],
): readonly OpeningGeometryIssue[] {
  const wallsById = new Map(walls.map((wall) => [wall.id, wall]));
  const intervalsByWall = new Map<string, OpeningInterval[]>();
  const issues: OpeningGeometryIssue[] = [];

  for (const opening of openings) {
    const wall = wallsById.get(opening.wallId);
    if (wall === undefined) {
      issues.push(issue("OPENING_WALL_NOT_FOUND", opening));
      continue;
    }

    const segments = wallMetricSegments(wall);
    if (segments.length === 0) {
      issues.push(issue("OPENING_WALL_GEOMETRY_INVALID", opening));
      continue;
    }

    const intervalStart = opening.distanceAlongWall - opening.width / 2;
    const intervalEnd = opening.distanceAlongWall + opening.width / 2;
    const carryingSegment = segments.find((segment) =>
      intervalStart >= segment.cumulativeStart - GEOMETRY_EPSILON_MM
      && intervalEnd <= segment.cumulativeEnd + GEOMETRY_EPSILON_MM);

    if (carryingSegment === undefined) {
      const totalLength = segments.at(-1)!.cumulativeEnd;
      if (
        intervalStart >= -GEOMETRY_EPSILON_MM
        && intervalEnd <= totalLength + GEOMETRY_EPSILON_MM
      ) {
        issues.push(issue("OPENING_SPAN_CROSSES_JOINT", opening));
      } else {
        issues.push(issue("OPENING_ENDPOINT_CLEARANCE", opening));
      }
    } else {
      const clearance = Math.max(
        MIN_ENDPOINT_CLEARANCE_MM,
        carryingSegment.effectiveThickness / 2,
      );
      const startClearance = intervalStart - carryingSegment.cumulativeStart;
      const endClearance = carryingSegment.cumulativeEnd - intervalEnd;
      if (
        startClearance < clearance - GEOMETRY_EPSILON_MM
        || endClearance < clearance - GEOMETRY_EPSILON_MM
      ) {
        issues.push(issue("OPENING_ENDPOINT_CLEARANCE", opening));
      }
    }

    if (
      opening.kind === "door"
      && Math.abs(opening.sillHeight) > GEOMETRY_EPSILON_MM
    ) {
      issues.push(issue("OPENING_DOOR_SILL_NONZERO", opening));
    }
    const wallHeight = wall.spatial3D?.height ?? DEFAULT_WALL_HEIGHT_MM;
    const openingTop = opening.kind === "door"
      ? opening.height
      : opening.sillHeight + opening.height;
    if (openingTop > wallHeight + GEOMETRY_EPSILON_MM) {
      issues.push(issue("OPENING_HEIGHT_EXCEEDED", opening));
    }

    const wallIntervals = intervalsByWall.get(wall.id) ?? [];
    wallIntervals.push({ opening, start: intervalStart, end: intervalEnd });
    intervalsByWall.set(wall.id, wallIntervals);
  }

  for (const intervals of intervalsByWall.values()) {
    intervals.sort((left, right) =>
      left.start - right.start
      || left.end - right.end
      || compareText(left.opening.id, right.opening.id));
    for (let leftIndex = 0; leftIndex < intervals.length; leftIndex += 1) {
      const left = intervals[leftIndex]!;
      for (let rightIndex = leftIndex + 1; rightIndex < intervals.length; rightIndex += 1) {
        const right = intervals[rightIndex]!;
        const gap = right.start - left.end;
        if (gap >= MIN_OPENING_GAP_MM - GEOMETRY_EPSILON_MM) break;
        issues.push(issue("OPENING_OVERLAP", left.opening, right.opening.id));
        issues.push(issue("OPENING_OVERLAP", right.opening, left.opening.id));
      }
    }
  }

  issues.sort(compareIssues);
  return Object.freeze(issues);
}
