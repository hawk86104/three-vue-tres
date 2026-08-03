import type { GuidedRoute, RouteNetwork, RouteNode } from "@aethertwin/core-model";
import { resolveGuidedRoute } from "@aethertwin/route-engine";
import { Button, StatusNotice } from "@aethertwin/design-system";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { StoreApi } from "zustand/vanilla";
import type { PlanEditorState, RouteAuthoringScope } from "./editor-session";

export interface RoutePanelProps {
  readonly network: RouteNetwork;
  readonly route: GuidedRoute | null;
  readonly sessionStore: StoreApi<PlanEditorState>;
  readonly makeId: () => string;
  readonly onConfirm: (before: GuidedRoute | null, after: GuidedRoute) => Promise<void>;
  readonly onReturnFocus: () => void;
}

function scope(state: PlanEditorState): RouteAuthoringScope {
  return {
    sessionId: state.sessionId,
    floorId: state.activeFloorId,
    networkId: state.routeAuthoring.networkId,
    tool: state.activeTool,
  };
}

function adjacentDistinct(stopNodeIds: readonly string[]): boolean {
  return stopNodeIds.every((id, index) => index === 0 || id !== stopNodeIds[index - 1]);
}

function nodeKindLabel(kind: RouteNode["kind"]): string {
  return kind === "entrance" ? "入口" : "展厅站点";
}

function routeCandidate(
  route: GuidedRoute | null,
  network: RouteNetwork,
  stopNodeIds: readonly string[],
): GuidedRoute {
  return {
    id: route?.id ?? `transient-guided-route:${network.id}`,
    name: route?.name ?? "导览路线",
    tags: route?.tags ?? [],
    routeNetworkId: network.id,
    stopNodeIds,
  };
}

