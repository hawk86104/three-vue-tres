import type { Wall } from "@aethertwin/core-model";
import { describe, expect, it } from "vitest";
import {
  alignmentGuides,
  findAngleSnap,
  findSnap,
  type FindSnapInput,
  type PointSnapCandidate,
  type PointSnapMode,
} from "./snapping";

const floorId = "00000000-0000-4000-8000-000000000001";
const layerId = "00000000-0000-4000-8000-000000000002";
const hiddenLayerId = "00000000-0000-4000-8000-000000000003";
const otherFloorId = "00000000-0000-4000-8000-000000000004";

function wall(
  id: string,
  options: Partial<Pick<Wall, "floorId" | "layerId" | "locked">> = {},
): Wall {
  return {
    type: "wall",
    id,
    name: "Wall",
    tags: [],
    floorId: options.floorId ?? floorId,
    layerId: options.layerId ?? layerId,
    locked: options.locked ?? false,
    transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
    centerLine: [{ x: 0, y: 0 }, { x: 1000, y: 0 }],
    thickness: 100,
  };
}

function expectIssue(result: { readonly ok: boolean; readonly issue?: { readonly code: string } }): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issue?.code).toBe("INVALID_SNAP_INPUT");
}

describe("findSnap", () => {
  it("uses the fixed endpoint, midpoint, edge, alignment, grid priority", () => {
    const result = findSnap({
      worldPoint: { x: 0, y: 0 },
      pixelsPerMillimetre: 1,
      tolerancePixels: 8,
      modes: new Set(["endpoint", "midpoint", "edge", "alignment", "grid"]),
      gridSize: 100,
      candidates: [
        { mode: "alignment", point: { x: 1, y: 0 } },
        { mode: "edge", point: { x: 2, y: 0 } },
        { mode: "midpoint", point: { x: 3, y: 0 } },
        { mode: "endpoint", point: { x: 4, y: 0 } },
      ],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        candidate: { mode: "endpoint", point: { x: 4, y: 0 } },
        delta: { x: 4, y: 0 },
      },
    });
  });

  it("prefers an endpoint over a closer grid point inside the screen-space threshold", () => {
    const targetWall = wall("00000000-0000-4000-8000-000000000010");
    const result = findSnap({
      worldPoint: { x: 998, y: 1001 },
      pixelsPerMillimetre: 2,
      tolerancePixels: 8,
      modes: new Set(["endpoint", "grid"]),
      gridSize: 100,
      candidates: [{ mode: "endpoint", point: { x: 1000, y: 1000 }, entityId: targetWall.id }],
    });

    expect(result.ok && result.value.candidate?.mode).toBe("endpoint");
  });

  it("chooses the smallest screen distance within a priority and preserves input-order ties", () => {
    const nearest = findSnap({
      worldPoint: { x: 0, y: 0 }, pixelsPerMillimetre: 1, tolerancePixels: 8,
      modes: new Set(["endpoint"]), gridSize: 100,
      candidates: [
        { mode: "endpoint", point: { x: 3, y: 0 }, entityId: "far" },
        { mode: "endpoint", point: { x: 1, y: 0 }, entityId: "near" },
      ],
    });
    const tied = findSnap({
      worldPoint: { x: 0, y: 0 }, pixelsPerMillimetre: 1, tolerancePixels: 8,
      modes: new Set(["endpoint"]), gridSize: 100,
      candidates: [
        { mode: "endpoint", point: { x: 1, y: 0 }, entityId: "first" },
        { mode: "endpoint", point: { x: -1, y: 0 }, entityId: "second" },
      ],
    });

    expect(nearest.ok && nearest.value.candidate?.entityId).toBe("near");
    expect(tied.ok && tied.value.candidate?.entityId).toBe("first");
  });

  const modes: readonly PointSnapMode[] = ["endpoint", "midpoint", "edge", "alignment", "grid"];
  const zooms = [0.25, 1, 4] as const;
  for (const mode of modes) {
    for (const pixelsPerMillimetre of zooms) {
      it(`${mode} applies the same eight-pixel threshold at ${pixelsPerMillimetre} px/mm`, () => {
        const target = { x: 1000, y: 1000 };
        const candidates: readonly PointSnapCandidate[] = mode === "grid"
          ? []
          : [{ mode, point: target }];
        const common = {
          pixelsPerMillimetre,
          tolerancePixels: 8,
          modes: new Set<PointSnapMode>([mode]),
          gridSize: 100,
          candidates,
        };
        const atThreshold = findSnap({
          ...common,
          worldPoint: { x: target.x + 8 / pixelsPerMillimetre, y: target.y },
        });
        const outsideThreshold = findSnap({
          ...common,
          worldPoint: { x: target.x + 8.01 / pixelsPerMillimetre, y: target.y },
        });

        expect(atThreshold.ok && atThreshold.value.candidate?.point).toEqual(target);
        expect(outsideThreshold).toEqual({
          ok: true,
          value: { candidate: null, delta: { x: 0, y: 0 } },
        });
      });
    }
  }

  it("synthesizes grid snapping from the world point and grid size", () => {
    const result = findSnap({
      worldPoint: { x: 102, y: 198 }, pixelsPerMillimetre: 1, tolerancePixels: 8,
      modes: new Set(["grid"]), gridSize: 100, candidates: [],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        candidate: { mode: "grid", point: { x: 100, y: 200 } },
        delta: { x: -2, y: 2 },
      },
    });
  });

  it("leaves hidden and other-floor filtering to the caller while retaining locked visible targets", () => {
    const lockedVisible = wall("00000000-0000-4000-8000-000000000020", { locked: true });
    const hidden = wall("00000000-0000-4000-8000-000000000021", { layerId: hiddenLayerId });
    const otherFloor = wall("00000000-0000-4000-8000-000000000022", { floorId: otherFloorId });
    const source = [
      { entity: lockedVisible, point: { x: 10, y: 0 } },
      { entity: hidden, point: { x: 1, y: 0 } },
      { entity: otherFloor, point: { x: 2, y: 0 } },
    ];
    const visibleLayerIds = new Set([layerId]);
    const supplied = source
      .filter(({ entity }) => entity.floorId === floorId && visibleLayerIds.has(entity.layerId))
      .map(({ entity, point }): PointSnapCandidate => ({ mode: "endpoint", point, entityId: entity.id }));

    expect(supplied.map(({ entityId }) => entityId)).toEqual([lockedVisible.id]);
    expect(supplied.map(({ entityId }) => entityId)).not.toContain(hidden.id);
    expect(supplied.map(({ entityId }) => entityId)).not.toContain(otherFloor.id);
    const result = findSnap({
      worldPoint: { x: 3, y: 0 }, pixelsPerMillimetre: 1, tolerancePixels: 8,
      modes: new Set(["endpoint"]), gridSize: 100, candidates: supplied,
    });
    expect(result.ok && result.value.candidate?.entityId).toBe(lockedVisible.id);
  });

  it.each([
    ["non-finite world point", { worldPoint: { x: Number.NaN, y: 0 } }],
    ["zero scale", { pixelsPerMillimetre: 0 }],
    ["non-finite scale", { pixelsPerMillimetre: Number.POSITIVE_INFINITY }],
    ["negative tolerance", { tolerancePixels: -1 }],
    ["non-finite tolerance", { tolerancePixels: Number.NaN }],
    ["zero grid size", { gridSize: 0 }],
    ["non-finite grid size", { gridSize: Number.POSITIVE_INFINITY }],
    ["non-finite candidate", { candidates: [{ mode: "endpoint", point: { x: 0, y: Number.NaN } }] }],
    ["non-finite guide", { candidates: [{ mode: "alignment", point: { x: 0, y: 0 }, guide: { start: { x: 0, y: 0 }, end: { x: Number.POSITIVE_INFINITY, y: 0 } } }] }],
  ])("returns a PlanResult for invalid %s", (_name, override) => {
    const valid = {
      worldPoint: { x: 0, y: 0 }, pixelsPerMillimetre: 1, tolerancePixels: 8,
      modes: new Set<PointSnapMode>(["endpoint"]), gridSize: 100,
      candidates: [] as readonly PointSnapCandidate[],
    };
    expectIssue(findSnap({ ...valid, ...(override as Partial<FindSnapInput>) }));
  });
});

