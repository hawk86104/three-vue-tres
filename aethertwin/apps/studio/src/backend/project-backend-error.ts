export class ProjectBackendError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly logRef: string;

  constructor(code: string, message: string, details: unknown, logRef: string) {
    super(message);
    this.name = "ProjectBackendError";
    this.code = code;
    this.details = details;
    this.logRef = logRef;
  }
}
