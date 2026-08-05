// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AssetRecord,
  Fixture,
  Opening,
  PlanReference,
  PointOfInterest,
  ProductContent,
  GuidedRoute,
  RouteEdge,
  RouteNetwork,
  RouteNode,
  SpaceUnit,
  SpatialEntity,
  Wall,
} from "@aethertwin/core-model";
import {
  ProjectStore,
  SandboxProjectBackend,
  type OpenedProject,
} from "@aethertwin/project-store";
import {
  SHOWROOM_FIXTURE_CATALOGUE,
  showroomFixture,
} from "@aethertwin/mode-showroom";
import type { SceneRendererFactory } from "@aethertwin/render-scene-3d";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectBackendError } from "../../backend/tauri-backend";
import { createPlanEditorStore, type OpeningPreviewState } from "./editor-session";
import { PlanEditor } from "./plan-editor";
import { FakePlanRenderer, renderPlanEditorFixture } from "./plan-editor.test-support";
import { FakeSceneRenderer } from "./scene-canvas.test-support";

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

describe("PlanEditor M2.3 Task 12 route integration", () => {
  it("keeps nested route-node selection in the shared Inspector and makes kind edits undoable", async () => {
    const { store } = await sandboxProject("Route authoring");
    const floor = store.getState().snapshot!.project.floors[0]!;
    const node: RouteNode = {
      id: "00000000-0000-4000-8000-000000000820",
      name: "Visitor junction",
      tags: [],
      floorId: floor.id,
      position: { x: 500, y: 750 },
      kind: "junction",
    };
    const network: RouteNetwork = {
      id: "00000000-0000-4000-8000-000000000821",
      name: "Visitor route",
      tags: [],
      nodes: [node],
      edges: [],
    };
    await store.applySnapshotRecordPatches([{
      collection: "routeNetworks",
      changes: [{ id: network.id, before: null, after: network }],
    }]);
    const sessionStore = createPlanEditorStore({ activeFloorId: floor.id });
    render(<PlanEditor store={store} dependencies={{ sessionStore }} />);
    act(() => {
      sessionStore.getState().setActiveTool("route-node");
      sessionStore.getState().setActiveRouteNetwork({
        sessionId: sessionStore.getState().sessionId,
        floorId: floor.id,
        networkId: null,
        tool: "route-node",
      }, network.id);
      sessionStore.getState().setSelection([node.id]);
    });
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: "路线节点" })).toBeVisible();
    expect(screen.getByLabelText("路线节点名称")).toHaveValue("Visitor junction");
    expect([...sessionStore.getState().selectedIds]).toEqual([node.id]);
    await user.selectOptions(
      screen.getByRole("combobox", { name: "路线节点类型" }),
      "showroom-stop",
    );
    await user.click(screen.getByRole("button", { name: "应用路线节点" }));

    await waitFor(() => expect(
      store.getState().snapshot!.project.routeNetworks[0]!.nodes[0]!.kind,
    ).toBe("showroom-stop"));
    expect([...sessionStore.getState().selectedIds]).toEqual([node.id]);

    await act(async () => store.undo());
    expect(store.getState().snapshot!.project.routeNetworks[0]!.nodes[0]!.kind)
      .toBe("junction");
    await act(async () => store.redo());
    expect(store.getState().snapshot!.project.routeNetworks[0]!.nodes[0]!.kind)
      .toBe("showroom-stop");
  });
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


const marketToolLabels = [
  "\u9009\u62e9",
  "\u5e73\u79fb",
  "\u8fb9\u754c",
  "\u5899\u4f53",
  "\u533a\u57df",
  "\u644a\u4f4d",
  "\u5c55\u5177",
  "\u5174\u8da3\u70b9",
  "\u5c3a\u5bf8",
] as const;

