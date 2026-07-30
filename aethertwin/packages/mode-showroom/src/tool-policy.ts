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
  | "dimension";

export type ShowroomToolGroupId =
  | "select"
  | "building"
  | "fixtures"
  | "markers";

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
    group("markers", "Markers", [
      action("poi", "POI"),
      action("dimension", "Dimension"),
    ]),
  ]);
