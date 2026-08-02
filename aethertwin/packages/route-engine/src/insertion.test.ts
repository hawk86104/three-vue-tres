import type { Point2, RouteEdge, RouteNetwork, RouteNode } from "@aethertwin/core-model";
import { describe, expect, test } from "vitest";
import {
  insertRouteSegment,
  type Result,
  type RouteIdSource,
  type RouteMutationError,
} from "./index";

const FLOOR_ID = "00000000-0000-4000-8000-000000000001";
const NETWORK_ID = "00000000-0000-4000-8000-000000000002";

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function node(id: string, x: number, y: number): RouteNode {
  return {
    id,
    name: `Node ${id}`,
    tags: [],
    position: { x, y },
    floorId: FLOOR_ID,
    kind: "junction",
  };
}

function edge(
  id: string,
  from: RouteNode,
  to: RouteNode,
  overrides: Partial<RouteEdge> = {},
): RouteEdge {
  return {
    id,
    name: `Edge ${id}`,
    tags: [],
    from: from.id,
    to: to.id,
    distance: Math.hypot(to.position.x - from.position.x, to.position.y - from.position.y),
    bidirectional: true,
    accessible: true,
    enabled: true,
    width: 1200,
    weight: 1,
    ...overrides,
  };
}

function network(
  nodes: readonly RouteNode[] = [],
  edges: readonly RouteEdge[] = [],
): RouteNetwork {
  return {
    id: NETWORK_ID,
    name: "Network",
    tags: ["durable"],
    nodes,
    edges,
  };
}

class RecordingIdSource implements RouteIdSource {
  readonly calls: { readonly kind: "node" | "edge"; readonly canonicalKey: string }[] = [];
  #ids: string[];

  constructor(ids: readonly string[]) {
    this.#ids = [...ids];
  }

  next(kind: "node" | "edge", canonicalKey: string): string {
    this.calls.push({ kind, canonicalKey });
    const id = this.#ids.shift();
    if (id === undefined) throw new Error(`unexpected ${kind} allocation for ${canonicalKey}`);
    return id;
  }
}

