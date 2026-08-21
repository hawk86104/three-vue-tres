import type {
  FixtureKind,
  PointOfInterestKind,
  ProjectProfile,
  RouteNodeKind,
  SpaceUnitKind,
} from "@aethertwin/core-model";
import type {
  ShowroomToolActionId,
  ShowroomToolGroupId,
} from "@aethertwin/mode-showroom";
import type { StudioMessageId } from "./message-schema";

export const PROFILE_MESSAGE_IDS = {
  showroom: "profile.showroom",
  market: "profile.market",
} as const satisfies Record<ProjectProfile, StudioMessageId>;

export const SHOWROOM_TOOL_GROUP_MESSAGE_IDS = {
  select: "toolbar.group.select",
  building: "toolbar.group.building",
  fixtures: "toolbar.group.fixtures",
  content: "toolbar.group.content",
  tour: "toolbar.group.tour",
  preview: "toolbar.group.preview",
} as const satisfies Record<ShowroomToolGroupId, StudioMessageId>;

export const SHOWROOM_TOOL_ACTION_MESSAGE_IDS = {
  select: "action.select", pan: "action.pan", boundary: "action.boundary", wall: "action.wall",
  door: "action.door", window: "action.window", zone: "action.zone", room: "action.room",
  "recognize-rooms": "action.recognizeRooms", "fixture-catalogue": "action.fixtureCatalogue",
  poi: "action.poi", dimension: "action.dimension", "product-hotspot": "action.productHotspot",
  "attach-product-media": "action.attachProductMedia", "route-node": "action.routeNode",
  "route-edge": "action.routeEdge", "edit-route-stops": "action.editRouteStops",
  "preview-guided-route": "action.previewGuidedRoute", "view-2d": "action.view2d",
  "view-3d": "action.view3d", "view-split": "action.viewSplit",
  "frame-selection": "action.frameSelection", "frame-route": "action.frameRoute", export: "action.export",
} as const satisfies Record<ShowroomToolActionId, StudioMessageId>;

export const SPACE_UNIT_KIND_MESSAGE_IDS = {
  room: "action.room", shop: "toolbar.market.units", booth: "toolbar.market.units",
  exhibition: "toolbar.market.units", service: "toolbar.market.units", restricted: "toolbar.market.units",
} as const satisfies Record<SpaceUnitKind, StudioMessageId>;

export const FIXTURE_KIND_MESSAGE_IDS = {
  "display-case": "action.fixtureCatalogue", "display-table": "action.fixtureCatalogue", shelf: "action.fixtureCatalogue",
  checkout: "action.fixtureCatalogue", screen: "action.fixtureCatalogue", partition: "action.fixtureCatalogue",
  signage: "action.fixtureCatalogue", generic: "action.fixtureCatalogue",
} as const satisfies Record<FixtureKind, StudioMessageId>;

export const POINT_OF_INTEREST_KIND_MESSAGE_IDS = {
  entrance: "action.poi", exit: "action.poi", "service-desk": "action.poi", restroom: "action.poi",
  "accessible-restroom": "action.poi", stage: "action.poi", food: "action.poi", "rest-area": "action.poi",
  medical: "action.poi", "fire-safety": "action.poi", parking: "action.poi", charging: "action.poi",
  storage: "action.poi", nursery: "action.poi", water: "action.poi", atm: "action.poi",
  "closed-area": "action.poi", custom: "action.poi", "product-hotspot": "action.productHotspot",
} as const satisfies Record<PointOfInterestKind, StudioMessageId>;

export const ROUTE_NODE_KIND_MESSAGE_IDS = {
  junction: "action.routeNode", entrance: "action.routeNode", "showroom-stop": "action.routeNode",
} as const satisfies Record<RouteNodeKind, StudioMessageId>;
