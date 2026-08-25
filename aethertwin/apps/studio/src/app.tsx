import type { ProjectProfile } from "@aethertwin/core-model";
import { StatusNotice } from "@aethertwin/design-system";
import type { ProjectExportBackend, ProjectExportOperation } from "@aethertwin/exporter";
import {
  ProjectStore,
  RecentProjects,
  type KeyValueStorage,
  type ProjectBackend,
  type RecentProject,
} from "@aethertwin/project-store";
import type { SceneRendererFactory } from "@aethertwin/render-scene-3d";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { selectBackend, type ForcedBackend } from "./backend/select-backend";
import { ProjectBackendError } from "./backend/project-backend-error";
import { UiGallery } from "./dev/ui-gallery";
import { CreateProjectDialog } from "./features/project-center/create-project-dialog";
import { ProjectCenter } from "./features/project-center/project-center";
import { localizedErrorDescriptor } from "./i18n/localized-error";
import { useI18n } from "./i18n/locale-provider";
import { PlanEditor } from "./features/plan-editor/plan-editor";
const DevSceneGallery = import.meta.env.DEV
  ? lazy(async () => {
    const module = await import("./dev/scene-gallery");
    return { default: module.SceneGallery };
  })
  : null;


class SessionStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

class ProtectedStorage implements KeyValueStorage {
  constructor(private readonly storage: Storage) {}

  getItem(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      this.storage.setItem(key, value);
    } catch {
      // Application-local preferences are optional; project data remains authoritative.
    }
  }

  removeItem(key: string): void {
    try {
      this.storage.removeItem(key);
    } catch {
      // Treat unavailable preferences as an empty recent-project list.
    }
  }
}

function recentStorage(mode: ProjectBackend["mode"]): KeyValueStorage {
  if (mode === "desktop" && typeof window !== "undefined") {
    try {
      return new ProtectedStorage(window.localStorage);
    } catch {
      return new SessionStorage();
    }
  }
  return new SessionStorage();
}