export function RoutePanel({
  network,
  route,
  sessionStore,
  makeId,
  onConfirm,
  onReturnFocus,
}: RoutePanelProps) {
  const subscribe = useMemo(() => (
    (listener: () => void) => sessionStore.subscribe(listener)
  ), [sessionStore]);
  const getSnapshot = useMemo(() => () => sessionStore.getState(), [sessionStore]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const initializedRouteId = useRef<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const nodeById = useMemo(
    () => new Map(network.nodes.map((node) => [node.id, node] as const)),
    [network.nodes],
  );
  const stops = state.routeAuthoring.networkId === network.id
    ? state.routeAuthoring.stopDraft
    : [];

  useEffect(() => {
    if (route === null || route.routeNetworkId !== network.id) {
      initializedRouteId.current = null;
      return;
    }
    if (initializedRouteId.current === route.id) return;
    const current = sessionStore.getState();
    if (current.routeAuthoring.networkId !== network.id || current.routeAuthoring.stopDraft.length > 0) {
      return;
    }
    if (current.setRouteStopDraft(scope(current), route.stopNodeIds)) {
      initializedRouteId.current = route.id;
    }
  }, [
    network.id,
    route,
    sessionStore,
    state.activeTool,
    state.routeAuthoring.networkId,
    state.routeAuthoring.stopDraft.length,
  ]);

  const candidate = routeCandidate(route, network, stops);
  const resolution = stops.length >= 2 && adjacentDistinct(stops)
    ? resolveGuidedRoute(network, candidate)
    : null;
  const noRoute = resolution !== null && !resolution.ok ? resolution.error : null;
  const canConfirm = stops.length >= 2 && adjacentDistinct(stops)
    && resolution !== null && resolution.ok && !publishing;
  const eligibleNodes = network.nodes.filter((node) => (
    node.kind === "entrance" || node.kind === "showroom-stop"
  ));

  function setStops(next: readonly string[]): void {
    const current = sessionStore.getState();
    if (!current.setRouteStopDraft(scope(current), next)) return;
    setMessage(null);
  }

  function addStop(nodeId: string): void {
    const next = [...stops, nodeId];
    if (!adjacentDistinct(next)) {
      setMessage("不能连续重复同一站点。");
      return;
    }
    setStops(next);
  }

  function removeStop(index: number): void {
    setStops(stops.filter((_stop, currentIndex) => currentIndex !== index));
  }

  function moveStop(index: number, offset: -1 | 1): void {
    const destination = index + offset;
    if (destination < 0 || destination >= stops.length) return;
    const next = [...stops];
    const [moved] = next.splice(index, 1);
    if (moved === undefined) return;
    next.splice(destination, 0, moved);
    if (!adjacentDistinct(next)) {
      setMessage("不能连续重复同一站点。");
      return;
    }
    setStops(next);
  }

  async function confirm(): Promise<void> {
    if (!canConfirm) return;
    const current = sessionStore.getState();
    const currentStops = current.routeAuthoring.stopDraft;
    if (
      current.routeAuthoring.networkId !== network.id
      || (current.activeTool !== "route-node" && current.activeTool !== "route-edge")
      || currentStops.length < 2
      || !adjacentDistinct(currentStops)
    ) {
      setMessage("路线草稿已失效，请重新打开导览路线编辑。");
      return;
    }
    const currentCandidate = routeCandidate(route, network, currentStops);
    const currentResolution = resolveGuidedRoute(network, currentCandidate);
    if (!currentResolution.ok) {
      setMessage("路线草稿已无法解析，请检查站点连接。");
      return;
    }
    setPublishing(true);
    setMessage(null);
    try {
      const after: GuidedRoute = {
        ...currentCandidate,
        id: route?.id ?? makeId(),
        stopNodeIds: [...currentStops],
      };
      await onConfirm(route, after);
      onReturnFocus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPublishing(false);
    }
  }

  const routeFailureMessage = noRoute === null ? null : (() => {
    const from = nodeById.get(noRoute.fromStopId)?.name ?? noRoute.fromStopId;
    const to = nodeById.get(noRoute.toStopId)?.name ?? noRoute.toStopId;
    return `NO_ROUTE：${from} → ${to}`;
  })();

  return (
    <aside className="studio-route-panel" aria-label={`导览路线：${network.name}`} aria-busy={publishing}>
      <h2>导览路线</h2>
      {message === null ? null : <StatusNotice tone="error">{message}</StatusNotice>}
      {routeFailureMessage === null ? null : (
        <StatusNotice tone="error">{routeFailureMessage}</StatusNotice>
      )}
      {resolution !== null && resolution.ok ? (
        <div className="studio-route-panel__preview" data-testid="guided-route-preview" aria-live="polite">
          {resolution.value.totalDistance} mm
        </div>
      ) : null}
      <section aria-label="可添加站点">
        {eligibleNodes.map((node) => (
          <Button
            key={node.id}
            type="button"
            variant="secondary"
            disabled={publishing}
            aria-label={`添加站点：${node.name}`}
            onClick={() => addStop(node.id)}
          >
            {nodeKindLabel(node.kind)} · {node.name}
          </Button>
        ))}
      </section>
      <ol className="studio-route-panel__stops">
        {stops.map((nodeId, index) => {
          const node = nodeById.get(nodeId);
          const name = node?.name ?? nodeId;
          return (
            <li key={`${index}:${nodeId}`} data-testid="guided-route-stop" data-node-id={nodeId}>
              <span>{name}</span>
              <Button
                type="button"
                variant="ghost"
                disabled={publishing || index === 0}
                aria-label={`上移站点：${name}`}
                onClick={() => moveStop(index, -1)}
              >上移</Button>
              <Button
                type="button"
                variant="ghost"
                disabled={publishing || index === stops.length - 1}
                aria-label={`下移站点：${name}`}
                onClick={() => moveStop(index, 1)}
              >下移</Button>
              <Button
                type="button"
                variant="ghost"
                disabled={publishing}
                aria-label={`删除站点：${name}`}
                onClick={() => removeStop(index)}
              >删除</Button>
            </li>
          );
        })}
      </ol>
      <Button type="button" disabled={!canConfirm} onClick={() => void confirm()}>
        确认导览路线
      </Button>
    </aside>
  );
}
