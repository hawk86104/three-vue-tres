// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GuidedRoute, RouteEdge, RouteNetwork, RouteNode } from "@aethertwin/core-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoreApi } from "zustand/vanilla";
import { createPlanEditorStore, type PlanEditorState } from "./editor-session";
import { RoutePanel } from "./route-panel";
import { LocaleProvider, useI18n } from "../../i18n/locale-provider";
import type { StudioLocale } from "../../i18n/message-schema";

/** Task 13 seam: session owns the transient draft; panel proposes one route. */
interface RoutePanelSessionState extends PlanEditorState {
  readonly routeAuthoring: PlanEditorState["routeAuthoring"];
}

const ids = {
  floor: "00000000-0000-4000-8000-000000001301",
  network: "00000000-0000-4000-8000-000000001302",
  route: "00000000-0000-4000-8000-000000001303",
  entrance: "00000000-0000-4000-8000-000000001304",
  showroom: "00000000-0000-4000-8000-000000001305",
  lounge: "00000000-0000-4000-8000-000000001306",
  isolated: "00000000-0000-4000-8000-000000001307",
  entranceShowroom: "00000000-0000-4000-8000-000000001308",
  showroomLounge: "00000000-0000-4000-8000-000000001309",
};

function node(id: string, name: string, kind: RouteNode["kind"], x: number): RouteNode {
  return { id, name, tags: [], floorId: ids.floor, position: { x, y: 0 }, kind };
}

function edge(id: string, from: string, to: string, distance: number): RouteEdge {
  return {
    id, name: id, tags: [], from, to, distance, bidirectional: true,
    accessible: true, enabled: true, width: 1200, weight: 1,
  };
}

const network: RouteNetwork = {
  id: ids.network,
  name: "Visitor circuit",
  tags: [],
  nodes: [
    node(ids.entrance, "North entrance", "entrance", 0),
    node(ids.showroom, "Lighting gallery", "showroom-stop", 100),
    node(ids.lounge, "Lounge", "showroom-stop", 200),
    node(ids.isolated, "Isolated gallery", "showroom-stop", 500),
  ],
  edges: [
    edge(ids.entranceShowroom, ids.entrance, ids.showroom, 100),
    edge(ids.showroomLounge, ids.showroom, ids.lounge, 100),
  ],
};

function guidedRoute(stopNodeIds: readonly string[] = []): GuidedRoute {
  return {
    id: ids.route,
    name: "Curated visitor route",
    tags: [],
    routeNetworkId: network.id,
    stopNodeIds,
  };
}

function routeSession(): StoreApi<RoutePanelSessionState> {
  const store = createPlanEditorStore({ activeFloorId: ids.floor });
  const state = store.getState();
  state.setActiveTool("route-node");
  state.setActiveRouteNetwork({
    sessionId: state.sessionId,
    floorId: ids.floor,
    networkId: null,
    tool: "route-node",
  }, network.id);
  return store as unknown as StoreApi<RoutePanelSessionState>;
}

function renderPanel(route: GuidedRoute | null = null) {
  const sessionStore = routeSession();
  const onConfirm = vi.fn(async () => undefined);
  const onReturnFocus = vi.fn();
  let setLocale: ((locale: StudioLocale) => void) | undefined;
  function LocaleProbe() {
    setLocale = useI18n().setLocale;
    return null;
  }
  render(
    <LocaleProvider initialLocale="zh-CN" preference={{ read: () => "zh-CN", write: () => undefined }}>
      <LocaleProbe />
      <RoutePanel
      network={network}
      route={route}
      sessionStore={sessionStore}
      makeId={() => ids.route}
      onConfirm={onConfirm}
      onReturnFocus={onReturnFocus}
      />
    </LocaleProvider>,
  );
  return {
    sessionStore, onConfirm, onReturnFocus,
    setLocale: (locale: StudioLocale) => setLocale?.(locale),
  };
}

