import type {
  Opening,
  OpeningGeometryIssue,
  PlanReference,
  Point2,
  SpatialEntity,
} from "@aethertwin/core-model";
import type {
  CalibrationPreview,
  OpeningPlacementCandidate,
  RoomCandidate,
  RoomRecognitionDiagnostic,
  SnapMode,
  ViewportTransform,
} from "@aethertwin/plan-engine";
import type { ShowroomFixtureKind } from "@aethertwin/mode-showroom";
import type {
  SceneCameraState,
  SceneFrameTarget,
  SceneRendererStatus,
} from "@aethertwin/render-scene-3d";
import { createStore, type StoreApi } from "zustand/vanilla";

export type PlanTool =
  | "select"
  | "boundary"
  | "wall"
  | "door"
  | "window"
  | "zone"
  | "space-unit"
  | "fixture"
  | "poi"
  | "dimension"
  | "product-hotspot"
  | "route-node"
  | "route-edge"
  | "pan";

export type OpeningCreationTool = "door" | "window";

export interface OpeningPreviewState {
  readonly sessionId: string;
  readonly tool: OpeningCreationTool;
  readonly candidate: OpeningPlacementCandidate;
  readonly width: number;
  readonly height: number;
  readonly sillHeight: number;
  readonly persistenceError?: string;
}

export interface RoomRecognitionState {
  readonly toleranceMm: number;
  readonly fingerprint: string;
  readonly candidates: readonly RoomCandidate[];
  readonly selectedCandidateKey?: string;
  readonly diagnostics: readonly RoomRecognitionDiagnostic[];
  readonly stale: boolean;
  readonly persistenceError?: string;
}

export interface RouteAuthoringState {
  readonly networkId: string | null;
  readonly segmentStart: Point2 | null;
  readonly stopDraft: readonly string[];
  readonly persistenceError?: string;
}
export interface RouteAuthoringScope {
  readonly sessionId: string;
  readonly floorId: string;
  readonly networkId: string | null;
  readonly tool: PlanTool;
}

export type SceneViewMode = "2d" | "3d" | "split";

export interface SceneRendererScope {
  readonly sessionId: string;
  readonly floorId: string;
  readonly generation: number;
}

export interface SceneFrameRequest {
  readonly id: number;
  readonly target: SceneFrameTarget;
  readonly sessionId: string;
  readonly floorId: string;
  readonly generation: number;
}

export type PlanSidePanel = "tree" | "assets";

export interface CalibrationDraft {
  readonly referenceId: string;
  readonly sourcePointA: Point2 | null;
  readonly sourcePointB: Point2 | null;
  readonly distanceText: string;
  readonly preview: CalibrationPreview | null;
}

export type PlanDraft =
  | {
      readonly kind: "create";
      readonly tool: Exclude<PlanTool, "select" | "pan">;
      readonly points: readonly Point2[];
      readonly preview: readonly SpatialEntity[];
    }
  | {
      readonly kind: "transform";
      readonly origin: Point2;
      readonly preview: readonly SpatialEntity[];
    }
  | {
      readonly kind: "reference-transform";
      readonly origin: Point2;
      readonly preview: PlanReference;
    }
  | {
      readonly kind: "opening-transform";
      readonly origin: Point2;
      readonly preview: Opening;
      readonly issue?: OpeningGeometryIssue;
    }
  | { readonly kind: "box-select"; readonly start: Point2; readonly current: Point2 };