describe("alignmentGuides", () => {
  it("returns stable axis candidates and removes duplicate coordinates", () => {
    const result = alignmentGuides({
      worldPoint: { x: 10, y: 20 },
      referencePoints: [{ x: 0, y: 0 }, { x: 0, y: 5 }, { x: 5, y: 0 }],
    });

    expect(result).toEqual({
      ok: true,
      value: [
        { mode: "alignment", point: { x: 0, y: 20 }, guide: { start: { x: 0, y: 0 }, end: { x: 0, y: 20 } } },
        { mode: "alignment", point: { x: 10, y: 0 }, guide: { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } } },
        { mode: "alignment", point: { x: 10, y: 5 }, guide: { start: { x: 0, y: 5 }, end: { x: 10, y: 5 } } },
        { mode: "alignment", point: { x: 5, y: 20 }, guide: { start: { x: 5, y: 0 }, end: { x: 5, y: 20 } } },
      ],
    });
  });

  it.each([
    [{ worldPoint: { x: Number.NaN, y: 0 }, referencePoints: [] }],
    [{ worldPoint: { x: 0, y: 0 }, referencePoints: [{ x: 0, y: Number.NaN }] }],
  ])("rejects non-finite points", (input) => {
    expectIssue(alignmentGuides(input));
  });
});

