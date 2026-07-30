import type { CommandDefinition } from "@aethertwin/command-bus";
import {
  parseSnapshot,
  type Opening,
  type ProjectSnapshot,
  type Wall,
} from "@aethertwin/core-model";
import type { PlanEditReason } from "@aethertwin/plan-engine";
import type { SnapshotRecordChange } from "./snapshot-records-command";

export interface BuildingWallChange {
  readonly id: string;
  readonly before: Wall | null;
  readonly after: Wall | null;
  readonly index?: number;
}

export interface BuildingStructurePatch {
  readonly reason: PlanEditReason;
  readonly wallChanges: readonly BuildingWallChange[];
  readonly openingChanges: readonly SnapshotRecordChange<Opening>[];
}

type JsonRecord = Record<string, unknown>;

interface ParsedChange<T> {
  readonly id: string;
  readonly before: T | null;
  readonly after: T | null;
  readonly index?: number;
}

interface AppliedChanges<TRecord, TChange extends TRecord> {
  readonly records: readonly TRecord[];
  readonly normalizedChanges: readonly ParsedChange<TChange>[];
}

const planEditReasons = new Set<PlanEditReason>([
  "create",
  "delete",
  "transform",
  "properties",
  "duplicate",
  "array",
  "align",
  "distribute",
]);
const canonicalIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function record(value: unknown, path: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${path}: expected an object`);
  }
  return value as JsonRecord;
}

function exactKeys(value: JsonRecord, expected: readonly string[], path: string): void {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (
    actual.length !== keys.length
    || actual.some((key, index) => key !== keys[index])
  ) {
    throw new Error(`Invalid ${path}: unexpected or missing fields`);
  }
}

function exactKeysWithOptional(
  value: JsonRecord,
  required: readonly string[],
  optional: readonly string[],
  path: string,
): void {
  const allowed = new Set([...required, ...optional]);
  if (
    !required.every((key) => Object.hasOwn(value, key))
    || Object.keys(value).some((key) => !allowed.has(key))
  ) {
    throw new Error(`Invalid ${path}: unexpected or missing fields`);
  }
}

function canonicalId(value: unknown, path: string): string {
  if (typeof value !== "string" || !canonicalIdPattern.test(value)) {
    throw new Error(`Invalid ${path}: expected a canonical UUID`);
  }
  return value;
}

function recordIndex(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid ${path}: expected a zero-based JSON-safe integer`);
  }
  return value;
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
    && leftKeys.every((key) => structuralEquals(leftRecord[key], rightRecord[key]));
}

function wallSide(value: unknown, id: string, path: string): Wall | null {
  if (value === null) return null;
  const source = record(value, path);
  exactKeysWithOptional(
    source,
    [
      "type",
      "id",
      "name",
      "tags",
      "floorId",
      "layerId",
      "transform",
      "locked",
      "centerLine",
      "thickness",
    ],
    ["spatial3D"],
    path,
  );
  if (source.type !== "wall") {
    throw new Error(`Invalid ${path}.type: expected wall`);
  }
  if (canonicalId(source.id, `${path}.id`) !== id) {
    throw new Error(`Invalid ${path}.id: must match change id`);
  }
  return value as Wall;
}

function openingSide(value: unknown, id: string, path: string): Opening | null {
  if (value === null) return null;
  const source = record(value, path);
  exactKeys(source, [
    "id",
    "name",
    "tags",
    "wallId",
    "kind",
    "distanceAlongWall",
    "width",
    "height",
    "sillHeight",
  ], path);
  if (canonicalId(source.id, `${path}.id`) !== id) {
    throw new Error(`Invalid ${path}.id: must match change id`);
  }
  return value as Opening;
}

