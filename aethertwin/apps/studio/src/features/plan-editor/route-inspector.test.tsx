// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type { RouteNetwork, RouteNode } from "@aethertwin/core-model";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteInspector } from "./route-inspector";

const node: RouteNode = {
  id: "00000000-0000-4000-8000-000000000801",
  name: "North junction",
  tags: ["north"],
  floorId: "00000000-0000-4000-8000-000000000001",
  position: { x: 1_250, y: -500 },
  kind: "junction",
};

const network: RouteNetwork = {
  id: "00000000-0000-4000-8000-000000000800",
  name: "Visitor route",
  tags: [],
  nodes: [node],
  edges: [],
};

afterEach(() => cleanup());

function renderInspector(options: {
  readonly selectedNetwork?: RouteNetwork;
  readonly selectedNode?: RouteNode;
  readonly editable?: boolean;
  readonly apply?: (before: RouteNetwork, after: RouteNetwork) => Promise<void>;
} = {}) {
  const onApplyRouteNetworkPatch = vi.fn(options.apply ?? (async () => undefined));
  const onError = vi.fn();
  const result = render(
    <RouteInspector
      network={options.selectedNetwork ?? network}
      node={options.selectedNode ?? node}
      editable={options.editable ?? true}
      onApplyRouteNetworkPatch={onApplyRouteNetworkPatch}
      onError={onError}
    />,
  );
  return { ...result, onApplyRouteNetworkPatch, onError };
}

describe("RouteInspector", () => {
  it("edits one node kind by replacing exactly one whole network", async () => {
    const user = userEvent.setup();
    const { onApplyRouteNetworkPatch } = renderInspector();

    fireEvent.change(screen.getByLabelText("路线节点名称"), {
      target: { value: "  Main entrance  " },
    });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "路线节点类型" }),
      "entrance",
    );
    fireEvent.change(screen.getByLabelText("路线节点标签"), {
      target: { value: "entry, public, entry" },
    });
    await user.click(screen.getByRole("button", { name: "应用路线节点" }));

    await waitFor(() => expect(onApplyRouteNetworkPatch).toHaveBeenCalledOnce());
    expect(onApplyRouteNetworkPatch).toHaveBeenCalledWith(network, {
      ...network,
      nodes: [{
        ...node,
        name: "Main entrance",
        tags: ["entry", "public"],
        kind: "entrance",
      }],
    });
    expect(screen.getByText("X: 1250 mm")).toBeVisible();
    expect(screen.getByText("Y: -500 mm")).toBeVisible();
  });

  it("keeps the durable network exact when persistence fails and permits an exact retry", async () => {
    const failure = new Error("route save failed");
    const apply = vi.fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    const { onApplyRouteNetworkPatch, onError } = renderInspector({ apply });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "路线节点类型" }),
      "showroom-stop",
    );

    await user.click(screen.getByRole("button", { name: "应用路线节点" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
    expect(screen.getByRole("alert")).toHaveTextContent("route save failed");
    expect(network.nodes).toEqual([node]);

    await user.click(screen.getByRole("button", { name: "应用路线节点" }));
    await waitFor(() => expect(onApplyRouteNetworkPatch).toHaveBeenCalledTimes(2));
    expect(onApplyRouteNetworkPatch.mock.calls[1]).toEqual(
      onApplyRouteNetworkPatch.mock.calls[0],
    );
  });

  it("is readable but immutable when the active floor is not editable", () => {
    const { onApplyRouteNetworkPatch } = renderInspector({ editable: false });

    expect(screen.getByRole("heading", { name: "路线节点" })).toBeVisible();
    expect(screen.getByLabelText("路线节点名称")).toHaveAttribute("readonly");
    expect(screen.getByRole("combobox", { name: "路线节点类型" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "应用路线节点" })).toBeDisabled();
    expect(onApplyRouteNetworkPatch).not.toHaveBeenCalled();
  });

  it("does not publish an old save failure after the selected node refreshes", async () => {
    let rejectSave: (error: Error) => void = () => undefined;
    const pending = new Promise<void>((_resolve, reject) => {
      rejectSave = reject;
    });
    const user = userEvent.setup();
    const {
      rerender,
      onApplyRouteNetworkPatch,
      onError,
    } = renderInspector({ apply: () => pending });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "路线节点类型" }),
      "entrance",
    );
    await user.click(screen.getByRole("button", { name: "应用路线节点" }));
    expect(screen.getByRole("button", { name: "应用路线节点" })).toBeDisabled();

    const nextNode: RouteNode = {
      ...node,
      name: "South junction",
      position: { x: 2_000, y: 3_000 },
    };
    const nextNetwork: RouteNetwork = {
      ...network,
      name: "South route",
      nodes: [nextNode],
    };
    rerender(
      <RouteInspector
        network={nextNetwork}
        node={nextNode}
        editable
        onApplyRouteNetworkPatch={onApplyRouteNetworkPatch}
        onError={onError}
      />,
    );
    await waitFor(() => expect(
      screen.getByRole("button", { name: "应用路线节点" }),
    ).toBeEnabled());
    expect(screen.getByLabelText("路线节点名称")).toHaveValue("South junction");

    await act(async () => {
      rejectSave(new Error("old route save failed"));
      await pending.catch(() => undefined);
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled();
  });
});
