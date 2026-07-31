import {
  GEOMETRY_EPSILON_MM,
  type Point2,
  type Wall,
} from "@aethertwin/core-model";
import { applyTransform } from "./transforms";

const DEFAULT_MAX_PAIR_COMPARISONS = 2_000_000;

export type RoomTopologyIssueCode =
  | "INVALID_ROOM_TOLERANCE"
  | "NON_FINITE_WALL_GEOMETRY"
  | "COLLINEAR_OVERLAP"
  | "TOPOLOGY_COMPLEXITY_LIMIT";

export type RoomTopologyDiagnosticCode =
  | "ZERO_LENGTH_SEGMENT"
  | "NORMALIZED_ZERO_LENGTH_EDGE"
  | "DUPLICATE_EDGE";

export interface RoomTopologyDiagnostic {
  readonly code: RoomTopologyDiagnosticCode;
  readonly wallIds: readonly string[];
  readonly segmentIndices?: readonly number[];
}

export interface RoomTopologyFailure {
  readonly code: RoomTopologyIssueCode;
  readonly message: string;
  readonly wallIds?: readonly string[];
  readonly segmentIndices?: readonly number[];
  readonly comparisonCount?: number;
  readonly maxPairComparisons?: number;
}

export interface NormalizedRoomTopology {
  readonly vertices: readonly Point2[];
  readonly edges: readonly {
    readonly a: number;
    readonly b: number;
    readonly wallIds: readonly string[];
  }[];
  readonly diagnostics: readonly RoomTopologyDiagnostic[];
}

export type RoomTopologyResult =
  | { readonly ok: true; readonly value: NormalizedRoomTopology }
  | { readonly ok: false; readonly issue: RoomTopologyFailure };

interface SourceSegment {
  readonly wallId: string;
  readonly segmentIndex: number;
  readonly start: Point2;
  readonly end: Point2;
  readonly length: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly splitPoints: SplitPoint[];
}

interface SplitPoint {
  readonly point: Point2;
  readonly parameter: number;
  clusterIndex?: number;
}

interface AttributedPoint {
  readonly point: Point2;
  readonly wallId: string;
  readonly segmentIndex: number;
  readonly parameter: number;
  readonly splitPoint: SplitPoint;
}

interface PointCluster {
  readonly representative: Point2;
}

