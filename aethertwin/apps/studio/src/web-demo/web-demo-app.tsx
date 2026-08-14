import { Button, StatusNotice } from "@aethertwin/design-system";
import {
  ProjectStore,
  SandboxProjectBackend,
  type SandboxProjectSeed,
} from "@aethertwin/project-store";
import { useEffect, useState, type ReactNode } from "react";
import { PlanEditor } from "../features/plan-editor/plan-editor";
import {
  WebDemoLoadError,
  loadWebDemoSeed,
  type WebDemoErrorCode,
} from "./load-web-demo";

export interface WebDemoAppDependencies {
  readonly loadSeed: typeof loadWebDemoSeed;
  readonly createBackend: (seed: SandboxProjectSeed) => SandboxProjectBackend;
  readonly createStore: (backend: SandboxProjectBackend) => ProjectStore;
}

export interface WebDemoAppProps {
  readonly dependencies?: WebDemoAppDependencies;
}

type WebDemoState =
  | { readonly kind: "loading"; readonly generation: number }
  | {
      readonly kind: "ready";
      readonly generation: number;
      readonly backend: SandboxProjectBackend;
      readonly store: ProjectStore;
    }
  | {
      readonly kind: "error";
      readonly generation: number;
      readonly code: WebDemoErrorCode;
    };

const DEFAULT_DEPENDENCIES: WebDemoAppDependencies = Object.freeze({
  loadSeed: loadWebDemoSeed,
  createBackend: (seed: SandboxProjectSeed) => new SandboxProjectBackend({ seed }),
  createStore: (backend: SandboxProjectBackend) => new ProjectStore(backend),
});

const ERROR_MESSAGES: Readonly<Record<WebDemoErrorCode, string>> = Object.freeze({
  WEB_DEMO_PROJECT_INVALID: "本地示例项目无效，无法打开。",
  WEB_DEMO_ASSET_UNAVAILABLE: "本地示例资源暂时无法载入，请重试。",
  WEB_DEMO_ASSET_INVALID: "本地示例资源校验失败，无法打开。",
  WEB_DEMO_INITIALIZATION_FAILED: "本地示例初始化失败，请重试。",
});

function webDemoErrorCode(error: unknown): WebDemoErrorCode {
  return error instanceof WebDemoLoadError
    ? error.code
    : "WEB_DEMO_INITIALIZATION_FAILED";
}

function webDemoErrorMessage(code: WebDemoErrorCode): string {
  return ERROR_MESSAGES[code];
}

export function WebDemoApp({
  dependencies = DEFAULT_DEPENDENCIES,
}: WebDemoAppProps): ReactNode {
  const [generation, setGeneration] = useState(0);
  const [state, setState] = useState<WebDemoState>({
    kind: "loading",
    generation: 0,
  });

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    let backend: SandboxProjectBackend | null = null;
    let store: ProjectStore | null = null;
    let releasePromise: Promise<void> | null = null;
    const release = (): Promise<void> => {
      releasePromise ??= (async () => {
        if (store !== null) await store.dispose().catch(() => undefined);
        if (backend !== null) await backend.dispose().catch(() => undefined);
      })();
      return releasePromise;
    };

    setState({ kind: "loading", generation });
    void dependencies.loadSeed({ signal: controller.signal }).then(async (seed) => {
      if (!current) return;
      backend = dependencies.createBackend(seed);
      store = dependencies.createStore(backend);
      await store.open(seed.openedProject.projectPath);
      if (!current) return release();
      setState({ kind: "ready", generation, backend, store });
    }).catch(async (error: unknown) => {
      if (!current || controller.signal.aborted) return;
      await release();
      if (!current) return;
      setState({ kind: "error", generation, code: webDemoErrorCode(error) });
    });

    return () => {
      current = false;
      controller.abort();
      void release();
    };
  }, [dependencies, generation]);

  if (state.kind === "loading") {
    return (
      <main className="studio-web-demo-state">
        <StatusNotice>正在载入本地示例…</StatusNotice>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="studio-web-demo-state">
        <StatusNotice tone="error">{webDemoErrorMessage(state.code)}</StatusNotice>
        <Button onClick={() => setGeneration((value) => value + 1)}>Retry</Button>
      </main>
    );
  }

  return (
    <main className="studio-web-demo">
      <p className="studio-web-demo__notice" role="note">
        本地预览 · 修改将在刷新后重置 · PNG 导出仅桌面版
      </p>
      <PlanEditor
        store={state.store}
        backendMode="sandbox"
        exportBackend={null}
        onBack={() => setGeneration((value) => value + 1)}
      />
    </main>
  );
}
