import type { ProjectProfile, ProjectSnapshot } from "@aethertwin/core-model";
import { Field, Panel, StatusNotice } from "@aethertwin/design-system";
import { EditorShell } from "@aethertwin/editor-shell";
import {
  ProjectStore,
  RecentProjects,
  type KeyValueStorage,
  type RecentProject,
} from "@aethertwin/project-store";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { selectBackend, type ForcedBackend } from "./backend/select-backend";
import { UiGallery } from "./dev/ui-gallery";
import {
  CreateProjectDialog,
  validateProjectName,
} from "./features/project-center/create-project-dialog";
import { ProjectCenter } from "./features/project-center/project-center";

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

function useProjectStore(store: ProjectStore) {
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const getSnapshot = useCallback(() => store.getState(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function readableError(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

export interface AppProps {
  forceBackend?: ForcedBackend;
}

function StudioApp({ forceBackend }: AppProps) {
  const [backend] = useState(() => selectBackend(forceBackend));
  const [store] = useState(() => new ProjectStore(backend));
  const [recentRepository] = useState(() => new RecentProjects(new SessionStorage()));
  const [recentProjects, setRecentProjects] = useState<readonly RecentProject[]>(() =>
    recentRepository.list(),
  );
  const [dialogProfile, setDialogProfile] = useState<ProjectProfile | null>(null);
  const [view, setView] = useState<"center" | "editor">("center");
  const [opening, setOpening] = useState(false);
  const [centerError, setCenterError] = useState<string | null>(null);
  const state = useProjectStore(store);

  const recordCurrentProject = useCallback(() => {
    const current = store.getState();
    if (current.projectPath === null || current.snapshot === null) {
      return;
    }
    recentRepository.record({
      path: current.projectPath,
      name: current.snapshot.project.name,
      profile: current.snapshot.project.profile,
      openedAt: new Date().toISOString(),
    });
    setRecentProjects(recentRepository.list());
  }, [recentRepository, store]);

  async function createProject(name: string, profile: ProjectProfile) {
    setCenterError(null);
    try {
      await store.create({ name, profile, location: "sandbox" });
      recordCurrentProject();
      setView("editor");
    } catch (error) {
      setCenterError(`创建失败：${readableError(error)}`);
      throw error;
    }
  }

  async function openProject(path: string) {
    setOpening(true);
    setCenterError(null);
    try {
      await store.open(path);
      recordCurrentProject();
      setView("editor");
    } catch (error) {
      setCenterError(`打开失败：${readableError(error)}`);
    } finally {
      setOpening(false);
    }
  }

  async function returnToCenter() {
    try {
      recordCurrentProject();
      await store.close();
      setView("center");
      setCenterError(null);
    } catch (error) {
      setCenterError(`关闭失败：${readableError(error)}`);
    }
  }

  if (view === "editor" && state.snapshot !== null && state.projectPath !== null) {
    const snapshot = state.snapshot;
    return (
      <EditorShell
        projectName={snapshot.project.name}
        profile={snapshot.project.profile}
        saveState={state.saveState}
        canUndo={state.canUndo}
        canRedo={state.canRedo}
        onBack={() => void returnToCenter()}
        onSave={() => void store.save().catch(() => undefined)}
        onUndo={() => void store.undo().catch(() => undefined)}
        onRedo={() => void store.redo().catch(() => undefined)}
        onClose={() => void returnToCenter()}
        tree={<ProjectOverviewTree snapshot={snapshot} />}
        workspace={<ProjectOverviewWorkspace projectPath={state.projectPath} snapshot={snapshot} />}
        inspector={
          <ProjectOverviewInspector
            snapshot={snapshot}
            onRename={(name) => store.renameProject(name)}
            onSetTags={(tags) => store.setProjectTags(tags)}
          />
        }
      />
    );
  }

  return (
    <>
      <ProjectCenter
        error={centerError}
        opening={opening}
        recentProjects={recentProjects}
        onOpen={(path) => void openProject(path)}
        onStartCreate={setDialogProfile}
      />
      <CreateProjectDialog
        open={dialogProfile !== null}
        profile={dialogProfile ?? "showroom"}
        onOpenChange={(open) => {
          if (!open) {
            setDialogProfile(null);
          }
        }}
        onCreate={createProject}
      />
    </>
  );
}

function ProjectOverviewTree({ snapshot }: { snapshot: ProjectSnapshot }) {
  return (
    <div className="studio-project-tree">
      <h2>楼层</h2>
      <ul>
        {snapshot.project.floors.map((floor) => (
          <li key={floor.id}>{floor.name}</li>
        ))}
      </ul>
    </div>
  );
}

function ProjectOverviewWorkspace({
  projectPath,
  snapshot,
}: {
  projectPath: string;
  snapshot: ProjectSnapshot;
}) {
  return (
    <Panel className="studio-overview" aria-label="项目概览">
      <p className="studio-project-center__card-kicker">M0 OVERVIEW</p>
      <h2>项目概览</h2>
      <dl>
        <div><dt>项目名称</dt><dd>{snapshot.project.name}</dd></div>
        <div><dt>项目档案</dt><dd>{snapshot.project.profile}</dd></div>
        <div><dt>Schema</dt><dd>{snapshot.schemaVersion}</dd></div>
        <div><dt>沙盒标识</dt><dd>{projectPath}</dd></div>
      </dl>
    </Panel>
  );
}

function ProjectOverviewInspector({
  snapshot,
  onRename,
  onSetTags,
}: {
  snapshot: ProjectSnapshot;
  onRename(name: string): Promise<void>;
  onSetTags(tags: readonly string[]): Promise<void>;
}) {
  const [name, setName] = useState(snapshot.project.name);
  const [tags, setTags] = useState(snapshot.project.tags.join(", "));
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    setName(snapshot.project.name);
    setTags(snapshot.project.tags.join(", "));
  }, [snapshot]);

  async function commitName() {
    const validationError = validateProjectName(name);
    if (validationError !== null) {
      setEditError(validationError);
      return;
    }
    const normalized = name.trim();
    if (normalized === snapshot.project.name) {
      return;
    }
    try {
      await onRename(normalized);
      setEditError(null);
    } catch (error) {
      setEditError(readableError(error));
    }
  }

  async function commitTags() {
    const nextTags = tags.split(",").map((tag) => tag.trim()).filter(Boolean);
    if (
      nextTags.length === snapshot.project.tags.length &&
      nextTags.every((tag, index) => tag === snapshot.project.tags[index])
    ) {
      return;
    }
    try {
      await onSetTags(nextTags);
      setEditError(null);
    } catch (error) {
      setEditError(readableError(error));
    }
  }

  return (
    <div className="studio-inspector-form">
      <h2>检查器</h2>
      {editError === null ? null : <StatusNotice tone="error">{editError}</StatusNotice>}
      <Field
        label="项目名称（检查器）"
        value={name}
        error={editError}
        onChange={(event) => setName(event.currentTarget.value)}
        onBlur={() => void commitName()}
      />
      <Field
        label="项目标签"
        value={tags}
        helpText="使用英文逗号分隔标签"
        onChange={(event) => setTags(event.currentTarget.value)}
        onBlur={() => void commitTags()}
      />
    </div>
  );
}

export function App(props: AppProps) {
  const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
  if (pathname === "/dev/ui-gallery") {
    return <UiGallery />;
  }
  return <StudioApp {...props} />;
}
