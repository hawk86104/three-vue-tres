import type { CommandDefinition } from "@aethertwin/command-bus";
import {
  parseSnapshot,
  type AssetRecord,
  type GuidedRoute,
  type MaterialAssignment,
  type MaterialDefinition,
  type MediaAsset,
  type Opening,
  type PlanReference,
  type ProductContent,
  type ProjectSnapshot,
  type RouteNetwork,
} from "@aethertwin/core-model";

export const snapshotRecordCollections = [
  "assets",
  "planReferences",
  "openings",
  "productContents",
  "mediaAssets",
  "routeNetworks",
  "guidedRoutes",
  "materials",
  "materialAssignments",
] as const;

export type SnapshotRecordCollection = (typeof snapshotRecordCollections)[number];

export interface SnapshotRecordByCollection {
  readonly assets: AssetRecord;
  readonly planReferences: PlanReference;
  readonly openings: Opening;
  readonly productContents: ProductContent;
  readonly mediaAssets: MediaAsset;
  readonly routeNetworks: RouteNetwork;
  readonly guidedRoutes: GuidedRoute;
  readonly materials: MaterialDefinition;
  readonly materialAssignments: MaterialAssignment;
}

export interface SnapshotRecordChange<T> {
  readonly id: string;
  readonly before: T | null;
  readonly after: T | null;
  readonly index?: number;
}

export interface SnapshotRecordsPatch<K extends SnapshotRecordCollection> {
  readonly collection: K;
  readonly changes: readonly SnapshotRecordChange<SnapshotRecordByCollection[K]>[];
}

export type AnySnapshotRecordsPatch = {
  readonly [K in SnapshotRecordCollection]: SnapshotRecordsPatch<K>;
}[SnapshotRecordCollection];

type JsonRecord = Record<string, unknown>;

interface ParsedRecordChange {
  readonly id: string;
  readonly before: JsonRecord | null;
  readonly after: JsonRecord | null;
  readonly index?: number;
}

interface ParsedRecordsPatch {
  readonly collection: SnapshotRecordCollection;
  readonly changes: readonly ParsedRecordChange[];
}

const collectionSet = new Set<string>(snapshotRecordCollections);
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

function recordSide(value: unknown, id: string, path: string): JsonRecord | null {
  if (value === null) return null;
  const side = record(value, path);
  if (canonicalId(side.id, `${path}.id`) !== id) {
    throw new Error(`Invalid ${path}.id: must match change id`);
  }
  return side;
}

function parsePatch(value: unknown): ParsedRecordsPatch {
  const source = record(value, "snapshot records patch");
  exactKeys(source, ["collection", "changes"], "snapshot records patch");
  if (
    typeof source.collection !== "string"
    || !collectionSet.has(source.collection)
  ) {
    throw new Error("Invalid snapshot records patch collection");
  }
  if (!Array.isArray(source.changes)) {
    throw new Error("Invalid snapshot records patch changes");
  }
  const ids = new Set<string>();
  const changes = source.changes.map((value, index): ParsedRecordChange => {
    const path = `snapshot records patch.changes[${index}]`;
    const change = record(value, path);
    exactKeysWithOptional(change, ["id", "before", "after"], ["index"], path);
    const id = canonicalId(change.id, `${path}.id`);
    if (ids.has(id)) {
      throw new Error(`Invalid ${path}.id: duplicate change id`);
    }
    ids.add(id);
    const before = recordSide(change.before, id, `${path}.before`);
    const after = recordSide(change.after, id, `${path}.after`);
    if (before === null && after === null) {
      throw new Error(`Invalid ${path}: before and after cannot both be null`);
    }
    return {
      id,
      before,
      after,
      ...(Object.hasOwn(change, "index")
        ? { index: recordIndex(change.index, `${path}.index`) }
        : {}),
    };
  });
  return {
    collection: source.collection as SnapshotRecordCollection,
    changes,
  };
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

function recordsFor(
  snapshot: ProjectSnapshot,
  collection: SnapshotRecordCollection,
): readonly unknown[] {
  switch (collection) {
    case "assets":
      return snapshot.assets;
    case "planReferences":
      return snapshot.project.planReferences;
    case "openings":
      return snapshot.project.openings;
    case "productContents":
      return snapshot.project.productContents;
    case "mediaAssets":
      return snapshot.project.mediaAssets;
    case "routeNetworks":
      return snapshot.project.routeNetworks;
    case "guidedRoutes":
      return snapshot.project.guidedRoutes;
    case "materials":
      return snapshot.project.materials;
    case "materialAssignments":
      return snapshot.project.materialAssignments;
  }
}

function withRecords(
  snapshot: ProjectSnapshot,
  collection: SnapshotRecordCollection,
  records: readonly unknown[],
): unknown {
  if (collection === "assets") {
    return { ...snapshot, assets: records };
  }
  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      [collection]: records,
    },
  };
}

function applyPatch(
  state: ProjectSnapshot,
  value: unknown,
): {
  readonly next: ProjectSnapshot;
  readonly patch: ParsedRecordsPatch;
  readonly normalizedChanges: readonly ParsedRecordChange[];
} {
  const patch = parsePatch(value);
  const records = [...recordsFor(state, patch.collection)];
  const normalizedChanges: ParsedRecordChange[] = [];
  for (const [changeIndex, change] of patch.changes.entries()) {
    const currentIndex = records.findIndex((candidate) =>
      candidate !== null && typeof candidate === "object"
        && Reflect.get(candidate, "id") === change.id);
    const current = records[currentIndex];
    if (
      change.before === null
        ? currentIndex !== -1
        : currentIndex === -1 || !structuralEquals(current, change.before)
    ) {
      throw new Error(`Snapshot records patch before mismatch at changes[${changeIndex}]`);
    }

    if (change.before === null) {
      const insertionIndex = change.index ?? records.length;
      if (insertionIndex > records.length) {
        throw new Error(`Snapshot records patch index out of range at changes[${changeIndex}]`);
      }
      records.splice(insertionIndex, 0, change.after!);
      normalizedChanges.push({ ...change, index: insertionIndex });
      continue;
    }

    if (change.index !== undefined && change.index !== currentIndex) {
      throw new Error(`Snapshot records patch index mismatch at changes[${changeIndex}]`);
    }
    normalizedChanges.push({ ...change, index: currentIndex });
    if (change.after === null) {
      records.splice(currentIndex, 1);
    } else {
      records[currentIndex] = change.after;
    }
  }

  const next = parseSnapshot(withRecords(state, patch.collection, records));
  if (!structuralEquals(recordsFor(next, patch.collection), records)) {
    throw new Error("Snapshot records patch claimed after is not canonical");
  }
  return { next, patch, normalizedChanges };
}

export const patchSnapshotRecordsCommand: CommandDefinition<
  ProjectSnapshot,
  AnySnapshotRecordsPatch
> = {
  type: "snapshot.records.patch",
  prepare: (state, payload) => {
    const { next, patch, normalizedChanges } = applyPatch(state, payload);
    return {
      next,
      inversePayload: {
        collection: patch.collection,
        changes: [...normalizedChanges].reverse().map((change) => ({
          id: change.id,
          before: change.after,
          after: change.before,
          index: change.index,
        })),
      },
    };
  },
  applyInverse: (state, payload) => applyPatch(state, payload).next,
};