export interface PlanEditorState {
  readonly sessionId: string;
  readonly activeFloorId: string;
  readonly activeTool: PlanTool;
  readonly sidePanel: PlanSidePanel;
  readonly selectedIds: ReadonlySet<string>;
  readonly viewport: ViewportTransform;
  readonly snapModes: ReadonlySet<SnapMode>;
  readonly draft: PlanDraft | null;
  readonly calibrationDraft: CalibrationDraft | null;
  readonly openingPreview: OpeningPreviewState | null;
  readonly roomRecognition: RoomRecognitionState | null;
  readonly routeAuthoring: RouteAuthoringState;
  readonly selectedFixtureKind: ShowroomFixtureKind | null;
  readonly gestureActive: boolean;
  readonly clipboard: readonly SpatialEntity[];
  readonly viewMode: SceneViewMode;
  readonly sceneCamera: SceneCameraState | null;
  readonly rendererStatus: SceneRendererStatus;
  readonly rendererError: string | null;
  readonly rendererGeneration: number;
  readonly sceneFrameRequest: SceneFrameRequest | null;
  setActiveFloor(id: string): boolean;
  replaceSession(sessionId: string, activeFloorId: string): void;
  setViewMode(mode: SceneViewMode): boolean;
  beginSceneRenderer(): SceneRendererScope;
  retireSceneRenderer(scope: SceneRendererScope): boolean;
  setSceneCamera(scope: SceneRendererScope, camera: SceneCameraState): boolean;
  setSceneRendererStatus(
    scope: SceneRendererScope,
    status: SceneRendererStatus,
    error: Error | null,
  ): boolean;
  requestSceneFrame(target: SceneFrameTarget): boolean;
  consumeSceneFrameRequest(
    scope: SceneRendererScope,
    requestId: number,
  ): SceneFrameTarget | null;
  setActiveTool(tool: PlanTool): void;
  setSidePanel(panel: PlanSidePanel): void;
  setSelection(ids: readonly string[]): void;
  setViewport(viewport: ViewportTransform): void;
  setSnapModes(modes: readonly SnapMode[]): void;
  setClipboard(entities: readonly SpatialEntity[]): void;
  beginGesture(draft: PlanDraft): void;
  updateDraft(draft: PlanDraft): void;
  finishGesture(): void;
  cancelDraft(): void;
  beginCalibration(referenceId: string): void;
  updateCalibration(draft: CalibrationDraft): void;
  cancelCalibration(): void;
  setOpeningPreview(preview: OpeningPreviewState): boolean;
  clearOpeningPreview(): void;
  setRoomRecognition(
    sessionId: string,
    floorId: string,
    recognition: RoomRecognitionState,
  ): boolean;
  setRoomRecognitionTolerance(toleranceMm: number): boolean;
  selectRoomCandidate(key: string): boolean;
  markRoomRecognitionStale(message?: string): void;
  setRoomRecognitionPersistenceError(message: string): void;
  clearRoomRecognitionPersistenceError(): void;
  clearRoomRecognition(): void;
  setActiveRouteNetwork(scope: RouteAuthoringScope, networkId: string | null): boolean;
  setRouteSegmentStart(scope: RouteAuthoringScope, point: Point2 | null): boolean;
  setRouteStopDraft(scope: RouteAuthoringScope, nodeIds: readonly string[]): boolean;
  setRouteAuthoringPersistenceError(scope: RouteAuthoringScope, message: string): boolean;
  clearRouteAuthoringPersistenceError(scope: RouteAuthoringScope): boolean;
  clearRouteAuthoringDrafts(scope: RouteAuthoringScope): boolean;
  setSelectedFixtureKind(kind: ShowroomFixtureKind): void;
  setFixturePlacementPreview(entity: SpatialEntity, point: Point2): boolean;
  clearFixturePlacementPreview(): void;
  clearSelectedFixtureKind(): void;
}

const DEFAULT_VIEWPORT: ViewportTransform = {
  width: 100,
  height: 100,
  center: { x: 0, y: 0 },
  pixelsPerMillimetre: 1,
};

const DEFAULT_SNAP_MODES: readonly SnapMode[] = [
  "endpoint",
  "midpoint",
  "edge",
  "alignment",
  "grid",
  "angle",
];

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function ownValue<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function ownReadonlySet<T>(values: Iterable<T>): ReadonlySet<T> {
  const source = new Set(values);
  const result: ReadonlySet<T> = {
    get size() {
      return source.size;
    },
    has: (value) => source.has(value),
    entries: () => source.entries(),
    keys: () => source.keys(),
    values: () => source.values(),
    forEach: (callback, thisArg) => {
      source.forEach((value) => callback.call(thisArg, value, value, result));
    },
    [Symbol.iterator]: () => source[Symbol.iterator](),
  };
  return Object.freeze(result);
}

function sameValues<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function ownedViewport(viewport: ViewportTransform): ViewportTransform {
  return ownValue(viewport);
}

