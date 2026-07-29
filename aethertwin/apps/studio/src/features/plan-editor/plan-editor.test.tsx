// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Fixture } from "@aethertwin/core-model";
import {
  ProjectStore,
  SandboxProjectBackend,
  type OpenedProject,
} from "@aethertwin/project-store";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectBackendError } from "../../backend/tauri-backend";
import { PlanEditor } from "./plan-editor";
import { renderPlanEditorFixture } from "./plan-editor.test-support";

vi.mock("@aethertwin/render-plan-2d", () => ({
  PixiPlanRenderer: class {
    async init(): Promise<void> {}
    update(): void {}
    resize(): void {}
    destroy(): void {}
  },
}));

class PlanEditorResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

const stores: ProjectStore[] = [];

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", PlanEditorResizeObserver);
});

function track(store: ProjectStore): ProjectStore {
  stores.push(store);
  return store;
}

function saveStatus(state: "dirty" | "saving" | "saved" | "error" | "recovered") {
  const status = document.querySelector<HTMLElement>(`[data-save-state="${state}"]`);
  if (status === null) throw new Error(`Missing ${state} save status`);
  return status;
}

async function sandboxProject(
  name = "Old",
  options: ConstructorParameters<typeof ProjectStore>[1] = { autosaveDelayMs: 60_000 },
) {
  const backend = new SandboxProjectBackend();
  const store = track(new ProjectStore(backend, options));
  await store.create({ name, location: "sandbox", profile: "showroom" });
  return { backend, store };
}

