import type {
  ProjectSnapshot,
} from "@aethertwin/core-model";
import type {
  ProjectStore,
  ProjectStoreState,
} from "@aethertwin/project-store";
import { resolveGuidedRoute } from "@aethertwin/route-engine";
import {
  createSceneRenderer,
  type SceneAssetIssue,
  type SceneCameraState,
  type SceneGuidedRouteProjection,
  type SceneRenderer,
  type SceneRendererDependencies,
  type SceneRendererFactory,
  type SceneRendererInput,
} from "@aethertwin/render-scene-3d";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type {
  PlanEditorState,
  SceneRendererScope,
} from "./editor-session";

const DEFAULT_SCENE_CAMERA: SceneCameraState = Object.freeze({
  position: Object.freeze({ x: 8, y: 6, z: 8 }),
  target: Object.freeze({ x: 0, y: 0, z: 0 }),
  fieldOfView: 45,
});

type SceneProjectStore = Pick<
  ProjectStore,
  | "resolveAsset"
  | "reportRendererAssetIssue"
  | "clearRendererAssetIssue"
>;

export interface SceneCanvasProps {
  readonly store: SceneProjectStore;
  readonly assetSourceEpoch: number;
  readonly snapshot: ProjectSnapshot;
  readonly assetIssues: ProjectStoreState["assetIssues"];
  readonly activeFloorId: string;
  readonly sessionStore: StoreApi<PlanEditorState>;
  readonly rendererFactory?: SceneRendererFactory;
  readonly onError: (error: unknown) => void;
}

interface ActiveSceneRenderer {
  readonly renderer: SceneRenderer;
  readonly scope: SceneRendererScope;
  initialized: boolean;
  restoreFocusOnDispose: boolean;
}

function normalizedError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error("Scene renderer operation failed", { cause: error });
}

function scopeCurrent(
  state: PlanEditorState,
  scope: SceneRendererScope,
): boolean {
  return state.sessionId === scope.sessionId
    && state.activeFloorId === scope.floorId
    && state.rendererGeneration === scope.generation;
}

function guidedRouteProjection(
  snapshot: ProjectSnapshot,
): SceneGuidedRouteProjection | null {
  if (snapshot.project.guidedRoutes.length !== 1) return null;
  const route = snapshot.project.guidedRoutes[0]!;
  const network = snapshot.project.routeNetworks.find(
    ({ id }) => id === route.routeNetworkId,
  );
  if (network === undefined) return null;
  const resolved = resolveGuidedRoute(network, route);
  if (!resolved.ok) return null;
  return Object.freeze({
    guidedRouteId: route.id,
    routeNetworkId: network.id,
    resolvedRoute: resolved.value,
  });
}

function rendererAssetIssues(
  assetIssues: ProjectStoreState["assetIssues"],
): readonly SceneAssetIssue[] {
  return Object.freeze(assetIssues.flatMap((issue) => {
    if (
      issue.code !== "ASSET_MISSING"
      && issue.code !== "ASSET_CORRUPT"
      && issue.code !== "ASSET_CODEC_PREVIEW_UNAVAILABLE"
    ) return [];
    return [Object.freeze({ assetId: issue.assetId, code: issue.code })];
  }));
}
function sceneCamerasEqual(
  left: SceneCameraState,
  right: SceneCameraState,
): boolean {
  return left.fieldOfView === right.fieldOfView
    && left.position.x === right.position.x
    && left.position.y === right.position.y
    && left.position.z === right.position.z
    && left.target.x === right.target.x
    && left.target.y === right.target.y
    && left.target.z === right.target.z;
}

function sameProjectionInputs(
  left: SceneRendererInput,
  right: SceneRendererInput,
): boolean {
  return left.snapshot === right.snapshot
    && left.activeFloorId === right.activeFloorId
    && left.selectedIds === right.selectedIds
    && left.activeGuidedRoute === right.activeGuidedRoute
    && left.assetIssues === right.assetIssues;
}


