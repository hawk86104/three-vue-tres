import { Button, StatusNotice } from "@aethertwin/design-system";
import { EditorShell } from "@aethertwin/editor-shell";
import {
  type ProjectBackend,
  ProjectStore,
  type ProjectStoreState,
} from "@aethertwin/project-store";
import type { FloorChange, PlanEditIntent } from "@aethertwin/plan-engine";
import type { ProjectSnapshot } from "@aethertwin/core-model";
import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { StoreApi } from "zustand/vanilla";
import { createPlanEditorStore, type PlanEditorState } from "./editor-session";
import { FloorTree } from "./floor-tree";
import {
  createInteractionController,
  type InteractionController,
} from "./interaction-controller";
import {
  PlanInspector,
  type InspectorContext,
} from "./plan-inspector";
import { PlanToolbar } from "./plan-toolbar";

export interface PlanWorkspaceContext {
  readonly snapshot: ProjectSnapshot;
  readonly activeFloorId: string;
  readonly selectedIds: ReadonlySet<string>;
  readonly sessionStore: StoreApi<PlanEditorState>;
  readonly controller: InteractionController;
}

export interface PlanEditorDependencies {
  readonly sessionStore?: StoreApi<PlanEditorState>;
  readonly controller?: InteractionController;
  readonly makeId?: () => string;
  readonly workspace?: (context: PlanWorkspaceContext) => ReactNode;
}

export interface PlanEditorProps {
  readonly store: ProjectStore;
  readonly backendMode?: ProjectBackend["mode"];
  readonly onBack?: () => void;
  readonly onBeforeClose?: () => void;
  readonly dependencies?: PlanEditorDependencies;
}

function errorValue(value: unknown): Error {
  if (value instanceof Error) return value;
  if (value !== null && typeof value === "object" && "message" in value) {
    const message = value.message;
    if (typeof message === "string") return new Error(message);
  }
  return new Error(String(value));
}

function logReference(value: unknown): string | null {
  if (value === null || typeof value !== "object" || !("logRef" in value)) {
    return null;
  }
  return typeof value.logRef === "string" && value.logRef.length > 0
    ? value.logRef
    : null;
}

function ErrorNotice({ error }: { readonly error: Error }) {
  const logRef = logReference(error);
  return (
    <StatusNotice tone="error">
      <span>{error.message}</span>
      {logRef === null ? null : <span>日志参考：{logRef}</span>}
    </StatusNotice>
  );
}

