import type { ProjectSnapshot } from "@aethertwin/core-model";
import {
  PixiPlanRenderer,
  type PlanAssetSourcePort,
  type PlanPointerEvent,
  type PlanRenderer,
  type PlanRendererFactory,
  type PlanRendererInput,
} from "@aethertwin/render-plan-2d";
import type { ProjectStore } from "@aethertwin/project-store";
import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import type { StoreApi } from "zustand/vanilla";
import type { PlanEditorState } from "./editor-session";
import type { InteractionController } from "./interaction-controller";
import { PlanAccessibility } from "./plan-accessibility";

export interface PlanCanvasProps {
  readonly store: Pick<ProjectStore, "resolveAsset">;
  readonly snapshot: ProjectSnapshot;
  readonly activeFloorId: string;
  readonly sessionStore: StoreApi<PlanEditorState>;
  readonly controller: InteractionController;
  readonly rendererFactory?: PlanRendererFactory;
  readonly onError: (error: unknown) => void;
}

interface ActiveRenderer {
  readonly renderer: PlanRenderer;
  initialized: boolean;
}

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input"
    || tagName === "textarea"
    || tagName === "select"
    || target.isContentEditable
    || target.closest('[contenteditable]:not([contenteditable="false"])') !== null;
}

function rendererInput(
  snapshot: ProjectSnapshot,
  activeFloorId: string,
  state: PlanEditorState,
): PlanRendererInput {
  return {
    snapshot,
    activeFloorId,
    viewport: state.viewport,
    selectedIds: state.selectedIds,
    draft: state.draft?.kind === "create" || state.draft?.kind === "transform"
      ? state.draft.preview
      : null,
    calibrationPreview: null,
  };
}

export function PlanCanvas({
  store,
  snapshot,
  activeFloorId,
  sessionStore,
  controller,
  rendererFactory,
  onError,
}: PlanCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const activeRendererRef = useRef<ActiveRenderer | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const storeRef = useRef(store);
  storeRef.current = store;
  const sourcePortRef = useRef<PlanAssetSourcePort | null>(null);
  if (sourcePortRef.current === null) {
    sourcePortRef.current = {
      async resolve(assetId) {
        try {
          return await storeRef.current.resolveAsset(assetId);
        } catch (error) {
          onErrorRef.current(error);
          throw error;
        }
      },
    };
  }
  const productionRendererFactoryRef = useRef<PlanRendererFactory | null>(null);
  if (productionRendererFactoryRef.current === null) {
    const sourcePort = sourcePortRef.current;
    productionRendererFactoryRef.current = () => new PixiPlanRenderer(sourcePort);
  }
  const activeRendererFactory = rendererFactory ?? productionRendererFactoryRef.current;
  const subscribe = useCallback(
    (listener: () => void) => sessionStore.subscribe(listener),
    [sessionStore],
  );
  const getSnapshot = useCallback(() => sessionStore.getState(), [sessionStore]);
  const sessionState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const input = rendererInput(snapshot, activeFloorId, sessionState);
  const latestInputRef = useRef(input);
  latestInputRef.current = input;

  useEffect(() => {
    const active = activeRendererRef.current;
    if (active === null || !active.initialized) return;
    try {
      active.renderer.update(input);
    } catch (error) {
      onErrorRef.current(error);
    }
  }, [input]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const renderer = activeRendererFactory();
    const active: ActiveRenderer = { renderer, initialized: false };
    activeRendererRef.current = active;
    let disposed = false;
    let pendingResize: readonly [number, number, number] | null = null;

    const ResizeObserverClass = globalThis.ResizeObserver;
    let observer: ResizeObserver | null = null;
    const handleResize: ResizeObserverCallback = (entries) => {
      const entry = entries[0];
      if (entry === undefined) return;
      const dimensions = [
        Math.max(0, entry.contentRect.width),
        Math.max(0, entry.contentRect.height),
        Math.min(globalThis.devicePixelRatio || 1, 2),
      ] as const;
      pendingResize = dimensions;
      if (!active.initialized || disposed) return;
      try {
        renderer.resize(...dimensions);
      } catch (error) {
        onErrorRef.current(error);
      }
    };
    if (typeof ResizeObserverClass === "function") {
      observer = new ResizeObserverClass(handleResize);
      observer.observe(host);
    } else {
      onErrorRef.current(new Error("ResizeObserver is not available."));
    }

    const sink = {
      handle(event: PlanPointerEvent): void {
        if (disposed) return;
        if (event.type === "pointerdown" && (event.buttons & 1) !== 0) host.focus();
        try {
          const completion = controller.handle(event);
          void Promise.resolve(completion).catch((error: unknown) => {
            if (!disposed) onErrorRef.current(error);
          });
        } catch (error) {
          if (!disposed) onErrorRef.current(error);
        }
      },
    };

    void Promise.resolve()
      .then(() => renderer.init(host, sink))
      .then(() => {
        if (disposed) return;
        active.initialized = true;
        try {
          renderer.update(latestInputRef.current);
          if (pendingResize !== null) renderer.resize(...pendingResize);
        } catch (error) {
          onErrorRef.current(error);
        }
      })
      .catch((error: unknown) => {
        if (!disposed) onErrorRef.current(error);
      });

    return () => {
      disposed = true;
      observer?.disconnect();
      try {
        controller.cancel();
      } catch (error) {
        onErrorRef.current(error);
      }
      if (activeRendererRef.current === active) activeRendererRef.current = null;
      renderer.destroy();
    };
  }, [activeRendererFactory, controller]);

  function reportPromise(action: () => Promise<void>): void {
    try {
      void action().catch((error: unknown) => onErrorRef.current(error));
    } catch (error) {
      onErrorRef.current(error);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (isTextInputTarget(event.target)) return;
    const key = event.key;
    const command = event.ctrlKey || event.metaKey;
    if (command && key.toLowerCase() === "c") {
      event.preventDefault();
      try {
        controller.copy();
      } catch (error) {
        onErrorRef.current(error);
      }
      return;
    }
    if (command && key.toLowerCase() === "v") {
      event.preventDefault();
      reportPromise(() => controller.paste());
      return;
    }
    if (
      key === "Delete"
      || key === "Escape"
      || key === "ArrowLeft"
      || key === "ArrowRight"
      || key === "ArrowUp"
      || key === "ArrowDown"
    ) {
      event.preventDefault();
      reportPromise(() => controller.keyDown(key));
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>): void {
    if (
      event.relatedTarget instanceof Node
      && event.currentTarget.contains(event.relatedTarget)
    ) return;
    try {
      controller.cancel();
    } catch (error) {
      onErrorRef.current(error);
    }
  }

  return (
    <div
      ref={hostRef}
      className="studio-plan-canvas"
      role="region"
      aria-label="二维平面画布"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      <PlanAccessibility
        snapshot={snapshot}
        activeFloorId={activeFloorId}
        selectedIds={sessionState.selectedIds}
        sessionStore={sessionStore}
      />
    </div>
  );
}
