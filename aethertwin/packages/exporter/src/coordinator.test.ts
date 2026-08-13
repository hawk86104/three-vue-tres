import type { SceneExportCapture, SceneExportFrame, SceneExportPort } from "@aethertwin/render-scene-3d";
import { describe, expect, it } from "vitest";
import type {
  ProjectExportBackend,
  ProjectExportBeginResult,
  ProjectExportContext,
  ProjectExportProgress,
  ProjectExportResult,
} from "./contracts";
import { createProjectExportCoordinator } from "./index";

const fullHd = Object.freeze({ preset: "full-hd" as const, width: 1920, height: 1080 });
const byteLength = fullHd.width * fullHd.height * 4;
const frame = Object.freeze({
  ...fullHd,
  origin: "bottom-left" as const,
  rgba: new Uint8Array(byteLength),
}) as SceneExportFrame;

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function exportContext(overrides: Partial<ProjectExportContext> = {}): ProjectExportContext {
  return {
    projectPath: "projects/demo",
    projectId: "project-a",
    snapshotSequence: 17,
    activeFloorId: "floor-a",
    sessionGeneration: 3,
    assetIssues: [],
    isCurrent: () => true,
    ...overrides,
  };
}

function fakePort(
  events: string[],
  options: {
    readonly textures?: Promise<void> | undefined;
    readonly render?: Promise<SceneExportFrame> | undefined;
  } = {},
): SceneExportPort {
  return {
    capture: () => {
      events.push("capture");
      return {
        scene: {},
        camera: {},
        provenance: {
          projectId: "project-a",
          snapshotSequence: 17,
          activeFloorId: "floor-a",
        },
        requiredTextureAssetIds: [],
        limits: { maxTextureSize: 3840, maxRenderbufferSize: 3840 },
      } as unknown as SceneExportCapture;
    },
    waitForTextures: async () => {
      events.push("textures");
      await (options.textures ?? Promise.resolve());
    },
    render: async () => {
      events.push("render");
      return options.render === undefined ? frame : await options.render;
    },
  } as SceneExportPort;
}

function exportResult(): ProjectExportResult {
  return {
    ...fullHd,
    relativePath: "exports/demo-full-hd.png",
    byteSize: 4321,
    sha256: "a".repeat(64),
  };
}

function fakeBackend(
  events: string[],
  overrides: Partial<ProjectExportBackend> = {},
): ProjectExportBackend {
  const begun: ProjectExportBeginResult = {
    ...fullHd,
    exportId: "export-1",
    expectedByteLength: byteLength,
    maxChunkBytes: 1_048_576,
  };
  return {
    begin: async () => {
      events.push("begin");
      return begun;
    },
    writeChunk: async (_path, _id, index) => {
      events.push(`write:${index}`);
    },
    finish: async () => {
      events.push("finish");
      return exportResult();
    },
    cancel: async () => {
      events.push("cancel");
    },
    ...overrides,
  };
}