function useProjectState(store: ProjectStore): ProjectStoreState {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(listener),
    [store],
  );
  const getSnapshot = useCallback(() => store.getState(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function useSessionState(
  store: StoreApi<PlanEditorState>,
): PlanEditorState {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(listener),
    [store],
  );
  const getSnapshot = useCallback(() => store.getState(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function productionId(): string {
  return crypto.randomUUID();
}

export function PlanEditor({
  store,
  backendMode,
  onBack = () => undefined,
  onBeforeClose = () => undefined,
  dependencies,
}: PlanEditorProps) {
  const state = useProjectState(store);
  const [actionError, setActionError] = useState<Error | null>(null);
  const [handledStoreError, setHandledStoreError] = useState<Error | null>(null);
  const [context, setContext] = useState<InspectorContext>({ kind: "project" });
  const [sessionStore] = useState(() => (
    dependencies?.sessionStore
    ?? createPlanEditorStore({
      activeFloorId: store.getState().snapshot?.project.floors[0]?.id ?? "",
    })
  ));
  const [makeId] = useState(() => dependencies?.makeId ?? productionId);
  const [controller] = useState(() => (
    dependencies?.controller
    ?? createInteractionController({
      getSnapshot: () => {
        const snapshot = store.getState().snapshot;
        if (snapshot === null) throw new Error("No project is open");
        return snapshot;
      },
      store: sessionStore,
      makeId,
      applyPlanEdit: (intent) => store.applyPlanEdit(intent),
      onError: (error) => setActionError(errorValue(error)),
    })
  ));
  const sessionState = useSessionState(sessionStore);
  const selectionKey = [...sessionState.selectedIds].join("\u0000");

  useEffect(() => {
    if (state.error === null) setHandledStoreError(null);
  }, [state.error]);

  useEffect(() => {
    const selectedIds = [...sessionStore.getState().selectedIds];
    setContext((current) => {
      if (selectedIds.length === 1) {
        return { kind: "entity", entityId: selectedIds[0]! };
      }
      if (selectedIds.length > 1) {
        return { kind: "multi", entityIds: selectedIds };
      }
      return current.kind === "entity" || current.kind === "multi"
        ? { kind: "project" }
        : current;
    });
  }, [selectionKey, sessionStore]);

  async function runAction(action: () => Promise<void>): Promise<void> {
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
    if (state.error === null) return null;
    return (
      <main className="studio-project-error">
        <ErrorNotice error={state.error} />
        <Button variant="ghost" onClick={onBack}>返回</Button>
      </main>
    );
  }

  const snapshot = state.snapshot;
  const mode = backendMode
    ?? (state.projectPath.startsWith("sandbox://") ? "sandbox" : "desktop");
  const visibleError = actionError
    ?? (state.error !== handledStoreError ? state.error : null);
  const selectedIds = sessionState.selectedIds;

  function selectFloor(floorId: string) {
    const current = sessionStore.getState();
    if (!current.setActiveFloor(floorId)) {
      setActionError(new Error("当前绘制或变换尚未完成，无法切换楼层。"));
      return;
    }
    current.setSelection([]);
    setActionError(null);
    setContext({ kind: "floor", floorId });
  }

  function selectLayer(floorId: string, layerId: string) {
    sessionStore.getState().setSelection([]);
    setContext({ kind: "layer", floorId, layerId });
  }

  function selectEntity(entityId: string, additive: boolean) {
    const current = sessionStore.getState();
    const existing = [...current.selectedIds];
    const next = additive
      ? current.selectedIds.has(entityId)
        ? existing.filter((id) => id !== entityId)
        : [...existing, entityId]
      : [entityId];
    current.setSelection(next);
    setContext(
      next.length === 0
        ? { kind: "project" }
        : next.length === 1
          ? { kind: "entity", entityId: next[0]! }
          : { kind: "multi", entityIds: next },
    );
  }

  const workspaceContext: PlanWorkspaceContext = {
    snapshot,
    activeFloorId: sessionState.activeFloorId,
    selectedIds,
    sessionStore,
    controller,
  };

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
      toolbar={
        <PlanToolbar
          profile={snapshot.project.profile}
          activeTool={sessionState.activeTool}
          onToolChange={(tool) => sessionStore.getState().setActiveTool(tool)}
        />
      }
      tree={
        <FloorTree
          snapshot={snapshot}
          activeFloorId={sessionState.activeFloorId}
          selectedIds={selectedIds}
          onFloorSelect={selectFloor}
          onLayerSelect={selectLayer}
          onEntitySelect={selectEntity}
          onApplyFloorPatch={(change: FloorChange) => runAction(
            () => store.applyFloorPatch(change),
          )}
        />
      }
      workspace={
        <div
          className="studio-plan-workspace"
          data-active-floor-id={sessionState.activeFloorId}
          data-selected-count={selectedIds.size}
        >
          {visibleError === null ? null : <ErrorNotice error={visibleError} />}
          {dependencies?.workspace?.(workspaceContext) ?? (
            <div className="studio-plan-workspace__empty">
              <h2>平面编辑区</h2>
              <p>使用选择工具检查对象，或从上方选择边界、墙体和空间工具开始绘制。</p>
            </div>
          )}
        </div>
      }
      inspector={
        <PlanInspector
          snapshot={snapshot}
          context={context}
          activeFloorId={sessionState.activeFloorId}
          saveState={state.saveState}
          backendMode={mode}
          projectPath={state.projectPath}
          controller={controller}
          makeId={makeId}
          onHandledStoreError={setHandledStoreError}
          onRenameProject={(name) => store.renameProject(name)}
          onSetProjectTags={(tags) => store.setProjectTags(tags)}
          onApplyFloorPatch={(change) => runAction(
            () => store.applyFloorPatch(change),
          )}
          onApplyPlanEdit={(intent: PlanEditIntent) => store.applyPlanEdit(intent)}
          onError={(error) => setActionError(errorValue(error))}
        />
      }
    />
  );
}
