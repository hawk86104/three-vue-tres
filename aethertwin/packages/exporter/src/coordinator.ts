import type {
  ProjectExportBackend,
  ProjectExportBeginResult,
  ProjectExportCoordinator,
  ProjectExportOperation,
  ProjectExportProgress,
  ProjectExportResult,
  StartProjectExportRequest,
} from "./contracts";
import { ProjectExportError } from "./errors";
import {
  prepareProjectExport,
  validateProjectExportFrame,
} from "./preflight";
import { PROJECT_EXPORT_MAX_CHUNK_BYTES } from "./presets";
import { streamTopLeftRgbaChunks } from "./row-chunks";

function cancelledError(): ProjectExportError {
  return new ProjectExportError("EXPORT_CANCELLED");
}

function expiredError(): ProjectExportError {
  return new ProjectExportError("EXPORT_CAPTURE_EXPIRED");
}

function validateBeginResult(
  begun: ProjectExportBeginResult,
  expectedByteLength: number,
  width: number,
  height: number,
): void {
  if (
    typeof begun.exportId !== "string"
    || begun.exportId.length === 0
    || begun.width !== width
    || begun.height !== height
    || begun.expectedByteLength !== expectedByteLength
    || !Number.isSafeInteger(begun.maxChunkBytes)
    || begun.maxChunkBytes !== PROJECT_EXPORT_MAX_CHUNK_BYTES
  ) {
    throw new ProjectExportError("EXPORT_FRAME_INVALID");
  }
}

class ActiveProjectExport {
  readonly publicOperation: ProjectExportOperation;
  private readonly resultPromise: Promise<ProjectExportResult>;
  private resolveResult!: (result: ProjectExportResult) => void;
  private rejectResult!: (reason: unknown) => void;
  private exportId: string | null = null;
  private cancelled = false;
  private settled = false;
  private cancelPromise: Promise<void> | null = null;

  constructor(
    private readonly backend: ProjectExportBackend,
    private readonly request: StartProjectExportRequest,
    private readonly onSettled: () => void,
  ) {
    this.resultPromise = new Promise<ProjectExportResult>((resolve, reject) => {
      this.resolveResult = resolve;
      this.rejectResult = reject;
    });
    this.publicOperation = Object.freeze({
      result: this.resultPromise,
      cancel: () => this.cancel(),
    });
  }

  start(): void {
    void this.run().then(
      (result) => this.resolveResult(result),
      (error: unknown) => this.rejectResult(error),
    );
  }

  private assertLive(): void {
    if (this.cancelled) throw cancelledError();
    if (!this.request.context.isCurrent()) throw expiredError();
  }

  private progress(value: ProjectExportProgress): void {
    this.assertLive();
    this.request.onProgress(Object.freeze({ ...value }));
  }

  private cancelNative(): Promise<void> {
    if (this.exportId === null) return Promise.resolve();
    if (this.cancelPromise !== null) return this.cancelPromise;
    this.cancelPromise = this.backend.cancel(
      this.request.context.projectPath,
      this.exportId,
    ).catch(() => undefined);
    return this.cancelPromise;
  }

  private async cancel(): Promise<void> {
    if (this.settled) return;
    this.cancelled = true;
    await this.cancelNative();
  }

  private async run(): Promise<ProjectExportResult> {
    try {
      const prepared = prepareProjectExport(
        this.request.port,
        this.request.preset,
        this.request.context,
      );
      this.progress({
        phase: "preparing-textures",
        sentBytes: null,
        totalBytes: null,
      });
      await this.request.port.waitForTextures(prepared.capture);
      this.assertLive();

      const begun = await this.backend.begin(this.request.context.projectPath, {
        provenance: prepared.capture.provenance,
        preset: this.request.preset,
      });
      this.exportId = begun.exportId;
      this.assertLive();
      validateBeginResult(
        begun,
        prepared.expectedByteLength,
        prepared.dimensions.width,
        prepared.dimensions.height,
      );

      this.progress({ phase: "rendering", sentBytes: null, totalBytes: null });
      this.assertLive();
      const rendered = await this.request.port.render(
        prepared.capture,
        prepared.dimensions,
      );
      this.assertLive();
      const frame = validateProjectExportFrame(rendered, prepared.dimensions);

      let sentBytes = 0;
      this.progress({
        phase: "uploading",
        sentBytes,
        totalBytes: begun.expectedByteLength,
      });
      await streamTopLeftRgbaChunks(frame, begun.maxChunkBytes, async (index, bytes) => {
        this.assertLive();
        await this.backend.writeChunk(
          this.request.context.projectPath,
          begun.exportId,
          index,
          bytes,
        );
        this.assertLive();
        sentBytes += bytes.byteLength;
        this.progress({
          phase: "uploading",
          sentBytes,
          totalBytes: begun.expectedByteLength,
        });
      });
      this.assertLive();

      this.progress({
        phase: "encoding-publishing",
        sentBytes: null,
        totalBytes: null,
      });
      this.assertLive();
      const result = await this.backend.finish(
        this.request.context.projectPath,
        begun.exportId,
      );
      this.assertLive();
      return result;
    } catch (error) {
      if (this.cancelled) {
        await this.cancelNative();
        throw cancelledError();
      }
      await this.cancelNative();
      throw error;
    } finally {
      this.settled = true;
      this.onSettled();
    }
  }
}

class DefaultProjectExportCoordinator implements ProjectExportCoordinator {
  private active: ActiveProjectExport | null = null;

  constructor(private readonly backend: ProjectExportBackend) {}

  start(request: StartProjectExportRequest): ProjectExportOperation {
    if (this.active !== null) {
      throw new ProjectExportError("EXPORT_RENDERER_NOT_READY");
    }
    const active = new ActiveProjectExport(this.backend, request, () => {
      if (this.active === active) this.active = null;
    });
    this.active = active;
    active.start();
    return active.publicOperation;
  }
}

export function createProjectExportCoordinator(
  backend: ProjectExportBackend,
): ProjectExportCoordinator {
  return new DefaultProjectExportCoordinator(backend);
}
