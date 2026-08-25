import { message, type StudioMessageDescriptor } from "./format-message";
import { ProjectBackendError } from "../backend/project-backend-error";

export const LOCALIZED_ERROR_CODES = [
  "IPC_INVALID_REQUEST", "EXPORT_ALREADY_ACTIVE", "EXPORT_NOT_FOUND", "EXPORT_SESSION_MISMATCH", "EXPORT_RESULT_ACTION_FAILED", "SESSION_NOT_FOUND", "HOST_STATE_UNAVAILABLE", "SESSION_STATE_UNAVAILABLE", "SESSION_RECOVERY_REQUIRED", "PROJECT_CREATED_SESSION_UNAVAILABLE", "INVALID_PROJECT_NAME", "PROJECT_ALREADY_EXISTS", "PROJECT_NOT_FOUND", "INVALID_PROJECT_STRUCTURE", "UNSUPPORTED_SCHEMA_VERSION", "MANIFEST_DATABASE_MISMATCH", "DATABASE_ERROR", "PROJECT_LOCKED", "STALE_PROJECT_LOCK", "INVALID_RESOURCE_PATH", "RECOVERY_FAILED", "FILESYSTEM_ERROR", "ASSET_IMPORT_OPERATION_EXISTS", "ASSET_IMPORT_OPERATION_NOT_FOUND", "ASSET_PROGRESS_OPERATION_MISMATCH", "ASSET_PROGRESS_NOT_MONOTONIC", "ASSET_PROGRESS_DELIVERY_FAILED", "INVALID_ASSET_IMPORT_REQUEST", "UNSUPPORTED_ASSET_TYPE", "ASSET_EXTENSION_SIGNATURE_MISMATCH", "ASSET_ROLE_MEDIA_MISMATCH", "ASSET_TOO_LARGE", "INVALID_ASSET_IMAGE_DIMENSIONS", "UNSAFE_SVG", "ASSET_SOURCE_CHANGED", "ASSET_SOURCE_NOT_REGULAR_FILE", "ASSET_IMPORT_CANCELLED", "ASSET_COLLISION", "ASSET_IO_FAILED", "ASSET_NOT_FOUND", "ASSET_MISSING", "ASSET_NOT_REGULAR_FILE", "ASSET_SIZE_MISMATCH", "ASSET_DIGEST_MISMATCH", "ASSET_UNAVAILABLE", "EXPORT_CHUNK_OUT_OF_ORDER", "EXPORT_CHUNK_TOO_LARGE", "EXPORT_BYTE_COUNT_MISMATCH", "EXPORT_ENCODE_FAILED", "EXPORT_VALIDATION_FAILED", "EXPORT_PUBLISH_FAILED", "EXPORT_RENDERER_NOT_READY", "EXPORT_CAPTURE_EXPIRED", "EXPORT_TEXTURE_UNAVAILABLE", "EXPORT_RESOLUTION_UNSUPPORTED", "EXPORT_FRAME_INVALID", "EXPORT_CANCELLED", "NATIVE_INVOCATION_FAILED", "TAURI_RUNTIME_REQUIRED", "WEB_SANDBOX_DISABLED",
] as const;

export type LocalizedErrorCode = (typeof LOCALIZED_ERROR_CODES)[number];
const knownCodes = new Set<string>(LOCALIZED_ERROR_CODES);

function codeOf(value: unknown): LocalizedErrorCode | null {
  if (value === null || typeof value !== "object" || !("code" in value)) return null;
  const code = (value as { readonly code?: unknown }).code;
  return typeof code === "string" && knownCodes.has(code) ? code as LocalizedErrorCode : null;
}

export function localizedErrorDescriptor(value: unknown): StudioMessageDescriptor {
  const code = codeOf(value);
  if (code === "PROJECT_LOCKED") return message("error.projectLocked");
  if (code === "PROJECT_NOT_FOUND") return message("error.projectNotFound");
  if (code === "PROJECT_ALREADY_EXISTS") return message("error.projectAlreadyExists");
  if (code === "INVALID_PROJECT_NAME") return message("error.invalidProjectName");
  if (code === "STALE_PROJECT_LOCK" || code === "RECOVERY_FAILED") return message("error.projectRecovery");
  if (code !== null && ["IPC_INVALID_REQUEST", "SESSION_NOT_FOUND", "HOST_STATE_UNAVAILABLE", "SESSION_STATE_UNAVAILABLE", "SESSION_RECOVERY_REQUIRED", "PROJECT_CREATED_SESSION_UNAVAILABLE"].includes(code)) return message("error.desktopUnavailable");
  if (code !== null && ["INVALID_PROJECT_STRUCTURE", "UNSUPPORTED_SCHEMA_VERSION", "MANIFEST_DATABASE_MISMATCH", "DATABASE_ERROR", "INVALID_RESOURCE_PATH", "FILESYSTEM_ERROR"].includes(code)) return message("error.projectRecovery");
  if (code !== null && (code.startsWith("ASSET_") || ["INVALID_ASSET_IMPORT_REQUEST", "UNSUPPORTED_ASSET_TYPE", "INVALID_ASSET_IMAGE_DIMENSIONS", "UNSAFE_SVG"].includes(code))) return message("error.assetOperation");
  if (code !== null && code.startsWith("EXPORT_")) return message("error.exportOperation");
  if (code !== null && (code === "NATIVE_INVOCATION_FAILED" || code === "TAURI_RUNTIME_REQUIRED")) return message("error.desktopUnavailable");
  if (code === "WEB_SANDBOX_DISABLED") return message("error.webSandboxDisabled");
  return message("error.generic");
}

export function localizedErrorLogRef(value: unknown): string | null {
  if (!(value instanceof ProjectBackendError)) return null;
  if (value === null || typeof value !== "object" || !("logRef" in value)) return null;
  const logRef = (value as { readonly logRef?: unknown }).logRef;
  return typeof logRef === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(logRef) ? logRef : null;
}