const showroomToolLabels = [
  "\u9009\u62e9",
  "\u5e73\u79fb",
  "\u8fb9\u754c",
  "\u5899\u4f53",
  "\u95e8",
  "\u7a97",
  "\u533a\u57df",
  "\u623f\u95f4",
  "\u8bc6\u522b\u623f\u95f4",
  "\u5c55\u5177\u76ee\u5f55",
  "\u5174\u8da3\u70b9",
  "\u5c3a\u5bf8",
  "\u4ea7\u54c1\u70ed\u70b9",
  "\u6dfb\u52a0\u5a92\u4f53",
  "\u8def\u7ebf\u8282\u70b9",
  "\u8def\u7ebf\u8fb9",
  "\u7f16\u8f91\u505c\u9760\u70b9",
  "\u9884\u89c8\u8def\u7ebf",
  "2D",
  "3D",
  "Split",
  "Frame Selection",
  "Frame Route",
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
    expect(screen.queryByRole("button", { name: /3D|导出/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("bottom-dock")).not.toBeInTheDocument();
  });

  it.each([
    ["market", ["选择", "场地", "空间单元", "标记"], marketToolLabels],
    [
      "showroom",
      ["选择", "建筑", "展具", "内容", "导览", "预览"],
      showroomToolLabels,
    ],
  ] as const)(
    "groups the implemented tools for the %s profile",
    (profile, groupLabels, expectedToolLabels) => {
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
      ).toEqual(expectedToolLabels);
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
      const label = marketToolLabels[index]!;
      await user.click(screen.getByRole("button", { name: label }));
      expect(sessionStore.getState().activeTool).toBe(tool);
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
  });

  it("opens the showroom catalogue, records one choice, and focuses the canvas", async () => {
    const user = userEvent.setup();
    const { sessionStore } = renderPlanEditorFixture({ profile: "showroom" });

    await user.click(screen.getByRole("button", { name: "\u5c55\u5177\u76ee\u5f55" }));
    const catalogue = screen.getByRole("region", { name: "\u5c55\u5177\u76ee\u5f55" });
    expect(within(catalogue).getAllByRole("button")).toHaveLength(7);

    await user.click(within(catalogue).getByRole("button", { name: /\u5c55\u793a\u67dc/ }));

    expect(sessionStore.getState()).toMatchObject({
      activeTool: "fixture",
      selectedFixtureKind: "display-case",
    });
    expect(within(catalogue).getByRole("button", { name: /\u5c55\u793a\u67dc/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await waitFor(() => expect(document.activeElement).toHaveClass("studio-plan-canvas"));

    cleanup();
    renderPlanEditorFixture({ profile: "market" });
    expect(screen.queryByRole("region", { name: "\u5c55\u5177\u76ee\u5f55" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "\u5c55\u5177" })).toBeVisible();
  });

  it("exposes the M2.4 showroom content, tour, and preview entry points", async () => {
    const user = userEvent.setup();
    const { sessionStore } = renderPlanEditorFixture({ profile: "showroom" });

    for (const [label, tool] of [
      ["\u4ea7\u54c1\u70ed\u70b9", "product-hotspot"],
      ["\u8def\u7ebf\u8282\u70b9", "route-node"],
      ["\u8def\u7ebf\u8fb9", "route-edge"],
    ] as const) {
      const button = screen.getByRole("button", { name: label });
      await user.click(button);
      expect(sessionStore.getState().activeTool).toBe(tool);
      expect(button).toHaveAttribute("aria-pressed", "true");
      expect(document.activeElement).toBe(button);
    }

    for (const label of [
      "\u6dfb\u52a0\u5a92\u4f53",
      "\u7f16\u8f91\u505c\u9760\u70b9",
      "\u9884\u89c8\u8def\u7ebf",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
    }
    for (const deferredLabel of ["\u6750\u8d28", "\u706f\u5149", "\u5bfc\u51fa", "\u53d1\u5e03"]) {
      expect(screen.queryByRole("button", { name: deferredLabel })).not.toBeInTheDocument();
    }

    cleanup();
    renderPlanEditorFixture({ profile: "market" });
    for (const label of showroomToolLabels.slice(12)) {
      expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    }
  });
  it("wires preview actions, explains renderer failures, and restores 2D focus", async () => {
    const user = userEvent.setup();
    const previewRenderer = new FakeSceneRenderer();
    const { sessionStore } = renderPlanEditorFixture({
      profile: "showroom",
      sceneRendererFactory: () => previewRenderer,
    });

    const twoD = screen.getByRole("button", { name: "2D" });
    const threeD = screen.getByRole("button", { name: "3D" });
    const split = screen.getByRole("button", { name: "Split" });
    expect(twoD).toHaveAttribute("aria-pressed", "true");

    await user.click(threeD);
    expect(sessionStore.getState().viewMode).toBe("3d");
    expect(threeD).toHaveAttribute("aria-pressed", "true");
    await user.click(split);
    expect(sessionStore.getState().viewMode).toBe("split");
    expect(split).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Frame Selection" }));
    await waitFor(() => expect(previewRenderer.frameInputs.at(-1))
      .toBe("selection"));
    expect(sessionStore.getState().sceneFrameRequest).toBeNull();
    await user.click(screen.getByRole("button", { name: "Frame Route" }));
    await waitFor(() => expect(previewRenderer.frameInputs.at(-1))
      .toBe("route"));
    expect(sessionStore.getState().sceneFrameRequest).toBeNull();

    split.focus();
    expect(split).toHaveFocus();
    const failedScope = sessionStore.getState().beginSceneRenderer();
    act(() => {
      sessionStore.getState().setSceneRendererStatus(
        failedScope,
        "failed",
        new Error("WebGL unavailable"),
      );
    });
    expect(sessionStore.getState().viewMode).toBe("2d");
    expect(twoD).toHaveAttribute("aria-pressed", "true");
    expect(threeD).toBeDisabled();
    expect(split).toBeDisabled();
    const status = screen.getByRole("status", { name: "3D 预览状态" });
    expect(status).toHaveTextContent("WebGL unavailable");
    expect(threeD).toHaveAttribute("aria-describedby", status.id);
    expect(split).toHaveAttribute("aria-describedby", status.id);
    await waitFor(() => expect(twoD).toHaveFocus());

    const disabledScope = sessionStore.getState().beginSceneRenderer();
    await waitFor(() => expect(threeD).toBeEnabled());
    threeD.focus();
    expect(threeD).toHaveFocus();
    act(() => {
      sessionStore.getState().setViewMode("3d");
      sessionStore.getState().setSceneRendererStatus(
        disabledScope,
        "disabled",
        new Error("GPU disabled"),
      );
    });
    expect(screen.getByRole("status", { name: "3D 预览状态" }))
      .toHaveTextContent("GPU disabled");
    expect(threeD).toBeDisabled();
    expect(split).toBeDisabled();
    await waitFor(() => expect(twoD).toHaveFocus());
    expect(screen.queryByRole("button", { name: /export/i })).not.toBeInTheDocument();

    cleanup();
    renderPlanEditorFixture({ profile: "market" });
    for (const label of ["2D", "3D", "Split", "Frame Selection", "Frame Route"]) {
      expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    }
  });

  it("keeps Inspector focus when the renderer becomes unavailable", async () => {
    const { sessionStore } = renderPlanEditorFixture({ profile: "showroom" });
    const inspectorField = screen.getByLabelText("项目名称");
    inspectorField.focus();
    expect(inspectorField).toHaveFocus();

    const scope = sessionStore.getState().beginSceneRenderer();
    act(() => {
      sessionStore.getState().setViewMode("3d");
      sessionStore.getState().setSceneRendererStatus(
        scope,
        "failed",
        new Error("WebGL unavailable"),
      );
    });

    expect(sessionStore.getState().viewMode).toBe("2d");
    await act(async () => {
      await Promise.resolve();
    });
    expect(inspectorField).toHaveFocus();
  });

  it("does not rerender the parent editor for camera-only session updates", () => {
    const workspace = vi.fn(() => (
      <div data-testid="camera-isolated-workspace">Renderer override</div>
    ));
    const { sessionStore } = renderPlanEditorFixture({
      profile: "showroom",
      workspace,
    });
    const scope = sessionStore.getState().beginSceneRenderer();
    act(() => {
      sessionStore.getState().setSceneRendererStatus(scope, "ready", null);
    });
    const renderCount = workspace.mock.calls.length;

    act(() => {
      sessionStore.getState().setSceneCamera(scope, {
        position: { x: 1, y: 2, z: 3 },
        target: { x: 4, y: 5, z: 6 },
        fieldOfView: 45,
      });
    });

    expect(workspace).toHaveBeenCalledTimes(renderCount);
  });


  it("integrates 2D, 3D, and split while sharing floor, selection, failure, and focus", async () => {
    const user = userEvent.setup();
    const first = new FakeSceneRenderer();
    const second = new FakeSceneRenderer();
    const third = new FakeSceneRenderer();
    const renderers = [first, second, third];
    const sceneRendererFactory = vi.fn(() => renderers.shift()!);
    const {
      sessionStore,
      floorB,
      fixture,
    } = renderPlanEditorFixture({
      profile: "showroom",
      sceneRendererFactory,
    });

    expect(screen.getByRole("region", { name: "二维平面画布" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "三维场景" }))
      .not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "3D" }));
    await waitFor(() => expect(first.initCount).toBe(1));
    act(() => first.emitStatus("ready"));
    expect(screen.queryByRole("region", { name: "二维平面画布" }))
      .not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "三维场景" }))
      .toBeInTheDocument();

    act(() => first.emitSelection(new Set([fixture.id])));
    expect(rowByData("data-entity-id", fixture.id))
      .toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("button", { name: "Split" }));
    expect(screen.getByRole("region", { name: "二维平面画布" }))
      .toBeInTheDocument();
    expect(screen.getByRole("region", { name: "三维场景" }))
      .toBeInTheDocument();
    expect(screen.getByTestId("synchronized-scene-view"))
      .toHaveAttribute("data-view-mode", "split");
    expect(first.initCount).toBe(1);

    act(() => sessionStore.getState().setSelection([]));
    const entityButton = within(
      screen.getByRole("tree", { name: "楼层和空间" }),
    ).getByRole("button", { name: "选择对象：" + fixture.name });
    entityButton.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(
      first.updateInputs.at(-1)?.selectedIds.has(fixture.id),
    ).toBe(true));
    expect(entityButton).toHaveFocus();

    await user.click(screen.getByRole("button", {
      name: "选择楼层：" + floorB.name,
    }));
    await waitFor(() => expect(second.initCount).toBe(1));
    await waitFor(() => expect(second.updateInputs.at(-1)?.activeFloorId)
      .toBe(floorB.id));
    expect(first.destroyCount).toBe(1);
    expect(screen.getByRole("region", { name: "二维平面画布" }))
      .toBeInTheDocument();

    act(() => second.emitStatus("ready"));
    const scene = screen.getByRole("region", { name: "三维场景" });
    scene.focus();
    expect(scene).toHaveFocus();
    act(() => second.emitStatus("failed", new Error("WebGL unavailable")));

    await waitFor(() => expect(screen.queryByRole("region", { name: "三维场景" }))
      .not.toBeInTheDocument());
    const plan = screen.getByRole("region", { name: "二维平面画布" });
    expect(plan).toBeInTheDocument();
    await waitFor(() => expect(plan).toHaveFocus());
    expect(sessionStore.getState()).toMatchObject({
      viewMode: "2d",
      rendererStatus: "failed",
      rendererError: "WebGL unavailable",
    });
    expect(second.destroyCount).toBe(1);
    const retry = screen.getByRole("button", { name: "重试 3D" });
    await user.click(retry);
    await waitFor(() => expect(third.initCount).toBe(1));
    expect(sessionStore.getState()).toMatchObject({
      viewMode: "3d",
      rendererStatus: "initializing",
      rendererError: null,
    });
    expect(screen.getByRole("region", { name: "三维场景" }))
      .toBeInTheDocument();
    act(() => third.emitStatus("ready"));
  });

  it("restores 2D focus when retry construction fails synchronously", async () => {
    const user = userEvent.setup();
    const first = new FakeSceneRenderer();
    let attempts = 0;
    const sceneRendererFactory: SceneRendererFactory = vi.fn(() => {
      attempts += 1;
      if (attempts === 1) return first;
      throw new Error("renderer factory unavailable");
    });
    const { sessionStore } = renderPlanEditorFixture({
      profile: "showroom",
      sceneRendererFactory,
    });

    await user.click(screen.getByRole("button", { name: "3D" }));
    await waitFor(() => expect(first.initCount).toBe(1));
    act(() => first.emitStatus("failed", new Error("WebGL unavailable")));
    const retry = await screen.findByRole("button", {
      name: "\u91cd\u8bd5 3D",
    });

    await user.click(retry);

    const plan = await screen.findByRole("region", {
      name: "\u4e8c\u7ef4\u5e73\u9762\u753b\u5e03",
    });
    await waitFor(() => expect(sessionStore.getState()).toMatchObject({
      viewMode: "2d",
      rendererStatus: "failed",
      rendererError: "renderer factory unavailable",
    }));
    await waitFor(() => expect(plan).toHaveFocus());
    expect(sceneRendererFactory).toHaveBeenCalledTimes(2);
  });

  it("clears the showroom fixture choice on floor switch and unmount", async () => {
    const user = userEvent.setup();
    const { floorB, sessionStore, unmount } = renderPlanEditorFixture({ profile: "showroom" });
    await user.click(screen.getByRole("button", { name: "\u5c55\u5177\u76ee\u5f55" }));
    await user.click(screen.getByRole("button", { name: /\u6807\u724c/ }));
    expect(sessionStore.getState().selectedFixtureKind).toBe("signage");

    await user.click(rowByData("data-floor-id", floorB.id));
    expect(sessionStore.getState().selectedFixtureKind).toBeNull();

    act(() => sessionStore.getState().setSelectedFixtureKind("screen"));
    unmount();
    expect(sessionStore.getState().selectedFixtureKind).toBeNull();
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
      "对象深度 (mm)",
      "对象垂直高度 (mm)",
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
        ...within(inspector).getAllByRole("combobox"),
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
    expect(screen.queryByRole("button", { name: /\u6821\u51c6|\u95e8\u7a97|\u5bfc\u51fa/ })).not.toBeInTheDocument();
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
      ["对象深度 (mm)", "35cm"],
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

describe("PlanEditor Task 12 plan-reference selection", () => {
  it("selects a locked visible reference row and shares that selection with Inspector", async () => {
    const { store } = await sandboxProject("Reference selection");
    const snapshot = store.getState().snapshot!;
    const floor = snapshot.project.floors[0]!;
    const asset: AssetRecord = {
      id: "00000000-0000-4000-8000-000000000030",
      sha256: "a".repeat(64),
      relativePath: `assets/sha256/aa/${"a".repeat(64)}.png`,
      mediaType: "image/png",
      size: 42,
    };
    const reference: PlanReference = {
      id: "00000000-0000-4000-8000-000000000031",
      name: "Locked floor plan",
      tags: ["reference"],
      floorId: floor.id,
      layerId: floor.layers[0]!.id,
      assetId: asset.id,
      intrinsicSize: { width: 640, height: 480 },
      transform: {
        translation: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
      },
      opacity: 0.65,
      locked: true,
      calibration: null,
    };
    await store.applySnapshotRecordPatches([
      {
        collection: "assets",
        changes: [{ id: asset.id, before: null, after: asset }],
      },
      {
        collection: "planReferences",
        changes: [{ id: reference.id, before: null, after: reference }],
      },
    ]);
    render(<PlanEditor
      store={store}
      dependencies={{ assetPicker: null }}
    />);
    const user = userEvent.setup();

    const row = rowByData("data-reference-id", reference.id);
    expect(row).toBeVisible();
    expect(row).toHaveAttribute("aria-selected", "false");
    expect(row).toHaveTextContent("Locked floor plan");
    expect(row).toHaveTextContent("\u5df2\u9501\u5b9a");

    await user.click(row);

    expect(row).toHaveAttribute("aria-selected", "true");
    const inspector = screen.getByRole("complementary", { name: "\u68c0\u67e5\u5668" });
    expect(within(inspector).getByRole("heading", {
      name: "\u5e73\u9762\u53c2\u8003",
    })).toBeVisible();
    expect(within(inspector).getByLabelText("\u5e73\u9762\u53c2\u8003\u540d\u79f0"))
      .toHaveValue(reference.name);
    expect(within(inspector).getByRole("button", {
      name: "\u5220\u9664\u5e73\u9762\u53c2\u8003",
    })).toBeDisabled();

    await store.undo();

    await waitFor(() => expect(document.querySelector(
      `[data-reference-id="${reference.id}"]`,
    )).not.toBeInTheDocument());
    await waitFor(() => expect(within(inspector).getByLabelText(
      "\u9879\u76ee\u540d\u79f0",
    )).toHaveValue("Reference selection"));
  });
});
function openingPreview(
  sessionId: string,
  overrides: Partial<OpeningPreviewState> = {},
): OpeningPreviewState {
  return {
    sessionId,
    tool: "door",
    candidate: {
      wallId: "00000000-0000-4000-8000-000000000030",
      distanceAlongWall: 500,
      worldCenter: { x: 0, y: 0 },
      tangent: { x: 1, y: 0 },
      effectiveThickness: 100,
      valid: false,
      issue: {
        code: "OPENING_ENDPOINT_CLEARANCE",
        openingId: "00000000-0000-4000-8000-000000000000",
        wallId: "00000000-0000-4000-8000-000000000030",
      },
    },
    width: 900,
    height: 2_100,
    sillHeight: 0,
    ...overrides,
  };
}

describe("PlanEditor Task 8 opening creation UI", () => {
  it("maps Door and Window only into the showroom toolbar and returns focus to the canvas", async () => {
    const user = userEvent.setup();
    const { sessionStore } = renderPlanEditorFixture({ profile: "showroom" });
    const canvas = screen.getByRole("region", { name: "二维平面画布" });

    const door = screen.getByRole("button", { name: "门" });
    await user.click(door);

    expect(sessionStore.getState().activeTool).toBe("door");
    expect(door).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(canvas).toHaveFocus());

    fireEvent.keyDown(canvas, { key: "Escape" });
    await waitFor(() => expect(sessionStore.getState().activeTool).toBe("select"));
    await waitFor(() => expect(door).toHaveFocus());

    cleanup();
    renderPlanEditorFixture({ profile: "market" });
    expect(screen.queryByRole("button", { name: "门" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "窗" })).not.toBeInTheDocument();
  });

  it("shows all dimensions, along-wall distance, validity, first issue, and persistence error", () => {
    const { sessionStore } = renderPlanEditorFixture({ profile: "showroom" });
    const sessionId = sessionStore.getState().sessionId;

    act(() => {
      sessionStore.getState().setActiveTool("door");
      sessionStore.getState().setOpeningPreview(openingPreview(sessionId, {
        persistenceError: "checkpoint unavailable",
      }));
    });

    const preview = screen.getByRole("status", { name: "门窗放置预览" });
    expect(preview).toHaveAttribute("data-valid", "false");
    expect(preview).toHaveTextContent("门");
    expect(preview).toHaveTextContent("900 × 2100 mm");
    expect(preview).toHaveTextContent("窗台高度 0 mm");
    expect(preview).toHaveTextContent("沿墙距离 500 mm");
    expect(preview).toHaveTextContent("无效：距墙端过近");
    expect(preview).toHaveTextContent("保存失败：checkpoint unavailable");
  });

  it("replaces the transient session and clears its opening preview when the project changes", async () => {
    const { store } = await sandboxProject("Opening session A");
    const firstFloorId = store.getState().snapshot!.project.floors[0]!.id;
    const sessionStore = createPlanEditorStore({
      activeFloorId: firstFloorId,
      sessionId: "session-a",
    });
    render(<PlanEditor
      store={store}
      dependencies={{ sessionStore, assetPicker: null }}
    />);

    act(() => {
      sessionStore.getState().setActiveTool("window");
      sessionStore.getState().setOpeningPreview(openingPreview("session-a", {
        tool: "window",
        width: 1_200,
        height: 1_200,
        sillHeight: 900,
      }));
    });
    expect(sessionStore.getState().openingPreview).not.toBeNull();

    await act(async () => {
      await store.close();
      await store.create({
        name: "Opening session B",
        location: "sandbox",
        profile: "showroom",
      });
    });

    await waitFor(() => expect(sessionStore.getState().openingPreview).toBeNull());
    expect(sessionStore.getState().activeTool).toBe("select");
    expect(sessionStore.getState().sessionId).not.toBe("session-a");
    expect(sessionStore.getState().activeFloorId).toBe(
      store.getState().snapshot!.project.floors[0]!.id,
    );
  });
});
async function projectWithTaskNineOpening(name: string) {
  const { backend, store } = await sandboxProject(name);
  const snapshot = store.getState().snapshot!;
  const floor = snapshot.project.floors[0]!;
  const wall: Wall = {
    id: "00000000-0000-4000-8000-000000000040",
    name: "North wall",
    tags: [],
    type: "wall",
    floorId: floor.id,
    layerId: floor.layers[0]!.id,
    locked: false,
    transform: {
      translation: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    centerLine: [{ x: -2_500, y: 0 }, { x: 2_500, y: 0 }],
    thickness: 100,
  };
  const opening: Opening = {
    id: "00000000-0000-4000-8000-000000000041",
    name: "North window",
    tags: [],
    wallId: wall.id,
    kind: "window",
    distanceAlongWall: 2_500,
    width: 1_200,
    height: 1_200,
    sillHeight: 900,
  };
  await store.applyBuildingStructurePatch({
    reason: "create",
    wallChanges: [{ id: wall.id, before: null, after: wall }],
    openingChanges: [{ id: opening.id, before: null, after: opening }],
  });
  return { backend, store, floor, wall, opening };
}

describe("PlanEditor Task 9 opening Inspector integration", () => {
  it("keeps accessible opening selection in selectedIds and routes Inspector edit/delete as record patches", async () => {
    const { store, floor, wall, opening } = await projectWithTaskNineOpening(
      "Opening selection",
    );
    const sessionStore = createPlanEditorStore({ activeFloorId: floor.id });
    render(
      <PlanEditor
        store={store}
        dependencies={{ sessionStore, assetPicker: null }}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", {
      name: `选择门窗：${opening.name}`,
    }));

    expect([...sessionStore.getState().selectedIds]).toEqual([opening.id]);
    const inspector = screen.getByRole("complementary", { name: "检查器" });
    expect(within(inspector).getByRole("heading", { name: "门窗" })).toBeVisible();
    expect(within(inspector).getByLabelText("门窗名称")).toHaveValue(opening.name);
    expect(inspector).toHaveTextContent(wall.name);
    expect(inspector).toHaveTextContent(wall.id);

    fireEvent.change(within(inspector).getByLabelText("门窗名称"), {
      target: { value: "Updated window" },
    });
    await user.click(within(inspector).getByRole("button", { name: "应用门窗" }));
    await waitFor(() => expect(
      store.getState().snapshot!.project.openings[0]?.name,
    ).toBe("Updated window"));
    expect([...sessionStore.getState().selectedIds]).toEqual([opening.id]);

    await user.click(within(inspector).getByRole("button", { name: "删除门窗" }));
    await waitFor(() => expect(
      store.getState().snapshot!.project.openings,
    ).toEqual([]));
    expect([...sessionStore.getState().selectedIds]).toEqual([]);
    expect(within(inspector).getByLabelText("项目名称"))
      .toHaveValue("Opening selection");
  });

  it("rejects a wall thickness change with the affected opening id before persistence", async () => {
    const { backend, store, wall, opening } = await projectWithTaskNineOpening(
      "Opening-safe reshape",
    );
    const commit = vi.spyOn(backend, "commit");
    render(<PlanEditor store={store} dependencies={{ assetPicker: null }} />);
    const user = userEvent.setup();

    await user.click(rowByData("data-entity-id", wall.id));
    const thickness = screen.getByLabelText("墙体厚度 (mm)");
    await user.clear(thickness);
    await user.type(thickness, "4500");
    await user.click(screen.getByRole("button", { name: "应用对象属性" }));

    await waitFor(() => expect(screen.getByRole("alert"))
      .toHaveTextContent(opening.id));
    expect(screen.getByRole("alert"))
      .toHaveTextContent("OPENING_ENDPOINT_CLEARANCE");
    expect(commit).not.toHaveBeenCalled();
    expect(store.getState().snapshot!.project.entities.find(
      (entity) => entity.id === wall.id,
    )).toMatchObject({ thickness: 100 });
    expect(store.getState().snapshot!.project.openings).toEqual([opening]);
  });
});
const roomIdentityTransform = {
  translation: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
} as const;

