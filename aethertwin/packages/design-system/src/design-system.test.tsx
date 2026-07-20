// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useRef, useState } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Badge, Button, Dialog, Field, Panel, StatusNotice } from "./index";

afterEach(cleanup);

describe("Button", () => {
  it("uses native keyboard activation and forwards its ref and attributes", async () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();

    render(
      <Button ref={ref} variant="secondary" className="extra" name="save" onClick={onClick}>
        保存
      </Button>,
    );

    await userEvent.tab();
    const button = screen.getByRole("button", { name: "保存" });
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("name", "save");
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("aether-button", "aether-button--secondary", "extra");
    expect(ref.current).toBe(button);

    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("blocks activation while disabled or busy without hiding its name", async () => {
    const onDisabledClick = vi.fn();
    const onBusyClick = vi.fn();
    render(
      <>
        <Button disabled onClick={onDisabledClick}>撤销</Button>
        <Button busy onClick={onBusyClick}>保存</Button>
      </>,
    );

    const disabled = screen.getByRole("button", { name: "撤销" });
    const busy = screen.getByRole("button", { name: "保存" });
    expect(disabled).toBeDisabled();
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");

    await userEvent.click(disabled);
    await userEvent.click(busy);
    expect(onDisabledClick).not.toHaveBeenCalled();
    expect(onBusyClick).not.toHaveBeenCalled();
  });
});

describe("Field", () => {
  it("associates label, help, error, required, and disabled semantics", () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <Field
        ref={ref}
        label="项目名称"
        helpText="使用易于识别的名称"
        error="名称已存在"
        required
        disabled
        data-source="inspector"
        defaultValue="Demo"
      />,
    );

    const input = screen.getByLabelText(/项目名称/);
    const help = screen.getByText("使用易于识别的名称");
    const error = screen.getByText("名称已存在");
    expect(input).toBeRequired();
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("data-source", "inspector");
    expect(input.getAttribute("aria-describedby")?.split(" ")).toEqual([
      help.id,
      error.id,
    ]);
    expect(ref.current).toBe(input);
  });

  it("generates unique input and message IDs for repeated fields", () => {
    render(
      <>
        <Field label="标签" helpText="提示" />
        <Field label="标签" helpText="提示" />
      </>,
    );

    const inputs = screen.getAllByLabelText("标签");
    const helpMessages = screen.getAllByText("提示");
    expect(inputs[0]?.id).toBeTruthy();
    expect(inputs[0]?.id).not.toBe(inputs[1]?.id);
    expect(helpMessages[0]?.id).not.toBe(helpMessages[1]?.id);
    expect(inputs[0]).toHaveAttribute("aria-describedby", helpMessages[0]?.id);
    expect(inputs[1]).toHaveAttribute("aria-describedby", helpMessages[1]?.id);
  });
});

