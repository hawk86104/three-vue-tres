// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { validateProjectName } from "./create-project-dialog";

describe("project name validation ids", () => {
  it.each([
    ["", "empty"],
    [".", "dot-path"],
    ["projects/demo", "separator"],
    ["CON", "reserved-name"],
    ["project. ", "trailing-dot-or-space"],
    ["😀".repeat(81), "too-long"],
  ] as const)("returns %s for invalid project names", (name, reason) => {
    expect(validateProjectName(name)).toBe(reason);
  });

  it("returns null for a valid project name", () => {
    expect(validateProjectName("  Summer showroom")).toBeNull();
  });
});