export function SceneCanvas({
  store,
  assetSourceEpoch,
  snapshot,
  assetIssues,
  activeFloorId,
  sessionStore,
  rendererFactory,
  onError,
}: SceneCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const activeRendererRef = useRef<ActiveSceneRenderer | null>(null);
  const lastAppliedInputRef = useRef<SceneRendererInput | null>(null);
  const rendererCameraEchoRef = useRef<SceneCameraState | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const selectedIds = useStore(sessionStore, (state) => state.selectedIds);
  const sceneCamera = useStore(sessionStore, (state) => state.sceneCamera);
  const sceneFrameRequest = useStore(
    sessionStore,
    (state) => state.sceneFrameRequest,
  );
  const sessionId = useStore(sessionStore, (state) => state.sessionId);
  const activeGuidedRoute = useMemo(
    () => guidedRouteProjection(snapshot),
    [snapshot],
  );
  const projectedAssetIssues = useMemo(
    () => rendererAssetIssues(assetIssues),
    [assetIssues],
  );
  const input = useMemo<SceneRendererInput>(() => Object.freeze({
    snapshot,
    activeFloorId,
    selectedIds,
    activeGuidedRoute,
    camera: sceneCamera ?? DEFAULT_SCENE_CAMERA,
    assetIssues: projectedAssetIssues,
  }), [
    activeFloorId,
    activeGuidedRoute,
    projectedAssetIssues,
    sceneCamera,
    selectedIds,
    snapshot,
  ]);
  const latestInputRef = useRef(input);
  latestInputRef.current = input;

  const dependencies = useMemo<SceneRendererDependencies>(() => ({
    assetSource: {
      resolve: (assetId) => store.resolveAsset(assetId),
    },
    issueReporter: {
      report: (issue) => {
        if (issue.code === "ASSET_CODEC_PREVIEW_UNAVAILABLE") {
          store.reportRendererAssetIssue({
            assetId: issue.assetId,
            code: "ASSET_CODEC_PREVIEW_UNAVAILABLE",
          }, assetSourceEpoch);
        }
      },
      clear: (assetId) => {
        store.clearRendererAssetIssue(assetId, assetSourceEpoch);
      },
    },
  }), [assetSourceEpoch, store]);
  const activeRendererFactory = rendererFactory ?? createSceneRenderer;

  useLayoutEffect(() => () => {
    const host = hostRef.current;
    const active = activeRendererRef.current;
    if (host !== null && active !== null && host.contains(document.activeElement)) {
      active.restoreFocusOnDispose = true;
    }
  }, []);

  const failActive = useCallback((
    active: ActiveSceneRenderer,
    error: unknown,
  ): void => {
    const normalized = normalizedError(error);
    const state = sessionStore.getState();
    if (!scopeCurrent(state, active.scope)) return;
    state.setSceneRendererStatus(active.scope, "failed", normalized);
    onErrorRef.current(normalized);
  }, [sessionStore]);

  useEffect(() => {
    const active = activeRendererRef.current;
    if (active === null || !active.initialized) return;
    const state = sessionStore.getState();
    if (!scopeCurrent(state, active.scope)) return;
    const previousInput = lastAppliedInputRef.current;
    const echoedCamera = rendererCameraEchoRef.current;
    if (
      previousInput !== null
      && echoedCamera !== null
      && sameProjectionInputs(previousInput, input)
      && sceneCamerasEqual(echoedCamera, input.camera)
    ) {
      lastAppliedInputRef.current = input;
      rendererCameraEchoRef.current = null;
      return;
    }
    rendererCameraEchoRef.current = null;
    try {
      active.renderer.update(input);
      lastAppliedInputRef.current = input;
    } catch (error) {
      failActive(active, error);
    }
  }, [failActive, input, sessionStore]);

  useEffect(() => {
    const request = sceneFrameRequest;
    const active = activeRendererRef.current;
    if (request === null || active === null || !active.initialized) return;
    const target = sessionStore.getState().consumeSceneFrameRequest(
      active.scope,
      request.id,
    );
    if (target === null) return;
    try {
      active.renderer.frame(target);
    } catch (error) {
      failActive(active, error);
    }
  }, [failActive, sceneFrameRequest, sessionStore]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const scope = sessionStore.getState().beginSceneRenderer();
    let renderer: SceneRenderer;
    try {
      renderer = activeRendererFactory(dependencies);
    } catch (error) {
      const normalized = normalizedError(error);
      sessionStore.getState().setSceneRendererStatus(scope, "failed", normalized);
      onErrorRef.current(normalized);
      return () => {
        sessionStore.getState().retireSceneRenderer(scope);
      };
    }

    const active: ActiveSceneRenderer = {
      renderer,
      scope,
      initialized: false,
      restoreFocusOnDispose: false,
    };
    activeRendererRef.current = active;
    lastAppliedInputRef.current = null;
    rendererCameraEchoRef.current = null;
    let disposed = false;
    let pendingResize: readonly [number, number, number] | null = null;
    const workspace = host.closest<HTMLElement>(".studio-plan-workspace");

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
        failActive(active, error);
      }
    };
    if (typeof ResizeObserverClass === "function") {
      observer = new ResizeObserverClass(handleResize);
      observer.observe(host);
    } else {
      onErrorRef.current(new Error("ResizeObserver is not available."));
    }

    const sink = {
      onSelectionChange(selectedIds: ReadonlySet<string>): void {
        const state = sessionStore.getState();
        if (!disposed && scopeCurrent(state, scope)) {
          state.setSelection([...selectedIds]);
        }
      },
      onCameraChange(camera: SceneCameraState): void {
        if (disposed) return;
        rendererCameraEchoRef.current = camera;
        if (!sessionStore.getState().setSceneCamera(scope, camera)) {
          rendererCameraEchoRef.current = null;
        }
      },
      onStatusChange(
        status: Parameters<PlanEditorState["setSceneRendererStatus"]>[1],
        error: Error | null,
      ): void {
        if (status === "failed" || status === "disabled") {
          active.restoreFocusOnDispose = host.contains(document.activeElement);
        }
        if (!disposed) {
          sessionStore.getState().setSceneRendererStatus(scope, status, error);
        }
      },
    };

    void Promise.resolve()
      .then(() => {
        if (disposed) return;
        return renderer.init(host, sink);
      })
      .then(() => {
        const state = sessionStore.getState();
        if (disposed || !scopeCurrent(state, scope)) return;
        active.initialized = true;
        try {
          renderer.update(latestInputRef.current);
          lastAppliedInputRef.current = latestInputRef.current;
          if (pendingResize !== null) renderer.resize(...pendingResize);
          if (state.sceneCamera === null) renderer.frame("scene");
          const request = state.sceneFrameRequest;
          if (request !== null) {
            const target = state.consumeSceneFrameRequest(scope, request.id);
            if (target !== null) renderer.frame(target);
          }
        } catch (error) {
          failActive(active, error);
        }
      })
      .catch((error: unknown) => {
        if (!disposed) failActive(active, error);
      });

    return () => {
      const restoreFocus =
        active.restoreFocusOnDispose || host.contains(document.activeElement);
      disposed = true;
      observer?.disconnect();
      if (activeRendererRef.current === active) activeRendererRef.current = null;
      sessionStore.getState().retireSceneRenderer(scope);
      try {
        renderer.destroy();
      } catch (error) {
        onErrorRef.current(error);
      }
      if (restoreFocus) {
        queueMicrotask(() => {
          const nextFocusTarget = workspace
            ?.querySelector<HTMLElement>(".studio-scene-canvas")
            ?? workspace?.querySelector<HTMLElement>(".studio-plan-canvas");
          nextFocusTarget?.focus();
        });
      }
    };
  }, [
    activeFloorId,
    activeRendererFactory,
    dependencies,
    failActive,
    sessionId,
    sessionStore,
  ]);

  return (
    <div
      ref={hostRef}
      className="studio-scene-canvas"
      role="region"
      aria-label="三维场景"
      tabIndex={0}
    />
  );
}
