import type { GuidedRoute, RouteNetwork } from "@aethertwin/core-model";
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
import { ROUTE_NODE_KIND_MESSAGE_IDS } from "../../i18n/display-message-ids";
import { message as messageDescriptor, type StudioMessageDescriptor } from "../../i18n/format-message";
import { useI18n } from "../../i18n/locale-provider";
import { useDisplayName } from "../../i18n/display-name-provider";
import { localizedErrorDescriptor } from "../../i18n/localized-error";

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
  const { format, t } = useI18n();
  const displayName = useDisplayName();
  const subscribe = useMemo(() => (
    (listener: () => void) => sessionStore.subscribe(listener)
  ), [sessionStore]);
  const getSnapshot = useMemo(() => () => sessionStore.getState(), [sessionStore]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const initializedRouteId = useRef<string | null>(null);
  const [message, setMessage] = useState<StudioMessageDescriptor | null>(null);
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
      setMessage(messageDescriptor("route.panel.duplicate"));
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
      setMessage(messageDescriptor("route.panel.duplicate"));
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
      setMessage(messageDescriptor("route.panel.stale"));
      return;
    }
    const currentCandidate = routeCandidate(route, network, currentStops);
    const currentResolution = resolveGuidedRoute(network, currentCandidate);
    if (!currentResolution.ok) {
      setMessage(messageDescriptor("route.panel.invalid"));
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
      setMessage(localizedErrorDescriptor(error));
    } finally {
      setPublishing(false);
    }
  }

  const routeFailureMessage = noRoute === null ? null : t("route.panel.invalid");

  return (
    <aside className="studio-route-panel" aria-label={t("route.panel.label", { name: displayName({ kind: "route-network", id: network.id, authoredName: network.name }) })} aria-busy={publishing}>
      <h2>{t("route.panel.heading")}</h2>
      {message === null ? null : <StatusNotice tone="error">{format(message)}</StatusNotice>}
      {routeFailureMessage === null ? null : (
        <StatusNotice tone="error">{routeFailureMessage}</StatusNotice>
      )}
      {resolution !== null && resolution.ok ? (
        <div className="studio-route-panel__preview" data-testid="guided-route-preview" aria-live="polite">
          {resolution.value.totalDistance} mm
        </div>
      ) : null}
      <section aria-label={t("route.panel.addable")}>
        {eligibleNodes.map((node) => (
          <Button
            key={node.id}
            type="button"
            variant="secondary"
            disabled={publishing}
            aria-label={t("route.panel.add", { name: node.name })}
            onClick={() => addStop(node.id)}
          >
            {t(ROUTE_NODE_KIND_MESSAGE_IDS[node.kind])} · {node.name}
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
                aria-label={t("route.panel.moveUp", { name })}
                onClick={() => moveStop(index, -1)}
              >{t("content.moveUp", { name })}</Button>
              <Button
                type="button"
                variant="ghost"
                disabled={publishing || index === stops.length - 1}
                aria-label={t("route.panel.moveDown", { name })}
                onClick={() => moveStop(index, 1)}
              >{t("content.moveDown", { name })}</Button>
              <Button
                type="button"
                variant="ghost"
                disabled={publishing}
                aria-label={t("route.panel.remove", { name })}
                onClick={() => removeStop(index)}
              >{t("route.panel.remove", { name })}</Button>
            </li>
          );
        })}
      </ol>
      <Button type="button" disabled={!canConfirm} onClick={() => void confirm()}>
        {t("route.panel.confirm")}
      </Button>
    </aside>
  );
}
