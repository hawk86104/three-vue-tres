import { describe, expect, it } from "vitest";
import type { AssetRecord } from "@aethertwin/core-model";
import {
  ASSET_IMPORT_STAGES,
  AssetPolicyError,
  assertAssetImportRequest,
  assertAssetImportProgressTransition,
  classifyAssetMedia,
  composeInitialPlanReference,
  sanitizeAssetDisplayName,
  type AssetImportProgress,
} from "./index";

const uuid = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";
const floorId = "33333333-3333-4333-8333-333333333333";
const layerId = "44444444-4444-4444-8444-444444444444";
const referenceId = "55555555-5555-4555-8555-555555555555";

function asset(mediaType: AssetRecord["mediaType"]): AssetRecord {
  return {
    id: assetId,
    sha256: "a".repeat(64),
    relativePath: `assets/sha256/aa/${"a".repeat(64)}.${mediaType === "image/jpeg" ? "jpg" : mediaType === "image/svg+xml" ? "svg" : mediaType === "video/mp4" ? "mp4" : mediaType === "video/webm" ? "webm" : "png"}`,
    mediaType,
    size: 1,
  };
}

describe("asset media policy", () => {
  it("rejects a filename extension that disagrees with the detected signature", () => {
    expect(() => classifyAssetMedia({
      displayName: "floor-plan.png",
      signature: "image/jpeg",
      byteLength: 1,
      facts: { kind: "image", width: 1, height: 1 },
    })).toThrow(AssetPolicyError);
  });

  it("accepts .jpg as JPEG and returns the canonical jpg extension", () => {
    expect(classifyAssetMedia({
      displayName: "floor-plan.jpg",
      signature: "image/jpeg",
      byteLength: 1,
      facts: { kind: "image", width: 1, height: 1 },
    })).toEqual({ mediaType: "image/jpeg", canonicalExtension: "jpg", facts: { kind: "image", width: 1, height: 1 } });
  });

  it.each([
    ["raster bytes", { displayName: "a.png", signature: "image/png", byteLength: 256 * 1024 * 1024 + 1, facts: { kind: "image", width: 1, height: 1 } }],
    ["zero image axis", { displayName: "a.png", signature: "image/png", byteLength: 1, facts: { kind: "image", width: 0, height: 1 } }],
    ["image axis above limit", { displayName: "a.png", signature: "image/png", byteLength: 1, facts: { kind: "image", width: 16_385, height: 1 } }],
    ["decoded pixels above limit", { displayName: "a.png", signature: "image/png", byteLength: 1, facts: { kind: "image", width: 16_384, height: 16_384 + 1 } }],
    ["svg bytes", { displayName: "a.svg", signature: "image/svg+xml", byteLength: 32 * 1024 * 1024 + 1, facts: { kind: "image", width: 1, height: 1 } }],
    ["video bytes", { displayName: "a.webm", signature: "video/webm", byteLength: 4 * 1024 * 1024 * 1024 + 1, facts: { kind: "video" } }],
    ["unsafe integer", { displayName: "a.mp4", signature: "video/mp4", byteLength: Number.MAX_SAFE_INTEGER + 1, facts: { kind: "video" } }],
    ["negative bytes", { displayName: "a.mp4", signature: "video/mp4", byteLength: -1, facts: { kind: "video" } }],
  ] as const)("rejects %s", (_name, input) => {
    expect(() => classifyAssetMedia(input)).toThrow(AssetPolicyError);
  });

  it("accepts every exact media limit", () => {
    expect(classifyAssetMedia({
      displayName: "a.png",
      signature: "image/png",
      byteLength: 256 * 1024 * 1024,
      facts: { kind: "image", width: 16_384, height: 16_384 },
    }).mediaType).toBe("image/png");
    expect(classifyAssetMedia({
      displayName: "a.svg",
      signature: "image/svg+xml",
      byteLength: 32 * 1024 * 1024,
      facts: { kind: "image", width: 1, height: 1 },
    }).mediaType).toBe("image/svg+xml");
    expect(classifyAssetMedia({
      displayName: "a.webm",
      signature: "video/webm",
      byteLength: 4 * 1024 * 1024 * 1024,
      facts: { kind: "video" },
    }).mediaType).toBe("video/webm");
  });

  it("allows only image media for a plan-reference role", () => {
    expect(() => assertAssetImportRequest({
      operationId: uuid,
      role: "plan-reference",
      source: { kind: "native-path", path: "C:\\picked\\plan.webm", displayName: "plan.webm" },
      media: { displayName: "plan.webm", signature: "video/webm", byteLength: 1, facts: { kind: "video" } },
    })).toThrow(AssetPolicyError);
  });

  it("rejects an unknown runtime role before it can use image policy", () => {
    const untypedRequest = {
      operationId: uuid,
      role: "unknown-role",
      source: { kind: "native-path", path: "C:\\picked\\image.png", displayName: "image.png" },
      media: { displayName: "image.png", signature: "image/png", byteLength: 1, facts: { kind: "image", width: 1, height: 1 } },
    };

    expect(() => assertAssetImportRequest(untypedRequest as unknown as Parameters<typeof assertAssetImportRequest>[0])).toThrow(AssetPolicyError);
  });

  it("sanitizes a display name to a basename without path or control characters", () => {
    expect(sanitizeAssetDisplayName("  C:\\private\\nested/plan\u0000 final.png  ")).toBe("plan final.png");
  });

  it("requires a caller-supplied UUID operation id and keeps the source transient", () => {
    const request = assertAssetImportRequest({
      operationId: uuid,
      role: "content-image",
      source: { kind: "native-path", path: "C:\\private\\image.png", displayName: "image.png" },
      media: { displayName: "image.png", signature: "image/png", byteLength: 1, facts: { kind: "image", width: 1, height: 1 } },
    });
    expect(request.operationId).toBe(uuid);
    expect(Object.keys(request).sort()).toEqual(["operationId", "role", "source"]);
    expect(() => assertAssetImportRequest({ ...request, operationId: "not-a-uuid", media: { displayName: "image.png", signature: "image/png", byteLength: 1, facts: { kind: "image", width: 1, height: 1 } } })).toThrow(AssetPolicyError);
  });
});

