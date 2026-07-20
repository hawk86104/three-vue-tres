import type { SaveState } from "@aethertwin/core-model";
import { Button, Panel, StatusNotice } from "@aethertwin/design-system";
import { EditorShell } from "@aethertwin/editor-shell";
import { type ProjectBackend, ProjectStore } from "@aethertwin/project-store";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ProjectInspector } from "./project-inspector";
import { ProjectTree } from "./project-tree";

export interface ProjectOverviewProps {
  store: ProjectStore;
  backendMode?: ProjectBackend["mode"];
  onBack?(): void;
  onBeforeClose?(): void;
}

const saveStateLabels: Record<SaveState, string> = {
  dirty: "未保存",
  saving: "保存中",
  saved: "已保存",
  error: "保存失败",
  recovered: "已恢复",
};

function useProjectStore(store: ProjectStore) {
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const getSnapshot = useCallback(() => store.getState(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function errorValue(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function logReference(value: unknown): string | null {
  if (value === null || typeof value !== "object" || !("logRef" in value)) {
    return null;
  }
  return typeof value.logRef === "string" && value.logRef.length > 0 ? value.logRef : null;
}

function ErrorNotice({ error }: { error: Error }) {
  const logRef = logReference(error);
  return (
    <StatusNotice tone="error">
      <span>{error.message}</span>
      {logRef === null ? null : <span>日志参考：{logRef}</span>}
    </StatusNotice>
  );
}

export function ProjectOverview({
  store,
  backendMode,
  onBack = () => undefined,
  onBeforeClose = () => undefined,
}: ProjectOverviewProps) {
  const state = useProjectStore(store);
  const [actionError, setActionError] = useState<Error | null>(null);
  const [handledStoreError, setHandledStoreError] = useState<Error | null>(null);

  useEffect(() => {
    if (state.error === null) setHandledStoreError(null);
  }, [state.error]);

  async function runAction(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(errorValue(error));
    }
  }

  async function closeAndReturn() {
    setActionError(null);
    try {
      await store.flush();
      await store.save();
      onBeforeClose();
      await store.close();
      onBack();
    } catch (error) {
      setActionError(errorValue(error));
    }
  }

  async function back() {
    if (state.error === null) {
      await closeAndReturn();
      return;
    }
    setActionError(null);
    try {
      onBeforeClose();
      await store.close();
      onBack();
    } catch (error) {
      setActionError(errorValue(error));
    }
  }

  if (state.snapshot === null || state.projectPath === null) {
    if (state.error === null) {
      return null;
    }
    return (
      <main className="studio-project-error">
        <ErrorNotice error={state.error} />
        <Button variant="ghost" onClick={onBack}>返回</Button>
      </main>
    );
  }

  const snapshot = state.snapshot;
  const mode = backendMode ?? (state.projectPath.startsWith("sandbox://") ? "sandbox" : "desktop");
  const visibleError =
    actionError ?? (state.error !== handledStoreError ? state.error : null);

  return (
    <EditorShell
      projectName={snapshot.project.name}
      profile={snapshot.project.profile}
      saveState={state.saveState}
      canUndo={state.canUndo}
      canRedo={state.canRedo}
      onBack={() => void back()}
      onSave={() => void runAction(() => store.save())}
      onUndo={() => void runAction(() => store.undo())}
      onRedo={() => void runAction(() => store.redo())}
      onClose={() => void closeAndReturn()}
      tree={<ProjectTree snapshot={snapshot} />}
      workspace={
        <Panel className="studio-overview" aria-label="项目概览">
          <p className="studio-project-center__card-kicker">M0 OVERVIEW</p>
          <h2>项目概览</h2>
          {visibleError === null ? null : <ErrorNotice error={visibleError} />}
          <dl>
            <div><dt>项目名称</dt><dd>{snapshot.project.name}</dd></div>
            <div>
              <dt>项目标签</dt>
              <dd>{snapshot.project.tags.length === 0 ? "无" : snapshot.project.tags.join(", ")}</dd>
            </div>
            <div><dt>项目档案</dt><dd>{snapshot.project.profile}</dd></div>
            <div><dt>Schema</dt><dd>{snapshot.schemaVersion}</dd></div>
            <div><dt>保存状态</dt><dd>{saveStateLabels[state.saveState]}</dd></div>
            <div><dt>后端模式</dt><dd>{mode}</dd></div>
            <div><dt>项目位置</dt><dd>{state.projectPath}</dd></div>
          </dl>
        </Panel>
      }
      inspector={
        <ProjectInspector
          snapshot={snapshot}
          onHandledStoreError={setHandledStoreError}
          onRename={(name) => store.renameProject(name)}
          onSetTags={(tags) => store.setProjectTags(tags)}
        />
      }
    />
  );
}
