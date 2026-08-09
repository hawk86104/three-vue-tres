import type {
  SceneExportCapture,
  SceneExportFrame,
  SceneExportPort,
} from "@aethertwin/render-scene-3d";
import { describe, expect, it } from "vitest";
import {
  prepareProjectExport,
  validateProjectExportFrame,
  type ProjectExportContext,
  type ProjectExportDimensions,
} from "./index";

const fullHd = Object.freeze({
  preset: "full-hd" as const,
  width: 1920,
  height: 1080,
});

function exportContext(
  overrides: Partial<ProjectExportContext> = {},
): ProjectExportContext {
  return {
    projectPath: "projects/showroom",
    projectId: "project-a",
    snapshotSequence: 17,
    activeFloorId: "floor-a",
    sessionGeneration: 3,
    assetIssues: [],
    isCurrent: () => true,
    ...overrides,
  };
}

function capture(overrides: Record<string, unknown> = {}): SceneExportCapture {
  return {
    scene: {},
    camera: {},
    provenance: {
      projectId: "project-a",
      snapshotSequence: 17,
      activeFloorId: "floor-a",
    },
    requiredTextureAssetIds: [],
    limits: {
      maxTextureSize: 3840,
      maxRenderbufferSize: 3840,
    },
    ...overrides,
  } as unknown as SceneExportCapture;
}

function port(
  requiredTextureAssetIds: readonly string[] = [],
  overrides: Record<string, unknown> = {},
): SceneExportPort {
  return {
    capture: () => capture({ requiredTextureAssetIds, ...overrides }),
  } as SceneExportPort;
}

function frame(
  dimensions: ProjectExportDimensions = fullHd,
  overrides: Record<string, unknown> = {},
): SceneExportFrame {
  return {
    width: dimensions.width,
    height: dimensions.height,
    origin: "bottom-left",
    rgba: new Uint8Array(dimensions.width * dimensions.height * 4),
    ...overrides,
  } as unknown as SceneExportFrame;
}

describe("project export preflight", () => {
  it("maps renderer capture failure to a closed export error", () => {
    const unavailablePort = {
      capture: () => {
        throw new Error("renderer unavailable");
      },
    } as unknown as SceneExportPort;

    expect(() => prepareProjectExport(unavailablePort, "full-hd", exportContext()))
      .toThrowError(expect.objectContaining({ code: "EXPORT_RENDERER_NOT_READY" }));
  });

  it.each([
    ["project", { projectId: "project-b" }],
    ["sequence", { snapshotSequence: 18 }],
    ["floor", { activeFloorId: "floor-b" }],
  ] as const)("rejects a %s provenance mismatch", (_field, provenance) => {
    expect(() => prepareProjectExport(
      port([], { provenance: { projectId: "project-a", snapshotSequence: 17, activeFloorId: "floor-a", ...provenance } }),
      "full-hd",
      exportContext(),
    )).toThrowError(expect.objectContaining({ code: "EXPORT_CAPTURE_EXPIRED" }));
  });

  it("rejects a capture when the Studio context is no longer current", () => {
    expect(() => prepareProjectExport(port(), "full-hd", exportContext({
      isCurrent: () => false,
    }))).toThrowError(expect.objectContaining({ code: "EXPORT_CAPTURE_EXPIRED" }));
  });

  it.each([
    ["maxTextureSize", { maxTextureSize: 1919, maxRenderbufferSize: 1920 }],
    ["maxRenderbufferSize", { maxTextureSize: 1920, maxRenderbufferSize: 1919 }],
  ] as const)("rejects when %s is below the preset requirement", (_limit, limits) => {
    expect(() => prepareProjectExport(
      port([], { limits }),
      "full-hd",
      exportContext(),
    )).toThrowError(expect.objectContaining({
      code: "EXPORT_RESOLUTION_UNSUPPORTED",
      details: { preset: "full-hd", ...limits },
    }));
  });

  it("accepts GPU limits that exactly meet the preset requirement", () => {
    const prepared = prepareProjectExport(
      port([], { limits: { maxTextureSize: 1920, maxRenderbufferSize: 1920 } }),
      "full-hd",
      exportContext(),
    );

    expect(prepared.dimensions).toEqual(fullHd);
    expect(prepared.expectedByteLength).toBe(8_294_400);
  });

  it("rejects required texture issues with sorted IDs", () => {
    const context = exportContext({
      assetIssues: [
        { assetId: "texture-b", code: "ASSET_CORRUPT" },
        { assetId: "texture-a", code: "ASSET_MISSING" },
        { assetId: "texture-a", code: "ASSET_MISSING" },
      ],
    });

    expect(() => prepareProjectExport(port(["texture-b", "texture-a"]), "full-hd", context))
      .toThrowError(expect.objectContaining({
        code: "EXPORT_TEXTURE_UNAVAILABLE",
        details: { assetIds: ["texture-a", "texture-b"] },
      }));
  });

  it("rejects unsupported preset input", () => {
    expect(() => prepareProjectExport(
      port(),
      "square" as unknown as "full-hd",
      exportContext(),
    )).toThrowError(expect.objectContaining({ code: "EXPORT_FRAME_INVALID" }));
  });
});

describe("project export frame validation", () => {
  it("returns the same valid frame without copying its RGBA bytes", () => {
    const source = frame();

    expect(validateProjectExportFrame(source, fullHd)).toBe(source);
  });

  it.each([
    ["origin", frame(fullHd, { origin: "top-left" })],
    ["width", frame(fullHd, { width: 1919 })],
    ["height", frame(fullHd, { height: 1079 })],
    ["byte length", frame(fullHd, { rgba: new Uint8Array(8_294_399) })],
  ] as const)("rejects a frame with the wrong %s", (_field, invalidFrame) => {
    expect(() => validateProjectExportFrame(invalidFrame, fullHd))
      .toThrowError(expect.objectContaining({ code: "EXPORT_FRAME_INVALID" }));
  });

  it("rejects dimensions whose RGBA byte count exceeds safe integer precision", () => {
    const unsafeDimensions = {
      preset: "full-hd",
      width: Number.MAX_SAFE_INTEGER,
      height: 2,
    } as unknown as ProjectExportDimensions;
    const unsafeFrame = {
      width: Number.MAX_SAFE_INTEGER,
      height: 2,
      origin: "bottom-left",
      rgba: new Uint8Array(0),
    } as unknown as SceneExportFrame;

    expect(() => validateProjectExportFrame(unsafeFrame, unsafeDimensions))
      .toThrowError(expect.objectContaining({ code: "EXPORT_FRAME_INVALID" }));
  });
});
