import {
  GEOMETRY_EPSILON_MM,
  locateOpening,
  validateOpeningGeometry,
  wallMetricSegments,
  type Opening,
  type OpeningGeometryIssue,
  type Point2,
  type Wall,
  type WallMetricSegment,
} from "@aethertwin/core-model";

export interface OpeningPlacementCandidate {
  readonly wallId: string;
  readonly distanceAlongWall: number;
  readonly worldCenter: Point2;
  readonly tangent: Point2;
  readonly effectiveThickness: number;
  readonly valid: boolean;
  readonly issue?: OpeningGeometryIssue;
}

export interface NearestOpeningPlacementInput {
  readonly point: Point2;
  readonly walls: readonly Wall[];
  readonly width: number;
  readonly height: number;
  readonly sillHeight: number;
  readonly kind: Opening["kind"];
  readonly hitToleranceWorld: number;
}

interface ProjectedWallSegment {
  readonly wall: Wall;
  readonly segment: WallMetricSegment;
  readonly center: Point2;
  readonly distanceAlongSegment: number;
  readonly perpendicularDistance: number;
}

const PREVIEW_OPENING_ID = "00000000-0000-4000-8000-000000000000";

function finitePoint(point: Point2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function validPlacementInput(input: NearestOpeningPlacementInput): boolean {
  return finitePoint(input.point)
    && Number.isFinite(input.width)
    && input.width > 0
    && Number.isFinite(input.height)
    && input.height > 0
    && Number.isFinite(input.sillHeight)
    && input.sillHeight >= 0
    && Number.isFinite(input.hitToleranceWorld)
    && input.hitToleranceWorld >= 0;
}

function projectToSegment(
  point: Point2,
  wall: Wall,
  segment: WallMetricSegment,
): ProjectedWallSegment {
  const offsetX = point.x - segment.start.x;
  const offsetY = point.y - segment.start.y;
  const projectedDistance = (
    offsetX * segment.tangent.x + offsetY * segment.tangent.y
  );
  const distanceAlongSegment = Math.max(
    0,
    Math.min(segment.length, projectedDistance),
  );
  const center = Object.freeze({
    x: segment.start.x + segment.tangent.x * distanceAlongSegment,
    y: segment.start.y + segment.tangent.y * distanceAlongSegment,
  });
  return {
    wall,
    segment,
    center,
    distanceAlongSegment,
    perpendicularDistance: Math.hypot(
      point.x - center.x,
      point.y - center.y,
    ),
  };
}

function compareProjectedSegments(
  left: ProjectedWallSegment,
  right: ProjectedWallSegment,
): number {
  return left.perpendicularDistance - right.perpendicularDistance
    || (left.wall.id < right.wall.id ? -1 : left.wall.id > right.wall.id ? 1 : 0)
    || left.segment.segmentIndex - right.segment.segmentIndex;
}

function previewOpening(
  input: NearestOpeningPlacementInput,
  candidate: ProjectedWallSegment,
): Opening {
  return Object.freeze({
    id: PREVIEW_OPENING_ID,
    name: "",
    tags: Object.freeze([]),
    wallId: candidate.wall.id,
    kind: input.kind,
    distanceAlongWall:
      candidate.segment.cumulativeStart + candidate.distanceAlongSegment,
    width: input.width,
    height: input.height,
    sillHeight: input.sillHeight,
  });
}

export function nearestOpeningPlacement(
  input: NearestOpeningPlacementInput,
): OpeningPlacementCandidate | undefined {
  if (!validPlacementInput(input)) {
    return undefined;
  }

  const projected = input.walls
    .filter((wall) => !wall.locked)
    .flatMap((wall) =>
      wallMetricSegments(wall).map((segment) =>
        projectToSegment(input.point, wall, segment),
      ),
    )
    .filter((candidate) =>
      candidate.perpendicularDistance
        <= candidate.segment.effectiveThickness / 2
          + input.hitToleranceWorld
          + GEOMETRY_EPSILON_MM,
    )
    .sort(compareProjectedSegments);
  const nearest = projected[0];
  if (nearest === undefined) {
    return undefined;
  }

  const opening = previewOpening(input, nearest);
  const issue = validateOpeningGeometry([nearest.wall], [opening])[0];
  const common = {
    wallId: nearest.wall.id,
    distanceAlongWall: opening.distanceAlongWall,
    worldCenter: nearest.center,
    tangent: nearest.segment.tangent,
    effectiveThickness: nearest.segment.effectiveThickness,
  };
  return Object.freeze(
    issue === undefined
      ? { ...common, valid: true }
      : { ...common, valid: false, issue },
  );
}

export function hitTestOpening(
  point: Point2,
  opening: Opening,
  wall: Wall,
  toleranceWorld: number,
): boolean {
  if (
    !finitePoint(point)
    || !Number.isFinite(toleranceWorld)
    || toleranceWorld < 0
    || !Number.isFinite(opening.width)
    || opening.width <= 0
  ) {
    return false;
  }

  const projection = locateOpening(wall, opening);
  if (projection === undefined) {
    return false;
  }
  const offsetX = point.x - projection.center.x;
  const offsetY = point.y - projection.center.y;
  const distanceAlongWall = Math.abs(
    offsetX * projection.tangent.x + offsetY * projection.tangent.y,
  );
  const distanceNormalToWall = Math.abs(
    -offsetX * projection.tangent.y + offsetY * projection.tangent.x,
  );
  return distanceAlongWall
    <= opening.width / 2 + toleranceWorld + GEOMETRY_EPSILON_MM
    && distanceNormalToWall
      <= projection.effectiveThickness / 2
        + toleranceWorld
        + GEOMETRY_EPSILON_MM;
}
