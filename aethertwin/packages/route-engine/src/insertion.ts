import {
  ROUTE_GEOMETRY_EPSILON_MM,
  type Point2,
  type RouteEdge,
  type RouteNetwork,
  type RouteNode,
} from "@aethertwin/core-model";
import { routeFailure, routeSuccess, type Result, type RouteMutationError } from "./result";

const DEFAULT_SNAP_TOLERANCE_MM = 5;
const MIN_SNAP_TOLERANCE_MM = 0.1;
const MAX_SNAP_TOLERANCE_MM = 100;
const DEFAULT_EDGE_WIDTH_MM = 1200;
const MAX_INTERSECTION_CHECKS = 100_000;

export interface RouteIdSource {
  next(kind: "node" | "edge", canonicalKey: string): string;
}

export interface InsertRouteSegmentInput {
  readonly network: RouteNetwork;
  readonly floorId: string;
  readonly start: Point2;
  readonly end: Point2;
  readonly idSource: RouteIdSource;
  readonly snapToleranceMm?: number;
  readonly widthMm?: number;
}

interface MutableVertex {
  readonly point: Point2;
  readonly parameter: number;
  readonly owners: Set<string>;
  nodeId?: string;
  allocatedNode?: RouteNode;
}

interface EdgeIntersection {
  readonly edge: RouteEdge;
  readonly from: RouteNode;
  readonly to: RouteNode;
  readonly vertex: MutableVertex;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function subtract(left: Point2, right: Point2): Point2 {
  return { x: left.x - right.x, y: left.y - right.y };
}

function cross(left: Point2, right: Point2): number {
  return left.x * right.y - left.y * right.x;
}

function determinantIsZero(
  left: Point2,
  right: Point2,
  determinant = cross(left, right),
): boolean {
  const floatingError = Number.EPSILON * 8 * (
    Math.abs(left.x * right.y) + Math.abs(left.y * right.x) + 1
  );
  return Math.abs(determinant) <= floatingError;
}

function distance(left: Point2, right: Point2): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function clampParameter(parameter: number, segmentLength: number): number {
  if (parameter * segmentLength <= ROUTE_GEOMETRY_EPSILON_MM) return 0;
  if (
    (1 - parameter) * segmentLength <= ROUTE_GEOMETRY_EPSILON_MM
  ) return 1;
  return parameter;
}

function interpolate(start: Point2, end: Point2, parameter: number): Point2 {
  return {
    x: start.x + (end.x - start.x) * parameter,
    y: start.y + (end.y - start.y) * parameter,
  };
}

function canonicalNumber(value: number): string {
  return Object.is(value, -0) ? "0" : String(value);
}

function nearestNode(
  nodes: readonly RouteNode[],
  floorId: string,
  point: Point2,
  toleranceMm: number,
): RouteNode | undefined {
  let best: RouteNode | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of nodes) {
    if (candidate.floorId !== floorId) continue;
    const candidateDistance = distance(candidate.position, point);
    if (candidateDistance > toleranceMm + ROUTE_GEOMETRY_EPSILON_MM) continue;
    if (
      candidateDistance < bestDistance - ROUTE_GEOMETRY_EPSILON_MM
      || (
        Math.abs(candidateDistance - bestDistance) <= ROUTE_GEOMETRY_EPSILON_MM
        && (best === undefined || compareText(candidate.id, best.id) < 0)
      )
    ) {
      best = candidate;
      bestDistance = candidateDistance;
    }
  }
  return best;
}

