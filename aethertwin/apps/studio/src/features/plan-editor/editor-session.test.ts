import type { SnapMode } from "@aethertwin/plan-engine";
import type { PlanReference } from "@aethertwin/core-model";
import { describe, expect, it } from "vitest";
import {
  createPlanEditorStore,
  type OpeningPreviewState,
  type PlanDraft,
} from "./editor-session";
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

  it("owns a transient plan-reference transform draft without storing a snapshot", () => {
    const { store, floorA } = createPlanEditorTestHarness();
    const preview: PlanReference = {
      id: "00000000-0000-4000-8000-000000000030",
      name: "Floor plan",
      tags: ["reference"],
      floorId: floorA.id,
      layerId: floorA.layers[0]!.id,
      assetId: "00000000-0000-4000-8000-000000000031",
      intrinsicSize: { width: 100, height: 100 },
      transform: {
        translation: { x: 20, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
      },
      opacity: 0.65,
      locked: false,
      calibration: null,
    };
    const draft: PlanDraft = {
      kind: "reference-transform",
      origin: { x: 25, y: 25 },
      preview,
    };

    store.getState().beginGesture(draft);
    const mutablePreview = preview as {
      name: string;
      transform: { translation: { x: number } };
    };
    mutablePreview.name = "Mutated outside";
    mutablePreview.transform.translation.x = 999;

    expect(store.getState().draft).toMatchObject({
      kind: "reference-transform",
      origin: { x: 25, y: 25 },
      preview: {
        name: "Floor plan",
        transform: { translation: { x: 20, y: 0 } },
      },
    });
    expect(Object.isFrozen(store.getState().draft)).toBe(true);
    expect(store.getState()).not.toHaveProperty("snapshot");
    expect(store.getState()).not.toHaveProperty("project");
  });
  it("owns opening previews and clears them at tool, floor, and session boundaries", () => {
    const { floorA, floorB } = createPlanEditorTestHarness();
    const store = createPlanEditorStore({
      activeFloorId: floorA.id,
      sessionId: "session-a",
    });
    const preview: OpeningPreviewState = {
      sessionId: "session-a",
      tool: "door",
      candidate: {
        wallId: "00000000-0000-4000-8000-000000000020",
        distanceAlongWall: 2_000,
        worldCenter: { x: 0, y: 0 },
        tangent: { x: 1, y: 0 },
        effectiveThickness: 100,
        valid: true,
      },
      width: 900,
      height: 2_100,
      sillHeight: 0,
    };

    store.getState().setActiveTool("door");
    expect(store.getState().setOpeningPreview(preview)).toBe(true);
    (preview.candidate.worldCenter as { x: number }).x = 999;

    expect(store.getState().openingPreview).toMatchObject({
      sessionId: "session-a",
      candidate: { worldCenter: { x: 0, y: 0 } },
    });
    expect(Object.isFrozen(store.getState().openingPreview)).toBe(true);
    expect(store.getState().setOpeningPreview({
      ...preview,
      sessionId: "stale-session",
    })).toBe(false);
    expect(store.getState().openingPreview?.sessionId).toBe("session-a");

    expect(store.getState().setActiveFloor(floorB.id)).toBe(true);
    expect(store.getState().activeTool).toBe("door");
    expect(store.getState().openingPreview).toBeNull();

    expect(store.getState().setOpeningPreview({
      ...preview,
      sessionId: "session-a",
      tool: "door",
    })).toBe(true);
    store.getState().setActiveTool("window");
    expect(store.getState().openingPreview).toBeNull();

    store.getState().setSelection(["00000000-0000-4000-8000-000000000099"]);
    store.getState().replaceSession("session-b", floorA.id);
    expect(store.getState()).toMatchObject({
      sessionId: "session-b",
      activeFloorId: floorA.id,
      activeTool: "select",
      openingPreview: null,
      gestureActive: false,
    });
    expect([...store.getState().selectedIds]).toEqual([]);
  });
});
