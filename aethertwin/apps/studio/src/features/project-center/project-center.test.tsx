// @vitest-environment jsdom
/// <reference types="vite/client" />
/// <reference types="node" />

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { SandboxProjectBackend } from "@aethertwin/project-store";
import { App } from "../../app";
import { selectBackend } from "../../backend/select-backend";

const HOME_PATH = "/";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", HOME_PATH);
});

async function openCreateDialog(profile: "showroom" | "market") {
  const name = profile === "showroom" ? "新建店铺展厅" : "新建市集导览";
  await userEvent.click(screen.getByRole("button", { name }));
  return screen.getByRole("dialog", { name: "新建项目" });
}

async function submitName(name?: string) {
  if (name !== undefined) {
    await userEvent.type(screen.getByLabelText("项目名称"), name);
  }
  await userEvent.click(screen.getByRole("button", { name: "创建项目" }));
}

describe("project center", () => {
  it("shows exactly the two fixed creation profiles and no deferred entry", () => {
    render(<App forceBackend="sandbox" />);

    const creationButtons = screen.getAllByRole("button", { name: /^新建/ });
    expect(creationButtons.map((button) => button.textContent)).toEqual([
      "新建店铺展厅",
      "新建市集导览",
    ]);
    expect(screen.queryByText(/BIM|IoT|3DGS|点云|三维场景/)).not.toBeInTheDocument();
    expect(screen.getByText("Web 沙盒 · 不持久保存")).toBeVisible();
    expect(screen.getByRole("button", { name: "打开沙盒项目" })).toBeDisabled();
    expect(document.body).not.toHaveTextContent(/文件系统|文件夹|目录|选择位置|浏览项目/);
  });

  it.each([
    ["showroom", "店铺展厅", "showroom"],
    ["market", "市集导览", "market"],
  ] as const)("keeps the %s profile and sandbox location fixed", async (profile, title, badge) => {
    render(<App forceBackend="sandbox" />);
    const dialog = await openCreateDialog(profile);

    expect(within(dialog).getByText(title)).toBeVisible();
    expect(within(dialog).getByText(badge)).toBeVisible();
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("项目位置")).toHaveValue("sandbox");
    expect(within(dialog).getByLabelText("项目位置")).toBeDisabled();
  });

  it.each([
    [undefined, "请输入项目名称"],
    ["   ", "请输入项目名称"],
    ["CON.txt", "项目名称不能使用 Windows 保留设备名"],
    ["aux.project", "项目名称不能使用 Windows 保留设备名"],
    ["LPT9.md", "项目名称不能使用 Windows 保留设备名"],
    ["COM¹.txt", "项目名称不能使用 Windows 保留设备名"],
    ["lpt³.project", "项目名称不能使用 Windows 保留设备名"],
    ["尾点.", "项目名称不能以点或空格结尾"],
    ["尾空格 ", "项目名称不能以点或空格结尾"],
    ["市场/夏日", "项目名称不能包含路径分隔符"],
    ["市场\\夏日", "项目名称不能包含路径分隔符"],
  ])("rejects invalid project name %#", async (name, message) => {
    render(<App forceBackend="sandbox" />);
    await openCreateDialog("market");
    await submitName(name);

    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.getByRole("dialog", { name: "新建项目" })).toBeVisible();
  });

  it("accepts exactly 80 Unicode code points even when UTF-16 uses surrogate pairs", async () => {
    render(<App forceBackend="sandbox" />);
    await openCreateDialog("showroom");
    await submitName("𠮷".repeat(80));

    expect(await screen.findByRole("heading", { name: "项目概览" })).toBeVisible();
    expect(screen.queryByText("项目名称不能超过 80 个字符")).not.toBeInTheDocument();
  });

  it("rejects 81 Unicode code points", async () => {
    render(<App forceBackend="sandbox" />);
    await openCreateDialog("showroom");
    await submitName("𠮷".repeat(81));

    expect(await screen.findByText("项目名称不能超过 80 个字符")).toBeVisible();
  });

  it("creates a market project through ProjectStore and enters the real EditorShell overview", async () => {
    render(<App forceBackend="sandbox" />);
    await openCreateDialog("market");
    await submitName("夏日市集");

    expect(await screen.findByRole("heading", { name: "夏日市集" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "项目概览" })).toBeVisible();
    expect(within(screen.getByRole("banner")).getByText("market")).toBeVisible();
    expect(within(screen.getByRole("navigation", { name: "项目树" })).getByText("一层")).toBeVisible();
    expect(within(screen.getByRole("main")).getByText("sandbox://00000000-0000-4000-8000-000000000001")).toBeVisible();
    expect(screen.queryByText(/BIM|IoT|3DGS|点云|三维场景/)).not.toBeInTheDocument();
  });

  it("wires overview editing, undo, redo, and save to the real ProjectStore", async () => {
    render(<App forceBackend="sandbox" />);
    await openCreateDialog("showroom");
    await submitName("初始展厅");

    const nameField = await screen.findByLabelText("项目名称（检查器）");
    await userEvent.clear(nameField);
    await userEvent.type(nameField, "更新展厅");
    await userEvent.tab();
    await waitFor(() => expect(screen.getByRole("button", { name: "撤销" })).toBeEnabled());
    expect(screen.getByRole("status")).toHaveTextContent("未保存");

    await userEvent.click(screen.getByRole("button", { name: "撤销" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "初始展厅" })).toBeVisible());
    expect(screen.getByRole("button", { name: "重做" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "重做" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "更新展厅" })).toBeVisible());
    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("已保存"));
  });

  it("records a sandbox recent project and reopens it through sandbox semantics", async () => {
    render(<App forceBackend="sandbox" />);
    await openCreateDialog("market");
    await submitName("可重开市集");
    await userEvent.click(await screen.findByRole("button", { name: "关闭" }));

    expect(await screen.findByText("可重开市集")).toBeVisible();
    const open = screen.getByRole("button", { name: "打开沙盒项目" });
    expect(open).toBeEnabled();
    await userEvent.click(open);

    expect(await screen.findByRole("heading", { name: "可重开市集" })).toBeVisible();
    expect(within(screen.getByRole("banner")).getByText("market")).toBeVisible();
  });

  it("refreshes the recent project identity from the renamed snapshot before close", async () => {
    render(<App forceBackend="sandbox" />);
    await openCreateDialog("showroom");
    await submitName("旧展厅名");

    const nameField = await screen.findByLabelText("项目名称（检查器）");
    await userEvent.clear(nameField);
    await userEvent.type(nameField, "新展厅名");
    await userEvent.tab();
    await waitFor(() => expect(screen.getByRole("heading", { name: "新展厅名" })).toBeVisible());
    await userEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(await screen.findByText("新展厅名")).toBeVisible();
    expect(screen.queryByText("旧展厅名")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "打开沙盒项目" }));
    expect(await screen.findByRole("heading", { name: "新展厅名" })).toBeVisible();
  });

  it("does not leak sandbox backend or recent state between renders", async () => {
    const first = render(<App forceBackend="sandbox" />);
    await openCreateDialog("market");
    await submitName("临时市集");
    first.unmount();

    render(<App forceBackend="sandbox" />);
    expect(screen.getByText("还没有沙盒项目")).toBeVisible();
    expect(screen.queryByText("临时市集")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开沙盒项目" })).toBeDisabled();
  });
});

