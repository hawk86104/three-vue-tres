// @vitest-environment jsdom
/// <reference types="vite/client" />
/// <reference types="node" />

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import packageJson from "../package.json";
import { EditorShell } from "./index";
import type { EditorShellProps } from "./index";

afterEach(cleanup);

const testModuleUrl = import.meta.url;

function createProps(
  overrides: Partial<EditorShellProps> = {},
): EditorShellProps {
  return {
    projectName: "Demo",
    profile: "market",
    saveState: "saved",
    canUndo: false,
    canRedo: false,
    onBack: vi.fn(),
    onSave: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onClose: vi.fn(),
    tree: <div>一层</div>,
    workspace: <div>项目概览</div>,
    inspector: <div>检查器内容</div>,
    ...overrides,
  };
}

describe("EditorShell", () => {
  it.each(["showroom", "market"] as const)(
    "shows the %s profile, project identity, and only M0 actions",
    (profile) => {
      render(<EditorShell {...createProps({ profile })} />);

      expect(screen.getByRole("heading", { name: "Demo" })).toBeVisible();
      expect(screen.getByText(profile)).toBeVisible();
      expect(
        screen.getAllByRole("button").map((button) => button.textContent),
      ).toEqual(["返回", "保存", "撤销", "重做", "关闭"]);
      expect(screen.queryByText("摊位")).not.toBeInTheDocument();
      expect(screen.queryByText("展具")).not.toBeInTheDocument();
      expect(screen.queryByTestId("bottom-dock")).not.toBeInTheDocument();
    },
  );

  it("uses semantic header, navigation, workspace, and inspector regions for slots", () => {
    render(<EditorShell {...createProps()} />);

    const banner = screen.getByRole("banner");
    const tree = screen.getByRole("navigation", { name: "项目树" });
    const workspace = screen.getByRole("main");
    const inspector = screen.getByRole("complementary", { name: "检查器" });
    expect(within(banner).getByRole("button", { name: "保存" })).toBeVisible();
    expect(within(tree).getByText("一层")).toBeVisible();
    expect(within(workspace).getByText("项目概览")).toBeVisible();
    expect(within(inspector).getByText("检查器内容")).toBeVisible();
  });

  it("wires every working action callback", () => {
    const callbacks = {
      onBack: vi.fn(),
      onSave: vi.fn(),
      onUndo: vi.fn(),
      onRedo: vi.fn(),
      onClose: vi.fn(),
    };
    render(
      <EditorShell
        {...createProps({ ...callbacks, canUndo: true, canRedo: true })}
      />,
    );

    for (const name of ["返回", "保存", "撤销", "重做", "关闭"]) {
      screen.getByRole("button", { name }).click();
    }
    expect(callbacks.onBack).toHaveBeenCalledOnce();
    expect(callbacks.onSave).toHaveBeenCalledOnce();
    expect(callbacks.onUndo).toHaveBeenCalledOnce();
    expect(callbacks.onRedo).toHaveBeenCalledOnce();
    expect(callbacks.onClose).toHaveBeenCalledOnce();
  });

  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ] as const)(
    "follows canUndo=%s and canRedo=%s",
    (canUndo, canRedo) => {
      render(<EditorShell {...createProps({ canUndo, canRedo })} />);

      expect(screen.getByRole("button", { name: "撤销" })).toHaveProperty(
        "disabled",
        !canUndo,
      );
      expect(screen.getByRole("button", { name: "重做" })).toHaveProperty(
        "disabled",
        !canRedo,
      );
    },
  );

  it.each([
    ["dirty", "未保存", "status"],
    ["saving", "保存中", "status"],
    ["saved", "已保存", "status"],
    ["error", "保存失败", "alert"],
    ["recovered", "已恢复", "status"],
  ] as const)(
    "announces the %s save state as %s",
    (saveState, label, role) => {
      render(<EditorShell {...createProps({ saveState })} />);

      expect(screen.getByRole(role)).toHaveTextContent(label);
    },
  );

  it("makes Save busy and disabled only while saving", () => {
    const states = ["dirty", "saving", "saved", "error", "recovered"] as const;

    for (const saveState of states) {
      const { unmount } = render(
        <EditorShell {...createProps({ saveState })} />,
      );
      const save = screen.getByRole("button", { name: "保存" });
      expect(save).toHaveProperty("disabled", saveState === "saving");
      if (saveState === "saving") {
        expect(save).toHaveAttribute("aria-busy", "true");
      } else {
        expect(save).not.toHaveAttribute("aria-busy");
      }
      unmount();
    }
  });
});

describe("editor shell public CSS contract", () => {
  it("exports its stylesheet and imports shared design-system styles publicly", () => {
    const editorShellCss = readFileSync(
      new URL("./editor-shell.css", testModuleUrl),
      "utf8",
    );

    expect(packageJson.exports["."]).toBe("./src/index.ts");
    expect(packageJson.exports["./styles.css"]).toBe("./src/editor-shell.css");
    expect(editorShellCss).toContain(
      '@import "@aethertwin/design-system/base.css";',
    );
    expect(editorShellCss).toContain("--aether-editor-tree-width: 260px");
    expect(editorShellCss).toContain("--aether-editor-inspector-width: 320px");
    expect(editorShellCss).toMatch(
      /grid-template-columns:\s*var\(--aether-editor-tree-width\)\s+minmax\(0, 1fr\)\s+var\(--aether-editor-inspector-width\)/,
    );
    expect(editorShellCss).toContain("min-width: 1180px");
    expect(editorShellCss).toContain("min-height: 720px");
    expect(editorShellCss).toMatch(
      /border(?:-\w+)?:\s*1px solid var\(--aether-border\)/,
    );
    expect(editorShellCss).not.toMatch(
      /(?:linear|radial|conic)-gradient|backdrop-filter/i,
    );
  });
});