function squareRoomWalls(
  floorId: string,
  layerId: string,
  roomIndex: number,
  locked = true,
): readonly Wall[] {
  const x = roomIndex * 2_000;
  const points = [
    [{ x, y: 0 }, { x: x + 1_000, y: 0 }],
    [{ x: x + 1_000, y: 0 }, { x: x + 1_000, y: 1_000 }],
    [{ x: x + 1_000, y: 1_000 }, { x, y: 1_000 }],
    [{ x, y: 1_000 }, { x, y: 0 }],
  ] as const;
  return points.map((centerLine, index): Wall => ({
    id: `00000000-0000-4000-8001-${(roomIndex * 10 + index).toString().padStart(12, "0")}`,
    name: `Room ${roomIndex + 1} wall ${index + 1}`,
    tags: [],
    type: "wall",
    floorId,
    layerId,
    locked,
    transform: roomIdentityTransform,
    centerLine,
    thickness: 100,
  }));
}

function existingRoom(
  floorId: string,
  layerId: string,
  footprint: SpaceUnit["footprint"],
): SpaceUnit {
  return {
    id: "00000000-0000-4000-8002-000000000001",
    name: "Existing room",
    tags: ["preserve-me"],
    type: "space-unit",
    kind: "room",
    floorId,
    layerId,
    locked: false,
    transform: {
      translation: { x: 25, y: 50 },
      rotation: 0.25,
      scale: { x: 1.1, y: 0.9 },
    },
    footprint,
  };
}

