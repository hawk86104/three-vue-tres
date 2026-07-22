import type { SnapMode } from "@aethertwin/plan-engine";
import { describe, expect, it } from "vitest";
import type { PlanDraft } from "./editor-session";
import { createPlanEditorTestHarness } from "./plan-editor.test-support";

describe("plan editor session", () => {
  it("restores per-floor viewports and rejects floor switches during a gesture", () => {
    const { store, floorA, floorB } = createPlanEditorTestHarness();
    const defaultViewport = {
      width: 100,
      height: 100,
      center: { x: 0, y: 0 },
      pixelsPerMillimetre: 1,
    };
    const viewA = {
      width: 800,
      height: 600,
      center: { x: 0, y: 0 },
      pixelsPerMillimetre: 1,
    };
    const viewB = {
      width: 800,
      height: 600,
      center: { x: 5000, y: 2000 },
      pixelsPerMillimetre: 0.25,
    };

    expect(store.getState().viewport).toEqual(defaultViewport);
    store.getState().setViewport(viewA);
    expect(store.getState().setActiveFloor(floorB.id)).toBe(true);
    expect(store.getState().viewport).toEqual(defaultViewport);
    store.getState().setViewport(viewB);
    store.getState().beginGesture({
      kind: "create",
      tool: "boundary",
      points: [{ x: 0, y: 0 }],
      preview: [],
    });

    expect(store.getState().setActiveFloor(floorA.id)).toBe(false);
    expect(store.getState().activeFloorId).toBe(floorB.id);
    expect(store.getState().viewport).toEqual(viewB);

    store.getState().cancelDraft();
    expect(store.getState().setActiveFloor(floorA.id)).toBe(true);
    expect(store.getState().viewport).toEqual(viewA);
  });

  it("deep-owns session values and never stores a project snapshot", () => {
    const { store, fixture } = createPlanEditorTestHarness();
    const selectedIds = [fixture.id];
    const snapModes: SnapMode[] = ["grid", "endpoint"];
    const clipboard = [structuredClone(fixture)];
    const draftPoint = { x: 10, y: 20 };
    const draft: PlanDraft = {
      kind: "create",
      tool: "wall",
      points: [draftPoint],
      preview: clipboard,
    };
    const viewport = {
      width: 640,
      height: 480,
      center: { x: 30, y: 40 },
      pixelsPerMillimetre: 2,
    };

    store.getState().setSelection(selectedIds);
    store.getState().setSnapModes(snapModes);
    store.getState().setClipboard(clipboard);
    store.getState().beginGesture(draft);
    store.getState().setViewport(viewport);

    selectedIds.push("00000000-0000-4000-8000-000000000099");
    snapModes.length = 0;
    draftPoint.x = 999;
    viewport.center.x = 999;
    const mutableClipboard = clipboard[0] as unknown as {
      name: string;
      transform: { translation: { x: number } };
    };
    mutableClipboard.name = "Changed";
    mutableClipboard.transform.translation.x = 999;

    const state = store.getState();
    expect([...state.selectedIds]).toEqual([fixture.id]);
    expect([...state.snapModes]).toEqual(["grid", "endpoint"]);
    expect(state.clipboard[0]).toMatchObject({
      name: "Fixture",
      transform: { translation: { x: 0, y: 0 } },
    });
    expect(state.clipboard[0]).not.toBe(clipboard[0]);
    expect(state.draft).toMatchObject({ points: [{ x: 10, y: 20 }] });
    expect(state.viewport.center).toEqual({ x: 30, y: 40 });
    expect(Object.isFrozen(state.clipboard[0])).toBe(true);
    expect(Object.isFrozen(state.draft)).toBe(true);
    expect(Object.isFrozen(state.viewport)).toBe(true);
    expect(state).not.toHaveProperty("snapshot");
    expect(state).not.toHaveProperty("project");
  });
});