function ownedDraft(draft: PlanDraft): PlanDraft {
  return ownValue(draft);
}

function ownedCalibrationDraft(draft: CalibrationDraft): CalibrationDraft {
  return ownValue(draft);
}

function ownedOpeningPreview(preview: OpeningPreviewState): OpeningPreviewState {
  return ownValue(preview);
}

function ownedRoomRecognition(recognition: RoomRecognitionState): RoomRecognitionState {
  return ownValue(recognition);
}

function ownedRouteAuthoring(routeAuthoring: RouteAuthoringState): RouteAuthoringState {
  return ownValue(routeAuthoring);
}

function ownedSceneCamera(camera: SceneCameraState): SceneCameraState {
  return ownValue(camera);
}

function validSceneCamera(camera: SceneCameraState): boolean {
  return [
    camera.position.x,
    camera.position.y,
    camera.position.z,
    camera.target.x,
    camera.target.y,
    camera.target.z,
    camera.fieldOfView,
  ].every(Number.isFinite)
    && camera.fieldOfView > 0
    && camera.fieldOfView < 180;
}

function isCurrentSceneRendererScope(
  state: PlanEditorState,
  scope: SceneRendererScope,
): boolean {
  return state.sessionId === scope.sessionId
    && state.activeFloorId === scope.floorId
    && state.rendererGeneration === scope.generation;
}

function safeRendererError(error: Error | null): string | null {
  if (error === null) return null;
  const message = error.message.trim();
  return message.length === 0
    ? "3D renderer unavailable."
    : message.slice(0, 512);
}

function emptyRouteAuthoring(networkId: string | null = null): RouteAuthoringState {
  return ownedRouteAuthoring({
    networkId,
    segmentStart: null,
    stopDraft: [],
  });
}

function isCurrentRouteAuthoringScope(
  state: PlanEditorState,
  scope: RouteAuthoringScope,
): boolean {
  return state.sessionId === scope.sessionId
    && state.activeFloorId === scope.floorId
    && state.routeAuthoring.networkId === scope.networkId
    && state.activeTool === scope.tool;
}

let nextSessionNumber = 1;

function transientSessionId(): string {
  const sessionId = `plan-editor-session-${nextSessionNumber}`;
  nextSessionNumber += 1;
  return sessionId;
}