async function addRoomTestEntities(
  applyPlanEdit: (intent: {
    readonly reason: "create";
    readonly changes: readonly {
      readonly id: string;
      readonly before: null;
      readonly after: SpatialEntity;
    }[];
  }) => Promise<void>,
  entities: readonly SpatialEntity[],
): Promise<void> {
  await act(async () => {
    await applyPlanEdit({
      reason: "create",
      changes: entities.map((entity) => ({
        id: entity.id,
        before: null,
        after: entity,
      })),
    });
  });
}

describe("PlanEditor Task 12 room recognition", () => {
  it("maps Room and Recognize Rooms only into showroom while market keeps Booth", async () => {
    const user = userEvent.setup();
    const { sessionStore, applyPlanEdit } = renderPlanEditorFixture({
      profile: "showroom",
    });
    const activeTool = sessionStore.getState().activeTool;

    expect(screen.getByRole("button", { name: "\u623f\u95f4" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "\u8bc6\u522b\u623f\u95f4" }));
    await screen.findByRole("region", { name: "\u623f\u95f4\u8bc6\u522b" });
    expect(sessionStore.getState().activeTool).toBe(activeTool);
    expect(applyPlanEdit).not.toHaveBeenCalled();

    cleanup();
    renderPlanEditorFixture({ profile: "market" });
    expect(screen.getByRole("button", { name: "\u644a\u4f4d" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "\u623f\u95f4" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "\u8bc6\u522b\u623f\u95f4" })).not.toBeInTheDocument();
  });

  it("recognizes locked visible walls read-only, orders overlays, and labels represented rooms", async () => {
    const user = userEvent.setup();
    const renderer = new FakePlanRenderer();
    const {
      floorA,
      floorB,
      layerA,
      layerB,
      applyPlanEdit,
      applyFloorPatch,
      sessionStore,
    } = renderPlanEditorFixture({
      profile: "showroom",
      renderer,
    });
    const walls = [
      ...squareRoomWalls(floorA.id, layerA.id, 0),
      ...squareRoomWalls(floorA.id, layerA.id, 1),
    ];
    const excludedWalls = [
      ...squareRoomWalls(floorA.id, layerB.id, 3),
      ...squareRoomWalls(floorB.id, floorB.layers[0]!.id, 4),
    ];
    await act(async () => {
      await applyFloorPatch({
        floorId: floorA.id,
        before: floorA,
        after: {
          ...floorA,
          layers: [layerA, { ...layerB, visible: false }],
        },
      });
    });
    const represented: SpaceUnit = {
      ...existingRoom(floorA.id, layerA.id, [
        { x: 0, y: 0 },
        { x: 1_000, y: 0 },
        { x: 1_000, y: 1_000 },
        { x: 0, y: 1_000 },
      ]),
      transform: roomIdentityTransform,
    };
    await addRoomTestEntities(applyPlanEdit, [...walls, ...excludedWalls, represented]);
    applyPlanEdit.mockClear();

    await user.click(screen.getByRole("button", { name: "\u8bc6\u522b\u623f\u95f4" }));
    const candidateButtons = await screen.findAllByRole("button", {
      name: /\u9009\u62e9\u623f\u95f4\u5019\u9009/,
    });
    expect(candidateButtons).toHaveLength(2);
    expect(screen.getByText(/\u5019\u9009 1 .* \u5df2\u5b58\u5728/)).toBeVisible();
    expect(screen.getByText(/\u5019\u9009 2 .* \u5f85\u786e\u8ba4/)).toBeVisible();
    expect(applyPlanEdit).not.toHaveBeenCalled();

    await waitFor(() => {
      const input = renderer.updateInputs.at(-1);
      expect(input?.roomCandidates).toHaveLength(2);
      expect(input?.roomCandidates?.[0]).toMatchObject({
        represented: true,
        selected: true,
      });
    });
    await user.click(candidateButtons[1]!);
    expect([...sessionStore.getState().selectedIds]).toEqual([]);
    await waitFor(() => expect(
      renderer.updateInputs.at(-1)?.roomCandidates?.[1]?.selected,
    ).toBe(true));
  });

  it("confirms only the selected candidate through one plan edit", async () => {
    const user = userEvent.setup();
    const { floorA, layerA, applyPlanEdit } = renderPlanEditorFixture({
      profile: "showroom",
    });
    await addRoomTestEntities(applyPlanEdit, [
      ...squareRoomWalls(floorA.id, layerA.id, 0),
      ...squareRoomWalls(floorA.id, layerA.id, 1),
    ]);
    applyPlanEdit.mockClear();

    await user.click(screen.getByRole("button", { name: "\u8bc6\u522b\u623f\u95f4" }));
    const candidates = await screen.findAllByRole("button", {
      name: /\u9009\u62e9\u623f\u95f4\u5019\u9009/,
    });
    await user.click(candidates[1]!);
    await user.click(screen.getByRole("button", { name: "\u786e\u8ba4\u5f53\u524d\u5019\u9009" }));

    await waitFor(() => expect(applyPlanEdit).toHaveBeenCalledOnce());
    expect(applyPlanEdit.mock.calls[0]?.[0]).toMatchObject({
      reason: "create",
      changes: [{
        before: null,
        after: {
          type: "space-unit",
          kind: "room",
          name: "Room 1",
          footprint: [
            { x: 2_000, y: 0 },
            { x: 3_000, y: 0 },
            { x: 3_000, y: 1_000 },
            { x: 2_000, y: 1_000 },
          ],
        },
      }],
    });
  });
  it("confirms all unrepresented candidates through one plan edit", async () => {
    const user = userEvent.setup();
    const { floorA, layerA, applyPlanEdit } = renderPlanEditorFixture({
      profile: "showroom",
    });
    await addRoomTestEntities(applyPlanEdit, [
      ...squareRoomWalls(floorA.id, layerA.id, 0),
      ...squareRoomWalls(floorA.id, layerA.id, 1),
    ]);
    applyPlanEdit.mockClear();

    await user.click(screen.getByRole("button", { name: "\u8bc6\u522b\u623f\u95f4" }));
    await screen.findAllByRole("button", { name: /\u9009\u62e9\u623f\u95f4\u5019\u9009/ });
    await user.click(screen.getByRole("button", { name: "\u786e\u8ba4\u5168\u90e8\u5019\u9009" }));

    await waitFor(() => expect(applyPlanEdit).toHaveBeenCalledOnce());
    expect(applyPlanEdit.mock.calls[0]?.[0]).toMatchObject({
      reason: "create",
      changes: [
        { before: null, after: { type: "space-unit", kind: "room", name: "Room 1" } },
        { before: null, after: { type: "space-unit", kind: "room", name: "Room 2" } },
      ],
    });
  });

  it("stales relevant wall changes but ignores fixture metadata changes", async () => {
    const user = userEvent.setup();
    const {
      floorA,
      layerA,
      layerB,
      fixture,
      applyPlanEdit,
      applyFloorPatch,
      sessionStore,
    } = renderPlanEditorFixture({ profile: "showroom" });
    const walls = squareRoomWalls(floorA.id, layerA.id, 0);
    await addRoomTestEntities(applyPlanEdit, walls);
    applyPlanEdit.mockClear();
    await user.click(screen.getByRole("button", { name: "\u8bc6\u522b\u623f\u95f4" }));
    await screen.findByRole("button", { name: "\u9009\u62e9\u623f\u95f4\u5019\u9009 1" });

    await act(async () => {
      await applyPlanEdit({
        reason: "properties",
        changes: [{
          id: fixture.id,
          before: fixture,
          after: { ...fixture, name: "Fixture metadata changed" },
        }],
      });
    });
    expect(sessionStore.getState().roomRecognition?.stale).toBe(false);
    expect(screen.getByRole("button", { name: "\u786e\u8ba4\u5f53\u524d\u5019\u9009" })).toBeEnabled();

    await act(async () => {
      await applyFloorPatch({
        floorId: floorA.id,
        before: floorA,
        after: {
          ...floorA,
          layers: [layerA, { ...layerB, visible: false }],
        },
      });
    });
    await waitFor(() => expect(sessionStore.getState().roomRecognition?.stale).toBe(true));
    await user.click(screen.getByRole("button", { name: "\u91cd\u65b0\u8bc6\u522b" }));
    await waitFor(() => expect(sessionStore.getState().roomRecognition?.stale).toBe(false));

    const wall = walls[0]!;
    await act(async () => {
      await applyPlanEdit({
        reason: "transform",
        changes: [{
          id: wall.id,
          before: wall,
          after: {
            ...wall,
            centerLine: [{ x: 0, y: 0 }, { x: 900, y: 0 }],
          },
        }],
      });
    });
    await waitFor(() => expect(sessionStore.getState().roomRecognition?.stale).toBe(true));
    expect(screen.getByText("\u8bc6\u522b\u7ed3\u679c\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u8bc6\u522b\u3002")).toBeVisible();
    expect(screen.getByRole("button", { name: "\u786e\u8ba4\u5f53\u524d\u5019\u9009" })).toBeDisabled();
  });

  it("rechecks the fingerprint immediately before confirmation", async () => {
    const user = userEvent.setup();
    const {
      floorA,
      layerA,
      applyPlanEdit,
      projectStore,
      sessionStore,
    } = renderPlanEditorFixture({ profile: "showroom" });
    const walls = squareRoomWalls(floorA.id, layerA.id, 0);
    await addRoomTestEntities(applyPlanEdit, walls);
    applyPlanEdit.mockClear();
    await user.click(screen.getByRole("button", { name: "\u8bc6\u522b\u623f\u95f4" }));
    await screen.findByRole("button", { name: "\u9009\u62e9\u623f\u95f4\u5019\u9009 1" });

    const current = projectStore.getState();
    const snapshot = current.snapshot!;
    const changedWall = {
      ...walls[0]!,
      centerLine: [{ x: 0, y: 0 }, { x: 750, y: 0 }],
    } as Wall;
    vi.spyOn(projectStore, "getState").mockReturnValue({
      ...current,
      snapshot: {
        ...snapshot,
        project: {
          ...snapshot.project,
          entities: snapshot.project.entities.map((entity) => (
            entity.id === changedWall.id ? changedWall : entity
          )),
        },
      },
    });

    await user.click(screen.getByRole("button", { name: "\u786e\u8ba4\u5f53\u524d\u5019\u9009" }));
    expect(applyPlanEdit).not.toHaveBeenCalled();
    expect(sessionStore.getState().roomRecognition?.stale).toBe(true);
  });
  it("retains candidates after persistence failure and reports a missing creation layer", async () => {
    const user = userEvent.setup();
    const { floorA, layerA, layerB, applyPlanEdit, applyFloorPatch, sessionStore } =
      renderPlanEditorFixture({ profile: "showroom" });
    await addRoomTestEntities(
      applyPlanEdit,
      squareRoomWalls(floorA.id, layerA.id, 0),
    );
    applyPlanEdit.mockClear();
    await user.click(screen.getByRole("button", { name: "\u8bc6\u522b\u623f\u95f4" }));
    await screen.findByRole("button", { name: "\u9009\u62e9\u623f\u95f4\u5019\u9009 1" });

    applyPlanEdit.mockRejectedValueOnce(new Error("checkpoint unavailable"));
    await user.click(screen.getByRole("button", { name: "\u786e\u8ba4\u5f53\u524d\u5019\u9009" }));
    expect(await screen.findByText("\u4fdd\u5b58\u5931\u8d25\uff1acheckpoint unavailable")).toBeVisible();
    expect(sessionStore.getState().roomRecognition?.candidates).toHaveLength(1);

    applyPlanEdit.mockClear();
    await act(async () => {
      await applyFloorPatch({
        floorId: floorA.id,
        before: floorA,
        after: {
          ...floorA,
          layers: [
            { ...layerA, locked: true },
            { ...layerB, locked: true },
          ],
        },
      });
    });
    await user.click(screen.getByRole("button", { name: "\u786e\u8ba4\u5f53\u524d\u5019\u9009" }));
    expect(await screen.findByText(/NO_EDITABLE_CREATION_LAYER/)).toBeVisible();
    expect(applyPlanEdit).not.toHaveBeenCalled();
    expect(sessionStore.getState().roomRecognition?.candidates).toHaveLength(1);
  });

  it("explicitly replaces one editable room while preserving identity and metadata", async () => {
    const user = userEvent.setup();
    const { floorA, layerA, applyPlanEdit, sessionStore } =
      renderPlanEditorFixture({ profile: "showroom" });
    const room = existingRoom(floorA.id, layerA.id, [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 300 },
      { x: 100, y: 300 },
    ]);
    await addRoomTestEntities(applyPlanEdit, [
      ...squareRoomWalls(floorA.id, layerA.id, 0),
      room,
    ]);
    applyPlanEdit.mockClear();
    await user.click(screen.getByRole("button", { name: "\u8bc6\u522b\u623f\u95f4" }));
    await screen.findByRole("button", { name: "\u9009\u62e9\u623f\u95f4\u5019\u9009 1" });
    expect(screen.getByRole("button", { name: "\u7528\u5019\u9009\u66ff\u6362\u6240\u9009\u623f\u95f4" })).toBeDisabled();

    act(() => sessionStore.getState().setSelection([room.id]));
    expect(screen.getByRole("button", { name: "\u7528\u5019\u9009\u66ff\u6362\u6240\u9009\u623f\u95f4" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "\u7528\u5019\u9009\u66ff\u6362\u6240\u9009\u623f\u95f4" }));

    await waitFor(() => expect(applyPlanEdit).toHaveBeenCalledOnce());
    const change = applyPlanEdit.mock.calls[0]?.[0].changes[0];
    expect(change?.before).toEqual(room);
    expect(change?.after).toMatchObject({
      id: room.id,
      name: room.name,
      tags: room.tags,
      floorId: room.floorId,
      layerId: room.layerId,
      locked: room.locked,
      transform: roomIdentityTransform,
      footprint: [
        { x: 0, y: 0 },
        { x: 1_000, y: 0 },
        { x: 1_000, y: 1_000 },
        { x: 0, y: 1_000 },
      ],
    });
  });

  it("clears transient candidates on unmount", async () => {
    const user = userEvent.setup();
    const { floorA, layerA, applyPlanEdit, sessionStore, unmount } =
      renderPlanEditorFixture({ profile: "showroom" });
    await addRoomTestEntities(
      applyPlanEdit,
      squareRoomWalls(floorA.id, layerA.id, 0),
    );
    await user.click(screen.getByRole("button", { name: "\u8bc6\u522b\u623f\u95f4" }));
    await screen.findByRole("button", { name: "\u9009\u62e9\u623f\u95f4\u5019\u9009 1" });
    expect(sessionStore.getState().roomRecognition).not.toBeNull();

    unmount();
    expect(sessionStore.getState().roomRecognition).toBeNull();
  });
});

