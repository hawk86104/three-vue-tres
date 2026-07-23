import type { AssetMediaType, AssetRecord, PlanReference } from "@aethertwin/core-model";

export type AssetImportRole = "plan-reference" | "content-image" | "content-video";

export type AssetImportSource =
  | { readonly kind: "native-path"; readonly path: string; readonly displayName: string }
  | { readonly kind: "sandbox-blob"; readonly blob: Blob; readonly displayName: string };

export type AssetMediaFacts =
  | { readonly kind: "image"; readonly width: number; readonly height: number }
  | { readonly kind: "video" };

export interface AssetImportRequest {
  readonly operationId: string;
  readonly role: AssetImportRole;
  readonly source: AssetImportSource;
}

export interface AssetImportResult {
  readonly asset: AssetRecord;
  readonly facts: AssetMediaFacts;
}

export const ASSET_IMPORT_STAGES = ["capture", "validate", "hash", "publish", "complete"] as const;
export type AssetImportStage = (typeof ASSET_IMPORT_STAGES)[number];

export interface AssetImportProgress {
  readonly operationId: string;
  readonly stage: AssetImportStage;
  readonly completedBytes: number;
  readonly totalBytes: number;
}

export const ASSET_ISSUE_CODES = [
  "ASSET_MISSING",
  "ASSET_CORRUPT",
  "ASSET_CODEC_PREVIEW_UNAVAILABLE",
] as const;
export type AssetIssueCode = (typeof ASSET_ISSUE_CODES)[number];

export interface AssetIssue {
  readonly assetId: string;
  readonly code: AssetIssueCode;
}

export interface AssetMediaCandidate {
  readonly displayName: string;
  readonly signature: AssetMediaType;
  readonly byteLength: number;
  readonly facts: AssetMediaFacts;
}

export interface ClassifiedAssetMedia {
  readonly mediaType: AssetMediaType;
  readonly canonicalExtension: "png" | "jpg" | "svg" | "mp4" | "webm";
  readonly facts: AssetMediaFacts;
}

export interface ComposeInitialPlanReferenceInput {
  readonly id: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly floorId: string;
  readonly layerId: string;
  readonly asset: AssetRecord;
  readonly facts: AssetMediaFacts;
}

export type InitialPlanReference = PlanReference;
