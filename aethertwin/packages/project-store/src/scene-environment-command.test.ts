import {
  createInitialSnapshot,
  type SceneEnvironment,
} from "@aethertwin/core-model";
import { describe, expect, it, vi } from "vitest";
import { ProjectStore } from "./project-store";
import {
  patchSceneEnvironmentCommand,
  type SceneEnvironmentPatch,
} from "./scene-environment-command";
import { SandboxProjectBackend } from "./sandbox-backend";

const environmentAfter = (): SceneEnvironment => ({
  backgroundColor: "#203040",
  ambient: {
    color: "#aabbcc",
    intensity: 4,
  },
  key: {
    color: "#ddeeff",
    intensity: 8,
    direction: [-100, 0, 100],
  },
  shadowsEnabled: false,
  shadowSoftness: 1,
});

describe("scene.environment.patch", () => {
  it("applies one exact environment and builds the exact inverse payload", () => {
    const initial = createInitialSnapshot({
      name: "Environment",
      profile: "showroom",
    });
    const before = initial.project.sceneEnvironment;
    const after = environmentAfter();

    const prepared = patchSceneEnvironmentCommand.prepare(initial, {
      before,
      after,
    });

    expect(patchSceneEnvironmentCommand.type).toBe("scene.environment.patch");
    expect(prepared.next.project.sceneEnvironment).toEqual(after);
    expect(Object.isFrozen(prepared.next.project.sceneEnvironment)).toBe(true);
    expect(Object.isFrozen(prepared.next.project.sceneEnvironment.key.direction))
      .toBe(true);
    expect(prepared.inversePayload).toEqual({
      before: after,
      after: before,
    });
    expect(
      patchSceneEnvironmentCommand.applyInverse(
        prepared.next,
        prepared.inversePayload,
      ),
    ).toEqual(initial);
  });

  it("accepts every approved inclusive boundary", () => {
    const initial = createInitialSnapshot({
      name: "Environment",
      profile: "showroom",
    });
    const after: SceneEnvironment = {
      backgroundColor: "#000000",
      ambient: { color: "#ffffff", intensity: 0 },
      key: {
        color: "#123ABC",
        intensity: 0,
        direction: [0, -100, 0],
      },
      shadowsEnabled: true,
      shadowSoftness: 0,
    };

    expect(
      patchSceneEnvironmentCommand.prepare(initial, {
        before: initial.project.sceneEnvironment,
        after,
      }).next.project.sceneEnvironment,
    ).toEqual(after);
  });

  it("rejects extra or missing keys at every payload level", () => {
    const initial = createInitialSnapshot({
      name: "Environment",
      profile: "showroom",
    });
    const before = initial.project.sceneEnvironment;
    const after = environmentAfter();
    const invalidPayloads: readonly unknown[] = [
      { before, after, extra: true },
      { before },
      { after },
      { before: { ...before, extra: true }, after },
      { before, after: { ...after, extra: true } },
      {
        before,
        after: {
          ...after,
          ambient: { ...after.ambient, extra: true },
        },
      },
      {
        before,
        after: {
          ...after,
          key: { ...after.key, extra: true },
        },
      },
      {
        before,
        after: {
          backgroundColor: after.backgroundColor,
          ambient: after.ambient,
          key: after.key,
          shadowsEnabled: after.shadowsEnabled,
        },
      },
    ];

    for (const payload of invalidPayloads) {
      expect(
        () => patchSceneEnvironmentCommand.prepare(
          initial,
          payload as SceneEnvironmentPatch,
        ),
        JSON.stringify(payload),
      ).toThrow();
    }
    expect(initial.project.sceneEnvironment).toEqual(before);
  });

  it("rejects invalid colors, bounds, directions, and non-finite values", () => {
    const initial = createInitialSnapshot({
      name: "Environment",
      profile: "showroom",
    });
    const before = initial.project.sceneEnvironment;
    const after = environmentAfter();
    const invalidAfterValues: readonly unknown[] = [
      { ...after, backgroundColor: "red" },
      { ...after, ambient: { ...after.ambient, color: "#12345" } },
      { ...after, ambient: { ...after.ambient, intensity: -0.01 } },
      { ...after, ambient: { ...after.ambient, intensity: 4.01 } },
      { ...after, key: { ...after.key, intensity: -0.01 } },
      { ...after, key: { ...after.key, intensity: 8.01 } },
      { ...after, key: { ...after.key, direction: [0, 0, 0] } },
      { ...after, key: { ...after.key, direction: [101, 0, 0] } },
      { ...after, key: { ...after.key, direction: [0, 1] } },
      { ...after, key: { ...after.key, direction: [0, Number.NaN, 1] } },
      { ...after, shadowSoftness: -0.01 },
      { ...after, shadowSoftness: 1.01 },
      { ...after, shadowsEnabled: "true" },
    ];

    for (const candidate of invalidAfterValues) {
      expect(
        () => patchSceneEnvironmentCommand.prepare(initial, {
          before,
          after: candidate as SceneEnvironment,
        }),
        JSON.stringify(candidate),
      ).toThrow();
    }
    expect(initial.project.sceneEnvironment).toEqual(before);
  });

  it("rejects stale before values for apply and inverse replay", () => {
    const initial = createInitialSnapshot({
      name: "Environment",
      profile: "showroom",
    });
    const before = initial.project.sceneEnvironment;
    const after = environmentAfter();
    const staleBefore = {
      ...before,
      ambient: { ...before.ambient, intensity: 0.75 },
    };

    expect(() => patchSceneEnvironmentCommand.prepare(initial, {
      before: staleBefore,
      after,
    })).toThrow(/before mismatch/i);

    const prepared = patchSceneEnvironmentCommand.prepare(initial, {
      before,
      after,
    });
    expect(() => patchSceneEnvironmentCommand.applyInverse(
      initial,
      prepared.inversePayload,
    )).toThrow(/before mismatch/i);
  });

  it("commits one owned payload and supports ProjectStore undo and redo", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    try {
      await store.create({
        name: "Environment",
        location: "sandbox",
        profile: "showroom",
      });
      const before = store.getState().snapshot!.project.sceneEnvironment;
      const after = environmentAfter();
      const committedAfter = structuredClone(after);
      const commit = vi.spyOn(backend, "commit");
      const patch: SceneEnvironmentPatch = { before, after };

      const pending = store.applySceneEnvironmentPatch(patch);
      (after.ambient as { intensity: number }).intensity = 0.25;
      (after.key.direction as unknown as number[])[0] = 1;
      await pending;

      expect(store.getState().snapshot!.project.sceneEnvironment)
        .toEqual(committedAfter);
      expect(commit).toHaveBeenCalledOnce();
      expect(commit.mock.calls[0]![1].journal).toHaveLength(1);
      expect(commit.mock.calls[0]![1].journal[0]).toMatchObject({
        commandType: "scene.environment.patch",
        action: "apply",
        payload: { before, after: committedAfter },
        inversePayload: { before: committedAfter, after: before },
      });

      await store.undo();
      expect(store.getState().snapshot!.project.sceneEnvironment).toEqual(before);
      expect(commit.mock.calls[1]![1].journal[0]).toMatchObject({
        commandType: "scene.environment.patch",
        action: "undo",
        inversePayload: { before: committedAfter, after: before },
      });

      await store.redo();
      expect(store.getState().snapshot!.project.sceneEnvironment)
        .toEqual(committedAfter);
      expect(commit.mock.calls[2]![1].journal[0]).toMatchObject({
        commandType: "scene.environment.patch",
        action: "redo",
        payload: { before, after: committedAfter },
      });
    } finally {
      await store.dispose();
    }
  });
  it("rejects a patch captured from a project that is replaced earlier in the queue", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    try {
      await store.create({
        name: "Environment A",
        location: "sandbox",
        profile: "showroom",
      });
      const projectAPath = store.getState().projectPath!;
      const beforeA = store.getState().snapshot!.project.sceneEnvironment;

      await store.create({
        name: "Environment B",
        location: "sandbox",
        profile: "showroom",
      });
      const projectBPath = store.getState().projectPath!;
      const projectB = structuredClone(store.getState().snapshot!);
      await store.open(projectAPath);
      const commit = vi.spyOn(backend, "commit");

      const replacing = store.open(projectBPath);
      const stalePatch = store.applySceneEnvironmentPatch({
        before: beforeA,
        after: environmentAfter(),
      });

      await replacing;
      await expect(stalePatch).rejects.toThrow(/project changed/i);
      expect(commit).not.toHaveBeenCalled();
      expect(store.getState()).toMatchObject({
        saveState: "saved",
        snapshot: projectB,
      });
      expect((await backend.openProject(projectBPath)).snapshot).toEqual(projectB);
    } finally {
      await store.dispose();
    }
  });

});
