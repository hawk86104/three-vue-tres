import type { ProjectBackend } from "./backend";
import { createInitialSnapshot, parseSnapshot } from "@aethertwin/core-model";
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

  it("opens recovered projects in recovered state and clears recovery after saving", async () => {
    const sandbox = new SandboxProjectBackend();
    const opened = await sandbox.createProject({ name: "Recovered", location: "sandbox", profile: "showroom" });
    const backend: ProjectBackend = {
      mode: "sandbox",
      createProject: (request) => sandbox.createProject(request),
      openProject: async () => ({ ...opened, recovered: true }),
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
