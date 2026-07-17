import { describe, expect, it, vi } from "vitest";
import {
  CommandBus,
  commandIntent,
  type CommandDefinition,
  type CommitBatch,
  type PersistencePort,
} from "./index";

interface State {
  name: string;
  tags: string[];
  sequence: number;
}

const rename: CommandDefinition<State, { name: string }> = {
  type: "project.rename",
  prepare: (state, payload) => ({
    next: { ...state, name: payload.name },
    inversePayload: { name: state.name },
  }),
  applyInverse: (state, payload) => ({
    ...state,
    name: (payload as { name: string }).name,
  }),
};

const addTag: CommandDefinition<State, { tag: string }> = {
  type: "project.tag.add",
  prepare: (state, payload) => ({
    next: { ...state, tags: [...state.tags, payload.tag] },
    inversePayload: { tags: state.tags },
  }),
  applyInverse: (state, payload) => ({
    ...state,
    tags: (payload as { tags: string[] }).tags,
  }),
};

const initialState = (): State => ({ name: "Old", tags: [], sequence: 0 });

describe("CommandBus", () => {
  it("publishes only after persistence commits", async () => {
    let release!: () => void;
    const commit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const bus = new CommandBus(initialState(), { commit });

    const pending = bus.execute(rename, { name: "New" });

    expect(bus.getSnapshot().name).toBe("Old");
    release();
    await pending;
    expect(bus.getSnapshot()).toEqual({ name: "New", tags: [], sequence: 1 });
  });

  it("keeps state and history unchanged when persistence fails", async () => {
    const bus = new CommandBus(initialState(), {
      commit: vi.fn().mockRejectedValue(new Error("disk full")),
    });

    await expect(bus.execute(rename, { name: "New" })).rejects.toThrow("disk full");

    expect(bus.getSnapshot()).toEqual(initialState());
    expect(bus.canUndo()).toBe(false);
    expect(bus.canRedo()).toBe(false);
  });

  it("groups heterogeneous intents into one commit and one undo step", async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const bus = new CommandBus(initialState(), { commit });

    await bus.transaction([
      commandIntent(rename, { name: "A" }),
      commandIntent(addTag, { tag: "featured" }),
    ]);

    expect(commit).toHaveBeenCalledTimes(1);
    expect(bus.getSnapshot()).toEqual({ name: "A", tags: ["featured"], sequence: 2 });

    await bus.undo();

    expect(bus.getSnapshot()).toEqual({ name: "Old", tags: [], sequence: 4 });
    expect(bus.canUndo()).toBe(false);
    expect(bus.canRedo()).toBe(true);
  });

  it("records apply, undo, and redo with monotonic sequences and durable ordering", async () => {
    const batches: CommitBatch<State>[] = [];
    const persistence: PersistencePort<State> = {
      commit: vi.fn(async (batch) => {
        batches.push(batch);
      }),
    };
    const bus = new CommandBus(initialState(), persistence);

    await bus.transaction([
      commandIntent(rename, { name: "New" }),
      commandIntent(addTag, { tag: "featured" }),
    ]);
    await bus.undo();
    await bus.redo();

    expect(persistence.commit).toHaveBeenCalledTimes(3);
    expect(batches).toHaveLength(3);

    const [applyBatch, undoBatch, redoBatch] = batches;
    expect(applyBatch?.journal.map((entry) => entry.sequence)).toEqual([1, 2]);
    expect(undoBatch?.journal.map((entry) => entry.sequence)).toEqual([3, 4]);
    expect(redoBatch?.journal.map((entry) => entry.sequence)).toEqual([5, 6]);
    expect(applyBatch?.journal.map((entry) => entry.action)).toEqual(["apply", "apply"]);
    expect(undoBatch?.journal.map((entry) => entry.action)).toEqual(["undo", "undo"]);
    expect(redoBatch?.journal.map((entry) => entry.action)).toEqual(["redo", "redo"]);
    expect(undoBatch?.journal.map((entry) => entry.commandType)).toEqual([
      "project.tag.add",
      "project.rename",
    ]);
    expect(redoBatch?.journal.map((entry) => entry.commandType)).toEqual([
      "project.rename",
      "project.tag.add",
    ]);

    const transactionIds = batches.map((batch) => new Set(batch.journal.map((entry) => entry.transactionId)));
    expect(transactionIds.every((ids) => ids.size === 1)).toBe(true);
    expect(new Set(transactionIds.map((ids) => [...ids][0])).size).toBe(3);
    expect(undoBatch?.journal.map((entry) => entry.payload)).toEqual([
      { tag: "featured" },
      { name: "New" },
    ]);
    expect(undoBatch?.journal.map((entry) => entry.inversePayload)).toEqual([
      { tags: [] },
      { name: "Old" },
    ]);
    expect(redoBatch?.journal.map((entry) => entry.payload)).toEqual([
      { name: "New" },
      { tag: "featured" },
    ]);
    expect(bus.getSnapshot()).toEqual({ name: "New", tags: ["featured"], sequence: 6 });
    expect(bus.canUndo()).toBe(true);
    expect(bus.canRedo()).toBe(false);
  });

  it("clears redo only after a new command commits", async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const bus = new CommandBus(initialState(), { commit });

    await bus.execute(rename, { name: "First" });
    await bus.undo();
    expect(bus.canRedo()).toBe(true);

    await bus.execute(rename, { name: "Branch" });

    expect(bus.getSnapshot()).toEqual({ name: "Branch", tags: [], sequence: 3 });
    expect(bus.canRedo()).toBe(false);
    await expect(bus.redo()).resolves.toEqual(bus.getSnapshot());
    expect(commit).toHaveBeenCalledTimes(3);
  });

  it("keeps state and history unchanged when undo persistence fails", async () => {
    const commit = vi
      .fn<(batch: CommitBatch<State>) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("undo failed"))
      .mockResolvedValueOnce(undefined);
    const bus = new CommandBus(initialState(), { commit });

    await bus.execute(rename, { name: "New" });
    await expect(bus.undo()).rejects.toThrow("undo failed");

    expect(bus.getSnapshot()).toEqual({ name: "New", tags: [], sequence: 1 });
    expect(bus.canUndo()).toBe(true);
    expect(bus.canRedo()).toBe(false);

    await bus.undo();
    expect(bus.getSnapshot()).toEqual({ name: "Old", tags: [], sequence: 2 });
    expect(bus.canUndo()).toBe(false);
    expect(bus.canRedo()).toBe(true);
  });

  it("serializes concurrent commands before preparing the next candidate", async () => {
    const batches: CommitBatch<State>[] = [];
    const releases: Array<() => void> = [];
    const commit = vi.fn(
      (batch: CommitBatch<State>) =>
        new Promise<void>((resolve) => {
          batches.push(batch);
          releases.push(resolve);
        }),
    );
    const bus = new CommandBus(initialState(), { commit });

    const first = bus.execute(rename, { name: "First" });
    const second = bus.execute(rename, { name: "Second" });

    expect(commit).toHaveBeenCalledTimes(1);
    expect(bus.getSnapshot()).toEqual(initialState());

    releases[0]?.();
    await first;
    expect(commit).toHaveBeenCalledTimes(2);
    expect(batches[1]?.before).toEqual({ name: "First", tags: [], sequence: 1 });
    expect(bus.getSnapshot()).toEqual({ name: "First", tags: [], sequence: 1 });

    releases[1]?.();
    await second;
    expect(bus.getSnapshot()).toEqual({ name: "Second", tags: [], sequence: 2 });
  });
});
