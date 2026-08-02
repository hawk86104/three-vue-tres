import type {
  Point2,
  PointOfInterest,
  ProductContent,
} from "@aethertwin/core-model";
import { planFailure, planSuccess, type PlanResult } from "./result";

const canonicalIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface ProductHotspotIntent {
  readonly entity: PointOfInterest;
  readonly content: ProductContent;
}

export interface CreateProductHotspotInput {
  readonly entityId: string;
  readonly contentId: string;
  readonly floorId: string;
  readonly layerId: string;
  readonly point: Point2;
  readonly name: string;
}

function invalidId(input: CreateProductHotspotInput): string | undefined {
  for (const id of [
    input.entityId,
    input.contentId,
    input.floorId,
    input.layerId,
  ]) {
    if (!canonicalIdPattern.test(id)) return id;
  }
  return undefined;
}

function duplicateId(input: CreateProductHotspotInput): string | undefined {
  const seen = new Set<string>();
  for (const id of [
    input.entityId,
    input.contentId,
    input.floorId,
    input.layerId,
  ]) {
    if (seen.has(id)) return id;
    seen.add(id);
  }
  return undefined;
}

export function createProductHotspotIntent(
  input: CreateProductHotspotInput,
): PlanResult<ProductHotspotIntent> {
  const invalidRecordId = invalidId(input);
  if (invalidRecordId !== undefined) {
    return planFailure(
      "INVALID_RECORD_ID",
      "Product hotspot record, floor, and layer IDs must be canonical UUIDs.",
      invalidRecordId,
    );
  }
  const duplicateRecordId = duplicateId(input);
  if (duplicateRecordId !== undefined) {
    return planFailure(
      "DUPLICATE_RECORD_ID",
      "Product hotspot, content, floor, and layer IDs must be distinct.",
      duplicateRecordId,
    );
  }
  if (!Number.isFinite(input.point.x) || !Number.isFinite(input.point.y)) {
    return planFailure(
      "INVALID_HOTSPOT_POINT",
      "Product hotspot coordinates must be finite.",
      input.entityId,
    );
  }
  if (input.name.trim().length === 0) {
    return planFailure(
      "INVALID_HOTSPOT_NAME",
      "Product hotspot name must not be blank.",
      input.entityId,
    );
  }

  const entity: PointOfInterest = {
    id: input.entityId,
    name: input.name,
    tags: [],
    floorId: input.floorId,
    layerId: input.layerId,
    transform: {
      translation: { x: input.point.x, y: input.point.y },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    locked: false,
    type: "poi",
    kind: "product-hotspot",
  };
  const content: ProductContent = {
    id: input.contentId,
    name: input.name,
    tags: [],
    targetEntityId: input.entityId,
    description: "",
    mediaAssetIds: [],
  };
  return planSuccess({ entity, content });
}

export function reorderProductMedia(
  content: ProductContent,
  mediaAssetId: string,
  direction: "up" | "down",
): PlanResult<ProductContent> {
  if (new Set(content.mediaAssetIds).size !== content.mediaAssetIds.length) {
    return planFailure(
      "DUPLICATE_MEDIA_ASSET_ID",
      "Product content cannot contain duplicate media asset IDs.",
      content.id,
    );
  }
  if (direction !== "up" && direction !== "down") {
    return planFailure(
      "INVALID_MEDIA_DIRECTION",
      "Product media direction must be up or down.",
      content.id,
    );
  }

  const currentIndex = content.mediaAssetIds.indexOf(mediaAssetId);
  if (currentIndex < 0) {
    return planFailure(
      "MEDIA_ASSET_NOT_FOUND",
      "The requested media asset is not attached to this product content.",
      content.id,
    );
  }

  const mediaAssetIds = [...content.mediaAssetIds];
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex >= 0 && targetIndex < mediaAssetIds.length) {
    const current = mediaAssetIds[currentIndex]!;
    mediaAssetIds[currentIndex] = mediaAssetIds[targetIndex]!;
    mediaAssetIds[targetIndex] = current;
  }
  return planSuccess({
    ...content,
    tags: [...content.tags],
    mediaAssetIds,
  });
}
