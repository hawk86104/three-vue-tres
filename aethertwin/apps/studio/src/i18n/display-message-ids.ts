import type {
  Opening,
  FixtureKind,
  MediaAssetKind,
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
import type { ProjectExportPreset, ProjectExportProgress } from "@aethertwin/exporter";
import type { SceneRendererStatus } from "@aethertwin/render-scene-3d";

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
  room: "kind.spaceUnit.room", shop: "kind.spaceUnit.shop", booth: "kind.spaceUnit.booth",
  exhibition: "kind.spaceUnit.exhibition", service: "kind.spaceUnit.service", restricted: "kind.spaceUnit.restricted",
} as const satisfies Record<SpaceUnitKind, StudioMessageId>;

export const ENTITY_TYPE_MESSAGE_IDS = {
  boundary: "kind.entity.boundary", wall: "kind.entity.wall", zone: "kind.entity.zone",
  "space-unit": "kind.entity.spaceUnit", fixture: "kind.entity.fixture",
  poi: "kind.entity.poi", dimension: "kind.entity.dimension",
} as const satisfies Record<"boundary" | "wall" | "zone" | "space-unit" | "fixture" | "poi" | "dimension", StudioMessageId>;

export const OPENING_KIND_MESSAGE_IDS = {
  door: "kind.opening.door", window: "kind.opening.window",
} as const satisfies Record<Opening["kind"], StudioMessageId>;

export const FIXTURE_KIND_MESSAGE_IDS = {
  "display-case": "kind.fixture.displayCase", "display-table": "kind.fixture.displayTable", shelf: "kind.fixture.shelf",
  checkout: "kind.fixture.checkout", screen: "kind.fixture.screen", partition: "kind.fixture.partition",
  signage: "kind.fixture.signage", generic: "kind.fixture.generic",
} as const satisfies Record<FixtureKind, StudioMessageId>;

export const POINT_OF_INTEREST_KIND_MESSAGE_IDS = {
  entrance: "kind.poi.entrance", exit: "kind.poi.exit", "service-desk": "kind.poi.serviceDesk", restroom: "kind.poi.restroom",
  "accessible-restroom": "kind.poi.accessibleRestroom", stage: "kind.poi.stage", food: "kind.poi.food", "rest-area": "kind.poi.restArea",
  medical: "kind.poi.medical", "fire-safety": "kind.poi.fireSafety", parking: "kind.poi.parking", charging: "kind.poi.charging",
  storage: "kind.poi.storage", nursery: "kind.poi.nursery", water: "kind.poi.water", atm: "kind.poi.atm",
  "closed-area": "kind.poi.closedArea", custom: "kind.poi.custom", "product-hotspot": "kind.poi.productHotspot",
} as const satisfies Record<PointOfInterestKind, StudioMessageId>;

export const ROUTE_NODE_KIND_MESSAGE_IDS = {
  junction: "kind.routeNode.junction", entrance: "kind.routeNode.entrance", "showroom-stop": "kind.routeNode.showroomStop",
} as const satisfies Record<RouteNodeKind, StudioMessageId>;

export const MEDIA_ASSET_KIND_MESSAGE_IDS = {
  image: "kind.media.image",
  video: "kind.media.video",
} as const satisfies Record<MediaAssetKind, StudioMessageId>;

export const EXPORT_PRESET_MESSAGE_IDS = {
  "full-hd": "export.preset.fullHd",
  "ultra-hd": "export.preset.ultraHd",
} as const satisfies Record<ProjectExportPreset, StudioMessageId>;

export const EXPORT_PHASE_MESSAGE_IDS = {
  "preparing-textures": "export.phase.preparingTextures",
  rendering: "export.phase.rendering",
  uploading: "export.phase.uploading",
  "encoding-publishing": "export.phase.encodingPublishing",
} as const satisfies Record<ProjectExportProgress["phase"], StudioMessageId>;

export const SCENE_RENDERER_STATUS_MESSAGE_IDS = {
  idle: "scene.status.initializing",
  initializing: "scene.status.initializing",
  ready: "scene.status.ready",
  recovering: "scene.status.recovering",
  failed: "scene.status.failed",
  disabled: "scene.status.disabled",
  destroyed: "scene.status.disabled",
} as const satisfies Record<SceneRendererStatus, StudioMessageId>;

export const EXPORT_DISABLED_REASON_MESSAGE_IDS = {
  profile: "export.disabled.profile",
  desktop: "export.disabled.desktop",
  view: "export.disabled.view",
  renderer: "export.disabled.renderer",
  capture: "export.disabled.capture",
  active: "export.disabled.active",
  "texture-limits": "export.disabled.textureLimits",
} as const satisfies Record<
  "profile" | "desktop" | "view" | "renderer" | "capture" | "active" | "texture-limits",
  StudioMessageId
>;
