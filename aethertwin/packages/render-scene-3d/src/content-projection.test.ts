import {
  createInitialSnapshot,
  type Fixture,
  type GuidedRoute,
  type PointOfInterest,
  type ProjectSnapshot,
  type RouteEdge,
  type RouteNetwork,
  type RouteNode,
  type SpatialEntity,
} from "@aethertwin/core-model";
import { SHOWROOM_FIXTURE_CATALOGUE } from "@aethertwin/mode-showroom";
import {
  projectScene,
  type SceneGuidedRouteProjection,
  type SceneRecord,
  type SceneRendererInput,
} from "@aethertwin/render-scene-3d";
import type { ResolvedRoute } from "@aethertwin/route-engine";
import { describe, expect, it } from "vitest";

const uuid = (value: number): string => (
  `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`
);

const initialIds = [1, 2, 3].map(uuid);
const base = createInitialSnapshot({
  name: "3D content",
  profile: "showroom",
  uuid: () => initialIds.shift()!,
});
const floor = base.project.floors[0]!;
const layerId = floor.layers[0]!.id;

function fixture(
  id: number,
  kind: Fixture["kind"],
  width: number,
  depth: number,
  height?: number,
  overrides: Partial<Fixture> = {},
): Fixture {
  return {
    id: uuid(id),
    name: `Fixture ${id}`,
    tags: [],
    type: "fixture",
    kind,
    floorId: floor.id,
    layerId,
    locked: false,
    transform: {
      translation: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    size: { width, height: depth },
    ...(height === undefined ? {} : { spatial3D: { elevation: 0, height } }),
    ...overrides,
  };
}

function hotspot(
  id: number,
  kind: PointOfInterest["kind"] = "product-hotspot",
  overrides: Partial<PointOfInterest> = {},
): PointOfInterest {
  return {
    id: uuid(id),
    name: `Hotspot ${id}`,
    tags: [],
    type: "poi",
    kind,
    floorId: floor.id,
    layerId,
    locked: false,
    transform: {
      translation: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    ...overrides,
  };
}

function routeNode(id: number, x: number, y: number): RouteNode {
  return {
    id: uuid(id),
    name: `Node ${id}`,
    tags: [],
    floorId: floor.id,
    kind: "junction",
    position: { x, y },
  };
}

function routeEdge(id: number, from: string, to: string): RouteEdge {
  return {
    id: uuid(id),
    name: `Edge ${id}`,
    tags: [],
    from,
    to,
    distance: 1_000,
    bidirectional: true,
    accessible: true,
    enabled: true,
    width: 1_200,
    weight: 1,
  };
}

function routeFixture(): {
  readonly guidedRoute: GuidedRoute;
  readonly network: RouteNetwork;
  readonly projection: SceneGuidedRouteProjection;
} {
  const a = routeNode(300, 0, 0);
  const b = routeNode(301, 1_000, 0);
  const c = routeNode(302, 1_000, 2_000);
  const ab = routeEdge(303, a.id, b.id);
  const bc = routeEdge(304, b.id, c.id);
  const network: RouteNetwork = {
    id: uuid(305),
    name: "Network",
    tags: [],
    nodes: [c, a, b],
    edges: [bc, ab],
  };
  const guidedRoute: GuidedRoute = {
    id: uuid(306),
    name: "Tour",
    tags: [],
    routeNetworkId: network.id,
    stopNodeIds: [a.id, c.id],
  };
  const resolvedRoute: ResolvedRoute = {
    nodeIds: [a.id, b.id, c.id],
    edgeIds: [ab.id, bc.id],
    totalDistance: 3_000,
    turnPoints: [a.position, b.position, c.position],
  };
  return {
    guidedRoute,
    network,
    projection: {
      guidedRouteId: guidedRoute.id,
      routeNetworkId: network.id,
      resolvedRoute,
    },
  };
}

function snapshotWith(
  entities: readonly SpatialEntity[] = [],
  network: RouteNetwork | null = null,
  guidedRoute: GuidedRoute | null = null,
): ProjectSnapshot {
  return {
    ...base,
    project: {
      ...base.project,
      entities,
      routeNetworks: network === null ? [] : [network],
      guidedRoutes: guidedRoute === null ? [] : [guidedRoute],
    },
  };
}

function inputFor(
  snapshot: ProjectSnapshot,
  options: {
    readonly activeGuidedRoute?: SceneGuidedRouteProjection | null;
    readonly selectedIds?: ReadonlySet<string>;
  } = {},
): SceneRendererInput {
  return {
    snapshot,
    activeFloorId: floor.id,
    selectedIds: options.selectedIds ?? new Set(),
    activeGuidedRoute: options.activeGuidedRoute ?? null,
    camera: {
      position: { x: 4, y: 5, z: 6 },
      target: { x: 0, y: 0, z: 0 },
      fieldOfView: 45,
    },
    assetIssues: [],
  };
}

function recordByKey(records: readonly SceneRecord[], key: string): SceneRecord {
  const record = records.find((candidate) => candidate.key === key);
  if (record === undefined) throw new Error(`Missing scene record ${key}`);
  return record;
}

describe("projectScene fixture projection", () => {
  it("projects every primitive part for all seven showroom descriptors", () => {
    const fixtures = SHOWROOM_FIXTURE_CATALOGUE.map((descriptor, index) => fixture(
      100 + index,
      descriptor.kind,
      descriptor.defaultSize.width,
      descriptor.defaultSize.depth,
      descriptor.defaultSize.height,
    ));
    const selectedFixture = fixtures[3]!;

    const projection = projectScene(inputFor(snapshotWith(fixtures), {
      selectedIds: new Set([selectedFixture.id]),
    }));
    const parts = projection.records.filter(({ kind }) => kind === "fixture-part");

    expect(projection.issues).toEqual([]);
    expect(parts).toHaveLength(SHOWROOM_FIXTURE_CATALOGUE.reduce(
      (count, descriptor) => count + descriptor.parts.length,
      0,
    ));
    for (const [index, descriptor] of SHOWROOM_FIXTURE_CATALOGUE.entries()) {
      const source = fixtures[index]!;
      expect(parts.filter(({ selectionId }) => selectionId === source.id).map(({ key }) => key)).toEqual(
        descriptor.parts.map(({ key }) => `fixture-part:${source.id}:${key}`).sort(),
      );
      expect(parts.filter(({ selectionId }) => selectionId === source.id).every(({ sourceIds }) => (
        sourceIds.length === 1 && sourceIds[0] === source.id
      ))).toBe(true);
    }
    expect(parts.filter(({ selectionId }) => selectionId === selectedFixture.id).every(({ selected }) => selected)).toBe(true);
    expect(parts.every(({ material }) => material.role === "fixture")).toBe(true);
  });

  it("uses durable dimensions, non-uniform XY scale, rotation, and elevation", () => {
    const source = fixture(120, "display-case", 2_000, 1_000, 1_500, {
      spatial3D: { elevation: 500, height: 1_500 },
      transform: {
        translation: { x: 3_000, y: -2_000 },
        rotation: Math.PI / 2,
        scale: { x: 2, y: 0.5 },
      },
    });

    const projection = projectScene(inputFor(snapshotWith([source])));

    expect(projection.bounds).toEqual({
      min: { x: 2.5, y: 0.5, z: -2 },
      max: { x: 3, y: 2, z: 2 },
    });
    expect(recordByKey(projection.records, `fixture-part:${source.id}:base`)).toMatchObject({
      selectionId: source.id,
      bounds: { min: { y: 0.5 }, max: { y: 0.65 } },
    });
  });

  it("keeps legacy generic fixtures as one box with a 1000 mm default height", () => {
    const source = fixture(121, "generic", 800, 400);

    const projection = projectScene(inputFor(snapshotWith([source])));
    const record = recordByKey(projection.records, `fixture-part:${source.id}:generic`);

    expect(projection.records).toHaveLength(1);
    expect(record.bounds).toEqual({
      min: { x: 0, y: 0, z: -0.4 },
      max: { x: 0.8, y: 1, z: 0 },
    });
  });
});

describe("projectScene hotspot and route projection", () => {
  it("projects only product hotspots as restrained markers with shared selection", () => {
    const product = hotspot(200, "product-hotspot", {
      spatial3D: { elevation: 700, height: 0 },
      transform: {
        translation: { x: -1_500, y: 2_500 },
        rotation: Math.PI / 3,
        scale: { x: 2, y: 0.5 },
      },
    });
    const ordinary = hotspot(201, "entrance");

    const projection = projectScene(inputFor(snapshotWith([ordinary, product]), {
      selectedIds: new Set([product.id]),
    }));
    const record = recordByKey(projection.records, `hotspot:${product.id}`);

    expect(projection.records).toHaveLength(1);
    expect(record).toMatchObject({
      kind: "hotspot",
      sourceIds: [product.id],
      selectionId: product.id,
      selected: true,
      geometry: { topology: "lines" },
      material: { role: "hotspot" },
    });
    expect(record.bounds).toEqual({
      min: { x: -1.56, y: 0.7, z: -2.56 },
      max: { x: -1.44, y: 0.9, z: -2.44 },
    });
  });

  it("projects the saved guided route in nodeIds order at 30 mm", () => {
    const route = routeFixture();

    const projection = projectScene(inputFor(
      snapshotWith([], route.network, route.guidedRoute),
      {
        activeGuidedRoute: route.projection,
        selectedIds: new Set([route.guidedRoute.id]),
      },
    ));
    const record = recordByKey(projection.records, `route:${route.guidedRoute.id}`);

    expect(record).toMatchObject({
      kind: "route",
      selectionId: route.guidedRoute.id,
      selected: true,
      geometry: {
        topology: "lines",
        positions: [0, 0.03, 0, 1, 0.03, 0, 1, 0.03, -2],
        indices: [0, 1, 1, 2],
      },
      material: { role: "route" },
    });
    expect(record.sourceIds).toEqual([
      route.guidedRoute.id,
      route.network.id,
      ...route.projection.resolvedRoute.nodeIds,
      ...route.projection.resolvedRoute.edgeIds,
    ].sort());
  });

  it.each([
    ["stale node", (route: ReturnType<typeof routeFixture>) => ({
      ...route.projection,
      resolvedRoute: {
        ...route.projection.resolvedRoute,
        nodeIds: [route.network.nodes[1]!.id, uuid(399)],
        edgeIds: [route.network.edges[1]!.id],
      },
    })],
    ["disconnected edge", (route: ReturnType<typeof routeFixture>) => ({
      ...route.projection,
      resolvedRoute: {
        ...route.projection.resolvedRoute,
        nodeIds: [route.network.nodes[1]!.id, route.network.nodes[0]!.id],
        edgeIds: [route.network.edges[1]!.id],
      },
    })],
  ])("fails closed for %s route input", (_label, mutate) => {
    const route = routeFixture();
    const invalid = mutate(route);
    const validFixture = fixture(400, "generic", 500, 500);

    const projection = projectScene(inputFor(
      snapshotWith([validFixture], route.network, route.guidedRoute),
      { activeGuidedRoute: invalid },
    ));

    expect(projection.records).toEqual([]);
    expect(projection.bounds).toBeNull();
    expect(projection.issues).toEqual([{
      code: "SCENE_ROUTE_PROJECTION_FAILED",
      sourceIds: [
        invalid.guidedRouteId,
        invalid.routeNetworkId,
        ...invalid.resolvedRoute.nodeIds,
        ...invalid.resolvedRoute.edgeIds,
      ].sort(),
    }]);
  });
});
