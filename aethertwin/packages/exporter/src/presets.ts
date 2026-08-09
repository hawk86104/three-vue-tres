import type { ProjectExportDimensions, ProjectExportPreset } from "./contracts";
import { ProjectExportError } from "./errors";

export const PROJECT_EXPORT_MAX_CHUNK_BYTES = 1_048_576 as const;

const dimensions = Object.freeze({
  "full-hd": Object.freeze({ preset: "full-hd", width: 1920, height: 1080 }),
  "ultra-hd": Object.freeze({ preset: "ultra-hd", width: 3840, height: 2160 }),
} satisfies Readonly<Record<ProjectExportPreset, ProjectExportDimensions>>);

export function projectExportDimensions(
  preset: ProjectExportPreset,
): ProjectExportDimensions {
  const value = dimensions[preset];
  if (value === undefined) throw new ProjectExportError("EXPORT_FRAME_INVALID");
  return value;
}

export function parseProjectExportPreset(value: unknown): ProjectExportPreset {
  if (value === "full-hd" || value === "ultra-hd") return value;
  throw new ProjectExportError("EXPORT_FRAME_INVALID");
}
