import {
  GEOMETRY_EPSILON_MM,
  type Point2,
  type ProjectSnapshot,
  type SpatialEntity,
  type SpaceUnit,
  type Wall,
} from "@aethertwin/core-model";
import {
  normalizeWallTopology,
  type NormalizedRoomTopology,
  type RoomTopologyDiagnostic,
  type RoomTopologyFailure,
} from "./room-topology";
import { applyTransform } from "./transforms";

const MIN_ROOM_AREA_MM2 = 250_000;

export interface RoomCandidate {
  readonly key: string;
  readonly footprint: readonly Point2[];
  readonly wallIds: readonly string[];
  readonly area: number;
  readonly perimeter: number;
}

export type RoomRecognitionFailure =
  | RoomTopologyFailure
  | {
    readonly code: "ROOM_FACE_TRAVERSAL_FAILED";
    readonly message: string;
  };

export type RoomRecognitionDiagnostic =
  | RoomTopologyDiagnostic
  | {
    readonly code: "DANGLING_EDGE";
    readonly wallIds: readonly string[];
  }
  | {
    readonly code: "FILTERED_SMALL_FACE";
    readonly wallIds: readonly string[];
    readonly area: number;
  };

export type RoomRecognitionResult =
  | {
    readonly ok: true;
    readonly value: readonly RoomCandidate[];
    readonly diagnostics: readonly RoomRecognitionDiagnostic[];
  }
  | { readonly ok: false; readonly issue: RoomRecognitionFailure };

export interface RoomFingerprintInput {
  readonly snapshot: ProjectSnapshot;
  readonly floorId: string;
  readonly toleranceMm: number;
}

export interface RepresentedRoomCandidateInput {
  readonly candidates: readonly RoomCandidate[];
  readonly entities: readonly SpatialEntity[];
  readonly floorId?: string;
}

interface HalfEdge {
  readonly from: number;
  readonly to: number;
  readonly edgeIndex: number;
  readonly wallIds: readonly string[];
  twin: number;
  next: number;
}

interface FaceWalk {
  readonly vertexIndices: readonly number[];
  readonly edgeIndices: readonly number[];
  readonly wallIds: readonly string[];
}

interface CandidateWithCentroid {
  readonly candidate: RoomCandidate;
  readonly centroid: Point2;
}

type FaceEvaluation =
  | { readonly kind: "candidate"; readonly value: CandidateWithCentroid }
  | { readonly kind: "filtered-small"; readonly area: number };

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function comparePoint(left: Point2, right: Point2): number {
  return left.x - right.x || left.y - right.y;
}

function frozenPoint(point: Point2): Point2 {
  return Object.freeze({ x: point.x, y: point.y });
}

function signedDoubleArea(points: readonly Point2[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    sum += current.x * next.y - current.y * next.x;
  }
  return sum;
}

function perimeter(points: readonly Point2[]): number {
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    total += Math.hypot(next.x - current.x, next.y - current.y);
  }
  return total;
}

function centroid(points: readonly Point2[], doubleArea: number): Point2 {
  let weightedX = 0;
  let weightedY = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const weight = current.x * next.y - current.y * next.x;
    weightedX += (current.x + next.x) * weight;
    weightedY += (current.y + next.y) * weight;
  }
  const factor = 1 / (3 * doubleArea);
  return frozenPoint({
    x: weightedX * factor,
    y: weightedY * factor,
  });
}

function samePoint(left: Point2, right: Point2): boolean {
  return left.x === right.x && left.y === right.y;
}

function collinearMiddle(
  previous: Point2,
  current: Point2,
  next: Point2,
): boolean {
  const incomingX = current.x - previous.x;
  const incomingY = current.y - previous.y;
  const outgoingX = next.x - current.x;
  const outgoingY = next.y - current.y;
  const incomingLength = Math.hypot(incomingX, incomingY);
  const outgoingLength = Math.hypot(outgoingX, outgoingY);
  if (incomingLength === 0 || outgoingLength === 0) return true;
  const distanceFromLine = Math.abs(
    incomingX * outgoingY - incomingY * outgoingX,
  ) / incomingLength;
  const continuesForward = incomingX * outgoingX + incomingY * outgoingY > 0;
  return distanceFromLine <= GEOMETRY_EPSILON_MM && continuesForward;
}