export function createPlanEditorStore(
  options: {
    readonly activeFloorId: string;
    readonly sessionId?: string;
  },
): StoreApi<PlanEditorState> {
  const floorViewports = new Map<string, ViewportTransform>();
  const floorCameras = new Map<string, SceneCameraState>();
  let nextSceneFrameRequestId = 1;
  const initialSessionId = options.sessionId ?? transientSessionId();
  const initialViewport = ownedViewport(DEFAULT_VIEWPORT);
  floorViewports.set(options.activeFloorId, initialViewport);

  return createStore<PlanEditorState>((set, get) => ({
    sessionId: initialSessionId,
    activeFloorId: options.activeFloorId,
    activeTool: "select",
    sidePanel: "tree",
    selectedIds: ownReadonlySet([]),
    viewport: initialViewport,
    snapModes: ownReadonlySet(DEFAULT_SNAP_MODES),
    draft: null,
    calibrationDraft: null,
    openingPreview: null,
    roomRecognition: null,
    routeAuthoring: emptyRouteAuthoring(),
    selectedFixtureKind: null,
    gestureActive: false,
    clipboard: deepFreeze([] as SpatialEntity[]),
    viewMode: "2d",
    sceneCamera: null,
    rendererStatus: "idle",
    rendererError: null,
    rendererGeneration: 0,
    sceneFrameRequest: null,

    setActiveFloor(id) {
      const state = get();
      if (state.gestureActive) return false;

      const sameFloor = id === state.activeFloorId;
      floorViewports.set(state.activeFloorId, ownedViewport(state.viewport));
      if (state.sceneCamera !== null) {
        floorCameras.set(state.activeFloorId, state.sceneCamera);
      }
      const restored = ownedViewport(floorViewports.get(id) ?? DEFAULT_VIEWPORT);
      floorViewports.set(id, restored);
      set({
        activeFloorId: id,
        viewport: restored,
        sceneCamera: sameFloor ? state.sceneCamera : floorCameras.get(id) ?? null,
        rendererStatus: sameFloor ? state.rendererStatus : "idle",
        rendererError: sameFloor ? state.rendererError : null,
        rendererGeneration: sameFloor
          ? state.rendererGeneration
          : state.rendererGeneration + 1,
        sceneFrameRequest: sameFloor ? state.sceneFrameRequest : null,
        calibrationDraft: sameFloor ? state.calibrationDraft : null,
        openingPreview: sameFloor ? state.openingPreview : null,
        roomRecognition: sameFloor ? state.roomRecognition : null,
        routeAuthoring: sameFloor
          ? state.routeAuthoring
          : emptyRouteAuthoring(),
        selectedFixtureKind: sameFloor
          ? state.selectedFixtureKind
          : null,
        draft: sameFloor ? state.draft : null,
      });
      return true;
    },

    replaceSession(sessionId, activeFloorId) {
      const state = get();
      floorViewports.clear();
      floorCameras.clear();
      nextSceneFrameRequestId = 1;
      const viewport = ownedViewport(DEFAULT_VIEWPORT);
      floorViewports.set(activeFloorId, viewport);
      set({
        sessionId,
        activeFloorId,
        activeTool: "select",
        sidePanel: "tree",
        selectedIds: ownReadonlySet([]),
        viewport,
        snapModes: ownReadonlySet(DEFAULT_SNAP_MODES),
        draft: null,
        calibrationDraft: null,
        openingPreview: null,
        roomRecognition: null,
        routeAuthoring: emptyRouteAuthoring(),
        selectedFixtureKind: null,
        gestureActive: false,
        clipboard: deepFreeze([] as SpatialEntity[]),
        viewMode: "2d",
        sceneCamera: null,
        rendererStatus: "idle",
        rendererError: null,
        rendererGeneration: state.rendererGeneration + 1,
        sceneFrameRequest: null,
      });
    },

    setViewMode(mode) {
      const state = get();
      if (
        mode !== "2d"
        && (state.rendererStatus === "failed" || state.rendererStatus === "disabled")
      ) return false;
      if (mode !== state.viewMode) set({ viewMode: mode });
      return true;
    },

    beginSceneRenderer() {
      const state = get();
      const generation = state.rendererGeneration + 1;
      const scope = ownValue<SceneRendererScope>({
        sessionId: state.sessionId,
        floorId: state.activeFloorId,
        generation,
      });
      set({
        rendererGeneration: generation,
        rendererStatus: "initializing",
        rendererError: null,
        sceneFrameRequest: null,
      });
      return scope;
    },

    retireSceneRenderer(scope) {
      const state = get();
      if (!isCurrentSceneRendererScope(state, scope)) return false;
      set({
        rendererGeneration: state.rendererGeneration + 1,
        rendererStatus: "destroyed",
        rendererError: null,
        sceneFrameRequest: null,
      });
      return true;
    },

    setSceneCamera(scope, camera) {
      const state = get();
      if (!isCurrentSceneRendererScope(state, scope) || !validSceneCamera(camera)) {
        return false;
      }
      const owned = ownedSceneCamera(camera);
      floorCameras.set(state.activeFloorId, owned);
      set({ sceneCamera: owned });
      return true;
    },

    setSceneRendererStatus(scope, status, error) {
      const state = get();
      if (!isCurrentSceneRendererScope(state, scope)) return false;
      set({
        rendererStatus: status,
        rendererError: safeRendererError(error),
        viewMode: status === "failed" || status === "disabled"
          ? "2d"
          : state.viewMode,
      });
      return true;
    },

    requestSceneFrame(target) {
      const state = get();
      const request = ownValue<SceneFrameRequest>({
        id: nextSceneFrameRequestId,
        target,
        sessionId: state.sessionId,
        floorId: state.activeFloorId,
        generation: state.rendererGeneration,
      });
      nextSceneFrameRequestId += 1;
      set({ sceneFrameRequest: request });
      return true;
    },

    consumeSceneFrameRequest(scope, requestId) {
      const state = get();
      const request = state.sceneFrameRequest;
      if (
        request === null
        || !isCurrentSceneRendererScope(state, scope)
        || request.id !== requestId
        || request.sessionId !== scope.sessionId
        || request.floorId !== scope.floorId
        || request.generation !== scope.generation
      ) return null;
      set({ sceneFrameRequest: null });
      return request.target;
    },

    setActiveTool(tool) {
      const state = get();
      const routeAuthoring = tool === state.activeTool
        ? state.routeAuthoring
        : ownedRouteAuthoring({
          networkId: state.routeAuthoring.networkId,
          segmentStart: tool === "route-edge"
            ? state.routeAuthoring.segmentStart
            : null,
          stopDraft: tool === "route-edge" || tool === "route-node"
            ? state.routeAuthoring.stopDraft
            : [],
        });
      set({
        activeTool: tool,
        draft: null,
        gestureActive: false,
        calibrationDraft: tool === state.activeTool
          ? state.calibrationDraft
          : null,
        openingPreview: tool === state.activeTool
          ? state.openingPreview
          : null,
        selectedFixtureKind: tool === "fixture"
          ? state.selectedFixtureKind
          : null,
        routeAuthoring,
      });
    },

    setSidePanel(panel) {
      set({ sidePanel: panel });
    },

    setSelection(ids) {
      const state = get();
      const selectedIds = ownReadonlySet(ids);
      set({
        selectedIds,
        calibrationDraft: sameValues(state.selectedIds, selectedIds)
          ? state.calibrationDraft
          : null,
      });
    },

    setViewport(viewport) {
      set({ viewport: ownedViewport(viewport) });
    },

    setSnapModes(modes) {
      set({ snapModes: ownReadonlySet(modes) });
    },

    setClipboard(entities) {
      set({ clipboard: ownValue(entities) });
    },

    beginGesture(draft) {
      set({
        draft: ownedDraft(draft),
        calibrationDraft: null,
        gestureActive: true,
      });
    },

    updateDraft(draft) {
      set({ draft: ownedDraft(draft), gestureActive: true });
    },

    finishGesture() {
      set({ draft: null, gestureActive: false });
    },

    cancelDraft() {
      const state = get();
      set({
        draft: null,
        gestureActive: false,
        routeAuthoring: emptyRouteAuthoring(state.routeAuthoring.networkId),
      });
    },

    beginCalibration(referenceId) {
      set({
        draft: null,
        gestureActive: false,
        calibrationDraft: ownedCalibrationDraft({
          referenceId,
          sourcePointA: null,
          sourcePointB: null,
          distanceText: "",
          preview: null,
        }),
      });
    },

    updateCalibration(draft) {
      if (get().calibrationDraft === null) return;
      set({ calibrationDraft: ownedCalibrationDraft(draft) });
    },

    cancelCalibration() {
      if (get().calibrationDraft !== null) set({ calibrationDraft: null });
    },

    setOpeningPreview(preview) {
      const state = get();
      if (
        preview.sessionId !== state.sessionId
        || preview.tool !== state.activeTool
      ) return false;
      set({ openingPreview: ownedOpeningPreview(preview) });
      return true;
    },

    clearOpeningPreview() {
      if (get().openingPreview !== null) set({ openingPreview: null });
    },

    setRoomRecognition(sessionId, floorId, recognition) {
      const state = get();
      if (sessionId !== state.sessionId || floorId !== state.activeFloorId) {
        return false;
      }
      set({ roomRecognition: ownedRoomRecognition(recognition) });
      return true;
    },

    setRoomRecognitionTolerance(toleranceMm) {
      if (!Number.isFinite(toleranceMm) || toleranceMm < 0.1 || toleranceMm > 100) {
        return false;
      }
      const recognition = get().roomRecognition;
      if (recognition === null) return false;
      if (recognition.toleranceMm === toleranceMm) return true;
      set({
        roomRecognition: ownedRoomRecognition({
          ...recognition,
          toleranceMm,
          stale: true,
        }),
      });
      return true;
    },

    selectRoomCandidate(key) {
      const recognition = get().roomRecognition;
      if (recognition === null || !recognition.candidates.some((candidate) => candidate.key === key)) {
        return false;
      }
      set({
        roomRecognition: ownedRoomRecognition({
          ...recognition,
          selectedCandidateKey: key,
        }),
      });
      return true;
    },

    markRoomRecognitionStale(message) {
      const recognition = get().roomRecognition;
      if (recognition === null) return;
      set({
        roomRecognition: ownedRoomRecognition({
          ...recognition,
          stale: true,
          ...(message === undefined ? {} : { persistenceError: message }),
        }),
      });
    },

    setRoomRecognitionPersistenceError(message) {
      const recognition = get().roomRecognition;
      if (recognition === null) return;
      set({
        roomRecognition: ownedRoomRecognition({
          ...recognition,
          persistenceError: message,
        }),
      });
    },

    clearRoomRecognitionPersistenceError() {
      const recognition = get().roomRecognition;
      if (recognition === null || recognition.persistenceError === undefined) return;
      const next = { ...recognition };
      delete next.persistenceError;
      set({ roomRecognition: ownedRoomRecognition(next) });
    },

    clearRoomRecognition() {
      if (get().roomRecognition !== null) set({ roomRecognition: null });
    },

    setActiveRouteNetwork(scope, networkId) {
      const state = get();
      if (!isCurrentRouteAuthoringScope(state, scope)) return false;
      if (state.routeAuthoring.networkId === networkId) return true;
      set({ routeAuthoring: emptyRouteAuthoring(networkId) });
      return true;
    },

    setRouteSegmentStart(scope, point) {
      const state = get();
      if (
        !isCurrentRouteAuthoringScope(state, scope)
        || state.activeTool !== "route-edge"
      ) return false;
      set({
        routeAuthoring: ownedRouteAuthoring({
          ...state.routeAuthoring,
          segmentStart: point,
        }),
      });
      return true;
    },

    setRouteStopDraft(scope, nodeIds) {
      const state = get();
      if (
        !isCurrentRouteAuthoringScope(state, scope)
        || (state.activeTool !== "route-edge" && state.activeTool !== "route-node")
      ) return false;
      set({
        routeAuthoring: ownedRouteAuthoring({
          ...state.routeAuthoring,
          stopDraft: nodeIds,
        }),
      });
      return true;
    },

    setRouteAuthoringPersistenceError(scope, message) {
      const state = get();
      if (!isCurrentRouteAuthoringScope(state, scope)) return false;
      set({
        routeAuthoring: ownedRouteAuthoring({
          ...state.routeAuthoring,
          persistenceError: message,
        }),
      });
      return true;
    },

    clearRouteAuthoringPersistenceError(scope) {
      const state = get();
      if (!isCurrentRouteAuthoringScope(state, scope)) return false;
      if (state.routeAuthoring.persistenceError === undefined) return true;
      const next = { ...state.routeAuthoring };
      delete next.persistenceError;
      set({ routeAuthoring: ownedRouteAuthoring(next) });
      return true;
    },

    clearRouteAuthoringDrafts(scope) {
      const state = get();
      if (!isCurrentRouteAuthoringScope(state, scope)) return false;
      set({
        routeAuthoring: emptyRouteAuthoring(state.routeAuthoring.networkId),
      });
      return true;
    },

    setSelectedFixtureKind(kind) {
      if (get().activeTool !== "fixture") return;
      set({
        selectedFixtureKind: kind,
        draft: null,
        gestureActive: false,
      });
    },

    setFixturePlacementPreview(entity, point) {
      const state = get();
      if (state.activeTool !== "fixture" || state.selectedFixtureKind === null) {
        return false;
      }
      set({
        draft: ownedDraft({
          kind: "create",
          tool: "fixture",
          points: [point],
          preview: [entity],
        }),
        gestureActive: false,
      });
      return true;
    },

    clearFixturePlacementPreview() {
      const state = get();
      if (
        state.gestureActive
        || state.draft?.kind !== "create"
        || state.draft.tool !== "fixture"
      ) return;
      set({ draft: null });
    },

    clearSelectedFixtureKind() {
      const state = get();
      if (state.selectedFixtureKind === null) return;
      set({
        selectedFixtureKind: null,
        draft: state.gestureActive ? state.draft : null,
      });
    },
  }));
}
