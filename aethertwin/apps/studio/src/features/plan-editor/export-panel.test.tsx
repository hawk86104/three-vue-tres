// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type {
  ProjectExportPreset,
  ProjectExportProgress,
} from "@aethertwin/exporter";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ExportPanel,
  type ExportPanelProps,
  type StudioExportState,
} from "./export-panel";

const idleState: StudioExportState = { kind: "idle", preset: "full-hd" };

function renderPanel(overrides: Partial<ExportPanelProps> = {}) {
  const props: ExportPanelProps = {
    state: idleState,
    ultraHdDisabledReason: null,
    textureIssueAssetIds: [],
    onPresetChange: vi.fn(),
    onStart: vi.fn(),
    onCancel: vi.fn(),
    onClose: vi.fn(),
    onExportAgain: vi.fn(),
    ...overrides,
  };
  return { ...render(<ExportPanel {...props} />), props };
}

afterEach(cleanup);

describe("ExportPanel", () => {
  it("offers exactly the two closed presets and explains why 4K is unavailable", () => {
    const { props } = renderPanel({
      ultraHdDisabledReason:
        "Ultra HD requires maxTextureSize 3840 and maxRenderbufferSize 3840; current limits are 2048 and 4096.",
    });
    const select = screen.getByRole("combobox", { name: "PNG resolution" });
    const options = within(select).getAllByRole("option");

    expect(options).toHaveLength(2);
    expect(options.map((option) => option.getAttribute("value"))).toEqual([
      "full-hd",
      "ultra-hd",
    ]);
    expect(options[0]).toHaveTextContent("Full HD - 1920 x 1080");
    expect(options[1]).toHaveTextContent("Ultra HD - 3840 x 2160");
    expect(options[1]).toBeDisabled();
    expect(screen.getByText(/maxTextureSize 3840/)).toBeVisible();
    expect(screen.getByText(/current limits are 2048 and 4096/)).toBeVisible();

    fireEvent.change(select, { target: { value: "ultra-hd" } });
    expect(props.onPresetChange).not.toHaveBeenCalled();
  });

  it.each([
    [{ phase: "preparing-textures", sentBytes: null, totalBytes: null }, "Preparing textures"],
    [{ phase: "rendering", sentBytes: null, totalBytes: null }, "Rendering"],
    [{ phase: "uploading", sentBytes: 1_048_576, totalBytes: 8_294_400 }, "Uploading 1048576 / 8294400 bytes"],
    [{ phase: "encoding-publishing", sentBytes: null, totalBytes: null }, "Encoding and publishing"],
  ] satisfies readonly (readonly [ProjectExportProgress, string])[])(
    "reports truthful phase %# without inventing a percentage",
    (progress, expected) => {
      renderPanel({ state: { kind: "running", preset: "full-hd", progress } });
      expect(screen.getByRole("status")).toHaveTextContent(expected);
      expect(screen.getByRole("status")).not.toHaveTextContent(/%/);
    },
  );

  it("locks preset/start/close while running and exposes only cancellation", () => {
    const progress: ProjectExportProgress = {
      phase: "rendering",
      sentBytes: null,
      totalBytes: null,
    };
    const { props } = renderPanel({
      state: { kind: "running", preset: "full-hd", progress },
    });

    expect(screen.getByRole("combobox", { name: "PNG resolution" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Export PNG" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onCancel).toHaveBeenCalledOnce();
    expect(props.onStart).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("renders only safe relative result fields and the two supported actions", () => {
    const state: StudioExportState = {
      kind: "succeeded",
      preset: "ultra-hd",
      result: {
        preset: "ultra-hd",
        relativePath: "exports/showroom-3840x2160.png",
        width: 3840,
        height: 2160,
        byteSize: 12_345_678,
        sha256: "a".repeat(64),
      },
    };
    const { props } = renderPanel({ state });
    const panel = screen.getByRole("complementary", { name: "Export PNG" });

    expect(panel).toHaveTextContent("exports/showroom-3840x2160.png");
    expect(panel).toHaveTextContent("3840 x 2160");
    expect(panel).toHaveTextContent("12345678");
    expect(panel).toHaveTextContent("a".repeat(64));
    expect(within(panel).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Export Again",
      "Close",
    ]);
    expect(panel).not.toHaveTextContent(/(?:[A-Za-z]:\\|Open Folder|Save As|share|clipboard)/i);

    fireEvent.click(within(panel).getByRole("button", { name: "Export Again" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Close" }));
    expect(props.onExportAgain).toHaveBeenCalledOnce();
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("renders a safe failure and offers only retry or close", () => {
    const { props } = renderPanel({
      state: {
        kind: "failed",
        preset: "full-hd",
        code: "EXPORT_RENDER_FAILED",
        message: "The export could not be rendered.",
      },
    });
    const panel = screen.getByRole("complementary", { name: "Export PNG" });

    expect(panel).toHaveTextContent("EXPORT_RENDER_FAILED");
    expect(panel).toHaveTextContent("The export could not be rendered.");
    expect(within(panel).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Export Again",
      "Close",
    ]);
    expect(within(panel).queryByRole("button", { name: "Export PNG" }))
      .not.toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "Export Again" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Close" }));
    expect(props.onExportAgain).toHaveBeenCalledOnce();
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("sorts blocking texture IDs and never starts while they are present", () => {
    const onStart = vi.fn();
    renderPanel({
      textureIssueAssetIds: ["texture-z", "texture-a", "texture-m"],
      onStart,
    });

    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "texture-a",
      "texture-m",
      "texture-z",
    ]);
    expect(screen.getByRole("button", { name: "Export PNG" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Export PNG" }));
    expect(onStart).not.toHaveBeenCalled();
  });

  it("changes presets and starts only from the idle surface", () => {
    const onPresetChange = vi.fn<(preset: ProjectExportPreset) => void>();
    const onStart = vi.fn();
    renderPanel({ onPresetChange, onStart });

    fireEvent.change(screen.getByRole("combobox", { name: "PNG resolution" }), {
      target: { value: "ultra-hd" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Export PNG" }));
    expect(onPresetChange).toHaveBeenCalledWith("ultra-hd");
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("publishes a stable overlay class without entering the scene layout flow", () => {
    renderPanel();

    expect(screen.getByRole("complementary", { name: "Export PNG" }))
      .toHaveClass("studio-export-panel");
  });
});
