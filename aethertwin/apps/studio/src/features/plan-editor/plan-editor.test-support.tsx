import {
  createInitialSnapshot,
  parseSnapshotV2,
  type Fixture,
  type Floor,
} from "@aethertwin/core-model";
import type { PlanEditIntent } from "@aethertwin/plan-engine";
import type { PlanPointerEvent } from "@aethertwin/render-plan-2d";
import { vi } from "vitest";
import { createPlanEditorStore } from "./editor-session";
import { createInteractionController } from "./interaction-controller";

export function createPlanEditorTestHarness() {
  const initialIds = [1, 2, 3].map(
    (value) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`,
  );
  const initial = createInitialSnapshot({
    name: "Editor",
    profile: "market",
    uuid: () => initialIds.shift()!,
  });
  const floorA = initial.project.floors[0]!;
  const floorB: Floor = {
    id: "00000000-0000-4000-8000-000000000004",
    name: "Floor B",
    tags: [],
    layers: [{
      id: "00000000-0000-4000-8000-000000000005",
      name: "Default",
      tags: [],
      visible: true,
      locked: false,
    }],
  };
  const fixture: Fixture = {
    type: "fixture",
    id: "00000000-0000-4000-8000-000000000010",
    name: "Fixture",
    tags: [],
    floorId: floorA.id,
    layerId: floorA.layers[0]!.id,
    locked: false,
    transform: {
      translation: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    kind: "generic",
    size: { width: 100, height: 100 },
  };
  const snapshot = parseSnapshotV2({
    ...initial,
    project: { ...initial.project, floors: [floorA, floorB], entities: [fixture] },
  });
  const store = createPlanEditorStore({ activeFloorId: floorA.id });
  const applyPlanEdit = vi.fn(async (_intent: PlanEditIntent) => undefined);
  const errors: unknown[] = [];
  let nextId = 20;
  const controller = createInteractionController({
    getSnapshot: () => snapshot,
    store,
    makeId: () => `00000000-0000-4000-8000-${(nextId++).toString().padStart(12, "0")}`,
    applyPlanEdit,
    onError: (error) => errors.push(error),
  });
  return { snapshot, floorA, floorB, fixture, store, controller, applyPlanEdit, errors };
}

export const pointerAt = (
  type: PlanPointerEvent["type"], x: number, y: number, buttons = type === "pointerup" ? 0 : 1,
): PlanPointerEvent => ({
  type, pointerId: 1, screen: { x, y }, buttons,
  shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
});