interface MutableEdge {
  readonly a: number;
  readonly b: number;
  readonly wallIds: Set<string>;
  contributionCount: number;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function comparePoint(left: Point2, right: Point2): number {
  return left.x - right.x || left.y - right.y;
}

function canonicalEndpoints(
  segment: SourceSegment,
): readonly [Point2, Point2] {
  return comparePoint(segment.start, segment.end) <= 0
    ? [segment.start, segment.end]
    : [segment.end, segment.start];
}

function frozenPoint(point: Point2): Point2 {
  return Object.freeze({ x: point.x, y: point.y });
}

function success(value: NormalizedRoomTopology): RoomTopologyResult {
  return Object.freeze({ ok: true, value });
}

function failure(issue: RoomTopologyFailure): RoomTopologyResult {
  return Object.freeze({ ok: false, issue: Object.freeze(issue) });
}

function invalidTolerance(): RoomTopologyResult {
  return failure({
    code: "INVALID_ROOM_TOLERANCE",
    message: "Room topology tolerance must be finite and positive.",
  });
}

function finitePoint(point: Point2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function pointDistance(left: Point2, right: Point2): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function cross(left: Point2, right: Point2): number {
  return left.x * right.y - left.y * right.x;
}

function subtract(left: Point2, right: Point2): Point2 {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
  };
}

function interpolate(segment: SourceSegment, parameter: number): Point2 {
  return frozenPoint({
    x: segment.start.x + (segment.end.x - segment.start.x) * parameter,
    y: segment.start.y + (segment.end.y - segment.start.y) * parameter,
  });
}

function clampParameter(parameter: number): number {
  if (parameter <= GEOMETRY_EPSILON_MM) return 0;
  if (parameter >= 1 - GEOMETRY_EPSILON_MM) return 1;
  return parameter;
}

function addSplitPoint(
  segment: SourceSegment,
  parameter: number,
  point = interpolate(segment, parameter),
): void {
  const normalizedParameter = clampParameter(parameter);
  const existing = segment.splitPoints.find((candidate) =>
    Math.abs(candidate.parameter - normalizedParameter) <= GEOMETRY_EPSILON_MM
    && pointDistance(candidate.point, point) <= GEOMETRY_EPSILON_MM);
  if (existing !== undefined) return;
  segment.splitPoints.push({
    point: frozenPoint(point),
    parameter: normalizedParameter,
  });
}

function segmentOrder(left: SourceSegment, right: SourceSegment): number {
  const [leftStart, leftEnd] = canonicalEndpoints(left);
  const [rightStart, rightEnd] = canonicalEndpoints(right);
  return left.minX - right.minX
    || left.minY - right.minY
    || left.maxX - right.maxX
    || left.maxY - right.maxY
    || compareText(left.wallId, right.wallId)
    || comparePoint(leftStart, rightStart)
    || comparePoint(leftEnd, rightEnd)
    || left.segmentIndex - right.segmentIndex;
}

function pairBoundsOverlap(
  left: SourceSegment,
  right: SourceSegment,
  toleranceMm: number,
): boolean {
  return left.minX <= right.maxX + toleranceMm
    && right.minX <= left.maxX + toleranceMm
    && left.minY <= right.maxY + toleranceMm
    && right.minY <= left.maxY + toleranceMm;
}

function sortedSegmentAttribution(
  left: SourceSegment,
  right: SourceSegment,
): {
  readonly wallIds: readonly string[];
  readonly segmentIndices: readonly number[];
} {
  const descriptors = [left, right].sort((first, second) =>
    compareText(first.wallId, second.wallId)
    || first.segmentIndex - second.segmentIndex);
  return {
    wallIds: Object.freeze([...new Set(descriptors.map((segment) => segment.wallId))]),
    segmentIndices: Object.freeze(descriptors.map((segment) => segment.segmentIndex)),
  };
}

function collinearOverlap(
  left: SourceSegment,
  right: SourceSegment,
): boolean {
  const leftDelta = subtract(left.end, left.start);
  const rightDelta = subtract(right.end, right.start);
  const normalizedParallel = Math.abs(cross(leftDelta, rightDelta))
    / (left.length * right.length);
  if (normalizedParallel > GEOMETRY_EPSILON_MM) return false;

  const offset = subtract(right.start, left.start);
  const distanceFromLine = Math.abs(cross(offset, leftDelta)) / left.length;
  if (distanceFromLine > GEOMETRY_EPSILON_MM) return false;

  const tangent = {
    x: leftDelta.x / left.length,
    y: leftDelta.y / left.length,
  };
  const rightStart = offset.x * tangent.x + offset.y * tangent.y;
  const rightEndOffset = subtract(right.end, left.start);
  const rightEnd =
    rightEndOffset.x * tangent.x + rightEndOffset.y * tangent.y;
  const overlapStart = Math.max(0, Math.min(rightStart, rightEnd));
  const overlapEnd = Math.min(left.length, Math.max(rightStart, rightEnd));
  return overlapEnd - overlapStart > GEOMETRY_EPSILON_MM;
}

function addExactIntersection(
  left: SourceSegment,
  right: SourceSegment,
): void {
  const leftDelta = subtract(left.end, left.start);
  const rightDelta = subtract(right.end, right.start);
  const denominator = cross(leftDelta, rightDelta);
  const normalizedDenominator = Math.abs(denominator)
    / (left.length * right.length);
  if (normalizedDenominator <= GEOMETRY_EPSILON_MM) return;

  const offset = subtract(right.start, left.start);
  const leftParameter = cross(offset, rightDelta) / denominator;
  const rightParameter = cross(offset, leftDelta) / denominator;
  if (
    leftParameter < -GEOMETRY_EPSILON_MM
    || leftParameter > 1 + GEOMETRY_EPSILON_MM
    || rightParameter < -GEOMETRY_EPSILON_MM
    || rightParameter > 1 + GEOMETRY_EPSILON_MM
  ) {
    return;
  }

  const normalizedLeft = clampParameter(leftParameter);
  const normalizedRight = clampParameter(rightParameter);
  const [canonicalLeftStart, canonicalLeftEnd] = canonicalEndpoints(left);
  const [canonicalRightStart, canonicalRightEnd] = canonicalEndpoints(right);
  const canonicalLeftDelta = subtract(canonicalLeftEnd, canonicalLeftStart);
  const canonicalRightDelta = subtract(canonicalRightEnd, canonicalRightStart);
  const canonicalOffset = subtract(canonicalRightStart, canonicalLeftStart);
  const canonicalParameter = cross(canonicalOffset, canonicalRightDelta)
    / cross(canonicalLeftDelta, canonicalRightDelta);
  const point = frozenPoint({
    x: canonicalLeftStart.x + canonicalLeftDelta.x * canonicalParameter,
    y: canonicalLeftStart.y + canonicalLeftDelta.y * canonicalParameter,
  });
  addSplitPoint(left, normalizedLeft, point);
  addSplitPoint(right, normalizedRight, point);
}

function projectEndpointToInterior(
  endpoint: Point2,
  target: SourceSegment,
  toleranceMm: number,
): void {
  const delta = subtract(target.end, target.start);
  const parameter = (
    (endpoint.x - target.start.x) * delta.x
    + (endpoint.y - target.start.y) * delta.y
  ) / (target.length * target.length);
  if (
    parameter * target.length <= GEOMETRY_EPSILON_MM
    || (1 - parameter) * target.length <= GEOMETRY_EPSILON_MM
  ) {
    return;
  }
  const projected = interpolate(target, parameter);
  if (pointDistance(endpoint, projected) <= toleranceMm + GEOMETRY_EPSILON_MM) {
    addSplitPoint(target, parameter, projected);
  }
}

function compareAttributedPoint(
  left: AttributedPoint,
  right: AttributedPoint,
): number {
  return comparePoint(left.point, right.point)
    || compareText(left.wallId, right.wallId)
    || left.segmentIndex - right.segmentIndex
    || left.parameter - right.parameter;
}

function compareDiagnostic(
  left: RoomTopologyDiagnostic,
  right: RoomTopologyDiagnostic,
): number {
  return compareText(left.code, right.code)
    || compareText(left.wallIds.join("\u0000"), right.wallIds.join("\u0000"))
    || compareText(
      (left.segmentIndices ?? []).join(","),
      (right.segmentIndices ?? []).join(","),
    );
}

function freezeDiagnostic(
  diagnostic: RoomTopologyDiagnostic,
): RoomTopologyDiagnostic {
  return Object.freeze({
    ...diagnostic,
    wallIds: Object.freeze([...diagnostic.wallIds]),
    ...(diagnostic.segmentIndices === undefined
      ? {}
      : { segmentIndices: Object.freeze([...diagnostic.segmentIndices]) }),
  });
}

function transformedWallSegments(
  walls: readonly Wall[],
  diagnostics: RoomTopologyDiagnostic[],
): RoomTopologyResult | SourceSegment[] {
  const segments: SourceSegment[] = [];
  const sortedWalls = [...walls].sort((left, right) => compareText(left.id, right.id));

  for (const candidate of sortedWalls) {
    const transform = candidate.transform;
    const transformIsValid = [
      transform.translation.x,
      transform.translation.y,
      transform.rotation,
      transform.scale.x,
      transform.scale.y,
    ].every(Number.isFinite)
      && transform.scale.x > 0
      && transform.scale.y > 0;
    if (!transformIsValid) {
      return failure({
        code: "NON_FINITE_WALL_GEOMETRY",
        message: "Wall transform must contain finite values and positive scales.",
        wallIds: Object.freeze([candidate.id]),
      });
    }

    for (
      let segmentIndex = 0;
      segmentIndex < candidate.centerLine.length - 1;
      segmentIndex += 1
    ) {
      const localStart = candidate.centerLine[segmentIndex]!;
      const localEnd = candidate.centerLine[segmentIndex + 1]!;
      if (!finitePoint(localStart) || !finitePoint(localEnd)) {
        return failure({
          code: "NON_FINITE_WALL_GEOMETRY",
          message: "Wall centre-line coordinates must be finite after transformation.",
          wallIds: Object.freeze([candidate.id]),
          segmentIndices: Object.freeze([segmentIndex]),
        });
      }

      const start = applyTransform(localStart, transform);
      const end = applyTransform(localEnd, transform);
      if (!finitePoint(start) || !finitePoint(end)) {
        return failure({
          code: "NON_FINITE_WALL_GEOMETRY",
          message: "Wall centre-line coordinates must be finite after transformation.",
          wallIds: Object.freeze([candidate.id]),
          segmentIndices: Object.freeze([segmentIndex]),
        });
      }

      const length = pointDistance(start, end);
      if (!Number.isFinite(length)) {
        return failure({
          code: "NON_FINITE_WALL_GEOMETRY",
          message: "Wall centre-line coordinates must be finite after transformation.",
          wallIds: Object.freeze([candidate.id]),
          segmentIndices: Object.freeze([segmentIndex]),
        });
      }
      if (length === 0) {
        diagnostics.push(freezeDiagnostic({
          code: "ZERO_LENGTH_SEGMENT",
          wallIds: [candidate.id],
          segmentIndices: [segmentIndex],
        }));
        continue;
      }

      const frozenStart = frozenPoint(start);
      const frozenEnd = frozenPoint(end);
      const segment: SourceSegment = {
        wallId: candidate.id,
        segmentIndex,
        start: frozenStart,
        end: frozenEnd,
        length,
        minX: Math.min(start.x, end.x),
        minY: Math.min(start.y, end.y),
        maxX: Math.max(start.x, end.x),
        maxY: Math.max(start.y, end.y),
        splitPoints: [],
      };
      addSplitPoint(segment, 0, frozenStart);
      addSplitPoint(segment, 1, frozenEnd);
      segments.push(segment);
    }
  }

  segments.sort(segmentOrder);
  return segments;
}

function clusterSplitPoints(
  segments: readonly SourceSegment[],
  toleranceMm: number,
): readonly Point2[] {
  const attributed = segments.flatMap((segment) =>
    segment.splitPoints.map((splitPoint): AttributedPoint => ({
      point: splitPoint.point,
      wallId: segment.wallId,
      segmentIndex: segment.segmentIndex,
      parameter: splitPoint.parameter,
      splitPoint,
    })));
  attributed.sort(compareAttributedPoint);

  const clusters: PointCluster[] = [];
  const cellSize = toleranceMm + GEOMETRY_EPSILON_MM;
  const clusterIndicesByCell = new Map<string, number[]>();
  for (const candidate of attributed) {
    const cellX = Math.floor(candidate.point.x / cellSize);
    const cellY = Math.floor(candidate.point.y / cellSize);
    const nearbyClusterIndices = new Set<number>();
    for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
      for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
        const indices = clusterIndicesByCell.get(
          `${cellX + xOffset}:${cellY + yOffset}`,
        );
        if (indices === undefined) continue;
        for (const index of indices) nearbyClusterIndices.add(index);
      }
    }
    let clusterIndex = [...nearbyClusterIndices]
      .sort((left, right) => left - right)
      .find((index) =>
        pointDistance(clusters[index]!.representative, candidate.point)
          <= cellSize) ?? -1;
    if (clusterIndex < 0) {
      clusterIndex = clusters.length;
      clusters.push({ representative: frozenPoint(candidate.point) });
      const key = `${cellX}:${cellY}`;
      const cellClusterIndices = clusterIndicesByCell.get(key) ?? [];
      cellClusterIndices.push(clusterIndex);
      clusterIndicesByCell.set(key, cellClusterIndices);
    }
    candidate.splitPoint.clusterIndex = clusterIndex;
  }
  return Object.freeze(clusters.map((cluster) => cluster.representative));
}

