import type { PlanReference } from "@aethertwin/core-model";
import { describe, expect, it } from "vitest";
import {
  applyPlanReferenceTransform,
  previewCalibration,
  type PlanResult,
} from "./index";

const referenceId = "00000000-0000-4000-8000-000000000901";

function makeReference(overrides: Partial<PlanReference> = {}): PlanReference {
  return {
    id: referenceId,
    name: "Calibration plan",
    tags: ["source"],
    floorId: "00000000-0000-4000-8000-000000000001",
    layerId: "00000000-0000-4000-8000-000000000002",
    assetId: "00000000-0000-4000-8000-000000000003",
    intrinsicSize: { width: 100, height: 50 },
    transform: {
      translation: { x: 10, y: 20 },
      rotation: Math.PI / 6,
      scale: { x: 2, y: 3 },
    },
    opacity: 0.65,
    locked: false,
    calibration: null,
    ...overrides,
  };
}

function valueOf<T>(result: PlanResult<T>): T {
  if (!result.ok) throw new Error(`${result.issue.code}: ${result.issue.message}`);
  return result.value;
}

describe("plan-reference mutation guards", () => {
  it("rejects transforming a locked reference with the stable issue code", () => {
    const reference = makeReference({ locked: true });

    expect(applyPlanReferenceTransform(reference, reference.transform)).toMatchObject({
      ok: false,
      issue: { code: "PLAN_REFERENCE_LOCKED", entityId: reference.id },
    });
  });

  it("rejects calibrating a locked reference with the stable issue code", () => {
    const reference = makeReference({ locked: true });

    expect(previewCalibration(reference, {
      sourcePointA: { x: 0, y: 0 },
      sourcePointB: { x: 100, y: 0 },
      measuredDistanceMm: 1_000,
    })).toMatchObject({
      ok: false,
      issue: { code: "PLAN_REFERENCE_LOCKED", entityId: reference.id },
    });
  });
});

describe("applyPlanReferenceTransform", () => {
  it("applies an unlocked transform while preserving exact calibration evidence", () => {
    const calibration = {
      sourcePointA: { x: 0, y: 0 },
      sourcePointB: { x: 50, y: 0 },
      measuredDistanceMm: 100,
    } as const;
    const reference = makeReference({
      transform: { translation: { x: 10, y: 20 }, rotation: 0, scale: { x: 2, y: 2 } },
      calibration,
    });
    const transform = {
      translation: { x: -200, y: 350 },
      rotation: -Math.PI / 3,
      scale: { x: 2, y: 2 },
    } as const;

    const after = valueOf(applyPlanReferenceTransform(reference, transform));

    expect(after).toEqual({ ...reference, transform });
    expect(after.calibration).toEqual(calibration);
    expect(after).not.toBe(reference);
    expect(after.transform).not.toBe(transform);
    expect(after.transform.translation).not.toBe(transform.translation);
    expect(after.calibration).not.toBe(calibration);
  });

  it.each([
    ["non-finite translation", { translation: { x: Number.NaN, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } }],
    ["non-finite rotation", { translation: { x: 0, y: 0 }, rotation: Number.POSITIVE_INFINITY, scale: { x: 1, y: 1 } }],
    ["zero scale", { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 0, y: 1 } }],
    ["negative scale", { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: -1, y: 1 } }],
    ["scale at the zero threshold", { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 1e-9, y: 1 } }],
    ["scale below the zero threshold", { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 5e-10, y: 1 } }],
    ["non-finite scale", { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: Number.NaN } }],
  ] as const)("rejects a %s as invalid plan-reference geometry", (_name, transform) => {
    expect(applyPlanReferenceTransform(makeReference(), transform)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PLAN_REFERENCE_GEOMETRY", entityId: referenceId },
    });
  });

  it("rejects transformed corners beyond the safe world range", () => {
    expect(applyPlanReferenceTransform(makeReference(), {
      translation: { x: 999_999_901, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    })).toMatchObject({
      ok: false,
      issue: { code: "PLAN_REFERENCE_OUT_OF_RANGE", entityId: referenceId },
    });
  });

  it("accepts transformed corners exactly on the inclusive world limit", () => {
    const after = valueOf(applyPlanReferenceTransform(makeReference(), {
      translation: { x: 999_999_900, y: -1_000_000_000 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    }));

    expect(after.transform.translation).toEqual({ x: 999_999_900, y: -1_000_000_000 });
  });

  it("does not mutate frozen caller-owned reference or transform graphs", () => {
    const reference = Object.freeze(makeReference({
      tags: Object.freeze(["frozen"]),
      intrinsicSize: Object.freeze({ width: 100, height: 50 }),
      transform: Object.freeze({
        translation: Object.freeze({ x: 0, y: 0 }),
        rotation: 0,
        scale: Object.freeze({ x: 1, y: 1 }),
      }),
    }));
    const transform = Object.freeze({
      translation: Object.freeze({ x: 20, y: 30 }),
      rotation: 0,
      scale: Object.freeze({ x: 1, y: 1 }),
    });

    expect(valueOf(applyPlanReferenceTransform(reference, transform)).transform).toEqual(transform);
    expect(reference.transform.translation).toEqual({ x: 0, y: 0 });
  });
});