function parseChanges<T>(
  value: unknown,
  path: string,
  targetIds: Set<string>,
  side: (value: unknown, id: string, path: string) => T | null,
): readonly ParsedChange<T>[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${path}: expected an array`);
  }
  return value.map((candidate, index): ParsedChange<T> => {
    const changePath = `${path}[${index}]`;
    const change = record(candidate, changePath);
    exactKeysWithOptional(change, ["id", "before", "after"], ["index"], changePath);
    const id = canonicalId(change.id, `${changePath}.id`);
    if (targetIds.has(id)) {
      throw new Error(`Invalid ${changePath}.id: duplicate target id`);
    }
    targetIds.add(id);
    const before = side(change.before, id, `${changePath}.before`);
    const after = side(change.after, id, `${changePath}.after`);
    if (before === null && after === null) {
      throw new Error(`Invalid ${changePath}: before and after cannot both be null`);
    }
    return {
      id,
      before,
      after,
      ...(Object.hasOwn(change, "index")
        ? { index: recordIndex(change.index, `${changePath}.index`) }
        : {}),
    };
  });
}

function parsePatch(value: unknown): BuildingStructurePatch {
  const source = record(value, "building structure patch");
  exactKeys(
    source,
    ["reason", "wallChanges", "openingChanges"],
    "building structure patch",
  );
  if (
    typeof source.reason !== "string"
    || !planEditReasons.has(source.reason as PlanEditReason)
  ) {
    throw new Error("Invalid building structure patch reason");
  }
  const targetIds = new Set<string>();
  const wallChanges = parseChanges(
    source.wallChanges,
    "building structure patch.wallChanges",
    targetIds,
    wallSide,
  );
  const openingChanges = parseChanges(
    source.openingChanges,
    "building structure patch.openingChanges",
    targetIds,
    openingSide,
  );
  if (wallChanges.length === 0 && openingChanges.length === 0) {
    throw new Error("Invalid building structure patch: expected at least one change");
  }
  return {
    reason: source.reason as PlanEditReason,
    wallChanges,
    openingChanges,
  };
}

function applyChanges<
  TRecord extends { readonly id: string },
  TChange extends TRecord,
>(
  source: readonly TRecord[],
  changes: readonly ParsedChange<TChange>[],
  path: string,
): AppliedChanges<TRecord, TChange> {
  const records = [...source];
  const normalizedChanges: ParsedChange<TChange>[] = [];
  for (const [changeIndex, change] of changes.entries()) {
    const currentIndex = records.findIndex((candidate) => candidate.id === change.id);
    const current = records[currentIndex];
    if (
      change.before === null
        ? currentIndex !== -1
        : currentIndex === -1 || !structuralEquals(current, change.before)
    ) {
      throw new Error(`${path} before mismatch at changes[${changeIndex}]`);
    }

    if (change.before === null) {
      const insertionIndex = change.index ?? records.length;
      if (insertionIndex > records.length) {
        throw new Error(`${path} index out of range at changes[${changeIndex}]`);
      }
      records.splice(insertionIndex, 0, change.after!);
      normalizedChanges.push({ ...change, index: insertionIndex });
      continue;
    }

    if (change.index !== undefined && change.index !== currentIndex) {
      throw new Error(`${path} index mismatch at changes[${changeIndex}]`);
    }
    normalizedChanges.push({ ...change, index: currentIndex });
    if (change.after === null) {
      records.splice(currentIndex, 1);
    } else {
      records[currentIndex] = change.after;
    }
  }
  return { records, normalizedChanges };
}

function reverseChanges<T>(
  changes: readonly ParsedChange<T>[],
): readonly ParsedChange<T>[] {
  return [...changes].reverse().map((change) => ({
    id: change.id,
    before: change.after,
    after: change.before,
    ...(change.index === undefined ? {} : { index: change.index }),
  }));
}

function applyPatch(
  state: ProjectSnapshot,
  value: unknown,
): {
  readonly next: ProjectSnapshot;
  readonly patch: BuildingStructurePatch;
  readonly normalizedWallChanges: readonly ParsedChange<Wall>[];
  readonly normalizedOpeningChanges: readonly ParsedChange<Opening>[];
} {
  const patch = parsePatch(value);
  const walls = applyChanges(
    state.project.entities,
    patch.wallChanges,
    "Building wall patch",
  );
  const openings = applyChanges(
    state.project.openings,
    patch.openingChanges,
    "Building opening patch",
  );
  const next = parseSnapshot({
    ...state,
    project: {
      ...state.project,
      entities: walls.records,
      openings: openings.records,
    },
  });
  if (
    !structuralEquals(next.project.entities, walls.records)
    || !structuralEquals(next.project.openings, openings.records)
  ) {
    throw new Error("Building structure patch claimed after is not canonical");
  }
  return {
    next,
    patch,
    normalizedWallChanges: walls.normalizedChanges,
    normalizedOpeningChanges: openings.normalizedChanges,
  };
}

export const patchBuildingStructureCommand: CommandDefinition<
  ProjectSnapshot,
  BuildingStructurePatch
> = {
  type: "building.structure.patch",
  prepare: (state, payload) => {
    const {
      next,
      patch,
      normalizedWallChanges,
      normalizedOpeningChanges,
    } = applyPatch(state, payload);
    return {
      next,
      inversePayload: {
        reason: patch.reason,
        wallChanges: reverseChanges(normalizedWallChanges),
        openingChanges: reverseChanges(normalizedOpeningChanges),
      },
    };
  },
  applyInverse: (state, payload) => applyPatch(state, payload).next,
};
