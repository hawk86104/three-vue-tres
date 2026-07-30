import {
  createInitialSnapshot,
  identityTransform2D,
  parseSnapshot,
  type Opening,
  type ProjectSnapshot,
  type Wall,
} from "@aethertwin/core-model";
import { describe, expect, it, vi } from "vitest";
import { patchPlanEntitiesCommand } from "./plan-commands";
import { ProjectStore } from "./project-store";
import { SandboxProjectBackend } from "./sandbox-backend";
import { patchSnapshotRecordsCommand } from "./snapshot-records-command";
import {
  patchBuildingStructureCommand,
  type BuildingStructurePatch,
} from "./building-structure-command";

const WALL_A = "00000000-0000-4000-8000-000000000010";
const WALL_B = "00000000-0000-4000-8000-000000000011";
const OPENING_A = "00000000-0000-4000-8000-000000000020";
const OPENING_B = "00000000-0000-4000-8000-000000000021";

function wallFor(
  snapshot: ProjectSnapshot,
  id: string,
  name = "Wall",
): Wall {
  const floor = snapshot.project.floors[0]!;
  return {
    type: "wall",
    id,
    name,
    tags: [],
    floorId: floor.id,
    layerId: floor.layers[0]!.id,
    transform: identityTransform2D,
    spatial3D: { elevation: 0, height: 2800 },
    locked: false,
    centerLine: [{ x: 0, y: 0 }, { x: 4000, y: 0 }],
    thickness: 120,
  };
}

function openingFor(
  wall: Wall,
  id: string,
  name = "Door",
): Opening {
  return {
    id,
    name,
    tags: [],
    wallId: wall.id,
    kind: "door",
    distanceAlongWall: 2000,
    width: 900,
    height: 2100,
    sillHeight: 0,
  };
}

function withBuilding(
  snapshot: ProjectSnapshot,
  walls: readonly Wall[],
  openings: readonly Opening[],
): ProjectSnapshot {
  return parseSnapshot({
    ...snapshot,
    project: {
      ...snapshot.project,
      entities: walls,
      openings,
    },
  });
}

function initialBuilding(): {
  readonly snapshot: ProjectSnapshot;
  readonly wall: Wall;
  readonly opening: Opening;
} {
  const empty = createInitialSnapshot({ name: "Demo", profile: "showroom" });
  const wall = wallFor(empty, WALL_A);
  const opening = openingFor(wall, OPENING_A);
  return {
    snapshot: withBuilding(empty, [wall], [opening]),
    wall,
    opening,
  };
}

