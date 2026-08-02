import type {
  GuidedRoute,
  Point2,
  RouteEdge,
  RouteNetwork,
  RouteNode,
} from "@aethertwin/core-model";
import { routeFailure, routeSuccess, type Result } from "./result";

const COST_TIE_EPSILON = 1e-9;

export interface ResolvedRoute {
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly totalDistance: number;
  readonly turnPoints: readonly Point2[];
}

export interface NoRouteError {
  readonly code: "NO_ROUTE";
  readonly fromStopId: string;
  readonly toStopId: string;
  readonly pairIndex: number;
}

interface PreciseCost {
  readonly high: number;
  readonly low: number;
}

interface Arc {
  readonly edge: RouteEdge;
  readonly toNodeId: string;
  readonly cost: PreciseCost;
}

interface RouteGraph {
  readonly forward: ReadonlyMap<string, readonly Arc[]>;
  readonly reverse: ReadonlyMap<string, readonly Arc[]>;
}

interface DistanceState {
  readonly nodeId: string;
  readonly cost: PreciseCost;
}

class MinHeap<T> {
  readonly #compare: (left: T, right: T) => number;
  readonly #values: T[] = [];

  constructor(compare: (left: T, right: T) => number) {
    this.#compare = compare;
  }

  get size(): number {
    return this.#values.length;
  }

