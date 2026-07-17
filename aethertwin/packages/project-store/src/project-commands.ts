import type { CommandDefinition } from "@aethertwin/command-bus";
import { parseSnapshot, type ProjectSnapshot } from "@aethertwin/core-model";

interface RenameProjectPayload {
  readonly name: string;
}

interface SetProjectTagsPayload {
  readonly tags: readonly string[];
}

function normalizedName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Invalid project name: must not be empty");
  }
  return value.trim();
}

function normalizedTags(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((tag) => tag.trim()).filter((tag) => tag.length > 0))];
}

function inverseName(payload: unknown): string {
  if (payload === null || typeof payload !== "object" || !("name" in payload)) {
    throw new Error("Invalid inverse project name payload");
  }
  if (typeof payload.name !== "string" || payload.name.trim().length === 0) {
    throw new Error("Invalid inverse project name payload");
  }
  return payload.name;
}

function inverseTags(payload: unknown): readonly string[] {
  if (
    payload === null ||
    typeof payload !== "object" ||
    !("tags" in payload) ||
    !Array.isArray(payload.tags) ||
    payload.tags.some((tag) => typeof tag !== "string")
  ) {
    throw new Error("Invalid inverse project tags payload");
  }
  return [...payload.tags];
}

export const renameProjectCommand: CommandDefinition<ProjectSnapshot, RenameProjectPayload> = {
  type: "project.rename",
  prepare: (state, payload) => ({
    next: parseSnapshot({
      ...state,
      project: { ...state.project, name: normalizedName(payload.name) },
    }),
    inversePayload: { name: state.project.name },
  }),
  applyInverse: (state, payload) =>
    parseSnapshot({
      ...state,
      project: { ...state.project, name: inverseName(payload) },
    }),
};

export const setProjectTagsCommand: CommandDefinition<ProjectSnapshot, SetProjectTagsPayload> = {
  type: "project.tags.set",
  prepare: (state, payload) => ({
    next: parseSnapshot({
      ...state,
      project: { ...state.project, tags: normalizedTags(payload.tags) },
    }),
    inversePayload: { tags: state.project.tags },
  }),
  applyInverse: (state, payload) =>
    parseSnapshot({
      ...state,
      project: { ...state.project, tags: inverseTags(payload) },
    }),
};