describe("PlanEditor Task 14 fixture compatibility", () => {
  it("shows a read-only standard kind and lazily materializes the catalogue height on explicit Apply", async () => {
    const user = userEvent.setup();
    const {
      fixture,
      projectStore,
      applyPlanEdit,
    } = renderPlanEditorFixture({ profile: "showroom" });
    const legacyFixture: Fixture = {
      ...fixture,
      name: "Legacy display case",
      kind: "display-case",
      size: { width: 1_200, height: 600 },
    };
    await act(async () => {
      await applyPlanEdit({
        reason: "properties",
        changes: [{
          id: fixture.id,
          before: fixture,
          after: legacyFixture,
        }],
      });
    });
    applyPlanEdit.mockClear();
    const sequenceBeforeSelection = projectStore.getState().snapshot!.sequence;

    await user.click(rowByData("data-entity-id", fixture.id));

    const inspector = screen.getByRole("complementary", { name: "检查器" });
    const kindMetadata = within(inspector).getByText("展具种类").parentElement;
    expect(kindMetadata).toHaveTextContent("display-case");
    expect(within(inspector).queryByLabelText("展具种类")).not.toBeInTheDocument();
    expect(within(inspector).getByLabelText("对象名称")).toHaveValue(legacyFixture.name);
    expect(within(inspector).getByLabelText("对象 X (mm)")).toHaveValue("0");
    expect(within(inspector).getByLabelText("对象 Y (mm)")).toHaveValue("0");
    expect(within(inspector).getByLabelText("对象旋转 (°)")).toHaveValue("0");
    expect(within(inspector).getByLabelText("对象图层")).toHaveValue(fixture.layerId);
    expect(within(inspector).getByRole("checkbox", { name: "对象锁定" })).not.toBeChecked();
    expect(within(inspector).getByLabelText("对象标签")).toHaveValue("");
    expect(within(inspector).getByLabelText("对象宽度 (mm)")).toHaveValue("1200");
    expect(within(inspector).getByLabelText("对象深度 (mm)")).toHaveValue("600");
    expect(within(inspector).getByLabelText("对象垂直高度 (mm)")).toHaveValue("1200");
    expect(projectStore.getState().snapshot!.sequence).toBe(sequenceBeforeSelection);
    expect(
      projectStore.getState().snapshot!.project.entities.find(
        (entity) => entity.id === fixture.id,
      ),
    ).not.toHaveProperty("spatial3D");
    expect(applyPlanEdit).not.toHaveBeenCalled();

    await user.click(within(inspector).getByRole("button", { name: "应用对象属性" }));

    await waitFor(() => expect(applyPlanEdit).toHaveBeenCalledOnce());
    expect(applyPlanEdit).toHaveBeenLastCalledWith({
      reason: "properties",
      changes: [{
        id: fixture.id,
        before: legacyFixture,
        after: {
          ...legacyFixture,
          spatial3D: { elevation: 0, height: 1_200 },
        },
      }],
    });
  });

  it("submits width, depth, and stored vertical height atomically while preserving elevation", async () => {
    const user = userEvent.setup();
    const { fixture, applyPlanEdit } = renderPlanEditorFixture({ profile: "showroom" });
    const storedFixture: Fixture = {
      ...fixture,
      name: "Stored shelf",
      kind: "shelf",
      size: { width: 900, height: 350 },
      spatial3D: { elevation: 125, height: 1_800 },
    };
    await act(async () => {
      await applyPlanEdit({
        reason: "properties",
        changes: [{ id: fixture.id, before: fixture, after: storedFixture }],
      });
    });
    applyPlanEdit.mockClear();
    await user.click(rowByData("data-entity-id", fixture.id));

    const width = screen.getByLabelText("对象宽度 (mm)");
    const depth = screen.getByLabelText("对象深度 (mm)");
    const verticalHeight = screen.getByLabelText("对象垂直高度 (mm)");
    expect(verticalHeight).toHaveValue("1800");
    for (const [field, value] of [
      [width, "1.1m"],
      [depth, "45cm"],
      [verticalHeight, "2m"],
    ] as const) {
      await user.clear(field);
      await user.type(field, value);
    }
    await user.click(screen.getByRole("button", { name: "应用对象属性" }));

    await waitFor(() => expect(applyPlanEdit).toHaveBeenCalledOnce());
    expect(applyPlanEdit).toHaveBeenLastCalledWith({
      reason: "properties",
      changes: [{
        id: fixture.id,
        before: storedFixture,
        after: {
          ...storedFixture,
          size: { width: 1_100, height: 450 },
          spatial3D: { elevation: 125, height: 2_000 },
        },
      }],
    });
  });

  it("keeps generic height blank, adds it on entry, and removes it when cleared", async () => {
    const user = userEvent.setup();
    const { fixture, applyPlanEdit } = renderPlanEditorFixture({ profile: "showroom" });
    await user.click(rowByData("data-entity-id", fixture.id));
    const verticalHeight = screen.getByLabelText("对象垂直高度 (mm)");
    expect(verticalHeight).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "应用对象属性" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(applyPlanEdit).not.toHaveBeenCalled();

    await user.type(verticalHeight, "75cm");
    await user.click(screen.getByRole("button", { name: "应用对象属性" }));
    await waitFor(() => expect(applyPlanEdit).toHaveBeenCalledOnce());
    const withHeight = applyPlanEdit.mock.calls[0]![0].changes[0]!.after as Fixture;
    expect(withHeight).toEqual({
      ...fixture,
      spatial3D: { elevation: 0, height: 750 },
    });

    applyPlanEdit.mockClear();
    await waitFor(() => expect(verticalHeight).toHaveValue("750"));
    await user.clear(verticalHeight);
    await user.click(screen.getByRole("button", { name: "应用对象属性" }));

    await waitFor(() => expect(applyPlanEdit).toHaveBeenCalledOnce());
    expect(applyPlanEdit.mock.calls[0]![0].changes[0]!.before).toEqual(withHeight);
    expect(applyPlanEdit.mock.calls[0]![0].changes[0]!.after).toEqual(fixture);
  });

  it.each(["0", "-1", "Infinity"])(
    "rejects non-positive or non-finite vertical height %s without publishing",
    async (invalidHeight) => {
      const user = userEvent.setup();
      const { fixture, applyPlanEdit } = renderPlanEditorFixture({ profile: "showroom" });
      const standardFixture: Fixture = {
        ...fixture,
        kind: "screen",
        spatial3D: { elevation: 0, height: 1_800 },
      };
      await act(async () => {
        await applyPlanEdit({
          reason: "properties",
          changes: [{ id: fixture.id, before: fixture, after: standardFixture }],
        });
      });
      applyPlanEdit.mockClear();
      await user.click(rowByData("data-entity-id", fixture.id));
      const field = screen.getByLabelText("对象垂直高度 (mm)");

      await user.clear(field);
      await user.type(field, invalidHeight);
      await user.click(screen.getByRole("button", { name: "应用对象属性" }));

      const alert = screen.getByRole("alert");
      expect(alert).toHaveAttribute("data-issue-code", "INVALID_LENGTH");
      expect(alert).toHaveTextContent("垂直高度必须是正数");
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(applyPlanEdit).not.toHaveBeenCalled();
    },
  );

  it("exposes kind and all dimensions for all eight fixture kinds without offering generic in the catalogue", async () => {
    const user = userEvent.setup();
    const { fixture, applyPlanEdit } = renderPlanEditorFixture({ profile: "showroom" });
    const catalogueFixtures = SHOWROOM_FIXTURE_CATALOGUE.map((descriptor, index): Fixture => ({
      ...fixture,
      id: `00000000-0000-4000-8000-${(60 + index).toString().padStart(12, "0")}`,
      name: `Accessible ${descriptor.kind}`,
      kind: descriptor.kind,
      size: {
        width: descriptor.defaultSize.width,
        height: descriptor.defaultSize.depth,
      },
    }));
    const genericFixture: Fixture = {
      ...fixture,
      id: "00000000-0000-4000-8000-000000000067",
      name: "Accessible generic",
      kind: "generic",
      size: { width: 900, height: 450 },
    };
    await act(async () => {
      await applyPlanEdit({
        reason: "create",
        changes: [...catalogueFixtures, genericFixture].map((entity) => ({
          id: entity.id,
          before: null,
          after: entity,
        })),
      });
    });

    const accessibility = screen.getByRole("region", {
      name: "可访问对象列表",
    });

    for (const entity of catalogueFixtures) {
      const descriptor = showroomFixture(entity.kind as Exclude<Fixture["kind"], "generic">);
      const row = within(accessibility).getByRole("button", {
        name: `选择对象：${entity.name}`,
      }).closest("li");
      expect(row).toHaveTextContent(`展具种类 ${entity.kind}`);
      expect(row).toHaveTextContent(`宽度 ${descriptor.defaultSize.width} mm`);
      expect(row).toHaveTextContent(`深度 ${descriptor.defaultSize.depth} mm`);
      expect(row).toHaveTextContent(`垂直高度 ${descriptor.defaultSize.height} mm`);
      expect(row).toHaveTextContent("未选择");
      expect(row).toHaveTextContent("可编辑");
    }
    const genericRow = within(accessibility).getByRole("button", {
      name: `选择对象：${genericFixture.name}`,
    }).closest("li");
    expect(genericRow).toHaveTextContent("展具种类 generic");
    expect(genericRow).toHaveTextContent("宽度 900 mm");
    expect(genericRow).toHaveTextContent("深度 450 mm");
    expect(genericRow).toHaveTextContent("垂直高度 未设置");

    await user.click(screen.getByRole("button", { name: "展具目录" }));
    const catalogue = screen.getByRole("region", { name: "展具目录" });
    expect(within(catalogue).getAllByRole("button")).toHaveLength(7);
    expect(within(catalogue).queryByText(/generic|通用/i)).not.toBeInTheDocument();
  });
});

