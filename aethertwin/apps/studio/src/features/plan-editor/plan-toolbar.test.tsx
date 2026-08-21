// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanToolbar } from "./plan-toolbar";
import { StudioI18nTestProvider } from "../../i18n/test-support";

type ToolbarProps = ComponentProps<typeof PlanToolbar> & {
  readonly exportAction: {
    readonly disabled: boolean;
    readonly reason: string | null;
    readonly active: boolean;
  };
  readonly onExport: (initiator: HTMLButtonElement) => void;
};

function toolbar(overrides: Partial<ToolbarProps> = {}) {
  const props: ToolbarProps = {
    profile: "showroom",
    activeTool: "select",
    viewMode: "3d",
    rendererStatus: "ready",
    rendererError: null,
    exportAction: { disabled: false, reason: null, active: false },
    onRendererRetry: vi.fn(),
    onViewModeChange: vi.fn(),
    onFrameSelection: vi.fn(),
    onFrameRoute: vi.fn(),
    onToolChange: vi.fn(),
    onExport: vi.fn(),
    ...overrides,
  };
  return <StudioI18nTestProvider locale="en"><PlanToolbar {...props} /></StudioI18nTestProvider>;
}

afterEach(cleanup);

describe("PlanToolbar localization", () => {
  it("uses stable action IDs while presenting the English catalogue", () => {
    render(toolbar({ onRecognizeRooms: vi.fn() }));

    expect(screen.getByRole("group", { name: "Preview" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Export PNG" }))
      .toHaveAttribute("data-action", "export");
    expect(screen.getByRole("button", { name: "Product hotspot" }))
      .toHaveAttribute("data-tool", "product-hotspot");
    expect(screen.getByRole("button", { name: "Room" })).toHaveAttribute("data-action", "room");
    expect(screen.getByRole("button", { name: "Recognize rooms" })).toHaveAttribute("data-action", "recognize-rooms");
  });
});

describe("PlanToolbar Showroom Export action", () => {
  it("renders Export last in the exact Preview order and never renders it for Market", () => {
    const { rerender } = render(toolbar());
    const preview = screen.getAllByRole("group").at(-1)!;
    expect(within(preview).getAllByRole("button").map(({ textContent }) => textContent))
      .toEqual(["2D", "3D", "Split", "Frame selection", "Frame route", "Export PNG"]);

    rerender(toolbar({ profile: "market" }));
    expect(screen.queryByRole("button", { name: "Export PNG" })).toBeNull();
  });

  it.each([
    ["2d", "ready", "Switch to 3D or Split to export."],
    ["3d", "initializing", "3D preview is not ready."],
    ["3d", "failed", "3D preview is not ready."],
    ["split", "disabled", "3D preview is not ready."],
    ["3d", "ready", "PNG export requires the desktop app."],
    ["split", "ready", "3D export capture is not current."],
    ["3d", "ready", "Another export is already running."],
  ] as const)(
    "disables Export in %s/%s and renders the exact reason once",
    (viewMode, rendererStatus, reason) => {
      render(toolbar({
        viewMode,
        rendererStatus,
        exportAction: { disabled: true, reason, active: reason.includes("already running") },
      }));
      const button = screen.getByRole("button", { name: "Export PNG" });
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(reason);
      expect(screen.getAllByText(reason)).toHaveLength(1);
    },
  );

  it.each(["3d", "split"] as const)(
    "enables Export in ready %s, invokes the callback with its initiator, and retains focus",
    async (viewMode) => {
      const onExport = vi.fn();
      const user = userEvent.setup();
      render(toolbar({ viewMode, onExport }));
      const button = screen.getByRole("button", { name: "Export PNG" });

      expect(button).toBeEnabled();
      button.focus();
      await user.click(button);

      expect(onExport).toHaveBeenCalledOnce();
      expect(onExport).toHaveBeenCalledWith(button);
      expect(button).toHaveFocus();
      expect(button).not.toHaveAttribute("aria-describedby");
    },
  );

  it("does not invoke a dormant callback when Export is disabled", async () => {
    const onExport = vi.fn();
    const user = userEvent.setup();
    render(toolbar({
      exportAction: {
        disabled: true,
        reason: "Another export is already running.",
        active: true,
      },
      onExport,
    }));

    await user.click(screen.getByRole("button", { name: "Export PNG" }));
    expect(onExport).not.toHaveBeenCalled();
  });
});
