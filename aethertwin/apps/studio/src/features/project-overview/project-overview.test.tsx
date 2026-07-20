// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ProjectStore,
  SandboxProjectBackend,
  type OpenedProject,
} from "@aethertwin/project-store";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectBackendError } from "../../backend/tauri-backend";
import { ProjectOverview } from "./project-overview";

const stores: ProjectStore[] = [];

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
});

describe("ProjectOverview", () => {
  it("renders the real project tree and read-only M0 metadata while the Inspector edits only name and tags", async () => {
    const { store } = await sandboxProject("北岸展厅");
    await store.setProjectTags(["featured", "north"]);
    render(<ProjectOverview store={store} />);

    const tree = screen.getByRole("navigation", { name: "项目树" });
    expect(within(tree).getByText("北岸展厅")).toBeVisible();
    expect(within(tree).getByText("一层")).toBeVisible();

    const workspace = screen.getByRole("main");
    expect(within(workspace).getByRole("heading", { name: "项目概览" })).toBeVisible();
    expect(workspace).toHaveTextContent("北岸展厅");
    expect(workspace).toHaveTextContent("featured");
    expect(workspace).toHaveTextContent("north");
    expect(workspace).toHaveTextContent("showroom");
    expect(workspace).toHaveTextContent(/Schema\s*1/i);
    expect(workspace).toHaveTextContent("未保存");
    expect(workspace).toHaveTextContent(/sandbox/i);

    const inspector = screen.getByRole("complementary", { name: "检查器" });
    expect(within(inspector).getByLabelText("项目名称")).toHaveValue("北岸展厅");
    expect(within(inspector).getByLabelText("项目标签")).toHaveValue("featured, north");
    expect(within(inspector).getAllByRole("textbox")).toHaveLength(2);
    expect(within(inspector).queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("renames only through the ProjectStore CommandBus and supports undo, redo, and manual save", async () => {
    const { backend, store } = await sandboxProject();
    const commit = vi.spyOn(backend, "commit");
    const checkpoint = vi.spyOn(backend, "checkpoint");
    render(<ProjectOverview store={store} />);
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
    render(<ProjectOverview store={store} />);
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
    render(<ProjectOverview store={store} />);

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
    render(<ProjectOverview store={store} />);

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
    render(<ProjectOverview store={store} />);

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
      <ProjectOverview
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
        <ProjectOverview store={store} onBack={() => setAtCenter(true)} />
      );
    }

    render(<Host />);
    await userEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(await screen.findByText("close checkpoint failed")).toBeVisible();
    expect(screen.getByRole("heading", { name: "项目概览" })).toBeVisible();
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
        <ProjectOverview store={store} onBack={() => setAtCenter(true)} />
      );
    }

    render(<Host />);
    await userEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(await screen.findByText("native close failed")).toBeVisible();
    expect(screen.getByRole("heading", { name: "项目概览" })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(await screen.findByRole("heading", { name: "AetherTwin Studio" })).toBeVisible();
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("associates simultaneous name and tag errors with only their own inspector field", async () => {
    const { backend, store } = await sandboxProject("检查器错误");
    const commit = vi.spyOn(backend, "commit");
    render(<ProjectOverview store={store} />);

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
      render(<ProjectOverview store={store} />);

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
        <ProjectOverview store={store} onBack={() => setAtCenter(true)} />
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
    render(<ProjectOverview store={store} />);

    const recovered = saveStatus("recovered");
    expect(recovered).toHaveAttribute("role", "status");
    expect(recovered).toHaveClass("aether-status-notice--recovered");
    expect(recovered).not.toHaveClass("aether-status-notice--error");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "项目概览" })).toBeVisible();
  });

  it("renders an actionable native error with its log reference and a working Back action", async () => {
    const { backend, store } = await sandboxProject("错误展厅");
    const onBack = vi.fn();
    backend.failNextCommit = Object.assign(new Error("项目正在由另一个会话使用"), {
      code: "PROJECT_LOCKED",
      details: { retryable: true, recoveryRequired: false },
      logRef: "native-project-locked",
    });
    render(<ProjectOverview store={store} onBack={onBack} />);

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
    render(<ProjectOverview store={store} />);

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

    render(<ProjectOverview store={store} />);
    expect(screen.queryByRole("heading", { name: "项目概览" })).not.toBeInTheDocument();
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

    render(<ProjectOverview store={store} />);
    expect(screen.queryByRole("heading", { name: "项目概览" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("项目结构无效或不完整");
    expect(screen.getByRole("alert")).toHaveTextContent("native-corrupt-project");
    expect(screen.getByRole("button", { name: "返回" })).toBeEnabled();
  });
});
