import { Button, StatusNotice } from "@aethertwin/design-system";
import {
  ProjectStore,
  SandboxProjectBackend,
  type SandboxProjectSeed,
} from "@aethertwin/project-store";
import { useEffect, useState, type ReactNode } from "react";
import { PlanEditor } from "../features/plan-editor/plan-editor";
import { DisplayNameProvider } from "../i18n/display-name-provider";
import { LanguageSwitcher } from "../i18n/language-switcher";
import { useI18n } from "../i18n/locale-provider";
import {
  WebDemoLoadError,
  loadWebDemoSeed,
  type WebDemoErrorCode,
} from "./load-web-demo";
import { webDemoDisplayNameResolver } from "./web-demo-display-name-ids";

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

function webDemoErrorCode(error: unknown): WebDemoErrorCode {
  return error instanceof WebDemoLoadError
    ? error.code
    : "WEB_DEMO_INITIALIZATION_FAILED";
}

export function WebDemoApp({
  dependencies = DEFAULT_DEPENDENCIES,
}: WebDemoAppProps): ReactNode {
  const { t } = useI18n();
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
        <LanguageSwitcher />
        <StatusNotice>{t("webDemo.loading")}</StatusNotice>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="studio-web-demo-state">
        <LanguageSwitcher />
        <StatusNotice tone="error">{t(state.code === "WEB_DEMO_PROJECT_INVALID" ? "webDemo.projectInvalid" : state.code === "WEB_DEMO_ASSET_UNAVAILABLE" ? "webDemo.assetUnavailable" : state.code === "WEB_DEMO_ASSET_INVALID" ? "webDemo.assetInvalid" : "webDemo.initializationFailed")}</StatusNotice>
        <Button onClick={() => setGeneration((value) => value + 1)}>{t("webDemo.retry")}</Button>
      </main>
    );
  }

  return (
    <main className="studio-web-demo">
      <p className="studio-web-demo__notice" role="note">
        {t("webDemo.notice")}
      </p>
      <DisplayNameProvider resolver={webDemoDisplayNameResolver}>
        <PlanEditor store={state.store} backendMode="sandbox" exportBackend={null} onBack={() => setGeneration((value) => value + 1)} />
      </DisplayNameProvider>
    </main>
  );
}
