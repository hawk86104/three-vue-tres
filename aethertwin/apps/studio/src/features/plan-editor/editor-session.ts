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
  readonly gestureActive: boolean;
  readonly clipboard: readonly SpatialEntity[];
  setActiveFloor(id: string): boolean;
  replaceSession(sessionId: string, activeFloorId: string): void;
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
    gestureActive: false,
    clipboard: deepFreeze([] as SpatialEntity[]),

    setActiveFloor(id) {
      const state = get();
      if (state.gestureActive) return false;

      floorViewports.set(state.activeFloorId, ownedViewport(state.viewport));
      const restored = ownedViewport(floorViewports.get(id) ?? DEFAULT_VIEWPORT);
      floorViewports.set(id, restored);
      set({
        activeFloorId: id,
        viewport: restored,
        calibrationDraft: id === state.activeFloorId
          ? state.calibrationDraft
          : null,
        openingPreview: id === state.activeFloorId
          ? state.openingPreview
          : null,
        roomRecognition: id === state.activeFloorId
          ? state.roomRecognition
          : null,
      });
      return true;
    },

    replaceSession(sessionId, activeFloorId) {
      floorViewports.clear();
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
        gestureActive: false,
        clipboard: deepFreeze([] as SpatialEntity[]),
      });
    },

    setActiveTool(tool) {
      const state = get();
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
      set({ draft: null, gestureActive: false });
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
      const { persistenceError: _ignored, ...next } = recognition;
      set({ roomRecognition: ownedRoomRecognition(next) });
    },

    clearRoomRecognition() {
      if (get().roomRecognition !== null) set({ roomRecognition: null });
    },
  }));
}
