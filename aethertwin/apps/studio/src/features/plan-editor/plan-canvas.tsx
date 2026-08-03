import type { GuidedRoute, PlanReference, Point2, ProjectSnapshot } from "@aethertwin/core-model";
import { resolveGuidedRoute } from "@aethertwin/route-engine";
import {
  planReferenceSourceToWorld,
  planReferenceWorldToSource,
  representedRoomCandidateKeys,
  screenToWorld,
  worldToScreen,
} from "@aethertwin/plan-engine";
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
import type { CalibrationDraft, PlanEditorState } from "./editor-session";
import type { InteractionController } from "./interaction-controller";
import { PlanAccessibility } from "./plan-accessibility";

export interface PlanCanvasProps {
  readonly assetSourceEpoch?: number;
  readonly store: Pick<ProjectStore, "resolveAsset">;
  readonly snapshot: ProjectSnapshot;
  readonly activeFloorId: string;
  readonly sessionStore: StoreApi<PlanEditorState>;
  readonly controller: InteractionController;
  readonly guidedRouteDraftActive?: boolean;
  readonly rendererFactory?: PlanRendererFactory;
  readonly onError: (error: unknown) => void;
  readonly onStartCalibration?: (
    referenceId: string,
    initiator: HTMLButtonElement,
  ) => void;
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

function snapshotWithTransientPreview(
  snapshot: ProjectSnapshot,
  state: PlanEditorState,
): ProjectSnapshot {
  if (state.draft?.kind === "opening-transform") {
    const preview = state.draft.preview;
    return {
      ...snapshot,
      project: {
        ...snapshot.project,
        openings: snapshot.project.openings.map((opening) => (
          opening.id === preview.id ? preview : opening
        )),
      },
    };
  }
  if (state.draft?.kind !== "reference-transform") return snapshot;
  const preview = state.draft.preview;
  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      planReferences: snapshot.project.planReferences.map((reference) => (
        reference.id === preview.id ? preview : reference
      )),
    },
  };
}

function resolvedRouteFromSnapshot(
  snapshot: ProjectSnapshot,
  state: PlanEditorState,
  guidedRouteDraftActive: boolean,
) {
  const networkId = state.routeAuthoring.networkId;
  if (networkId === null) return null;
  const network = snapshot.project.routeNetworks.find(({ id }) => id === networkId);
  if (network === undefined) return null;
  const saved = snapshot.project.guidedRoutes.find(
    (route) => route.routeNetworkId === network.id,
  ) ?? null;
  const stopNodeIds = guidedRouteDraftActive
    ? state.routeAuthoring.stopDraft
    : saved?.stopNodeIds ?? [];
  if (
    stopNodeIds.length < 2
    || stopNodeIds.some((nodeId, index) => index > 0 && nodeId === stopNodeIds[index - 1])
  ) return null;
  const candidate: GuidedRoute = {
    id: saved?.id ?? `transient-guided-route:${network.id}`,
    name: saved?.name ?? "导览路线",
    tags: saved?.tags ?? [],
    routeNetworkId: network.id,
    stopNodeIds,
  };
  const result = resolveGuidedRoute(network, candidate);
  return result.ok ? result.value : null;
}

function rendererInput(
  snapshot: ProjectSnapshot,
  activeFloorId: string,
  state: PlanEditorState,
  guidedRouteDraftActive: boolean,
): PlanRendererInput {
  const renderSnapshot = snapshotWithTransientPreview(snapshot, state);
  const recognition = state.roomRecognition;
  const representedKeys = recognition === null
    ? new Set<string>()
    : new Set(representedRoomCandidateKeys({
      candidates: recognition.candidates,
      entities: snapshot.project.entities,
      floorId: activeFloorId,
    }));
  return {
    snapshot: renderSnapshot,
    activeFloorId,
    viewport: state.viewport,
    selectedIds: state.selectedIds,
    draft: state.draft?.kind === "create" || state.draft?.kind === "transform"
      ? state.draft.preview
      : null,
    calibrationPreview: state.calibrationDraft?.preview ?? null,
    roomCandidates: recognition === null || recognition.stale
      ? []
      : recognition.candidates.map((candidate) => ({
        key: candidate.key,
        footprint: candidate.footprint,
        represented: representedKeys.has(candidate.key),
        selected: candidate.key === recognition.selectedCandidateKey,
      })),
    activeRouteNetworkId: state.routeAuthoring.networkId,
    resolvedRoute: resolvedRouteFromSnapshot(snapshot, state, guidedRouteDraftActive),
  };
}

function editableCalibrationReference(
  snapshot: ProjectSnapshot,
  activeFloorId: string,
  referenceId: string,
): PlanReference | null {
  const floor = snapshot.project.floors.find(({ id }) => id === activeFloorId);
  const reference = snapshot.project.planReferences.find(({ id }) => id === referenceId);
  if (
    floor === undefined
    || reference === undefined
    || reference.floorId !== activeFloorId
    || reference.locked
  ) return null;
  const layer = floor.layers.find(({ id }) => id === reference.layerId);
  return layer !== undefined && layer.visible && !layer.locked ? reference : null;
}

function clampedSourcePoint(reference: PlanReference, point: Point2): Point2 {
  return {
    x: Math.max(0, Math.min(reference.intrinsicSize.width, point.x)),
    y: Math.max(0, Math.min(reference.intrinsicSize.height, point.y)),
  };
}