function hasPositiveCollinearOverlap(
  start: Point2,
  end: Point2,
  segmentLength: number,
  edgeStart: Point2,
  edgeEnd: Point2,
): boolean {
  const routeDelta = subtract(end, start);
  const edgeDelta = subtract(edgeEnd, edgeStart);
  const edgeLength = distance(edgeStart, edgeEnd);
  if (edgeLength <= ROUTE_GEOMETRY_EPSILON_MM) return false;
  const determinant = cross(routeDelta, edgeDelta);
  if (!determinantIsZero(routeDelta, edgeDelta, determinant)) return false;

  const offset = subtract(edgeStart, start);
  if (
    Math.abs(cross(offset, routeDelta)) / segmentLength
      > ROUTE_GEOMETRY_EPSILON_MM
  ) {
    return false;
  }

  const tangent = {
    x: routeDelta.x / segmentLength,
    y: routeDelta.y / segmentLength,
  };
  const edgeStartDistance = offset.x * tangent.x + offset.y * tangent.y;
  const edgeEndOffset = subtract(edgeEnd, start);
  const edgeEndDistance =
    edgeEndOffset.x * tangent.x + edgeEndOffset.y * tangent.y;
  const overlapStart = Math.max(0, Math.min(edgeStartDistance, edgeEndDistance));
  const overlapEnd = Math.min(
    segmentLength,
    Math.max(edgeStartDistance, edgeEndDistance),
  );
  return overlapEnd - overlapStart > ROUTE_GEOMETRY_EPSILON_MM;
}

function addVertex(
  vertices: MutableVertex[],
  point: Point2,
  parameter: number,
  segmentLength: number,
  owner: string,
  nodeId?: string,
): MutableVertex {
  const normalizedParameter = clampParameter(parameter, segmentLength);
  const existing = vertices.find((candidate) =>
    Math.abs(candidate.parameter - normalizedParameter) * segmentLength
      <= ROUTE_GEOMETRY_EPSILON_MM
    && distance(candidate.point, point) <= ROUTE_GEOMETRY_EPSILON_MM);
  if (existing !== undefined) {
    existing.owners.add(owner);
    if (
      nodeId !== undefined
      && (existing.nodeId === undefined || compareText(nodeId, existing.nodeId) < 0)
    ) {
      existing.nodeId = nodeId;
    }
    return existing;
  }
  const created: MutableVertex = {
    point: { x: point.x, y: point.y },
    parameter: normalizedParameter,
    owners: new Set([owner]),
    ...(nodeId === undefined ? {} : { nodeId }),
  };
  vertices.push(created);
  return created;
}

function vertexOrder(left: MutableVertex, right: MutableVertex): number {
  return left.parameter - right.parameter
    || compareText(
      [...left.owners].sort(compareText).join("\u0000"),
      [...right.owners].sort(compareText).join("\u0000"),
    )
    || left.point.x - right.point.x
    || left.point.y - right.point.y;
}

function vertexNodeId(vertex: MutableVertex): string {
  const id = vertex.nodeId ?? vertex.allocatedNode?.id;
  if (id === undefined) throw new Error("Route insertion vertex has no node ID");
  return id;
}

function splitEdge(
  intersection: EdgeIntersection,
  idSource: RouteIdSource,
): readonly RouteEdge[] {
  const junctionId = vertexNodeId(intersection.vertex);
  const firstId = idSource.next(
    "edge",
    "route-edge-split:" + intersection.edge.id + ":0:"
      + intersection.edge.from + "->" + junctionId,
  );
  const secondId = idSource.next(
    "edge",
    "route-edge-split:" + intersection.edge.id + ":1:"
      + junctionId + "->" + intersection.edge.to,
  );
  return [
    {
      ...intersection.edge,
      id: firstId,
      from: intersection.edge.from,
      to: junctionId,
      distance: distance(intersection.from.position, intersection.vertex.point),
    },
    {
      ...intersection.edge,
      id: secondId,
      from: junctionId,
      to: intersection.edge.to,
      distance: distance(intersection.vertex.point, intersection.to.position),
    },
  ];
}