describe("asset import contracts", () => {
  it("exposes five ordered stages and accepts only monotonic progress", () => {
    expect(ASSET_IMPORT_STAGES).toEqual(["capture", "validate", "hash", "publish", "complete"]);
    const first: AssetImportProgress = { operationId: uuid, stage: "capture", completedBytes: 0, totalBytes: 10 };
    const next: AssetImportProgress = { operationId: uuid, stage: "hash", completedBytes: 4, totalBytes: 10 };
    expect(() => assertAssetImportProgressTransition(first, next)).not.toThrow();
    expect(() => assertAssetImportProgressTransition(next, first)).toThrow(AssetPolicyError);
    const unknownStage = "unknown-stage" as unknown as AssetImportProgress["stage"];
    expect(() => assertAssetImportProgressTransition(null, {
      operationId: uuid, stage: unknownStage, completedBytes: 0, totalBytes: 10,
    })).toThrow(AssetPolicyError);
    expect(() => assertAssetImportProgressTransition(first, {
      operationId: uuid, stage: unknownStage, completedBytes: 4, totalBytes: 10,
    })).toThrow(AssetPolicyError);
  });

  it("uses stable, redacted issue codes", () => {
    expect(AssetPolicyError.issueCodes).toEqual([
      "ASSET_MISSING",
      "ASSET_CORRUPT",
      "ASSET_CODEC_PREVIEW_UNAVAILABLE",
    ]);
  });
});

describe("initial plan-reference composition", () => {
  it("creates an uncalibrated unlocked image reference from intrinsic media facts only", () => {
    const reference = composeInitialPlanReference({
      id: referenceId,
      name: "Floor plan",
      tags: ["imported"],
      floorId,
      layerId,
      asset: asset("image/png"),
      facts: { kind: "image", width: 2400, height: 1800 },
    });

    expect(reference).toEqual({
      id: referenceId,
      name: "Floor plan",
      tags: ["imported"],
      floorId,
      layerId,
      assetId,
      intrinsicSize: { width: 2400, height: 1800 },
      transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
      opacity: 0.65,
      locked: false,
      calibration: null,
    });
  });

  it("rejects video assets and non-image facts for plan-reference composition", () => {
    expect(() => composeInitialPlanReference({
      id: referenceId,
      name: "Video",
      tags: [],
      floorId,
      layerId,
      asset: asset("video/mp4"),
      facts: { kind: "video" },
    })).toThrow(AssetPolicyError);
  });

  it.each([
    ["axis above the safe limit", { kind: "image", width: 16_385, height: 1 }],
    ["decoded pixels above the safe limit", { kind: "image", width: 16_384, height: 16_385 }],
    ["a non-integer axis", { kind: "image", width: 1.5, height: 1 }],
    ["an unsafe integer axis", { kind: "image", width: Number.MAX_SAFE_INTEGER + 1, height: 1 }],
  ] as const)("rejects %s passed directly to composition", (_name, facts) => {
    expect(() => composeInitialPlanReference({
      id: referenceId,
      name: "Unsafe facts",
      tags: [],
      floorId,
      layerId,
      asset: asset("image/png"),
      facts,
    })).toThrow(AssetPolicyError);
  });
});
