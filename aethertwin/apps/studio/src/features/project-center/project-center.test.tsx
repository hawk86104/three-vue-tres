// @vitest-environment jsdom
/// <reference types="vite/client" />
/// <reference types="node" />

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectStore, SandboxProjectBackend } from "@aethertwin/project-store";
import { App } from "../../app";
import { selectBackend } from "../../backend/select-backend";
import {
  CreateProjectDialog,
  validateProjectName,
} from "./create-project-dialog";

const HOME_PATH = "/";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", HOME_PATH);
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const EMPTY_NAME_ERROR = "请输入项目名称";
const RESERVED_NAME_ERROR = "项目名称不能使用 Windows 保留设备名";
const TRAILING_NAME_ERROR = "项目名称不能以点或空格结尾";
const LONG_NAME_ERROR = "项目名称不能超过 80 个字符";

describe("project name validation", () => {
  const reservedBasenames = [
    "CON",
    "PRN",
    "AUX",
    "NUL",
    ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`),
    ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`),
    "COM¹",
    "COM²",
    "COM³",
    "LPT¹",
    "LPT²",
    "LPT³",
  ];

  it.each(reservedBasenames.flatMap((name) => [name, `${name}.project`]))(
    "rejects every Windows reserved basename variant: %s",
    (name) => {
      expect(validateProjectName(name)).toEqual({ ok: false, error: RESERVED_NAME_ERROR });
    },
  );

  it.each(["\t\n\u00a0", "项目 ", "项目\t", "项目\n", "项目\u00a0", "项目.", "项目.\u00a0"])(
    "rejects empty or trailing Unicode whitespace without normalizing to an invalid name: %j",
    (name) => {
      expect(validateProjectName(name)).toEqual({
        ok: false,
        error: name.trim().length === 0 ? EMPTY_NAME_ERROR : TRAILING_NAME_ERROR,
      });
    },
  );

  it("returns the canonical Unicode-aware name and counts Unicode code points", () => {
    const eightyCodePoints = "😀".repeat(80);
    expect(validateProjectName("\t\u00a0  项目")).toEqual({ ok: true, name: "项目" });
    expect(validateProjectName(eightyCodePoints)).toEqual({
      ok: true,
      name: eightyCodePoints,
    });
    expect(validateProjectName(`${eightyCodePoints}😀`)).toEqual({
      ok: false,
      error: LONG_NAME_ERROR,
    });
  });

  it("submits exactly the canonical name returned by validation", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <CreateProjectDialog
        open
        profile="market"
        onCreate={onCreate}
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("项目名称"), {
      target: { value: "\t\u00a0  夏日市集" },
    });
    await userEvent.click(screen.getByRole("button", { name: "创建项目" }));

    expect(onCreate).toHaveBeenCalledWith("夏日市集", "market");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("focuses the associated name field when validation fails", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <CreateProjectDialog
        open
        profile="showroom"
        onCreate={onCreate}
        onOpenChange={() => {}}
      />,
    );
    const nameField = screen.getByLabelText("项目名称");
    fireEvent.change(nameField, { target: { value: "项目.\u00a0" } });
    nameField.blur();

    await userEvent.click(screen.getByRole("button", { name: "创建项目" }));

    const error = screen.getByText(TRAILING_NAME_ERROR);
    expect(nameField).toHaveFocus();
    expect(nameField).toHaveAttribute("aria-invalid", "true");
    expect(nameField.getAttribute("aria-describedby")?.split(" ")).toContain(error.id);
    expect(onCreate).not.toHaveBeenCalled();
  });
});

