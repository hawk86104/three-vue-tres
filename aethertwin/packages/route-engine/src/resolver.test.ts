import type {
  GuidedRoute,
  Point2,
  RouteEdge,
  RouteNetwork,
  RouteNode,
} from "@aethertwin/core-model";
import { describe, expect, test } from "vitest";
import {
  resolveGuidedRoute,
  resolveRoute,
  type NoRouteError,
  type Result,
  type ResolvedRoute,
} from "./index";

const FLOOR_ID = "00000000-0000-4000-8000-000000000001";
const NETWORK_ID = "00000000-0000-4000-8000-000000000002";

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function node(index: number, x: number, y: number): RouteNode {
  return {
    id: uuid(index),
    name: `Node ${index}`,
    tags: [],
    position: { x, y },
    floorId: FLOOR_ID,
    kind: "junction",
  };
}

function edge(
  index: number,
  from: RouteNode,
  to: RouteNode,
  overrides: Partial<RouteEdge> = {},
): RouteEdge {
  return {
    id: uuid(index),
    name: `Edge ${index}`,
    tags: [],
    from: from.id,
    to: to.id,
    distance: Math.hypot(
      to.position.x - from.position.x,
      to.position.y - from.position.y,
    ),
    bidirectional: true,
    accessible: true,
    enabled: true,
    width: 1200,
    weight: 1,
    ...overrides,
  };
}

function network(
  nodes: readonly RouteNode[],
  edges: readonly RouteEdge[],
): RouteNetwork {
  return {
    id: NETWORK_ID,
    name: "Resolver network",
    tags: [],
    nodes,
    edges,
  };
}

function guidedRoute(stopNodeIds: readonly string[]): GuidedRoute {
  return {
    id: uuid(900),
    name: "Guided route",
    tags: [],
    routeNetworkId: NETWORK_ID,
    stopNodeIds,
  };
}

function valueOf(
  result: Result<ResolvedRoute, NoRouteError>,
): ResolvedRoute {
  if (!result.ok) throw new Error(`NO_ROUTE: ${result.error.fromStopId}`);
  return result.value;
}

function errorOf(
  result: Result<ResolvedRoute, NoRouteError>,
): NoRouteError {
  if (result.ok) throw new Error("expected NO_ROUTE");
  return result.error;
}

function positions(...nodes: readonly RouteNode[]): readonly Point2[] {
  return nodes.map((candidate) => candidate.position);
}