function useProjectStore(store: ProjectStore) {
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const getSnapshot = useCallback(() => store.getState(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function missingRecentError(value: unknown): boolean {
  if (value === null || typeof value !== "object" || !("code" in value)) {
    return false;
  }
  return value.code === "PROJECT_NOT_FOUND";
}

function staleRecoveryRequired(value: unknown): boolean {
  if (!(value instanceof ProjectBackendError) || value.code !== "STALE_PROJECT_LOCK") {
    return false;
  }
  if (value.details === null || typeof value.details !== "object" || Array.isArray(value.details)) {
    return false;
  }
  return (value.details as Record<string, unknown>).recoveryRequired === true;
}

async function disposeBackend(backend: ProjectBackend): Promise<void> {
  const disposable = backend as ProjectBackend & { dispose?(): Promise<void> };
  if (disposable.dispose === undefined) {
    return;
  }
  try {
    await disposable.dispose();
  } catch {
    await disposable.dispose();
  }
}

export interface AppProps {
  backend?: ProjectBackend;
  exportBackend?: ProjectExportBackend | null;
  forceBackend?: ForcedBackend;
  sceneRendererFactory?: SceneRendererFactory;
}

function StudioApp({
  backend,
  exportBackend,
}: {
  backend: ProjectBackend;
  exportBackend: ProjectExportBackend | null;
}) {
  const { t } = useI18n();
  const [store] = useState(() => new ProjectStore(backend));
  const storeLifecycleGeneration = useRef(0);
  const activeExportOperation = useRef<ProjectExportOperation | null>(null);
  const [recentRepository] = useState(
    () => new RecentProjects(recentStorage(backend.mode)),
  );
  const [recentProjects, setRecentProjects] = useState<readonly RecentProject[]>(() =>
    recentRepository.list(),
  );
  const [dialogProfile, setDialogProfile] = useState<ProjectProfile | null>(null);
  const [view, setView] = useState<"center" | "editor">("center");
  const [opening, setOpening] = useState(false);
  const [centerError, setCenterError] = useState<ReturnType<typeof localizedErrorDescriptor> | null>(null);
  const [recoveryPath, setRecoveryPath] = useState<string | null>(null);
  const state = useProjectStore(store);

  useEffect(() => {
    const generation = storeLifecycleGeneration.current + 1;
    storeLifecycleGeneration.current = generation;
    return () => {
      const exportOperation = activeExportOperation.current;
      activeExportOperation.current = null;
      void Promise.resolve().then(() => {
        if (storeLifecycleGeneration.current === generation) {
          const disposal = exportOperation === null
            ? store.dispose()
            : exportOperation.cancel()
              .catch(() => undefined)
              .then(() => store.dispose());
          return disposal
            .finally(() => disposeBackend(backend))
            .catch(() => undefined);
        }
        return undefined;
      });
    };
  }, [backend, store]);

  const recordCurrentProject = useCallback(() => {
    const current = store.getState();
    if (current.projectPath === null || current.snapshot === null) return;
    recentRepository.record({
      path: current.projectPath,
      name: current.snapshot.project.name,
      profile: current.snapshot.project.profile,
      openedAt: new Date().toISOString(),
    });
    setRecentProjects(recentRepository.list());
  }, [recentRepository, store]);

  async function createProject(
    name: string,
    profile: ProjectProfile,
    selectedLocation?: string,
  ) {
    setCenterError(null);
    setRecoveryPath(null);
    const location = backend.mode === "sandbox" ? "sandbox" : selectedLocation;
    if (location === undefined || location.length === 0) {
      throw new Error("请选择项目位置");
    }
    await store.create({ name, profile, location });
    recordCurrentProject();
    setView("editor");
  }

  async function openProject(path: string) {
    setOpening(true);
    setCenterError(null);
    setRecoveryPath(null);
    try {
      await store.open(path);
      recordCurrentProject();
      setView("editor");
    } catch (error) {
      if (missingRecentError(error)) {
        recentRepository.remove(path);
        setRecentProjects(recentRepository.list());
      }
      if (backend.mode === "desktop" && staleRecoveryRequired(error)) {
        setRecoveryPath(path);
      }
      setCenterError(localizedErrorDescriptor(error));
    } finally {
      setOpening(false);
    }
  }

  async function openExistingProject() {
    setOpening(true);
    setCenterError(null);
    setRecoveryPath(null);
    let selectedPath: string | null = null;
    try {
      const selected = await openFolderDialog({
        directory: true,
        multiple: false,
        title: t("dialog.openProjectTitle"),
      });
      if (typeof selected !== "string") return;
      selectedPath = selected;
      await store.open(selectedPath);
      recordCurrentProject();
      setView("editor");
    } catch (error) {
      if (
        backend.mode === "desktop" &&
        selectedPath !== null &&
        staleRecoveryRequired(error)
      ) {
        setRecoveryPath(selectedPath);
      }
      setCenterError(localizedErrorDescriptor(error));
    } finally {
      setOpening(false);
    }
  }

  async function recoverProject() {
    if (recoveryPath === null) return;
    setOpening(true);
    setCenterError(null);
    try {
      await store.recover(recoveryPath, { confirmed: true });
      recordCurrentProject();
      setRecoveryPath(null);
      setView("editor");
    } catch (error) {
      setRecoveryPath(
        backend.mode === "desktop" && staleRecoveryRequired(error) ? recoveryPath : null,
      );
      setCenterError(localizedErrorDescriptor(error));
    } finally {
      setOpening(false);
    }
  }

  if (view === "editor" && state.snapshot !== null && state.projectPath !== null) {
    return (
      <PlanEditor
        store={store}
        backendMode={backend.mode}
        exportBackend={exportBackend}
        {...(backend.mode === "desktop" && backend.openExportResult !== undefined && backend.revealExportResult !== undefined ? {
          dependencies: {
            exportResultActions: {
              open: (result: { readonly relativePath: string }) => backend.openExportResult!(state.projectPath!, result.relativePath),
              reveal: (result: { readonly relativePath: string }) => backend.revealExportResult!(state.projectPath!, result.relativePath),
            },
          },
        } : {})}
        onBeforeClose={recordCurrentProject}
        onExportOperationChange={(operation) => {
          activeExportOperation.current = operation;
        }}
        onBack={() => {
          setView("center");
          setCenterError(null);
        }}
      />
    );
  }

  return (
    <>
      <ProjectCenter
        mode={backend.mode}
        error={centerError}
        opening={opening}
        recoveryAvailable={recoveryPath !== null}
        recentProjects={recentProjects}
        onOpen={(path) => void openProject(path)}
        onOpenExisting={() => void openExistingProject()}
        onRecover={() => void recoverProject()}
        onStartCreate={(profile) => {
          setCenterError(null);
          setRecoveryPath(null);
          setDialogProfile(profile);
        }}
      />
      <CreateProjectDialog
        open={dialogProfile !== null}
        profile={dialogProfile ?? "showroom"}
        mode={backend.mode}
        onOpenChange={(open) => {
          if (!open) setDialogProfile(null);
        }}
        onCreate={createProject}
      />
    </>
  );
}

function StudioBootstrap({ forceBackend }: { forceBackend?: ForcedBackend }) {
  const [selection, setSelection] = useState<Awaited<ReturnType<typeof selectBackend>> | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const { format, t } = useI18n();

  useEffect(() => {
    let active = true;
    setSelection(null);
    setError(null);
    void selectBackend(forceBackend).then(
      (selected) => {
        if (active) setSelection(selected);
      },
      (reason) => {
        if (active) setError(reason instanceof Error ? reason : new Error(String(reason)));
      },
    );
    return () => {
      active = false;
    };
  }, [forceBackend]);

  if (error !== null) {
    return (
      <main className="studio-bootstrap-state">
        <StatusNotice tone="error">{format(localizedErrorDescriptor(error))}</StatusNotice>
      </main>
    );
  }
  if (selection === null) {
    return (
      <main className="studio-bootstrap-state">
        <StatusNotice>{t("app.backendConnecting")}</StatusNotice>
      </main>
    );
  }
  return (
    <StudioApp
      backend={selection.projectBackend}
      exportBackend={selection.exportBackend}
    />
  );
}

export function App({
  backend,
  exportBackend = null,
  forceBackend,
  sceneRendererFactory,
}: AppProps) {
  const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
  if (pathname === "/dev/ui-gallery") return <UiGallery />;
  if (
    import.meta.env.DEV
    && DevSceneGallery !== null
    && pathname === "/dev/scene-gallery"
  ) {
    return (
      <Suspense
        fallback={(
          <main className="studio-bootstrap-state">
            <StatusNotice>Loading 3D scene gallery...</StatusNotice>
          </main>
        )}
      >
        <DevSceneGallery
          {...(sceneRendererFactory === undefined ? {} : {
            rendererFactory: sceneRendererFactory,
          })}
        />
      </Suspense>
    );
  }
  if (backend !== undefined) {
    return <StudioApp backend={backend} exportBackend={exportBackend} />;
  }
  return <StudioBootstrap forceBackend={forceBackend} />;
}
