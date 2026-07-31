// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type { Opening, PlanLayer, Wall } from "@aethertwin/core-model";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpeningInspector } from "./opening-inspector";

const layer: PlanLayer = {
  id: "00000000-0000-4000-8000-000000000002",
  name: "Building",
  tags: [],
  visible: true,
  locked: false,
};

const wall: Wall = {
  id: "00000000-0000-4000-8000-000000000010",
  name: "North wall",
  tags: [],
  type: "wall",
  floorId: "00000000-0000-4000-8000-000000000001",
  layerId: layer.id,
  locked: false,
  transform: {
    translation: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
  },
  centerLine: [{ x: 0, y: 0 }, { x: 5_000, y: 0 }],
  thickness: 100,
};

const opening: Opening = {
  id: "00000000-0000-4000-8000-000000000020",
  name: "North window",
  tags: ["facade"],
  wallId: wall.id,
  kind: "window",
  distanceAlongWall: 2_500,
  width: 1_200,
  height: 1_200,
  sillHeight: 900,
};

afterEach(() => cleanup());

function renderInspector(options: {
  readonly selected?: Opening;
  readonly selectedWall?: Wall;
  readonly selectedLayer?: PlanLayer;
  readonly apply?: (
    before: Opening,
    after: Opening | null,
  ) => Promise<void>;
} = {}) {
  const onApplyOpeningPatch = vi.fn(options.apply ?? (async (
    before: Opening,
    after: Opening | null,
  ) => {
    void before;
    void after;
  }));
  const onError = vi.fn();
  render(
    <OpeningInspector
      opening={options.selected ?? opening}
      wall={options.selectedWall ?? wall}
      layer={options.selectedLayer ?? layer}
      onApplyOpeningPatch={onApplyOpeningPatch}
      onError={onError}
    />,
  );
  return { onApplyOpeningPatch, onError };
}

describe("OpeningInspector", () => {
  it("publishes one complete record patch and forces a submitted Door sill to zero", async () => {
    const user = userEvent.setup();
    const { onApplyOpeningPatch } = renderInspector();

    fireEvent.change(screen.getByLabelText("门窗名称"), {
      target: { value: "  Main entrance  " },
    });
    await user.selectOptions(screen.getByRole("combobox", { name: "门窗类型" }), "door");
    fireEvent.change(screen.getByLabelText("宽度 (mm)"), {
      target: { value: "1 m" },
    });
    fireEvent.change(screen.getByLabelText("高度 (mm)"), {
      target: { value: "2.2 m" },
    });
    fireEvent.change(screen.getByLabelText("窗台高度 (mm)"), {
      target: { value: "777" },
    });
    fireEvent.change(screen.getByLabelText("沿墙距离 (mm)"), {
      target: { value: "2.75 m" },
    });
    await user.click(screen.getByRole("button", { name: "应用门窗" }));

    await waitFor(() => expect(onApplyOpeningPatch).toHaveBeenCalledOnce());
    expect(onApplyOpeningPatch).toHaveBeenCalledWith(opening, {
      ...opening,
      name: "Main entrance",
      kind: "door",
      distanceAlongWall: 2_750,
      width: 1_000,
      height: 2_200,
      sillHeight: 0,
    });
    expect(screen.getByText(wall.name)).toBeVisible();
    expect(screen.getByText(wall.id)).toBeVisible();
  });

  it.each([
    ["宽度 (mm)", "0"],
    ["高度 (mm)", "not-a-length"],
    ["窗台高度 (mm)", "-1"],
    ["沿墙距离 (mm)", "Infinity"],
  ])("keeps durable state unchanged for invalid %s input %s", async (label, value) => {
    const user = userEvent.setup();
    const { onApplyOpeningPatch } = renderInspector();
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

    await user.click(screen.getByRole("button", { name: "应用门窗" }));

    expect(screen.getByRole("alert")).toBeVisible();
    expect(onApplyOpeningPatch).not.toHaveBeenCalled();
  });

  it("deletes one editable opening through a before-to-null record patch", async () => {
    const user = userEvent.setup();
    const { onApplyOpeningPatch } = renderInspector();

    await user.click(screen.getByRole("button", { name: "删除门窗" }));

    await waitFor(() => expect(onApplyOpeningPatch).toHaveBeenCalledOnce());
    expect(onApplyOpeningPatch).toHaveBeenCalledWith(opening, null);
  });

  it.each([
    ["wall", { ...wall, locked: true }, layer],
    ["layer", wall, { ...layer, locked: true }],
  ] as const)("keeps a %s-locked opening readable but disables every mutation", (
    _kind,
    selectedWall,
    selectedLayer,
  ) => {
    const { onApplyOpeningPatch } = renderInspector({
      selectedWall,
      selectedLayer,
    });

    expect(screen.getByRole("heading", { name: "门窗" })).toBeVisible();
    expect(screen.getByLabelText("门窗名称")).toHaveAttribute("readonly");
    expect(screen.getByRole("combobox", { name: "门窗类型" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "应用门窗" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "删除门窗" })).toBeDisabled();
    expect(onApplyOpeningPatch).not.toHaveBeenCalled();
  });
});
