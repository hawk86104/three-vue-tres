// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type { PlanLayer, PlanReference } from "@aethertwin/core-model";
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
import { ReferenceInspector } from "./reference-inspector";

const layer: PlanLayer = {
  id: "00000000-0000-4000-8000-000000000002",
  name: "Reference",
  tags: [],
  visible: true,
  locked: false,
};

const reference: PlanReference = {
  id: "00000000-0000-4000-8000-000000000010",
  name: "Ground floor",
  tags: ["imported"],
  floorId: "00000000-0000-4000-8000-000000000001",
  layerId: layer.id,
  assetId: "00000000-0000-4000-8000-000000000020",
  intrinsicSize: { width: 640, height: 480 },
  transform: {
    translation: { x: 100, y: -50 },
    rotation: Math.PI / 4,
    scale: { x: 2, y: 2 },
  },
  opacity: 0.65,
  locked: false,
  calibration: null,
};

afterEach(() => cleanup());

function renderInspector(options: {
  readonly selected?: PlanReference;
  readonly selectedLayer?: PlanLayer;
  readonly apply?: (
    before: PlanReference,
    after: PlanReference | null,
  ) => Promise<void>;
} = {}) {
  const onApplyPlanReferencePatch = vi.fn(options.apply ?? (async (
    before: PlanReference,
    after: PlanReference | null,
  ) => {
    void before;
    void after;
  }));
  const onError = vi.fn();
  render(
    <ReferenceInspector
      reference={options.selected ?? reference}
      layer={options.selectedLayer ?? layer}
      onApplyPlanReferencePatch={onApplyPlanReferencePatch}
      onError={onError}
    />,
  );
  return { onApplyPlanReferencePatch, onError };
}

