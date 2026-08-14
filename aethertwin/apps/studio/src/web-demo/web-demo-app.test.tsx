// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { createManifest, parseSnapshot } from "@aethertwin/core-model";
import {
  ProjectStore,
  SandboxProjectBackend,
  type SandboxProjectSeed,
} from "@aethertwin/project-store";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import snapshotFixture from "../../../../fixtures/contracts/showroom-demo.v3.json";
import { WebDemoLoadError, type LoadWebDemoSeedOptions } from "./load-web-demo";
import { WebDemoApp } from "./web-demo-app";

const editor = vi.hoisted(() => ({
  props: [] as Array<Record<string, unknown>>,
  rendererFailure: false,
}));

vi.mock("../features/plan-editor/plan-editor", () => ({
  PlanEditor: (props: Record<string, unknown>) => {
    editor.props.push(props);
    return (
      <section data-testid="plan-editor">
        <button type="button" onClick={() => (props.onBack as () => void)()}>Back</button>
        {editor.rendererFailure ? <p role="alert">3D unavailable; 2D remains active.</p> : null}
      </section>
    );
  },
}));

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

const snapshot = parseSnapshot(snapshotFixture);
const seed: SandboxProjectSeed = Object.freeze({
  openedProject: Object.freeze({
    projectPath: `sandbox://${snapshot.project.id}`,
    manifest: createManifest(snapshot, {
      now: () => "2026-08-09T12:34:56.789Z",
      appVersion: "0.1.0-web-demo",
    }),
    snapshot,
    recovered: false,
  }),
  assets: Object.freeze(snapshot.assets.map((asset) => Object.freeze({
    relativePath: asset.relativePath,
    blob: new Blob([new Uint8Array(asset.size)], { type: asset.mediaType }),
  }))),
});

const stores: ProjectStore[] = [];
const backends: SandboxProjectBackend[] = [];

function dependencies(
  loadSeed: (options: LoadWebDemoSeedOptions) => Promise<SandboxProjectSeed>,
) {
  return {
    loadSeed: vi.fn(loadSeed),
    createBackend: vi.fn((value: SandboxProjectSeed) => {
      const backend = new SandboxProjectBackend({ seed: value });
      backends.push(backend);
      return backend;
    }),
    createStore: vi.fn((backend: SandboxProjectBackend) => {
      const store = new ProjectStore(backend);
      stores.push(store);
      return store;
    }),
  };
}

function latestEditorProps(): Record<string, unknown> {
  const props = editor.props.at(-1);
  if (props === undefined) throw new Error("Expected PlanEditor props");
  return props;
}

afterEach(async () => {
  cleanup();
  editor.props.length = 0;
  editor.rendererFailure = false;
  await Promise.allSettled(stores.splice(0).map((store) => store.dispose()));
  await Promise.allSettled(backends.splice(0).map((backend) => backend.dispose()));
});

