import { describe, expect, it } from "vitest";
import {
  SHOWROOM_FIXTURE_CATALOGUE,
  showroomFixture,
  type ShowroomFixtureKind,
} from "./catalogue";

const expectedCatalogue = [
  {
    kind: "display-case",
    label: "展示柜",
    defaultName: "展示柜",
    defaultSize: { width: 1200, depth: 600, height: 1200 },
    parts: [
      { key: "base", shape: "box", center: { x: 0.5, y: 0.5, z: 0.05 }, size: { x: 1, y: 1, z: 0.1 } },
      { key: "case", shape: "box", center: { x: 0.5, y: 0.5, z: 0.5 }, size: { x: 0.9, y: 0.9, z: 0.8 } },
      { key: "top", shape: "box", center: { x: 0.5, y: 0.5, z: 0.95 }, size: { x: 1, y: 1, z: 0.1 } },
    ],
  },
  {
    kind: "display-table",
    label: "展示桌",
    defaultName: "展示桌",
    defaultSize: { width: 1500, depth: 750, height: 900 },
    parts: [
      { key: "top", shape: "box", center: { x: 0.5, y: 0.5, z: 0.9 }, size: { x: 1, y: 1, z: 0.2 } },
      { key: "leg-fl", shape: "box", center: { x: 0.08, y: 0.08, z: 0.4 }, size: { x: 0.08, y: 0.08, z: 0.8 } },
      { key: "leg-fr", shape: "box", center: { x: 0.92, y: 0.08, z: 0.4 }, size: { x: 0.08, y: 0.08, z: 0.8 } },
      { key: "leg-rl", shape: "box", center: { x: 0.08, y: 0.92, z: 0.4 }, size: { x: 0.08, y: 0.08, z: 0.8 } },
      { key: "leg-rr", shape: "box", center: { x: 0.92, y: 0.92, z: 0.4 }, size: { x: 0.08, y: 0.08, z: 0.8 } },
    ],
  },
  {
    kind: "shelf",
    label: "货架",
    defaultName: "货架",
    defaultSize: { width: 1000, depth: 400, height: 2000 },
    parts: [
      { key: "back", shape: "box", center: { x: 0.5, y: 0.95, z: 0.5 }, size: { x: 1, y: 0.1, z: 1 } },
      { key: "side-left", shape: "box", center: { x: 0.025, y: 0.5, z: 0.5 }, size: { x: 0.05, y: 0.9, z: 1 } },
      { key: "side-right", shape: "box", center: { x: 0.975, y: 0.5, z: 0.5 }, size: { x: 0.05, y: 0.9, z: 1 } },
      { key: "shelf-0", shape: "box", center: { x: 0.5, y: 0.5, z: 0.025 }, size: { x: 0.9, y: 0.9, z: 0.05 } },
      { key: "shelf-1", shape: "box", center: { x: 0.5, y: 0.5, z: 0.35 }, size: { x: 0.9, y: 0.9, z: 0.05 } },
      { key: "shelf-2", shape: "box", center: { x: 0.5, y: 0.5, z: 0.65 }, size: { x: 0.9, y: 0.9, z: 0.05 } },
      { key: "shelf-3", shape: "box", center: { x: 0.5, y: 0.5, z: 0.975 }, size: { x: 0.9, y: 0.9, z: 0.05 } },
    ],
  },
  {
    kind: "checkout",
    label: "收银台",
    defaultName: "收银台",
    defaultSize: { width: 1600, depth: 700, height: 1000 },
    parts: [
      { key: "body", shape: "box", center: { x: 0.5, y: 0.5, z: 0.45 }, size: { x: 1, y: 1, z: 0.9 } },
      { key: "top", shape: "box", center: { x: 0.5, y: 0.5, z: 0.95 }, size: { x: 1, y: 1, z: 0.1 } },
    ],
  },
  {
    kind: "screen",
    label: "屏幕",
    defaultName: "屏幕",
    defaultSize: { width: 1200, depth: 100, height: 1800 },
    parts: [
      { key: "base", shape: "box", center: { x: 0.5, y: 0.5, z: 0.03 }, size: { x: 0.6, y: 1, z: 0.06 } },
      { key: "post", shape: "box", center: { x: 0.5, y: 0.5, z: 0.33 }, size: { x: 0.08, y: 0.3, z: 0.6 } },
      { key: "display", shape: "box", center: { x: 0.5, y: 0.5, z: 0.8 }, size: { x: 1, y: 0.2, z: 0.4 } },
    ],
  },
  {
    kind: "partition",
    label: "隔断",
    defaultName: "隔断",
    defaultSize: { width: 1200, depth: 100, height: 2400 },
    parts: [
      { key: "panel", shape: "box", center: { x: 0.5, y: 0.5, z: 0.5 }, size: { x: 1, y: 1, z: 1 } },
    ],
  },
  {
    kind: "signage",
    label: "标牌",
    defaultName: "标牌",
    defaultSize: { width: 600, depth: 100, height: 1800 },
    parts: [
      { key: "base", shape: "box", center: { x: 0.5, y: 0.5, z: 0.03 }, size: { x: 0.7, y: 1, z: 0.06 } },
      { key: "post", shape: "box", center: { x: 0.5, y: 0.5, z: 0.35 }, size: { x: 0.08, y: 0.3, z: 0.64 } },
      { key: "board", shape: "box", center: { x: 0.5, y: 0.5, z: 0.82 }, size: { x: 1, y: 0.2, z: 0.36 } },
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

describe("showroom fixture catalogue", () => {
  it("exports the exact approved order, defaults, and normalized primitive parts", () => {
    expect(SHOWROOM_FIXTURE_CATALOGUE).toEqual(expectedCatalogue);
  });

  it("contains unique non-generic kinds and geometrically valid boxes", () => {
    const kinds = SHOWROOM_FIXTURE_CATALOGUE.map(({ kind }) => kind);
    expect(new Set(kinds).size).toBe(7);
    expect(kinds).not.toContain("generic");

    for (const descriptor of SHOWROOM_FIXTURE_CATALOGUE) {
      expect(Object.values(descriptor.defaultSize).every((value) => Number.isFinite(value) && value > 0)).toBe(true);
      expect(new Set(descriptor.parts.map(({ key }) => key)).size).toBe(descriptor.parts.length);
      for (const part of descriptor.parts) {
        expect(part.shape).toBe("box");
        for (const axis of ["x", "y", "z"] as const) {
          expect(Number.isFinite(part.center[axis])).toBe(true);
          expect(Number.isFinite(part.size[axis]) && part.size[axis] > 0).toBe(true);
          expect(part.center[axis] - part.size[axis] / 2).toBeGreaterThanOrEqual(-Number.EPSILON);
          expect(part.center[axis] + part.size[axis] / 2).toBeLessThanOrEqual(1 + Number.EPSILON);
        }
      }
    }
  });

  it("deep-freezes every exported descriptor and returns catalogue identities by kind", () => {
    expectDeepFrozen(SHOWROOM_FIXTURE_CATALOGUE);
    for (const descriptor of SHOWROOM_FIXTURE_CATALOGUE) {
      expect(showroomFixture(descriptor.kind as ShowroomFixtureKind)).toBe(descriptor);
    }
  });

  it("rejects generic and unknown fixture kinds instead of synthesizing descriptors", () => {
    expect(() => showroomFixture("generic" as never)).toThrow(RangeError);
    expect(() => showroomFixture("unknown" as never)).toThrow(RangeError);
  });
});
