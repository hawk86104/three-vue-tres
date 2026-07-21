import { describe, expect, it } from "vitest";
import { formatLength, parseLength } from "./index";

describe("length units", () => {
  it.each([["1m", 1000], ["25cm", 250], ["12.5mm", 12.5]])("parses %s", (text, mm) => {
    expect(parseLength(text, "mm")).toEqual({ ok: true, value: mm });
  });

  it("uses the supplied unit when the text has no suffix", () => {
    expect(parseLength("1.25", "cm")).toEqual({ ok: true, value: 12.5 });
  });

  it.each(["", " ", "-1mm", "Infinitymm", "12px", "12mm more"])("rejects invalid length %j", (text) => {
    expect(parseLength(text, "mm")).toMatchObject({ ok: false, issue: { code: "INVALID_LENGTH" } });
  });

  it("formats millimetres in the requested display unit", () => {
    expect(formatLength(1250, "m", 2)).toBe("1.25m");
    expect(formatLength(1250, "cm", 1)).toBe("125cm");
    expect(formatLength(12.5, "mm")).toBe("12.5mm");
    expect(formatLength(1000, "mm", 0)).toBe("1000mm");
  });
});