describe("findAngleSnap", () => {
  it("snaps rotation to the configured radian increment", () => {
    expect(findAngleSnap(0.51, Math.PI / 12, 0.02)).toEqual({ ok: true, value: Math.PI / 6 });
  });

  it("treats orientations separated by a full turn identically", () => {
    const negative = findAngleSnap(-0.05, 1, 0.1);
    const wrapped = findAngleSnap(2 * Math.PI - 0.05, 1, 0.1);

    expect(negative).toEqual({ ok: true, value: 0 });
    expect(wrapped).toEqual(negative);
  });

  it("compares snapping distance circularly at the normalized boundary", () => {
    const positiveSide = findAngleSnap(Math.PI - 0.05, Math.PI, 0.1);
    const negativeSide = findAngleSnap(-Math.PI + 0.05, Math.PI, 0.1);

    expect(positiveSide).toEqual({ ok: true, value: -Math.PI });
    expect(negativeSide).toEqual(positiveSide);
  });

  it("does not snap outside tolerance and always normalizes to [-pi, pi)", () => {
    expect(findAngleSnap(0.55, Math.PI / 12, 0.02)).toEqual({ ok: true, value: 0.55 });
    expect(findAngleSnap(Math.PI - 0.01, Math.PI, 0.02)).toEqual({ ok: true, value: -Math.PI });
    const normalized = findAngleSnap(Math.PI * 3 + 0.2, 1, 0.001);
    expect(normalized.ok && normalized.value).toBeCloseTo(-Math.PI + 0.2);
  });

  it.each([
    [Number.NaN, Math.PI / 12, 0.02],
    [0, 0, 0.02],
    [0, -1, 0.02],
    [0, Number.POSITIVE_INFINITY, 0.02],
    [0, Math.PI / 12, -0.01],
    [0, Math.PI / 12, Number.NaN],
  ])("rejects invalid angle inputs", (angle, increment, tolerance) => {
    expectIssue(findAngleSnap(angle, increment, tolerance));
  });
});
