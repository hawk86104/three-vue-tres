import type { CommandDefinition } from "@aethertwin/command-bus";
import {
  parseSnapshot,
  type Floor,
  type ProjectSnapshot,
  type SpatialEntity,
} from "@aethertwin/core-model";
import type {
  EntityChange,
  FloorChange,
  PlanEditIntent,
  PlanEditReason,
} from "@aethertwin/plan-engine";

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

type JsonRecord = Record<string, unknown>;

function record(value: unknown, path: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${path}: expected an object`);
  }
  return value as JsonRecord;
}

function exactKeys(value: JsonRecord, keys: readonly string[], path: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (!structuralEquals(actual, expected)) {
    throw new Error(`Invalid ${path}: unexpected or missing fields`);
  }
}

function exactKeysWithOptional(
  value: JsonRecord,
  required: readonly string[],
  optional: readonly string[],
  path: string,
): void {
  const actual = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  if (
    !required.every((key) => Object.hasOwn(value, key))
    || actual.some((key) => !allowed.has(key))
  ) {
    throw new Error(`Invalid ${path}: unexpected or missing fields`);
  }
}

function entityIndex(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid ${path}: expected a zero-based JSON-safe integer`);
  }
  return value;
}

function canonicalId(value: unknown, path: string): string {
  if (typeof value !== "string" || !canonicalIdPattern.test(value)) {
    throw new Error(`Invalid ${path}: expected a canonical UUID`);
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

function entitySide(value: unknown, id: string, path: string): SpatialEntity | null {
  if (value === null) return null;
  const source = record(value, path);
  if (canonicalId(source.id, `${path}.id`) !== id) {
    throw new Error(`Invalid ${path}.id: must match change id`);
  }
  return value as SpatialEntity;
}

function planIntent(value: unknown): PlanEditIntent {
  const source = record(value, "plan edit intent");
  exactKeys(source, ["reason", "changes"], "plan edit intent");
  if (typeof source.reason !== "string" || !planEditReasons.has(source.reason as PlanEditReason)) {
    throw new Error("Invalid plan edit intent reason");
  }
  if (!Array.isArray(source.changes)) {
    throw new Error("Invalid plan edit intent changes");
  }
  const ids = new Set<string>();
  const changes = source.changes.map((value, index): EntityChange => {
    const path = `plan edit intent.changes[${index}]`;
    const change = record(value, path);
    exactKeysWithOptional(change, ["id", "before", "after"], ["index"], path);
    const id = canonicalId(change.id, `${path}.id`);
    if (ids.has(id)) {
      throw new Error(`Invalid ${path}.id: duplicate change id`);
    }
    ids.add(id);
    const before = entitySide(change.before, id, `${path}.before`);
    const after = entitySide(change.after, id, `${path}.after`);
    if (before === null && after === null) {
      throw new Error(`Invalid ${path}: before and after cannot both be null`);
    }
    return {
      id,
      before,
      after,
      ...(Object.hasOwn(change, "index")
        ? { index: entityIndex(change.index, `${path}.index`) }
        : {}),
    };
  });
  return { reason: source.reason as PlanEditReason, changes };
}

function applyEntityIntent(
  state: ProjectSnapshot,
  value: unknown,
): { readonly next: ProjectSnapshot; readonly intent: PlanEditIntent } {
  const intent = planIntent(value);
  const entities = [...state.project.entities];
  const changes: EntityChange[] = [];
  for (const [index, change] of intent.changes.entries()) {
    const currentIndex = entities.findIndex((entity) => entity.id === change.id);
    const current = entities[currentIndex];
    if (
      change.before === null
        ? currentIndex !== -1
        : currentIndex === -1 || !structuralEquals(current, change.before)
    ) {
      throw new Error(`Plan entity patch before mismatch at changes[${index}]`);
    }

    if (change.before === null) {
      const insertIndex = change.index ?? entities.length;
      if (insertIndex > entities.length) {
        throw new Error(`Plan entity patch index out of range at changes[${index}]`);
      }
      entities.splice(insertIndex, 0, change.after!);
      changes.push({ ...change, index: insertIndex });
    } else {
      if (change.index !== undefined && change.index !== currentIndex) {
        throw new Error(`Plan entity patch index mismatch at changes[${index}]`);
      }
      changes.push({ ...change, index: currentIndex });
      if (change.after === null) {
        entities.splice(currentIndex, 1);
      } else {
        entities[currentIndex] = change.after;
      }
    }
  }
  const next = parseSnapshot({
    ...state,
    project: { ...state.project, entities },
  });
  if (!structuralEquals(next.project.entities, entities)) {
    throw new Error("Plan entity patch is not canonical");
  }
  return { next, intent: { reason: intent.reason, changes } };
}

function floorChange(value: unknown): FloorChange {
  const source = record(value, "floor patch");
  exactKeys(source, ["floorId", "before", "after"], "floor patch");
  const floorId = canonicalId(source.floorId, "floor patch.floorId");
  const before = record(source.before, "floor patch.before") as unknown as Floor;
  const after = record(source.after, "floor patch.after") as unknown as Floor;
  if (
    canonicalId(before.id, "floor patch.before.id") !== floorId
    || canonicalId(after.id, "floor patch.after.id") !== floorId
  ) {
    throw new Error("Invalid floor patch: floor ids must match floorId");
  }
  return { floorId, before, after };
}

function applyFloorChange(
  state: ProjectSnapshot,
  value: unknown,
): { readonly next: ProjectSnapshot; readonly change: FloorChange } {
  const change = floorChange(value);
  const indexes = state.project.floors
    .map((floor, index) => floor.id === change.floorId ? index : -1)
    .filter((index) => index >= 0);
  if (
    indexes.length !== 1
    || !structuralEquals(state.project.floors[indexes[0]!], change.before)
  ) {
    throw new Error("Floor patch before mismatch");
  }
  const floors = [...state.project.floors];
  floors[indexes[0]!] = change.after;
  const next = parseSnapshot({
    ...state,
    project: { ...state.project, floors },
  });
  if (!structuralEquals(next.project.floors[indexes[0]!], change.after)) {
    throw new Error("Floor patch is not canonical");
  }
  return { next, change };
}

export const patchPlanEntitiesCommand: CommandDefinition<ProjectSnapshot, PlanEditIntent> = {
  type: "plan.entities.patch",
  prepare: (state, payload) => {
    const { next, intent } = applyEntityIntent(state, payload);
    return {
      next,
      inversePayload: {
        reason: intent.reason,
        changes: [...intent.changes].reverse().map((change) => ({
          id: change.id,
          before: change.after,
          after: change.before,
          index: change.index,
        })),
      },
    };
  },
  applyInverse: (state, payload) => applyEntityIntent(state, payload).next,
};

export const patchFloorCommand: CommandDefinition<ProjectSnapshot, FloorChange> = {
  type: "plan.floor.patch",
  prepare: (state, payload) => {
    const { next, change } = applyFloorChange(state, payload);
    return {
      next,
      inversePayload: {
        floorId: change.floorId,
        before: change.after,
        after: change.before,
      },
    };
  },
  applyInverse: (state, payload) => applyFloorChange(state, payload).next,
};
