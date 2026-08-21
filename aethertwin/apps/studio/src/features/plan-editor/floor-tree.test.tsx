// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudioI18nTestProvider } from "../../i18n/test-support";
import { FloorTree } from "./floor-tree";

describe("FloorTree localization", () => {
  it("localizes controls without translating authored floor and layer names", () => {
    const snapshot = { project: { name: "North Gallery", floors: [{ id: "floor-1", name: "Level Uno", layers: [{ id: "layer-1", name: "Sketch α", visible: true, locked: false }] }], entities: [], planReferences: [], routeNetworks: [] } } as never;
    render(<StudioI18nTestProvider locale="en"><FloorTree snapshot={snapshot} activeFloorId="floor-1" selectedIds={new Set()} onFloorSelect={vi.fn()} onLayerSelect={vi.fn()} onEntitySelect={vi.fn()} onApplyFloorPatch={vi.fn()} /></StudioI18nTestProvider>);
    expect(screen.getByRole("tree", { name: "Floors and spaces" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Select floor: Level Uno" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Select layer: Sketch α" })).toBeVisible();
  });

  it("does not expose a silent reference action without its live handler", () => {
    const snapshot = { project: { name: "North Gallery", floors: [{ id: "floor-1", name: "Level Uno", layers: [{ id: "layer-1", name: "Sketch α", visible: true, locked: false }] }], entities: [], planReferences: [{ id: "ref-1", name: "Plan.pdf", floorId: "floor-1", layerId: "layer-1", locked: false }], routeNetworks: [] } } as never;
    render(<StudioI18nTestProvider locale="en"><FloorTree snapshot={snapshot} activeFloorId="floor-1" selectedIds={new Set()} onFloorSelect={vi.fn()} onLayerSelect={vi.fn()} onEntitySelect={vi.fn()} onApplyFloorPatch={vi.fn()} /></StudioI18nTestProvider>);
    expect(screen.queryByRole("button", { name: "Select plan reference: Plan.pdf" })).not.toBeInTheDocument();
  });

  it.each([
    ["en", ["Room", "Space units"]],
    ["zh-CN", ["房间", "空间单元"]],
  ] as const)("uses the space-unit kind map in %s tree labels", (locale, labels) => {
    const entities = ["room", "shop", "booth", "exhibition", "service", "restricted"].map((kind, index) => ({ id: `space-${kind}`, name: `Authored ${kind}`, type: "space-unit", kind, floorId: "floor-1", layerId: "layer-1", locked: false, transform: {} }));
    const snapshot = { project: { name: "North Gallery", floors: [{ id: "floor-1", name: "Level Uno", layers: [{ id: "layer-1", name: "Sketch α", visible: true, locked: false }] }], entities, planReferences: [], routeNetworks: [] } } as never;
    const { container } = render(<StudioI18nTestProvider locale={locale}><FloorTree snapshot={snapshot} activeFloorId="floor-1" selectedIds={new Set()} onFloorSelect={vi.fn()} onLayerSelect={vi.fn()} onEntitySelect={vi.fn()} onApplyFloorPatch={vi.fn()} /></StudioI18nTestProvider>);
    expect(container).toHaveTextContent(labels[0]);
    expect(container).toHaveTextContent(labels[1]);
    expect(container).toHaveTextContent("Authored restricted");
  });
});
