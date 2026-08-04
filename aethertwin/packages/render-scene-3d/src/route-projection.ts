import type { RouteEdge, RouteNetwork, RouteNode } from "@aethertwin/core-model";
import { geometryBounds } from "./box-geometry";
import { millimetresToScenePoint } from "./coordinates";
import type {
  SceneMaterialProjection,
  SceneProjectionIssueCode,
  SceneRecord,
  SceneRendererInput,
} from "./types";

const ROUTE_ELEVATION_MM = 30;

export interface RouteProjectionFailure {
  readonly code: Extract<SceneProjectionIssueCode, "SCENE_ROUTE_PROJECTION_FAILED">;
  readonly sourceIds: readonly string[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function routeSourceIds(input: NonNullable<SceneRendererInput["activeGuidedRoute"]>): readonly string[] {
  return [...new Set([
    input.guidedRouteId,
    input.routeNetworkId,
    ...input.resolvedRoute.nodeIds,
    ...input.resolvedRoute.edgeIds,
  ])].sort(compareText);
}

function routeFailure(
  input: NonNullable<SceneRendererInput["activeGuidedRoute"]>,
): RouteProjectionFailure {
  return { code: "SCENE_ROUTE_PROJECTION_FAILED", sourceIds: routeSourceIds(input) };
}

function edgeConnects(edge: RouteEdge, from: string, to: string): boolean {
  return edge.enabled && (
    (edge.from === from && edge.to === to)
    || (edge.bidirectional && edge.from === to && edge.to === from)
  );
}

function containsStopsInOrder(nodeIds: readonly string[], stopNodeIds: readonly string[]): boolean {
  let cursor = 0;
  for (const stopNodeId of stopNodeIds) {
    const index = nodeIds.indexOf(stopNodeId, cursor);
    if (index < 0) return false;
    cursor = index + 1;
  }
  return true;
}

function validResolvedRoute(
  network: RouteNetwork,
  nodeById: ReadonlyMap<string, RouteNode>,
  edgeById: ReadonlyMap<string, RouteEdge>,
  nodeIds: readonly string[],
  edgeIds: readonly string[],
  activeFloorId: string,
): boolean {
  if (nodeIds.length < 2 || edgeIds.length !== nodeIds.length - 1) return false;
  if (nodeIds.some((nodeId) => {
    const node = nodeById.get(nodeId);
    return node === undefined
      || node.floorId !== activeFloorId
      || !Number.isFinite(node.position.x)
      || !Number.isFinite(node.position.y);
  })) return false;
  return edgeIds.every((edgeId, index) => {
    const edge = edgeById.get(edgeId);
    return edge !== undefined && edgeConnects(edge, nodeIds[index]!, nodeIds[index + 1]!);
  }) && network.id.length > 0;
}

function routeMaterial(selected: boolean): SceneMaterialProjection {
  return {
    role: "route",
    definitionId: null,
    baseColor: "#58b8c4",
    roughness: 0.6,
    metalness: 0,
    opacity: 1,
    textureAssetId: null,
    selectedOverlay: selected,
  };
}

export function projectRouteRecord(
  input: SceneRendererInput,
): SceneRecord | RouteProjectionFailure | null {
  const active = input.activeGuidedRoute;
  if (active === null) return null;
  const network = input.snapshot.project.routeNetworks.find(({ id }) => id === active.routeNetworkId);
  const guidedRoute = input.snapshot.project.guidedRoutes.find(({ id }) => id === active.guidedRouteId);
  if (
    network === undefined
    || guidedRoute === undefined
    || guidedRoute.routeNetworkId !== network.id
  ) return routeFailure(active);

  const nodeById = new Map(network.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(network.edges.map((edge) => [edge.id, edge]));
  const { nodeIds, edgeIds } = active.resolvedRoute;
  if (
    !validResolvedRoute(network, nodeById, edgeById, nodeIds, edgeIds, input.activeFloorId)
    || !containsStopsInOrder(nodeIds, guidedRoute.stopNodeIds)
  ) return routeFailure(active);

  const points = nodeIds.map((nodeId) => (
    millimetresToScenePoint(nodeById.get(nodeId)!.position, ROUTE_ELEVATION_MM)
  ));
  const geometry = {
    topology: "lines" as const,
    positions: points.flatMap((point) => [point.x, point.y, point.z]),
    indices: points.slice(1).flatMap((_, index) => [index, index + 1]),
    normals: points.flatMap(() => [0, 0, 0]),
    uvs: points.map((_, index) => [index / (points.length - 1), 0]).flat(),
  };
  const selected = input.selectedIds.has(guidedRoute.id);
  return {
    key: `route:${guidedRoute.id}`,
    kind: "route",
    sourceIds: routeSourceIds(active),
    selectionId: guidedRoute.id,
    selected,
    bounds: geometryBounds(geometry),
    geometry,
    material: routeMaterial(selected),
  };
}
