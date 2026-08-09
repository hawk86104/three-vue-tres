import { describe, expect, it } from "vitest";
import {
  PROJECT_EXPORT_MAX_CHUNK_BYTES,
  parseProjectExportPreset,
  projectExportDimensions,
} from "./index";

describe("project export presets", () => {
  it.each([
    ["full-hd", 1920, 1080, 8_294_400],
    ["ultra-hd", 3840, 2160, 33_177_600],
  ] as const)("maps %s without fallback", (preset, width, height, bytes) => {
    const dimensions = projectExportDimensions(preset);
    expect(dimensions).toEqual({ preset, width, height });
    expect(width * height * 4).toBe(bytes);
    expect(Object.isFrozen(dimensions)).toBe(true);
  });

  it("locks the native chunk ceiling", () => {
    expect(PROJECT_EXPORT_MAX_CHUNK_BYTES).toBe(1_048_576);
  });

  it.each(["full-hd", "ultra-hd"] as const)("parses %s", (preset) => {
    expect(parseProjectExportPreset(preset)).toBe(preset);
  });

  it.each(["", "4k", null, 1])("rejects unsupported preset %j", (value) => {
    expect(() => parseProjectExportPreset(value)).toThrowError(
      expect.objectContaining({ code: "EXPORT_FRAME_INVALID" }),
    );
  });
});
