import { describe, expect, it } from "vitest";
import { ENTITY_TYPE_MESSAGE_IDS, FIXTURE_KIND_MESSAGE_IDS, OPENING_KIND_MESSAGE_IDS, POINT_OF_INTEREST_KIND_MESSAGE_IDS, PROFILE_MESSAGE_IDS, ROUTE_NODE_KIND_MESSAGE_IDS, SHOWROOM_TOOL_ACTION_MESSAGE_IDS, SHOWROOM_TOOL_GROUP_MESSAGE_IDS, SPACE_UNIT_KIND_MESSAGE_IDS } from "./display-message-ids";

describe("Task 3 display message IDs", () => {
  it("covers every stable Showroom toolbar group and action", () => {
    expect(Object.keys(PROFILE_MESSAGE_IDS).sort()).toEqual(["market", "showroom"]);
    expect(Object.keys(SHOWROOM_TOOL_GROUP_MESSAGE_IDS)).toEqual(["select", "building", "fixtures", "content", "tour", "preview"]);
    expect(Object.keys(SHOWROOM_TOOL_ACTION_MESSAGE_IDS)).toEqual(["select", "pan", "boundary", "wall", "door", "window", "zone", "room", "recognize-rooms", "fixture-catalogue", "poi", "dimension", "product-hotspot", "attach-product-media", "route-node", "route-edge", "edit-route-stops", "preview-guided-route", "view-2d", "view-3d", "view-split", "frame-selection", "frame-route", "export"]);
  });

  it("has runtime coverage for every Task 3 semantic kind map", () => {
    expect(Object.keys(ENTITY_TYPE_MESSAGE_IDS).sort()).toEqual(["boundary", "dimension", "fixture", "poi", "space-unit", "wall", "zone"]);
    expect(Object.keys(OPENING_KIND_MESSAGE_IDS).sort()).toEqual(["door", "window"]);
    expect(Object.keys(FIXTURE_KIND_MESSAGE_IDS)).toHaveLength(8);
    expect(Object.keys(POINT_OF_INTEREST_KIND_MESSAGE_IDS)).toHaveLength(19);
    expect(Object.keys(SPACE_UNIT_KIND_MESSAGE_IDS)).toHaveLength(6);
    expect(Object.keys(ROUTE_NODE_KIND_MESSAGE_IDS)).toEqual(["junction", "entrance", "showroom-stop"]);
  });
});