describe("previewCalibration formulas", () => {
  it("uses horizontal pixel distance and preserves translation and rotation exactly", () => {
    const reference = makeReference({
      transform: {
        translation: { x: 123, y: -456 },
        rotation: 0.25,
        scale: { x: 7, y: 11 },
      },
    });
    const input = {
      sourcePointA: { x: 0, y: 25 },
      sourcePointB: { x: 100, y: 25 },
      measuredDistanceMm: 1_000,
    } as const;

    const preview = valueOf(previewCalibration(reference, input));

    expect(preview.millimetresPerPixel).toBe(10);
    expect(preview.after.transform).toEqual({
      translation: { x: 123, y: -456 },
      rotation: 0.25,
      scale: { x: 10, y: 10 },
    });
    expect(preview.after.calibration).toEqual(input);
    expect(preview.after.id).toBe(reference.id);
  });

  it("uses the exact diagonal hypot distance", () => {
    const preview = valueOf(previewCalibration(makeReference(), {
      sourcePointA: { x: 1, y: 2 },
      sourcePointB: { x: 4, y: 6 },
      measuredDistanceMm: 250,
    }));

    expect(preview.millimetresPerPixel).toBe(50);
    expect(preview.after.transform.scale).toEqual({ x: 50, y: 50 });
  });

  it("returns exact calibrated bounds for an axis-aligned reference", () => {
    const reference = makeReference({
      transform: { translation: { x: -10, y: 20 }, rotation: 0, scale: { x: 1, y: 1 } },
    });

    const preview = valueOf(previewCalibration(reference, {
      sourcePointA: { x: 0, y: 0 },
      sourcePointB: { x: 100, y: 0 },
      measuredDistanceMm: 1_000,
    }));

    expect(preview.bounds).toEqual({
      min: { x: -10, y: 20 },
      max: { x: 990, y: 520 },
    });
  });

  it("accepts calibrated corners exactly on both inclusive world limits", () => {
    const reference = makeReference({
      intrinsicSize: { width: 100, height: 1 },
      transform: {
        translation: { x: 999_998_000, y: -1_000_000_000 },
        rotation: 0,
        scale: { x: 1, y: 1 },
      },
    });

    const preview = valueOf(previewCalibration(reference, {
      sourcePointA: { x: 0, y: 0 },
      sourcePointB: { x: 100, y: 0 },
      measuredDistanceMm: 2_000,
    }));

    expect(preview.bounds).toEqual({
      min: { x: 999_998_000, y: -1_000_000_000 },
      max: { x: 1_000_000_000, y: -999_999_980 },
    });
  });
});

describe("previewCalibration validation and ownership", () => {
  const validInput = {
    sourcePointA: { x: 0, y: 0 },
    sourcePointB: { x: 100, y: 0 },
    measuredDistanceMm: 1_000,
  } as const;

  it.each([
    ["coincident points", { ...validInput, sourcePointB: { x: 0, y: 0 } }],
    ["NaN source coordinate", { ...validInput, sourcePointA: { x: Number.NaN, y: 0 } }],
    ["infinite source coordinate", { ...validInput, sourcePointB: { x: 100, y: Number.POSITIVE_INFINITY } }],
    ["zero measured distance", { ...validInput, measuredDistanceMm: 0 }],
    ["negative measured distance", { ...validInput, measuredDistanceMm: -1 }],
    ["NaN measured distance", { ...validInput, measuredDistanceMm: Number.NaN }],
    ["infinite measured distance", { ...validInput, measuredDistanceMm: Number.POSITIVE_INFINITY }],
    ["source A left of the image", { ...validInput, sourcePointA: { x: -1, y: 0 } }],
    ["source B right of the image", { ...validInput, sourcePointB: { x: 101, y: 0 } }],
    ["source A above the image", { ...validInput, sourcePointA: { x: 0, y: -1 } }],
    ["source B below the image", { ...validInput, sourcePointB: { x: 100, y: 51 } }],
  ] as const)("rejects %s with INVALID_CALIBRATION", (_name, input) => {
    expect(previewCalibration(makeReference(), input)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_CALIBRATION", entityId: referenceId },
    });
  });

  it.each([
    ["nonpositive intrinsic width", { intrinsicSize: { width: 0, height: 50 } }],
    ["non-finite intrinsic height", { intrinsicSize: { width: 100, height: Number.NaN } }],
    ["degenerate source transform", {
      transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 0, y: 1 } },
    }],
  ] as const)("rejects a reference with %s before calibration", (_name, override) => {
    expect(previewCalibration(makeReference(override), validInput)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PLAN_REFERENCE_GEOMETRY", entityId: referenceId },
    });
  });

  it("rejects a finite calibration whose transformed corners overflow the world range", () => {
    const reference = makeReference({
      transform: {
        translation: { x: 999_999_900, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
      },
    });

    expect(previewCalibration(reference, {
      ...validInput,
      measuredDistanceMm: 200,
    })).toMatchObject({
      ok: false,
      issue: { code: "PLAN_REFERENCE_OUT_OF_RANGE", entityId: referenceId },
    });
  });

  it("does not mutate a discarded preview and deep-owns the accepted result", () => {
    const tags = ["caller-owned"];
    const reference = makeReference({ tags });
    const input = {
      sourcePointA: { x: 0, y: 0 },
      sourcePointB: { x: 100, y: 0 },
      measuredDistanceMm: 1_000,
    };
    const before = JSON.stringify({ reference, input });

    const preview = valueOf(previewCalibration(reference, input));

    expect(JSON.stringify({ reference, input })).toBe(before);
    expect(preview.after).not.toBe(reference);
    expect(preview.after.tags).not.toBe(tags);
    expect(preview.after.transform).not.toBe(reference.transform);
    expect(preview.after.calibration).not.toBe(input);
    expect(preview.after.calibration?.sourcePointA).not.toBe(input.sourcePointA);

    tags.push("later mutation");
    input.sourcePointA.x = 99;
    expect(preview.after.tags).toEqual(["caller-owned"]);
    expect(preview.after.calibration?.sourcePointA).toEqual({ x: 0, y: 0 });
  });
});