function DialogHarness({ overlayTestId }: { overlayTestId?: string }) {
  const [open, setOpen] = useState(false);
  const changes = useRef<boolean[]>([]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>打开对话框</button>
      <output data-testid="changes">{changes.current.join(",")}</output>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          changes.current.push(nextOpen);
          setOpen(nextOpen);
        }}
        title="新建项目"
        description="填写项目资料"
        data-testid="dialog-content"
        {...(overlayTestId === undefined
          ? {}
          : { overlayProps: { title: overlayTestId } })}
      >
        <button type="button">确认创建</button>
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("traps focus, closes on Escape, and restores focus", async () => {
    render(<DialogHarness />);
    const opener = screen.getByRole("button", { name: "打开对话框" });
    await userEvent.click(opener);

    const dialog = screen.getByRole("dialog", { name: "新建项目" });
    expect(dialog).toHaveAccessibleDescription("填写项目资料");
    expect(screen.getByRole("button", { name: "确认创建" })).toHaveFocus();

    await userEvent.tab();
    expect(screen.getByRole("button", { name: "关闭" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "确认创建" })).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("keeps content clicks open and supports close and overlay dismissal", async () => {
    const { rerender } = render(<DialogHarness overlayTestId="overlay" />);
    await userEvent.click(screen.getByRole("button", { name: "打开对话框" }));
    await userEvent.click(screen.getByTestId("dialog-content"));
    expect(screen.getByRole("dialog")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender(<DialogHarness overlayTestId="overlay" />);
    await userEvent.click(screen.getByRole("button", { name: "打开对话框" }));
    const overlay = screen.getByTitle("overlay");
    fireEvent.pointerDown(overlay, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(overlay);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("uses unique accessible title IDs for repeated dialogs", () => {
    render(
      <>
        <Dialog open modal={false} title="项目详情" onOpenChange={() => {}}>甲</Dialog>
        <Dialog open modal={false} title="项目详情" onOpenChange={() => {}}>乙</Dialog>
      </>,
    );

    const dialogs = screen.getAllByRole("dialog", { name: "项目详情" });
    expect(dialogs).toHaveLength(2);
    expect(dialogs[0]?.getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialogs[0]?.getAttribute("aria-labelledby")).not.toBe(
      dialogs[1]?.getAttribute("aria-labelledby"),
    );
  });
});

describe("semantic surfaces and status", () => {
  it("forwards refs and native attributes from badges and panels", () => {
    const badgeRef = createRef<HTMLSpanElement>();
    const panelRef = createRef<HTMLElement>();
    render(
      <Panel ref={panelRef} aria-label="项目概要" className="wide">
        <Badge ref={badgeRef} tone="accent" data-state="selected">店铺展厅</Badge>
      </Panel>,
    );

    const panel = screen.getByRole("region", { name: "项目概要" });
    const badge = screen.getByText("店铺展厅");
    expect(panel.tagName).toBe("SECTION");
    expect(panel).toHaveClass("aether-panel", "wide");
    expect(badge.tagName).toBe("SPAN");
    expect(badge).toHaveClass("aether-badge", "aether-badge--accent");
    expect(badge).toHaveAttribute("data-state", "selected");
    expect(panelRef.current).toBe(panel);
    expect(badgeRef.current).toBe(badge);
  });

  it("announces errors assertively and saved or recovered states politely", () => {
    const errorRef = createRef<HTMLDivElement>();
    render(
      <>
        <StatusNotice ref={errorRef} tone="error" data-code="SAVE_FAILED">保存失败</StatusNotice>
        <StatusNotice tone="saved">已保存</StatusNotice>
        <StatusNotice tone="recovered">已恢复未保存的更改</StatusNotice>
      </>,
    );

    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
    expect(screen.getByRole("alert")).toHaveAttribute("aria-atomic", "true");
    expect(screen.getByRole("alert")).toHaveAttribute("data-code", "SAVE_FAILED");
    expect(screen.getAllByRole("status")).toHaveLength(2);
    for (const status of screen.getAllByRole("status")) {
      expect(status).toHaveAttribute("aria-live", "polite");
      expect(status).toHaveAttribute("aria-atomic", "true");
    }
    expect(errorRef.current).toBe(screen.getByRole("alert"));
  });
});

describe("Aether CSS contract", () => {
  it("preserves the exact approved tokens and public CSS entry paths", () => {
    const tokens = readFileSync(
      resolve(process.cwd(), "src/tokens.css"),
      "utf8",
    );
    const packageJson = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "package.json"),
        "utf8",
      ),
    ) as { exports: Record<string, string> };
    const expected = [
      "color-scheme: dark;",
      "--aether-bg: #0e151d;",
      "--aether-surface-1: #151f2a;",
      "--aether-surface-2: #1b2733;",
      "--aether-border: rgb(191 216 231 / 14%);",
      "--aether-text: #e5edf3;",
      "--aether-text-muted: #92a4b3;",
      "--aether-accent: #58b8c4;",
      "--aether-accent-soft: rgb(88 184 196 / 16%);",
      "--aether-danger: #d98484;",
      "--aether-success: #75b895;",
      "--aether-radius-sm: 10px;",
      "--aether-radius-md: 12px;",
      "--aether-radius-lg: 16px;",
      "--aether-motion-fast: 120ms;",
      "--aether-motion-base: 180ms;",
      "--aether-motion-slow: 220ms;",
      '--aether-font: "Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif;',
    ];

    for (const declaration of expected) expect(tokens).toContain(declaration);
    expect(packageJson.exports["./tokens.css"]).toBe("./src/tokens.css");
    expect(packageJson.exports["./base.css"]).toBe("./src/base.css");
  });

  it("provides focus, reduced motion, and neutral scrollbars without glass or glow", () => {
    const base = readFileSync(
      resolve(process.cwd(), "src/base.css"),
      "utf8",
    );
    expect(base).toMatch(/:focus-visible\s*{/);
    expect(base).toMatch(/outline:\s*[^;]+;/);
    expect(base).toContain("@media (prefers-reduced-motion: reduce)");
    expect(base).toContain("transition-duration: 0.01ms");
    expect(base).toContain("scrollbar-color:");
    expect(base).not.toMatch(/backdrop-filter|drop-shadow|text-shadow|box-shadow/i);
  });
});
