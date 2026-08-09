export type ProjectExportErrorCode =
  | "EXPORT_RENDERER_NOT_READY"
  | "EXPORT_CAPTURE_EXPIRED"
  | "EXPORT_TEXTURE_UNAVAILABLE"
  | "EXPORT_RESOLUTION_UNSUPPORTED"
  | "EXPORT_FRAME_INVALID"
  | "EXPORT_CANCELLED";

export class ProjectExportError extends Error {
  readonly name = "ProjectExportError";

  constructor(
    readonly code: ProjectExportErrorCode,
    readonly details: Readonly<Record<string, unknown>> = Object.freeze({}),
  ) {
    super(code);
  }
}