describe('PlanEditor Task 10 product-hotspot integration', function () {
  it('creates one hotspot/content command and undoes or redoes both', async function () {
    const { store } = await sandboxProject('Product hotspot placement');
    const floor = store.getState().snapshot!.project.floors[0]!;
    const sessionStore = createPlanEditorStore({ activeFloorId: floor.id });
    const user = userEvent.setup();
    render(<PlanEditor
      store={store}
      dependencies={{ sessionStore, assetPicker: null }}
    />);

    await user.click(screen.getByRole('button', { name: '产品热点' }));
    expect(sessionStore.getState().activeTool).toBe('product-hotspot');
    const x = screen.getByLabelText('产品热点 X 坐标 (mm)');
    const y = screen.getByLabelText('产品热点 Y 坐标 (mm)');
    await user.clear(x);
    await user.type(x, '1250');
    await user.clear(y);
    await user.type(y, '-750');
    await user.click(screen.getByRole('button', {
      name: '在坐标创建产品热点',
    }));

    await waitFor(function () {
      expect(
        store.getState().snapshot!.project.productContents,
        store.getState().error?.message,
      ).toHaveLength(1);
    });
    const created = store.getState().snapshot!;
    const hotspot = created.project.entities.find(function (entity) {
      return entity.type === 'poi' && entity.kind === 'product-hotspot';
    })!;
    const content = created.project.productContents[0]!;
    expect(hotspot.transform.translation).toEqual({ x: 1_250, y: -750 });
    expect(hotspot).not.toHaveProperty('spatial3D');
    expect(content.targetEntityId).toBe(hotspot.id);
    expect([...sessionStore.getState().selectedIds]).toEqual([hotspot.id]);

    await act(async function () {
      await store.undo();
    });
    expect(store.getState().snapshot!.project.entities.some(function (entity) {
      return entity.id === hotspot.id;
    })).toBe(false);
    expect(store.getState().snapshot!.project.productContents).toEqual([]);

    await act(async function () {
      await store.redo();
    });
    expect(store.getState().snapshot!.project.entities.find(function (entity) {
      return entity.id === hotspot.id;
    })).toEqual(hotspot);
    expect(store.getState().snapshot!.project.productContents).toEqual([content]);
  });
});