describe("create project busy state", () => {
  it("blocks every dismiss path until creation resolves", async () => {
    const pendingCreate = deferred<void>();
    const onCreate = vi.fn(() => pendingCreate.promise);
    const onOpenChange = vi.fn();
    render(
      <CreateProjectDialog
        open
        profile="market"
        onCreate={onCreate}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("项目名称"), {
      target: { value: "忙碌市集" },
    });
    await userEvent.click(screen.getByRole("button", { name: "创建项目" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());

    const create = screen.getByRole("button", { name: "创建项目" });
    const cancel = screen.getByRole("button", { name: "取消" });
    const close = screen.getByRole("button", { name: "关闭" });
    expect(create).toBeDisabled();
    expect(cancel).toBeDisabled();
    expect(close).toBeDisabled();
    await userEvent.click(cancel);
    await userEvent.click(close);
    await userEvent.keyboard("{Escape}");
    const overlay = document.querySelector<HTMLElement>(".aether-dialog__overlay");
    expect(overlay).not.toBeNull();
    fireEvent.pointerDown(overlay!, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(overlay!);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    await act(async () => pendingCreate.resolve(undefined));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("restores validation and dismissal controls after creation rejects", async () => {
    const pendingCreate = deferred<void>();
    const onOpenChange = vi.fn();
    render(
      <CreateProjectDialog
        open
        profile="showroom"
        onCreate={() => pendingCreate.promise}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("项目名称"), {
      target: { value: "失败展厅" },
    });
    await userEvent.click(screen.getByRole("button", { name: "创建项目" }));

    await act(async () => pendingCreate.reject(new Error("create failed")));
    expect(await screen.findByText("创建失败，请重试")).toBeVisible();
    expect(screen.getByRole("button", { name: "创建项目" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "关闭" })).toBeEnabled();

    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
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
    const backend = new SandboxProjectBackend();
    const checkpoint = vi.spyOn(backend, "checkpoint");
    render(<App backend={backend} />);
    await openCreateDialog("showroom");
    await submitName("旧展厅名");

    const nameField = await screen.findByLabelText("项目名称（检查器）");
    await userEvent.clear(nameField);
    await userEvent.type(nameField, "新展厅名");
    await userEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(await screen.findByText("新展厅名")).toBeVisible();
    expect(screen.queryByText("旧展厅名")).not.toBeInTheDocument();
    expect(checkpoint).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "打开沙盒项目" }));
    expect(await screen.findByRole("heading", { name: "新展厅名" })).toBeVisible();
  });

  it("disposes a dirty in-flight Studio store exactly once without a post-unmount autosave", async () => {
    const backend = new SandboxProjectBackend();
    const checkpoint = vi.spyOn(backend, "checkpoint");
    const dispose = vi.spyOn(ProjectStore.prototype, "dispose");
    const rendered = render(
      <StrictMode>
        <App backend={backend} />
      </StrictMode>,
    );
    await openCreateDialog("showroom");
    await submitName("卸载展厅");

    const commitProject = backend.commit.bind(backend);
    let markCommitStarted!: () => void;
    let releaseCommit!: () => void;
    const commitStarted = new Promise<void>((resolve) => {
      markCommitStarted = resolve;
    });
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const commit = vi.spyOn(backend, "commit").mockImplementationOnce(async (path, batch) => {
      markCommitStarted();
      await commitGate;
      return commitProject(path, batch);
    });
    const close = vi.spyOn(backend, "closeProject");

    const nameField = screen.getByLabelText("项目名称（检查器）");
    vi.useFakeTimers();
    fireEvent.change(nameField, { target: { value: "卸载中的展厅" } });
    fireEvent.blur(nameField);
    await commitStarted;

    rendered.unmount();
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
    const disposePromise = dispose.mock.results[0]?.value;
    expect(disposePromise).toBeInstanceOf(Promise);

    releaseCommit();
    await disposePromise;
    await vi.advanceTimersByTimeAsync(1_000);

    expect(commit).toHaveBeenCalledOnce();
    expect(checkpoint).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps inspector name and tag errors associated with only their own field", async () => {
    const backend = new SandboxProjectBackend();
    render(<App backend={backend} />);
    await openCreateDialog("market");
    await submitName("检查器市集");

    const inspector = document.querySelector<HTMLElement>('aside[aria-label="检查器"]');
    expect(inspector).not.toBeNull();
    const inspectorQueries = within(inspector!);
    const nameField = await inspectorQueries.findByLabelText("项目名称（检查器）");
    const tagsField = inspectorQueries.getByLabelText("项目标签");
    fireEvent.change(nameField, { target: { value: "CON" } });
    fireEvent.blur(nameField);

    expect(await inspectorQueries.findByRole("alert")).toHaveTextContent(RESERVED_NAME_ERROR);
    expect(nameField).toHaveAttribute("aria-invalid", "true");
    expect(tagsField).not.toHaveAttribute("aria-invalid");

    fireEvent.change(nameField, { target: { value: "检查器市集" } });
    fireEvent.blur(nameField);
    await waitFor(() => expect(nameField).not.toHaveAttribute("aria-invalid"));
    expect(inspectorQueries.queryByRole("alert")).not.toBeInTheDocument();

    backend.failNextCommit = new Error("tag commit failed");
    fireEvent.change(tagsField, { target: { value: "featured" } });
    fireEvent.blur(tagsField);

    expect(await inspectorQueries.findByRole("alert")).toHaveTextContent("tag commit failed");
    expect(tagsField).toHaveAttribute("aria-invalid", "true");
    expect(nameField).not.toHaveAttribute("aria-invalid");
    const tagDescriptionIds = tagsField.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(
      tagDescriptionIds.some(
        (id) => document.getElementById(id)?.textContent === "tag commit failed",
      ),
    ).toBe(true);
    expect(screen.getByText("保存失败")).toHaveAttribute("role", "alert");

    fireEvent.change(tagsField, { target: { value: "" } });
    fireEvent.blur(tagsField);
    await waitFor(() => expect(tagsField).not.toHaveAttribute("aria-invalid"));
    expect(inspectorQueries.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("保存失败")).toHaveAttribute("role", "alert");
  });

  it("clears a stale recent-project open error when starting a new create flow", async () => {
    const backend = new SandboxProjectBackend();
    render(<App backend={backend} />);
    await openCreateDialog("market");
    await submitName("可重试市集");
    await userEvent.click(await screen.findByRole("button", { name: "关闭" }));

    vi.spyOn(backend, "openProject").mockRejectedValueOnce(new Error("cannot reopen"));
    await userEvent.click(screen.getByRole("button", { name: "打开沙盒项目" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("cannot reopen");

    await openCreateDialog("showroom");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
    expect(screen.queryByRole("dialog", { name: "示例对话框" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "显示示例对话框" })).toBeEnabled();
    expect(screen.getByRole("region", { name: "示例面板" })).toBeVisible();
    expect(screen.getByText("空状态：暂无项目")).toBeVisible();
    expect(screen.getByText("错误状态：保存失败")).toHaveAttribute("role", "alert");

    const saveStateSemantics = {
      dirty: { live: "polite", role: "status", tone: "info" },
      saving: { live: "polite", role: "status", tone: "info" },
      saved: { live: "polite", role: "status", tone: "saved" },
      error: { live: "assertive", role: "alert", tone: "error" },
      recovered: { live: "polite", role: "status", tone: "recovered" },
    } as const;
    for (const [state, semantics] of Object.entries(saveStateSemantics)) {
      const notice = screen.getByTestId(`save-state-${state}`);
      expect(notice).toBeVisible();
      expect(notice).toHaveClass(
        "aether-status-notice",
        `aether-status-notice--${semantics.tone}`,
      );
      expect(notice).toHaveAttribute("role", semantics.role);
      expect(notice).toHaveAttribute("aria-live", semantics.live);
      expect(notice).toHaveAttribute("aria-atomic", "true");
    }

    const badgePanel = screen.getByRole("region", { name: "项目档案徽章" });
    for (const tone of ["neutral", "accent", "success", "danger"] as const) {
      expect(within(badgePanel).getByText(tone)).toHaveClass(
        "aether-badge",
        `aether-badge--${tone}`,
      );
    }
    expect(within(badgePanel).getByText("showroom")).toHaveClass("aether-badge--accent");
    expect(within(badgePanel).getByText("market")).toHaveClass("aether-badge--accent");
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

  it("opens the default-modal example dialog and restores focus for Escape and close", async () => {
    window.history.replaceState({}, "", "/dev/ui-gallery");
    render(<App forceBackend="sandbox" />);

    const opener = screen.getByRole("button", { name: "显示示例对话框" });
    expect(opener).toBeEnabled();
    expect(screen.queryByRole("dialog", { name: "示例对话框" })).not.toBeInTheDocument();

    await userEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "示例对话框" })).toBeVisible();
    expect(screen.getByRole("button", { name: "确认" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "关闭" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "确认" })).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "示例对话框" })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();

    await userEvent.click(opener);
    expect(screen.getByRole("button", { name: "确认" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog", { name: "示例对话框" })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
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
