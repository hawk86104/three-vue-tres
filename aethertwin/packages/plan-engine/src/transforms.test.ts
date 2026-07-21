import { describe, expect, it } from "vitest";
import { applyTransform, composeTransform, invertTransform, normalizeTransform } from "./index";

describe("2D transforms", () => {
  it("applies scale, then rotation, then translation", () => {
    expect(applyTransform(
      { x: 1, y: 2 },
      { scale: { x: 2, y: 3 }, rotation: Math.PI / 2, translation: { x: 10, y: 20 } },
    )).toEqual({ x: 4, y: 22 });
  });

  it("inverts a transform point and reports non-positive scale", () => {
    const transform = { scale: { x: 2, y: 3 }, rotation: Math.PI / 2, translation: { x: 10, y: 20 } };
    expect(invertTransform({ x: 4, y: 22 }, transform)).toEqual({ ok: true, value: { x: 1, y: 2 } });
    expect(invertTransform({ x: 0, y: 0 }, { ...transform, scale: { x: 0, y: 3 } })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_TRANSFORM" },
    });
  });

  it("composes transforms in application order", () => {
    const first = { scale: { x: 2, y: 2 }, rotation: Math.PI / 2, translation: { x: 4, y: 0 } };
    const second = { scale: { x: 3, y: 3 }, rotation: Math.PI / 2, translation: { x: 0, y: 5 } };
    const composed = composeTransform(first, second);

    expect(composed).toEqual({
      ok: true,
      value: { scale: { x: 6, y: 6 }, rotation: -Math.PI, translation: { x: 0, y: 17 } },
    });
  });

  it("normalizes rotation and snaps near-zero values", () => {
    expect(normalizeTransform({
      scale: { x: 1, y: 1 },
      rotation: Math.PI * 3,
      translation: { x: 5e-10, y: -5e-10 },
    })).toEqual({
      ok: true,
      value: { scale: { x: 1, y: 1 }, rotation: -Math.PI, translation: { x: 0, y: 0 } },
    });
  });


  it("composes the representable right-angle non-uniform reviewer case", () => {
    const first = { scale: { x: 2, y: 1 }, rotation: Math.PI / 2, translation: { x: 0, y: 0 } };
    const second = { scale: { x: 3, y: 1 }, rotation: 0, translation: { x: 0, y: 0 } };
    const point = { x: 4, y: -5 };
    const composed = composeTransform(first, second);

    expect(composed).toEqual({
      ok: true,
      value: { scale: { x: 2, y: 3 }, rotation: Math.PI / 2, translation: { x: 0, y: 0 } },
    });
    if (!composed.ok) throw new Error("Expected a representable composition.");
    expect(applyTransform(point, composed.value)).toEqual(
      applyTransform(applyTransform(point, first), second),
    );
  });

  it("rejects non-uniform compositions that introduce shear", () => {
    expect(composeTransform(
      { scale: { x: 2, y: 1 }, rotation: Math.PI / 4, translation: { x: 0, y: 0 } },
      { scale: { x: 3, y: 1 }, rotation: 0, translation: { x: 0, y: 0 } },
    )).toMatchObject({
      ok: false,
      issue: { code: "NON_REPRESENTABLE_TRANSFORM" },
    });
  });

  it("preserves tiny legitimate point coordinates through identity transforms", () => {
    const point = { x: 5e-10, y: -5e-10 };
    const identity = { scale: { x: 1, y: 1 }, rotation: 0, translation: { x: 0, y: 0 } };

    expect(applyTransform(point, identity)).toEqual(point);
    expect(invertTransform(point, identity)).toEqual({ ok: true, value: point });
  });
});
