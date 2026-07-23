import type { PlanReference } from "@aethertwin/core-model";
import { AssetPolicyError, assertRoleAllowsMedia } from "./media-policy";
import type { ComposeInitialPlanReferenceInput } from "./types";

export function composeInitialPlanReference(input: ComposeInitialPlanReferenceInput): PlanReference {
  assertRoleAllowsMedia("plan-reference", input.asset.mediaType);
  if (input.facts.kind !== "image") {
    throw new AssetPolicyError("ASSET_FACTS_MEDIA_MISMATCH", "Plan references require intrinsic image dimensions.");
  }
  if (!Number.isInteger(input.facts.width) || !Number.isInteger(input.facts.height)
    || input.facts.width < 1 || input.facts.height < 1) {
    throw new AssetPolicyError("INVALID_ASSET_IMAGE_DIMENSIONS", "Plan-reference dimensions must be positive integers.");
  }
  return {
    id: input.id,
    name: input.name,
    tags: [...input.tags],
    floorId: input.floorId,
    layerId: input.layerId,
    assetId: input.asset.id,
    intrinsicSize: { width: input.facts.width, height: input.facts.height },
    transform: {
      translation: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    opacity: 0.65,
    locked: false,
    calibration: null,
  };
}
