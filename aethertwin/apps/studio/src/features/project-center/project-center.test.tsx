// @vitest-environment jsdom
/// <reference types="vite/client" />
/// <reference types="node" />

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createInitialSnapshot, createManifest, parseSnapshot } from "@aethertwin/core-model";
import { readFileSync } from "node:fs";
import { StrictMode, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ProjectStore,
  SandboxProjectBackend,
  type OpenedProject,
  type ProjectBackend,
} from "@aethertwin/project-store";

const { openFolderDialog } = vi.hoisted(() => ({ openFolderDialog: vi.fn() }));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openFolderDialog }));

import { App } from "../../app";
import { StudioI18nTestProvider } from "../../i18n/test-support";
import { selectBackend } from "../../backend/select-backend";
import { ProjectBackendError } from "../../backend/tauri-backend";
import {
  CreateProjectDialog,
  validateProjectName,
} from "./create-project-dialog";

const HOME_PATH = "/";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  openFolderDialog.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.localStorage.clear();
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

const RESERVED_NAME_ERROR = "项目名称不能使用 Windows 保留设备名";
const TRAILING_NAME_ERROR = "项目名称不能以点或空格结尾";

describe("project name validation", () => {
  it("returns stable ids rather than localized validation strings", () => {
    expect(validateProjectName("")).toBe("empty");
    expect(validateProjectName("folder/name")).toBe("separator");
  });
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
      expect(validateProjectName(name)).toBe("reserved-name");
    },
  );

  it.each([
    ["\t\n\u00a0", "empty"], ["\u0085", "empty"], ["\uFEFF", "empty"],
    ["项目 ", "trailing-dot-or-space"], ["项目\t", "trailing-dot-or-space"], ["项目\n", "trailing-dot-or-space"], ["项目\u00a0", "trailing-dot-or-space"], ["项目\u0085", "trailing-dot-or-space"], ["项目\uFEFF", "trailing-dot-or-space"], ["项目.", "trailing-dot-or-space"], ["项目.\u00a0", "trailing-dot-or-space"], ["项目.\u0085", "trailing-dot-or-space"], ["项目.\uFEFF", "trailing-dot-or-space"],
  ])(
    "rejects empty or trailing Unicode whitespace without normalizing to an invalid name: %j",
    (name, error) => {
      expect(validateProjectName(name)).toBe(error);
    },
  );

  it("returns the canonical Unicode-aware name and counts Unicode code points", () => {
    const eightyCodePoints = "😀".repeat(80);
    expect(validateProjectName("\t\u00a0  项目")).toBeNull();
    expect(validateProjectName("\u0085项目")).toBeNull();
    expect(validateProjectName("\uFEFF项目")).toBeNull();
    expect(validateProjectName(eightyCodePoints)).toBeNull();
    expect(validateProjectName(`${eightyCodePoints}😀`)).toBe("too-long");
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
    const onCreate = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => pendingCreate.promise)
      .mockResolvedValueOnce(undefined);
    render(
      <CreateProjectDialog
        open
        profile="showroom"
        onCreate={onCreate}
        onOpenChange={onOpenChange}
      />,
    );
    const nameField = screen.getByLabelText("项目名称");
    fireEvent.change(nameField, {
      target: { value: "失败展厅" },
    });
    await userEvent.click(screen.getByRole("button", { name: "创建项目" }));

    const rawError = "create failed";
    await act(async () => pendingCreate.reject(new Error(rawError)));
    expect(await screen.findByRole("alert")).toHaveTextContent("操作未能完成，请重试。");
    expect(document.body).not.toHaveTextContent(rawError);
    expect(nameField).not.toHaveAttribute("aria-invalid");
    expect(nameField).not.toHaveAttribute("aria-describedby");
    expect(nameField).toHaveValue("失败展厅");
    expect(screen.getByRole("button", { name: "创建项目" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "关闭" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "创建项目" }));
    expect(onCreate).toHaveBeenCalledTimes(2);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

async function openCreateDialog(profile: "showroom" | "market") {
  const name = profile === "showroom" ? "新建展厅" : "新建市集";
  await userEvent.click(await screen.findByRole("button", { name }));
  return screen.getByRole("dialog", { name: "新建项目" });
}

async function submitName(name?: string) {
  if (name !== undefined) {
    await userEvent.type(screen.getByLabelText("项目名称"), name);
  }
  await userEvent.click(screen.getByRole("button", { name: "创建项目" }));
}

function createDesktopBackend(projects = new Map<string, OpenedProject>()): ProjectBackend {
  let nextId = 1;
  const nextUuid = () => {
    const suffix = String(nextId).padStart(12, "0");
    nextId += 1;
    return `30000000-0000-4000-8000-${suffix}`;
  };
  const createProject = vi.fn<ProjectBackend["createProject"]>(async (request) => {
    const snapshot = createInitialSnapshot({
      name: request.name,
      profile: request.profile,
      uuid: nextUuid,
    });
    const projectPath = `${request.location.replace(/[\\\\/]$/u, "")}\\${request.name}.twinproj`;
    const opened: OpenedProject = {
      projectPath,
      snapshot,
      manifest: createManifest(snapshot, {
        appVersion: "0.1.0",
        now: () => "2026-07-20T00:00:00.000Z",
      }),
      recovered: false,
    };
    projects.set(projectPath, opened);
    return opened;
  });
  const openProject = vi.fn<ProjectBackend["openProject"]>(async (path) => {
    const opened = projects.get(path);
    if (opened === undefined) throw new Error(`Desktop project not found: ${path}`);
    return opened;
  });
  const commit = vi.fn<ProjectBackend["commit"]>(async (path, batch) => {
    const opened = projects.get(path);
    if (opened === undefined) throw new Error(`Desktop project not found: ${path}`);
    projects.set(path, { ...opened, snapshot: batch.after });
  });
  const checkpoint = vi.fn<ProjectBackend["checkpoint"]>(async (path, snapshot) => {
    const opened = projects.get(path);
    if (opened === undefined) throw new Error(`Desktop project not found: ${path}`);
    const checkpointSnapshot = parseSnapshot({
      ...snapshot,
      checkpointSequence: snapshot.sequence,
    });
    const manifest = createManifest(checkpointSnapshot, {
      appVersion: "0.1.0",
      now: () => "2026-07-20T00:00:01.000Z",
    });
    projects.set(path, { ...opened, manifest, snapshot: checkpointSnapshot });
    return { manifest, snapshot: checkpointSnapshot };
  });
  const recoverProject = vi.fn<ProjectBackend["recoverProject"]>(async (path, confirmation) => {
    if (!confirmation.confirmed) throw new Error("Recovery confirmation is required");
    const opened = projects.get(path);
    if (opened === undefined) throw new Error(`Desktop project not found: ${path}`);
    return { ...opened, recovered: true };
  });
  return {
    mode: "desktop",
    createProject,
    openProject,
    recoverProject,
    importAsset: vi.fn<ProjectBackend["importAsset"]>(async () => {
      throw new Error("Asset import is unavailable in the project-center test backend");
    }),
    cancelAssetImport: vi.fn<ProjectBackend["cancelAssetImport"]>(async () => undefined),
    resolveAsset: vi.fn<ProjectBackend["resolveAsset"]>(async () => {
      throw new Error("Asset resolution is unavailable in the project-center test backend");
    }),
    commit,
    checkpoint,
    closeProject: vi.fn<ProjectBackend["closeProject"]>(async () => undefined),
  };
}

describe("project center", () => {
  it("keeps the AetherTwin brand literal and presents the sandbox location through the catalogue", async () => {
    render(<StudioI18nTestProvider><App forceBackend="sandbox" /></StudioI18nTestProvider>);

    expect((await screen.findAllByText("AetherTwin")).length).toBeGreaterThan(0);
    const dialog = await openCreateDialog("showroom");
    expect(within(dialog).getByLabelText("项目位置")).toHaveValue("演示沙盒");
  });

  it("keeps keyboard language-switch focus while translating Project Center display labels", async () => {
    const user = userEvent.setup();
    render(<StudioI18nTestProvider><App forceBackend="sandbox" /></StudioI18nTestProvider>);

    await screen.findByRole("heading", { name: "AetherTwin Studio" });
    const switcher = screen.getByLabelText("界面语言");
    switcher.focus();
    await user.selectOptions(switcher, "en");

    expect(document.activeElement).toBe(switcher);
    expect(screen.getByText("SHOWROOM")).toBeVisible();
    expect(screen.getByText("MARKET")).toBeVisible();
    expect(screen.getByText("SANDBOX")).toBeVisible();
    expect(screen.getByText("RECENT")).toBeVisible();
    expect(screen.getByText("0 projects")).toBeVisible();
  });

  it("shows exactly the two fixed creation profiles and no deferred entry", async () => {
    render(<App forceBackend="sandbox" />);

    await screen.findByRole("heading", { name: "AetherTwin Studio" });
    const creationButtons = screen.getAllByRole("button", { name: /^新建/ });
    expect(creationButtons.map((button) => button.textContent)).toEqual([
      "新建展厅",
      "新建市集",
    ]);
    expect(screen.queryByText(/BIM|IoT|3DGS|点云|三维场景/)).not.toBeInTheDocument();
    expect(screen.getByText("演示沙盒 · 不持久保存")).toBeVisible();
    expect(screen.getByRole("button", { name: "打开演示沙盒项目" })).toBeDisabled();
    expect(document.body).not.toHaveTextContent(/文件系统|文件夹|目录|选择位置|浏览项目/);
  });

  it.each([
    ["showroom", "展厅", "展厅"],
    ["market", "市集", "市集"],
  ] as const)("keeps the %s profile and sandbox location fixed", async (profile, title, badge) => {
    render(<App forceBackend="sandbox" />);
    const dialog = await openCreateDialog(profile);

    expect(within(dialog).getAllByText(title)).not.toHaveLength(0);
    expect(within(dialog).getAllByText(badge)).not.toHaveLength(0);
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("项目位置")).toHaveValue("演示沙盒");
    expect(within(dialog).getByLabelText("项目位置")).toBeDisabled();
    expect(openFolderDialog).not.toHaveBeenCalled();
  });

  it("uses only the Tauri folder dialog for desktop creation and never creates without a selected absolute directory", async () => {
    const backend = createDesktopBackend();
    render(<App backend={backend} />);

    expect(await screen.findByText("本地项目 · 持久保存")).toBeVisible();
    expect(screen.queryByText("演示沙盒 · 不持久保存")).not.toBeInTheDocument();
    const dialog = await openCreateDialog("showroom");
    const location = within(dialog).getByLabelText("项目位置");
    expect(location).toHaveValue("");
    expect(location).toHaveAttribute("readonly");
    await userEvent.type(within(dialog).getByLabelText("项目名称"), "桌面展厅");
    await userEvent.click(within(dialog).getByRole("button", { name: "创建项目" }));
    expect(backend.createProject).not.toHaveBeenCalled();
    expect(location).toHaveAttribute("aria-invalid", "true");

    openFolderDialog.mockResolvedValueOnce(null);
    await userEvent.click(within(dialog).getByRole("button", { name: "选择项目位置" }));
    expect(openFolderDialog).toHaveBeenCalledWith(expect.objectContaining({ directory: true }));
    expect(location).toHaveValue("");
    expect(backend.createProject).not.toHaveBeenCalled();

    openFolderDialog.mockResolvedValueOnce("E:\\Twin Projects");
    await userEvent.click(within(dialog).getByRole("button", { name: "选择项目位置" }));
    expect(location).toHaveValue("E:\\Twin Projects");
    await userEvent.click(within(dialog).getByRole("button", { name: "创建项目" }));

    expect(backend.createProject).toHaveBeenCalledWith({
      name: "桌面展厅",
      location: "E:\\Twin Projects",
      profile: "showroom",
    });
    expect(await screen.findByRole("heading", { name: "桌面展厅" })).toBeVisible();
    expect(
      screen.getByRole("complementary", { name: "检查器" }),
    ).toHaveTextContent(/桌面版/u);

    await userEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(await screen.findByText("本地项目 · 持久保存")).toBeVisible();
    expect(document.body).not.toHaveTextContent(/演示沙盒|打开演示沙盒项目|当前演示沙盒会话/);
    await userEvent.click(screen.getByRole("button", { name: "重新打开“桌面展厅”" }));
    expect(backend.openProject).toHaveBeenCalledWith("E:\\Twin Projects\\桌面展厅.twinproj");
    expect(await screen.findByRole("heading", { name: "桌面展厅" })).toBeVisible();
  });

  it("shows a safe localized desktop error descriptor and log reference inside the create dialog", async () => {
    const backend = createDesktopBackend();
    vi.mocked(backend.createProject).mockRejectedValueOnce(
      new ProjectBackendError(
        "PROJECT_ALREADY_EXISTS",
        "目标位置已经存在同名项目",
        { retryable: false, recoveryRequired: false },
        "native-create-conflict",
      ),
    );
    render(<App backend={backend} />);

    const dialog = await openCreateDialog("showroom");
    await userEvent.type(within(dialog).getByLabelText("项目名称"), "重复展厅");
    openFolderDialog.mockResolvedValueOnce("E:\\Twin Projects");
    await userEvent.click(within(dialog).getByRole("button", { name: "选择项目位置" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "创建项目" }));

    const message = await within(dialog).findByText("该位置已有同名项目。");
    const alert = message.closest<HTMLElement>('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert).toHaveTextContent("native-create-conflict");
    expect(within(dialog).queryByText("目标位置已经存在同名项目")).not.toBeInTheDocument();
    expect(dialog).toBeVisible();
  });

  it("keeps ordinary desktop create errors generic and never renders their internal message", async () => {
    const backend = createDesktopBackend();
    const internalMessage = "sqlite failed at E:\\sensitive\\private.db";
    vi.mocked(backend.createProject).mockRejectedValueOnce(new Error(internalMessage));
    render(<App backend={backend} />);

    const dialog = await openCreateDialog("market");
    await userEvent.type(within(dialog).getByLabelText("项目名称"), "安全错误市集");
    openFolderDialog.mockResolvedValueOnce("E:\\Twin Projects");
    await userEvent.click(within(dialog).getByRole("button", { name: "选择项目位置" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "创建项目" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("操作未能完成，请重试。");
    expect(document.body).not.toHaveTextContent(internalMessage);
    expect(dialog).toBeVisible();
  });

  it("does not trust a spoofed ProjectBackendError shape from an ordinary Error", async () => {
    const backend = createDesktopBackend();
    const internalMessage = "sqlite failed at E:\\sensitive\\spoofed.db";
    const spoofedLogRef = "spoofed-native-log-ref";
    const spoofedError = Object.assign(new Error(internalMessage), {
      name: "ProjectBackendError",
      code: "PROJECT_ALREADY_EXISTS",
      details: { secretPath: "E:\\sensitive\\spoofed.db" },
      logRef: spoofedLogRef,
    });
    vi.mocked(backend.createProject).mockRejectedValueOnce(spoofedError);
    render(<App backend={backend} />);

    const dialog = await openCreateDialog("showroom");
    await userEvent.type(within(dialog).getByLabelText("项目名称"), "伪造错误展厅");
    openFolderDialog.mockResolvedValueOnce("E:\\Twin Projects");
    await userEvent.click(within(dialog).getByRole("button", { name: "选择项目位置" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "创建项目" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("该位置已有同名项目。");
    expect(document.body).not.toHaveTextContent(internalMessage);
    expect(document.body).not.toHaveTextContent(spoofedLogRef);
    expect(dialog).toBeVisible();
  });

  it("opens an existing desktop project through its own folder-dialog entry without requiring a recent project", async () => {
    const projects = new Map<string, OpenedProject>();
    const backend = createDesktopBackend(projects);
    await backend.createProject({
      name: "Demo",
      location: "E:\\Existing",
      profile: "showroom",
    });
    vi.mocked(backend.createProject).mockClear();
    render(<App backend={backend} />);

    const openProject = await screen.findByRole("button", { name: "打开本地项目" });
    expect(openProject).toBeEnabled();
    expect(screen.queryByText("Demo")).not.toBeInTheDocument();

    openFolderDialog.mockResolvedValueOnce(null);
    await userEvent.click(openProject);
    expect(openFolderDialog).toHaveBeenLastCalledWith(
      expect.objectContaining({ directory: true }),
    );
    expect(backend.openProject).not.toHaveBeenCalled();

    openFolderDialog.mockResolvedValueOnce("E:\\Existing\\Demo.twinproj");
    await userEvent.click(openProject);
    expect(backend.openProject).toHaveBeenCalledOnce();
    expect(backend.openProject).toHaveBeenCalledWith("E:\\Existing\\Demo.twinproj");
    expect(await screen.findByRole("heading", { name: "Demo" })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(await screen.findByText("Demo")).toBeVisible();
    expect(window.localStorage.length).toBeGreaterThan(0);
  });

  it("shows an actionable native open error with its log reference without mounting the overview", async () => {
    const backend = createDesktopBackend();
    vi.mocked(backend.openProject).mockRejectedValueOnce(
      Object.assign(new Error("项目结构无效或不完整"), {
        code: "INVALID_PROJECT_STRUCTURE",
        details: { retryable: false, recoveryRequired: false },
        logRef: "native-open-corrupt",
      }),
    );
    render(<App backend={backend} />);
    openFolderDialog.mockResolvedValueOnce("E:\\Existing\\Corrupt.twinproj");

    await userEvent.click(await screen.findByRole("button", { name: "打开本地项目" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("项目恢复未完成，请确认项目未在其他窗口中使用后重试。");
    expect(alert).not.toHaveTextContent("项目结构无效或不完整");
    expect(screen.queryByRole("main", { name: "二维平面编辑器" })).not.toBeInTheDocument();
  });

  it("persists desktop recent paths in application-local preferences and reopens them after remount", async () => {
    const projects = new Map<string, OpenedProject>();
    const firstBackend = createDesktopBackend(projects);
    const first = render(<App backend={firstBackend} />);
    await openCreateDialog("market");
    await userEvent.type(screen.getByLabelText("项目名称"), "持久市集");
    openFolderDialog.mockResolvedValueOnce("D:\\AetherTwin");
    await userEvent.click(screen.getByRole("button", { name: "选择项目位置" }));
    await userEvent.click(screen.getByRole("button", { name: "创建项目" }));
    await userEvent.click(await screen.findByRole("button", { name: "关闭" }));
    expect(window.localStorage.length).toBeGreaterThan(0);
    first.unmount();
    await Promise.resolve();

    const secondBackend = createDesktopBackend(projects);
    render(<App backend={secondBackend} />);
    expect(await screen.findByText("持久市集")).toBeVisible();
    expect(document.body).not.toHaveTextContent(/沙盒/);
    await userEvent.click(screen.getByRole("button", { name: "重新打开“持久市集”" }));

    expect(secondBackend.openProject).toHaveBeenCalledWith(
      "D:\\AetherTwin\\持久市集.twinproj",
    );
    expect(await screen.findByRole("heading", { name: "持久市集" })).toBeVisible();
  });

  it.each([
    ["PROJECT_NOT_FOUND", "项目不存在", "丢失展厅"],
  ] as const)(
    "removes a stale desktop recent after %s and persists the removal",
    async (code, message, projectName) => {
      const backend = createDesktopBackend();
      render(<App backend={backend} />);
      const dialog = await openCreateDialog("showroom");
      await userEvent.type(within(dialog).getByLabelText("项目名称"), projectName);
      openFolderDialog.mockResolvedValueOnce("E:\\Twin Projects");
      await userEvent.click(within(dialog).getByRole("button", { name: "选择项目位置" }));
      await userEvent.click(within(dialog).getByRole("button", { name: "创建项目" }));
      await userEvent.click(await screen.findByRole("button", { name: "关闭" }));

      const projectPath = `E:\\Twin Projects\\${projectName}.twinproj`;
      vi.mocked(backend.openProject).mockRejectedValueOnce(
        new ProjectBackendError(
          code,
          message,
          { retryable: false, recoveryRequired: false },
          `native-stale-${code.toLowerCase()}`,
        ),
      );
      await userEvent.click(screen.getByRole("button", { name: `重新打开“${projectName}”` }));

      expect(await screen.findByRole("alert")).toHaveTextContent("找不到该项目。");
      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: `重新打开“${projectName}”` }),
        ).not.toBeInTheDocument(),
      );
      const persisted = JSON.parse(
        window.localStorage.getItem("aethertwin.recentProjects.v1") ?? "[]",
      ) as Array<{ path?: string }>;
      expect(persisted.map((entry) => entry.path)).not.toContain(projectPath);
    },
  );

  it("keeps an INVALID_PROJECT_STRUCTURE recent while showing its actionable error", async () => {
    const backend = createDesktopBackend();
    render(<App backend={backend} />);
    const dialog = await openCreateDialog("showroom");
    await userEvent.type(within(dialog).getByLabelText("项目名称"), "损坏展厅");
    openFolderDialog.mockResolvedValueOnce("E:\\Twin Projects");
    await userEvent.click(within(dialog).getByRole("button", { name: "选择项目位置" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "创建项目" }));
    await userEvent.click(await screen.findByRole("button", { name: "关闭" }));

    const projectPath = "E:\\Twin Projects\\损坏展厅.twinproj";
    vi.mocked(backend.openProject).mockRejectedValueOnce(
      new ProjectBackendError(
        "INVALID_PROJECT_STRUCTURE",
        "项目结构无效或不完整",
        { retryable: false, recoveryRequired: false },
        "native-invalid-recent",
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: "重新打开“损坏展厅”" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("项目恢复未完成，请确认项目未在其他窗口中使用后重试。");
    expect(screen.getByRole("button", { name: "重新打开“损坏展厅”" })).toBeEnabled();
    const persisted = JSON.parse(
      window.localStorage.getItem("aethertwin.recentProjects.v1") ?? "[]",
    ) as Array<{ path?: string }>;
    expect(persisted.map((entry) => entry.path)).toContain(projectPath);
  });

  it("offers only stale-lock recovery, requires confirmation, and enters the recovered editor", async () => {
    const projects = new Map<string, OpenedProject>();
    const backend = createDesktopBackend(projects);
    const created = await backend.createProject({
      name: "可恢复展厅",
      location: "E:\\Twin Projects",
      profile: "showroom",
    });
    vi.mocked(backend.openProject).mockRejectedValueOnce(
      new ProjectBackendError(
        "STALE_PROJECT_LOCK",
        "检测到未正常关闭的项目",
        { retryable: false, recoveryRequired: true },
        "native-stale-lock",
      ),
    );
    render(<App backend={backend} />);
    openFolderDialog.mockResolvedValueOnce(created.projectPath);

    await userEvent.click(screen.getByRole("button", { name: "打开本地项目" }));
    expect(await screen.findByRole("button", { name: "恢复项目" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("项目恢复未完成，请确认项目未在其他窗口中使用后重试。");

    await userEvent.click(screen.getByRole("button", { name: "恢复项目" }));
    expect(screen.getByRole("dialog", { name: "确认恢复项目" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "确认恢复" }));

    expect(backend.recoverProject).toHaveBeenCalledWith(created.projectPath, {
      confirmed: true,
    });
    expect(await screen.findByRole("heading", { name: "可恢复展厅" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("已恢复");
  });

  it("removes stale recovery eligibility when confirmed recovery returns an active lock", async () => {
    const projects = new Map<string, OpenedProject>();
    const backend = createDesktopBackend(projects);
    const created = await backend.createProject({
      name: "恢复竞态",
      location: "E:\\Twin Projects",
      profile: "showroom",
    });
    vi.mocked(backend.openProject).mockRejectedValueOnce(
      new ProjectBackendError(
        "STALE_PROJECT_LOCK",
        "检测到未正常关闭的项目",
        { retryable: false, recoveryRequired: true },
        "native-stale-lock",
      ),
    );
    vi.mocked(backend.recoverProject).mockRejectedValueOnce(
      new ProjectBackendError(
        "PROJECT_LOCKED",
        "项目正在被另一个会话使用",
        { retryable: false, recoveryRequired: false },
        "native-active-lock",
      ),
    );
    render(<App backend={backend} />);
    openFolderDialog.mockResolvedValueOnce(created.projectPath);

    await userEvent.click(screen.getByRole("button", { name: "打开本地项目" }));
    await userEvent.click(await screen.findByRole("button", { name: "恢复项目" }));
    await userEvent.click(screen.getByRole("button", { name: "确认恢复" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("该项目正在其他窗口中使用，请关闭后重试。");
    });
    expect(screen.queryByRole("button", { name: "恢复项目" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AetherTwin Studio" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: created.snapshot.project.name }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["PROJECT_LOCKED", { recoveryRequired: false }],
    ["INVALID_PROJECT_STRUCTURE", { recoveryRequired: false }],
    ["UNSUPPORTED_SCHEMA_VERSION", { recoveryRequired: false }],
    ["PROJECT_NOT_FOUND", { recoveryRequired: false }],
    ["STALE_PROJECT_LOCK", { recoveryRequired: false }],
  ] as const)("does not offer recovery for ineligible %s errors", async (code, details) => {
    const backend = createDesktopBackend();
    vi.mocked(backend.openProject).mockRejectedValueOnce(
      new ProjectBackendError(code, "无法打开项目", details, "native-ineligible"),
    );
    render(<App backend={backend} />);
    openFolderDialog.mockResolvedValueOnce("E:\\Twin Projects\\Ineligible.twinproj");

    await userEvent.click(screen.getByRole("button", { name: "打开本地项目" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByRole("button", { name: "恢复项目" })).not.toBeInTheDocument();
  });

  it("fails safe when desktop application-local preferences are unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("storage blocked", "SecurityError");
    });

    render(<App backend={createDesktopBackend()} />);
    expect(await screen.findByRole("heading", { name: "AetherTwin Studio" })).toBeVisible();
    expect(screen.getByText("本地项目 · 持久保存")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("focuses the name through Dialog entry and restores the real creation opener", async () => {
    render(<App forceBackend="sandbox" />);
    const opener = await screen.findByRole("button", { name: "新建展厅" });

    await userEvent.click(opener);
    let dialog = screen.getByRole("dialog", { name: "新建项目" });
    let nameField = within(dialog).getByLabelText("项目名称");
    expect(nameField).toHaveFocus();
    expect(nameField).not.toHaveAttribute("autofocus");

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "新建项目" })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();

    await userEvent.click(opener);
    dialog = screen.getByRole("dialog", { name: "新建项目" });
    nameField = within(dialog).getByLabelText("项目名称");
    expect(nameField).toHaveFocus();
    expect(nameField).not.toHaveAttribute("autofocus");
    await userEvent.click(within(dialog).getByRole("button", { name: "关闭" }));

    expect(screen.queryByRole("dialog", { name: "新建项目" })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
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

    expect(await screen.findByRole("main", { name: "二维平面编辑器" })).toBeVisible();
    expect(screen.queryByText("项目名称不能超过 80 个字符")).not.toBeInTheDocument();
  });

  it("rejects 81 Unicode code points", async () => {
    render(<App forceBackend="sandbox" />);
    await openCreateDialog("showroom");
    await submitName("𠮷".repeat(81));

    expect(await screen.findByText("项目名称不能超过 80 个字符")).toBeVisible();
  });

  it("creates a market project through ProjectStore and enters the real 2D PlanEditor", async () => {
    render(<App forceBackend="sandbox" />);
    await openCreateDialog("market");
    await submitName("夏日市集");

    expect(await screen.findByRole("heading", { name: "夏日市集" })).toBeVisible();
    expect(screen.getByRole("main", { name: "二维平面编辑器" })).toBeVisible();
    expect(within(screen.getByRole("banner")).getByText("市集")).toBeVisible();
    expect(within(screen.getByRole("navigation", { name: "项目树" })).getByText("一层")).toBeVisible();
    expect(within(screen.getByRole("complementary", { name: "检查器" })).getByText("sandbox://00000000-0000-4000-8000-000000000001")).toBeVisible();
    expect(screen.queryByText(/BIM|IoT|3DGS|点云|三维场景/)).not.toBeInTheDocument();
  });

  it("wires PlanEditor editing, undo, redo, and save to the real ProjectStore", async () => {
    render(<App forceBackend="sandbox" />);
    await openCreateDialog("showroom");
    await submitName("初始展厅");

    const nameField = await screen.findByLabelText("项目名称");
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
    const open = screen.getByRole("button", { name: "打开演示沙盒项目" });
    expect(open).toBeEnabled();
    await userEvent.click(open);

    expect(await screen.findByRole("heading", { name: "可重开市集" })).toBeVisible();
    expect(within(screen.getByRole("banner")).getByText("市集")).toBeVisible();
  });

  it("refreshes the recent project identity from the renamed snapshot before close", async () => {
    const backend = new SandboxProjectBackend();
    const checkpoint = vi.spyOn(backend, "checkpoint");
    render(<App backend={backend} />);
    await openCreateDialog("showroom");
    await submitName("旧展厅名");

    const nameField = await screen.findByLabelText("项目名称");
    await userEvent.clear(nameField);
    await userEvent.type(nameField, "新展厅名");
    await userEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(await screen.findByText("新展厅名")).toBeVisible();
    expect(screen.queryByText("旧展厅名")).not.toBeInTheDocument();
    expect(checkpoint).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "打开演示沙盒项目" }));
    expect(await screen.findByRole("heading", { name: "新展厅名" })).toBeVisible();
  });

  it("keeps the editor open when blur rename fails immediately before Close", async () => {
    const backend = new SandboxProjectBackend();
    const checkpoint = vi.spyOn(backend, "checkpoint");
    const close = vi.spyOn(backend, "closeProject");
    render(<App backend={backend} />);
    await openCreateDialog("showroom");
    await submitName("可靠展厅");

    const nameField = await screen.findByLabelText("项目名称");
    await userEvent.clear(nameField);
    await userEvent.type(nameField, "失败重命名");
    backend.failNextCommit = new Error("rename failed");

    await userEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(screen.getByRole("main", { name: "二维平面编辑器" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "可靠展厅" })).toBeVisible();
    const inspector = document.querySelector<HTMLElement>('aside[aria-label="检查器"]');
    expect(inspector).not.toBeNull();
    const inspectorQueries = within(inspector!);
    expect(await inspectorQueries.findByRole("alert")).toHaveTextContent("rename failed");
    const failedNameField = inspectorQueries.getByLabelText("项目名称");
    expect(failedNameField).toHaveValue("失败重命名");
    expect(failedNameField).toHaveAttribute("aria-invalid", "true");
    const descriptionIds = failedNameField.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(
      descriptionIds.some(
        (id) => document.getElementById(id)?.textContent === "rename failed",
      ),
    ).toBe(true);
    expect(checkpoint).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "打开演示沙盒项目" })).not.toBeInTheDocument();
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

    const nameField = screen.getByLabelText("项目名称");
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

  it("calls an optional backend dispose exactly once on the final StrictMode unmount", async () => {
    const backend = Object.assign(createDesktopBackend(), {
      dispose: vi.fn(async () => undefined),
    });
    const rendered = render(
      <StrictMode>
        <App backend={backend} />
      </StrictMode>,
    );
    expect(await screen.findByRole("heading", { name: "AetherTwin Studio" })).toBeVisible();

    rendered.unmount();

    await waitFor(() => expect(backend.dispose).toHaveBeenCalledOnce());
  });

  it("retries an optional backend dispose once when final teardown initially fails", async () => {
    const backend = Object.assign(createDesktopBackend(), {
      dispose: vi
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error("native cleanup unavailable"))
        .mockResolvedValueOnce(undefined),
    });
    const rendered = render(
      <StrictMode>
        <App backend={backend} />
      </StrictMode>,
    );
    expect(await screen.findByRole("heading", { name: "AetherTwin Studio" })).toBeVisible();

    rendered.unmount();

    await waitFor(() => expect(backend.dispose).toHaveBeenCalledTimes(2));
  });

  it("keeps inspector name and tag errors associated with only their own field", async () => {
    const backend = new SandboxProjectBackend();
    render(<App backend={backend} />);
    await openCreateDialog("market");
    await submitName("检查器市集");

    const inspector = document.querySelector<HTMLElement>('aside[aria-label="检查器"]');
    expect(inspector).not.toBeNull();
    const inspectorQueries = within(inspector!);
    const nameField = await inspectorQueries.findByLabelText("项目名称");
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
    expect(
      screen.getByText("保存失败", { selector: '[data-save-state="error"]' }),
    ).toHaveAttribute("role", "alert");

    fireEvent.change(tagsField, { target: { value: "" } });
    fireEvent.blur(tagsField);
    await waitFor(() => expect(tagsField).not.toHaveAttribute("aria-invalid"));
    expect(inspectorQueries.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByText("保存失败", { selector: '[data-save-state="error"]' }),
    ).toHaveAttribute("role", "alert");
  });

  it("clears a stale recent-project open error when starting a new create flow", async () => {
    const backend = new SandboxProjectBackend();
    render(<App backend={backend} />);
    await openCreateDialog("market");
    await submitName("可重试市集");
    await userEvent.click(await screen.findByRole("button", { name: "关闭" }));

    vi.spyOn(backend, "openProject").mockRejectedValueOnce(new Error("cannot reopen"));
    await userEvent.click(screen.getByRole("button", { name: "打开演示沙盒项目" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("操作未能完成，请重试。");

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
    expect(await screen.findByText("还没有演示沙盒项目")).toBeVisible();
    expect(screen.queryByText("临时市集")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开演示沙盒项目" })).toBeDisabled();
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
  it("accepts both ProjectBackend modes at the typed injection seam without starting I/O", async () => {
    type AppBackend = NonNullable<ComponentProps<typeof App>["backend"]>;
    const sandboxBackend: AppBackend = new SandboxProjectBackend();
    const desktopBackend: AppBackend = createDesktopBackend();

    const sandbox = render(<App backend={sandboxBackend} />);
    expect(await screen.findByRole("heading", { name: "AetherTwin Studio" })).toBeVisible();
    sandbox.unmount();
    render(<App backend={desktopBackend} />);
    expect(await screen.findByRole("heading", { name: "AetherTwin Studio" })).toBeVisible();
    expect(desktopBackend.createProject).not.toHaveBeenCalled();
    expect(desktopBackend.openProject).not.toHaveBeenCalled();
    expect(desktopBackend.commit).not.toHaveBeenCalled();
    expect(desktopBackend.checkpoint).not.toHaveBeenCalled();
    expect(desktopBackend.closeProject).not.toHaveBeenCalled();
  });

  it("selects a sandbox backend asynchronously for the development web entry", async () => {
    const backend = await selectBackend("sandbox");
    expect(backend.projectBackend).toBeInstanceOf(SandboxProjectBackend);
    expect(backend.projectBackend.mode).toBe("sandbox");
  });

  it("renders a fail-closed bootstrap error instead of project actions when production sandbox is forced", async () => {
    vi.stubEnv("DEV", false);
    render(<App forceBackend="sandbox" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("操作未能完成，请重试。");
    expect(screen.queryByRole("heading", { name: "AetherTwin Studio" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "项目操作" })).not.toBeInTheDocument();
    expect(openFolderDialog).not.toHaveBeenCalled();
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
