import type { SnapMode } from "@aethertwin/plan-engine";
import type { PlanReference } from "@aethertwin/core-model";
import { describe, expect, it } from "vitest";
import {
  createPlanEditorStore,
  type OpeningPreviewState,
  type PlanDraft,
  type RouteAuthoringScope,
  type RoomRecognitionState,
} from "./editor-session";
import { createPlanEditorTestHarness } from "./plan-editor.test-support";

function currentRouteAuthoringScope(
  store: ReturnType<typeof createPlanEditorStore>,
): RouteAuthoringScope {
  const state = store.getState();
  return {
    sessionId: state.sessionId,
    floorId: state.activeFloorId,
    networkId: state.routeAuthoring.networkId,
    tool: state.activeTool,
  };
}

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
  it("owns room recognition results and keeps candidate selection outside project selection", () => {
    const { floorA, fixture } = createPlanEditorTestHarness();
    const store = createPlanEditorStore({
      activeFloorId: floorA.id,
      sessionId: "session-a",
    });
    const recognition: RoomRecognitionState = {
      toleranceMm: 5,
      fingerprint: "fingerprint-a",
      candidates: [{
        key: "candidate-a",
        footprint: [
          { x: 0, y: 0 },
          { x: 1_000, y: 0 },
          { x: 1_000, y: 1_000 },
          { x: 0, y: 1_000 },
        ],
        wallIds: ["wall-a", "wall-b", "wall-c", "wall-d"],
        area: 1_000_000,
        perimeter: 4_000,
      }],
      selectedCandidateKey: "candidate-a",
      diagnostics: [{
        code: "DANGLING_EDGE",
        wallIds: ["wall-z"],
      }],
      stale: false,
    };

    store.getState().setSelection([fixture.id]);
    expect(
      store.getState().setRoomRecognition("session-a", floorA.id, recognition),
    ).toBe(true);
    (recognition.candidates[0]!.footprint[0] as { x: number }).x = 999;

    expect(store.getState().roomRecognition).toMatchObject({
      fingerprint: "fingerprint-a",
      selectedCandidateKey: "candidate-a",
    });
    expect(store.getState().roomRecognition?.candidates[0]?.footprint[0]).toEqual({
      x: 0,
      y: 0,
    });
    expect(store.getState().roomRecognition?.candidates[0]?.footprint).toHaveLength(4);
    expect(Object.isFrozen(store.getState().roomRecognition)).toBe(true);
    expect(Object.isFrozen(store.getState().roomRecognition?.candidates[0])).toBe(true);
    expect([...store.getState().selectedIds]).toEqual([fixture.id]);

    expect(store.getState().selectRoomCandidate("missing")).toBe(false);
    expect(store.getState().selectRoomCandidate("candidate-a")).toBe(true);
    expect([...store.getState().selectedIds]).toEqual([fixture.id]);
  });

  it("validates tolerance, marks recognition stale, and retains candidates with persistence errors", () => {
    const { floorA } = createPlanEditorTestHarness();
    const store = createPlanEditorStore({
      activeFloorId: floorA.id,
      sessionId: "session-a",
    });
    const recognition: RoomRecognitionState = {
      toleranceMm: 5,
      fingerprint: "fingerprint-a",
      candidates: [{
        key: "candidate-a",
        footprint: [
          { x: 0, y: 0 },
          { x: 1_000, y: 0 },
          { x: 1_000, y: 1_000 },
          { x: 0, y: 1_000 },
        ],
        wallIds: ["wall-a"],
        area: 1_000_000,
        perimeter: 4_000,
      }],
      selectedCandidateKey: "candidate-a",
      diagnostics: [],
      stale: false,
    };
    store.getState().setRoomRecognition("session-a", floorA.id, recognition);

    expect(store.getState().setRoomRecognitionTolerance(0.09)).toBe(false);
    expect(store.getState().setRoomRecognitionTolerance(100.01)).toBe(false);
    expect(store.getState().setRoomRecognitionTolerance(10)).toBe(true);
    expect(store.getState().roomRecognition).toMatchObject({
      toleranceMm: 10,
      stale: true,
      candidates: [{ key: "candidate-a" }],
    });

    store.getState().setRoomRecognitionPersistenceError("checkpoint unavailable");
    expect(store.getState().roomRecognition).toMatchObject({
      persistenceError: "checkpoint unavailable",
      candidates: [{ key: "candidate-a" }],
    });
    store.getState().clearRoomRecognitionPersistenceError();
    expect(store.getState().roomRecognition).not.toHaveProperty("persistenceError");
  });

  it("clears room recognition at floor and session boundaries and rejects late completions", () => {
    const { floorA, floorB } = createPlanEditorTestHarness();
    const store = createPlanEditorStore({
      activeFloorId: floorA.id,
      sessionId: "session-a",
    });
    const recognition: RoomRecognitionState = {
      toleranceMm: 5,
      fingerprint: "fingerprint-a",
      candidates: [],
      diagnostics: [],
      stale: false,
    };

    expect(
      store.getState().setRoomRecognition("session-a", floorA.id, recognition),
    ).toBe(true);
    expect(store.getState().setActiveFloor(floorB.id)).toBe(true);
    expect(store.getState().roomRecognition).toBeNull();
    expect(
      store.getState().setRoomRecognition("session-a", floorA.id, recognition),
    ).toBe(false);

    store.getState().replaceSession("session-b", floorA.id);
    expect(
      store.getState().setRoomRecognition("session-a", floorA.id, recognition),
    ).toBe(false);
    expect(store.getState().roomRecognition).toBeNull();

    expect(
      store.getState().setRoomRecognition("session-b", floorA.id, recognition),
    ).toBe(true);
    store.getState().clearRoomRecognition();
    expect(store.getState().roomRecognition).toBeNull();
  });
  it("owns one showroom fixture choice and clears it at tool, floor, and session boundaries", () => {
    const { floorA, floorB } = createPlanEditorTestHarness();
    const store = createPlanEditorStore({
      activeFloorId: floorA.id,
      sessionId: "session-a",
    });

    store.getState().setActiveTool("fixture");
    store.getState().setSelectedFixtureKind("display-case");
    expect(store.getState()).toMatchObject({
      activeTool: "fixture",
      selectedFixtureKind: "display-case",
    });

    store.getState().setFixturePlacementPreview({
      type: "fixture",
      id: "00000000-0000-4000-8000-000000000099",
      name: "展示柜",
      tags: [],
      floorId: floorA.id,
      layerId: floorA.layers[0]!.id,
      locked: false,
      transform: {
        translation: { x: -600, y: -300 },
        rotation: 0,
        scale: { x: 1, y: 1 },
      },
      kind: "display-case",
      size: { width: 1_200, height: 600 },
      spatial3D: { elevation: 0, height: 1_200 },
    }, { x: 0, y: 0 });
    expect(store.getState().draft).toMatchObject({
      kind: "create",
      tool: "fixture",
      points: [{ x: 0, y: 0 }],
    });
    expect(store.getState().gestureActive).toBe(false);

    expect(store.getState().setActiveFloor(floorB.id)).toBe(true);
    expect(store.getState()).toMatchObject({
      selectedFixtureKind: null,
      draft: null,
    });

    store.getState().setSelectedFixtureKind("screen");
    store.getState().setActiveTool("wall");
    expect(store.getState().selectedFixtureKind).toBeNull();

    store.getState().setActiveTool("fixture");
    store.getState().setSelectedFixtureKind("signage");
    store.getState().replaceSession("session-b", floorA.id);
    expect(store.getState()).toMatchObject({
      sessionId: "session-b",
      activeTool: "select",
      selectedFixtureKind: null,
      draft: null,
    });
  });

  it("owns route authoring state and resets only the incompatible transient parts", () => {
    const { floorA, floorB } = createPlanEditorTestHarness();
    const store = createPlanEditorStore({
      activeFloorId: floorA.id,
      sessionId: "route-session-a",
    });
    const networkId = "00000000-0000-4000-8000-000000000501";
    const secondNetworkId = "00000000-0000-4000-8000-000000000502";
    const mutableStart = { x: 120, y: 240 };
    const mutableStops = [
      "00000000-0000-4000-8000-000000000503",
      "00000000-0000-4000-8000-000000000504",
    ];

    expect(store.getState().routeAuthoring).toEqual({
      networkId: null,
      segmentStart: null,
      stopDraft: [],
    });
    store.getState().setActiveRouteNetwork(currentRouteAuthoringScope(store), networkId);
    store.getState().setActiveTool("route-edge");
    store.getState().setRouteSegmentStart(currentRouteAuthoringScope(store), mutableStart);
    store.getState().setRouteStopDraft(currentRouteAuthoringScope(store), mutableStops);
    store.getState().setRouteAuthoringPersistenceError(currentRouteAuthoringScope(store), "retry route save");
    mutableStart.x = 999;
    mutableStops.push("00000000-0000-4000-8000-000000000505");

    expect(store.getState()).toMatchObject({
      activeTool: "route-edge",
      routeAuthoring: {
        networkId,
        segmentStart: { x: 120, y: 240 },
        stopDraft: [
          "00000000-0000-4000-8000-000000000503",
          "00000000-0000-4000-8000-000000000504",
        ],
        persistenceError: "retry route save",
      },
    });
    expect(Object.isFrozen(store.getState().routeAuthoring)).toBe(true);
    expect(Object.isFrozen(store.getState().routeAuthoring.segmentStart)).toBe(true);
    expect(Object.isFrozen(store.getState().routeAuthoring.stopDraft)).toBe(true);

    store.getState().setActiveTool("route-node");
    expect(store.getState().routeAuthoring).toEqual({
      networkId,
      segmentStart: null,
      stopDraft: [
        "00000000-0000-4000-8000-000000000503",
        "00000000-0000-4000-8000-000000000504",
      ],
    });

    store.getState().setActiveTool("product-hotspot");
    expect(store.getState().routeAuthoring).toEqual({
      networkId,
      segmentStart: null,
      stopDraft: [],
    });

    store.getState().setActiveTool("route-edge");
    store.getState().setRouteSegmentStart(currentRouteAuthoringScope(store), { x: 1, y: 2 });
    store.getState().setRouteStopDraft(currentRouteAuthoringScope(store), mutableStops.slice(0, 2));
    store.getState().setRouteAuthoringPersistenceError(currentRouteAuthoringScope(store), "cancel me");
    store.getState().cancelDraft();
    expect(store.getState().routeAuthoring).toEqual({
      networkId,
      segmentStart: null,
      stopDraft: [],
    });

    store.getState().setRouteSegmentStart(currentRouteAuthoringScope(store), { x: 3, y: 4 });
    store.getState().setRouteStopDraft(currentRouteAuthoringScope(store), mutableStops.slice(0, 2));
    expect(store.getState().setActiveFloor(floorB.id)).toBe(true);
    expect(store.getState().routeAuthoring).toEqual({
      networkId: null,
      segmentStart: null,
      stopDraft: [],
    });

    store.getState().setActiveRouteNetwork(currentRouteAuthoringScope(store), secondNetworkId);
    store.getState().setActiveTool("route-edge");
    store.getState().setRouteSegmentStart(currentRouteAuthoringScope(store), { x: 5, y: 6 });
    store.getState().setRouteStopDraft(currentRouteAuthoringScope(store), mutableStops.slice(0, 2));
    store.getState().replaceSession("route-session-b", floorA.id);
    expect(store.getState()).toMatchObject({
      sessionId: "route-session-b",
      activeFloorId: floorA.id,
      activeTool: "select",
      routeAuthoring: {
        networkId: null,
        segmentStart: null,
        stopDraft: [],
      },
    });
  });

  it("rejects late route authoring writes after floor and session boundaries", () => {
    const { floorA, floorB } = createPlanEditorTestHarness();
    const store = createPlanEditorStore({
      activeFloorId: floorA.id,
      sessionId: "route-session-a",
    });
    const networkId = "00000000-0000-4000-8000-000000000601";

    store.getState().setActiveTool("route-edge");
    expect(
      store.getState().setActiveRouteNetwork(currentRouteAuthoringScope(store), networkId),
    ).toBe(true);
    expect(
      store.getState().setRouteSegmentStart(currentRouteAuthoringScope(store), { x: 10, y: 20 }),
    ).toBe(true);
    expect(
      store.getState().setRouteStopDraft(currentRouteAuthoringScope(store), ["stop-a", "stop-b"]),
    ).toBe(true);
    expect(
      store.getState().setRouteAuthoringPersistenceError(
        currentRouteAuthoringScope(store),
        "old floor error",
      ),
    ).toBe(true);

    const staleFloorScope = currentRouteAuthoringScope(store);
    expect(store.getState().setActiveFloor(floorB.id)).toBe(true);
    expect(
      store.getState().setActiveRouteNetwork(staleFloorScope, networkId),
    ).toBe(false);
    expect(
      store.getState().setRouteSegmentStart(staleFloorScope, { x: 30, y: 40 }),
    ).toBe(false);
    expect(
      store.getState().setRouteStopDraft(staleFloorScope, ["stale-stop"]),
    ).toBe(false);
    expect(
      store.getState().setRouteAuthoringPersistenceError(
        staleFloorScope,
        "stale floor error",
      ),
    ).toBe(false);
    expect(store.getState().routeAuthoring).toEqual({
      networkId: null,
      segmentStart: null,
      stopDraft: [],
    });

    const secondNetworkId = "00000000-0000-4000-8000-000000000602";
    expect(
      store.getState().setActiveRouteNetwork(currentRouteAuthoringScope(store), networkId),
    ).toBe(true);
    const staleNetworkScope = currentRouteAuthoringScope(store);
    expect(
      store.getState().setActiveRouteNetwork(
        currentRouteAuthoringScope(store),
        secondNetworkId,
      ),
    ).toBe(true);
    expect(
      store.getState().setRouteAuthoringPersistenceError(
        staleNetworkScope,
        "stale network error",
      ),
    ).toBe(false);

    const staleToolScope = currentRouteAuthoringScope(store);
    store.getState().setActiveTool("route-node");
    expect(
      store.getState().setRouteStopDraft(
        currentRouteAuthoringScope(store),
        ["current-stop"],
      ),
    ).toBe(true);
    expect(
      store.getState().setRouteAuthoringPersistenceError(
        staleToolScope,
        "stale tool error",
      ),
    ).toBe(false);
    expect(store.getState().clearRouteAuthoringDrafts(staleToolScope)).toBe(false);
    expect(store.getState().routeAuthoring).toEqual({
      networkId: secondNetworkId,
      segmentStart: null,
      stopDraft: ["current-stop"],
    });

    const staleSessionScope = currentRouteAuthoringScope(store);
    store.getState().replaceSession("route-session-b", floorA.id);
    expect(
      store.getState().setActiveRouteNetwork(staleSessionScope, networkId),
    ).toBe(false);
    expect(
      store.getState().setRouteAuthoringPersistenceError(
        staleSessionScope,
        "stale session error",
      ),
    ).toBe(false);
    expect(store.getState().routeAuthoring).toEqual({
      networkId: null,
      segmentStart: null,
      stopDraft: [],
    });
  });
});