describe("WebDemoApp lifecycle", () => {
  it("shows truthful loading copy without an editor or invented percentage", () => {
    const pending = deferred<SandboxProjectSeed>();
    render(<WebDemoApp dependencies={dependencies(() => pending.promise)} />);

    expect(screen.getByRole("status")).toHaveTextContent("正在载入本地示例…");
    expect(screen.queryByTestId("plan-editor")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d+%/u);
  });

  it("opens the canonical path before publishing the exact sandbox editor contract", async () => {
    const openGate = deferred<void>();
    const deps = dependencies(async () => seed);
    deps.createStore.mockImplementation((backend) => {
      const store = new ProjectStore(backend);
      stores.push(store);
      const open = store.open.bind(store);
      vi.spyOn(store, "open").mockImplementation(async (path) => {
        await openGate.promise;
        return open(path);
      });
      return store;
    });
    render(<WebDemoApp dependencies={deps} />);

    await waitFor(() => expect(deps.createStore).toHaveBeenCalledOnce());
    expect(screen.queryByTestId("plan-editor")).not.toBeInTheDocument();
    expect(stores[0]?.open).toHaveBeenCalledWith(seed.openedProject.projectPath);
    openGate.resolve();
    await screen.findByTestId("plan-editor");

    expect(screen.getByRole("note")).toHaveTextContent(
      "本地预览 · 修改将在刷新后重置 · PNG 导出仅桌面版",
    );
    expect(latestEditorProps()).toMatchObject({
      store: stores[0],
      backendMode: "sandbox",
      exportBackend: null,
    });
    expect(latestEditorProps().onBack).toEqual(expect.any(Function));
  });

  it.each([
    ["WEB_DEMO_PROJECT_INVALID", "本地示例项目无效，无法打开。"],
    ["WEB_DEMO_ASSET_UNAVAILABLE", "本地示例资源暂时无法载入，请重试。"],
    ["WEB_DEMO_ASSET_INVALID", "本地示例资源校验失败，无法打开。"],
    ["WEB_DEMO_INITIALIZATION_FAILED", "本地示例初始化失败，请重试。"],
  ] as const)("maps %s to fixed safe copy and one Retry action", async (code, message) => {
    render(<WebDemoApp dependencies={dependencies(async () => {
      throw new WebDemoLoadError(code);
    })} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(screen.queryByTestId("plan-editor")).not.toBeInTheDocument();
  });

  it("retries with a fresh generation after a loader failure", async () => {
    const loadSeed = vi.fn()
      .mockRejectedValueOnce(new WebDemoLoadError("WEB_DEMO_ASSET_UNAVAILABLE"))
      .mockResolvedValueOnce(seed);
    const deps = dependencies(loadSeed);
    render(<WebDemoApp dependencies={deps} />);

    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByTestId("plan-editor");

    expect(loadSeed).toHaveBeenCalledTimes(2);
    expect(screen.getAllByTestId("plan-editor")).toHaveLength(1);
    expect(deps.createBackend).toHaveBeenCalledOnce();
    expect(deps.createStore).toHaveBeenCalledOnce();
  });

  it("Back disposes the current session and reopens the canonical seed in a fresh one", async () => {
    const order: string[] = [];
    const deps = dependencies(async () => seed);
    render(<WebDemoApp dependencies={deps} />);
    await screen.findByTestId("plan-editor");
    const firstStore = stores[0]!;
    const firstBackend = backends[0]!;
    vi.spyOn(firstStore, "dispose").mockImplementation(async () => { order.push("store"); });
    vi.spyOn(firstBackend, "dispose").mockImplementation(async () => { order.push("backend"); });

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(deps.createStore).toHaveBeenCalledTimes(2));

    expect(stores[1]).not.toBe(firstStore);
    expect(backends[1]).not.toBe(firstBackend);
    expect(stores[1]?.getState().projectPath).toBe(seed.openedProject.projectPath);
    expect(order).toEqual(["store", "backend"]);
  });

  it("aborts an active loader and ignores its late success after unmount", async () => {
    const pending = deferred<SandboxProjectSeed>();
    let signal: AbortSignal | undefined;
    const deps = dependencies(({ signal: currentSignal }) => {
      signal = currentSignal;
      return pending.promise;
    });
    const rendered = render(<WebDemoApp dependencies={deps} />);
    rendered.unmount();

    expect(signal?.aborted).toBe(true);
    await act(async () => { pending.resolve(seed); await pending.promise; });
    expect(deps.createBackend).not.toHaveBeenCalled();
    expect(screen.queryByTestId("plan-editor")).not.toBeInTheDocument();
  });

  it("ignores late loader success and failure from replaced dependencies", async () => {
    const lateSuccess = deferred<SandboxProjectSeed>();
    const lateFailure = deferred<SandboxProjectSeed>();
    const current = dependencies(async () => seed);
    const rendered = render(
      <WebDemoApp dependencies={dependencies(() => lateSuccess.promise)} />,
    );
    rendered.rerender(<WebDemoApp dependencies={current} />);
    await screen.findByTestId("plan-editor");
    const currentStore = latestEditorProps().store;
    await act(async () => { lateSuccess.resolve(seed); await lateSuccess.promise; });
    expect(latestEditorProps().store).toBe(currentStore);

    rendered.rerender(<WebDemoApp dependencies={dependencies(() => lateFailure.promise)} />);
    rendered.rerender(<WebDemoApp dependencies={current} />);
    await screen.findByTestId("plan-editor");
    await act(async () => { lateFailure.reject(new Error("C:\\secret\\late.txt")); await lateFailure.promise.catch(() => undefined); });
    expect(screen.queryByText(/secret|late\.txt/u)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("disposes an unpublished store and backend once, in order, after late open", async () => {
    const openGate = deferred<void>();
    const order: string[] = [];
    const deps = dependencies(async () => seed);
    deps.createBackend.mockImplementation((value) => {
      const backend = new SandboxProjectBackend({ seed: value });
      backends.push(backend);
      vi.spyOn(backend, "dispose").mockImplementation(async () => { order.push("backend"); });
      return backend;
    });
    deps.createStore.mockImplementation((backend) => {
      const store = new ProjectStore(backend);
      stores.push(store);
      vi.spyOn(store, "open").mockImplementation(() => openGate.promise);
      vi.spyOn(store, "dispose").mockImplementation(async () => { order.push("store"); });
      return store;
    });
    const rendered = render(<WebDemoApp dependencies={deps} />);
    await waitFor(() => expect(deps.createStore).toHaveBeenCalledOnce());
    rendered.unmount();
    openGate.resolve();
    await act(async () => { await openGate.promise; await Promise.resolve(); });

    expect(order).toEqual(["store", "backend"]);
    expect(stores[0]?.dispose).toHaveBeenCalledOnce();
    expect(backends[0]?.dispose).toHaveBeenCalledOnce();
  });

  it.each(["resolve", "reject"] as const)(
    "keeps the current editor when an old generation open later %s",
    async (outcome) => {
      const openGate = deferred<void>();
      const disposalOrder: string[] = [];
      let oldBackend!: SandboxProjectBackend;
      let oldStore!: ProjectStore;
      const oldDependencies = dependencies(async () => seed);
      oldDependencies.createBackend.mockImplementation((value) => {
        oldBackend = new SandboxProjectBackend({ seed: value });
        backends.push(oldBackend);
        vi.spyOn(oldBackend, "dispose").mockImplementation(async () => {
          disposalOrder.push("backend");
        });
        return oldBackend;
      });
      oldDependencies.createStore.mockImplementation((backend) => {
        oldStore = new ProjectStore(backend);
        stores.push(oldStore);
        vi.spyOn(oldStore, "open").mockImplementation(() => openGate.promise);
        vi.spyOn(oldStore, "dispose").mockImplementation(async () => {
          disposalOrder.push("store");
        });
        return oldStore;
      });
      const currentDependencies = dependencies(async () => seed);
      const rendered = render(<WebDemoApp dependencies={oldDependencies} />);
      await waitFor(() => expect(oldDependencies.createStore).toHaveBeenCalledOnce());

      rendered.rerender(<WebDemoApp dependencies={currentDependencies} />);
      await screen.findByTestId("plan-editor");
      const currentStore = latestEditorProps().store;
      expect(currentStore).not.toBe(oldStore);

      await act(async () => {
        if (outcome === "resolve") {
          openGate.resolve();
          await openGate.promise;
        } else {
          openGate.reject(new Error("C:\\secret\\old-open.txt"));
          await openGate.promise.catch(() => undefined);
        }
        await Promise.resolve();
      });

      expect(latestEditorProps().store).toBe(currentStore);
      expect(screen.getAllByTestId("plan-editor")).toHaveLength(1);
      expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
      await waitFor(() => expect(disposalOrder).toEqual(["store", "backend"]));
      expect(oldStore.dispose).toHaveBeenCalledOnce();
      expect(oldBackend.dispose).toHaveBeenCalledOnce();
    },
  );

  it("releases a failed partial session before Retry creates fresh resources", async () => {
    const disposalOrder: string[] = [];
    const createdBackends: SandboxProjectBackend[] = [];
    const createdStores: ProjectStore[] = [];
    const openedPaths: string[] = [];
    const deps = dependencies(async () => seed);
    deps.createBackend.mockImplementation((value) => {
      const backend = new SandboxProjectBackend({ seed: value });
      const index = createdBackends.length;
      createdBackends.push(backend);
      backends.push(backend);
      if (index === 0) {
        vi.spyOn(backend, "dispose").mockImplementation(async () => {
          disposalOrder.push("backend");
        });
      }
      return backend;
    });
    deps.createStore.mockImplementation((backend) => {
      const store = new ProjectStore(backend);
      const index = createdStores.length;
      createdStores.push(store);
      stores.push(store);
      const open = store.open.bind(store);
      vi.spyOn(store, "open").mockImplementation(async (path) => {
        openedPaths.push(path);
        if (index === 0) throw new Error("C:\\secret\\open-failed.txt");
        return open(path);
      });
      if (index === 0) {
        vi.spyOn(store, "dispose").mockImplementation(async () => {
          disposalOrder.push("store");
        });
      }
      return store;
    });

    render(<WebDemoApp dependencies={deps} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "本地示例初始化失败，请重试。",
    );
    await waitFor(() => expect(disposalOrder).toEqual(["store", "backend"]));
    expect(createdStores[0]?.dispose).toHaveBeenCalledOnce();
    expect(createdBackends[0]?.dispose).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByTestId("plan-editor");

    expect(createdStores).toHaveLength(2);
    expect(createdBackends).toHaveLength(2);
    expect(createdStores[1]).not.toBe(createdStores[0]);
    expect(createdBackends[1]).not.toBe(createdBackends[0]);
    expect(latestEditorProps().store).toBe(createdStores[1]);
    expect(openedPaths).toEqual([
      seed.openedProject.projectPath,
      seed.openedProject.projectPath,
    ]);
    expect(screen.getAllByTestId("plan-editor")).toHaveLength(1);
  });

  it("redacts unknown initialization failures", async () => {
    render(<WebDemoApp dependencies={dependencies(async () => {
      throw Object.assign(new Error("C:\\Users\\name\\private.txt"), {
        stack: "browser internals and private.txt",
      });
    })} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "本地示例初始化失败，请重试。",
    );
    expect(document.body.textContent).not.toMatch(/Users|private\.txt|browser internals/u);
  });

  it("keeps a renderer failure inside the published editor's 2D fallback", async () => {
    editor.rendererFailure = true;
    render(<WebDemoApp dependencies={dependencies(async () => seed)} />);

    await screen.findByText("3D unavailable; 2D remains active.");
    expect(screen.getByTestId("plan-editor")).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
});
