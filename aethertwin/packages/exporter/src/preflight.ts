import type { SceneExportCapture, SceneExportFrame, SceneExportPort } from "@aethertwin/render-scene-3d";
import type { PreparedProjectExport, ProjectExportContext, ProjectExportDimensions, ProjectExportPreset } from "./contracts";
import { ProjectExportError } from "./errors";
import { projectExportDimensions } from "./presets";

export function assertProjectExportCurrent(capture: SceneExportCapture, context: ProjectExportContext): void {
  const provenance = capture.provenance;
  if (!context.isCurrent()
    || provenance.projectId !== context.projectId
    || provenance.snapshotSequence !== context.snapshotSequence
    || provenance.activeFloorId !== context.activeFloorId) {
    throw new ProjectExportError("EXPORT_CAPTURE_EXPIRED");
  }
}

function expectedByteLength(dimensions: ProjectExportDimensions): number {
  const { width, height } = dimensions;
  const length = width * height * 4;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || !Number.isSafeInteger(length)) {
    throw new ProjectExportError("EXPORT_FRAME_INVALID");
  }
  return length;
}

export function prepareProjectExport(
  port: SceneExportPort,
  preset: ProjectExportPreset,
  context: ProjectExportContext,
): PreparedProjectExport {
  let capture: SceneExportCapture;
  try {
    capture = port.capture();
  } catch {
    throw new ProjectExportError("EXPORT_RENDERER_NOT_READY");
  }
  assertProjectExportCurrent(capture, context);
  const dimensions = projectExportDimensions(preset);
  const requiredLimit = Math.max(dimensions.width, dimensions.height);
  if (capture.limits.maxTextureSize < requiredLimit
    || capture.limits.maxRenderbufferSize < requiredLimit) {
    throw new ProjectExportError("EXPORT_RESOLUTION_UNSUPPORTED", Object.freeze({
      preset,
      maxTextureSize: capture.limits.maxTextureSize,
      maxRenderbufferSize: capture.limits.maxRenderbufferSize,
    }));
  }
  const required = new Set(capture.requiredTextureAssetIds);
  const assetIds = [...new Set(
    context.assetIssues
      .filter((issue) => required.has(issue.assetId))
      .map((issue) => issue.assetId),
  )].sort();
  if (assetIds.length > 0) {
    throw new ProjectExportError(
      "EXPORT_TEXTURE_UNAVAILABLE",
      Object.freeze({ assetIds: Object.freeze(assetIds) }),
    );
  }
  return Object.freeze({
    capture,
    dimensions,
    expectedByteLength: expectedByteLength(dimensions),
  });
}

export function validateProjectExportFrame(
  frame: SceneExportFrame,
  dimensions: ProjectExportDimensions,
): SceneExportFrame {
  const expected = expectedByteLength(dimensions);
  if (frame.origin !== "bottom-left"
    || frame.width !== dimensions.width
    || frame.height !== dimensions.height
    || frame.rgba.byteLength !== expected) {
    throw new ProjectExportError("EXPORT_FRAME_INVALID");
  }
  return frame;
}