function emitEdges(
  segments: readonly SourceSegment[],
  diagnostics: RoomTopologyDiagnostic[],
): NormalizedRoomTopology["edges"] {
  const edgeByKey = new Map<string, MutableEdge>();
  const zeroLengthDiagnosticKeys = new Set<string>();

  for (const segment of segments) {
    segment.splitPoints.sort((left, right) =>
      left.parameter - right.parameter
      || comparePoint(left.point, right.point));
    for (let index = 0; index < segment.splitPoints.length - 1; index += 1) {
      const start = segment.splitPoints[index]!;
      const end = segment.splitPoints[index + 1]!;
      const startCluster = start.clusterIndex!;
      const endCluster = end.clusterIndex!;
      if (startCluster === endCluster) {
        const diagnosticKey = `${segment.wallId}\u0000${segment.segmentIndex}`;
        if (!zeroLengthDiagnosticKeys.has(diagnosticKey)) {
          zeroLengthDiagnosticKeys.add(diagnosticKey);
          diagnostics.push(freezeDiagnostic({
            code: "NORMALIZED_ZERO_LENGTH_EDGE",
            wallIds: [segment.wallId],
            segmentIndices: [segment.segmentIndex],
          }));
        }
        continue;
      }

      const a = Math.min(startCluster, endCluster);
      const b = Math.max(startCluster, endCluster);
      const key = `${a}:${b}`;
      const existing = edgeByKey.get(key);
      if (existing === undefined) {
        edgeByKey.set(key, {
          a,
          b,
          wallIds: new Set([segment.wallId]),
          contributionCount: 1,
        });
      } else {
        existing.wallIds.add(segment.wallId);
        existing.contributionCount += 1;
      }
    }
  }

  const edges = [...edgeByKey.values()]
    .sort((left, right) => left.a - right.a || left.b - right.b)
    .map((edge) => Object.freeze({
      a: edge.a,
      b: edge.b,
      wallIds: Object.freeze([...edge.wallIds].sort(compareText)),
    }));
  for (const edge of edges) {
    const mutableEdge = edgeByKey.get(`${edge.a}:${edge.b}`)!;
    if (mutableEdge.contributionCount <= 1) continue;
    diagnostics.push(freezeDiagnostic({
      code: "DUPLICATE_EDGE",
      wallIds: edge.wallIds,
    }));
  }
  return Object.freeze(edges);
}

