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
});