describe("resolveRoute", () => {
  test("traverses bidirectional edges both ways and directed edges only forward", () => {
    const a = node(10, 0, 0);
    const b = node(11, 10, 0);
    const c = node(12, 20, 0);
    const ab = edge(20, a, b);
    const bc = edge(21, b, c, { bidirectional: false });
    const graph = network([a, b, c], [bc, ab]);

    const forward = valueOf(resolveRoute(graph, a.id, c.id));
    const reverseBidirectional = valueOf(resolveRoute(graph, b.id, a.id));
    const reverseDirected = errorOf(resolveRoute(graph, c.id, a.id));

    expect(forward.nodeIds).toEqual([a.id, b.id, c.id]);
    expect(forward.edgeIds).toEqual([ab.id, bc.id]);
    expect(forward.totalDistance).toBe(20);
    expect(reverseBidirectional.nodeIds).toEqual([b.id, a.id]);
    expect(reverseDirected).toEqual({
      code: "NO_ROUTE",
      fromStopId: c.id,
      toStopId: a.id,
      pairIndex: 0,
    });
  });

  test("ignores disabled edges and minimizes distance multiplied by weight", () => {
    const a = node(30, 0, 0);
    const b = node(31, 3, 4);
    const d = node(32, 6, 0);
    const shortcut = node(33, 3, 0);
    const direct = edge(40, a, d, { weight: 2 });
    const ab = edge(41, a, b);
    const bd = edge(42, b, d);
    const disabled = edge(43, a, shortcut, { enabled: false });
    const shortcutEnd = edge(44, shortcut, d);
    const graph = network(
      [a, b, d, shortcut],
      [direct, disabled, shortcutEnd, bd, ab],
    );

    const resolved = valueOf(resolveRoute(graph, a.id, d.id));

    expect(resolved.nodeIds).toEqual([a.id, b.id, d.id]);
    expect(resolved.edgeIds).toEqual([ab.id, bd.id]);
    expect(resolved.totalDistance).toBe(10);
    expect(resolved.turnPoints).toEqual(positions(a, b, d));
  });

  test("breaks equal-cost ties by destination node then edge UUID", () => {
    const a = node(50, 0, 0);
    const preferred = node(51, 1, 1);
    const alternate = node(52, 1, -1);
    const d = node(53, 2, 0);
    const preferredStart = edge(70, a, preferred, {
      distance: Math.SQRT2 + 5e-10,
    });
    const preferredEnd = edge(71, preferred, d);
    const alternateStart = edge(60, a, alternate);
    const alternateEnd = edge(61, alternate, d);
    const graph = network(
      [d, alternate, preferred, a],
      [alternateEnd, preferredEnd, alternateStart, preferredStart],
    );

    const resolved = valueOf(resolveRoute(graph, a.id, d.id));

    expect(resolved.nodeIds).toEqual([a.id, preferred.id, d.id]);
    expect(resolved.edgeIds).toEqual([preferredStart.id, preferredEnd.id]);

    const outsideBand = edge(80, a, preferred, {
      distance: Math.SQRT2 + 1.5e-9,
    });
    const canonicalInBand = edge(81, a, preferred, {
      distance: Math.SQRT2 + 0.75e-9,
    });
    const exactCheapest = edge(82, a, preferred);
    const firstParallel = valueOf(resolveRoute(
      network([a, preferred], [exactCheapest, outsideBand, canonicalInBand]),
      a.id,
      preferred.id,
    ));
    const secondParallel = valueOf(resolveRoute(
      network([preferred, a], [canonicalInBand, outsideBand, exactCheapest]),
      a.id,
      preferred.id,
    ));
    expect(firstParallel.edgeIds).toEqual([canonicalInBand.id]);
    expect(secondParallel.edgeIds).toEqual(firstParallel.edgeIds);
  });

  test("terminates on cycles and returns a simple canonical shortest path", () => {
    const a = node(90, 0, 0);
    const b = node(91, 10, 10);
    const c = node(92, 20, 0);
    const d = node(93, 30, 0);
    const ab = edge(100, a, b);
    const bc = edge(101, b, c);
    const ca = edge(102, c, a);
    const cd = edge(103, c, d);
    const graph = network([a, b, c, d], [ca, cd, bc, ab]);

    const resolved = valueOf(resolveRoute(graph, a.id, d.id));

    expect(resolved.nodeIds).toEqual([a.id, c.id, d.id]);
    expect(resolved.edgeIds).toEqual([ca.id, cd.id]);
    expect(new Set(resolved.nodeIds).size).toBe(resolved.nodeIds.length);
  });

  test("keeps the fixed 1e-9 band at billion-scale route costs", () => {
    const a = node(200, 0, 0);
    const canonicalDetour = node(201, 500_000_000, 32);
    const target = node(202, 1_000_000_000, 0);
    const direct = edge(210, a, target);
    const detourStart = edge(211, a, canonicalDetour);
    const detourEnd = edge(212, canonicalDetour, target);
    const graph = network(
      [target, canonicalDetour, a],
      [detourEnd, direct, detourStart],
    );

    expect(
      detourStart.distance + detourEnd.distance - direct.distance,
    ).toBeGreaterThan(1e-6);
    const resolved = valueOf(resolveRoute(graph, a.id, target.id));

    expect(resolved.nodeIds).toEqual([a.id, target.id]);
    expect(resolved.edgeIds).toEqual([direct.id]);
  });

  test("preserves sub-ULP chain costs when selecting the true shortest path", () => {
    const a = node(220, 0, 0);
    const canonical = node(221, 1, 0);
    const canonicalMid = node(222, 2, 0);
    const alternate = node(223, 3, 0);
    const target = node(224, 4, 0);
    const huge = 9_000_000_000_000_000;
    const graph = network(
      [a, canonical, canonicalMid, alternate, target],
      [
        edge(230, a, canonical, { distance: huge }),
        edge(231, canonical, canonicalMid, { distance: 0.25 }),
        edge(232, canonicalMid, target, { distance: 0.25 }),
        edge(233, a, alternate, { distance: huge }),
        edge(234, alternate, target, { distance: 0.25 }),
      ],
    );

    const resolved = valueOf(resolveRoute(graph, a.id, target.id));

    expect(resolved.nodeIds).toEqual([a.id, alternate.id, target.id]);
    expect(resolved.edgeIds).toEqual([uuid(233), uuid(234)]);
  });

  test("returns NO_ROUTE when individually finite arc costs overflow cumulatively", () => {
    const a = node(240, 0, 0);
    const b = node(241, 1, 0);
    const c = node(242, 2, 0);
    const large = Number.MAX_VALUE * 0.75;
    const graph = network(
      [a, b, c],
      [
        edge(243, a, b, { distance: large }),
        edge(244, b, c, { distance: large }),
      ],
    );

    expect(errorOf(resolveRoute(graph, a.id, c.id))).toEqual({
      code: "NO_ROUTE",
      fromStopId: a.id,
      toStopId: c.id,
      pairIndex: 0,
    });
    expect(errorOf(resolveGuidedRoute(
      graph,
      guidedRoute([a.id, b.id, c.id]),
    ))).toEqual({
      code: "NO_ROUTE",
      fromStopId: b.id,
      toStopId: c.id,
      pairIndex: 1,
    });
  });

  test("returns the exact pair for disconnected and missing endpoints without mutation", () => {
    const a = node(110, 0, 0);
    const b = node(111, 10, 0);
    const isolated = node(112, 20, 0);
    const ab = edge(113, a, b);
    const graph = network([a, b, isolated], [ab]);
    const before = structuredClone(graph);
    const missingId = uuid(999);

    expect(errorOf(resolveRoute(graph, a.id, isolated.id))).toEqual({
      code: "NO_ROUTE",
      fromStopId: a.id,
      toStopId: isolated.id,
      pairIndex: 0,
    });
    expect(errorOf(resolveRoute(graph, missingId, b.id))).toEqual({
      code: "NO_ROUTE",
      fromStopId: missingId,
      toStopId: b.id,
      pairIndex: 0,
    });
    expect(graph).toEqual(before);
  });
});