export function insertRouteSegment(
  input: InsertRouteSegmentInput,
): Result<RouteNetwork, RouteMutationError> {
  const snapToleranceMm = input.snapToleranceMm ?? DEFAULT_SNAP_TOLERANCE_MM;
  if (
    !Number.isFinite(snapToleranceMm)
    || snapToleranceMm < MIN_SNAP_TOLERANCE_MM
    || snapToleranceMm > MAX_SNAP_TOLERANCE_MM
  ) {
    throw new RangeError("Route snap tolerance must be within [0.1, 100] mm.");
  }
  const widthMm = input.widthMm ?? DEFAULT_EDGE_WIDTH_MM;
  if (!Number.isFinite(widthMm) || widthMm <= 0) {
    throw new RangeError("Route edge width must be finite and positive.");
  }

  const nodeById = new Map(input.network.nodes.map((candidate) => [candidate.id, candidate]));
  const snappedStart = nearestNode(
    input.network.nodes,
    input.floorId,
    input.start,
    snapToleranceMm,
  );
  const snappedEnd = nearestNode(
    input.network.nodes,
    input.floorId,
    input.end,
    snapToleranceMm,
  );
  const start = snappedStart?.position ?? input.start;
  const end = snappedEnd?.position ?? input.end;
  const segmentLength = distance(start, end);
  if (!Number.isFinite(segmentLength) || segmentLength <= ROUTE_GEOMETRY_EPSILON_MM) {
    return routeFailure({
      code: "ROUTE_ZERO_LENGTH",
      message: "Route segment endpoints resolve to the same position.",
    });
  }

  const vertices: MutableVertex[] = [];
  addVertex(vertices, start, 0, segmentLength, "endpoint:start", snappedStart?.id);
  addVertex(vertices, end, 1, segmentLength, "endpoint:end", snappedEnd?.id);

  const routeDelta = subtract(end, start);
  const sortedNodes = [...input.network.nodes].sort((left, right) =>
    compareText(left.id, right.id));
  for (const candidate of sortedNodes) {
    if (candidate.floorId !== input.floorId) continue;
    const offset = subtract(candidate.position, start);
    const parameter = (
      offset.x * routeDelta.x + offset.y * routeDelta.y
    ) / (segmentLength * segmentLength);
    if (
      parameter * segmentLength <= ROUTE_GEOMETRY_EPSILON_MM
      || (1 - parameter) * segmentLength <= ROUTE_GEOMETRY_EPSILON_MM
    ) {
      continue;
    }
    const projected = interpolate(start, end, parameter);
    if (distance(projected, candidate.position) <= ROUTE_GEOMETRY_EPSILON_MM) {
      addVertex(
        vertices,
        candidate.position,
        parameter,
        segmentLength,
        "node:" + candidate.id,
        candidate.id,
      );
    }
  }

  const intersections: EdgeIntersection[] = [];
  const sortedEdges = [...input.network.edges].sort((left, right) =>
    compareText(left.id, right.id));
  let intersectionChecks = 0;
  for (const edge of sortedEdges) {
    intersectionChecks += 1;
    if (intersectionChecks > MAX_INTERSECTION_CHECKS) {
      return routeFailure({
        code: "ROUTE_COMPLEXITY_LIMIT",
        message: "Route insertion exceeded 100,000 intersection checks.",
      });
    }

    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (
      from === undefined
      || to === undefined
      || from.floorId !== input.floorId
      || to.floorId !== input.floorId
    ) {
      continue;
    }
    if (hasPositiveCollinearOverlap(
      start,
      end,
      segmentLength,
      from.position,
      to.position,
    )) {
      return routeFailure({
        code: "ROUTE_COLLINEAR_OVERLAP",
        message: "Route segment overlaps existing edge " + edge.id + ".",
      });
    }

    const edgeDelta = subtract(to.position, from.position);
    const edgeLength = distance(from.position, to.position);
    if (edgeLength <= ROUTE_GEOMETRY_EPSILON_MM) continue;
    const denominator = cross(routeDelta, edgeDelta);
    if (determinantIsZero(routeDelta, edgeDelta, denominator)) continue;

    const offset = subtract(from.position, start);
    const routeParameter = cross(offset, edgeDelta) / denominator;
    const edgeParameter = cross(offset, routeDelta) / denominator;
    if (
      routeParameter * segmentLength < -ROUTE_GEOMETRY_EPSILON_MM
      || (routeParameter - 1) * segmentLength > ROUTE_GEOMETRY_EPSILON_MM
      || edgeParameter * edgeLength < -ROUTE_GEOMETRY_EPSILON_MM
      || (edgeParameter - 1) * edgeLength > ROUTE_GEOMETRY_EPSILON_MM
    ) {
      continue;
    }

    const normalizedRouteParameter = clampParameter(routeParameter, segmentLength);
    const normalizedEdgeParameter = clampParameter(
      edgeParameter,
      edgeLength,
    );
    const point = interpolate(start, end, normalizedRouteParameter);
    const existingNodeId = normalizedEdgeParameter === 0
      ? from.id
      : normalizedEdgeParameter === 1
        ? to.id
        : undefined;
    const vertex = addVertex(
      vertices,
      point,
      normalizedRouteParameter,
      segmentLength,
      "edge:" + edge.id,
      existingNodeId,
    );
    if (normalizedEdgeParameter > 0 && normalizedEdgeParameter < 1) {
      intersections.push({ edge, from, to, vertex });
    }
  }

  vertices.sort(vertexOrder);
  intersections.sort((left, right) =>
    left.vertex.parameter - right.vertex.parameter
    || compareText(left.edge.id, right.edge.id));
  const intersectionsByVertex = new Map<MutableVertex, EdgeIntersection[]>();
  for (const intersection of intersections) {
    const vertexIntersections = intersectionsByVertex.get(intersection.vertex) ?? [];
    vertexIntersections.push(intersection);
    intersectionsByVertex.set(intersection.vertex, vertexIntersections);
  }

  const splitEdgesById = new Map<string, readonly RouteEdge[]>();
  const insertedEdges: RouteEdge[] = [];
  for (let index = 0; index < vertices.length; index += 1) {
    const vertex = vertices[index]!;
    if (vertex.nodeId === undefined) {
      const ownerKey = [...vertex.owners].sort(compareText).join(",");
      const canonicalKey = [
        "route-node",
        input.floorId,
        canonicalNumber(vertex.point.x) + "," + canonicalNumber(vertex.point.y),
        ownerKey,
      ].join(":");
      const id = input.idSource.next("node", canonicalKey);
      vertex.allocatedNode = {
        id,
        name: "Route node",
        tags: [],
        position: { x: vertex.point.x, y: vertex.point.y },
        floorId: input.floorId,
        kind: "junction",
      };
    }

    for (const intersection of intersectionsByVertex.get(vertex) ?? []) {
      splitEdgesById.set(
        intersection.edge.id,
        splitEdge(intersection, input.idSource),
      );
    }

    if (index === 0) continue;
    const fromVertex = vertices[index - 1]!;
    const from = vertexNodeId(fromVertex);
    const to = vertexNodeId(vertex);
    if (from === to) continue;
    const edgeDistance = distance(fromVertex.point, vertex.point);
    if (edgeDistance <= ROUTE_GEOMETRY_EPSILON_MM) continue;
    const id = input.idSource.next(
      "edge",
      "route-edge-insert:" + input.network.id + ":" + (index - 1)
        + ":" + from + "->" + to,
    );
    insertedEdges.push({
      id,
      name: "Route segment",
      tags: [],
      from,
      to,
      distance: edgeDistance,
      bidirectional: true,
      accessible: true,
      enabled: true,
      width: widthMm,
      weight: 1,
    });
  }

  const emittedExistingEdges: RouteEdge[] = [];
  for (const edge of sortedEdges) {
    const splitEdges = splitEdgesById.get(edge.id);
    if (splitEdges === undefined) {
      emittedExistingEdges.push(edge);
    } else {
      emittedExistingEdges.push(...splitEdges);
    }
  }

  return routeSuccess({
    ...input.network,
    nodes: [
      ...input.network.nodes,
      ...vertices.flatMap((vertex) =>
        vertex.allocatedNode === undefined ? [] : [vertex.allocatedNode]),
    ],
    edges: [...emittedExistingEdges, ...insertedEdges],
  });
}