function overlayPoint(
  reference: PlanReference,
  source: Point2 | null,
  state: PlanEditorState,
): Point2 | null {
  if (source === null) return null;
  const world = planReferenceSourceToWorld(reference, source);
  if (!world.ok) return null;
  try {
    return worldToScreen(world.value, state.viewport);
  } catch {
    return null;
  }
}

function CalibrationOverlay({
  draft,
  reference,
  state,
}: {
  readonly draft: CalibrationDraft;
  readonly reference: PlanReference;
  readonly state: PlanEditorState;
}) {
  const displayReference = draft.preview?.after ?? reference;
  const pointA = overlayPoint(displayReference, draft.sourcePointA, state);
  const pointB = overlayPoint(displayReference, draft.sourcePointB, state);
  if (pointA === null && pointB === null) return null;

  return (
    <svg
      className="studio-calibration-overlay"
      data-testid="calibration-overlay"
      viewBox={`0 0 ${state.viewport.width} ${state.viewport.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {pointA !== null && pointB !== null ? (
        <line
          data-testid="calibration-measurement-line"
          x1={pointA.x}
          y1={pointA.y}
          x2={pointB.x}
          y2={pointB.y}
        />
      ) : null}
      {pointA === null ? null : (
        <g data-testid="calibration-point-a">
          <circle cx={pointA.x} cy={pointA.y} r="6" />
          <text x={pointA.x + 9} y={pointA.y - 9}>A</text>
        </g>
      )}
      {pointB === null ? null : (
        <g data-testid="calibration-point-b">
          <circle cx={pointB.x} cy={pointB.y} r="6" />
          <text x={pointB.x + 9} y={pointB.y - 9}>B</text>
        </g>
      )}
    </svg>
  );
}

export function PlanCanvas({
  store,
  assetSourceEpoch = 0,
  snapshot,
  activeFloorId,
  sessionStore,
  controller,
  guidedRouteDraftActive = false,
  rendererFactory,
  onError,
  onStartCalibration,
}: PlanCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const activeRendererRef = useRef<ActiveRenderer | null>(null);
  const onErrorRef = useRef(onError);
  const snapshotRef = useRef(snapshot);
  const activeFloorIdRef = useRef(activeFloorId);
  onErrorRef.current = onError;
  snapshotRef.current = snapshot;
  activeFloorIdRef.current = activeFloorId;
  const productionRendererFactory = useCallback<PlanRendererFactory>(() => {
    const sourcePort: PlanAssetSourcePort = {
      async resolve(assetId) {
        try {
          return await store.resolveAsset(assetId);
        } catch (error) {
          onErrorRef.current(error);
          throw error;
        }
      },
      reportRetirementError(error) {
        onErrorRef.current(error);
      },
    };
    return new PixiPlanRenderer(sourcePort);
  }, [assetSourceEpoch, store]);
  const activeRendererFactory = rendererFactory ?? productionRendererFactory;
  const subscribe = useCallback(
    (listener: () => void) => sessionStore.subscribe(listener),
    [sessionStore],
  );
  const getSnapshot = useCallback(() => sessionStore.getState(), [sessionStore]);
  const sessionState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const input = rendererInput(snapshot, activeFloorId, sessionState, guidedRouteDraftActive);
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

    function handleCalibrationPointer(event: PlanPointerEvent): boolean {
      const state = sessionStore.getState();
      const draft = state.calibrationDraft;
      if (
        draft === null
        || event.type !== "pointerdown"
        || (event.buttons & 1) === 0
      ) return false;

      const reference = editableCalibrationReference(
        snapshotRef.current,
        activeFloorIdRef.current,
        draft.referenceId,
      );
      if (reference === null) {
        state.cancelCalibration();
        return true;
      }
      if (draft.sourcePointA !== null && draft.sourcePointB !== null) {
        if (draft.preview !== null) {
          state.updateCalibration({ ...draft, preview: null });
        }
        return true;
      }

      const world = screenToWorld(event.screen, state.viewport);
      const source = planReferenceWorldToSource(reference, world);
      if (!source.ok) {
        onErrorRef.current(new Error(source.issue.message));
        return true;
      }
      const point = clampedSourcePoint(reference, source.value);
      state.updateCalibration({
        ...draft,
        ...(draft.sourcePointA === null
          ? { sourcePointA: point }
          : { sourcePointB: point }),
        preview: null,
      });
      return true;
    }

    const sink = {
      handle(event: PlanPointerEvent): void {
        if (disposed) return;
        if (event.type === "pointerdown" && (event.buttons & 1) !== 0) host.focus();
        try {
          if (handleCalibrationPointer(event)) return;
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
  }, [activeRendererFactory, controller, sessionStore]);

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

  const calibrationDraft = sessionState.calibrationDraft;
  const calibrationReference = calibrationDraft === null
    ? null
    : snapshot.project.planReferences.find(
      ({ id }) => id === calibrationDraft.referenceId,
    ) ?? null;

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
      {calibrationDraft === null || calibrationReference === null ? null : (
        <CalibrationOverlay
          draft={calibrationDraft}
          reference={calibrationReference}
          state={sessionState}
        />
      )}
      <PlanAccessibility
        snapshot={snapshot}
        activeFloorId={activeFloorId}
        selectedIds={sessionState.selectedIds}
        sessionStore={sessionStore}
        controller={controller}
        {...(onStartCalibration === undefined ? {} : { onStartCalibration })}
      />
    </div>
  );
}
