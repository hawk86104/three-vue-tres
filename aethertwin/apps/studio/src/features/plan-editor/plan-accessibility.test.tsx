// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudioI18nTestProvider } from "../../i18n/test-support";
import { PlanAccessibility } from "./plan-accessibility";

describe("PlanAccessibility localization", () => {
  it("localizes the empty keyboard help", () => {
    const snapshot = { project: { profile: "showroom", floors: [{ id: "floor-1", layers: [{ id: "layer-1", visible: true, locked: false }] }], entities: [], planReferences: [], openings: [], routeNetworks: [] } } as never;
    const sessionStore = { getState: () => ({ roomRecognition: null, activeTool: "select" }) } as never;
    render(<StudioI18nTestProvider locale="en"><PlanAccessibility snapshot={snapshot} activeFloorId="floor-1" selectedIds={new Set()} sessionStore={sessionStore} controller={{ createAt: vi.fn() } as never} /></StudioI18nTestProvider>);
    expect(screen.getByRole("region", { name: "Accessible object list" })).toHaveTextContent("There are no visible objects on this Floor.");
  });

  it("uses catalogue names for semantic fixture and POI accessibility text", () => {
    const snapshot = { project: { profile: "showroom", floors: [{ id: "floor-1", layers: [{ id: "layer-1", visible: true, locked: false }] }], entities: [{ id: "fixture-1", name: "Authored display", type: "fixture", kind: "display-case", floorId: "floor-1", layerId: "layer-1", locked: false, size: { width: 1200, height: 600 } }, { id: "poi-1", name: "Authored hot spot", type: "poi", kind: "product-hotspot", floorId: "floor-1", layerId: "layer-1", locked: false }], planReferences: [], openings: [], routeNetworks: [] } } as never;
    const sessionStore = { getState: () => ({ roomRecognition: null, activeTool: "select", setSelection: vi.fn() }) } as never;
    render(<StudioI18nTestProvider locale="en"><PlanAccessibility snapshot={snapshot} activeFloorId="floor-1" selectedIds={new Set()} sessionStore={sessionStore} controller={{ createAt: vi.fn() } as never} /></StudioI18nTestProvider>);
    expect(screen.getByText(/Display case/u)).toBeVisible();
    expect(screen.getByText(/Authored display/u)).toBeVisible();
    expect(screen.getByText(/Product hotspot · Authored hot spot/u)).toBeVisible();
  });
});
