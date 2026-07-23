import {
  createInitialSnapshot,
  createManifest,
  identityTransform2D,
  parseSnapshot,
  type Fixture,
  type ProjectManifest,
  type ProjectSnapshot,
} from "@aethertwin/core-model";
import snapshotV1Fixture from "../../../../fixtures/contracts/snapshot.v1.json";
import type { ProjectBackend } from "@aethertwin/project-store";
import { afterEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const SESSION_A = "10000000-0000-4000-8000-000000000001";
const SESSION_B = "10000000-0000-4000-8000-000000000002";
const PROJECT_A = "E:\\Projects\\Demo.twinproj";
const PROJECT_B = "E:\\Projects\\Market.twinproj";

interface NativeOpenedProject {
  readonly sessionId: string;
  readonly projectPath: string;
  readonly manifest: ProjectManifest;
  readonly snapshot: ProjectSnapshot;
  readonly recovered: boolean;
}

function fixture(
  sessionId = SESSION_A,
  projectPath = PROJECT_A,
  name = "Demo",
): NativeOpenedProject {
  let nextId = 1;
  const snapshot = createInitialSnapshot({
    name,
    profile: name === "Market" ? "market" : "showroom",
    uuid: () => {
      const suffix = String(nextId).padStart(12, "0");
      nextId += 1;
      return `00000000-0000-4000-8000-${suffix}`;
    },
  });
  return {
    sessionId,
    projectPath,
    manifest: createManifest(snapshot, {
      appVersion: "0.1.0",
      now: () => "2026-07-20T00:00:00.000Z",
    }),
    snapshot,
    recovered: false,
  };
}

function renameBatch(
  before: ProjectSnapshot,
  name: string,
): Parameters<ProjectBackend["commit"]>[1] {
  const after = parseSnapshot({
    ...before,
    sequence: before.sequence + 1,
    project: { ...before.project, name },
  });
  return {
    before,
    after,
    journal: [
      {
        sequence: after.sequence,
        transactionId: "20000000-0000-4000-8000-000000000001",
        commandType: "project.rename",
        payload: { name },
        inversePayload: { name: before.project.name },
        action: "apply",
        timestamp: "2026-07-20T00:00:01.000Z",
      },
    ],
  };
}

function entityPatchBatch(before: ProjectSnapshot): {
  readonly batch: Parameters<ProjectBackend["commit"]>[1];
  readonly entity: Fixture;
} {
  const floor = before.project.floors[0]!;
  const entity: Fixture = {
    type: "fixture",
    id: "00000000-0000-4000-8000-000000000010",
    name: "Native fixture",
    tags: [],
    floorId: floor.id,
    layerId: floor.layers[0]!.id,
    locked: false,
    transform: identityTransform2D,
    kind: "generic",
    size: { width: 1_000, height: 500 },
  };
  const after = parseSnapshot({
    ...before,
    sequence: before.sequence + 1,
    project: {
      ...before.project,
      entities: [...before.project.entities, entity],
    },
  });
  const payload = {
    reason: "create" as const,
    changes: [{ id: entity.id, before: null, after: entity }],
  };
  return {
    entity,
    batch: {
      before,
      after,
      journal: [{
        sequence: after.sequence,
        transactionId: "20000000-0000-4000-8000-000000000002",
        commandType: "plan.entities.patch",
        payload,
        inversePayload: {
          reason: "create",
          changes: [{
            id: entity.id,
            before: entity,
            after: null,
            index: before.project.entities.length,
          }],
        },
        action: "apply",
        timestamp: "2026-07-20T00:00:02.000Z",
      }],
    },
  };
}

afterEach(() => {
  invoke.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("TauriProjectBackend", () => {
  it("maps every ProjectBackend operation to the exact Task 7 payload and tracks sessions by returned path", async () => {
    const created = fixture();
    const opened = fixture(SESSION_B, PROJECT_B, "Market");
    const batch = renameBatch(created.snapshot, "Renamed");
    invoke
      .mockResolvedValueOnce(created)
      .mockResolvedValueOnce(opened)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ manifest: opened.manifest, snapshot: opened.snapshot })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const { TauriProjectBackend } = await import("./tauri-backend");
    const backend = new TauriProjectBackend();

    const createdProject = await backend.createProject({
      name: "Demo",
      location: "E:\\Projects",
      profile: "showroom",
    });
    const openedProject = await backend.openProject(PROJECT_B);
    await backend.commit(createdProject.projectPath, batch);
    const checkpoint = await backend.checkpoint(openedProject.projectPath, opened.snapshot);
    await backend.closeProject(createdProject.projectPath);
    await backend.closeProject(openedProject.projectPath);

    expect(backend.mode).toBe("desktop");
    expect(createdProject).toEqual({
      projectPath: PROJECT_A,
      manifest: created.manifest,
      snapshot: created.snapshot,
      recovered: false,
    });
    expect(createdProject).not.toHaveProperty("sessionId");
    expect(checkpoint).toEqual({ manifest: opened.manifest, snapshot: opened.snapshot });
    expect(invoke.mock.calls).toEqual([
      [
        "create_project",
        {
          payload: { name: "Demo", parent: "E:\\Projects", profile: "showroom" },
        },
      ],
      [
        "open_project",
        {
          payload: { path: PROJECT_B, recoverStaleLock: false },
        },
      ],
      ["commit_project", { payload: { sessionId: SESSION_A, batch } }],
      ["checkpoint_project", { payload: { sessionId: SESSION_B, snapshot: opened.snapshot } }],
      ["close_project", { payload: { sessionId: SESSION_A } }],
      ["close_project", { payload: { sessionId: SESSION_B } }],
    ]);
  });

  it("passes exact schema-v3 snapshots and generic entity patches through the native command boundary", async () => {
    const opened = fixture();
    const { batch, entity } = entityPatchBatch(opened.snapshot);
    const checkpointed = parseSnapshot({
      ...batch.after,
      checkpointSequence: batch.after.sequence,
    });
    const checkpointManifest = createManifest(checkpointed, {
      appVersion: "0.1.0",
      now: () => "2026-07-20T00:00:03.000Z",
    });
    invoke
      .mockResolvedValueOnce(opened)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ manifest: checkpointManifest, snapshot: checkpointed })
      .mockResolvedValueOnce(undefined);

    const { TauriProjectBackend } = await import("./tauri-backend");
    const backend = new TauriProjectBackend();
    await backend.openProject(PROJECT_A);
    await backend.commit(PROJECT_A, batch);
    const checkpoint = await backend.checkpoint(PROJECT_A, batch.after);
    await backend.closeProject(PROJECT_A);

    expect(batch.before.schemaVersion).toBe(3);
    expect(batch.after.schemaVersion).toBe(3);
    expect(batch.journal[0]).toMatchObject({
      commandType: "plan.entities.patch",
      payload: {
        reason: "create",
        changes: [{ id: entity.id, before: null, after: entity }],
      },
    });
    expect(checkpoint).toEqual({ manifest: checkpointManifest, snapshot: checkpointed });
    expect(invoke.mock.calls).toEqual([
      ["open_project", { payload: { path: PROJECT_A, recoverStaleLock: false } }],
      ["commit_project", { payload: { sessionId: SESSION_A, batch } }],
      ["checkpoint_project", { payload: { sessionId: SESSION_A, snapshot: batch.after } }],
      ["close_project", { payload: { sessionId: SESSION_A } }],
    ]);
  });

  it("maps explicitly confirmed recovery to the exact native payload and tracks the recovered session", async () => {
    const recovered = { ...fixture(), recovered: true };
    invoke.mockResolvedValueOnce(recovered).mockResolvedValueOnce(undefined);
    const { TauriProjectBackend } = await import("./tauri-backend");
    const backend = new TauriProjectBackend();

    const opened = await backend.recoverProject(PROJECT_A, { confirmed: true });
    expect(opened).toEqual({
      projectPath: PROJECT_A,
      manifest: recovered.manifest,
      snapshot: recovered.snapshot,
      recovered: true,
    });
    await backend.closeProject(PROJECT_A);

    expect(invoke.mock.calls).toEqual([
      ["recover_project", { payload: { path: PROJECT_A, confirm: true } }],
      ["close_project", { payload: { sessionId: SESSION_A } }],
    ]);
  });

  it("rejects a coherent v2 native session and closes it without frontend migration", async () => {
    const current = fixture();
    const legacy = {
      ...current,
      manifest: {
        ...current.manifest,
        schemaVersion: 2,
      },
      snapshot: {
        ...current.snapshot,
        schemaVersion: 2,
      },
    };
    invoke.mockResolvedValueOnce(legacy).mockResolvedValueOnce(undefined);

    const { TauriProjectBackend } = await import("./tauri-backend");
    const backend = new TauriProjectBackend();
    await expect(backend.openProject(PROJECT_A)).rejects.toThrow(/schemaVersion/i);
    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      "open_project",
      "close_project",
    ]);
  });

  it("closes a trusted v1 session when native publication violates the v3 contract", async () => {
    const current = fixture();
    invoke
      .mockResolvedValueOnce({
        ...current,
        manifest: {
          ...current.manifest,
          schemaVersion: 1,
          name: snapshotV1Fixture.project.name,
          profile: snapshotV1Fixture.project.profile,
        },
        snapshot: snapshotV1Fixture,
      })
      .mockResolvedValueOnce(undefined);

    const { TauriProjectBackend } = await import("./tauri-backend");
    const backend = new TauriProjectBackend();
    await expect(backend.openProject(PROJECT_A)).rejects.toThrow();

    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      "open_project",
      "close_project",
    ]);
  });

  it("deletes a session only after a successful close and never invokes native commands for a closed path", async () => {
    const opened = fixture();
    const batch = renameBatch(opened.snapshot, "Closed");
    invoke.mockResolvedValueOnce(opened).mockResolvedValueOnce(undefined);
    const { TauriProjectBackend } = await import("./tauri-backend");
    const backend = new TauriProjectBackend();

    await backend.openProject(PROJECT_A);
    await backend.closeProject(PROJECT_A);
    invoke.mockClear();

    await expect(backend.commit(PROJECT_A, batch)).rejects.toThrow(/session/i);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("sanitizes native errors and retains the session when close fails so the same close can be retried", async () => {
    const opened = fixture();
    const nativeError = {
      code: "PROJECT_LOCKED",
      message: "项目正在由另一个会话使用",
      details: { recoveryRequired: false, retryable: true },
      logRef: "native-safe-ref",
      secretPath: "E:\\sensitive\\private.db",
      internalCause: "rusqlite stack",
    };
    invoke
      .mockResolvedValueOnce(opened)
      .mockRejectedValueOnce(nativeError)
      .mockResolvedValueOnce(undefined);
    const { ProjectBackendError, TauriProjectBackend } = await import("./tauri-backend");
    const backend = new TauriProjectBackend();
    await backend.openProject(PROJECT_A);

    let caught: unknown;
    try {
      await backend.closeProject(PROJECT_A);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ProjectBackendError);
    expect(caught).toMatchObject({
      name: "ProjectBackendError",
      code: nativeError.code,
      message: nativeError.message,
      details: nativeError.details,
      logRef: nativeError.logRef,
    });
    expect(caught).not.toHaveProperty("secretPath");
    expect(caught).not.toHaveProperty("internalCause");
    expect(String((caught as Error).stack)).not.toContain(nativeError.secretPath);

    await backend.closeProject(PROJECT_A);
    expect(invoke).toHaveBeenNthCalledWith(2, "close_project", {
      payload: { sessionId: SESSION_A },
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "close_project", {
      payload: { sessionId: SESSION_A },
    });
  });

  it("replaces non-DTO invocation errors without leaking their message, properties, or stack", async () => {
    const secretPath = "E:\\sensitive\\private.db";
    const nativeError = Object.assign(new Error(`sqlite failed while opening ${secretPath}`), {
      code: "SQLITE_FAILURE",
      secretPath,
      internalCause: "rusqlite stack",
    });
    invoke.mockRejectedValueOnce(nativeError);
    const { ProjectBackendError, TauriProjectBackend } = await import("./tauri-backend");
    const backend = new TauriProjectBackend();

    let caught: unknown;
    try {
      await backend.openProject(PROJECT_A);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ProjectBackendError);
    expect(caught).not.toBe(nativeError);
    expect(caught).toMatchObject({
      code: expect.any(String),
      message: expect.any(String),
      details: null,
      logRef: expect.any(String),
    });
    expect((caught as Error).message).not.toContain(nativeError.message);
    expect((caught as Error).message).not.toContain(secretPath);
    expect(caught).not.toHaveProperty("secretPath");
    expect(caught).not.toHaveProperty("internalCause");
    expect(String((caught as Error).stack)).not.toContain(secretPath);
  });

  it.each([
    [
      "manifest",
      (opened: NativeOpenedProject) => ({
        ...opened,
        manifest: { ...opened.manifest, schemaVersion: 99 },
      }),
    ],
    [
      "snapshot",
      (opened: NativeOpenedProject) => ({
        ...opened,
        snapshot: { ...opened.snapshot, project: { ...opened.snapshot.project, id: "bad-id" } },
      }),
    ],
  ] as const)(
    "rejects an invalid returned %s, best-effort closes its native session, and does not install the path mapping",
    async (_label, corrupt) => {
      const valid = fixture();
      invoke.mockResolvedValueOnce(corrupt(valid)).mockResolvedValueOnce(undefined);
      const { TauriProjectBackend } = await import("./tauri-backend");
      const backend = new TauriProjectBackend();

      await expect(backend.openProject(PROJECT_A)).rejects.toThrow(/invalid/i);
      expect(invoke).toHaveBeenNthCalledWith(1, "open_project", {
        payload: { path: PROJECT_A, recoverStaleLock: false },
      });
      expect(invoke).toHaveBeenNthCalledWith(2, "close_project", {
        payload: { sessionId: SESSION_A },
      });

      invoke.mockClear();
      await expect(backend.checkpoint(PROJECT_A, valid.snapshot)).rejects.toThrow(/session/i);
      expect(invoke).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "project id",
      (opened: NativeOpenedProject): NativeOpenedProject => ({
        ...opened,
        manifest: {
          ...opened.manifest,
          projectId: "00000000-0000-4000-8000-999999999999",
        },
      }),
    ],
    [
      "name",
      (opened: NativeOpenedProject): NativeOpenedProject => ({
        ...opened,
        manifest: { ...opened.manifest, name: "Different" },
      }),
    ],
    [
      "profile",
      (opened: NativeOpenedProject): NativeOpenedProject => ({
        ...opened,
        manifest: { ...opened.manifest, profile: "market" },
      }),
    ],
  ] as const)(
    "rejects an opened project with mismatched %s and preserves failed cleanup for the next operation",
    async (_label, makeIncoherent) => {
      const incoherent = makeIncoherent(fixture());
      const next = fixture(SESSION_B, PROJECT_B, "Market");
      invoke
        .mockResolvedValueOnce(incoherent)
        .mockRejectedValueOnce(new Error("initial cleanup unavailable"))
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(next);
      const { TauriProjectBackend } = await import("./tauri-backend");
      const backend = new TauriProjectBackend();

      await expect(backend.openProject(PROJECT_A)).rejects.toThrow(/coherent/i);
      await expect(
        backend.createProject({
          name: "Market",
          location: "E:\\Projects",
          profile: "market",
        }),
      ).resolves.toMatchObject({
        projectPath: PROJECT_B,
        manifest: next.manifest,
        snapshot: next.snapshot,
      });

      expect(invoke.mock.calls.map(([command]) => command)).toEqual([
        "open_project",
        "close_project",
        "close_project",
        "create_project",
      ]);
      expect(invoke).toHaveBeenNthCalledWith(2, "close_project", {
        payload: { sessionId: SESSION_A },
      });
      expect(invoke).toHaveBeenNthCalledWith(3, "close_project", {
        payload: { sessionId: SESSION_A },
      });
    },
);

  it("retains a malformed create session when cleanup fails so explicit cleanup can be retried", async () => {
    const opened = fixture();
    const corrupt = {
      ...opened,
      snapshot: { ...opened.snapshot, project: { ...opened.snapshot.project, id: "bad-id" } },
    };
    invoke
      .mockResolvedValueOnce(corrupt)
      .mockRejectedValueOnce(new Error("cleanup unavailable"))
      .mockResolvedValueOnce(undefined);
    const { TauriProjectBackend } = await import("./tauri-backend");
    const backend = new TauriProjectBackend();

    await expect(
      backend.createProject({
        name: "Demo",
        location: "E:\\Projects",
        profile: "showroom",
      }),
    ).rejects.toThrow(/project\.id|invalid/i);
    expect(invoke).toHaveBeenNthCalledWith(1, "create_project", {
      payload: { name: "Demo", parent: "E:\\Projects", profile: "showroom" },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "close_project", {
      payload: { sessionId: SESSION_A },
    });

    invoke.mockClear();
    await expect(backend.commit(PROJECT_A, renameBatch(opened.snapshot, "Never"))).rejects.toThrow();
    await expect(backend.checkpoint(PROJECT_A, opened.snapshot)).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();

    await backend.closeProject(PROJECT_A);
    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith("close_project", {
      payload: { sessionId: SESSION_A },
    });
  });

  it("retains a malformed open session when cleanup fails and retries the same session explicitly", async () => {
    const opened = fixture();
    const corrupt = {
      ...opened,
      snapshot: { ...opened.snapshot, project: { ...opened.snapshot.project, id: "bad-id" } },
    };
    invoke
      .mockResolvedValueOnce(corrupt)
      .mockRejectedValueOnce(new Error("cleanup unavailable"))
      .mockResolvedValueOnce(undefined);
    const { TauriProjectBackend } = await import("./tauri-backend");
    const backend = new TauriProjectBackend();

    await expect(backend.openProject(PROJECT_A)).rejects.toThrow(/project\.id|invalid/i);
    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      "open_project",
      "close_project",
    ]);

    await backend.closeProject(PROJECT_A);
    expect(invoke).toHaveBeenNthCalledWith(3, "close_project", {
      payload: { sessionId: SESSION_A },
    });
  });

  it("closes both the active and pending sessions when they share one project path", async () => {
    const active = fixture(SESSION_A, PROJECT_A, "Active");
    const malformed = fixture(SESSION_B, PROJECT_A, "Malformed");
    const corrupt = {
      ...malformed,
      snapshot: {
        ...malformed.snapshot,
        project: { ...malformed.snapshot.project, id: "bad-id" },
      },
    };
    invoke
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(corrupt)
      .mockRejectedValueOnce(new Error("initial cleanup unavailable"))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const { TauriProjectBackend } = await import("./tauri-backend");
    const backend = new TauriProjectBackend();

    await backend.openProject(PROJECT_A);
    await expect(backend.openProject(PROJECT_A)).rejects.toThrow(/project\.id|invalid/i);
    await backend.closeProject(PROJECT_A);

    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      "open_project",
      "open_project",
      "close_project",
      "close_project",
      "close_project",
    ]);
    expect(invoke).toHaveBeenNthCalledWith(3, "close_project", {
      payload: { sessionId: SESSION_B },
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "close_project", {
      payload: { sessionId: SESSION_A },
    });
    expect(invoke).toHaveBeenNthCalledWith(5, "close_project", {
      payload: { sessionId: SESSION_B },
    });

    invoke.mockClear();
    await expect(backend.commit(PROJECT_A, renameBatch(active.snapshot, "Never"))).rejects.toThrow(
      /session/i,
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("drains pending cleanup before create and does not start the new operation while cleanup still fails", async () => {
    const opened = fixture();
    const corrupt = {
      ...opened,
      snapshot: { ...opened.snapshot, project: { ...opened.snapshot.project, id: "bad-id" } },
    };
    invoke
      .mockResolvedValueOnce(corrupt)
      .mockRejectedValueOnce(new Error("initial cleanup unavailable"))
      .mockRejectedValueOnce(new Error("cleanup still unavailable"));
    const { TauriProjectBackend } = await import("./tauri-backend");
    const backend = new TauriProjectBackend();

    await expect(backend.openProject(PROJECT_A)).rejects.toThrow(/project\.id|invalid/i);
    await expect(
      backend.createProject({
        name: "Market",
        location: "E:\\Projects",
        profile: "market",
      }),
    ).rejects.toThrow();

    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      "open_project",
      "close_project",
      "close_project",
    ]);
    expect(invoke).toHaveBeenLastCalledWith("close_project", {
      payload: { sessionId: SESSION_A },
    });
  });

  it("continues a later open only after pending cleanup succeeds", async () => {
    const malformed = fixture();
    const corrupt = {
      ...malformed,
      snapshot: {
        ...malformed.snapshot,
        project: { ...malformed.snapshot.project, id: "bad-id" },
      },
    };
    const opened = fixture(SESSION_B, PROJECT_B, "Market");
    invoke
      .mockResolvedValueOnce(corrupt)
      .mockRejectedValueOnce(new Error("initial cleanup unavailable"))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(opened);
    const { TauriProjectBackend } = await import("./tauri-backend");
    const backend = new TauriProjectBackend();

    await expect(backend.openProject(PROJECT_A)).rejects.toThrow(/project\.id|invalid/i);
    await expect(backend.openProject(PROJECT_B)).resolves.toMatchObject({
      projectPath: PROJECT_B,
      snapshot: opened.snapshot,
    });

    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      "open_project",
      "close_project",
      "close_project",
      "open_project",
    ]);
    expect(invoke).toHaveBeenNthCalledWith(3, "close_project", {
      payload: { sessionId: SESSION_A },
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "open_project", {
      payload: { path: PROJECT_B, recoverStaleLock: false },
    });
  });

  it("does not issue cleanup with an untrusted session id from a malformed response envelope", async () => {
    const opened = fixture();
    invoke.mockResolvedValueOnce({ ...opened, sessionId: 7, recovered: "false" });
    const { TauriProjectBackend } = await import("./tauri-backend");
    const backend = new TauriProjectBackend();

    await expect(backend.openProject(PROJECT_A)).rejects.toThrow(/sessionId|response/i);
    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith("open_project", {
      payload: { path: PROJECT_A, recoverStaleLock: false },
    });
  });

  it.each([
    [
      "missing",
      (opened: NativeOpenedProject) => {
        const response: Record<string, unknown> = { ...opened };
        delete response.projectPath;
        return response;
      },
    ],
    [
      "invalid",
      (opened: NativeOpenedProject) => ({ ...opened, projectPath: 7 }),
    ],
  ] as const)(
    "best-effort closes a trusted session when the malformed response has a %s projectPath",
    async (_label, malformed) => {
      const opened = fixture();
      invoke.mockResolvedValueOnce(malformed(opened)).mockResolvedValueOnce(undefined);
      const { TauriProjectBackend } = await import("./tauri-backend");
      const backend = new TauriProjectBackend();

      await expect(backend.openProject(PROJECT_A)).rejects.toThrow(/projectPath|response/i);
      expect(invoke.mock.calls).toEqual([
        [
          "open_project",
          { payload: { path: PROJECT_A, recoverStaleLock: false } },
        ],
        [
          "close_project",
          { payload: { sessionId: SESSION_A } },
        ],
      ]);
    },
  );

  it("retries pathless pending cleanup before starting the next create operation", async () => {
    const malformed: Record<string, unknown> = { ...fixture() };
    delete malformed.projectPath;
    const created = fixture(SESSION_B, PROJECT_B, "Market");
    invoke
      .mockResolvedValueOnce(malformed)
      .mockRejectedValueOnce(new Error("initial cleanup unavailable"))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(created);
    const { TauriProjectBackend } = await import("./tauri-backend");
    const backend = new TauriProjectBackend();

    await expect(backend.openProject(PROJECT_A)).rejects.toThrow(/projectPath|response/i);
    await expect(
      backend.createProject({
        name: "Market",
        location: "E:\\Projects",
        profile: "market",
      }),
    ).resolves.toMatchObject({
      projectPath: PROJECT_B,
      snapshot: created.snapshot,
    });

    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      "open_project",
      "close_project",
      "close_project",
      "create_project",
    ]);
    expect(invoke).toHaveBeenNthCalledWith(3, "close_project", {
      payload: { sessionId: SESSION_A },
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "create_project", {
      payload: { name: "Market", parent: "E:\\Projects", profile: "market" },
    });
  });

  it("serializes concurrent create and open so they drain one pending session exactly once", async () => {
    const malformed: Record<string, unknown> = { ...fixture() };
    delete malformed.projectPath;
    invoke
      .mockResolvedValueOnce(malformed)
      .mockRejectedValueOnce(new Error("initial cleanup unavailable"));
    const { TauriProjectBackend } = await import("./tauri-backend");
    const backend = new TauriProjectBackend();
    await expect(backend.openProject(PROJECT_A)).rejects.toThrow(/projectPath|response/i);

    const created = fixture(SESSION_B, PROJECT_B, "Market");
    const opened = fixture(SESSION_A, PROJECT_A, "Demo");
    invoke.mockClear();
    invoke.mockImplementation(async (command: string) => {
      if (command === "close_project") return undefined;
      if (command === "create_project") return created;
      if (command === "open_project") return opened;
      throw new Error(`Unexpected command: ${command}`);
    });

    const createPromise = backend.createProject({
      name: "Market",
      location: "E:\\Projects",
      profile: "market",
    });
    const openPromise = backend.openProject(PROJECT_A);
    const [createdProject, openedProject] = await Promise.all([createPromise, openPromise]);

    expect(createdProject.projectPath).toBe(PROJECT_B);
    expect(openedProject.projectPath).toBe(PROJECT_A);
    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      "close_project",
      "create_project",
      "open_project",
    ]);
    expect(invoke.mock.calls.filter(([command]) => command === "close_project")).toHaveLength(1);
    expect(invoke).toHaveBeenNthCalledWith(1, "close_project", {
      payload: { sessionId: SESSION_A },
    });
  });

  it("disposes a pathless pending session by closing its trusted session id", async () => {
    const malformed: Record<string, unknown> = { ...fixture() };
    delete malformed.projectPath;
    invoke
      .mockResolvedValueOnce(malformed)
      .mockRejectedValueOnce(new Error("initial cleanup unavailable"));
    const { TauriProjectBackend } = await import("./tauri-backend");
    const backend = new TauriProjectBackend();
    await expect(backend.openProject(PROJECT_A)).rejects.toThrow(/projectPath|response/i);

    invoke.mockClear();
    invoke.mockResolvedValueOnce(undefined);
    await backend.dispose();

    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith("close_project", {
      payload: { sessionId: SESSION_A },
    });
  });

  it("retries a failed dispose close for an active session and becomes idempotent after success", async () => {
    const opened = fixture();
    invoke.mockResolvedValueOnce(opened);
    const { TauriProjectBackend } = await import("./tauri-backend");
    const backend = new TauriProjectBackend();
    await backend.openProject(PROJECT_A);

    invoke.mockClear();
    invoke
      .mockRejectedValueOnce(new Error("native close unavailable"))
      .mockResolvedValueOnce(undefined);

    await expect(backend.dispose()).rejects.toThrow();
    await expect(backend.dispose()).resolves.toBeUndefined();
    await expect(backend.dispose()).resolves.toBeUndefined();

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenNthCalledWith(1, "close_project", {
      payload: { sessionId: SESSION_A },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "close_project", {
      payload: { sessionId: SESSION_A },
    });
  });

  it("runtime-parses authoritative checkpoints, rejects malformed or incoherent results, and keeps the session available", async () => {
    const opened = fixture();
    const invalidManifest = { ...opened.manifest, schemaVersion: 2 };
    const incoherentSnapshot = parseSnapshot({
      ...opened.snapshot,
      project: { ...opened.snapshot.project, name: "Different" },
    });
    invoke
      .mockResolvedValueOnce(opened)
      .mockResolvedValueOnce({ manifest: invalidManifest, snapshot: opened.snapshot })
      .mockResolvedValueOnce({ manifest: opened.manifest, snapshot: incoherentSnapshot })
      .mockResolvedValueOnce({ manifest: opened.manifest, snapshot: opened.snapshot });
    const { TauriProjectBackend } = await import("./tauri-backend");
    const backend = new TauriProjectBackend();
    await backend.openProject(PROJECT_A);

    await expect(backend.checkpoint(PROJECT_A, opened.snapshot)).rejects.toThrow(/schemaVersion/i);
    await expect(backend.checkpoint(PROJECT_A, opened.snapshot)).rejects.toThrow(/coherent/i);
    await expect(backend.checkpoint(PROJECT_A, opened.snapshot)).resolves.toEqual({
      manifest: opened.manifest,
      snapshot: opened.snapshot,
    });
    expect(invoke).toHaveBeenNthCalledWith(4, "checkpoint_project", {
      payload: { sessionId: SESSION_A, snapshot: opened.snapshot },
    });
  });

  it("rejects a coherent schema-v1 checkpoint response without losing the active session", async () => {
    const snapshot = parseSnapshot(snapshotV1Fixture);
    const manifest = createManifest(snapshot, {
      appVersion: "0.1.0",
      now: () => "2026-07-20T00:00:00.000Z",
    });
    const opened = {
      ...fixture(),
      manifest,
      snapshot,
    };
    const checkpointedSnapshot = parseSnapshot({
      ...snapshot,
      checkpointSequence: snapshot.sequence,
    });
    invoke
      .mockResolvedValueOnce(opened)
      .mockResolvedValueOnce({
        manifest: { ...manifest, schemaVersion: 1 },
        snapshot: {
          ...snapshotV1Fixture,
          checkpointSequence: snapshotV1Fixture.sequence,
        },
      })
      .mockResolvedValueOnce({
        manifest,
        snapshot: checkpointedSnapshot,
      });

    const { TauriProjectBackend } = await import("./tauri-backend");
    const backend = new TauriProjectBackend();
    await backend.openProject(PROJECT_A);

    await expect(backend.checkpoint(PROJECT_A, snapshot)).rejects.toThrow(/schemaVersion/i);
    await expect(backend.checkpoint(PROJECT_A, snapshot)).resolves.toEqual({
      manifest,
      snapshot: checkpointedSnapshot,
    });
    expect(invoke).toHaveBeenNthCalledWith(3, "checkpoint_project", {
      payload: { sessionId: SESSION_A, snapshot },
    });
  });
});

describe("selectBackend", () => {
  it("selects desktop for an explicit force or a detected Tauri runtime", async () => {
    vi.stubEnv("DEV", false);
    vi.stubGlobal("window", {});
    const { selectBackend } = await import("./select-backend");
    await expect(selectBackend("desktop")).resolves.toMatchObject({ mode: "desktop" });

    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    await expect(selectBackend()).resolves.toMatchObject({ mode: "desktop" });
  });

  it("allows the web sandbox only in development", async () => {
    vi.stubEnv("DEV", true);
    vi.stubGlobal("window", {});
    const { selectBackend } = await import("./select-backend");

    await expect(selectBackend()).resolves.toMatchObject({ mode: "sandbox" });
    await expect(selectBackend("sandbox")).resolves.toMatchObject({ mode: "sandbox" });
  });

  it("fails closed outside Tauri in production, including an explicitly forced sandbox", async () => {
    vi.stubEnv("DEV", false);
    vi.stubGlobal("window", {});
    const { selectBackend } = await import("./select-backend");

    await expect(selectBackend()).rejects.toThrow("TAURI_RUNTIME_REQUIRED");
    await expect(selectBackend("sandbox")).rejects.toThrow("WEB_SANDBOX_DISABLED");
  });
});
