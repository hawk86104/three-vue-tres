export type ShowroomToolActionId =
  | "select"
  | "pan"
  | "boundary"
  | "wall"
  | "door"
  | "window"
  | "zone"
  | "room"
  | "recognize-rooms"
  | "fixture-catalogue"
  | "poi"
  | "dimension"
  | "product-hotspot"
  | "attach-product-media"
  | "route-node"
  | "route-edge"
  | "edit-route-stops"
  | "preview-guided-route"
  | "view-2d"
  | "view-3d"
  | "view-split"
  | "frame-selection"
  | "frame-route";

export type ShowroomToolGroupId =
  | "select"
  | "building"
  | "fixtures"
  | "content"
  | "tour"
  | "preview";

export interface ToolActionDescriptor {
  readonly id: ShowroomToolActionId;
  readonly label: string;
}

export interface ToolGroupDescriptor {
  readonly id: ShowroomToolGroupId;
  readonly label: string;
  readonly actions: readonly ToolActionDescriptor[];
}

function action(
  id: ShowroomToolActionId,
  label: string,
): ToolActionDescriptor {
  return Object.freeze({ id, label });
}

function group(
  id: ShowroomToolGroupId,
  label: string,
  actions: readonly ToolActionDescriptor[],
): ToolGroupDescriptor {
  return Object.freeze({
    id,
    label,
    actions: Object.freeze(actions),
  });
}

export const SHOWROOM_TOOL_GROUPS: readonly ToolGroupDescriptor[] =
  Object.freeze([
    group("select", "Select", [
      action("select", "Select"),
      action("pan", "Pan"),
    ]),
    group("building", "Building", [
      action("boundary", "Boundary"),
      action("wall", "Wall"),
      action("door", "Door"),
      action("window", "Window"),
      action("zone", "Zone"),
      action("room", "Room"),
      action("recognize-rooms", "Recognize Rooms"),
    ]),
    group("fixtures", "Fixtures", [
      action("fixture-catalogue", "Fixture Catalogue"),
    ]),
    group("content", "Content", [
      action("poi", "POI"),
      action("dimension", "Dimension"),
      action("product-hotspot", "Product Hotspot"),
      action("attach-product-media", "Attach Media"),
    ]),
    group("tour", "Tour", [
      action("route-node", "Route Node"),
      action("route-edge", "Route Edge"),
      action("edit-route-stops", "Edit Stops"),
      action("preview-guided-route", "Preview Route"),
    ]),
    group("preview", "Preview", [
      action("view-2d", "2D"),
      action("view-3d", "3D"),
      action("view-split", "Split"),
      action("frame-selection", "Frame Selection"),
      action("frame-route", "Frame Route"),
    ]),
  ]);