function progress(events: string[]): (value: ProjectExportProgress) => void {
  return (value) => events.push(`progress:${value.phase}:${value.sentBytes}:${value.totalBytes}`);
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForEvent(events: readonly string[], expected: string): Promise<void> {
  for (let attempt = 0; attempt < 64; attempt += 1) {
    if (events.includes(expected)) return;
    await Promise.resolve();
  }
  throw new Error(`Timed out waiting for ${expected}`);
}

describe("ProjectExportCoordinator", () => {
  it("runs the approved source-to-publication order", async () => {
    const events: string[] = [];
    const operation = createProjectExportCoordinator(fakeBackend(events)).start({
      port: fakePort(events),
      preset: "full-hd",
      context: exportContext(),
      onProgress: progress(events),
    });

    await expect(operation.result).resolves.toMatchObject({
      preset: "full-hd",
      relativePath: "exports/demo-full-hd.png",
    });
    expect(events).toEqual([
      "capture",
      "progress:preparing-textures:null:null",
      "textures",
      "begin",
      "progress:rendering:null:null",
      "render",
      "progress:uploading:0:8294400",
      "write:0",
      "progress:uploading:1048576:8294400",
      "write:1",
      "progress:uploading:2097152:8294400",
      "write:2",
      "progress:uploading:3145728:8294400",
      "write:3",
      "progress:uploading:4194304:8294400",
      "write:4",
      "progress:uploading:5242880:8294400",
      "write:5",
      "progress:uploading:6291456:8294400",
      "write:6",
      "progress:uploading:7340032:8294400",
      "write:7",
      "progress:uploading:8294400:8294400",
      "progress:encoding-publishing:null:null",
      "finish",
    ]);
  });

  it("allows only one active operation", async () => {
    const events: string[] = [];
    const textures = deferred<void>();
    const coordinator = createProjectExportCoordinator(fakeBackend(events));
    const first = coordinator.start({
      port: fakePort(events, { textures: textures.promise }),
      preset: "full-hd",
      context: exportContext(),
      onProgress: progress(events),
    });

    expect(() => coordinator.start({
      port: fakePort(events), preset: "full-hd", context: exportContext(), onProgress: progress(events),
    })).toThrowError(expect.objectContaining({ code: "EXPORT_RENDERER_NOT_READY" }));

    await first.cancel();
    textures.resolve();
    await expect(first.result).rejects.toMatchObject({ code: "EXPORT_CANCELLED" });
  });

  it("rejects a reentrant start from preparing-textures progress", async () => {
    const events: string[] = [];
    const coordinator = createProjectExportCoordinator(fakeBackend(events));
    const first = coordinator.start({
      port: fakePort(events),
      preset: "full-hd",
      context: exportContext(),
      onProgress: (value) => {
        if (value.phase !== "preparing-textures") return;
        expect(() => coordinator.start({
          port: fakePort(events),
          preset: "full-hd",
          context: exportContext(),
          onProgress: progress(events),
        })).toThrowError(expect.objectContaining({ code: "EXPORT_RENDERER_NOT_READY" }));
      },
    });

    await expect(first.result).resolves.toMatchObject({ preset: "full-hd" });
  });

  it("cancels before native begin and discards the late texture result", async () => {
    const events: string[] = [];
    const textures = deferred<void>();
    const operation = createProjectExportCoordinator(fakeBackend(events)).start({
      port: fakePort(events, { textures: textures.promise }), preset: "full-hd", context: exportContext(), onProgress: progress(events),
    });

    await operation.cancel();
    textures.resolve();
    await expect(operation.result).rejects.toMatchObject({ code: "EXPORT_CANCELLED" });
    expect(events).not.toContain("begin");
    expect(events.filter((event) => event.startsWith("progress:"))).toEqual([
      "progress:preparing-textures:null:null",
    ]);
  });

  it("cancels once during a texture wait, render, upload, or finish wait", async () => {
    const makeOperation = async (stage: "textures" | "render" | "upload" | "finish") => {
      const events: string[] = [];
      const gate = deferred<void>();
      const backend = fakeBackend(events, {
        writeChunk: async (_path, _id, index) => {
          events.push(`write:${index}`);
          if (stage === "upload" && index === 0) await gate.promise;
        },
        finish: async () => {
          events.push("finish");
          if (stage === "finish") await gate.promise;
          return exportResult();
        },
      });
      const operation = createProjectExportCoordinator(backend).start({
        port: fakePort(events, {
          textures: stage === "textures" ? gate.promise : undefined,
          render: stage === "render" ? gate.promise.then(() => frame) : undefined,
        }),
        preset: "full-hd", context: exportContext(), onProgress: progress(events),
      });
      await waitForEvent(events, stage === "textures"
        ? "textures"
        : stage === "render"
          ? "render"
          : stage === "upload"
            ? "write:0"
            : "finish");
      await Promise.all([operation.cancel(), operation.cancel()]);
      gate.resolve();
      await expect(operation.result).rejects.toMatchObject({ code: "EXPORT_CANCELLED" });
      expect(events.filter((event) => event === "cancel")).toHaveLength(stage === "textures" ? 0 : 1);
      return events;
    };

    for (const stage of ["textures", "render", "upload", "finish"] as const) {
      const events = await makeOperation(stage);
      expect(events.filter((event) => event === "finish")).toHaveLength(stage === "finish" ? 1 : 0);
      expect(events.filter((event) => event.startsWith("write:"))).toHaveLength(
        stage === "upload" ? 1 : stage === "finish" ? 8 : 0,
      );
    }
  });

  it("discards late texture, frame, progress, and finish values after cancellation", async () => {
    const events: string[] = [];
    const finish = deferred<ProjectExportResult>();
    const operation = createProjectExportCoordinator(fakeBackend(events, { finish: async () => {
      events.push("finish");
      return await finish.promise;
    } })).start({
      port: fakePort(events), preset: "full-hd", context: exportContext(), onProgress: progress(events),
    });
    await settle();
    await operation.cancel();
    const eventCountAfterCancel = events.length;
    finish.resolve(exportResult());
    await expect(operation.result).rejects.toMatchObject({ code: "EXPORT_CANCELLED" });
    expect(events).toHaveLength(eventCountAfterCancel);
  });

  it("waits for an in-flight begin and native cancellation before cancel resolves", async () => {
    const events: string[] = [];
    const beginGate = deferred<ProjectExportBeginResult>();
    const cancelGate = deferred<void>();
    const operation = createProjectExportCoordinator(fakeBackend(events, {
      begin: async () => {
        events.push("begin");
        return await beginGate.promise;
      },
      cancel: async () => {
        events.push("cancel");
        await cancelGate.promise;
      },
    })).start({
      port: fakePort(events),
      preset: "full-hd",
      context: exportContext(),
      onProgress: progress(events),
    });
    await waitForEvent(events, "begin");

    let cancellationSettled = false;
    const cancellation = operation.cancel().finally(() => { cancellationSettled = true; });
    await settle();
    expect(cancellationSettled).toBe(false);

    beginGate.resolve({
      ...fullHd,
      exportId: "export-1",
      expectedByteLength: byteLength,
      maxChunkBytes: 1_048_576,
    });
    await waitForEvent(events, "cancel");
    expect(cancellationSettled).toBe(false);
    cancelGate.resolve();

    await expect(cancellation).resolves.toBeUndefined();
    await expect(operation.result).rejects.toMatchObject({ code: "EXPORT_CANCELLED" });
  });

  it("propagates and deduplicates an explicit native cancellation failure", async () => {
    const events: string[] = [];
    const renderGate = deferred<SceneExportFrame>();
    const cancelFailure = new Error("native cancellation failed");
    const operation = createProjectExportCoordinator(fakeBackend(events, {
      cancel: async () => {
        events.push("cancel");
        throw cancelFailure;
      },
    })).start({
      port: fakePort(events, { render: renderGate.promise }),
      preset: "full-hd",
      context: exportContext(),
      onProgress: progress(events),
    });
    await waitForEvent(events, "render");

    await expect(operation.cancel()).rejects.toBe(cancelFailure);
    await expect(operation.cancel()).rejects.toBe(cancelFailure);
    expect(events.filter((event) => event === "cancel")).toHaveLength(1);

    renderGate.resolve(frame);
    await expect(operation.result).rejects.toBe(cancelFailure);
    await expect(operation.cancel()).rejects.toBe(cancelFailure);
  });

  it("preserves the primary export failure when best-effort cleanup also fails", async () => {
    const events: string[] = [];
    const primaryFailure = new Error("render failed");
    const cleanupFailure = new Error("cleanup failed");
    const operation = createProjectExportCoordinator(fakeBackend(events, {
      cancel: async () => {
        events.push("cancel");
        throw cleanupFailure;
      },
    })).start({
      port: fakePort(events, { render: Promise.reject(primaryFailure) }),
      preset: "full-hd",
      context: exportContext(),
      onProgress: progress(events),
    });

    await expect(operation.result).rejects.toBe(primaryFailure);
    expect(events.filter((event) => event === "cancel")).toHaveLength(1);
  });

  it("preserves a frozen primary export failure when cleanup also fails", async () => {
    const events: string[] = [];
    const primaryFailure = Object.freeze(new Error("render failed"));
    const cleanupFailure = new Error("cleanup failed");
    const operation = createProjectExportCoordinator(fakeBackend(events, {
      cancel: async () => {
        events.push("cancel");
        throw cleanupFailure;
      },
    })).start({
      port: fakePort(events, { render: Promise.reject(primaryFailure) }),
      preset: "full-hd",
      context: exportContext(),
      onProgress: progress(events),
    });

    await expect(operation.result).rejects.toBe(primaryFailure);
    expect(events.filter((event) => event === "cancel")).toHaveLength(1);
  });

  it.each([
    ["cancellation", "rendering"],
    ["cancellation", "encoding-publishing"],
    ["staleness", "rendering"],
    ["staleness", "encoding-publishing"],
  ] as const)("does not start downstream work after %s in %s progress", async (mode, phase) => {
    const events: string[] = [];
    let current = true;
    let operation: { readonly result: Promise<ProjectExportResult>; cancel(): Promise<void> } | null = null;
    const coordinator = createProjectExportCoordinator(fakeBackend(events));
    operation = coordinator.start({
      port: fakePort(events),
      preset: "full-hd",
      context: exportContext({ isCurrent: () => current }),
      onProgress: (value) => {
        if (value.phase !== phase) return;
        if (mode === "cancellation") void operation?.cancel();
        else current = false;
      },
    });

    await expect(operation.result).rejects.toMatchObject({
      code: mode === "cancellation" ? "EXPORT_CANCELLED" : "EXPORT_CAPTURE_EXPIRED",
    });
    expect(events).not.toContain(phase === "rendering" ? "render" : "finish");
  });

  it("rejects a smaller runtime chunk ceiling before rendering", async () => {
    const events: string[] = [];
    const operation = createProjectExportCoordinator(fakeBackend(events, {
      begin: async () => ({
        ...fullHd,
        exportId: "export-1",
        expectedByteLength: byteLength,
        maxChunkBytes: 524_288,
      } as unknown as ProjectExportBeginResult),
    })).start({
      port: fakePort(events),
      preset: "full-hd",
      context: exportContext(),
      onProgress: progress(events),
    });

    await expect(operation.result).rejects.toMatchObject({ code: "EXPORT_FRAME_INVALID" });
    expect(events).toContain("cancel");
    expect(events).not.toContain("render");
  });

  it.each(["session", "project", "floor", "renderer"] as const)(
    "rejects when the %s generation changes after native begin",
    async () => {
      const events: string[] = [];
      let current = true;
      const operation = createProjectExportCoordinator(fakeBackend(events)).start({
        port: fakePort(events), preset: "full-hd", context: exportContext({ isCurrent: () => current }), onProgress: progress(events),
      });
      await settle();
      current = false;
      await expect(operation.result).rejects.toMatchObject({ code: "EXPORT_CAPTURE_EXPIRED" });
      expect(events).toContain("cancel");
      expect(events).not.toContain("finish");
    },
  );

  it.each(["begin", "render", "write", "finish"] as const)(
    "rejects a %s failure and cancels a begun native session",
    async (failure) => {
      const events: string[] = [];
      const boom = new Error(`${failure} failed`);
      const operation = createProjectExportCoordinator(fakeBackend(events, {
        begin: async () => {
          events.push("begin");
          if (failure === "begin") throw boom;
          return { ...fullHd, exportId: "export-1", expectedByteLength: byteLength, maxChunkBytes: 1_048_576 };
        },
        writeChunk: async (_path, _id, index) => {
          events.push(`write:${index}`);
          if (failure === "write") throw boom;
        },
        finish: async () => {
          events.push("finish");
          if (failure === "finish") throw boom;
          return exportResult();
        },
      })).start({
        port: fakePort(events, { render: failure === "render" ? Promise.reject(boom) : undefined }),
        preset: "full-hd", context: exportContext(), onProgress: progress(events),
      });
      await expect(operation.result).rejects.toBe(boom);
      expect(events.filter((event) => event === "cancel")).toHaveLength(failure === "begin" ? 0 : 1);
    },
  );

  it("reports exact byte totals only during upload and never invents percentages", async () => {
    const reports: ProjectExportProgress[] = [];
    const operation = createProjectExportCoordinator(fakeBackend([])).start({
      port: fakePort([]), preset: "full-hd", context: exportContext(), onProgress: (value) => reports.push(value),
    });
    await operation.result;
    expect(reports.filter((value) => value.phase !== "uploading")).toEqual([
      { phase: "preparing-textures", sentBytes: null, totalBytes: null },
      { phase: "rendering", sentBytes: null, totalBytes: null },
      { phase: "encoding-publishing", sentBytes: null, totalBytes: null },
    ]);
    expect(reports.filter((value) => value.phase === "uploading").map((value) => [value.sentBytes, value.totalBytes]))
      .toEqual([[0, byteLength], [1_048_576, byteLength], [2_097_152, byteLength], [3_145_728, byteLength], [4_194_304, byteLength], [5_242_880, byteLength], [6_291_456, byteLength], [7_340_032, byteLength], [byteLength, byteLength]]);
  });
});