describe("building.structure.patch", () => {
  it("deletes a wall and its attached opening as one final-state transition and reverses exactly", () => {
    const { snapshot, wall, opening } = initialBuilding();
    expect(() => patchPlanEntitiesCommand.prepare(snapshot, {
      reason: "delete",
      changes: [{ id: wall.id, before: wall, after: null }],
    })).toThrow();

    const prepared = patchBuildingStructureCommand.prepare(snapshot, {
      reason: "delete",
      wallChanges: [{ id: wall.id, before: wall, after: null }],
      openingChanges: [{ id: opening.id, before: opening, after: null }],
    });

    expect(patchBuildingStructureCommand.type).toBe("building.structure.patch");
    expect(prepared.next.project.entities).toEqual([]);
    expect(prepared.next.project.openings).toEqual([]);
    expect(prepared.inversePayload).toEqual({
      reason: "delete",
      wallChanges: [{
        id: wall.id,
        before: null,
        after: wall,
        index: 0,
      }],
      openingChanges: [{
        id: opening.id,
        before: null,
        after: opening,
        index: 0,
      }],
    });

    const restored = patchBuildingStructureCommand.applyInverse(
      prepared.next,
      prepared.inversePayload,
    );
    expect(restored.project.entities).toEqual(snapshot.project.entities);
    expect(restored.project.openings).toEqual(snapshot.project.openings);
  });

  it("applies ordered add and update changes with normalized insertion indices", () => {
    const { snapshot, wall, opening } = initialBuilding();
    const nextWall = { ...wall, name: "Existing wall" };
    const nextOpening = { ...opening, name: "Existing door" };
    const insertedWall = {
      ...wallFor(snapshot, WALL_B, "Inserted wall"),
      centerLine: [{ x: 0, y: 3000 }, { x: 4000, y: 3000 }],
    };
    const insertedOpening = openingFor(insertedWall, OPENING_B, "Inserted door");

    const prepared = patchBuildingStructureCommand.prepare(snapshot, {
      reason: "properties",
      wallChanges: [
        { id: wall.id, before: wall, after: nextWall },
        { id: insertedWall.id, before: null, after: insertedWall, index: 0 },
      ],
      openingChanges: [
        { id: opening.id, before: opening, after: nextOpening },
        {
          id: insertedOpening.id,
          before: null,
          after: insertedOpening,
          index: 0,
        },
      ],
    });

    expect(prepared.next.project.entities).toEqual([insertedWall, nextWall]);
    expect(prepared.next.project.openings).toEqual([
      insertedOpening,
      nextOpening,
    ]);
    expect(prepared.inversePayload).toEqual({
      reason: "properties",
      wallChanges: [
        {
          id: insertedWall.id,
          before: insertedWall,
          after: null,
          index: 0,
        },
        {
          id: wall.id,
          before: nextWall,
          after: wall,
          index: 0,
        },
      ],
      openingChanges: [
        {
          id: insertedOpening.id,
          before: insertedOpening,
          after: null,
          index: 0,
        },
        {
          id: opening.id,
          before: nextOpening,
          after: opening,
          index: 0,
        },
      ],
    });
    expect(patchBuildingStructureCommand.applyInverse(
      prepared.next,
      prepared.inversePayload,
    )).toEqual(snapshot);
  });

  it("replaces a supporting wall and rebinds its opening when neither subset is valid alone", () => {
    const { snapshot, wall, opening } = initialBuilding();
    const replacementWall = wallFor(snapshot, WALL_B, "Replacement wall");
    const reboundOpening = { ...opening, wallId: replacementWall.id };
    const wallChanges = [
      { id: wall.id, before: wall, after: null },
      { id: replacementWall.id, before: null, after: replacementWall },
    ] as const;
    const openingChanges = [{
      id: opening.id,
      before: opening,
      after: reboundOpening,
    }] as const;

    expect(() => patchPlanEntitiesCommand.prepare(snapshot, {
      reason: "properties",
      changes: wallChanges,
    })).toThrow();
    expect(() => patchSnapshotRecordsCommand.prepare(snapshot, {
      collection: "openings",
      changes: openingChanges,
    })).toThrow();

    const prepared = patchBuildingStructureCommand.prepare(snapshot, {
      reason: "properties",
      wallChanges,
      openingChanges,
    });
    expect(prepared.next.project.entities).toEqual([replacementWall]);
    expect(prepared.next.project.openings).toEqual([reboundOpening]);
    expect(patchBuildingStructureCommand.applyInverse(
      prepared.next,
      prepared.inversePayload,
    )).toEqual(snapshot);
  });
  it("rejects malformed payloads, empty patches, duplicate ids, and wrong record types", () => {
    const { snapshot, wall, opening } = initialBuilding();
    const valid: BuildingStructurePatch = {
      reason: "properties",
      wallChanges: [{ id: wall.id, before: wall, after: { ...wall, name: "New" } }],
      openingChanges: [],
    };
    const fixture = {
      ...wall,
      type: "fixture",
      kind: "generic",
      size: { width: 1000, height: 500 },
    };

    const invalidPayloads: readonly unknown[] = [
      { ...valid, extra: true },
      { ...valid, reason: "repair" },
      { reason: "properties", wallChanges: [], openingChanges: [] },
      {
        ...valid,
        wallChanges: [
          valid.wallChanges[0],
          valid.wallChanges[0],
        ],
      },
      {
        ...valid,
        wallChanges: [{
          id: wall.id,
          before: wall,
          after: fixture,
        }],
      },
      {
        ...valid,
        wallChanges: [{
          id: wall.id,
          before: wall,
          after: null,
          extra: true,
        }],
      },
      {
        ...valid,
        openingChanges: [{
          id: opening.id,
          before: opening,
          after: wall,
        }],
      },
      {
        ...valid,
        openingChanges: [
          { id: opening.id, before: opening, after: null },
          { id: opening.id, before: opening, after: null },
        ],
      },
      {
        ...valid,
        openingChanges: [{
          id: opening.id,
          before: null,
          after: null,
        }],
      },
      {
        ...valid,
        wallChanges: [{
          id: "not-a-uuid",
          before: null,
          after: { ...wall, id: "not-a-uuid" },
        }],
      },
    ];

    for (const payload of invalidPayloads) {
      expect(() => patchBuildingStructureCommand.prepare(
        snapshot,
        payload as BuildingStructurePatch,
      )).toThrow();
    }
  });

  it("rejects stale before values and invalid index metadata atomically", () => {
    const { snapshot, wall, opening } = initialBuilding();
    const insertedWall = wallFor(snapshot, WALL_B);
    const insertedOpening = openingFor(insertedWall, OPENING_B);
    const invalidPayloads: readonly BuildingStructurePatch[] = [
      {
        reason: "properties",
        wallChanges: [{
          id: wall.id,
          before: { ...wall, name: "Stale" },
          after: { ...wall, name: "New" },
        }],
        openingChanges: [],
      },
      {
        reason: "properties",
        wallChanges: [{ id: wall.id, before: wall, after: wall, index: 1 }],
        openingChanges: [],
      },
      {
        reason: "create",
        wallChanges: [{
          id: insertedWall.id,
          before: null,
          after: insertedWall,
          index: 2,
        }],
        openingChanges: [{
          id: insertedOpening.id,
          before: null,
          after: insertedOpening,
        }],
      },
      {
        reason: "properties",
        wallChanges: [],
        openingChanges: [{
          id: opening.id,
          before: { ...opening, name: "Stale" },
          after: { ...opening, name: "New" },
        }],
      },
    ];

    for (const payload of invalidPayloads) {
      expect(() => patchBuildingStructureCommand.prepare(snapshot, payload))
        .toThrow();
      expect(snapshot.project.entities).toEqual([wall]);
      expect(snapshot.project.openings).toEqual([opening]);
    }
  });

  it("commits, undoes, and redoes one compound ProjectStore journal operation", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Demo", location: "sandbox", profile: "showroom" });
    const empty = store.getState().snapshot!;
    const wall = wallFor(empty, WALL_A);
    const opening = openingFor(wall, OPENING_A);
    const commit = vi.spyOn(backend, "commit");

    await store.applyBuildingStructurePatch({
      reason: "create",
      wallChanges: [{ id: wall.id, before: null, after: wall }],
      openingChanges: [{ id: opening.id, before: null, after: opening }],
    });

    expect(commit).toHaveBeenCalledOnce();
    expect(commit.mock.calls[0]![1].journal).toHaveLength(1);
    expect(commit.mock.calls[0]![1].journal[0]!.commandType)
      .toBe("building.structure.patch");
    expect(store.getState().snapshot!.project.entities).toEqual([wall]);
    expect(store.getState().snapshot!.project.openings).toEqual([opening]);

    await store.undo();
    expect(store.getState().snapshot!.project.entities).toEqual([]);
    expect(store.getState().snapshot!.project.openings).toEqual([]);
    await store.redo();
    expect(store.getState().snapshot!.project.entities).toEqual([wall]);
    expect(store.getState().snapshot!.project.openings).toEqual([opening]);
  });

  it("keeps snapshot, sequence, and history unchanged when the backend commit fails", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Demo", location: "sandbox", profile: "showroom" });
    const before = store.getState().snapshot!;
    const wall = wallFor(before, WALL_A);
    const opening = openingFor(wall, OPENING_A);
    backend.failNextCommit = new Error("disk full");

    await expect(store.applyBuildingStructurePatch({
      reason: "create",
      wallChanges: [{ id: wall.id, before: null, after: wall }],
      openingChanges: [{ id: opening.id, before: null, after: opening }],
    })).rejects.toThrow("disk full");

    expect(store.getState().snapshot).toEqual(before);
    expect(store.getState().snapshot!.sequence).toBe(before.sequence);
    expect(store.getState().canUndo).toBe(false);
    expect(store.getState().canRedo).toBe(false);
  });

  it("serializes queued patches and owns caller input before execution starts", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({ name: "Demo", location: "sandbox", profile: "showroom" });
    const empty = store.getState().snapshot!;
    const wall = wallFor(empty, WALL_A);
    const opening = openingFor(wall, OPENING_A);
    const commitProject = backend.commit.bind(backend);
    let releaseCommit!: () => void;
    let commitStarted!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const started = new Promise<void>((resolve) => {
      commitStarted = resolve;
    });
    vi.spyOn(backend, "commit").mockImplementationOnce(async (path, batch) => {
      commitStarted();
      await gate;
      return commitProject(path, batch);
    });

    const pendingRename = store.renameProject("Queued first");
    await started;
    const patch: BuildingStructurePatch = {
      reason: "create",
      wallChanges: [{ id: wall.id, before: null, after: wall }],
      openingChanges: [{ id: opening.id, before: null, after: opening }],
    };
    const pendingPatch = store.applyBuildingStructurePatch(patch);
    (patch.wallChanges[0]!.after as { name: string }).name = "Caller wall";
    (patch.openingChanges[0]!.after as { name: string }).name = "Caller opening";

    expect(store.getState().snapshot!.project.entities).toEqual([]);
    releaseCommit();
    await Promise.all([pendingRename, pendingPatch]);
    expect(store.getState().snapshot!.project.name).toBe("Queued first");
    expect(store.getState().snapshot!.project.entities[0]!.name).toBe("Wall");
    expect(store.getState().snapshot!.project.openings[0]!.name).toBe("Door");
  });
});
