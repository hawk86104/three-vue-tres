import type { AssetMediaType } from "@aethertwin/core-model";
import {
  ASSET_IMPORT_STAGES,
  ASSET_ISSUE_CODES,
  type AssetImportProgress,
  type AssetImportRequest,
  type AssetImportRole,
  type AssetMediaCandidate,
  type AssetMediaFacts,
  type AssetImportSource,
  type ClassifiedAssetMedia,
} from "./types";

const MAX_RASTER_BYTES = 256 * 1024 * 1024;
const MAX_SVG_BYTES = 32 * 1024 * 1024;
const MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_IMAGE_AXIS = 16_384;
const MAX_DECODED_PIXELS = 268_435_456;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EXTENSIONS: Readonly<Record<AssetMediaType, ClassifiedAssetMedia["canonicalExtension"]>> = Object.freeze({
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
});

const IMAGE_MEDIA: ReadonlySet<AssetMediaType> = new Set(["image/png", "image/jpeg", "image/svg+xml"]);
const VIDEO_MEDIA: ReadonlySet<AssetMediaType> = new Set(["video/mp4", "video/webm"]);

export class AssetPolicyError extends Error {
  static readonly issueCodes = ASSET_ISSUE_CODES;

  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AssetPolicyError";
  }
}

export function sanitizeAssetDisplayName(value: string): string {
  const basename = value.split(/[\\/]+/).at(-1) ?? "";
  const sanitized = basename.replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/\s+/g, " ");
  return sanitized === "" || sanitized === "." || sanitized === ".." ? "asset" : sanitized;
}

export function classifyAssetMedia(candidate: AssetMediaCandidate): ClassifiedAssetMedia {
  assertSafeByteLength(candidate.byteLength);
  const extension = extensionOf(candidate.displayName);
  const canonicalExtension = EXTENSIONS[candidate.signature];
  if (extension !== canonicalExtension) {
    throw new AssetPolicyError("ASSET_EXTENSION_SIGNATURE_MISMATCH", "The file extension does not match its media signature.");
  }
  assertMediaFacts(candidate.signature, candidate.facts);
  assertMediaSize(candidate.signature, candidate.byteLength);
  return { mediaType: candidate.signature, canonicalExtension, facts: candidate.facts };
}

export function assertAssetImportRequest(
  input: AssetImportRequest & { readonly media?: AssetMediaCandidate },
): AssetImportRequest {
  if (!UUID_PATTERN.test(input.operationId)) {
    throw new AssetPolicyError("INVALID_ASSET_IMPORT_OPERATION", "The import operation id must be a UUID.");
  }
  assertSource(input.source);
  if (input.media !== undefined) {
    const media = classifyAssetMedia(input.media);
    assertRoleAllowsMedia(input.role, media.mediaType);
  }
  return { operationId: input.operationId, role: input.role, source: input.source };
}

export function assertRoleAllowsMedia(role: AssetImportRole, mediaType: AssetMediaType): void {
  const allowed = role === "content-video"
    ? VIDEO_MEDIA.has(mediaType)
    : IMAGE_MEDIA.has(mediaType);
  if (!allowed) {
    throw new AssetPolicyError("ASSET_ROLE_MEDIA_MISMATCH", "This import role does not accept the media type.");
  }
}

export function assertAssetImportProgressTransition(
  previous: AssetImportProgress | null,
  next: AssetImportProgress,
): void {
  assertProgress(next);
  if (previous === null) return;
  assertProgress(previous);
  if (previous.operationId !== next.operationId) {
    throw new AssetPolicyError("ASSET_PROGRESS_OPERATION_MISMATCH", "Import progress must belong to one operation.");
  }
  if (previous.totalBytes !== next.totalBytes || previous.completedBytes > next.completedBytes) {
    throw new AssetPolicyError("ASSET_PROGRESS_NOT_MONOTONIC", "Import byte progress must be monotonic.");
  }
  if (stageIndex(next.stage) < stageIndex(previous.stage)) {
    throw new AssetPolicyError("ASSET_PROGRESS_NOT_MONOTONIC", "Import stages cannot move backwards.");
  }
}

function assertSource(source: AssetImportSource): void {
  if (sanitizeAssetDisplayName(source.displayName) === "asset" && source.displayName.trim() !== "asset") {
    throw new AssetPolicyError("INVALID_ASSET_DISPLAY_NAME", "The import display name must include a basename.");
  }
  if (source.kind === "native-path" && source.path.length === 0) {
    throw new AssetPolicyError("INVALID_ASSET_SOURCE", "The native import source must include a path.");
  }
}

function assertSafeByteLength(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AssetPolicyError("INVALID_ASSET_BYTE_LENGTH", "Asset byte length must be a non-negative safe integer.");
  }
}

function assertMediaSize(mediaType: AssetMediaType, byteLength: number): void {
  const limit = IMAGE_MEDIA.has(mediaType)
    ? (mediaType === "image/svg+xml" ? MAX_SVG_BYTES : MAX_RASTER_BYTES)
    : MAX_VIDEO_BYTES;
  if (byteLength > limit) {
    throw new AssetPolicyError("ASSET_TOO_LARGE", "Asset byte length exceeds the media limit.");
  }
}

function assertMediaFacts(mediaType: AssetMediaType, facts: AssetMediaFacts): void {
  if (IMAGE_MEDIA.has(mediaType)) {
    if (facts.kind !== "image") {
      throw new AssetPolicyError("ASSET_FACTS_MEDIA_MISMATCH", "Image media requires intrinsic image dimensions.");
    }
    if (!Number.isInteger(facts.width) || !Number.isInteger(facts.height)
      || facts.width < 1 || facts.height < 1
      || facts.width > MAX_IMAGE_AXIS || facts.height > MAX_IMAGE_AXIS
      || facts.width * facts.height > MAX_DECODED_PIXELS) {
      throw new AssetPolicyError("INVALID_ASSET_IMAGE_DIMENSIONS", "Image dimensions are outside the safe limits.");
    }
    return;
  }
  if (facts.kind !== "video") {
    throw new AssetPolicyError("ASSET_FACTS_MEDIA_MISMATCH", "Video media cannot carry image dimensions.");
  }
}

function extensionOf(displayName: string): string {
  const basename = sanitizeAssetDisplayName(displayName);
  const dot = basename.lastIndexOf(".");
  return dot > 0 && dot < basename.length - 1 ? basename.slice(dot + 1).toLowerCase() : "";
}

function assertProgress(value: AssetImportProgress): void {
  if (!UUID_PATTERN.test(value.operationId)) {
    throw new AssetPolicyError("INVALID_ASSET_IMPORT_OPERATION", "The import operation id must be a UUID.");
  }
  assertSafeByteLength(value.completedBytes);
  assertSafeByteLength(value.totalBytes);
  if (value.completedBytes > value.totalBytes) {
    throw new AssetPolicyError("INVALID_ASSET_PROGRESS", "Completed import bytes cannot exceed the total.");
  }
  if (value.stage === "complete" && value.completedBytes !== value.totalBytes) {
    throw new AssetPolicyError("INVALID_ASSET_PROGRESS", "Completed imports must report all bytes.");
  }
}

function stageIndex(stage: AssetImportProgress["stage"]): number {
  return ASSET_IMPORT_STAGES.indexOf(stage);
}