describe("UI gallery", () => {
  it("routes from pathname and covers all implemented component and save states", () => {
    window.history.replaceState({}, "", "/dev/ui-gallery");
    render(<App forceBackend="sandbox" />);

    expect(screen.getByRole("heading", { name: "Aether UI Gallery" })).toBeVisible();
    for (const label of ["主要按钮", "次要按钮", "幽灵按钮", "危险按钮", "禁用按钮", "处理中"]) {
      expect(screen.getByRole("button", { name: label })).toBeVisible();
    }
    expect(screen.getByLabelText("默认字段")).toBeVisible();
    expect(screen.getByLabelText("帮助字段")).toBeVisible();
    expect(screen.getByLabelText("错误字段")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("禁用字段")).toBeDisabled();
    expect(screen.getByRole("dialog", { name: "示例对话框" })).toBeVisible();
    expect(screen.getByRole("region", { name: "示例面板" })).toBeVisible();
    expect(screen.getByText("空状态：暂无项目")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("错误状态：保存失败");
    for (const state of ["dirty", "saving", "saved", "error", "recovered"]) {
      expect(screen.getByTestId(`save-state-${state}`)).toBeVisible();
    }
    expect(screen.getByText("showroom")).toBeVisible();
    expect(screen.getByText("market")).toBeVisible();
    expect(screen.queryByText(/BIM|IoT|3DGS|点云|三维场景/)).not.toBeInTheDocument();
  });

  it("shows the required field state and gives every enabled example button a real action", async () => {
    window.history.replaceState({}, "", "/dev/ui-gallery");
    render(<App forceBackend="sandbox" />);

    expect(screen.getByLabelText(/必填字段/)).toBeRequired();
    for (const label of ["主要按钮", "次要按钮", "幽灵按钮", "危险按钮"]) {
      await userEvent.click(screen.getByRole("button", { name: label }));
      expect(screen.getByTestId("gallery-last-action")).toHaveTextContent(label);
    }
  });
});

describe("Studio entry boundaries", () => {
  it("selects a sandbox backend for the unforced web entry", () => {
    const backend = selectBackend();
    expect(backend).toBeInstanceOf(SandboxProjectBackend);
    expect(backend.mode).toBe("sandbox");
  });

  it("uses pathname-independent package and public CSS reads", () => {
    const testModuleUrl = import.meta.url;
    const packageJson = JSON.parse(
      readFileSync(new URL("../../../package.json", testModuleUrl), "utf8"),
    ) as { dependencies: Record<string, string> };
    const viteConfig = readFileSync(new URL("../../../vite.config.ts", testModuleUrl), "utf8");
    const main = readFileSync(new URL("../../main.tsx", testModuleUrl), "utf8");
    const appCss = readFileSync(new URL("../../app.css", testModuleUrl), "utf8");

    expect(packageJson.dependencies).toMatchObject({
      "@aethertwin/core-model": "workspace:*",
      "@aethertwin/project-store": "workspace:*",
      "@aethertwin/design-system": "workspace:*",
      "@aethertwin/editor-shell": "workspace:*",
    });
    expect(viteConfig).toContain('base: "./"');
    expect(viteConfig).toContain('build: { outDir: "dist", emptyOutDir: true }');
    expect(main).toContain('import "./app.css";');
    expect(appCss).toContain('@import "@aethertwin/design-system/base.css";');
    expect(appCss).toContain('@import "@aethertwin/editor-shell/styles.css";');
  });
});