describe("ReferenceInspector", () => {
  it("publishes one exact patch for sanitized metadata and finite placement fields", async () => {
    const user = userEvent.setup();
    const { onApplyPlanReferencePatch } = renderInspector();

    fireEvent.change(screen.getByLabelText("\u5e73\u9762\u53c2\u8003\u540d\u79f0"), {
      target: { value: "  North concourse  " },
    });
    fireEvent.change(screen.getByLabelText("\u5e73\u9762\u53c2\u8003\u6807\u7b7e"), {
      target: { value: " north, surveyed, north,  " },
    });
    fireEvent.change(screen.getByLabelText("\u900f\u660e\u5ea6"), {
      target: { value: "0.4" },
    });
    fireEvent.change(screen.getByLabelText("X (mm)"), {
      target: { value: "1.25 m" },
    });
    fireEvent.change(screen.getByLabelText("Y (mm)"), {
      target: { value: "-375" },
    });
    fireEvent.change(screen.getByLabelText("\u65cb\u8f6c (\u00b0)"), {
      target: { value: "30" },
    });
    await user.click(screen.getByRole("button", {
      name: "\u5e94\u7528\u5e73\u9762\u53c2\u8003",
    }));

    await waitFor(() => expect(onApplyPlanReferencePatch).toHaveBeenCalledOnce());
    expect(onApplyPlanReferencePatch).toHaveBeenCalledWith(reference, {
      ...reference,
      name: "North concourse",
      tags: ["north", "surveyed"],
      opacity: 0.4,
      transform: {
        ...reference.transform,
        translation: { x: 1250, y: -375 },
        rotation: Math.PI / 6,
      },
    });
  });

  it.each([
    ["\u900f\u660e\u5ea6", "1.1"],
    ["\u900f\u660e\u5ea6", "-0.1"],
    ["\u900f\u660e\u5ea6", "NaN"],
    ["X (mm)", "Infinity"],
    ["Y (mm)", "not-a-length"],
    ["\u65cb\u8f6c (\u00b0)", "-Infinity"],
  ])("keeps durable state unchanged for invalid %s input %s", async (label, value) => {
    const user = userEvent.setup();
    const { onApplyPlanReferencePatch } = renderInspector();
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

    await user.click(screen.getByRole("button", {
      name: "\u5e94\u7528\u5e73\u9762\u53c2\u8003",
    }));

    expect(screen.getByRole("alert")).toBeVisible();
    expect(onApplyPlanReferencePatch).not.toHaveBeenCalled();
  });

  it("deletes an unlocked reference through before-to-null patching", async () => {
    const user = userEvent.setup();
    const { onApplyPlanReferencePatch } = renderInspector();

    await user.click(screen.getByRole("button", {
      name: "\u5220\u9664\u5e73\u9762\u53c2\u8003",
    }));

    await waitFor(() => expect(onApplyPlanReferencePatch).toHaveBeenCalledOnce());
    expect(onApplyPlanReferencePatch).toHaveBeenCalledWith(reference, null);
  });

  it("keeps a locked reference readable and focusable while exposing only exact unlock", async () => {
    const user = userEvent.setup();
    const locked = { ...reference, locked: true };
    const { onApplyPlanReferencePatch } = renderInspector({ selected: locked });

    expect(screen.getByRole("heading", { name: "\u5e73\u9762\u53c2\u8003" })).toBeVisible();
    expect(screen.getByText("\u5df2\u9501\u5b9a")).toBeVisible();
    const name = screen.getByLabelText("\u5e73\u9762\u53c2\u8003\u540d\u79f0");
    expect(name).toHaveValue(locked.name);
    expect(name).toHaveAttribute("readonly");
    name.focus();
    expect(name).toHaveFocus();
    for (const label of ["\u5e73\u9762\u53c2\u8003\u6807\u7b7e", "\u900f\u660e\u5ea6", "X (mm)", "Y (mm)", "\u65cb\u8f6c (\u00b0)"]) {
      expect(screen.getByLabelText(label)).toHaveAttribute("readonly");
    }

    expect(screen.getByRole("button", {
      name: "\u5e94\u7528\u5e73\u9762\u53c2\u8003",
    })).toBeDisabled();
    expect(screen.getByRole("button", {
      name: "\u5220\u9664\u5e73\u9762\u53c2\u8003",
    })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", {
      name: "\u9501\u5b9a\u5e73\u9762\u53c2\u8003",
    }));

    await waitFor(() => expect(onApplyPlanReferencePatch).toHaveBeenCalledOnce());
    expect(onApplyPlanReferencePatch).toHaveBeenCalledWith(locked, {
      ...locked,
      locked: false,
    });
  });

  it("disables every mutation, including unlocking and deletion, when the layer is locked", () => {
    const lockedLayer = { ...layer, locked: true };
    const { onApplyPlanReferencePatch } = renderInspector({
      selectedLayer: lockedLayer,
    });

    expect(screen.getByText("\u56fe\u5c42\u5df2\u9501\u5b9a")).toBeVisible();
    expect(screen.getByLabelText("\u5e73\u9762\u53c2\u8003\u540d\u79f0"))
      .toHaveAttribute("readonly");

    for (const label of ["\u5e73\u9762\u53c2\u8003\u6807\u7b7e", "\u900f\u660e\u5ea6", "X (mm)", "Y (mm)", "\u65cb\u8f6c (\u00b0)"]) {
      expect(screen.getByLabelText(label)).toHaveAttribute("readonly");
    }
    expect(screen.getByRole("checkbox", {
      name: "\u9501\u5b9a\u5e73\u9762\u53c2\u8003",
    })).toBeDisabled();
    expect(screen.getByRole("button", {
      name: "\u5e94\u7528\u5e73\u9762\u53c2\u8003",
    })).toBeDisabled();
    expect(screen.getByRole("button", {
      name: "\u5220\u9664\u5e73\u9762\u53c2\u8003",
    })).toBeDisabled();
    expect(onApplyPlanReferencePatch).not.toHaveBeenCalled();
  });

  it("coalesces duplicate apply clicks while one reference patch is pending", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    const { onApplyPlanReferencePatch } = renderInspector({
      apply: async () => pending,
    });
    fireEvent.change(screen.getByLabelText("\u5e73\u9762\u53c2\u8003\u540d\u79f0"), {
      target: { value: "Pending edit" },
    });
    const apply = screen.getByRole("button", {
      name: "\u5e94\u7528\u5e73\u9762\u53c2\u8003",
    });

    act(() => {
      apply.click();
      apply.click();
    });

    expect(onApplyPlanReferencePatch).toHaveBeenCalledOnce();
    expect(apply).toBeDisabled();
    release();
    await waitFor(() => expect(apply).toBeEnabled());
  });
});
