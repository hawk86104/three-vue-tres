// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type {
  ProjectExportPreset,
  ProjectExportProgress,
} from "@aethertwin/exporter";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageSwitcher } from "../../i18n/language-switcher";
import { StudioI18nTestProvider } from "../../i18n/test-support";
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
  return {
    ...render(
      <StudioI18nTestProvider locale="en">
        <ExportPanel {...props} />
      </StudioI18nTestProvider>,
    ),
    props,
  };
}

afterEach(cleanup);

describe("ExportPanel", () => {
  it("uses the current locale for export labels without changing its stable preset", () => {
    const props: ExportPanelProps = {
      state: idleState,
      ultraHdDisabledReason: null,
      textureIssueAssetIds: [],
      onPresetChange: vi.fn(),
      onStart: vi.fn(),
      onCancel: vi.fn(),
      onClose: vi.fn(),
      onExportAgain: vi.fn(),
    };
    const view = render(
      <StudioI18nTestProvider>
        <ExportPanel {...props} />
      </StudioI18nTestProvider>,
    );

    expect(screen.getByRole("complementary", { name: "导出 PNG" })).toBeVisible();
    expect(screen.getByRole("button", { name: "导出 PNG" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "PNG 分辨率" }))
      .toHaveValue("full-hd");

    view.unmount();
    render(
      <StudioI18nTestProvider locale="en">
        <ExportPanel {...props} />
      </StudioI18nTestProvider>,
    );
    expect(screen.getByRole("complementary", { name: "Export PNG" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "PNG resolution" }))
      .toHaveValue("full-hd");
  });

  it("offers exactly the two closed presets and explains why 4K is unavailable", () => {
    const { props } = renderPanel({
      ultraHdDisabledReason: "texture-limits",
    });
    const select = screen.getByRole("combobox", { name: "PNG resolution" });
    const options = within(select).getAllByRole("option");

    expect(options).toHaveLength(2);
    expect(options.map((option) => option.getAttribute("value"))).toEqual([
      "full-hd",
      "ultra-hd",
    ]);
    expect(options[0]).toHaveTextContent("Full HD (1920 × 1080)");
    expect(options[1]).toHaveTextContent("Ultra HD (3840 × 2160)");
    expect(options[1]).toBeDisabled();
    expect(screen.getByText("Current graphics capabilities do not support Ultra HD export."))
      .toBeVisible();

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
    fireEvent.click(screen.getByRole("button", { name: "Cancel export" }));
    expect(props.onCancel).toHaveBeenCalledOnce();
    expect(props.onStart).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("renders only safe relative result fields and desktop-gated result actions", () => {
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
    expect(panel).toHaveTextContent("3840 × 2160");
    expect(panel).toHaveTextContent("12345678");
    expect(panel).toHaveTextContent("a".repeat(64));
    expect(within(panel).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Open exported file",
      "Show in folder",
      "Export again",
      "Close",
    ]);
    expect(within(panel).getByRole("button", { name: "Open exported file" })).toBeDisabled();
    expect(within(panel).getByRole("button", { name: "Show in folder" })).toBeDisabled();
    expect(panel).not.toHaveTextContent(/(?:[A-Za-z]:\\|Save As|share|clipboard)/i);

    fireEvent.click(within(panel).getByRole("button", { name: "Export again" }));
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
      },
    });
    const panel = screen.getByRole("complementary", { name: "Export PNG" });

    expect(panel).toHaveTextContent("The operation could not be completed. Try again.");
    expect(panel.querySelector("[data-error-code='EXPORT_RENDER_FAILED']"))
      .toBeInTheDocument();
    expect(within(panel).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Export again",
      "Close",
    ]);
    expect(within(panel).queryByRole("button", { name: "Export PNG" }))
      .not.toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "Export again" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Close" }));
    expect(props.onExportAgain).toHaveBeenCalledOnce();
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("localizes successful desktop result actions live and disables them when unavailable", () => {
    const state: StudioExportState = {
      kind: "succeeded",
      preset: "full-hd",
      result: {
        preset: "full-hd",
        relativePath: "exports/showroom-1920x1080.png",
        width: 1920,
        height: 1080,
        byteSize: 4321,
        sha256: "b".repeat(64),
      },
    };
    const onOpenResult = vi.fn();
    const onRevealResult = vi.fn();
    const props: ExportPanelProps = {
      state,
      ultraHdDisabledReason: null,
      textureIssueAssetIds: [],
      onPresetChange: vi.fn(),
      onStart: vi.fn(),
      onCancel: vi.fn(),
      onClose: vi.fn(),
      onExportAgain: vi.fn(),
      resultActions: { onOpenResult, onRevealResult },
    };
    const view = render(
      <StudioI18nTestProvider>
        <LanguageSwitcher />
        <ExportPanel {...props} />
      </StudioI18nTestProvider>,
    );

    const panel = screen.getByRole("complementary", { name: "导出 PNG" });
    expect(within(panel).getByRole("button", { name: "打开导出文件" })).toBeEnabled();
    expect(within(panel).getByRole("button", { name: "在文件夹中显示" })).toBeEnabled();
    fireEvent.click(within(panel).getByRole("button", { name: "打开导出文件" }));
    fireEvent.click(within(panel).getByRole("button", { name: "在文件夹中显示" }));
    expect(onOpenResult).toHaveBeenCalledOnce();
    expect(onRevealResult).toHaveBeenCalledOnce();

    fireEvent.change(screen.getByLabelText("界面语言"), { target: { value: "en" } });
    const englishPanel = screen.getByRole("complementary", { name: "Export PNG" });
    expect(within(englishPanel).getByRole("button", { name: "Open exported file" })).toBeEnabled();
    expect(within(englishPanel).getByRole("button", { name: "Show in folder" })).toBeEnabled();
    expect(englishPanel).toHaveTextContent("exports/showroom-1920x1080.png");
    expect(englishPanel).toHaveTextContent("b".repeat(64));

    view.unmount();
    renderPanel({ state });
    expect(screen.getByRole("button", { name: "Open exported file" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Show in folder" })).toBeDisabled();
    expect(screen.getByText("Export file actions are available only in the desktop app."))
      .toBeVisible();
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
