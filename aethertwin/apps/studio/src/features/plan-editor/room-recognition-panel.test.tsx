// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoomRecognitionState } from "./editor-session";
import { RoomRecognitionPanel } from "./room-recognition-panel";

afterEach(cleanup);

function recognitionState(
  overrides: Partial<RoomRecognitionState> = {},
): RoomRecognitionState {
  return {
    toleranceMm: 5,
    fingerprint: "fingerprint-a",
    candidates: [
      {
        key: "candidate-a",
        footprint: [
          { x: 0, y: 0 },
          { x: 1_000, y: 0 },
          { x: 1_000, y: 1_000 },
          { x: 0, y: 1_000 },
        ],
        wallIds: ["wall-a", "wall-b", "wall-c", "wall-d"],
        area: 1_000_000,
        perimeter: 4_000,
      },
      {
        key: "candidate-b",
        footprint: [
          { x: 2_000, y: 0 },
          { x: 3_000, y: 0 },
          { x: 3_000, y: 1_000 },
          { x: 2_000, y: 1_000 },
        ],
        wallIds: ["wall-e", "wall-f", "wall-g", "wall-h"],
        area: 1_000_000,
        perimeter: 4_000,
      },
    ],
    selectedCandidateKey: "candidate-a",
    diagnostics: [
      { code: "DANGLING_EDGE", wallIds: ["wall-z"] },
      { code: "ZERO_LENGTH_SEGMENT", wallIds: ["wall-y"], segmentIndices: [0] },
    ],
    stale: false,
    ...overrides,
  };
}

function renderPanel(
  options: {
    readonly state?: RoomRecognitionState;
    readonly representedKeys?: ReadonlySet<string>;
    readonly canReplaceSelectedRoom?: boolean;
    readonly busy?: boolean;
  } = {},
) {
  const callbacks = {
    onToleranceChange: vi.fn(),
    onRecognize: vi.fn(),
    onSelectCandidate: vi.fn(),
    onConfirmOne: vi.fn(),
    onConfirmAll: vi.fn(),
    onReplaceSelectedRoom: vi.fn(),
    onClose: vi.fn(),
  };
  const result = render(
    <RoomRecognitionPanel
      state={options.state ?? recognitionState()}
      representedKeys={options.representedKeys ?? new Set(["candidate-a"])}
      canReplaceSelectedRoom={options.canReplaceSelectedRoom ?? false}
      busy={options.busy ?? false}
      {...callbacks}
    />,
  );
  return { ...result, ...callbacks };
}

describe("RoomRecognitionPanel", () => {
  it("shows deterministic candidate metrics, represented state, and diagnostics", () => {
    renderPanel();

    const panel = screen.getByRole("region", { name: "房间识别" });
    const candidates = within(panel).getAllByRole("button", {
      name: /选择房间候选/,
    });
    expect(candidates.map((candidate) => candidate.getAttribute("aria-label"))).toEqual([
      "选择房间候选 1",
      "选择房间候选 2",
    ]);
    expect(candidates[0]).toHaveAttribute("aria-pressed", "true");
    expect(candidates[1]).toHaveAttribute("aria-pressed", "false");

    const list = within(panel).getByRole("list", { name: "房间候选" });
    expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent(
      "候选 1 · 1 m² · 4 m · 4 面墙 · 已存在",
    );
    expect(within(list).getAllByRole("listitem")[1]).toHaveTextContent(
      "候选 2 · 1 m² · 4 m · 4 面墙 · 待确认",
    );
    expect(within(panel).getAllByRole("list", { name: "识别诊断" })[0]).toHaveTextContent(
      "DANGLING_EDGE",
    );
    expect(within(panel).getAllByRole("list", { name: "识别诊断" })[0]).toHaveTextContent(
      "ZERO_LENGTH_SEGMENT",
    );
  });

  it("validates the 0.1 through 100 millimetre range before recognition", async () => {
    const user = userEvent.setup();
    const { onToleranceChange, onRecognize } = renderPanel();
    const input = screen.getByRole("spinbutton", { name: "识别容差（毫米）" });
    const recognize = screen.getByRole("button", { name: "重新识别" });

    expect(input).toHaveValue(5);
    await user.clear(input);
    await user.type(input, "0.09");
    expect(screen.getByRole("alert")).toHaveTextContent("容差必须在 0.1 到 100 毫米之间");
    expect(recognize).toBeDisabled();
    expect(onToleranceChange).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, "10");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(recognize).toBeEnabled();
    expect(onToleranceChange).toHaveBeenLastCalledWith(10);

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRecognize).toHaveBeenCalledOnce();
  });

  it("exposes keyboard-operable selection, confirmation, replacement, and close controls", async () => {
    const user = userEvent.setup();
    const {
      onSelectCandidate,
      onConfirmOne,
      onConfirmAll,
      onReplaceSelectedRoom,
      onClose,
    } = renderPanel({
      state: recognitionState({ selectedCandidateKey: "candidate-b" }),
      canReplaceSelectedRoom: true,
    });

    const candidate = screen.getByRole("button", { name: "选择房间候选 1" });
    candidate.focus();
    await user.keyboard("{Enter}");
    expect(onSelectCandidate).toHaveBeenCalledWith("candidate-a");

    await user.click(screen.getByRole("button", { name: "确认当前候选" }));
    await user.click(screen.getByRole("button", { name: "确认全部候选" }));
    await user.click(screen.getByRole("button", { name: "用候选替换所选房间" }));
    await user.click(screen.getByRole("button", { name: "关闭房间识别" }));
    expect(onConfirmOne).toHaveBeenCalledOnce();
    expect(onConfirmAll).toHaveBeenCalledOnce();
    expect(onReplaceSelectedRoom).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("disables mutation for stale results while preserving candidates and persistence errors", () => {
    renderPanel({
      state: recognitionState({
        stale: true,
        persistenceError: "checkpoint unavailable",
      }),
      canReplaceSelectedRoom: true,
    });

    expect(screen.getByText("识别结果已过期，请重新识别。")).toBeVisible();
    expect(screen.getByText("保存失败：checkpoint unavailable")).toBeVisible();
    expect(screen.getAllByRole("button", { name: /选择房间候选/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "确认当前候选" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "确认全部候选" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "用候选替换所选房间" })).toBeDisabled();
  });
});