function removeRepeatedAndCollinear(
  input: readonly Point2[],
): readonly Point2[] {
  const points: Point2[] = [];
  for (const point of input) {
    if (points.length === 0 || !samePoint(points.at(-1)!, point)) {
      points.push(frozenPoint(point));
    }
  }
  if (points.length > 1 && samePoint(points[0]!, points.at(-1)!)) {
    points.pop();
  }

  let changed = true;
  while (changed && points.length >= 3) {
    changed = false;
    for (let index = 0; index < points.length; index += 1) {
      const previous = points[(index - 1 + points.length) % points.length]!;
      const current = points[index]!;
      const next = points[(index + 1) % points.length]!;
      if (!collinearMiddle(previous, current, next)) continue;
      points.splice(index, 1);
      changed = true;
      break;
    }
  }
  return points;
}

function compareRotations(
  points: readonly Point2[],
  leftStart: number,
  rightStart: number,
): number {
  for (let offset = 0; offset < points.length; offset += 1) {
    const left = points[(leftStart + offset) % points.length]!;
    const right = points[(rightStart + offset) % points.length]!;
    const comparison = comparePoint(left, right);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function canonicalRing(input: readonly Point2[]): readonly Point2[] | undefined {
  const simplified = removeRepeatedAndCollinear(input);
  if (simplified.length < 3) return undefined;
  const area = signedDoubleArea(simplified);
  if (!Number.isFinite(area) || Math.abs(area) <= GEOMETRY_EPSILON_MM) {
    return undefined;
  }
  const oriented = area > 0 ? [...simplified] : [...simplified].reverse();
  let startIndex = 0;
  for (let index = 1; index < oriented.length; index += 1) {
    if (compareRotations(oriented, index, startIndex) < 0) startIndex = index;
  }
  return Object.freeze(Array.from(
    { length: oriented.length },
    (_, offset) => frozenPoint(oriented[(startIndex + offset) % oriented.length]!),
  ));
}

function orientation(a: Point2, b: Point2, c: Point2): number {
  return (b.x - a.x) * (c.y - a.y)
    - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(a: Point2, b: Point2, point: Point2): boolean {
  return Math.abs(orientation(a, b, point)) <= GEOMETRY_EPSILON_MM
    && point.x >= Math.min(a.x, b.x) - GEOMETRY_EPSILON_MM
    && point.x <= Math.max(a.x, b.x) + GEOMETRY_EPSILON_MM
    && point.y >= Math.min(a.y, b.y) - GEOMETRY_EPSILON_MM
    && point.y <= Math.max(a.y, b.y) + GEOMETRY_EPSILON_MM;
}

function segmentsIntersect(
  a: Point2,
  b: Point2,
  c: Point2,
  d: Point2,
): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (
    ((abC > GEOMETRY_EPSILON_MM && abD < -GEOMETRY_EPSILON_MM)
      || (abC < -GEOMETRY_EPSILON_MM && abD > GEOMETRY_EPSILON_MM))
    && ((cdA > GEOMETRY_EPSILON_MM && cdB < -GEOMETRY_EPSILON_MM)
      || (cdA < -GEOMETRY_EPSILON_MM && cdB > GEOMETRY_EPSILON_MM))
  ) {
    return true;
  }
  return pointOnSegment(a, b, c)
    || pointOnSegment(a, b, d)
    || pointOnSegment(c, d, a)
    || pointOnSegment(c, d, b);
}

function simpleRing(points: readonly Point2[]): boolean {
  const pointKeys = new Set(points.map((point) => `${point.x}\u0000${point.y}`));
  if (pointKeys.size !== points.length) return false;
  for (let left = 0; left < points.length; left += 1) {
    const leftNext = (left + 1) % points.length;
    for (let right = left + 1; right < points.length; right += 1) {
      const rightNext = (right + 1) % points.length;
      if (
        left === right
        || leftNext === right
        || rightNext === left
      ) {
        continue;
      }
      if (segmentsIntersect(
        points[left]!,
        points[leftNext]!,
        points[right]!,
        points[rightNext]!,
      )) {
        return false;
      }
    }
  }
  return true;
}

function halfEdges(topology: NormalizedRoomTopology): readonly HalfEdge[] {
  const result: HalfEdge[] = [];
  for (let edgeIndex = 0; edgeIndex < topology.edges.length; edgeIndex += 1) {
    const edge = topology.edges[edgeIndex]!;
    const forwardIndex = result.length;
    const reverseIndex = forwardIndex + 1;
    result.push({
      from: edge.a,
      to: edge.b,
      edgeIndex,
      wallIds: edge.wallIds,
      twin: reverseIndex,
      next: -1,
    });
    result.push({
      from: edge.b,
      to: edge.a,
      edgeIndex,
      wallIds: edge.wallIds,
      twin: forwardIndex,
      next: -1,
    });
  }

  const outgoing = new Map<number, number[]>();
  for (let index = 0; index < result.length; index += 1) {
    const edge = result[index]!;
    const indices = outgoing.get(edge.from) ?? [];
    indices.push(index);
    outgoing.set(edge.from, indices);
  }
  for (const [vertexIndex, indices] of outgoing) {
    const origin = topology.vertices[vertexIndex]!;
    indices.sort((leftIndex, rightIndex) => {
      const left = result[leftIndex]!;
      const right = result[rightIndex]!;
      const leftDestination = topology.vertices[left.to]!;
      const rightDestination = topology.vertices[right.to]!;
      const leftAngle = Math.atan2(
        leftDestination.y - origin.y,
        leftDestination.x - origin.x,
      );
      const rightAngle = Math.atan2(
        rightDestination.y - origin.y,
        rightDestination.x - origin.x,
      );
      return leftAngle - rightAngle
        || comparePoint(leftDestination, rightDestination)
        || compareText(left.wallIds.join("\u0000"), right.wallIds.join("\u0000"))
        || left.edgeIndex - right.edgeIndex;
    });
  }

  for (const edge of result) {
    const atDestination = outgoing.get(edge.to)!;
    const twinPosition = atDestination.indexOf(edge.twin);
    edge.next = atDestination[
      (twinPosition - 1 + atDestination.length) % atDestination.length
    ]!;
  }
  return result;
}

function walkFaces(
  topology: NormalizedRoomTopology,
): readonly FaceWalk[] | RoomRecognitionFailure {
  const edges = halfEdges(topology);
  const visited = new Set<number>();
  const faces: FaceWalk[] = [];

  for (let start = 0; start < edges.length; start += 1) {
    if (visited.has(start)) continue;
    const vertexIndices: number[] = [];
    const edgeIndices: number[] = [];
    const wallIds = new Set<string>();
    let current = start;
    for (let steps = 0; steps <= edges.length; steps += 1) {
      if (visited.has(current)) {
        if (current !== start) {
          return {
            code: "ROOM_FACE_TRAVERSAL_FAILED",
            message: "Half-edge traversal entered an already visited face.",
          };
        }
        break;
      }
      visited.add(current);
      const edge = edges[current]!;
      vertexIndices.push(edge.from);
      edgeIndices.push(edge.edgeIndex);
      for (const wallId of edge.wallIds) wallIds.add(wallId);
      current = edge.next;
      if (current === start) break;
      if (steps === edges.length) {
        return {
          code: "ROOM_FACE_TRAVERSAL_FAILED",
          message: "Half-edge traversal exceeded the deterministic walk limit.",
        };
      }
    }
    faces.push(Object.freeze({
      vertexIndices: Object.freeze(vertexIndices),
      edgeIndices: Object.freeze(edgeIndices),
      wallIds: Object.freeze([...wallIds].sort(compareText)),
    }));
  }
  return Object.freeze(faces);
}

function candidateFromFace(
  topology: NormalizedRoomTopology,
  face: FaceWalk,
): FaceEvaluation | undefined {
  const raw = face.vertexIndices.map((index) => topology.vertices[index]!);
  if (signedDoubleArea(raw) <= GEOMETRY_EPSILON_MM) return undefined;
  const footprint = canonicalRing(raw);
  if (footprint === undefined || !simpleRing(footprint)) return undefined;
  const doubleArea = signedDoubleArea(footprint);
  const area = doubleArea / 2;
  if (area < MIN_ROOM_AREA_MM2) {
    return Object.freeze({ kind: "filtered-small", area });
  }
  const key = JSON.stringify(footprint);
  return Object.freeze({
    kind: "candidate",
    value: Object.freeze({
      candidate: Object.freeze({
        key,
        footprint,
        wallIds: face.wallIds,
        area,
        perimeter: perimeter(footprint),
      }),
      centroid: centroid(footprint, doubleArea),
    }),
  });
}

function compareDiagnostic(
  left: RoomRecognitionDiagnostic,
  right: RoomRecognitionDiagnostic,
): number {
  return compareText(left.code, right.code)
    || compareText(left.wallIds.join("\u0000"), right.wallIds.join("\u0000"))
    || compareText(
      ("segmentIndices" in left ? left.segmentIndices ?? [] : []).join(","),
      ("segmentIndices" in right ? right.segmentIndices ?? [] : []).join(","),
    )
    || (("area" in left ? left.area : 0) - ("area" in right ? right.area : 0));
}

export function recognizeClosedRooms(input: {
  readonly walls: readonly Wall[];
  readonly toleranceMm: number;
}): RoomRecognitionResult {
  const topology = normalizeWallTopology(input);
  if (!topology.ok) return topology;
  const walked = walkFaces(topology.value);
  if ("code" in walked) {
    return Object.freeze({ ok: false, issue: Object.freeze(walked) });
  }

  const byKey = new Map<string, CandidateWithCentroid>();
  const diagnostics: RoomRecognitionDiagnostic[] = [
    ...topology.value.diagnostics,
  ];
  const boundedEdgeIndices = new Set<number>();
  for (const face of walked) {
    const evaluation = candidateFromFace(topology.value, face);
    if (evaluation === undefined) continue;
    for (const edgeIndex of face.edgeIndices) boundedEdgeIndices.add(edgeIndex);
    if (evaluation.kind === "filtered-small") {
      diagnostics.push(Object.freeze({
        code: "FILTERED_SMALL_FACE",
        wallIds: face.wallIds,
        area: evaluation.area,
      }));
    } else if (!byKey.has(evaluation.value.candidate.key)) {
      byKey.set(evaluation.value.candidate.key, evaluation.value);
    }
  }
  for (let edgeIndex = 0; edgeIndex < topology.value.edges.length; edgeIndex += 1) {
    if (boundedEdgeIndices.has(edgeIndex)) continue;
    diagnostics.push(Object.freeze({
      code: "DANGLING_EDGE",
      wallIds: topology.value.edges[edgeIndex]!.wallIds,
    }));
  }
  diagnostics.sort(compareDiagnostic);
  const candidates = [...byKey.values()]
    .sort((left, right) =>
      left.candidate.area - right.candidate.area
      || left.centroid.x - right.centroid.x
      || left.centroid.y - right.centroid.y
      || compareText(left.candidate.key, right.candidate.key))
    .map(({ candidate }) => candidate);
  return Object.freeze({
    ok: true,
    value: Object.freeze(candidates),
    diagnostics: Object.freeze(diagnostics),
  });
}

function roomWorldKey(room: SpaceUnit): string | undefined {
  try {
    const world = room.footprint.map((point) =>
      applyTransform(point, room.transform));
    const ring = canonicalRing(world);
    return ring === undefined ? undefined : JSON.stringify(ring);
  } catch {
    return undefined;
  }
}

export function representedRoomCandidateKeys(
  input: RepresentedRoomCandidateInput,
): readonly string[] {
  const existingKeys = new Set(input.entities.flatMap((entity) => {
    if (
      entity.type !== "space-unit"
      || entity.kind !== "room"
      || (input.floorId !== undefined && entity.floorId !== input.floorId)
    ) {
      return [];
    }
    const key = roomWorldKey(entity);
    return key === undefined ? [] : [key];
  }));
  return Object.freeze(input.candidates.flatMap((candidate) => {
    const ring = canonicalRing(candidate.footprint);
    const geometryKey = ring === undefined ? undefined : JSON.stringify(ring);
    return geometryKey !== undefined && existingKeys.has(geometryKey)
      ? [candidate.key]
      : [];
  }));
}

export function roomInputFingerprint(input: RoomFingerprintInput): string {
  const floor = input.snapshot.project.floors.find(
    (candidate) => candidate.id === input.floorId,
  );
  const visibleLayerIds = new Set(
    floor?.layers.filter((candidate) => candidate.visible)
      .map((candidate) => candidate.id) ?? [],
  );
  const walls = input.snapshot.project.entities.flatMap((entity) =>
    entity.type === "wall"
      && entity.floorId === input.floorId
      && visibleLayerIds.has(entity.layerId)
      ? [{
        id: entity.id,
        layerId: entity.layerId,
        centerLine: entity.centerLine,
        transform: entity.transform,
        thickness: entity.thickness,
      }]
      : []);
  return JSON.stringify({
    floorId: input.floorId,
    toleranceMm: input.toleranceMm,
    layers: floor?.layers.map((candidate) => ({
      id: candidate.id,
      visible: candidate.visible,
    })) ?? [],
    walls,
  });
}
