import type { CommandDefinition } from "@aethertwin/command-bus";
import {
  parseSnapshot,
  type ProjectSnapshot,
  type SceneEnvironment,
} from "@aethertwin/core-model";

export interface SceneEnvironmentPatch {
  readonly before: SceneEnvironment;
  readonly after: SceneEnvironment;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown, path: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid " + path + ": expected an object");
  }
  return value as JsonRecord;
}

function exactKeys(
  value: JsonRecord,
  expected: readonly string[],
  path: string,
): void {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (
    actual.length !== keys.length
    || actual.some((key, index) => key !== keys[index])
  ) {
    throw new Error("Invalid " + path + ": unexpected or missing fields");
  }
}

function structuralEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => structuralEquals(value, right[index]));
  }
  if (
    left === null
    || right === null
    || typeof left !== "object"
    || typeof right !== "object"
  ) {
    return false;
  }
  const leftRecord = left as JsonRecord;
  const rightRecord = right as JsonRecord;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return structuralEquals(leftKeys, rightKeys)
    && leftKeys.every((key) =>
      structuralEquals(leftRecord[key], rightRecord[key]));
}

function withEnvironment(
  state: ProjectSnapshot,
  environment: unknown,
): ProjectSnapshot {
  return parseSnapshot({
    ...state,
    project: {
      ...state.project,
      sceneEnvironment: environment,
    },
  });
}

function applyPatch(
  state: ProjectSnapshot,
  value: unknown,
): {
  readonly next: ProjectSnapshot;
  readonly patch: SceneEnvironmentPatch;
} {
  const source = record(value, "scene environment patch");
  exactKeys(source, ["before", "after"], "scene environment patch");

  const before = withEnvironment(
    state,
    source.before,
  ).project.sceneEnvironment;
  if (!structuralEquals(state.project.sceneEnvironment, before)) {
    throw new Error("Scene environment patch before mismatch");
  }

  const next = withEnvironment(state, source.after);
  const after = next.project.sceneEnvironment;
  if (!structuralEquals(after, source.after)) {
    throw new Error("Scene environment patch claimed after is not canonical");
  }
  return {
    next,
    patch: { before, after },
  };
}

export const patchSceneEnvironmentCommand: CommandDefinition<
  ProjectSnapshot,
  SceneEnvironmentPatch
> = {
  type: "scene.environment.patch",
  prepare: (state, payload) => {
    const { next, patch } = applyPatch(state, payload);
    return {
      next,
      inversePayload: {
        before: patch.after,
        after: patch.before,
      },
    };
  },
  applyInverse: (state, payload) => applyPatch(state, payload).next,
};