  push(value: T): void {
    this.#values.push(value);
    let index = this.#values.length - 1;
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.#compare(this.#values[parentIndex]!, value) <= 0) break;
      this.#values[index] = this.#values[parentIndex]!;
      index = parentIndex;
    }
    this.#values[index] = value;
  }

  pop(): T | undefined {
    const first = this.#values[0];
    const last = this.#values.pop();
    if (first === undefined || last === undefined || this.#values.length === 0) {
      return first;
    }

    let index = 0;
    while (true) {
      const leftIndex = index * 2 + 1;
      if (leftIndex >= this.#values.length) break;
      const rightIndex = leftIndex + 1;
      let childIndex = leftIndex;
      if (
        rightIndex < this.#values.length
        && this.#compare(
          this.#values[rightIndex]!,
          this.#values[leftIndex]!,
        ) < 0
      ) {
        childIndex = rightIndex;
      }
      if (this.#compare(last, this.#values[childIndex]!) <= 0) break;
      this.#values[index] = this.#values[childIndex]!;
      index = childIndex;
    }
    this.#values[index] = last;
    return first;
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function twoSum(left: number, right: number): PreciseCost {
  const high = left + right;
  const rightVirtual = high - left;
  const low = (left - (high - rightVirtual)) + (right - rightVirtual);
  return { high, low };
}

function preciseCost(value: number): PreciseCost {
  return { high: value, low: 0 };
}

function addCosts(left: PreciseCost, right: PreciseCost): PreciseCost {
  const highParts = twoSum(left.high, right.high);
  const lowParts = twoSum(left.low, right.low);
  const middle = twoSum(highParts.low, lowParts.high);
  const combined = twoSum(highParts.high, middle.high);
  return twoSum(
    combined.high,
    combined.low + middle.low + lowParts.low,
  );
}

function compareCosts(left: PreciseCost, right: PreciseCost): number {
  const difference = addCosts(left, {
    high: -right.high,
    low: -right.low,
  });
  if (difference.high !== 0) return difference.high < 0 ? -1 : 1;
  if (difference.low !== 0) return difference.low < 0 ? -1 : 1;
  return 0;
}

function finiteCost(cost: PreciseCost): boolean {
  return Number.isFinite(cost.high) && Number.isFinite(cost.low);
}

function compareDistance(left: DistanceState, right: DistanceState): number {
  return compareCosts(left.cost, right.cost)
    || compareText(left.nodeId, right.nodeId);
}

function noRoute(
  fromStopId: string,
  toStopId: string,
  pairIndex: number,
): Result<never, NoRouteError> {
  return routeFailure({
    code: "NO_ROUTE",
    fromStopId,
    toStopId,
    pairIndex,
  });
}

function determinantIsZero(left: Point2, right: Point2): boolean {
  const determinant = left.x * right.y - left.y * right.x;
  const floatingError = Number.EPSILON * 8 * (
    Math.abs(left.x * right.y) + Math.abs(left.y * right.x) + 1
  );
  return Math.abs(determinant) <= floatingError;
}

function extractTurnPoints(
  nodeIds: readonly string[],
  nodeById: ReadonlyMap<string, RouteNode>,
): readonly Point2[] {
  const points = nodeIds.flatMap((nodeId) => {
    const point = nodeById.get(nodeId)?.position;
    return point === undefined ? [] : [{ x: point.x, y: point.y }];
  });
  if (points.length <= 2) return points;

  const turns: Point2[] = [points[0]!];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const next = points[index + 1]!;
    const incoming = {
      x: current.x - previous.x,
      y: current.y - previous.y,
    };
    const outgoing = {
      x: next.x - current.x,
      y: next.y - current.y,
    };
    const continuesForward =
      incoming.x * outgoing.x + incoming.y * outgoing.y > 0;
    if (!determinantIsZero(incoming, outgoing) || !continuesForward) {
      turns.push(current);
    }
  }
  turns.push(points.at(-1)!);
  return turns;
}

function addArc(
  adjacency: Map<string, Arc[]>,
  fromNodeId: string,
  toNodeId: string,
  edge: RouteEdge,
  cost: PreciseCost,
): void {
  adjacency.get(fromNodeId)!.push({ edge, toNodeId, cost });
}

function sortAdjacency(adjacency: Map<string, Arc[]>): void {
  for (const arcs of adjacency.values()) {
    arcs.sort((left, right) =>
      compareText(left.toNodeId, right.toNodeId)
      || compareText(left.edge.id, right.edge.id));
  }
}

function buildGraph(network: RouteNetwork): RouteGraph {
  const nodeIds = new Set(network.nodes.map((node) => node.id));
  const forward = new Map<string, Arc[]>();
  const reverse = new Map<string, Arc[]>();
  for (const nodeId of nodeIds) {
    forward.set(nodeId, []);
    reverse.set(nodeId, []);
  }

  for (const edge of network.edges) {
    const numericCost = edge.distance * edge.weight;
    if (
      !edge.enabled
      || !nodeIds.has(edge.from)
      || !nodeIds.has(edge.to)
      || !Number.isFinite(edge.distance)
      || edge.distance <= 0
      || !Number.isFinite(edge.weight)
      || edge.weight < 1
      || !Number.isFinite(numericCost)
    ) {
      continue;
    }
    const cost = preciseCost(numericCost);
    addArc(forward, edge.from, edge.to, edge, cost);
    addArc(reverse, edge.to, edge.from, edge, cost);
    if (edge.bidirectional) {
      addArc(forward, edge.to, edge.from, edge, cost);
      addArc(reverse, edge.from, edge.to, edge, cost);
    }
  }

  sortAdjacency(forward);
  sortAdjacency(reverse);
  return { forward, reverse };
}

function shortestCostsToTarget(
  reverse: ReadonlyMap<string, readonly Arc[]>,
  targetNodeId: string,
): ReadonlyMap<string, PreciseCost> {
  const zero = preciseCost(0);
  const distances = new Map<string, PreciseCost>([[targetNodeId, zero]]);
  const queue = new MinHeap<DistanceState>(compareDistance);
  queue.push({ nodeId: targetNodeId, cost: zero });

  while (queue.size > 0) {
    const current = queue.pop()!;
    if (distances.get(current.nodeId) !== current.cost) continue;
    for (const arc of reverse.get(current.nodeId) ?? []) {
      const candidateCost = addCosts(current.cost, arc.cost);
      if (!finiteCost(candidateCost)) continue;
      const existingCost = distances.get(arc.toNodeId);
      if (
        existingCost !== undefined
        && compareCosts(candidateCost, existingCost) >= 0
      ) {
        continue;
      }
      distances.set(arc.toNodeId, candidateCost);
      queue.push({ nodeId: arc.toNodeId, cost: candidateCost });
    }
  }

  return distances;
}

function withinCanonicalCostBand(
  candidateCost: PreciseCost,
  shortestCost: PreciseCost,
): boolean {
  const upperBound = addCosts(
    shortestCost,
    preciseCost(COST_TIE_EPSILON),
  );
  return compareCosts(candidateCost, upperBound) <= 0;
}

function resolvePair(
  network: RouteNetwork,
  fromNodeId: string,
  toNodeId: string,
  pairIndex: number,
): Result<ResolvedRoute, NoRouteError> {
  const nodeById = new Map(network.nodes.map((node) => [node.id, node]));
  if (!nodeById.has(fromNodeId) || !nodeById.has(toNodeId)) {
    return noRoute(fromNodeId, toNodeId, pairIndex);
  }

  const graph = buildGraph(network);
  const distancesToTarget = shortestCostsToTarget(graph.reverse, toNodeId);
  const shortestCost = distancesToTarget.get(fromNodeId);
  if (shortestCost === undefined) {
    return noRoute(fromNodeId, toNodeId, pairIndex);
  }

  const nodeIds = [fromNodeId];
  const edgeIds: string[] = [];
  const visited = new Set([fromNodeId]);
  let currentNodeId = fromNodeId;
  let accumulatedCost = preciseCost(0);
  let totalDistance = 0;

  while (currentNodeId !== toNodeId) {
    const nextArc = (graph.forward.get(currentNodeId) ?? []).find((arc) => {
      if (visited.has(arc.toNodeId) && arc.toNodeId !== toNodeId) return false;
      const remainingCost = distancesToTarget.get(arc.toNodeId);
      if (remainingCost === undefined) return false;
      const candidateCost = addCosts(
        addCosts(accumulatedCost, arc.cost),
        remainingCost,
      );
      return finiteCost(candidateCost)
        && withinCanonicalCostBand(candidateCost, shortestCost);
    });
    if (nextArc === undefined) {
      return noRoute(fromNodeId, toNodeId, pairIndex);
    }

    accumulatedCost = addCosts(accumulatedCost, nextArc.cost);
    const nextTotalDistance = totalDistance + nextArc.edge.distance;
    if (!finiteCost(accumulatedCost) || !Number.isFinite(nextTotalDistance)) {
      return noRoute(fromNodeId, toNodeId, pairIndex);
    }
    totalDistance = nextTotalDistance;
    edgeIds.push(nextArc.edge.id);
    nodeIds.push(nextArc.toNodeId);
    currentNodeId = nextArc.toNodeId;
    visited.add(currentNodeId);
    if (nodeIds.length > network.nodes.length + 1) {
      return noRoute(fromNodeId, toNodeId, pairIndex);
    }
  }

  return routeSuccess({
    nodeIds,
    edgeIds,
    totalDistance,
    turnPoints: extractTurnPoints(nodeIds, nodeById),
  });
}

export function resolveRoute(
  network: RouteNetwork,
  fromNodeId: string,
  toNodeId: string,
): Result<ResolvedRoute, NoRouteError> {
  return resolvePair(network, fromNodeId, toNodeId, 0);
}

export function resolveGuidedRoute(
  network: RouteNetwork,
  route: GuidedRoute,
): Result<ResolvedRoute, NoRouteError> {
  if (route.stopNodeIds.length < 2) {
    const stopId = route.stopNodeIds[0] ?? "";
    return noRoute(stopId, stopId, 0);
  }

  const nodeIds: string[] = [];
  const edgeIds: string[] = [];
  let totalDistance = 0;
  for (let pairIndex = 0; pairIndex < route.stopNodeIds.length - 1; pairIndex += 1) {
    const fromStopId = route.stopNodeIds[pairIndex]!;
    const toStopId = route.stopNodeIds[pairIndex + 1]!;
    const pair = resolvePair(network, fromStopId, toStopId, pairIndex);
    if (!pair.ok) return pair;
    nodeIds.push(...(pairIndex === 0 ? pair.value.nodeIds : pair.value.nodeIds.slice(1)));
    edgeIds.push(...pair.value.edgeIds);
    const nextTotalDistance = totalDistance + pair.value.totalDistance;
    if (!Number.isFinite(nextTotalDistance)) {
      return noRoute(fromStopId, toStopId, pairIndex);
    }
    totalDistance = nextTotalDistance;
  }

  const nodeById = new Map(network.nodes.map((node) => [node.id, node]));
  return routeSuccess({
    nodeIds,
    edgeIds,
    totalDistance,
    turnPoints: extractTurnPoints(nodeIds, nodeById),
  });
}