describe('M2.3 Task 11 content Inspector wiring', () => {
  it('creates the first Fixture content only when metadata is confirmed', async () => {
    const { store } = await sandboxProject('Fixture content authoring');
    const floor = store.getState().snapshot!.project.floors[0]!;
    const fixture: Fixture = {
      id: '00000000-0000-4000-8000-000000000301',
      name: 'North display',
      tags: ['featured'],
      floorId: floor.id,
      layerId: floor.layers[0]!.id,
      transform: {
        translation: { x: 1_000, y: 500 },
        rotation: 0,
        scale: { x: 1, y: 1 },
      },
      locked: false,
      type: 'fixture',
      kind: 'display-table',
      size: { width: 1_200, height: 600 },
    };
    await store.applyPlanEdit({
      reason: 'create',
      changes: [{ id: fixture.id, before: null, after: fixture }],
    });
    const sessionStore = createPlanEditorStore({ activeFloorId: floor.id });
    const makeId = vi.fn(() => '00000000-0000-4000-8000-000000000302');
    render(<PlanEditor store={store} dependencies={{ sessionStore, makeId }} />);
    const user = userEvent.setup();

    await user.click(rowByData('data-entity-id', fixture.id));

    expect(screen.getByRole('heading', { name: '产品内容' })).toBeVisible();
    expect(screen.getByLabelText('内容名称')).toHaveValue('North display');
    expect(screen.getByLabelText('内容描述')).toHaveValue('');
    expect(screen.getByLabelText('内容标签')).toHaveValue('featured');
    expect(makeId).not.toHaveBeenCalled();
    expect(store.getState().snapshot!.project.productContents).toEqual([]);

    await user.clear(screen.getByLabelText('内容名称'));
    await user.type(screen.getByLabelText('内容名称'), 'North product');
    await user.type(screen.getByLabelText('内容描述'), 'Featured product copy');
    await user.click(screen.getByRole('button', { name: '应用内容' }));

    await waitFor(() => {
      expect(store.getState().snapshot!.project.productContents).toHaveLength(1);
    });
    const created = store.getState().snapshot!.project.productContents[0]!;
    expect(created).toEqual({
      id: '00000000-0000-4000-8000-000000000302',
      name: 'North product',
      tags: ['featured'],
      targetEntityId: fixture.id,
      description: 'Featured product copy',
      mediaAssetIds: [],
    });
    expect(makeId).toHaveBeenCalledOnce();

    await act(async () => store.undo());
    expect(store.getState().snapshot!.project.productContents).toEqual([]);
    await act(async () => store.redo());
    expect(store.getState().snapshot!.project.productContents).toEqual([created]);
  });

  it('edits existing hotspot content without allocating a replacement identity', async () => {
    const { store } = await sandboxProject('Hotspot content authoring');
    const floor = store.getState().snapshot!.project.floors[0]!;
    const hotspot: PointOfInterest = {
      id: '00000000-0000-4000-8000-000000000303',
      name: 'Existing hotspot',
      tags: [],
      floorId: floor.id,
      layerId: floor.layers[0]!.id,
      transform: {
        translation: { x: 250, y: -400 },
        rotation: 0,
        scale: { x: 1, y: 1 },
      },
      locked: false,
      type: 'poi',
      kind: 'product-hotspot',
    };
    const before: ProductContent = {
      id: '00000000-0000-4000-8000-000000000304',
      name: 'Existing product',
      tags: ['north'],
      targetEntityId: hotspot.id,
      description: 'Before copy',
      mediaAssetIds: [],
    };
    await store.applySnapshotRecordPatches([
      {
        collection: 'entities',
        changes: [{ id: hotspot.id, before: null, after: hotspot }],
      },
      {
        collection: 'productContents',
        changes: [{ id: before.id, before: null, after: before }],
      },
    ]);
    const sessionStore = createPlanEditorStore({ activeFloorId: floor.id });
    const makeId = vi.fn(() => '00000000-0000-4000-8000-000000000305');
    render(<PlanEditor store={store} dependencies={{ sessionStore, makeId }} />);
    const user = userEvent.setup();

    await user.click(rowByData('data-entity-id', hotspot.id));
    expect(screen.getByLabelText('内容名称')).toHaveValue('Existing product');
    await user.clear(screen.getByLabelText('内容描述'));
    await user.type(screen.getByLabelText('内容描述'), 'After copy');
    await user.click(screen.getByRole('button', { name: '应用内容' }));

    await waitFor(() => {
      expect(store.getState().snapshot!.project.productContents[0]!.description)
        .toBe('After copy');
    });
    expect(store.getState().snapshot!.project.productContents[0]).toEqual({
      ...before,
      description: 'After copy',
    });
    expect(makeId).not.toHaveBeenCalled();

    await act(async () => store.undo());
    expect(store.getState().snapshot!.project.productContents).toEqual([before]);
    await act(async () => store.redo());
    expect(store.getState().snapshot!.project.productContents[0]!.description)
      .toBe('After copy');
  });
});

describe("PlanEditor M2.3 Task 13 guided-route integration", () => {
  it("persists one confirmed route with the exact user-authored stop order and restores focus to the route trigger", async () => {
    const { store } = await sandboxProject("Guided route authoring");
    const floor = store.getState().snapshot!.project.floors[0]!;
    const nodes: readonly RouteNode[] = [
      { id: "00000000-0000-4000-8000-000000001371", name: "Entrance", tags: [], floorId: floor.id, position: { x: 0, y: 0 }, kind: "entrance" },
      { id: "00000000-0000-4000-8000-000000001372", name: "Gallery", tags: [], floorId: floor.id, position: { x: 100, y: 0 }, kind: "showroom-stop" },
      { id: "00000000-0000-4000-8000-000000001373", name: "Lounge", tags: [], floorId: floor.id, position: { x: 200, y: 0 }, kind: "showroom-stop" },
    ];
    const edge = (id: string, from: string, to: string): RouteEdge => ({
      id, name: id, tags: [], from, to, distance: 100, bidirectional: true,
      accessible: true, enabled: true, width: 1200, weight: 1,
    });
    const network: RouteNetwork = {
      id: "00000000-0000-4000-8000-000000001374",
      name: "Visitor circuit",
      tags: [],
      nodes,
      edges: [
        edge("00000000-0000-4000-8000-000000001375", nodes[0]!.id, nodes[1]!.id),
        edge("00000000-0000-4000-8000-000000001376", nodes[1]!.id, nodes[2]!.id),
      ],
    };
    await store.applySnapshotRecordPatches([{
      collection: "routeNetworks",
      changes: [{ id: network.id, before: null, after: network }],
    }]);
    const sessionStore = createPlanEditorStore({ activeFloorId: floor.id });
    render(<PlanEditor store={store} dependencies={{
      sessionStore,
      makeId: () => "00000000-0000-4000-8000-000000001377",
    }} />);
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "编辑停靠点" });
    expect(trigger).toBeEnabled();
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "添加站点：Entrance" }));
    await user.click(screen.getByRole("button", { name: "添加站点：Gallery" }));
    await user.click(screen.getByRole("button", { name: "添加站点：Lounge" }));
    await user.click(screen.getByRole("button", { name: "上移站点：Lounge" }));
    await user.click(screen.getByRole("button", { name: "确认导览路线" }));

    await waitFor(() => expect(store.getState().snapshot!.project.guidedRoutes).toEqual([{
      id: "00000000-0000-4000-8000-000000001377",
      name: "导览路线",
      tags: [],
      routeNetworkId: network.id,
      stopNodeIds: [nodes[0]!.id, nodes[2]!.id, nodes[1]!.id],
    }]));
    expect(trigger).toHaveFocus();
  });

  it("keeps the persisted route and shared tree/canvas selection exact when a draft contains a NO_ROUTE pair", async () => {
    const { store } = await sandboxProject("Guided route failure");
    const floor = store.getState().snapshot!.project.floors[0]!;
    const entrance: RouteNode = { id: "00000000-0000-4000-8000-000000001381", name: "Entrance", tags: [], floorId: floor.id, position: { x: 0, y: 0 }, kind: "entrance" };
    const connected: RouteNode = { id: "00000000-0000-4000-8000-000000001382", name: "Connected gallery", tags: [], floorId: floor.id, position: { x: 100, y: 0 }, kind: "showroom-stop" };
    const isolated: RouteNode = { id: "00000000-0000-4000-8000-000000001383", name: "Isolated gallery", tags: [], floorId: floor.id, position: { x: 400, y: 0 }, kind: "showroom-stop" };
    const network: RouteNetwork = {
      id: "00000000-0000-4000-8000-000000001384", name: "Broken circuit", tags: [],
      nodes: [entrance, connected, isolated],
      edges: [{
        id: "00000000-0000-4000-8000-000000001385", name: "arrival edge", tags: [],
        from: entrance.id, to: connected.id, distance: 100, bidirectional: true,
        accessible: true, enabled: true, width: 1200, weight: 1,
      }],
    };
    const saved: GuidedRoute = {
      id: "00000000-0000-4000-8000-000000001386", name: "Saved visitor route", tags: [],
      routeNetworkId: network.id, stopNodeIds: [entrance.id, connected.id],
    };
    await store.applySnapshotRecordPatches([{
      collection: "routeNetworks",
      changes: [{ id: network.id, before: null, after: network }],
    }, {
      collection: "guidedRoutes",
      changes: [{ id: saved.id, before: null, after: saved }],
    }]);
    const sessionStore = createPlanEditorStore({ activeFloorId: floor.id });
    render(<PlanEditor store={store} dependencies={{ sessionStore }} />);
    const user = userEvent.setup();

    await user.click(within(screen.getByRole("tree")).getByRole("button", {
      name: "选择路线节点：Connected gallery",
    }));
    expect([...sessionStore.getState().selectedIds]).toEqual([connected.id]);
    const canvas = screen.getByRole("region", { name: "二维平面画布" });
    expect(within(canvas).getByRole("button", { name: "选择路线节点：Connected gallery" }))
      .toHaveAttribute("aria-pressed", "true");

    const preview = screen.getByRole("button", { name: "预览路线" });
    expect(preview).toBeEnabled();
    await user.click(preview);
    await user.click(screen.getByRole("button", { name: "添加站点：Isolated gallery" }));
    expect(screen.getByRole("alert")).toHaveTextContent("NO_ROUTE");
    expect(store.getState().snapshot!.project.guidedRoutes).toEqual([saved]);
    expect([...sessionStore.getState().selectedIds]).toEqual([connected.id]);
    expect(screen.getByRole("button", { name: "确认导览路线" })).toBeDisabled();
  });
});