function stopIds(): string[] {
  return screen.getAllByTestId("guided-route-stop").map((element) => (
    element.getAttribute("data-node-id") ?? ""
  ));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RoutePanel guided-route stop authoring", () => {
  it("reformats route authoring in place without changing stop IDs", async () => {
    const user = userEvent.setup();
    const { sessionStore, setLocale } = renderPanel();
    await user.click(screen.getByRole("button", { name: "添加站点：North entrance" }));
    await user.click(screen.getByRole("button", { name: "添加站点：Lighting gallery" }));
    act(() => setLocale("en"));

    expect(screen.getByRole("heading", { name: "Guided route" })).toBeVisible();
    expect(stopIds()).toEqual([ids.entrance, ids.showroom]);
    expect([...sessionStore.getState().routeAuthoring.stopDraft]).toEqual([ids.entrance, ids.showroom]);
  });
  it("adds, removes, and reorders only eligible entrance/showroom stops with native keyboard controls", async () => {
    const user = userEvent.setup();
    const { sessionStore } = renderPanel();

    expect(screen.getByRole("button", { name: "添加站点：North entrance" }))
      .toHaveTextContent("入口");
    expect(screen.getByRole("button", { name: "添加站点：Lighting gallery" }))
      .toHaveTextContent("展厅停靠点");
    await user.click(screen.getByRole("button", { name: "添加站点：North entrance" }));
    await user.click(screen.getByRole("button", { name: "添加站点：Lighting gallery" }));
    await user.click(screen.getByRole("button", { name: "添加站点：Lounge" }));
    expect(stopIds()).toEqual([ids.entrance, ids.showroom, ids.lounge]);

    const moveLoungeUp = screen.getByRole("button", { name: "上移站点：Lounge" });
    moveLoungeUp.focus();
    await user.keyboard("{Enter}");
    expect(stopIds()).toEqual([ids.entrance, ids.lounge, ids.showroom]);

    await user.click(screen.getByRole("button", { name: "删除站点：Lounge" }));
    expect(stopIds()).toEqual([ids.entrance, ids.showroom]);
    expect([...sessionStore.getState().routeAuthoring.stopDraft])
      .toEqual([ids.entrance, ids.showroom]);
  });

  it("disables confirmation below two stops and rejects adjacent duplicates without replacing the draft", async () => {
    const user = userEvent.setup();
    const { sessionStore, onConfirm } = renderPanel();
    const confirm = screen.getByRole("button", { name: "确认导览路线" });

    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "添加站点：North entrance" }));
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "添加站点：North entrance" }));
    expect(screen.getByRole("alert")).toHaveTextContent("不能连续重复");
    expect([...sessionStore.getState().routeAuthoring.stopDraft]).toEqual([ids.entrance]);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("uses saved ordered stops as the next baseline and persists exactly the confirmed order", async () => {
    const user = userEvent.setup();
    const saved = guidedRoute([ids.entrance, ids.showroom]);
    const { onConfirm, onReturnFocus } = renderPanel(saved);

    expect(stopIds()).toEqual([ids.entrance, ids.showroom]);
    await user.click(screen.getByRole("button", { name: "添加站点：Lounge" }));
    await user.click(screen.getByRole("button", { name: "上移站点：Lounge" }));
    await user.click(screen.getByRole("button", { name: "确认导览路线" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledWith(saved, {
      ...saved,
      stopNodeIds: [ids.entrance, ids.lounge, ids.showroom],
    });
    expect(onReturnFocus).toHaveBeenCalledOnce();
  });

  it("derives a real preview and exposes an exact NO_ROUTE pair without a durable action", async () => {
    const user = userEvent.setup();
    const { sessionStore, onConfirm } = renderPanel();
    act(() => sessionStore.getState().setSelection([ids.showroom]));
    const selectionBefore = [...sessionStore.getState().selectedIds];

    await user.click(screen.getByRole("button", { name: "添加站点：North entrance" }));
    await user.click(screen.getByRole("button", { name: "添加站点：Lighting gallery" }));
    expect(screen.getByTestId("guided-route-preview")).toHaveTextContent("100 mm");
    await user.click(screen.getByRole("button", { name: "添加站点：Isolated gallery" }));

    expect(screen.getByRole("alert")).toHaveTextContent("路线无法连通");
    expect(screen.getByRole("alert")).not.toHaveTextContent("Lighting gallery");
    expect(screen.getByRole("alert")).not.toHaveTextContent("Isolated gallery");
    expect(screen.getByRole("button", { name: "确认导览路线" })).toBeDisabled();
    expect([...sessionStore.getState().selectedIds]).toEqual(selectionBefore);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