export function normalizeWallTopology(input: {
  readonly walls: readonly Wall[];
  readonly toleranceMm: number;
  readonly maxPairComparisons?: number;
}): RoomTopologyResult {
  if (!Number.isFinite(input.toleranceMm) || input.toleranceMm <= 0) {
    return invalidTolerance();
  }
  const maxPairComparisons =
    input.maxPairComparisons ?? DEFAULT_MAX_PAIR_COMPARISONS;
  if (
    !Number.isSafeInteger(maxPairComparisons)
    || maxPairComparisons < 0
  ) {
    return failure({
      code: "TOPOLOGY_COMPLEXITY_LIMIT",
      message: "Topology comparison limit must be a non-negative safe integer.",
      comparisonCount: 0,
      maxPairComparisons,
    });
  }

  const diagnostics: RoomTopologyDiagnostic[] = [];
  const extracted = transformedWallSegments(input.walls, diagnostics);
  if (!Array.isArray(extracted)) return extracted;
  const segments = extracted;

  let comparisonCount = 0;
  for (let leftIndex = 0; leftIndex < segments.length; leftIndex += 1) {
    const left = segments[leftIndex]!;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < segments.length;
      rightIndex += 1
    ) {
      const right = segments[rightIndex]!;
      if (right.minX > left.maxX + input.toleranceMm) break;
      if (!pairBoundsOverlap(left, right, input.toleranceMm)) continue;
      comparisonCount += 1;
      if (comparisonCount > maxPairComparisons) {
        return failure({
          code: "TOPOLOGY_COMPLEXITY_LIMIT",
          message: "Room topology exceeded the deterministic pair comparison limit.",
          comparisonCount,
          maxPairComparisons,
        });
      }
      if (collinearOverlap(left, right)) {
        const attribution = sortedSegmentAttribution(left, right);
        return failure({
          code: "COLLINEAR_OVERLAP",
          message: "Collinear wall segments overlap over a positive length.",
          ...attribution,
        });
      }

      addExactIntersection(left, right);
      projectEndpointToInterior(left.start, right, input.toleranceMm);
      projectEndpointToInterior(left.end, right, input.toleranceMm);
      projectEndpointToInterior(right.start, left, input.toleranceMm);
      projectEndpointToInterior(right.end, left, input.toleranceMm);
    }
  }

  const vertices = clusterSplitPoints(segments, input.toleranceMm);
  const edges = emitEdges(segments, diagnostics);
  diagnostics.sort(compareDiagnostic);
  return success(Object.freeze({
    vertices,
    edges,
    diagnostics: Object.freeze(diagnostics),
  }));
}