describe("PlanEditor M2.3 Task 13 global curated-route regressions", () => {
  function routeNode(id: string, name: string, floorId: string): RouteNode {
    return {
      id, name, tags: [], floorId, position: { x: Number(id.slice(-3)), y: 0 },
      kind: name === "Entrance" ? "entrance" : "showroom-stop",
    };
  }

  function routeNetwork(
    id: string,
    name: string,
    first: RouteNode,
    second: RouteNode,
    third?: RouteNode,
  ): RouteNetwork {
    const nodes = third === undefined ? [first, second] : [first, second, third];
    return {
      id, name, tags: [], nodes,
      edges: nodes.slice(1).map((node, index): RouteEdge => ({
        id: `${id.slice(0, -4)}${(Number(id.slice(-4)) + 4000 + index).toString().padStart(4, "0")}`,
        name: `${name} ${index + 1}`,
        tags: [],
        from: nodes[index]!.id,
        to: node.id,
        distance: Math.hypot(
          node.position.x - nodes[index]!.position.x,
          node.position.y - nodes[index]!.position.y,
        ),
        bidirectional: true,
        accessible: true,
        enabled: true,
        width: 1200,
        weight: 1,
      })),
    };
  }

  it("edits the one existing curated route and its network even when route authoring currently points at another network", async () => {
    const { store } = await sandboxProject("Global guided route");
    const floor = store.getState().snapshot!.project.floors[0]!;
    const a1 = routeNode("00000000-0000-4000-8000-000000001401", "Entrance", floor.id);
    const a2 = routeNode("00000000-0000-4000-8000-000000001402", "A stop", floor.id);
    const b1 = routeNode("00000000-0000-4000-8000-000000001411", "B entrance", floor.id);
    const b2 = routeNode("00000000-0000-4000-8000-000000001412", "B saved stop", floor.id);
    const b3 = routeNode("00000000-0000-4000-8000-000000001413", "B added stop", floor.id);
    const networkA = routeNetwork("00000000-0000-4000-8000-000000001420", "Network A", a1, a2);
    const networkB = routeNetwork("00000000-0000-4000-8000-000000001421", "Network B", b1, b2, b3);
    const saved: GuidedRoute = {
      id: "00000000-0000-4000-8000-000000001422", name: "Only route", tags: [],
      routeNetworkId: networkB.id, stopNodeIds: [b1.id, b2.id],
    };
    await store.applySnapshotRecordPatches([{
      collection: "routeNetworks",
      changes: [
        { id: networkA.id, before: null, after: networkA },
        { id: networkB.id, before: null, after: networkB },
      ],
    }, {
      collection: "guidedRoutes",
      changes: [{ id: saved.id, before: null, after: saved }],
    }]);
    const sessionStore = createPlanEditorStore({ activeFloorId: floor.id });
    render(<PlanEditor store={store} dependencies={{ sessionStore }} />);
    act(() => {
      const state = sessionStore.getState();
      state.setActiveTool("route-node");
      state.setActiveRouteNetwork({
        sessionId: state.sessionId, floorId: floor.id, networkId: null, tool: "route-node",
      }, networkA.id);
      state.setSelection([a1.id]);
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "编辑停靠点" }));
    expect(screen.getByLabelText("导览路线：Network B")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "添加站点：B added stop" }));
    await user.click(screen.getByRole("button", { name: "确认导览路线" }));

    await waitFor(() => expect(store.getState().snapshot!.project.guidedRoutes).toEqual([{
      ...saved,
      stopNodeIds: [b1.id, b2.id, b3.id],
    }]));
  });

  it.each([
    ["selected route node", "00000000-0000-4000-8000-000000001431", "00000000-0000-4000-8000-000000001441", "00000000-0000-4000-8000-000000001440", "Network A"],
    ["active route network", null, "00000000-0000-4000-8000-000000001441", "00000000-0000-4000-8000-000000001441", "Network B"],
    ["network UUID order", null, null, "00000000-0000-4000-8000-000000001440", "Network A"],
  ] as const)(
    "chooses the %s network when no guided route is saved",
    async (_caseName, selectedNodeId, activeNetworkId, expectedNetworkId, expectedName) => {
      const { store } = await sandboxProject("New global route");
      const floor = store.getState().snapshot!.project.floors[0]!;
      const a1 = routeNode("00000000-0000-4000-8000-000000001431", "Entrance", floor.id);
      const a2 = routeNode("00000000-0000-4000-8000-000000001433", "A stop", floor.id);
      const b1 = routeNode("00000000-0000-4000-8000-000000001432", "B entrance", floor.id);
      const b2 = routeNode("00000000-0000-4000-8000-000000001434", "B stop", floor.id);
      const networkA = routeNetwork("00000000-0000-4000-8000-000000001440", "Network A", a1, a2);
      const networkB = routeNetwork("00000000-0000-4000-8000-000000001441", "Network B", b1, b2);
      await store.applySnapshotRecordPatches([{
        collection: "routeNetworks",
        changes: [
          { id: networkB.id, before: null, after: networkB },
          { id: networkA.id, before: null, after: networkA },
        ],
      }]);
      const sessionStore = createPlanEditorStore({ activeFloorId: floor.id });
      render(<PlanEditor store={store} dependencies={{ sessionStore }} />);
      act(() => {
        const state = sessionStore.getState();
        state.setActiveTool("route-node");
        if (activeNetworkId !== null) {
          state.setActiveRouteNetwork({
            sessionId: state.sessionId, floorId: floor.id, networkId: null, tool: "route-node",
          }, activeNetworkId);
        }
        if (selectedNodeId !== null) state.setSelection([selectedNodeId]);
      });
      await userEvent.click(screen.getByRole("button", { name: "编辑停靠点" }));
      expect(screen.getByLabelText(`导览路线：${expectedName}`)).toBeVisible();
      expect(sessionStore.getState().routeAuthoring.networkId).toBe(expectedNetworkId);
      cleanup();
    },
  );

  it("safely rejects editing when the project already contains more than one guided route", async () => {
    const { store } = await sandboxProject("Ambiguous global route");
    const floor = store.getState().snapshot!.project.floors[0]!;
    const first = routeNode("00000000-0000-4000-8000-000000001441", "Entrance", floor.id);
    const second = routeNode("00000000-0000-4000-8000-000000001442", "Stop", floor.id);
    const network = routeNetwork("00000000-0000-4000-8000-000000001443", "Only network", first, second);
    const routes: readonly GuidedRoute[] = [
      { id: "00000000-0000-4000-8000-000000001444", name: "First", tags: [], routeNetworkId: network.id, stopNodeIds: [first.id, second.id] },
      { id: "00000000-0000-4000-8000-000000001445", name: "Second", tags: [], routeNetworkId: network.id, stopNodeIds: [first.id, second.id] },
    ];
    await store.applySnapshotRecordPatches([{
      collection: "routeNetworks",
      changes: [{ id: network.id, before: null, after: network }],
    }, {
      collection: "guidedRoutes",
      changes: routes.map((route) => ({ id: route.id, before: null, after: route })),
    }]);
    render(<PlanEditor store={store} />);
    await userEvent.click(screen.getByRole("button", { name: "预览路线" }));
    expect(screen.getByRole("alert")).toHaveTextContent("只能有一条导览路线");
    expect(store.getState().snapshot!.project.guidedRoutes).toEqual(routes);
  });
});