afterEach(async () => {
  cleanup();
  await Promise.allSettled(stores.splice(0).map((store) => store.dispose()));
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PlanEditor M0 behavior contract", () => {
  it("renders the real project tree and read-only M0 metadata while the Inspector edits only name and tags", async () => {
    const { store } = await sandboxProject("北岸展厅");
    await store.setProjectTags(["featured", "north"]);
    render(<PlanEditor store={store} />);

    const tree = screen.getByRole("tree", { name: "楼层和空间" });
    expect(
      within(screen.getByRole("navigation", { name: "项目树" })).getByText("北岸展厅"),
    ).toBeVisible();
    expect(within(tree).getByText("一层")).toBeVisible();

    const workspace = screen.getByRole("main", { name: "二维平面编辑器" });
    expect(workspace).toHaveTextContent("选择工具");
    expect(workspace).not.toHaveTextContent("M0 OVERVIEW");

    const inspector = screen.getByRole("complementary", { name: "检查器" });
    expect(within(inspector).getByLabelText("项目名称")).toHaveValue("北岸展厅");
    expect(within(inspector).getByLabelText("项目标签")).toHaveValue("featured, north");
    expect(inspector).toHaveTextContent("showroom");
    expect(inspector).toHaveTextContent(/Schema\s*3/i);
    expect(inspector).toHaveTextContent("未保存");
    expect(inspector).toHaveTextContent(/sandbox/i);
    expect(inspector).toHaveTextContent("项目位置");
    expect(within(inspector).getAllByRole("textbox")).toHaveLength(2);
    expect(within(inspector).queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("renames only through the ProjectStore CommandBus and supports undo, redo, and manual save", async () => {
    const { backend, store } = await sandboxProject();
    const commit = vi.spyOn(backend, "commit");
    const checkpoint = vi.spyOn(backend, "checkpoint");
    render(<PlanEditor store={store} />);
    const user = userEvent.setup();

    expect(screen.getByRole("button", { name: "撤销" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "重做" })).toBeDisabled();
    const name = screen.getByLabelText("项目名称");
    await user.clear(name);
    await user.type(name, "New");
    await user.click(screen.getByRole("button", { name: "应用名称" }));

    await waitFor(() => expect(commit).toHaveBeenCalledOnce());
    expect(commit.mock.calls[0]?.[1].journal).toEqual([
      expect.objectContaining({
        commandType: "project.rename",
        payload: { name: "New" },
        inversePayload: { name: "Old" },
        action: "apply",
      }),
    ]);
    expect(saveStatus("dirty")).toHaveTextContent("未保存");
    expect(screen.getByRole("button", { name: "撤销" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "撤销" }));
    await waitFor(() => expect(screen.getByLabelText("项目名称")).toHaveValue("Old"));
    expect(screen.getByRole("button", { name: "重做" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "重做" }));
    await waitFor(() => expect(screen.getByLabelText("项目名称")).toHaveValue("New"));

    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(checkpoint).toHaveBeenCalledOnce());
    await waitFor(() => expect(saveStatus("saved")).toHaveTextContent("已保存"));
    expect(store.getState().snapshot?.project.name).toBe("New");
  });

  it("normalizes and applies tags through the project.tags.set command", async () => {
    const { backend, store } = await sandboxProject("标签展厅");
    const commit = vi.spyOn(backend, "commit");
    render(<PlanEditor store={store} />);
    const user = userEvent.setup();

    const tags = screen.getByLabelText("项目标签");
    await user.type(tags, " featured, north, featured,  ");
    await user.click(screen.getByRole("button", { name: "应用标签" }));

    await waitFor(() => expect(commit).toHaveBeenCalledOnce());
    expect(commit.mock.calls[0]?.[1].journal).toEqual([
      expect.objectContaining({
        commandType: "project.tags.set",
        payload: { tags: ["featured", "north"] },
        inversePayload: { tags: [] },
        action: "apply",
      }),
    ]);
    await waitFor(() => expect(screen.getByLabelText("项目标签")).toHaveValue("featured, north"));
    expect(store.getState().snapshot?.project.tags).toEqual(["featured", "north"]);
  });

  it("autosaves a dirty edit after the configured delay without requiring the manual Save button", async () => {
    vi.useFakeTimers();
    const { backend, store } = await sandboxProject("自动保存", { autosaveDelayMs: 25 });
    const checkpoint = vi.spyOn(backend, "checkpoint");
    render(<PlanEditor store={store} />);

    fireEvent.change(screen.getByLabelText("项目名称"), {
      target: { value: "自动保存完成" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "应用名称" }));
      await store.flush();
    });
    expect(saveStatus("dirty")).toHaveTextContent("未保存");
    expect(checkpoint).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25);
      await store.flush();
    });
    expect(checkpoint).toHaveBeenCalledOnce();
    expect(saveStatus("saved")).toHaveTextContent("已保存");
  });

  it("shows a safe autosave checkpoint message and log reference", async () => {
    vi.useFakeTimers();
    const { backend, store } = await sandboxProject("自动保存失败", { autosaveDelayMs: 25 });
    const secretPath = "E:\\sensitive\\project.db";
    const checkpointFailure = Object.assign(new Error("无法自动保存项目"), {
      code: "CHECKPOINT_FAILED",
      details: { path: secretPath },
      logRef: "native-autosave-checkpoint",
    });
    const checkpoint = vi.spyOn(backend, "checkpoint").mockRejectedValueOnce(checkpointFailure);
    render(<PlanEditor store={store} />);

    fireEvent.change(screen.getByLabelText("项目名称"), {
      target: { value: "等待重试" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "应用名称" }));
      await store.flush();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25);
      await store.flush();
    });

    expect(checkpoint).toHaveBeenCalledOnce();
    const message = screen.getByText("无法自动保存项目");
    const alert = message.closest<HTMLElement>('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert).toHaveTextContent("native-autosave-checkpoint");
    expect(document.body).not.toHaveTextContent(secretPath);
  });

  it("allows a failed manual checkpoint to be retried from Save", async () => {
    const { backend, store } = await sandboxProject("手动保存重试");
    const checkpointProject = backend.checkpoint.bind(backend);
    const checkpoint = vi
      .spyOn(backend, "checkpoint")
      .mockRejectedValueOnce(new Error("manual checkpoint failed"))
      .mockImplementation(checkpointProject);
    render(<PlanEditor store={store} />);

    fireEvent.change(screen.getByLabelText("项目名称"), {
      target: { value: "手动保存重试成功" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "应用名称" }));
      await store.flush();
    });

    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByText("manual checkpoint failed")).toBeVisible();
    expect(saveStatus("error")).toHaveTextContent("保存失败");

    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(checkpoint).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(saveStatus("saved")).toHaveTextContent("已保存"));
    expect(screen.queryByText("manual checkpoint failed")).not.toBeInTheDocument();
  });

  it("syncs the current snapshot before Back closes a project with an active save error", async () => {
    const { backend, store } = await sandboxProject("Old");
    const checkpoint = vi
      .spyOn(backend, "checkpoint")
      .mockRejectedValueOnce(new Error("save failed"));
    const close = vi.spyOn(backend, "closeProject");
    const onBack = vi.fn();
    const observedNames: string[] = [];
    render(
      <PlanEditor
        store={store}
        onBeforeClose={() => {
          observedNames.push(store.getState().snapshot?.project.name ?? "missing");
        }}
        onBack={onBack}
      />,
    );

    fireEvent.change(screen.getByLabelText("项目名称"), {
      target: { value: "New" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "应用名称" }));
      await store.flush();
    });
    expect(store.getState().snapshot?.project.name).toBe("New");

    await userEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByText("save failed")).toBeVisible();
    expect(checkpoint).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("button", { name: "返回" }));

    await waitFor(() => expect(onBack).toHaveBeenCalledOnce());
    expect(observedNames).toEqual(["New"]);
    expect(close).toHaveBeenCalledOnce();
    expect(store.getState().snapshot).toBeNull();
  });

  it("keeps the overview open after a close checkpoint failure and retries the whole close flow", async () => {
    const { backend, store } = await sandboxProject("关闭保存重试");
    const checkpointProject = backend.checkpoint.bind(backend);
    const checkpoint = vi
      .spyOn(backend, "checkpoint")
      .mockRejectedValueOnce(new Error("close checkpoint failed"))
      .mockImplementation(checkpointProject);
    const close = vi.spyOn(backend, "closeProject");

    function Host() {
      const [atCenter, setAtCenter] = useState(false);
      return atCenter ? (
        <main><h1>AetherTwin Studio</h1></main>
      ) : (
        <PlanEditor store={store} onBack={() => setAtCenter(true)} />
      );
    }

    render(<Host />);
    await userEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(await screen.findByText("close checkpoint failed")).toBeVisible();
    expect(screen.getByRole("main", { name: "二维平面编辑器" })).toBeVisible();
    expect(close).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(await screen.findByRole("heading", { name: "AetherTwin Studio" })).toBeVisible();
    expect(checkpoint).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps the overview open after close fails and retries the backend close", async () => {
    const { backend, store } = await sandboxProject("关闭重试");
    const closeProject = backend.closeProject.bind(backend);
    const close = vi
      .spyOn(backend, "closeProject")
      .mockRejectedValueOnce(new Error("native close failed"))
      .mockImplementation(closeProject);

    function Host() {
      const [atCenter, setAtCenter] = useState(false);
      return atCenter ? (
        <main><h1>AetherTwin Studio</h1></main>
      ) : (
        <PlanEditor store={store} onBack={() => setAtCenter(true)} />
      );
    }

    render(<Host />);
    await userEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(await screen.findByText("native close failed")).toBeVisible();
    expect(screen.getByRole("main", { name: "二维平面编辑器" })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(await screen.findByRole("heading", { name: "AetherTwin Studio" })).toBeVisible();
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("associates simultaneous name and tag errors with only their own inspector field", async () => {
    const { backend, store } = await sandboxProject("检查器错误");
    const commit = vi.spyOn(backend, "commit");
    render(<PlanEditor store={store} />);

    const nameField = screen.getByLabelText("项目名称");
    const tagsField = screen.getByLabelText("项目标签");
    fireEvent.change(nameField, { target: { value: "CON" } });
    fireEvent.blur(nameField);
    expect(await screen.findByText("项目名称不能使用 Windows 保留设备名")).toBeVisible();

    backend.failNextCommit = new Error("tag commit failed");
    fireEvent.change(tagsField, { target: { value: "featured" } });
    fireEvent.blur(tagsField);
    await waitFor(() => expect(commit).toHaveBeenCalledOnce());

    const describedText = (field: HTMLElement) =>
      (field.getAttribute("aria-describedby")?.split(" ") ?? [])
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ");
    expect(nameField).toHaveAttribute("aria-invalid", "true");
    expect(tagsField).toHaveAttribute("aria-invalid", "true");
    expect(describedText(nameField)).toContain("项目名称不能使用 Windows 保留设备名");
    expect(describedText(nameField)).not.toContain("tag commit failed");
    expect(describedText(tagsField)).toContain("tag commit failed");
    expect(describedText(tagsField)).not.toContain("项目名称不能使用 Windows 保留设备名");
  });

  it.each([
    [
      "different messages",
      "项目名称提交失败",
      "项目标签提交失败",
      "native-name-different",
      "native-tags-different",
    ],
    [
      "the same message",
      "项目提交失败",
      "项目提交失败",
      "native-name-same-message",
      "native-tags-same-message",
    ],
  ] as const)(
    "preserves each field's own native log reference across consecutive failures with %s",
    async (_case, nameMessage, tagsMessage, nameLogRef, tagsLogRef) => {
      const { backend, store } = await sandboxProject("连续错误展厅");
      const commit = vi.spyOn(backend, "commit");
      render(<PlanEditor store={store} />);

      const inspector = screen.getByRole("complementary", { name: "检查器" });
      const nameField = within(inspector).getByLabelText("项目名称");
      const tagsField = within(inspector).getByLabelText("项目标签");
      backend.failNextCommit = new ProjectBackendError(
        "COMMIT_FAILED",
        nameMessage,
        { retryable: true, recoveryRequired: false },
        nameLogRef,
      );
      fireEvent.change(nameField, { target: { value: "失败名称" } });
      fireEvent.click(within(inspector).getByRole("button", { name: "应用名称" }));
      await waitFor(() => expect(commit).toHaveBeenCalledOnce());

      backend.failNextCommit = new ProjectBackendError(
        "COMMIT_FAILED",
        tagsMessage,
        { retryable: true, recoveryRequired: false },
        tagsLogRef,
      );
      fireEvent.change(tagsField, { target: { value: "featured" } });
      fireEvent.click(within(inspector).getByRole("button", { name: "应用标签" }));
      await waitFor(() => expect(commit).toHaveBeenCalledTimes(2));

      const describedText = (field: HTMLElement) =>
        (field.getAttribute("aria-describedby")?.split(" ") ?? [])
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ");
      const nameDescription = describedText(nameField);
      const tagsDescription = describedText(tagsField);
      expect(nameField).toHaveAttribute("aria-invalid", "true");
      expect(tagsField).toHaveAttribute("aria-invalid", "true");
      expect(nameDescription).toContain(nameMessage);
      expect(nameDescription).toContain(nameLogRef);
      expect(nameDescription).not.toContain(tagsLogRef);
      expect(tagsDescription).toContain(tagsMessage);
      expect(tagsDescription).toContain(tagsLogRef);
      expect(tagsDescription).not.toContain(nameLogRef);
    },
  );

  it("closes the backend project before invoking Back so the host can return to project center", async () => {
    const { backend, store } = await sandboxProject("可关闭展厅");
    const close = vi.spyOn(backend, "closeProject");

    function Host() {
      const [atCenter, setAtCenter] = useState(false);
      return atCenter ? (
        <main><h1>AetherTwin Studio</h1></main>
      ) : (
        <PlanEditor store={store} onBack={() => setAtCenter(true)} />
      );
    }

    render(<Host />);
    await userEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(await screen.findByRole("heading", { name: "AetherTwin Studio" })).toBeVisible();
    expect(close).toHaveBeenCalledWith(expect.stringMatching(/^sandbox:\/\//));
    expect(store.getState().projectPath).toBeNull();
  });

  it("presents recovered projects as a success state and never applies the error glow", async () => {
    const backend = new SandboxProjectBackend();
    const opened = await backend.createProject({
      name: "恢复展厅",
      location: "sandbox",
      profile: "showroom",
    });
    vi.spyOn(backend, "openProject").mockResolvedValueOnce({ ...opened, recovered: true });
    const store = track(new ProjectStore(backend, { autosaveDelayMs: 60_000 }));
    await store.open(opened.projectPath);
    render(<PlanEditor store={store} />);

    const recovered = saveStatus("recovered");
    expect(recovered).toHaveAttribute("role", "status");
    expect(recovered).toHaveClass("aether-status-notice--recovered");
    expect(recovered).not.toHaveClass("aether-status-notice--error");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("main", { name: "二维平面编辑器" })).toBeVisible();
  });

  it("renders an actionable native error with its log reference and a working Back action", async () => {
    const { backend, store } = await sandboxProject("错误展厅");
    const onBack = vi.fn();
    backend.failNextCommit = Object.assign(new Error("项目正在由另一个会话使用"), {
      code: "PROJECT_LOCKED",
      details: { retryable: true, recoveryRequired: false },
      logRef: "native-project-locked",
    });
    render(<PlanEditor store={store} onBack={onBack} />);

    fireEvent.change(screen.getByLabelText("项目名称"), {
      target: { value: "不会生效" },
    });
    fireEvent.click(screen.getByRole("button", { name: "应用名称" }));

    const message = await screen.findByText("项目正在由另一个会话使用");
    const alert = message.closest<HTMLElement>('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert).toHaveTextContent("native-project-locked");
    await userEvent.click(screen.getByRole("button", { name: "返回" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("moves an uncleared commit error from the edited field to the workspace when local editing resumes", async () => {
    const { backend, store } = await sandboxProject("错误接管展厅");
    const commitFailure = Object.assign(new Error("项目名称提交失败"), {
      code: "COMMIT_FAILED",
      details: { retryable: true, recoveryRequired: false },
      logRef: "native-inspector-handoff",
    });
    backend.failNextCommit = commitFailure;
    const commit = vi.spyOn(backend, "commit");
    render(<PlanEditor store={store} />);

    const inspector = screen.getByRole("complementary", { name: "检查器" });
    const nameField = within(inspector).getByLabelText("项目名称");
    fireEvent.change(nameField, { target: { value: "第一次修改" } });
    fireEvent.click(within(inspector).getByRole("button", { name: "应用名称" }));

    const localMessage = await within(inspector).findByText("项目名称提交失败");
    const localAlert = localMessage.closest<HTMLElement>('[role="alert"]');
    expect(localAlert).not.toBeNull();
    expect(localAlert).toHaveTextContent("native-inspector-handoff");
    expect(nameField).toHaveAttribute("aria-invalid", "true");
    expect(store.getState().error).toBe(commitFailure);

    fireEvent.change(nameField, { target: { value: "第二次修改" } });

    await waitFor(() => expect(nameField).not.toHaveAttribute("aria-invalid"));
    expect(within(inspector).queryByText("项目名称提交失败")).not.toBeInTheDocument();
    expect(commit).toHaveBeenCalledOnce();
    expect(store.getState().error).toBe(commitFailure);

    const workspace = screen.getByRole("main");
    const workspaceMessage = await within(workspace).findByText("项目名称提交失败");
    const workspaceAlert = workspaceMessage.closest<HTMLElement>('[role="alert"]');
    expect(workspaceAlert).not.toBeNull();
    expect(workspaceAlert).toHaveTextContent("native-inspector-handoff");
  });

  it("shows an unsupported-schema error screen instead of rendering any overview data", async () => {
    const backend = new SandboxProjectBackend();
    const valid = await backend.createProject({
      name: "未来项目",
      location: "sandbox",
      profile: "market",
    });
    const unsupported = {
      ...valid,
      manifest: { ...valid.manifest, schemaVersion: 99 },
    } as unknown as OpenedProject;
    vi.spyOn(backend, "openProject").mockResolvedValueOnce(unsupported);
    const store = track(new ProjectStore(backend));
    await expect(store.open(valid.projectPath)).rejects.toThrow(/schemaVersion/i);

    render(<PlanEditor store={store} />);
    expect(screen.queryByRole("main", { name: "二维平面编辑器" })).not.toBeInTheDocument();
    expect(screen.queryByText("未来项目")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/schemaVersion/i);
    expect(screen.getByRole("button", { name: "返回" })).toBeEnabled();
  });

  it("shows a corrupt-project native error and log reference without mounting the overview", async () => {
    const backend = new SandboxProjectBackend();
    const corruptError = Object.assign(new Error("项目结构无效或不完整"), {
      code: "INVALID_PROJECT_STRUCTURE",
      details: { retryable: false, recoveryRequired: false },
      logRef: "native-corrupt-project",
    });
    vi.spyOn(backend, "openProject").mockRejectedValueOnce(corruptError);
    const store = track(new ProjectStore(backend));
    await expect(store.open("E:\\Projects\\Corrupt.twinproj")).rejects.toBe(corruptError);

    render(<PlanEditor store={store} />);
    expect(screen.queryByRole("main", { name: "二维平面编辑器" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("项目结构无效或不完整");
    expect(screen.getByRole("alert")).toHaveTextContent("native-corrupt-project");
    expect(screen.getByRole("button", { name: "返回" })).toBeEnabled();
  });
});


const toolLabels = [
  "选择",
  "平移",
  "边界",
  "墙体",
  "区域",
  "空间单元",
  "展具",
  "兴趣点",
  "尺寸",
] as const;

function rowByData(attribute: string, id: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[${attribute}="${id}"]`);
  if (row === null) throw new Error(`Missing ${attribute}=${id}`);
  return row;
}

describe("PlanEditor Task 10 shell", () => {
  it("renders a real named 2D editor with floor tree and project Inspector", () => {
    renderPlanEditorFixture();

    expect(screen.getByRole("main", { name: "二维平面编辑器" })).toBeVisible();
    expect(screen.getByRole("tree", { name: "楼层和空间" })).toBeVisible();
    expect(screen.getByRole("complementary", { name: "检查器" })).toHaveTextContent(
      "项目位置",
    );
    expect(screen.queryByText("M0 OVERVIEW")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /3D|导出|路线/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("bottom-dock")).not.toBeInTheDocument();
  });

  it.each([
    ["market", ["选择", "场地", "空间单元", "标记"]],
    ["showroom", ["选择", "建筑", "展具", "标记"]],
  ] as const)(
    "groups the same nine implemented tools for the %s profile",
    (profile, groupLabels) => {
      renderPlanEditorFixture({ profile });

      const toolbar = screen.getByRole("toolbar", { name: "平面工具" });
      expect(
        within(toolbar)
          .getAllByRole("group")
          .map((group) => group.getAttribute("aria-label")),
      ).toEqual(groupLabels);
      expect(
        within(toolbar)
          .getAllByRole("button")
          .map((button) => button.textContent),
      ).toEqual(toolLabels);
    },
  );

  it("makes every displayed tool update the Task 9 active tool", async () => {
    const user = userEvent.setup();
    const { sessionStore } = renderPlanEditorFixture();
    const tools = [
      "select",
      "pan",
      "boundary",
      "wall",
      "zone",
      "space-unit",
      "fixture",
      "poi",
      "dimension",
    ] as const;

    for (const [index, tool] of tools.entries()) {
      const label = toolLabels[index]!;
      await user.click(screen.getByRole("button", { name: label }));
      expect(sessionStore.getState().activeTool).toBe(tool);
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
  });

  it("exposes stable floor, layer, and entity rows and synchronizes Inspector context", async () => {
    const user = userEvent.setup();
    const { floorA, layerA, entities } = renderPlanEditorFixture();

    expect(rowByData("data-floor-id", floorA.id)).toBeVisible();
    expect(rowByData("data-layer-id", layerA.id)).toBeVisible();
    expect(rowByData("data-entity-id", entities[0]!.id)).toBeVisible();
    expect(screen.getByRole("complementary", { name: "检查器" })).toHaveTextContent(
      "项目位置",
    );

    await user.click(rowByData("data-floor-id", floorA.id));
    expect(screen.getByRole("complementary", { name: "检查器" })).toHaveTextContent(
      "楼层",
    );

    await user.click(rowByData("data-layer-id", layerA.id));
    expect(screen.getByRole("complementary", { name: "检查器" })).toHaveTextContent(
      "图层",
    );

    await user.click(rowByData("data-entity-id", entities[0]!.id));
    expect(screen.getByRole("complementary", { name: "检查器" })).toHaveTextContent(
      "对象",
    );

    await user.keyboard("{Shift>}");
    await user.click(rowByData("data-entity-id", entities[1]!.id));
    await user.keyboard("{/Shift}");
    expect(screen.getByRole("complementary", { name: "检查器" })).toHaveTextContent(
      "多选",
    );
  });

  it("makes visibility, locking, naming, and ordering one exact FloorChange each", async () => {
    const user = userEvent.setup();
    const { projectStore, applyFloorPatch, floorA, layerA, layerB } =
      renderPlanEditorFixture();

    const currentFloor = () =>
      projectStore
        .getState()
        .snapshot!.project.floors.find((floor) => floor.id === floorA.id)!;

    let before = currentFloor();
    await user.click(screen.getByRole("checkbox", { name: `图层可见：${layerA.name}` }));
    await waitFor(() => expect(applyFloorPatch).toHaveBeenCalledOnce());
    expect(applyFloorPatch).toHaveBeenLastCalledWith({
      floorId: floorA.id,
      before,
      after: {
        ...before,
        layers: [{ ...before.layers[0]!, visible: false }, before.layers[1]!],
      },
    });

    applyFloorPatch.mockClear();
    before = currentFloor();
    await user.click(screen.getByRole("checkbox", { name: `图层锁定：${layerA.name}` }));
    await waitFor(() => expect(applyFloorPatch).toHaveBeenCalledOnce());
    expect(applyFloorPatch).toHaveBeenLastCalledWith({
      floorId: floorA.id,
      before,
      after: {
        ...before,
        layers: [{ ...before.layers[0]!, locked: true }, before.layers[1]!],
      },
    });

    applyFloorPatch.mockClear();
    before = currentFloor();
    const name = screen.getByLabelText(`图层名称：${layerA.name}`);
    await user.clear(name);
    await user.type(name, "主陈列");
    await user.click(
      screen.getByRole("button", { name: `应用图层名称：${layerA.name}` }),
    );
    await waitFor(() => expect(applyFloorPatch).toHaveBeenCalledOnce());
    expect(applyFloorPatch).toHaveBeenLastCalledWith({
      floorId: floorA.id,
      before,
      after: {
        ...before,
        layers: [{ ...before.layers[0]!, name: "主陈列" }, before.layers[1]!],
      },
    });

    applyFloorPatch.mockClear();
    before = currentFloor();
    await user.click(screen.getByRole("button", { name: "下移图层：主陈列" }));
    await waitFor(() => expect(applyFloorPatch).toHaveBeenCalledOnce());
    expect(applyFloorPatch).toHaveBeenLastCalledWith({
      floorId: floorA.id,
      before,
      after: {
        ...before,
        layers: [before.layers[1]!, before.layers[0]!],
      },
    });
    expect(currentFloor().layers.map((layer) => layer.id)).toEqual([
      layerB.id,
      layerA.id,
    ]);
  });

  it("routes multi copy and paste through the Task 9 controller exactly once", async () => {
    const user = userEvent.setup();
    const { controller, applyPlanEdit } = renderPlanEditorFixture({
      selectedEntityCount: 3,
    });

    await user.click(screen.getByRole("button", { name: "复制" }));
    expect(controller.copy).toHaveBeenCalledOnce();
    expect(applyPlanEdit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "粘贴" }));
    await waitFor(() => expect(controller.paste).toHaveBeenCalledOnce());
    await waitFor(() => expect(applyPlanEdit).toHaveBeenCalledOnce());
    expect(applyPlanEdit.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        reason: "duplicate",
        changes: expect.arrayContaining([
          expect.objectContaining({ before: null, after: expect.any(Object) }),
        ]),
      }),
    );
  });

  it.each([
    ["线性阵列", "array", 3],
    ["矩形阵列", "array", 9],
    ["左对齐", "align", 3],
    ["水平等距", "distribute", 3],
  ] as const)(
    "commits %s as one real Task 7 intent",
    async (buttonName, reason, changeCount) => {
      const user = userEvent.setup();
      const { applyPlanEdit, entities } = renderPlanEditorFixture({
        selectedEntityCount: 3,
      });

      await user.click(screen.getByRole("button", { name: buttonName }));
      await waitFor(() => expect(applyPlanEdit).toHaveBeenCalledOnce());

      const intent = applyPlanEdit.mock.calls[0]?.[0];
      expect(intent).toEqual({
        reason,
        changes: expect.any(Array),
      });
      expect(intent?.changes).toHaveLength(changeCount);

      if (buttonName === "线性阵列") {
        expect(intent?.changes[0]).toEqual(
          expect.objectContaining({
            before: null,
            after: expect.objectContaining({
              transform: expect.objectContaining({
                translation: {
                  x: entities[0]!.transform.translation.x + 100,
                  y: entities[0]!.transform.translation.y,
                },
              }),
            }),
          }),
        );
      }
      if (buttonName === "矩形阵列") {
        expect(
          intent?.changes.map((change) => change.after?.transform.translation),
        ).toEqual(
          expect.arrayContaining([
            {
              x: entities[0]!.transform.translation.x + 100,
              y: entities[0]!.transform.translation.y,
            },
            {
              x: entities[0]!.transform.translation.x,
              y: entities[0]!.transform.translation.y + 100,
            },
          ]),
        );
      }
      if (buttonName === "左对齐") {
        expect(
          intent?.changes.map((change) => change.after?.transform.translation.x),
        ).toEqual([0, 0, 0]);
      }
      if (buttonName === "水平等距") {
        expect(intent?.changes[1]?.after?.transform.translation.x).toBe(350);
      }
    },
  );
});


describe("PlanEditor high-risk contracts", () => {
  it("preserves floor and Inspector context when an active gesture blocks switching", async () => {
    const user = userEvent.setup();
    const { sessionStore, floorA, floorB } = renderPlanEditorFixture();

    await user.click(rowByData("data-floor-id", floorA.id));
    expect(screen.getByRole("complementary", { name: "检查器" })).toHaveTextContent(
      floorA.name,
    );
    sessionStore.getState().beginGesture({
      kind: "box-select",
      start: { x: 0, y: 0 },
      current: { x: 10, y: 10 },
    });

    await user.click(rowByData("data-floor-id", floorB.id));

    expect(sessionStore.getState().activeFloorId).toBe(floorA.id);
    expect(screen.getByRole("complementary", { name: "检查器" })).toHaveTextContent(
      floorA.name,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "当前绘制或变换尚未完成，无法切换楼层",
    );
  });

  it("renames a floor with one exact FloorChange", async () => {
    const user = userEvent.setup();
    const { applyFloorPatch, floorA } = renderPlanEditorFixture();

    await user.click(rowByData("data-floor-id", floorA.id));
    const field = screen.getByLabelText("楼层名称");
    await user.clear(field);
    await user.type(field, "主展层");
    await user.click(screen.getByRole("button", { name: "应用楼层名称" }));

    await waitFor(() => expect(applyFloorPatch).toHaveBeenCalledOnce());
    expect(applyFloorPatch).toHaveBeenLastCalledWith({
      floorId: floorA.id,
      before: floorA,
      after: { ...floorA, name: "主展层" },
    });
  });

  it.each([
    "hidden",
    "locked-layer",
    "entity-locked",
    "other-floor",
    "missing",
  ] as const)(
    "disables multi mutations for an invalid %s selection",
    async (invalidSelection) => {
      const user = userEvent.setup();
      const { applyPlanEdit, controller } = renderPlanEditorFixture({
        selectedEntityCount: 3,
        invalidSelection,
      });

      for (const name of [
        "粘贴",
        "线性阵列",
        "矩形阵列",
        "左对齐",
        "水平等距",
      ]) {
        expect(screen.getByRole("button", { name })).toBeDisabled();
        await user.click(screen.getByRole("button", { name }));
      }
      expect(controller.paste).not.toHaveBeenCalled();
      expect(applyPlanEdit).not.toHaveBeenCalled();
    },
  );

  it("disables distribution when the real selection cardinality is insufficient", () => {
    renderPlanEditorFixture({ selectedEntityCount: 2 });

    expect(screen.getByRole("button", { name: "左对齐" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "水平等距" })).toBeDisabled();
  });

  it("shows a typed plan issue and never applies a failed array result", async () => {
    const user = userEvent.setup();
    const { applyPlanEdit } = renderPlanEditorFixture({
      selectedEntityCount: 3,
      invalidGeneratedIds: true,
    });

    await user.click(screen.getByRole("button", { name: "线性阵列" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Generated IDs must be canonical UUIDs unique from sources and other copies",
    );
    expect(applyPlanEdit).not.toHaveBeenCalled();
  });

  it("commits one entity transform intent without mutating the source snapshot", async () => {
    const user = userEvent.setup();
    const { snapshot, entities, applyPlanEdit } = renderPlanEditorFixture();
    const entity = entities[0]!;

    await user.click(rowByData("data-entity-id", entity.id));
    const field = screen.getByLabelText("对象 X (mm)");
    await user.clear(field);
    await user.type(field, "125");
    await user.click(screen.getByRole("button", { name: "应用对象属性" }));

    await waitFor(() => expect(applyPlanEdit).toHaveBeenCalledOnce());
    expect(applyPlanEdit).toHaveBeenLastCalledWith({
      reason: "transform",
      changes: [{
        id: entity.id,
        before: entity,
        after: {
          ...entity,
          transform: {
            ...entity.transform,
            translation: { ...entity.transform.translation, x: 125 },
          },
        },
      }],
    });
    expect(
      snapshot.project.entities.find((candidate) => candidate.id === entity.id)
        ?.transform.translation.x,
    ).toBe(0);
  });
});


describe("PlanEditor applicable entity dimensions", () => {
  it.each([
    ["wall", "墙体厚度 (mm)", "180", "thickness", 180],
    ["poi", "兴趣点半径 (mm)", "120", "radius", 120],
  ] as const)(
    "commits one %s dimension intent",
    async (primaryEntityType, fieldLabel, value, property, expected) => {
      const user = userEvent.setup();
      const { entities, applyPlanEdit } = renderPlanEditorFixture({
        primaryEntityType,
      });
      const entity = entities[0]!;

      await user.click(rowByData("data-entity-id", entity.id));
      const field = screen.getByLabelText(fieldLabel);
      await user.clear(field);
      await user.type(field, value);
      await user.click(screen.getByRole("button", { name: "应用对象属性" }));

      await waitFor(() => expect(applyPlanEdit).toHaveBeenCalledOnce());
      expect(applyPlanEdit.mock.calls[0]?.[0]).toEqual({
        reason: "properties",
        changes: [{
          id: entity.id,
          before: entity,
          after: expect.objectContaining({ [property]: expected }),
        }],
      });
    },
  );

  it("does not publish an unchanged entity form", async () => {
    const user = userEvent.setup();
    const { entities, applyPlanEdit } = renderPlanEditorFixture();

    await user.click(rowByData("data-entity-id", entities[0]!.id));
    await user.click(screen.getByRole("button", { name: "应用对象属性" }));

    expect(applyPlanEdit).not.toHaveBeenCalled();
  });
});

describe("PlanEditor locked single-entity editing", () => {
  it("disables non-lock fields and publishes an isolated unlock intent", async () => {
    const user = userEvent.setup();
    const { entities, applyPlanEdit } = renderPlanEditorFixture({
      invalidSelection: "entity-locked",
    });
    const entity = entities[0]!;

    await user.click(rowByData("data-entity-id", entity.id));
    const inspector = screen.getByRole("complementary", { name: "检查器" });
    for (const label of [
      "对象名称",
      "对象 X (mm)",
      "对象 Y (mm)",
      "对象旋转 (°)",
      "对象图层",
      "对象标签",
      "对象宽度 (mm)",
      "对象高度 (mm)",
    ]) {
      expect(within(inspector).getByLabelText(label)).toBeDisabled();
    }
    const lock = within(inspector).getByRole("checkbox", { name: "对象锁定" });
    expect(lock).toBeChecked();
    expect(lock).toBeEnabled();

    fireEvent.change(within(inspector).getByLabelText("对象名称"), {
      target: { value: "不得混入解锁" },
    });
    fireEvent.change(within(inspector).getByLabelText("对象 X (mm)"), {
      target: { value: "125" },
    });
    await user.click(lock);
    await user.click(within(inspector).getByRole("button", { name: "应用对象属性" }));

    await waitFor(() => expect(applyPlanEdit).toHaveBeenCalledOnce());
    expect(applyPlanEdit).toHaveBeenLastCalledWith({
      reason: "properties",
      changes: [{
        id: entity.id,
        before: entity,
        after: { ...entity, locked: false },
      }],
    });
  });

  it.each(["hidden", "locked-layer"] as const)(
    "disables every entity mutation control on a %s current layer",
    async (invalidSelection) => {
      const user = userEvent.setup();
      const { sessionStore, entities, applyPlanEdit } = renderPlanEditorFixture({
        invalidSelection,
      });
      act(() => {
        sessionStore.getState().setSelection([entities[0]!.id]);
      });

      const inspector = screen.getByRole("complementary", { name: "检查器" });
      for (const control of [
        ...within(inspector).getAllByRole("textbox"),
        within(inspector).getByRole("combobox"),
        within(inspector).getByRole("checkbox", { name: "对象锁定" }),
        within(inspector).getByRole("button", { name: "应用对象属性" }),
      ]) {
        expect(control).toBeDisabled();
      }

      await user.click(
        within(inspector).getByRole("button", { name: "应用对象属性" }),
      );
      expect(applyPlanEdit).not.toHaveBeenCalled();
    },
  );
});

describe("PlanEditor tree keyboard activation", () => {
  it.each(["floor", "layer", "entity"] as const)(
    "uses a native %s selection button whose Enter action selects Inspector context",
    async (kind) => {
      const user = userEvent.setup();
      const { floorA, layerA, entities } = renderPlanEditorFixture();
      const target = kind === "floor"
        ? {
            attribute: "data-floor-id",
            id: floorA.id,
            buttonName: `选择楼层：${floorA.name}`,
            heading: "楼层",
          }
        : kind === "layer"
          ? {
              attribute: "data-layer-id",
              id: layerA.id,
              buttonName: `选择图层：${layerA.name}`,
              heading: "图层",
            }
          : {
              attribute: "data-entity-id",
              id: entities[0]!.id,
              buttonName: `选择对象：${entities[0]!.name}`,
              heading: "对象",
            };
      const row = rowByData(target.attribute, target.id);
      const activation = within(row).getByRole("button", {
        name: target.buttonName,
      });

      expect(activation.tagName).toBe("BUTTON");
      expect(activation).toHaveAttribute("type", "button");
      expect(activation).toHaveProperty("tabIndex", 0);
      activation.focus();
      await user.keyboard("{Enter}");

      expect(
        within(screen.getByRole("complementary", { name: "检查器" }))
          .getByRole("heading", { name: target.heading }),
      ).toBeVisible();
    },
  );
});

describe("PlanEditor Task 11 asset entry points", () => {
  it("shows Tree and Asset Library tabs plus Import floor plan only when a picker exists", async () => {
    const user = userEvent.setup();
    const picker = { pick: vi.fn(async () => null) };
    renderPlanEditorFixture({ profile: "showroom", assetPicker: picker });

    const navigation = screen.getByRole("navigation", { name: "\u9879\u76ee\u6811" });
    expect(within(navigation).getByRole("tablist", { name: "\u5de6\u4fa7\u9762\u677f" })).toBeVisible();
    expect(within(navigation).getByRole("tab", { name: "\u9879\u76ee\u6811" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tree", { name: "\u697c\u5c42\u548c\u7a7a\u95f4" })).toBeVisible();
    expect(
      within(screen.getByRole("group", { name: "\u5efa\u7b51" })).getByRole("button", {
        name: "\u5bfc\u5165\u5e73\u9762\u56fe",
      }),
    ).toBeVisible();

    await user.click(within(navigation).getByRole("tab", { name: "\u8d44\u4ea7\u5e93" }));
    expect(within(navigation).getByRole("tab", { name: "\u8d44\u4ea7\u5e93" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(navigation).getByRole("region", { name: "\u8d44\u4ea7\u5e93" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /\u6821\u51c6|\u95e8\u7a97|\u5185\u5bb9|\u8def\u7ebf|3D|\u5bfc\u51fa/ })).not.toBeInTheDocument();
  });

  it("keeps Task 11 controls absent when the import picker capability is unavailable", () => {
    renderPlanEditorFixture({ profile: "showroom", assetPicker: null });

    expect(screen.queryByRole("tablist", { name: "\u5de6\u4fa7\u9762\u677f" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "\u8d44\u4ea7\u5e93" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "\u5bfc\u5165\u5e73\u9762\u56fe" })).not.toBeInTheDocument();
    expect(screen.getByRole("tree", { name: "\u697c\u5c42\u548c\u7a7a\u95f4" })).toBeVisible();
  });
});
describe("renderPlanEditorFixture Task 11 compatibility", () => {
  it("returns the rendered default primary fixture with its stable treeitem name", () => {
    const { fixture } = renderPlanEditorFixture();
    const typedFixture: Fixture = fixture;

    expect(typedFixture).toBeDefined();
    expect(
      screen.getByRole("treeitem", { name: typedFixture.name }),
    ).toHaveAttribute("data-entity-id", typedFixture.id);
  });
});

describe("PlanEditor dimension offset", () => {
  it("publishes one properties intent for a finite signed offset", async () => {
    const user = userEvent.setup();
    const { entities, applyPlanEdit } = renderPlanEditorFixture({
      primaryEntityType: "dimension",
    });
    const entity = entities[0]!;
    expect(entity.type).toBe("dimension");

    await user.click(rowByData("data-entity-id", entity.id));
    const field = screen.getByLabelText("尺寸偏移 (mm)");
    await user.clear(field);
    await user.type(field, "-40");
    await user.click(screen.getByRole("button", { name: "应用对象属性" }));

    await waitFor(() => expect(applyPlanEdit).toHaveBeenCalledOnce());
    expect(applyPlanEdit).toHaveBeenLastCalledWith({
      reason: "properties",
      changes: [{
        id: entity.id,
        before: entity,
        after: expect.objectContaining({ offset: -40 }),
      }],
    });
  });

  it("rejects a non-finite offset without publishing an intent", async () => {
    const user = userEvent.setup();
    const { entities, applyPlanEdit } = renderPlanEditorFixture({
      primaryEntityType: "dimension",
    });

    await user.click(rowByData("data-entity-id", entities[0]!.id));
    const field = screen.getByLabelText("尺寸偏移 (mm)");
    await user.clear(field);
    await user.type(field, "Infinity");
    await user.click(screen.getByRole("button", { name: "应用对象属性" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "尺寸偏移必须是有限数字",
    );
    expect(applyPlanEdit).not.toHaveBeenCalled();
  });
});

describe("PlanEditor Inspector draft synchronization", () => {
  it("preserves a project draft and its local error across an unrelated floor publication", async () => {
    const { projectStore, applyFloorPatch, floorA } = renderPlanEditorFixture();
    const name = screen.getByLabelText("项目名称");
    fireEvent.change(name, { target: { value: "CON" } });
    fireEvent.blur(name);
    expect(
      await screen.findByText("项目名称不能使用 Windows 保留设备名"),
    ).toBeVisible();

    const currentFloor = projectStore
      .getState()
      .snapshot!.project.floors.find((floor) => floor.id === floorA.id)!;
    await act(async () => {
      await applyFloorPatch({
        floorId: currentFloor.id,
        before: currentFloor,
        after: { ...currentFloor, name: "无关楼层发布" },
      });
    });

    expect(name).toHaveValue("CON");
    expect(
      screen.getByText("项目名称不能使用 Windows 保留设备名"),
    ).toBeVisible();
  });

  it("preserves an entity draft and local error across another entity publication", async () => {
    const user = userEvent.setup();
    const { entities, applyPlanEdit } = renderPlanEditorFixture();
    const selected = entities[0]!;
    const other = entities[1]!;
    await user.click(rowByData("data-entity-id", selected.id));

    const x = screen.getByLabelText("对象 X (mm)");
    await user.clear(x);
    await user.type(x, "not-a-number");
    await user.click(screen.getByRole("button", { name: "应用对象属性" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "位置和角度必须是有限数字",
    );

    await act(async () => {
      await applyPlanEdit({
        reason: "properties",
        changes: [{
          id: other.id,
          before: other,
          after: { ...other, name: "无关对象发布" },
        }],
      });
    });

    expect(x).toHaveValue("not-a-number");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "位置和角度必须是有限数字",
    );
  });

  it("resynchronizes fields when the selected entity committed values change", async () => {
    const user = userEvent.setup();
    const { entities, applyPlanEdit } = renderPlanEditorFixture();
    const selected = entities[0]!;
    await user.click(rowByData("data-entity-id", selected.id));
    const x = screen.getByLabelText("对象 X (mm)");
    await user.clear(x);
    await user.type(x, "125");

    await act(async () => {
      await applyPlanEdit({
        reason: "transform",
        changes: [{
          id: selected.id,
          before: selected,
          after: {
            ...selected,
            transform: {
              ...selected.transform,
              translation: {
                ...selected.transform.translation,
                x: 240,
              },
            },
          },
        }],
      });
    });

    expect(x).toHaveValue("240");
  });
});

describe("PlanEditor exact unit editing", () => {
  it("parses signed coordinates and fixture dimensions through plan-engine units", async () => {
    const user = userEvent.setup();
    const { entities, applyPlanEdit } = renderPlanEditorFixture();
    const entity = entities[0]!;
    await user.click(rowByData("data-entity-id", entity.id));
    for (const [label, value] of [
      ["对象 X (mm)", "-1.25m"],
      ["对象 Y (mm)", "+20cm"],
      ["对象宽度 (mm)", "1.2m"],
      ["对象高度 (mm)", "35cm"],
    ] as const) {
      const field = screen.getByLabelText(label);
      await user.clear(field);
      await user.type(field, value);
    }
    await user.click(screen.getByRole("button", { name: "应用对象属性" }));
    await waitFor(() => expect(applyPlanEdit).toHaveBeenCalledOnce());
    expect(applyPlanEdit.mock.calls[0]?.[0]).toEqual({
      reason: "properties",
      changes: [{
        id: entity.id,
        before: entity,
        after: expect.objectContaining({
          transform: expect.objectContaining({ translation: { x: -1250, y: 200 } }),
          size: { width: 1200, height: 350 },
        }),
      }],
    });
  });

  it.each([
    ["wall", "墙体厚度 (mm)", "2.5cm", "thickness", 25],
    ["poi", "兴趣点半径 (mm)", "0.3m", "radius", 300],
    ["dimension", "尺寸偏移 (mm)", "-2.5cm", "offset", -25],
  ] as const)(
    "parses an exact %s length and emits one properties intent",
    async (primaryEntityType, label, value, property, expected) => {
      const user = userEvent.setup();
      const { entities, applyPlanEdit } = renderPlanEditorFixture({ primaryEntityType });
      const entity = entities[0]!;
      await user.click(rowByData("data-entity-id", entity.id));
      const field = screen.getByLabelText(label);
      await user.clear(field);
      await user.type(field, value);
      await user.click(screen.getByRole("button", { name: "应用对象属性" }));
      await waitFor(() => expect(applyPlanEdit).toHaveBeenCalledOnce());
      expect(applyPlanEdit.mock.calls[0]?.[0]).toEqual({
        reason: "properties",
        changes: [{
          id: entity.id,
          before: entity,
          after: expect.objectContaining({ [property]: expected }),
        }],
      });
    },
  );

  it("shows one field-local issue and publishes nothing for an invalid unit", async () => {
    const user = userEvent.setup();
    const { entities, applyPlanEdit } = renderPlanEditorFixture();
    await user.click(rowByData("data-entity-id", entities[0]!.id));
    const field = screen.getByLabelText("对象 X (mm)");
    await user.clear(field);
    await user.type(field, "12px");
    await user.click(screen.getByRole("button", { name: "应用对象属性" }));
    const alert = screen.getByRole("alert");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(alert).toHaveTextContent("位置和角度必须是有限数字");
    expect(alert).toHaveAttribute("data-issue-code", "INVALID_LENGTH");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby", alert.id);
    expect(applyPlanEdit).not.toHaveBeenCalled();
  });

  it.each([
    ["empty", ""],
    ["whitespace-only", "   "],
  ] as const)(
    "rejects an %s rotation as a field-local INVALID_ROTATION issue",
    async (_kind, invalidRotation) => {
      const user = userEvent.setup();
      const { entities, applyPlanEdit } = renderPlanEditorFixture();
      await user.click(rowByData("data-entity-id", entities[0]!.id));
      const field = screen.getByLabelText("对象旋转 (°)");
      const apply = screen.getByRole("button", { name: "应用对象属性" });

      await user.clear(field);
      await user.type(field, "45");
      await user.click(apply);
      await waitFor(() => expect(applyPlanEdit).toHaveBeenCalledOnce());
      await waitFor(() => expect(field).toHaveValue("45"));
      applyPlanEdit.mockClear();

      fireEvent.change(field, { target: { value: invalidRotation } });
      await user.click(apply);

      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("位置和角度必须是有限数字");
      expect(alert).toHaveAttribute("data-issue-code", "INVALID_ROTATION");
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveAttribute("aria-describedby", alert.id);
      expect(applyPlanEdit).not.toHaveBeenCalled();
    },
  );

  it("keeps degrees in the form and commits radians in the model", async () => {
    const user = userEvent.setup();
    const { entities, applyPlanEdit } = renderPlanEditorFixture();
    const entity = entities[0]!;
    await user.click(rowByData("data-entity-id", entity.id));
    const field = screen.getByLabelText("对象旋转 (°)");
    await user.clear(field);
    await user.type(field, "90");
    await user.click(screen.getByRole("button", { name: "应用对象属性" }));
    await waitFor(() => expect(applyPlanEdit).toHaveBeenCalledOnce());
    const after = applyPlanEdit.mock.calls[0]?.[0].changes[0]?.after;
    expect(after?.transform.rotation).toBeCloseTo(Math.PI / 2, 12);
    expect(applyPlanEdit.mock.calls[0]?.[0].reason).toBe("transform");
  });
});
