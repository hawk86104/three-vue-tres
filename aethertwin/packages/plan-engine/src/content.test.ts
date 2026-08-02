import type { Point2, ProductContent } from "@aethertwin/core-model";
import { describe, expect, test } from "vitest";
import {
  createProductHotspotIntent,
  reorderProductMedia,
  type PlanIssue,
  type PlanResult,
  type ProductHotspotIntent,
} from "./index";

const FLOOR_ID = "00000000-0000-4000-8000-000000000001";
const LAYER_ID = "00000000-0000-4000-8000-000000000002";

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function intentOf(result: PlanResult<ProductHotspotIntent>): ProductHotspotIntent {
  if (!result.ok) throw new Error(`${result.issue.code}: ${result.issue.message}`);
  return result.value;
}

function contentOf(result: PlanResult<ProductContent>): ProductContent {
  if (!result.ok) throw new Error(`${result.issue.code}: ${result.issue.message}`);
  return result.value;
}

function issueOf<T>(result: PlanResult<T>): PlanIssue {
  if (result.ok) throw new Error("expected content intent failure");
  return result.issue;
}

function content(mediaAssetIds: readonly string[]): ProductContent {
  return {
    id: uuid(20),
    name: "Display content",
    tags: ["featured"],
    targetEntityId: uuid(21),
    description: "Durable description",
    mediaAssetIds,
  };
}

describe("createProductHotspotIntent", () => {
  test("creates an identity-transform product hotspot and empty targeted content", () => {
    const point: Point2 = { x: 1250, y: -500 };
    const input = {
      entityId: uuid(10),
      contentId: uuid(11),
      floorId: FLOOR_ID,
      layerId: LAYER_ID,
      point,
      name: "North display",
    };
    const before = structuredClone(input);

    const intent = intentOf(createProductHotspotIntent(input));

    expect(input).toEqual(before);
    expect(intent.entity).toEqual({
      id: input.entityId,
      name: input.name,
      tags: [],
      floorId: FLOOR_ID,
      layerId: LAYER_ID,
      transform: {
        translation: point,
        rotation: 0,
        scale: { x: 1, y: 1 },
      },
      locked: false,
      type: "poi",
      kind: "product-hotspot",
    });
    expect(intent.entity.transform.translation).not.toBe(point);
    expect("spatial3D" in intent.entity).toBe(false);
    expect("radius" in intent.entity).toBe(false);
    expect(intent.content).toEqual({
      id: input.contentId,
      name: input.name,
      tags: [],
      targetEntityId: input.entityId,
      description: "",
      mediaAssetIds: [],
    });
    expect(intent.content.mediaAssetIds).toHaveLength(0);
  });

  test("rejects invalid hotspot inputs without constructing a partial intent", () => {
    const base = {
      entityId: uuid(12),
      contentId: uuid(13),
      floorId: FLOOR_ID,
      layerId: LAYER_ID,
      point: { x: 0, y: 0 },
      name: "Display",
    };

    expect(issueOf(createProductHotspotIntent({
      ...base,
      point: { x: Number.NaN, y: 0 },
    })).code).toBe("INVALID_HOTSPOT_POINT");
    expect(issueOf(createProductHotspotIntent({
      ...base,
      name: "   ",
    })).code).toBe("INVALID_HOTSPOT_NAME");
    expect(issueOf(createProductHotspotIntent({
      ...base,
      contentId: base.entityId,
    })).code).toBe("DUPLICATE_RECORD_ID");
    expect(issueOf(createProductHotspotIntent({
      ...base,
      entityId: base.floorId,
    })).code).toBe("DUPLICATE_RECORD_ID");
    expect(issueOf(createProductHotspotIntent({
      ...base,
      contentId: base.layerId,
    })).code).toBe("DUPLICATE_RECORD_ID");
    expect(issueOf(createProductHotspotIntent({
      ...base,
      layerId: base.floorId,
    })).code).toBe("DUPLICATE_RECORD_ID");
    expect(issueOf(createProductHotspotIntent({
      ...base,
      entityId: "not-a-uuid",
    })).code).toBe("INVALID_RECORD_ID");
  });
});

describe("reorderProductMedia", () => {
  test("moves media up and down without mutating or aliasing the source", () => {
    const first = uuid(30);
    const second = uuid(31);
    const third = uuid(32);
    const original = content([first, second, third]);
    const before = structuredClone(original);

    const movedUp = contentOf(reorderProductMedia(original, second, "up"));
    const movedDown = contentOf(reorderProductMedia(original, second, "down"));

    expect(original).toEqual(before);
    expect(movedUp).toEqual({ ...original, mediaAssetIds: [second, first, third] });
    expect(movedDown).toEqual({ ...original, mediaAssetIds: [first, third, second] });
    expect(movedUp).not.toBe(original);
    expect(movedUp.tags).not.toBe(original.tags);
    expect(movedUp.mediaAssetIds).not.toBe(original.mediaAssetIds);
  });

  test("returns immutable no-op copies at the list boundaries", () => {
    const first = uuid(40);
    const last = uuid(41);
    const original = content([first, last]);

    const firstUp = contentOf(reorderProductMedia(original, first, "up"));
    const lastDown = contentOf(reorderProductMedia(original, last, "down"));

    expect(firstUp).toEqual(original);
    expect(lastDown).toEqual(original);
    expect(firstUp).not.toBe(original);
    expect(lastDown).not.toBe(original);
    expect(firstUp.mediaAssetIds).not.toBe(original.mediaAssetIds);
    expect(lastDown.mediaAssetIds).not.toBe(original.mediaAssetIds);
  });

  test("rejects missing and duplicate media IDs without changing the source", () => {
    const first = uuid(50);
    const second = uuid(51);
    const original = content([first, second]);
    const duplicate = content([first, first]);
    const before = structuredClone(original);

    expect(issueOf(reorderProductMedia(original, uuid(52), "up"))).toMatchObject({
      code: "MEDIA_ASSET_NOT_FOUND",
      entityId: original.id,
    });
    expect(issueOf(reorderProductMedia(duplicate, first, "down"))).toMatchObject({
      code: "DUPLICATE_MEDIA_ASSET_ID",
      entityId: duplicate.id,
    });
    expect(original).toEqual(before);
  });
});
