import { describe, expect, it } from "vitest";
import manifest from "../package.json";
import { SHOWROOM_TOOL_GROUPS } from "./tool-policy";

const expectedGroups = [
  {
    id: "select",
    label: "Select",
    actions: [
      { id: "select", label: "Select" },
      { id: "pan", label: "Pan" },
    ],
  },
  {
    id: "building",
    label: "Building",
    actions: [
      { id: "boundary", label: "Boundary" },
      { id: "wall", label: "Wall" },
      { id: "door", label: "Door" },
      { id: "window", label: "Window" },
      { id: "zone", label: "Zone" },
      { id: "room", label: "Room" },
      { id: "recognize-rooms", label: "Recognize Rooms" },
    ],
  },
  {
    id: "fixtures",
    label: "Fixtures",
    actions: [{ id: "fixture-catalogue", label: "Fixture Catalogue" }],
  },
  {
    id: "markers",
    label: "Markers",
    actions: [
      { id: "poi", label: "POI" },
      { id: "dimension", label: "Dimension" },
    ],
  },
] as const;

function expectDeepFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value)) {
    expectDeepFrozen(nested);
  }
}

describe("showroom tool policy", () => {
  it("exports exact stable action IDs, labels, and group ordering", () => {
    expect(SHOWROOM_TOOL_GROUPS).toEqual(expectedGroups);
    const actionIds = SHOWROOM_TOOL_GROUPS.flatMap(({ actions }) => actions.map(({ id }) => id));
    expect(new Set(actionIds).size).toBe(actionIds.length);
  });

  it("deep-freezes groups, actions, and their containing arrays", () => {
    expectDeepFrozen(SHOWROOM_TOOL_GROUPS);
  });

  it("keeps the package dependency-light and core-model-only", () => {

    expect(manifest.dependencies).toEqual({
      "@aethertwin/core-model": "workspace:*",
    });
  });
});
