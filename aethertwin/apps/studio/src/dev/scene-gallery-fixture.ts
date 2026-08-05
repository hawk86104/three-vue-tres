import {
  createInitialSnapshot,
  parseSnapshotV3,
  type Fixture,
  type GuidedRoute,
  type MaterialAssignment,
  type MaterialDefinition,
  type Opening,
  type PointOfInterest,
  type ProductContent,
  type ProjectSnapshot,
  type RouteEdge,
  type RouteNetwork,
  type RouteNode,
  type SpaceUnit,
  type Wall,
} from "@aethertwin/core-model";
import { SHOWROOM_FIXTURE_CATALOGUE } from "@aethertwin/mode-showroom";

const uuid = (value: number): string => (
  `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`
);

const initialIds = [1, 2, 3].map(uuid);
const base = createInitialSnapshot({
  name: "M2.4 deterministic 3D gallery",
  profile: "showroom",
  uuid: () => initialIds.shift()!,
});
const floor = base.project.floors[0]!;
const layerId = floor.layers[0]!.id;

const room: SpaceUnit = {
  id: uuid(10),
  name: "Concave gallery floor",
  tags: ["scene-gallery", "concave"],
  type: "space-unit",
  kind: "exhibition",
  floorId: floor.id,
  layerId,
  locked: false,
  transform: {
    translation: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
  },
  footprint: [
    { x: 0, y: 0 },
    { x: 6_000, y: 0 },
    { x: 6_000, y: 4_000 },
    { x: 2_000, y: 4_000 },
    { x: 2_000, y: 2_000 },
    { x: 0, y: 2_000 },
  ],
};

const wall: Wall = {
  id: uuid(11),
  name: "Door and window wall",
  tags: ["scene-gallery"],
  type: "wall",
  floorId: floor.id,
  layerId,
  locked: false,
  transform: {
    translation: { x: 500, y: 500 },
    rotation: 0,
    scale: { x: 1, y: 1 },
  },
  centerLine: [{ x: 0, y: 0 }, { x: 5_000, y: 0 }],
  thickness: 200,
};

const fixtures: readonly Fixture[] = SHOWROOM_FIXTURE_CATALOGUE.map(
  (descriptor, index): Fixture => ({
    id: uuid(20 + index),
    name: `Gallery ${descriptor.kind}`,
    tags: ["scene-gallery"],
    type: "fixture",
    kind: descriptor.kind,
    floorId: floor.id,
    layerId,
    locked: false,
    transform: {
      translation: {
        x: 750 + (index % 4) * 1_300,
        y: 1_250 + Math.floor(index / 4) * 1_400,
      },
      rotation: index * Math.PI / 14,
      scale: { x: 1, y: 1 },
    },
    size: {
      width: descriptor.defaultSize.width,
      height: descriptor.defaultSize.depth,
    },
    spatial3D: {
      elevation: 0,
      height: descriptor.defaultSize.height,
    },
  }),
);

const hotspot: PointOfInterest = {
  id: uuid(30),
  name: "Product hotspot",
  tags: ["scene-gallery"],
  type: "poi",
  kind: "product-hotspot",
  floorId: floor.id,
  layerId,
  locked: false,
  transform: {
    translation: { x: 4_900, y: 3_200 },
    rotation: 0,
    scale: { x: 1, y: 1 },
  },
  radius: 180,
};

const hotspotContent: ProductContent = {
  id: uuid(31),
  name: "Product hotspot content",
  tags: ["scene-gallery"],
  targetEntityId: hotspot.id,
  description: "Deterministic local content for the gallery hotspot.",
  mediaAssetIds: [],
};

const openings: readonly Opening[] = [
  {
    id: uuid(40),
    name: "Gallery door",
    tags: ["scene-gallery"],
    wallId: wall.id,
    kind: "door",
    distanceAlongWall: 1_400,
    width: 1_000,
    height: 2_100,
    sillHeight: 0,
  },
  {
    id: uuid(41),
    name: "Gallery window",
    tags: ["scene-gallery"],
    wallId: wall.id,
    kind: "window",
    distanceAlongWall: 3_600,
    width: 1_200,
    height: 1_200,
    sillHeight: 900,
  },
];

function routeNode(id: number, name: string, x: number, y: number): RouteNode {
  return {
    id: uuid(id),
    name,
    tags: ["scene-gallery"],
    floorId: floor.id,
    kind: "showroom-stop",
    position: { x, y },
  };
}

function routeEdge(
  id: number,
  name: string,
  from: RouteNode,
  to: RouteNode,
): RouteEdge {
  return {
    id: uuid(id),
    name,
    tags: ["scene-gallery"],
    from: from.id,
    to: to.id,
    distance: Math.hypot(
      to.position.x - from.position.x,
      to.position.y - from.position.y,
    ),
    bidirectional: true,
    accessible: true,
    enabled: true,
    width: 1_200,
    weight: 1,
  };
}

const routeStart = routeNode(50, "Route start", 500, 1_000);
const routeTurn = routeNode(51, "Route turn", 2_500, 1_000);
const routeEnd = routeNode(52, "Route end", 2_500, 3_000);
const routeFirstEdge = routeEdge(53, "Route edge A", routeStart, routeTurn);
const routeSecondEdge = routeEdge(54, "Route edge B", routeTurn, routeEnd);
const routeNetwork: RouteNetwork = {
  id: uuid(55),
  name: "Gallery route network",
  tags: ["scene-gallery"],
  nodes: [routeStart, routeTurn, routeEnd],
  edges: [routeFirstEdge, routeSecondEdge],
};
const guidedRoute: GuidedRoute = {
  id: uuid(56),
  name: "Gallery guided route",
  tags: ["scene-gallery"],
  routeNetworkId: routeNetwork.id,
  stopNodeIds: [routeStart.id, routeEnd.id],
};

export const SCENE_GALLERY_MISSING_TEXTURE_ASSET_ID = uuid(61);
const textureSha256 = "0".repeat(64);
const material: MaterialDefinition = {
  id: uuid(60),
  name: "Missing texture fallback",
  tags: ["scene-gallery"],
  baseColor: "#6f8792",
  roughness: 0.7,
  metalness: 0.05,
  opacity: 1,
  assetId: SCENE_GALLERY_MISSING_TEXTURE_ASSET_ID,
};
const materialAssignment: MaterialAssignment = {
  id: uuid(62),
  name: "Gallery floor material",
  tags: ["scene-gallery"],
  materialId: material.id,
  targetKind: "space-floor",
  targetId: room.id,
};

export const SCENE_GALLERY_SNAPSHOT: ProjectSnapshot = parseSnapshotV3({
  ...base,
  project: {
    ...base.project,
    entities: [room, wall, ...fixtures, hotspot],
    productContents: [hotspotContent],
    openings,
    routeNetworks: [routeNetwork],
    guidedRoutes: [guidedRoute],
    materials: [material],
    materialAssignments: [materialAssignment],
  },
  assets: [{
    id: SCENE_GALLERY_MISSING_TEXTURE_ASSET_ID,
    sha256: textureSha256,
    relativePath: `assets/sha256/00/${textureSha256}.png`,
    mediaType: "image/png",
    size: 1,
  }],
});