describe("resolveGuidedRoute", () => {
  test("concatenates stop pairs, removes boundary duplicates, and extracts turns", () => {
    const a = node(130, 0, 0);
    const b = node(131, 10, 0);
    const c = node(132, 20, 0);
    const d = node(133, 20, 10);
    const e = node(134, 20, 20);
    const ab = edge(140, a, b);
    const bc = edge(141, b, c);
    const cd = edge(142, c, d);
    const de = edge(143, d, e);
    const graph = network([a, b, c, d, e], [de, bc, ab, cd]);

    const resolved = valueOf(resolveGuidedRoute(
      graph,
      guidedRoute([a.id, c.id, e.id]),
    ));

    expect(resolved.nodeIds).toEqual([a.id, b.id, c.id, d.id, e.id]);
    expect(resolved.edgeIds).toEqual([ab.id, bc.id, cd.id, de.id]);
    expect(resolved.totalDistance).toBe(40);
    expect(resolved.turnPoints).toEqual(positions(a, c, e));
  });

  test("supports loop tours without dropping the repeated final stop", () => {
    const a = node(150, 0, 0);
    const b = node(151, 10, 0);
    const ab = edge(152, a, b);
    const graph = network([a, b], [ab]);

    const resolved = valueOf(resolveGuidedRoute(
      graph,
      guidedRoute([a.id, b.id, a.id]),
    ));

    expect(resolved.nodeIds).toEqual([a.id, b.id, a.id]);
    expect(resolved.edgeIds).toEqual([ab.id, ab.id]);
    expect(resolved.totalDistance).toBe(20);
    expect(resolved.turnPoints).toEqual(positions(a, b, a));
  });

  test("reports the first failing guided-stop pair without a partial route", () => {
    const a = node(170, 0, 0);
    const b = node(171, 10, 0);
    const isolated = node(172, 20, 0);
    const graph = network([a, b, isolated], [edge(173, a, b)]);

    const failure = errorOf(resolveGuidedRoute(
      graph,
      guidedRoute([a.id, b.id, isolated.id]),
    ));

    expect(failure).toEqual({
      code: "NO_ROUTE",
      fromStopId: b.id,
      toStopId: isolated.id,
      pairIndex: 1,
    });
  });
});
