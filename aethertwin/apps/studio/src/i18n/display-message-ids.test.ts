import { describe, expect, it } from "vitest";
import { PROFILE_MESSAGE_IDS, SHOWROOM_TOOL_ACTION_MESSAGE_IDS, SHOWROOM_TOOL_GROUP_MESSAGE_IDS } from "./display-message-ids";

describe("Task 3 display message IDs", () => {
  it("covers every stable Showroom toolbar group and action", () => {
    expect(Object.keys(PROFILE_MESSAGE_IDS).sort()).toEqual(["market", "showroom"]);
    expect(Object.keys(SHOWROOM_TOOL_GROUP_MESSAGE_IDS)).toEqual(["select", "building", "fixtures", "content", "tour", "preview"]);
    expect(Object.keys(SHOWROOM_TOOL_ACTION_MESSAGE_IDS)).toEqual(["select", "pan", "boundary", "wall", "door", "window", "zone", "room", "recognize-rooms", "fixture-catalogue", "poi", "dimension", "product-hotspot", "attach-product-media", "route-node", "route-edge", "edit-route-stops", "preview-guided-route", "view-2d", "view-3d", "view-split", "frame-selection", "frame-route", "export"]);
  });
});
