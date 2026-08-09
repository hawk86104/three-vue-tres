import type { Wall } from "@aethertwin/core-model";
import { parseSnapshotV3, type ProjectSnapshot } from "@aethertwin/core-model";
import showroomFixture from "../../../fixtures/contracts/showroom-m2-4.v3.json";
import { describe, expect, it } from "vitest";
import { ProjectStore } from "./project-store";
import { SandboxProjectBackend } from "./sandbox-backend";

function adaptedFixture(initial: ProjectSnapshot): ProjectSnapshot {
  const serialized = JSON.stringify(showroomFixture)
    .replaceAll("17000000-0000-4000-8000-000000000001", initial.project.id)
    .replaceAll("17000000-0000-4000-8000-000000000002", initial.project.floors[0]!.id)
    .replaceAll("17000000-0000-4000-8000-000000000003", initial.project.floors[0]!.layers[0]!.id);
  const candidate = parseSnapshotV3(JSON.parse(serialized));
  return parseSnapshotV3({
    ...candidate,
    project: {
      ...candidate.project,
      id: initial.project.id,
      name: initial.project.name,
      tags: initial.project.tags,
      profile: "showroom",
      floors: initial.project.floors,
    },
  });
}

describe("Task 17 ProjectStore vertical acceptance", () => {
  it("commits the complete showroom through public commands and save-checkpoint-close-reopen", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    await store.create({
      name: "Task 17 M2.4 Showroom",
      location: "sandbox",
      profile: "showroom",
    });
    const projectPath = store.getState().projectPath!;
    const initial = store.getState().snapshot!;
    const complete = adaptedFixture(initial);
    const wall = complete.project.entities.find(
      (entity): entity is Wall => entity.type === "wall",
    )!;
    const hotspot = complete.project.entities.find(
      (entity) => entity.type === "poi" && entity.kind === "product-hotspot",
    )!;
    const planChanges = complete.project.entities.flatMap((entity, index) =>
      entity.type === "wall" || entity.id === hotspot.id
        ? []
        : [{ id: entity.id, before: null, after: entity, index }],
    );

    await store.applyBuildingStructurePatch({
      reason: "create",
      wallChanges: [{ id: wall.id, before: null, after: wall }],
      openingChanges: complete.project.openings.map((opening) => ({
        id: opening.id,
        before: null,
        after: opening,
      })),
    });
    await store.applyPlanEdit({
      reason: "create",
      changes: planChanges,
    });
    await store.applySnapshotRecordPatches([
      {
        collection: "entities",
        changes: [{ id: hotspot.id, before: null, after: hotspot }],
      },
      {
        collection: "productContents",
        changes: complete.project.productContents.map((record) => ({
          id: record.id, before: null, after: record,
        })),
      },
      {
        collection: "routeNetworks",
        changes: complete.project.routeNetworks.map((record) => ({
          id: record.id, before: null, after: record,
        })),
      },
      {
        collection: "guidedRoutes",
        changes: complete.project.guidedRoutes.map((record) => ({
          id: record.id, before: null, after: record,
        })),
      },
      {
        collection: "assets",
        changes: complete.assets.map((record) => ({
          id: record.id, before: null, after: record,
        })),
      },
      {
        collection: "materials",
        changes: complete.project.materials.map((record) => ({
          id: record.id, before: null, after: record,
        })),
      },
      {
        collection: "materialAssignments",
        changes: complete.project.materialAssignments.map((record) => ({
          id: record.id, before: null, after: record,
        })),
      },
    ]);
    await store.applySceneEnvironmentPatch({
      before: initial.project.sceneEnvironment,
      after: complete.project.sceneEnvironment,
    });

    expect(store.getState()).toMatchObject({ saveState: "dirty" });
    const current = store.getState().snapshot!;
    expect(current.schemaVersion).toBe(3);
    expect(current.sequence).toBeGreaterThan(0);
    expect(current.checkpointSequence).toBe(0);
    expect(current.project).toEqual(complete.project);
    expect(current.assets).toEqual(complete.assets);

    await store.save();
    const checkpoint = structuredClone(store.getState().snapshot!);
    expect(checkpoint.checkpointSequence).toBe(checkpoint.sequence);
    await store.close();
    await store.open(projectPath);
    expect(store.getState().snapshot).toEqual(checkpoint);
    expect(store.getState()).toMatchObject({
      saveState: "saved",
      canUndo: false,
      canRedo: false,
    });
    await store.dispose();
  });
});
