import {
  ModelValidationError,
  createInitialSnapshot,
  identityTransform2D,
  parseSnapshot,
  type DimensionAnnotation,
  type Fixture,
  type Floor,
  type ProductContent,
  type ProjectSnapshot,
} from "@aethertwin/core-model";
import { rectangularArray, type FloorChange, type PlanEditIntent } from "@aethertwin/plan-engine";
import { describe, expect, it } from "vitest";
import { patchFloorCommand, patchPlanEntitiesCommand } from "./plan-commands";
import { ProjectStore } from "./project-store";
import { SandboxProjectBackend } from "./sandbox-backend";

function fixtureFor(snapshot: ProjectSnapshot, id: string, name = "Fixture"): Fixture {
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

function withEntities(snapshot: ProjectSnapshot, entities: ProjectSnapshot["project"]["entities"]): ProjectSnapshot {
  return parseSnapshot({ ...snapshot, project: { ...snapshot.project, entities } });
}

describe("plan entity patch command", () => {
  it("applies create, delete, and replace changes in declared order with an exact reversible payload", () => {
    const initial = createInitialSnapshot({ name: "Demo", profile: "market" });
    const first = fixtureFor(initial, "00000000-0000-4000-8000-000000000010", "First");
    const second = fixtureFor(initial, "00000000-0000-4000-8000-000000000011", "Second");
    const created = patchPlanEntitiesCommand.prepare(initial, {
      reason: "duplicate",
      changes: [
        { id: first.id, before: null, after: first },
        { id: second.id, before: null, after: second },
      ],
    });

    expect(patchPlanEntitiesCommand.type).toBe("plan.entities.patch");
    expect(created.next.project.entities).toEqual([first, second]);
    expect(created.inversePayload).toEqual({
      reason: "duplicate",
      changes: [
        { id: second.id, before: second, after: null, index: 1 },
        { id: first.id, before: first, after: null, index: 0 },
      ],
    });
    expect(patchPlanEntitiesCommand.applyInverse(created.next, created.inversePayload).project.entities).toEqual([]);

    const replacement = { ...first, name: "Replaced" };
    const third = fixtureFor(initial, "00000000-0000-4000-8000-000000000012", "Third");
    const edited = patchPlanEntitiesCommand.prepare(created.next, {
      reason: "properties",
      changes: [
        { id: first.id, before: first, after: replacement },
        { id: second.id, before: second, after: null },
        { id: third.id, before: null, after: third },
      ],
    });
    expect(edited.next.project.entities).toEqual([replacement, third]);
  });

  it("applies a six-object array as one ProjectStore undo unit", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Demo", location: "sandbox", profile: "market" });
    const source = fixtureFor(
      store.getState().snapshot!,
      "00000000-0000-4000-8000-000000000010",
      "Source",
    );
    await store.applyPlanEdit({
      reason: "create",
      changes: [{ id: source.id, before: null, after: source }],
    });
    const beforeArray = store.getState().snapshot!;
    const originalEntitiesJson = JSON.stringify(beforeArray.project.entities);
    const beforeSequence = beforeArray.sequence;
    const generatedIds = [11, 12, 13, 14, 15].map(
      (value) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`,
    );
    const queue = [...generatedIds];
    const array = rectangularArray(
      [source],
      { rows: 2, columns: 3, rowGap: 200, columnGap: 300 },
      () => queue.shift()!,
    );
    if (!array.ok) throw new Error(array.issue.message);

    await store.applyPlanEdit(array.value);

    const afterArray = store.getState().snapshot!;
    expect(afterArray.sequence).toBe(beforeSequence + 1);
    expect(afterArray.project.entities).toHaveLength(6);
    const arrayEntitiesJson = JSON.stringify(afterArray.project.entities);

    await store.undo();
    expect(JSON.stringify(store.getState().snapshot!.project.entities)).toBe(
      originalEntitiesJson,
    );

    await store.redo();
    expect(JSON.stringify(store.getState().snapshot!.project.entities)).toBe(
      arrayEntitiesJson,
    );
  });

  it("captures a zero-based index and restores an exact middle deletion order", () => {
    const initial = createInitialSnapshot({ name: "Demo", profile: "market" });
    const first = fixtureFor(initial, "00000000-0000-4000-8000-000000000010", "First");
    const middle = fixtureFor(initial, "00000000-0000-4000-8000-000000000011", "Middle");
    const last = fixtureFor(initial, "00000000-0000-4000-8000-000000000012", "Last");
    const current = withEntities(initial, [first, middle, last]);

    const deleted = patchPlanEntitiesCommand.prepare(current, {
      reason: "delete",
      changes: [{ id: middle.id, before: middle, after: null }],
    });

    expect(deleted.next.project.entities).toEqual([first, last]);
    expect(deleted.inversePayload).toEqual({
      reason: "delete",
      changes: [{ id: middle.id, before: null, after: middle, index: 1 }],
    });
    expect(
      patchPlanEntitiesCommand.applyInverse(deleted.next, deleted.inversePayload).project.entities,
    ).toEqual([first, middle, last]);
  });

  it("accepts a valid insertion index and rejects invalid index metadata atomically", () => {
    const initial = createInitialSnapshot({ name: "Demo", profile: "market" });
    const first = fixtureFor(initial, "00000000-0000-4000-8000-000000000010", "First");
    const middle = fixtureFor(initial, "00000000-0000-4000-8000-000000000011", "Middle");
    const last = fixtureFor(initial, "00000000-0000-4000-8000-000000000012", "Last");
    const current = withEntities(initial, [first, last]);

    const inserted = patchPlanEntitiesCommand.prepare(current, {
      reason: "create",
      changes: [{ id: middle.id, before: null, after: middle, index: 1 }],
    });
    expect(inserted.next.project.entities).toEqual([first, middle, last]);

    for (const index of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1", 2]) {
      const intent = {
        reason: "delete",
        changes: [{ id: last.id, before: last, after: null, index }],
      } as unknown as PlanEditIntent;
      expect(() => patchPlanEntitiesCommand.prepare(current, intent), String(index)).toThrow();
      expect(current.project.entities).toEqual([first, last]);
    }
  });

  it("rejects malformed, duplicate, mismatched, and stale changes before mutating", () => {
    const initial = createInitialSnapshot({ name: "Demo", profile: "showroom" });
    const fixture = fixtureFor(initial, "00000000-0000-4000-8000-000000000010");
    const current = withEntities(initial, [fixture]);
    const changed = { ...fixture, name: "Changed" };
    const invalid: PlanEditIntent[] = [
      { reason: "properties", changes: [{ id: fixture.id, before: changed, after: fixture }] },
      { reason: "properties", changes: [
        { id: fixture.id, before: fixture, after: changed },
        { id: fixture.id, before: fixture, after: changed },
      ] },
      { reason: "properties", changes: [{
        id: "00000000-0000-4000-8000-000000000099", before: fixture, after: changed,
      }] },
      { reason: "delete", changes: [{ id: fixture.id, before: null, after: null }] },
      { reason: "create", changes: [{ id: fixture.id, before: null, after: fixture }] },
    ];

    for (const intent of invalid) {
      expect(() => patchPlanEntitiesCommand.prepare(current, intent),
        JSON.stringify(intent)).toThrow();
      expect(current.project.entities).toEqual([fixture]);
    }
  });

  it("surfaces INVALID_REFERENCE instead of cascading a dimension record", () => {
    const initial = createInitialSnapshot({ name: "Demo", profile: "market" });
    const fixture = fixtureFor(initial, "00000000-0000-4000-8000-000000000010");
    const floor = initial.project.floors[0]!;
    const dimension: DimensionAnnotation = {
      type: "dimension", id: "00000000-0000-4000-8000-000000000011", name: "Width", tags: [],
      floorId: floor.id, layerId: floor.layers[0]!.id, locked: false,
      transform: identityTransform2D,
      start: { kind: "point", point: { x: 0, y: 0 } },
      end: { kind: "entity", entityId: fixture.id, locator: "origin" },
      offset: 100,
    };
    const current = withEntities(initial, [fixture, dimension]);

    try {
      patchPlanEntitiesCommand.prepare(current, {
        reason: "delete", changes: [{ id: fixture.id, before: fixture, after: null }],
      });
      throw new Error("expected reference rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ModelValidationError);
      expect((error as ModelValidationError).code).toBe("INVALID_REFERENCE");
    }
    expect(current.project.entities).toEqual([fixture, dimension]);
  });

  it("surfaces INVALID_REFERENCE instead of cascading a real content record target", () => {
    const initial = createInitialSnapshot({ name: "Demo", profile: "market" });
    const fixture = fixtureFor(initial, "00000000-0000-4000-8000-000000000010");
    const content: ProductContent = {
      id: "00000000-0000-4000-8000-000000000011",
      name: "Fixture content",
      tags: [],
      targetEntityId: fixture.id,
      description: "Linked product content",
      mediaAssetIds: [],
    };
    const current = parseSnapshot({
      ...initial,
      project: {
        ...initial.project,
        entities: [fixture],
        productContents: [content],
      },
    });

    try {
      patchPlanEntitiesCommand.prepare(current, {
        reason: "delete", changes: [{ id: fixture.id, before: fixture, after: null }],
      });
      throw new Error("expected content target rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ModelValidationError);
      expect((error as ModelValidationError).code).toBe("INVALID_REFERENCE");
    }
    expect(current.project.entities).toEqual([fixture]);
    expect(current.project.productContents).toEqual([content]);
  });
});

describe("floor patch command", () => {
  it("replaces one exact floor in place and reverses the complete floor value", () => {
    const initial = createInitialSnapshot({ name: "Demo", profile: "showroom" });
    const first = initial.project.floors[0]!;
    const second: Floor = {
      id: "00000000-0000-4000-8000-000000000020", name: "Second", tags: [],
      layers: [{
        id: "00000000-0000-4000-8000-000000000021", name: "Layer", tags: [],
        visible: true, locked: false,
      }],
    };
    const current = parseSnapshot({
      ...initial, project: { ...initial.project, floors: [first, second] },
    });
    const after = { ...second, layers: second.layers.map((layer) => ({ ...layer, visible: false })) };
    const prepared = patchFloorCommand.prepare(current, { floorId: second.id, before: second, after });

    expect(patchFloorCommand.type).toBe("plan.floor.patch");
    expect(prepared.next.project.floors.map((floor) => floor.id)).toEqual([first.id, second.id]);
    expect(prepared.next.project.floors[1]).toEqual(after);
    expect(prepared.inversePayload).toEqual({ floorId: second.id, before: after, after: second });
    expect(patchFloorCommand.applyInverse(prepared.next, prepared.inversePayload).project.floors).toEqual([first, second]);
  });

  it("requires exact ownership and lets full snapshot validation reject broken layer references", () => {
    const initial = createInitialSnapshot({ name: "Demo", profile: "market" });
    const fixture = fixtureFor(initial, "00000000-0000-4000-8000-000000000010");
    const current = withEntities(initial, [fixture]);
    const before = current.project.floors[0]!;
    const stale = { ...before, name: "Stale" };
    const wrongId = { ...before, id: "00000000-0000-4000-8000-000000000099" };
    for (const change of [
      { floorId: before.id, before: stale, after: before },
      { floorId: before.id, before, after: wrongId },
    ] satisfies FloorChange[]) {
      expect(() => patchFloorCommand.prepare(current, change)).toThrow();
    }

    try {
      patchFloorCommand.prepare(current, {
        floorId: before.id, before, after: { ...before, layers: [] },
      });
      throw new Error("expected layer reference rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ModelValidationError);
      expect((error as ModelValidationError).code).toBe("INVALID_REFERENCE");
    }
    expect(current.project.floors[0]).toEqual(before);
  });
});
