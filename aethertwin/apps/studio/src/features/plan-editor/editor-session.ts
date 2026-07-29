import type { Point2, SpatialEntity } from "@aethertwin/core-model";
import type { SnapMode, ViewportTransform } from "@aethertwin/plan-engine";
import { createStore, type StoreApi } from "zustand/vanilla";

export type PlanTool =
  | "select"
  | "boundary"
  | "wall"
  | "zone"
  | "space-unit"
  | "fixture"
  | "poi"
  | "dimension"
  | "pan";


export type PlanSidePanel = "tree" | "assets";
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
  | { readonly kind: "box-select"; readonly start: Point2; readonly current: Point2 };

export interface PlanEditorState {
  readonly activeFloorId: string;
  readonly activeTool: PlanTool;
  readonly sidePanel: PlanSidePanel;
  readonly selectedIds: ReadonlySet<string>;
  readonly viewport: ViewportTransform;
  readonly snapModes: ReadonlySet<SnapMode>;
  readonly draft: PlanDraft | null;
  readonly gestureActive: boolean;
  readonly clipboard: readonly SpatialEntity[];
  setActiveFloor(id: string): boolean;
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

function ownedViewport(viewport: ViewportTransform): ViewportTransform {
  return ownValue(viewport);
}

function ownedDraft(draft: PlanDraft): PlanDraft {
  return ownValue(draft);
}

export function createPlanEditorStore(
  options: { readonly activeFloorId: string },
): StoreApi<PlanEditorState> {
  const floorViewports = new Map<string, ViewportTransform>();
  const initialViewport = ownedViewport(DEFAULT_VIEWPORT);
  floorViewports.set(options.activeFloorId, initialViewport);

  return createStore<PlanEditorState>((set, get) => ({
    activeFloorId: options.activeFloorId,
    activeTool: "select",
    sidePanel: "tree",
    selectedIds: ownReadonlySet([]),
    viewport: initialViewport,
    snapModes: ownReadonlySet(DEFAULT_SNAP_MODES),
    draft: null,
    gestureActive: false,
    clipboard: deepFreeze([] as SpatialEntity[]),

    setActiveFloor(id) {
      const state = get();
      if (state.gestureActive) return false;

      floorViewports.set(state.activeFloorId, ownedViewport(state.viewport));
      const restored = ownedViewport(floorViewports.get(id) ?? DEFAULT_VIEWPORT);
      floorViewports.set(id, restored);
      set({ activeFloorId: id, viewport: restored });
      return true;
    },

    setActiveTool(tool) {
      set({ activeTool: tool, draft: null, gestureActive: false });
    },

    setSidePanel(panel) {
      set({ sidePanel: panel });
    },

    setSelection(ids) {
      set({ selectedIds: ownReadonlySet(ids) });
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
      set({ draft: ownedDraft(draft), gestureActive: true });
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
  }));
}
