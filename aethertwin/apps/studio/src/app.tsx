import type { ProjectProfile } from "@aethertwin/core-model";
import { StatusNotice } from "@aethertwin/design-system";
import {
  ProjectStore,
  RecentProjects,
  type KeyValueStorage,
  type ProjectBackend,
  type RecentProject,
} from "@aethertwin/project-store";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { selectBackend, type ForcedBackend } from "./backend/select-backend";
import { UiGallery } from "./dev/ui-gallery";
import { CreateProjectDialog } from "./features/project-center/create-project-dialog";
import { ProjectCenter } from "./features/project-center/project-center";
import { ProjectOverview } from "./features/project-overview/project-overview";

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

function readableError(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value);
  if (value === null || typeof value !== "object" || !("logRef" in value)) {
    return message;
  }

  return typeof value.logRef === "string" && value.logRef.length > 0
    ? `${message}（日志参考：${value.logRef}）`
    : message;
}

function missingRecentError(value: unknown): boolean {
  if (value === null || typeof value !== "object" || !("code" in value)) {
    return false;
  }
  return value.code === "PROJECT_NOT_FOUND";
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
  forceBackend?: ForcedBackend;
}

function StudioApp({ backend }: { backend: ProjectBackend }) {
  const [store] = useState(() => new ProjectStore(backend));
  const storeLifecycleGeneration = useRef(0);
  const [recentRepository] = useState(
    () => new RecentProjects(recentStorage(backend.mode)),
  );
  const [recentProjects, setRecentProjects] = useState<readonly RecentProject[]>(() =>
    recentRepository.list(),
  );
  const [dialogProfile, setDialogProfile] = useState<ProjectProfile | null>(null);
  const [view, setView] = useState<"center" | "editor">("center");
  const [opening, setOpening] = useState(false);
  const [centerError, setCenterError] = useState<string | null>(null);
  const state = useProjectStore(store);

  useEffect(() => {
    const generation = storeLifecycleGeneration.current + 1;
    storeLifecycleGeneration.current = generation;
    return () => {
      void Promise.resolve().then(() => {
        if (storeLifecycleGeneration.current === generation) {
          return store
            .dispose()
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
    try {
      await store.open(path);
      recordCurrentProject();
      setView("editor");
    } catch (error) {
      if (missingRecentError(error)) {
        recentRepository.remove(path);
        setRecentProjects(recentRepository.list());
      }
      setCenterError(`打开失败：${readableError(error)}`);
    } finally {
      setOpening(false);
    }
  }

  async function openExistingProject() {
    setOpening(true);
    setCenterError(null);
    try {
      const selected = await openFolderDialog({
        directory: true,
        multiple: false,
        title: "打开本地项目",
      });
      if (typeof selected !== "string") return;
      await store.open(selected);
      recordCurrentProject();
      setView("editor");
    } catch (error) {
      setCenterError(`打开失败：${readableError(error)}`);
    } finally {
      setOpening(false);
    }
  }

  if (view === "editor" && state.snapshot !== null && state.projectPath !== null) {
    return (
      <ProjectOverview
        store={store}
        backendMode={backend.mode}
        onBeforeClose={recordCurrentProject}
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
        recentProjects={recentProjects}
        onOpen={(path) => void openProject(path)}
        onOpenExisting={() => void openExistingProject()}
        onStartCreate={(profile) => {
          setCenterError(null);
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
  const [backend, setBackend] = useState<ProjectBackend | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    setBackend(null);
    setError(null);
    void selectBackend(forceBackend).then(
      (selected) => {
        if (active) setBackend(selected);
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
        <StatusNotice tone="error">{error.message}</StatusNotice>
      </main>
    );
  }
  if (backend === null) {
    return (
      <main className="studio-bootstrap-state">
        <StatusNotice>正在连接项目后端…</StatusNotice>
      </main>
    );
  }
  return <StudioApp backend={backend} />;
}

export function App({ backend, forceBackend }: AppProps) {
  const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
  if (pathname === "/dev/ui-gallery") return <UiGallery />;
  if (backend !== undefined) return <StudioApp backend={backend} />;
  return <StudioBootstrap forceBackend={forceBackend} />;
}