function valueOf<T>(result: Result<T, RouteMutationError>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

function errorOf<T>(result: Result<T, RouteMutationError>): RouteMutationError {
  if (result.ok) throw new Error("expected route mutation failure");
  return result.error;
}

function findNodeAt(nodes: readonly RouteNode[], point: Point2): RouteNode {
  const match = nodes.find(
    (candidate) => candidate.position.x === point.x && candidate.position.y === point.y,
  );
  if (match === undefined) throw new Error(`missing node at ${point.x},${point.y}`);
  return match;
}

function connected(edge: RouteEdge, first: string, second: string): boolean {
  return (
    (edge.from === first && edge.to === second)
    || (edge.bidirectional && edge.from === second && edge.to === first)
  );
}

describe("insertRouteSegment", () => {
  test("creates deterministic endpoints and one edge with M2 defaults", () => {
    const original = network();
    const source = new RecordingIdSource([uuid(10), uuid(11), uuid(12)]);

    const result = valueOf(insertRouteSegment({
      network: original,
      floorId: FLOOR_ID,
      start: { x: 0, y: 0 },
      end: { x: 3000, y: 4000 },
      idSource: source,
    }));

    expect(original).toEqual(network());
    expect(result).not.toBe(original);
    expect(result.id).toBe(original.id);
    expect(result.name).toBe(original.name);
    expect(result.tags).toEqual(original.tags);
    expect(result.nodes.map((candidate) => candidate.position)).toEqual([
      { x: 0, y: 0 },
      { x: 3000, y: 4000 },
    ]);
    expect(result.nodes.every((candidate) => candidate.kind === "junction")).toBe(true);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({
      distance: 5000,
      bidirectional: true,
      accessible: true,
      enabled: true,
      width: 1200,
      weight: 1,
      tags: [],
    });
    expect(source.calls.map((call) => call.kind)).toEqual(["node", "node", "edge"]);
    expect(new Set(source.calls.map((call) => call.canonicalKey)).size).toBe(3);
  });

  test("snaps an endpoint at the default tolerance and allocates no duplicate node", () => {
    const existing = node(uuid(20), 3, 4);
    const original = network([existing]);
    const source = new RecordingIdSource([uuid(21), uuid(22)]);

    const result = valueOf(insertRouteSegment({
      network: original,
      floorId: FLOOR_ID,
      start: { x: 0, y: 0 },
      end: { x: 1000, y: 0 },
      idSource: source,
    }));

    expect(result.nodes.filter((candidate) => candidate.id === existing.id)).toEqual([existing]);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]?.from).toBe(existing.id);
    expect(source.calls.map((call) => call.kind)).toEqual(["node", "edge"]);
  });

  test("turns an endpoint on an edge interior into a connected T-junction", () => {
    const left = node(uuid(30), 0, 0);
    const right = node(uuid(31), 1000, 0);
    const main = edge(uuid(32), left, right);
    const original = network([left, right], [main]);
    const source = new RecordingIdSource(Array.from({ length: 8 }, (_, index) => uuid(40 + index)));

    const result = valueOf(insertRouteSegment({
      network: original,
      floorId: FLOOR_ID,
      start: { x: 500, y: 500 },
      end: { x: 500, y: 0 },
      idSource: source,
      widthMm: 900,
    }));

    const junction = findNodeAt(result.nodes, { x: 500, y: 0 });
    const branch = findNodeAt(result.nodes, { x: 500, y: 500 });
    expect(result.nodes).toHaveLength(4);
    expect(result.edges).toHaveLength(3);
    expect(result.edges.some((candidate) => connected(candidate, left.id, junction.id))).toBe(true);
    expect(result.edges.some((candidate) => connected(candidate, junction.id, right.id))).toBe(true);
    expect(result.edges.some((candidate) => connected(candidate, branch.id, junction.id))).toBe(true);
    expect(
      result.edges.find((candidate) => connected(candidate, branch.id, junction.id))?.width,
    ).toBe(900);
  });

  test("splits a proper crossing and preserves every property of the existing edge", () => {
    const left = node(uuid(50), 0, 0);
    const right = node(uuid(51), 1000, 0);
    const main = edge(uuid(52), left, right, {
      name: "Main aisle",
      tags: ["preserve"],
      bidirectional: false,
      accessible: false,
      enabled: false,
      width: 800,
      weight: 3,
    });
    const original = network([left, right], [main]);
    const source = new RecordingIdSource(Array.from({ length: 10 }, (_, index) => uuid(60 + index)));

    const result = valueOf(insertRouteSegment({
      network: original,
      floorId: FLOOR_ID,
      start: { x: 500, y: -500 },
      end: { x: 500, y: 500 },
      idSource: source,
    }));

    const crossing = findNodeAt(result.nodes, { x: 500, y: 0 });
    const preserved = result.edges.filter((candidate) => candidate.name === main.name);
    expect(result.nodes).toHaveLength(5);
    expect(result.edges).toHaveLength(4);
    expect(preserved).toHaveLength(2);
    for (const candidate of preserved) {
      expect(candidate).toMatchObject({
        name: main.name,
        tags: main.tags,
        bidirectional: main.bidirectional,
        accessible: main.accessible,
        enabled: main.enabled,
        width: main.width,
        weight: main.weight,
      });
    }
    expect(result.edges.filter((candidate) => candidate.from === crossing.id || candidate.to === crossing.id)).toHaveLength(4);
  });

  test("sorts multiple crossings canonically before consuming IDs", () => {
    const lowerLeft = node(uuid(70), 0, 0);
    const lowerRight = node(uuid(71), 1000, 0);
    const upperLeft = node(uuid(72), 0, 1000);
    const upperRight = node(uuid(73), 1000, 1000);
    const lower = edge(uuid(75), lowerLeft, lowerRight);
    const upper = edge(uuid(74), upperLeft, upperRight);
    const nodes = [lowerLeft, lowerRight, upperLeft, upperRight];
    const ids = Array.from({ length: 20 }, (_, index) => uuid(100 + index));
    const firstSource = new RecordingIdSource(ids);
    const secondSource = new RecordingIdSource(ids);
    const input = {
      floorId: FLOOR_ID,
      start: { x: 500, y: -500 },
      end: { x: 500, y: 1500 },
    } as const;

    const first = valueOf(insertRouteSegment({
      ...input,
      network: network(nodes, [upper, lower]),
      idSource: firstSource,
    }));
    const second = valueOf(insertRouteSegment({
      ...input,
      network: network(nodes, [lower, upper]),
      idSource: secondSource,
    }));

    expect(first.nodes).toHaveLength(8);
    expect(first.edges).toHaveLength(7);
    expect(findNodeAt(first.nodes, { x: 500, y: 0 })).toBeDefined();
    expect(findNodeAt(first.nodes, { x: 500, y: 1000 })).toBeDefined();
    expect(firstSource.calls).toEqual(secondSource.calls);
    const lowerCallIndices = firstSource.calls.flatMap((call, index) =>
      call.canonicalKey.includes(lower.id) ? [index] : []);
    const upperCallIndices = firstSource.calls.flatMap((call, index) =>
      call.canonicalKey.includes(upper.id) ? [index] : []);
    expect(Math.max(...lowerCallIndices)).toBeLessThan(Math.min(...upperCallIndices));
    expect(firstSource.calls.every((call) => call.canonicalKey.trim().length > 0)).toBe(true);
    expect(second.nodes.map((candidate) => candidate.id).sort()).toEqual(
      first.nodes.map((candidate) => candidate.id).sort(),
    );
  });

  test("connects an explicit crossing at an extremely small nonzero angle", () => {
    const diagonalStart = node(uuid(150), -1_000_000_000, -50);
    const diagonalEnd = node(uuid(151), 1_000_000_000, 50);
    const diagonal = edge(uuid(152), diagonalStart, diagonalEnd);
    const source = new RecordingIdSource(
      Array.from({ length: 10 }, (_, index) => uuid(153 + index)),
    );

    const result = valueOf(insertRouteSegment({
      network: network([diagonalStart, diagonalEnd], [diagonal]),
      floorId: FLOOR_ID,
      start: { x: -1_000_000_000, y: 0 },
      end: { x: 1_000_000_000, y: 0 },
      idSource: source,
    }));

    const crossing = findNodeAt(result.nodes, { x: 0, y: 0 });
    expect(result.nodes).toHaveLength(5);
    expect(result.edges).toHaveLength(4);
    expect(result.edges.filter((candidate) =>
      candidate.from === crossing.id || candidate.to === crossing.id)).toHaveLength(4);
  });

  test("uses physical epsilon for intersections near endpoints of very long segments", () => {
    const verticalStart = node(uuid(110), 0, 0);
    const verticalEnd = node(uuid(111), 0, 1_000_000_000);
    const vertical = edge(uuid(112), verticalStart, verticalEnd);
    const source = new RecordingIdSource(
      Array.from({ length: 10 }, (_, index) => uuid(113 + index)),
    );

    const result = valueOf(insertRouteSegment({
      network: network([verticalStart, verticalEnd], [vertical]),
      floorId: FLOOR_ID,
      start: { x: -1_000_000_000, y: 50 },
      end: { x: 1_000_000_000, y: 50 },
      idSource: source,
    }));

    const crossing = findNodeAt(result.nodes, { x: 0, y: 50 });
    expect(crossing.id).not.toBe(verticalStart.id);
    expect(result.edges.some((candidate) =>
      connected(candidate, verticalStart.id, crossing.id)
      && candidate.distance === 50)).toBe(true);
    expect(result.edges.every((candidate) => candidate.distance > 0)).toBe(true);
  });

  test("retains an exact interior node near the endpoint of a very long insertion", () => {
    const interior = node(uuid(125), 50, 0);
    const source = new RecordingIdSource(
      Array.from({ length: 5 }, (_, index) => uuid(126 + index)),
    );

    const result = valueOf(insertRouteSegment({
      network: network([interior]),
      floorId: FLOOR_ID,
      start: { x: 0, y: 0 },
      end: { x: 1_000_000_000, y: 0 },
      idSource: source,
    }));

    expect(result.nodes.filter((candidate) => candidate.id === interior.id)).toHaveLength(1);
    expect(result.edges).toHaveLength(2);
    expect(result.edges.filter((candidate) =>
      candidate.from === interior.id || candidate.to === interior.id)).toHaveLength(2);
  });

  test("allows a collinear extension that only touches an existing endpoint", () => {
    const left = node(uuid(120), 0, 0);
    const right = node(uuid(121), 1000, 0);
    const existing = edge(uuid(122), left, right);
    const original = network([left, right], [existing]);
    const source = new RecordingIdSource([uuid(123), uuid(124)]);

    const result = valueOf(insertRouteSegment({
      network: original,
      floorId: FLOOR_ID,
      start: { x: 1000, y: 0 },
      end: { x: 1500, y: 0 },
      idSource: source,
    }));

    const extension = findNodeAt(result.nodes, { x: 1500, y: 0 });
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
    expect(result.edges).toContainEqual(existing);
    expect(result.edges.some((candidate) => connected(candidate, right.id, extension.id))).toBe(
      true,
    );
    expect(source.calls.map((call) => call.kind)).toEqual(["node", "edge"]);
  });

  test("rejects positive collinear overlap and zero length without mutation or IDs", () => {
    const left = node(uuid(130), 0, 0);
    const right = node(uuid(131), 1000, 0);
    const original = network([left, right], [edge(uuid(132), left, right)]);
    const overlapSource = new RecordingIdSource([uuid(133)]);
    const zeroSource = new RecordingIdSource([uuid(134)]);

    const overlap = errorOf(insertRouteSegment({
      network: original,
      floorId: FLOOR_ID,
      start: { x: 250, y: 0 },
      end: { x: 750, y: 0 },
      idSource: overlapSource,
    }));
    const zero = errorOf(insertRouteSegment({
      network: original,
      floorId: FLOOR_ID,
      start: { x: -1, y: 0 },
      end: { x: 1, y: 0 },
      idSource: zeroSource,
    }));

    expect(overlap.code).toBe("ROUTE_COLLINEAR_OVERLAP");
    expect(zero.code).toBe("ROUTE_ZERO_LENGTH");
    expect(overlapSource.calls).toEqual([]);
    expect(zeroSource.calls).toEqual([]);
    expect(original).toEqual(network([left, right], [edge(uuid(132), left, right)]));
  });

  test("aborts after 100,000 intersection checks before allocating any ID", { timeout: 30_000 }, () => {
    const nodes: RouteNode[] = [];
    const edges: RouteEdge[] = [];
    for (let index = 0; index < 100_001; index += 1) {
      const from = node(uuid(200_000 + index * 3), index * 20, 100);
      const to = node(uuid(200_001 + index * 3), index * 20, 110);
      nodes.push(from, to);
      edges.push(edge(uuid(200_002 + index * 3), from, to));
    }
    const original = network(nodes, edges);
    const source = new RecordingIdSource([uuid(900_000)]);

    const failure = errorOf(insertRouteSegment({
      network: original,
      floorId: FLOOR_ID,
      start: { x: -10, y: 0 },
      end: { x: 2_000_010, y: 0 },
      idSource: source,
    }));

    expect(failure.code).toBe("ROUTE_COMPLEXITY_LIMIT");
    expect(source.calls).toEqual([]);
    expect(original.nodes).toBe(nodes);
    expect(original.edges).toBe(edges);
  });
});
