import type { ProjectBackend } from "./backend";
import {
  createInitialSnapshot,
  identityTransform2D,
  parseSnapshot,
  type Boundary,
  type Fixture,
  type ProjectSnapshot,
} from "@aethertwin/core-model";
import { rectangularArray, type FloorChange, type PlanEditIntent } from "@aethertwin/plan-engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ProjectStore,
  RecentProjects,
  SandboxProjectBackend,
  renameProjectCommand,
  setProjectTagsCommand,
  type KeyValueStorage,
} from "./index";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function fixtureFor(snapshot: ProjectSnapshot, id = "00000000-0000-4000-8000-000000000010", name = "Fixture"): Fixture {
  const floor = snapshot.project.floors[0]!;
  return {
    type: "fixture",
    id,
    name,
    tags: [],
    floorId: floor.id,
    layerId: floor.layers[0]!.id,
    locked: false,
    transform: identityTransform2D,
    kind: "generic",
    size: { width: 1000, height: 500 },
  };
}

describe("ProjectStore", () => {
  it("creates only showroom or market projects", async () => {
    const store = new ProjectStore(new SandboxProjectBackend());
    await store.create({ name: "Market", location: "sandbox", profile: "market" });
    expect(store.getState().snapshot?.project.profile).toBe("market");

    await expect(
      store.create({ name: "Invalid", location: "sandbox", profile: "iot" as never }),
    ).rejects.toThrow(/profile/i);
    expect(store.getState().snapshot?.project.profile).toBe("market");
  });

  it("moves from dirty to saved after an autosave checkpoint", async () => {
    vi.useFakeTimers();
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 500 });
    await store.create({ name: "Demo", location: "sandbox", profile: "showroom" });
    await store.renameProject("Renamed");
    expect(store.getState().saveState).toBe("dirty");
    await vi.advanceTimersByTimeAsync(500);
    expect(store.getState().saveState).toBe("saved");
    expect(backend.checkpointCount).toBe(1);
  });

  it("surfaces persistence failure without publishing the rename", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend);
    await store.create({ name: "Old", location: "sandbox", profile: "market" });
    backend.failNextCommit = new Error("disk full");
    await expect(store.renameProject("New")).rejects.toThrow("disk full");
    expect(store.getState().snapshot?.project.name).toBe("Old");
    expect(store.getState().saveState).toBe("error");
  });

  it("publishes a mutation only after its durable commit finishes", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend);
    await store.create({ name: "Old", location: "sandbox", profile: "market" });
    let release!: () => void;
    vi.spyOn(backend, "commit").mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const pending = store.renameProject("New");

    await Promise.resolve();
    expect(store.getState().snapshot?.project.name).toBe("Old");
    release();
    await pending;
    expect(store.getState().snapshot?.project.name).toBe("New");
    expect(store.getState().saveState).toBe("dirty");
  });

  it("normalizes commands and delegates undo and redo to the open project's command bus", async () => {
    vi.useFakeTimers();
    const store = new ProjectStore(new SandboxProjectBackend(), { autosaveDelayMs: 60_000 });
    await store.create({ name: "Old", location: "sandbox", profile: "showroom" });

    await store.renameProject("  New  ");
    await store.setProjectTags([" featured ", "", "featured", " summer "]);
    expect(store.getState().snapshot?.project).toMatchObject({
      name: "New",
      tags: ["featured", "summer"],
    });
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: false });

    await store.undo();
    expect(store.getState().snapshot?.project.tags).toEqual([]);
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: true });
    await store.redo();
    expect(store.getState().snapshot?.project.tags).toEqual(["featured", "summer"]);
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: false });
  });

  it("trims project names and rejects an empty rename before persistence", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend);
    await store.create({ name: "Old", location: "sandbox", profile: "market" });
    const commit = vi.spyOn(backend, "commit");

    await expect(store.renameProject("   ")).rejects.toThrow(/name/i);

    expect(commit).not.toHaveBeenCalled();
    expect(store.getState().snapshot?.project.name).toBe("Old");
  });

  it("replaces the pending autosave timer after each committed mutation", async () => {
    vi.useFakeTimers();
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 500 });
    await store.create({ name: "Old", location: "sandbox", profile: "market" });
    await store.renameProject("First");
    await vi.advanceTimersByTimeAsync(400);
    await store.renameProject("Second");
    await vi.advanceTimersByTimeAsync(499);
    expect(backend.checkpointCount).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(backend.checkpointCount).toBe(1);
  });

  it("publishes saving and retains the durable current snapshot when checkpoint fails", async () => {
    vi.useFakeTimers();
    class BackendError extends Error {
      readonly code = "CHECKPOINT_FAILED";
      readonly logRef = "log-42";
    }
    const failure = new BackendError("checkpoint failed");
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Old", location: "sandbox", profile: "market" });
    await store.renameProject("Durable");
    const durableSnapshot = store.getState().snapshot;
    vi.spyOn(backend, "checkpoint").mockRejectedValueOnce(failure);
    const states: string[] = [];
    store.subscribe(() => states.push(store.getState().saveState));

    await expect(store.save()).rejects.toBe(failure);

    expect(states).toContain("saving");
    expect(store.getState().snapshot).toBe(durableSnapshot);
    expect(store.getState().snapshot?.project.name).toBe("Durable");
    expect(store.getState().saveState).toBe("error");
    expect(store.getState().error).toBeInstanceOf(BackendError);
    expect(store.getState().error).toMatchObject({ code: "CHECKPOINT_FAILED", logRef: "log-42" });
  });

  it("manual save checkpoints once and cancels the pending autosave", async () => {
    vi.useFakeTimers();
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 500 });
    await store.create({ name: "Old", location: "sandbox", profile: "market" });
    await store.renameProject("New");

    await store.save();
    await vi.advanceTimersByTimeAsync(500);

    expect(backend.checkpointCount).toBe(1);
    expect(store.getState()).toMatchObject({ saveState: "saved", error: null });
    expect(store.getState().manifest?.name).toBe("New");
  });

  it("rebases checkpoint metadata through later mutation, undo, redo, close, and reopen", async () => {
    vi.useFakeTimers();
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Initial", location: "sandbox", profile: "showroom" });
    const path = store.getState().projectPath!;

    await store.renameProject("Checkpointed");
    await store.save();
    expect(store.getState().snapshot).toMatchObject({ sequence: 1, checkpointSequence: 1 });
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: false });

    await store.renameProject("After checkpoint");
    await store.undo();
    await store.redo();
    expect(store.getState().snapshot).toMatchObject({
      sequence: 4,
      checkpointSequence: 1,
      project: { name: "After checkpoint" },
    });
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: false });

    await store.save();
    await store.close();
    await store.open(path);
    expect(store.getState().snapshot).toMatchObject({
      sequence: 4,
      checkpointSequence: 4,
      project: { name: "After checkpoint" },
    });
    expect(store.getState().snapshot?.checkpointSequence).toBe(
      store.getState().snapshot?.sequence,
    );
  });

  it("flush waits for an active operation boundary and reports that operation's failure", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend);
    await store.create({ name: "Old", location: "sandbox", profile: "market" });
    const failure = new Error("rename failed at boundary");
    let markCommitStarted!: () => void;
    let releaseCommit!: () => void;
    const commitStarted = new Promise<void>((resolve) => {
      markCommitStarted = resolve;
    });
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    vi.spyOn(backend, "commit").mockImplementationOnce(async () => {
      markCommitStarted();
      await commitGate;
      throw failure;
    });

    const rename = store.renameProject("Rejected");
    await commitStarted;
    const flushing = store.flush();
    releaseCommit();

    await expect(rename).rejects.toBe(failure);
    await expect(flushing).rejects.toBe(failure);
    expect(store.getState().snapshot?.project.name).toBe("Old");
  });

  it("flush reports the latest operation failure even when it already settled", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend);
    await store.create({ name: "Old", location: "sandbox", profile: "showroom" });
    const failure = new Error("settled rename failed");
    backend.failNextCommit = failure;

    await expect(store.renameProject("Rejected")).rejects.toBe(failure);

    await expect(store.flush()).rejects.toBe(failure);
    expect(store.getState().snapshot?.project.name).toBe("Old");
  });

  it("flush retains a failed mutation after a later manual save succeeds", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend);
    await store.create({ name: "Old", location: "sandbox", profile: "showroom" });
    const failure = new Error("rename failure must survive manual save");
    backend.failNextCommit = failure;

    await expect(store.renameProject("Rejected")).rejects.toBe(failure);
    await expect(store.save()).resolves.toBeUndefined();
    expect(backend.checkpointCount).toBe(1);

    await expect(store.flush()).rejects.toBe(failure);
    expect(store.getState().snapshot?.project.name).toBe("Old");
  });

  it("flush retains a failed mutation after an earlier mutation autosaves", async () => {
    vi.useFakeTimers();
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 500 });
    await store.create({ name: "Old", location: "sandbox", profile: "market" });
    await store.renameProject("Durable");
    const failure = new Error("rename failure must survive autosave");
    backend.failNextCommit = failure;

    await expect(store.renameProject("Rejected")).rejects.toBe(failure);
    await vi.advanceTimersByTimeAsync(500);
    expect(backend.checkpointCount).toBe(1);

    await expect(store.flush()).rejects.toBe(failure);
    expect(store.getState().snapshot?.project.name).toBe("Durable");
  });

  it("flush forgets a prior failure after a later operation succeeds", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Old", location: "sandbox", profile: "market" });
    const failure = new Error("transient rename failure");
    backend.failNextCommit = failure;
    await expect(store.renameProject("Rejected")).rejects.toBe(failure);
    await expect(store.flush()).rejects.toBe(failure);

    await store.renameProject("Recovered");

    await expect(store.flush()).resolves.toBeUndefined();
    expect(store.getState().snapshot?.project.name).toBe("Recovered");
    await store.close();
  });

  it("opens recovered projects in recovered state and clears recovery after saving", async () => {
    const sandbox = new SandboxProjectBackend();
    const opened = await sandbox.createProject({ name: "Recovered", location: "sandbox", profile: "showroom" });
    const backend: ProjectBackend = {
      mode: "sandbox",
      createProject: (request) => sandbox.createProject(request),
      openProject: async () => ({ ...opened, recovered: true }),
      recoverProject: (path, confirmation) => sandbox.recoverProject(path, confirmation),
      commit: (path, batch) => sandbox.commit(path, batch),
      checkpoint: (path, snapshot) => sandbox.checkpoint(path, snapshot),
      closeProject: (path) => sandbox.closeProject(path),
    };
    const store = new ProjectStore(backend);

    await store.open(opened.projectPath);
    expect(store.getState()).toMatchObject({ recovered: true, saveState: "recovered" });
    await store.save();
    expect(store.getState()).toMatchObject({ recovered: false, saveState: "saved" });
  });

  it("requires explicit confirmation for recovery, installs recovered state, and preserves the current project on failure", async () => {
    const sandbox = new SandboxProjectBackend();
    const current = await sandbox.createProject({
      name: "Current",
      location: "sandbox",
      profile: "market",
    });
    const recovered = {
      ...(await sandbox.createProject({
        name: "Recovered",
        location: "sandbox",
        profile: "showroom",
      })),
      recovered: true,
    };
    const recoveryFailure = new Error("recovery failed");
    const recoverProject = vi
      .fn<ProjectBackend["recoverProject"]>()
      .mockResolvedValueOnce(recovered)
      .mockRejectedValueOnce(recoveryFailure);
    const backend: ProjectBackend = {
      mode: "desktop",
      createProject: (request) => sandbox.createProject(request),
      openProject: async () => current,
      recoverProject,
      commit: (path, batch) => sandbox.commit(path, batch),
      checkpoint: (path, snapshot) => sandbox.checkpoint(path, snapshot),
      closeProject: (path) => sandbox.closeProject(path),
    };
    const store = new ProjectStore(backend);

    await store.open(current.projectPath);
    await store.recover(recovered.projectPath, { confirmed: true });
    expect(recoverProject).toHaveBeenCalledWith(recovered.projectPath, { confirmed: true });
    expect(store.getState()).toMatchObject({
      projectPath: recovered.projectPath,
      recovered: true,
      saveState: "recovered",
    });

    await expect(
      store.recover("E:\\Projects\\Failed.twinproj", { confirmed: true }),
    ).rejects.toBe(recoveryFailure);
    expect(store.getState()).toMatchObject({
      projectPath: recovered.projectPath,
      recovered: true,
      saveState: "error",
      error: recoveryFailure,
    });
  });

  it("closes the backend project, resets state, and cancels pending timers", async () => {
    vi.useFakeTimers();
    const backend = new SandboxProjectBackend();
    const close = vi.spyOn(backend, "closeProject");
    const store = new ProjectStore(backend, { autosaveDelayMs: 500 });
    await store.create({ name: "Demo", location: "sandbox", profile: "showroom" });
    const path = store.getState().projectPath;
    await store.renameProject("Dirty");

    await store.close();
    await vi.advanceTimersByTimeAsync(500);

    expect(close).toHaveBeenCalledWith(path);
    expect(backend.checkpointCount).toBe(0);
    expect(store.getState()).toEqual({
      projectPath: null,
      manifest: null,
      snapshot: null,
      recovered: false,
      saveState: "saved",
      error: null,
      canUndo: false,
      canRedo: false,
    });
  });

  it("disposes terminally while suppressing in-flight publication and queued backend work", async () => {
    vi.useFakeTimers();
    const backend = new SandboxProjectBackend();
    const createProject = vi.spyOn(backend, "createProject");
    const openProject = vi.spyOn(backend, "openProject");
    const close = vi.spyOn(backend, "closeProject");
    const checkpoint = vi.spyOn(backend, "checkpoint");
    const store = new ProjectStore(backend, { autosaveDelayMs: 500 });
    const listener = vi.fn();
    store.subscribe(listener);
    await store.create({ name: "Demo", location: "sandbox", profile: "showroom" });
    await store.renameProject("Dirty");
    expect(store.getState().saveState).toBe("dirty");

    const commitProject = backend.commit.bind(backend);
    let markCommitStarted!: () => void;
    let releaseCommit!: () => void;
    const commitStarted = new Promise<void>((resolve) => {
      markCommitStarted = resolve;
    });
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const commit = vi.spyOn(backend, "commit").mockImplementationOnce(async (path, batch) => {
      markCommitStarted();
      await commitGate;
      return commitProject(path, batch);
    });

    const inFlightRename = store.renameProject("In flight");
    await commitStarted;
    const queuedTags = store.setProjectTags(["must-not-commit"]);
    listener.mockClear();

    const firstDispose = store.dispose();
    const secondDispose = store.dispose();
    releaseCommit();

    await expect(inFlightRename).resolves.toBeUndefined();
    await expect(queuedTags).rejects.toThrow("ProjectStore is disposed");
    await Promise.all([firstDispose, secondDispose]);
    await vi.advanceTimersByTimeAsync(500);

    expect(listener).not.toHaveBeenCalled();
    expect(checkpoint).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(createProject).toHaveBeenCalledOnce();
    expect(openProject).not.toHaveBeenCalled();

    const queuedPublicOperations = [
      () => store.create({ name: "After dispose", location: "sandbox", profile: "market" }),
      () => store.open("sandbox://after-dispose"),
      () => store.renameProject("After dispose"),
      () => store.setProjectTags(["after-dispose"]),
      () => store.undo(),
      () => store.redo(),
      () => store.save(),
      () => store.close(),
    ];
    for (const operation of queuedPublicOperations) {
      await expect(operation()).rejects.toThrow("ProjectStore is disposed");
    }

    expect(createProject).toHaveBeenCalledOnce();
    expect(openProject).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledOnce();
    expect(checkpoint).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it("adopts an already-running close failure during disposal without retrying it", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend);
    await store.create({ name: "Demo", location: "sandbox", profile: "showroom" });
    const failure = new Error("close failed");
    let markCloseStarted!: () => void;
    let releaseClose!: () => void;
    const closeStarted = new Promise<void>((resolve) => {
      markCloseStarted = resolve;
    });
    const closeGate = new Promise<void>((resolve) => {
      releaseClose = resolve;
    });
    const close = vi.spyOn(backend, "closeProject").mockImplementation(async () => {
      markCloseStarted();
      await closeGate;
      throw failure;
    });

    const closing = store.close();
    await closeStarted;
    const disposing = store.dispose();
    releaseClose();

    await expect(closing).rejects.toBe(failure);
    await expect(disposing).rejects.toBe(failure);
    expect(close).toHaveBeenCalledOnce();
    await expect(store.dispose()).rejects.toBe(failure);
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps normal close retry semantics when the store is not disposed", async () => {
    const backend = new SandboxProjectBackend();
    const closeProject = backend.closeProject.bind(backend);
    const close = vi.spyOn(backend, "closeProject");
    const store = new ProjectStore(backend);
    await store.create({ name: "Demo", location: "sandbox", profile: "market" });
    const projectPath = store.getState().projectPath;
    const failure = new Error("temporary close failure");
    close.mockRejectedValueOnce(failure).mockImplementation(closeProject);

    await expect(store.close()).rejects.toBe(failure);
    expect(store.getState().projectPath).toBe(projectPath);

    await expect(store.close()).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledTimes(2);
    expect(store.getState().projectPath).toBeNull();
  });

  it("cancels a queued close so disposal performs the only backend close", async () => {
    const backend = new SandboxProjectBackend();
    const commitProject = backend.commit.bind(backend);
    const close = vi.spyOn(backend, "closeProject");
    const store = new ProjectStore(backend);
    await store.create({ name: "Demo", location: "sandbox", profile: "showroom" });
    let markCommitStarted!: () => void;
    let releaseCommit!: () => void;
    const commitStarted = new Promise<void>((resolve) => {
      markCommitStarted = resolve;
    });
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    vi.spyOn(backend, "commit").mockImplementationOnce(async (path, batch) => {
      markCommitStarted();
      await commitGate;
      return commitProject(path, batch);
    });

    const rename = store.renameProject("In flight");
    await commitStarted;
    const queuedClose = store.close();
    const disposing = store.dispose();
    releaseCommit();

    await expect(rename).resolves.toBeUndefined();
    await expect(queuedClose).rejects.toThrow("ProjectStore is disposed");
    await expect(disposing).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
  });

  it("returns an inert subscription after disposal and never calls its listener", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend);
    await store.create({ name: "Demo", location: "sandbox", profile: "market" });
    await store.dispose();
    const listener = vi.fn();

    const unsubscribe = store.subscribe(listener);
    await expect(store.renameProject("Rejected")).rejects.toThrow("ProjectStore is disposed");
    await expect(store.dispose()).resolves.toBeUndefined();

    expect(listener).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
    expect(() => unsubscribe()).not.toThrow();
  });

  it("cancels the prior project's timer and installs a fresh command bus on replacement", async () => {
    vi.useFakeTimers();
    const backend = new SandboxProjectBackend();
    const close = vi.spyOn(backend, "closeProject");
    const store = new ProjectStore(backend, { autosaveDelayMs: 500 });
    await store.create({ name: "First", location: "sandbox", profile: "market" });
    const firstPath = store.getState().projectPath;
    await store.renameProject("Dirty First");

    await store.create({ name: "Second", location: "sandbox", profile: "showroom" });
    await vi.advanceTimersByTimeAsync(500);

    expect(close).toHaveBeenCalledWith(firstPath);
    expect(backend.checkpointCount).toBe(0);
    expect(store.getState().snapshot?.project.name).toBe("Second");
    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: false });
  });

  it("does not let an old in-flight checkpoint satisfy save for a replacement project", async () => {
    const backend = new SandboxProjectBackend();
    const createProject = vi.spyOn(backend, "createProject");
    const checkpointProject = backend.checkpoint.bind(backend);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const checkpoint = vi.spyOn(backend, "checkpoint").mockImplementationOnce(async (path, snapshot) => {
      await gate;
      return checkpointProject(path, snapshot);
    });
    const store = new ProjectStore(backend);
    await store.create({ name: "First", location: "sandbox", profile: "market" });
    const firstSave = store.save();
    const replacing = store.create({ name: "Second", location: "sandbox", profile: "showroom" });
    await Promise.resolve();
    expect(createProject).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([firstSave, replacing]);
    await store.save();

    expect(checkpoint).toHaveBeenCalledTimes(2);
    expect(store.getState().manifest?.name).toBe("Second");
  });

  it("queues a save requested after replacement behind the old project's in-flight save", async () => {
    const backend = new SandboxProjectBackend();
    const checkpointProject = backend.checkpoint.bind(backend);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const checkpoint = vi.spyOn(backend, "checkpoint").mockImplementationOnce(async (path, snapshot) => {
      await gate;
      return checkpointProject(path, snapshot);
    });
    const store = new ProjectStore(backend);
    await store.create({ name: "First", location: "sandbox", profile: "market" });

    const firstSave = store.save();
    const replacing = store.create({ name: "Second", location: "sandbox", profile: "showroom" });
    const secondSave = store.save();
    release();
    await Promise.all([firstSave, replacing, secondSave]);

    expect(checkpoint).toHaveBeenCalledTimes(2);
    expect(store.getState()).toMatchObject({ saveState: "saved" });
    expect(store.getState().manifest?.name).toBe("Second");
  });

  it("serializes checkpoint before a later commit so durable state cannot regress", async () => {
    vi.useFakeTimers();
    const backend = new SandboxProjectBackend();
    const checkpointProject = backend.checkpoint.bind(backend);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(backend, "checkpoint").mockImplementationOnce(async (path, snapshot) => {
      await gate;
      return checkpointProject(path, snapshot);
    });
    const commit = vi.spyOn(backend, "commit");
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Old", location: "sandbox", profile: "market" });
    const path = store.getState().projectPath!;

    const saving = store.save();
    const renaming = store.renameProject("New");
    await Promise.resolve();
    expect(commit).not.toHaveBeenCalled();
    release();
    await Promise.all([saving, renaming]);

    expect((await backend.openProject(path)).snapshot.project.name).toBe("New");
    expect(store.getState()).toMatchObject({ saveState: "dirty" });
  });

  it("validates a replacement before closing the old project and cleans up an invalid new one", async () => {
    const sandbox = new SandboxProjectBackend();
    const closeProject = vi.fn<(path: string) => Promise<void>>().mockResolvedValue(undefined);
    const backend: ProjectBackend = {
      mode: "sandbox",
      createProject: (request) => sandbox.createProject(request),
      openProject: async () => {
        const valid = await sandbox.createProject({
          name: "Invalid replacement",
          location: "sandbox",
          profile: "market",
        });
        return {
          ...valid,
          projectPath: "sandbox://invalid-replacement",
          snapshot: { ...valid.snapshot, schemaVersion: 99 } as never,
        };
      },
      recoverProject: (path, confirmation) => sandbox.recoverProject(path, confirmation),
      commit: (path, batch) => sandbox.commit(path, batch),
      checkpoint: (path, snapshot) => sandbox.checkpoint(path, snapshot),
      closeProject,
    };
    const store = new ProjectStore(backend);
    await store.create({ name: "Old", location: "sandbox", profile: "showroom" });
    const oldPath = store.getState().projectPath;

    await expect(store.open("sandbox://requested")).rejects.toThrow(/schema/i);

    expect(closeProject).toHaveBeenCalledTimes(1);
    expect(closeProject).toHaveBeenCalledWith("sandbox://invalid-replacement");
    expect(closeProject).not.toHaveBeenCalledWith(oldPath);
    expect(store.getState().snapshot?.project.name).toBe("Old");
    expect(store.getState().saveState).toBe("error");
  });

  it("publishes immutable state and supports unsubscribe", async () => {
    const store = new ProjectStore(new SandboxProjectBackend());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    await store.create({ name: "Demo", location: "sandbox", profile: "showroom" });
    unsubscribe();
    await store.renameProject("New");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(store.getState())).toBe(true);
    expect(Object.isFrozen(store.getState().snapshot)).toBe(true);
  });

  it("isolates subscriber failures from durable store operations and later listeners", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend);
    const laterListener = vi.fn();
    store.subscribe(() => {
      throw new Error("listener failed");
    });
    store.subscribe(laterListener);

    await expect(
      store.create({ name: "Old", location: "sandbox", profile: "market" }),
    ).resolves.toBeUndefined();
    await expect(store.renameProject("New")).resolves.toBeUndefined();

    expect(laterListener).toHaveBeenCalledTimes(2);
    expect(store.getState().snapshot?.project.name).toBe("New");
    expect(store.getState().saveState).toBe("dirty");
  });

  it("publishes an actionable backend error when opening from the initial state fails", async () => {
    class BackendError extends Error {
      readonly code = "CORRUPT_PROJECT";
    }
    const failure = new BackendError("corrupt project");
    const backend = new SandboxProjectBackend();
    vi.spyOn(backend, "openProject").mockRejectedValueOnce(failure);
    const store = new ProjectStore(backend);

    await expect(store.open("sandbox://missing")).rejects.toBe(failure);

    expect(store.getState()).toMatchObject({
      projectPath: null,
      snapshot: null,
      saveState: "error",
      error: failure,
    });
    expect(store.getState().error).toBeInstanceOf(BackendError);
  });

  it("takes ownership of a create request before an asynchronous backend reads it", async () => {
    const sandbox = new SandboxProjectBackend();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const backend: ProjectBackend = {
      mode: "sandbox",
      createProject: async (request) => {
        await gate;
        return sandbox.createProject(request);
      },
      openProject: (path) => sandbox.openProject(path),
      recoverProject: (path, confirmation) => sandbox.recoverProject(path, confirmation),
      commit: (path, batch) => sandbox.commit(path, batch),
      checkpoint: (path, snapshot) => sandbox.checkpoint(path, snapshot),
      closeProject: (path) => sandbox.closeProject(path),
    };
    const store = new ProjectStore(backend);
    const request = { name: "Owned", location: "sandbox", profile: "market" as const };

    const pending = store.create(request);
    request.name = "Caller mutation";
    release();
    await pending;

    expect(store.getState().snapshot?.project.name).toBe("Owned");
  });

  it("publishes a multi-entity patch only after one durable commit and reverses it", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Demo", location: "sandbox", profile: "market" });
    const fixture = fixtureFor(store.getState().snapshot!);
    const commit = vi.spyOn(backend, "commit");
    await store.applyPlanEdit({
      reason: "create", changes: [{ id: fixture.id, before: null, after: fixture }],
    });
    expect(commit).toHaveBeenCalledOnce();
    expect(commit.mock.calls[0]![1].journal).toHaveLength(1);
    expect(commit.mock.calls[0]![1].journal[0]!.commandType).toBe("plan.entities.patch");
    expect(store.getState().snapshot?.project.entities).toContainEqual(fixture);
    await store.undo();
    expect(store.getState().snapshot?.project.entities).toEqual([]);
  });

  it("reopens the exact edited schema-v3 plan after array, undo, redo, and save", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "M1 Demo", location: "sandbox", profile: "market" });
    const initial = store.getState().snapshot!;
    const floor = initial.project.floors[0]!;
    const layer = floor.layers[0]!;
    const boundary: Boundary = {
      type: "boundary",
      id: "00000000-0000-4000-8000-000000000010",
      name: "Boundary",
      tags: [],
      floorId: floor.id,
      layerId: layer.id,
      locked: false,
      transform: identityTransform2D,
      polygon: [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 }],
    };
    const fixture: Fixture = {
      ...fixtureFor(initial, "00000000-0000-4000-8000-000000000011"),
      transform: {
        translation: { x: 500, y: 500 },
        rotation: 0,
        scale: { x: 1, y: 1 },
      },
    };
    await store.applyPlanEdit({
      reason: "create",
      changes: [
        { id: boundary.id, before: null, after: boundary },
        { id: fixture.id, before: null, after: fixture },
      ],
    });

    const beforeArray = store.getState().snapshot!;
    expect(beforeArray.sequence).toBe(initial.sequence + 1);
    expect(beforeArray.project.entities).toEqual([boundary, fixture]);

    const generatedIds = [12, 13, 14, 15, 16].map(
      (value) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`,
    );
    const cloneTranslations = [
      { x: 1000, y: 500 },
      { x: 1500, y: 500 },
      { x: 500, y: 1000 },
      { x: 1000, y: 1000 },
      { x: 1500, y: 1000 },
    ];
    const expectedArrayEntities = [
      boundary,
      fixture,
      ...generatedIds.map((id, index) => ({
        ...fixture,
        id,
        transform: {
          ...fixture.transform,
          translation: cloneTranslations[index]!,
        },
      })),
    ];
    const idQueue = [...generatedIds];
    const result = rectangularArray(
      [fixture],
      { rows: 2, columns: 3, rowGap: 500, columnGap: 500 },
      () => idQueue.shift()!,
    );
    if (!result.ok) throw new Error(result.issue.message);
    expect(idQueue).toEqual([]);
    await store.applyPlanEdit(result.value);

    const afterArray = store.getState().snapshot!;
    expect(afterArray.sequence).toBe(beforeArray.sequence + 1);
    expect(afterArray.checkpointSequence).toBe(beforeArray.checkpointSequence);
    expect(afterArray.project.entities).toEqual(expectedArrayEntities);

    await store.undo();
    const undone = store.getState().snapshot!;
    expect(undone.sequence).toBe(afterArray.sequence + 1);
    expect(undone.checkpointSequence).toBe(beforeArray.checkpointSequence);
    expect(undone.project.entities).toEqual([boundary, fixture]);
    expect(store.getState().canRedo).toBe(true);

    await store.redo();

    const projectPath = store.getState().projectPath!;
    const expected = store.getState().snapshot!;
    expect(expected.schemaVersion).toBe(3);
    expect(expected.sequence).toBe(undone.sequence + 1);
    expect(expected.checkpointSequence).toBe(beforeArray.checkpointSequence);
    expect(expected.project.entities).toEqual(expectedArrayEntities);
    await store.save();
    await store.close();
    await store.open(projectPath);

    expect(store.getState().snapshot).toEqual({
      ...expected,
      checkpointSequence: expected.sequence,
    });
  });

  it("durably preserves middle entity order across delete undo and redo", async () => {
    const backend = new SandboxProjectBackend();
    const commit = vi.spyOn(backend, "commit");
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Demo", location: "sandbox", profile: "market" });
    const snapshot = store.getState().snapshot!;
    const first = fixtureFor(snapshot, "00000000-0000-4000-8000-000000000010", "First");
    const middle = fixtureFor(snapshot, "00000000-0000-4000-8000-000000000011", "Middle");
    const last = fixtureFor(snapshot, "00000000-0000-4000-8000-000000000012", "Last");

    await store.applyPlanEdit({
      reason: "create",
      changes: [
        { id: first.id, before: null, after: first },
        { id: middle.id, before: null, after: middle },
        { id: last.id, before: null, after: last },
      ],
    });
    await store.applyPlanEdit({
      reason: "delete",
      changes: [{ id: middle.id, before: middle, after: null }],
    });
    expect(store.getState().snapshot?.project.entities).toEqual([first, last]);

    await store.undo();
    expect(store.getState().snapshot?.project.entities).toEqual([first, middle, last]);

    await store.redo();
    expect(store.getState().snapshot?.project.entities).toEqual([first, last]);
    expect(commit).toHaveBeenCalledTimes(4);
  });

  it("does not publish or advance history for a rejected plan patch", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Demo", location: "sandbox", profile: "market" });
    const fixture = fixtureFor(store.getState().snapshot!);
    const beforeSequence = store.getState().snapshot!.sequence;
    backend.failNextCommit = new Error("disk full");
    await expect(store.applyPlanEdit({
      reason: "create", changes: [{ id: fixture.id, before: null, after: fixture }],
    })).rejects.toThrow("disk full");
    expect(store.getState().snapshot?.project.entities).toEqual([]);
    expect(store.getState().snapshot?.sequence).toBe(beforeSequence);
    expect(store.getState().canUndo).toBe(false);
    expect(store.getState().canRedo).toBe(false);
  });

  it("persists layer visibility as one reversible floor patch", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Demo", location: "sandbox", profile: "market" });
    const before = store.getState().snapshot!.project.floors[0]!;
    const after = { ...before, layers: before.layers.map((layer) => ({ ...layer, visible: false })) };
    const commit = vi.spyOn(backend, "commit");
    await store.applyFloorPatch({ floorId: before.id, before, after });
    expect(commit).toHaveBeenCalledOnce();
    expect(commit.mock.calls[0]![1].journal[0]!.commandType).toBe("plan.floor.patch");
    expect(store.getState().snapshot!.project.floors[0]!.layers[0]!.visible).toBe(false);
    await store.undo();
    expect(store.getState().snapshot!.project.floors[0]!.layers[0]!.visible).toBe(true);
  });

  it("owns plan and floor patch inputs before their queued mutations start", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Demo", location: "sandbox", profile: "market" });
    const fixture = fixtureFor(store.getState().snapshot!);
    const intent: PlanEditIntent = {
      reason: "create", changes: [{ id: fixture.id, before: null, after: fixture }],
    };
    const pendingIntent = store.applyPlanEdit(intent);
    (intent.changes[0]!.after as { name: string }).name = "Caller mutation";
    await pendingIntent;
    expect(store.getState().snapshot!.project.entities[0]!.name).toBe("Fixture");

    const before = store.getState().snapshot!.project.floors[0]!;
    const after = { ...before, layers: before.layers.map((layer) => ({ ...layer, visible: false })) };
    const change: FloorChange = { floorId: before.id, before, after };
    const pendingFloor = store.applyFloorPatch(change);
    (change.after.layers[0] as { visible: boolean }).visible = true;
    await pendingFloor;
    expect(store.getState().snapshot!.project.floors[0]!.layers[0]!.visible).toBe(false);
  });
});

describe("project commands", () => {
  it("normalizes new values while restoring exact previous values from inverse payloads", () => {
    const initial = createInitialSnapshot({ name: "Initial", profile: "showroom" });
    const snapshot = parseSnapshot({
      ...initial,
      project: {
        ...initial.project,
        name: "  Previous  ",
        tags: [" prior ", "prior"],
      },
    });

    const rename = renameProjectCommand.prepare(snapshot, { name: "  New  " });
    expect(rename.next.project.name).toBe("New");
    expect(rename.inversePayload).toEqual({ name: "  Previous  " });
    expect(renameProjectCommand.applyInverse(rename.next, rename.inversePayload).project.name).toBe(
      "  Previous  ",
    );

    const tags = setProjectTagsCommand.prepare(snapshot, {
      tags: [" featured ", "", "featured"],
    });
    expect(tags.next.project.tags).toEqual(["featured"]);
    expect(tags.inversePayload).toEqual({ tags: [" prior ", "prior"] });
    expect(setProjectTagsCommand.applyInverse(tags.next, tags.inversePayload).project.tags).toEqual([
      " prior ",
      "prior",
    ]);
  });
});

describe("SandboxProjectBackend", () => {
  it("uses deterministic sandbox project paths and returns owned immutable clones", async () => {
    const backend = new SandboxProjectBackend();
    const created = await backend.createProject({ name: "Demo", location: "ignored", profile: "market" });
    expect(created.projectPath).toBe("sandbox://00000000-0000-4000-8000-000000000001");

    const first = await backend.openProject(created.projectPath);
    const second = await backend.openProject(created.projectPath);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.snapshot).not.toBe(second.snapshot);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.snapshot.project.tags)).toBe(true);
  });

  it("clones commit and checkpoint values across the backend boundary", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Old", location: "sandbox", profile: "showroom" });
    const path = store.getState().projectPath!;
    await store.renameProject("New");
    await store.save();

    const opened = await backend.openProject(path);
    expect(opened.snapshot.project.name).toBe("New");
    expect(opened.manifest.name).toBe("New");
    expect(opened.snapshot).not.toBe(store.getState().snapshot);
  });
});

describe("RecentProjects", () => {
  it("normalizes duplicated and out-of-order legacy storage by newest valid timestamp", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "aethertwin.recentProjects.v1",
      JSON.stringify([
        {
          path: "sandbox://one",
          name: "One old",
          profile: "showroom",
          openedAt: "2026-07-17T01:00:00.000Z",
        },
        {
          path: "sandbox://two",
          name: "Two",
          profile: "market",
          openedAt: "2026-07-17T03:00:00.000Z",
        },
        {
          path: "sandbox://one",
          name: "One invalid",
          profile: "market",
          openedAt: "not-a-timestamp",
        },
        {
          path: "sandbox://one",
          name: "One newest",
          profile: "market",
          openedAt: "2026-07-17T04:00:00.000Z",
        },
        {
          path: "sandbox://ONE",
          name: "Case-sensitive path",
          profile: "showroom",
          openedAt: "2026-07-17T02:00:00.000Z",
        },
      ]),
    );
    const recents = new RecentProjects(storage);

    const listed = recents.list();

    expect(listed.map(({ path, name, openedAt }) => ({ path, name, openedAt }))).toEqual([
      {
        path: "sandbox://one",
        name: "One newest",
        openedAt: "2026-07-17T04:00:00.000Z",
      },
      {
        path: "sandbox://two",
        name: "Two",
        openedAt: "2026-07-17T03:00:00.000Z",
      },
      {
        path: "sandbox://ONE",
        name: "Case-sensitive path",
        openedAt: "2026-07-17T02:00:00.000Z",
      },
    ]);
    expect(JSON.parse(storage.getItem("aethertwin.recentProjects.v1")!)).toEqual(listed);
  });

  it("keeps a newer stored record when an older timestamp is recorded later", () => {
    const storage = new MemoryStorage();
    const recents = new RecentProjects(storage);
    recents.record({
      path: "sandbox://one",
      name: "Newest",
      profile: "market",
      openedAt: "2026-07-17T04:00:00.000Z",
    });
    recents.record({
      path: "sandbox://two",
      name: "Two",
      profile: "showroom",
      openedAt: "2026-07-17T03:00:00.000Z",
    });

    recents.record({
      path: "sandbox://one",
      name: "Stale event",
      profile: "showroom",
      openedAt: "2026-07-17T01:00:00.000Z",
    });

    expect(recents.list().map(({ path, name }) => ({ path, name }))).toEqual([
      { path: "sandbox://one", name: "Newest" },
      { path: "sandbox://two", name: "Two" },
    ]);
  });

  it("stores app-local immutable recents newest-first and deduplicates exact paths", () => {
    const storage = new MemoryStorage();
    const recents = new RecentProjects(storage);
    const mutable = {
      path: "sandbox://one",
      name: "One",
      profile: "showroom" as const,
      openedAt: "2026-07-17T00:00:00.000Z",
    };
    recents.record(mutable);
    mutable.name = "Caller mutation";
    recents.record({
      path: "sandbox://two",
      name: "Two",
      profile: "market",
      openedAt: "2026-07-17T01:00:00.000Z",
    });
    recents.record({
      path: "sandbox://one",
      name: "One reopened",
      profile: "showroom",
      openedAt: "2026-07-17T02:00:00.000Z",
    });

    const listed = recents.list();
    expect(listed.map(({ path, name }) => ({ path, name }))).toEqual([
      { path: "sandbox://one", name: "One reopened" },
      { path: "sandbox://two", name: "Two" },
    ]);
    expect(Object.isFrozen(listed)).toBe(true);
    expect(Object.isFrozen(listed[0])).toBe(true);
    expect([...storage.values.keys()]).toEqual(["aethertwin.recentProjects.v1"]);
  });

  it("removes an existing path while preserving an immutable, persisted recent list", () => {
    const storage = new MemoryStorage();
    const recents = new RecentProjects(storage);
    recents.record({
      path: "sandbox://one",
      name: "One",
      profile: "showroom",
      openedAt: "2026-07-17T03:00:00.000Z",
    });
    recents.record({
      path: "sandbox://two",
      name: "Two",
      profile: "market",
      openedAt: "2026-07-17T02:00:00.000Z",
    });
    recents.record({
      path: "sandbox://three",
      name: "Three",
      profile: "showroom",
      openedAt: "2026-07-17T01:00:00.000Z",
    });

    recents.remove("sandbox://two");

    const listed = recents.list();
    expect(listed.map(({ path, name }) => ({ path, name }))).toEqual([
      { path: "sandbox://one", name: "One" },
      { path: "sandbox://three", name: "Three" },
    ]);
    expect(Object.isFrozen(listed)).toBe(true);
    expect(listed.every((project) => Object.isFrozen(project))).toBe(true);
    expect(JSON.parse(storage.getItem("aethertwin.recentProjects.v1")!)).toEqual(listed);
  });

  it("treats an unknown path as an immutable, persistence-preserving no-op", () => {
    const storage = new MemoryStorage();
    const recents = new RecentProjects(storage);
    recents.record({
      path: "sandbox://one",
      name: "One",
      profile: "showroom",
      openedAt: "2026-07-17T03:00:00.000Z",
    });
    const serializedBefore = storage.getItem("aethertwin.recentProjects.v1");

    recents.remove("sandbox://missing");

    const listed = recents.list();
    expect(listed.map(({ path, name }) => ({ path, name }))).toEqual([
      { path: "sandbox://one", name: "One" },
    ]);
    expect(Object.isFrozen(listed)).toBe(true);
    expect(Object.isFrozen(listed[0])).toBe(true);
    expect(storage.getItem("aethertwin.recentProjects.v1")).toBe(serializedBefore);
  });

  it("returns an empty list for malformed preferences without leaking paths into project data", async () => {
    const storage = new MemoryStorage();
    storage.setItem("aethertwin.recentProjects.v1", "{not-json");
    const recents = new RecentProjects(storage);
    expect(recents.list()).toEqual([]);

    const backend = new SandboxProjectBackend();
    const opened = await backend.createProject({ name: "Demo", location: "sandbox", profile: "market" });
    recents.record({
      path: opened.projectPath,
      name: opened.manifest.name,
      profile: opened.manifest.profile,
      openedAt: opened.manifest.updatedAt,
    });

    expect(JSON.stringify(opened.snapshot)).not.toContain(opened.projectPath);
    expect(JSON.stringify(opened.manifest)).not.toContain(opened.projectPath);
  });
});
