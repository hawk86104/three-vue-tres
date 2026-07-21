import { describe, expect, it } from "vitest";
import { screenToWorld, worldToScreen } from "./index";

describe("viewport coordinates", () => {
  const viewport = {
    width: 800,
    height: 600,
    center: { x: 1000, y: 2000 },
    pixelsPerMillimetre: 0.5,
  };

  it("round-trips y-up world coordinates through a y-down screen", () => {
    const world = { x: 1200, y: 2300 };
    expect(screenToWorld(worldToScreen(world, viewport), viewport)).toEqual(world);
    expect(worldToScreen(world, viewport)).toEqual({ x: 500, y: 150 });
  });

  it.each([0, -0.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects an invalid viewport scale %s", (pixelsPerMillimetre) => {
    expect(() => worldToScreen({ x: 0, y: 0 }, { ...viewport, pixelsPerMillimetre })).toThrow(RangeError);
  });
});
