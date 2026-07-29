import { Button, StatusNotice } from "@aethertwin/design-system";
import { EditorShell } from "@aethertwin/editor-shell";
import type {
  AssetImportProgress,
  ProjectBackend,
  ProjectStore,
  ProjectStoreState,
} from "@aethertwin/project-store";
import type { FloorChange, PlanEditIntent } from "@aethertwin/plan-engine";
import type { PlanReference, ProjectSnapshot } from "@aethertwin/core-model";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import type { StoreApi } from "zustand/vanilla";
import { createPlanEditorStore, type PlanEditorState } from "./editor-session";
import { FloorTree } from "./floor-tree";
import { AssetLibrary } from "./asset-library";
import {
  createDesktopPlanAssetPicker,
  createSandboxPlanAssetPicker,
  type PlanAssetPicker,
  type PlanAssetSource,
} from "./asset-picker";
import {
  createInteractionController,
  type InteractionController,
} from "./interaction-controller";
import {
  PlanInspector,
  type InspectorContext,
} from "./plan-inspector";
import { PlanToolbar } from "./plan-toolbar";
import { PlanCanvas } from "./plan-canvas";

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
  readonly assetPicker?: PlanAssetPicker | null;
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

function safeAssetImportError(value: unknown): Error {
  const safe = new Error("\u5e73\u9762\u56fe\u5bfc\u5165\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002");
  const logRef = logReference(value);
  if (logRef !== null && /^[A-Za-z0-9._:-]{1,128}$/.test(logRef)) {
    Object.assign(safe, { logRef });
  }
  return safe;
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

function isAssetImportCancellation(value: unknown): boolean {
  return value !== null && typeof value === "object" &&
    (value as { readonly code?: unknown }).code === "ASSET_IMPORT_CANCELLED";
}

function referenceName(source: PlanAssetSource): string {
  const basename = source.displayName.split(/[\\/]/).at(-1) ?? source.displayName;
  const withoutExtension = basename.replace(/\.[^.]+$/, "").trim();
  return withoutExtension.length > 0
    ? withoutExtension
    : "\u5e73\u9762\u53c2\u8003";
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
  const mode: ProjectBackend["mode"] = backendMode
    ?? (state.projectPath?.startsWith("sandbox://") ? "sandbox" : "desktop");
  const [importProgress, setImportProgress] = useState<AssetImportProgress | null>(null);
  const [assetImportBusy, setAssetImportBusy] = useState(false);
  const [context, setContext] = useState<InspectorContext>({ kind: "project" });
  const activeAssetOperation = useRef<{
    readonly operationId: string;
    readonly initiator: HTMLButtonElement;
  } | null>(null);
  const assetPickerPending = useRef(false);
  const treeTabRef = useRef<HTMLButtonElement>(null);
  const assetLibraryTabRef = useRef<HTMLButtonElement>(null);
  const sidePanelId = useId();
  const treeTabId = `${sidePanelId}-tree-tab`;
  const assetTabId = `${sidePanelId}-asset-tab`;
  const treePanelId = `${sidePanelId}-tree-panel`;
  const assetPanelId = `${sidePanelId}-asset-panel`;
  const [sessionStore] = useState(() => (
    dependencies?.sessionStore
    ?? createPlanEditorStore({
      activeFloorId: store.getState().snapshot?.project.floors[0]?.id ?? "",
    })
  ));
  const [makeId] = useState(() => dependencies?.makeId ?? productionId);
  const assetPicker = useMemo<PlanAssetPicker | null>(() => {
    if (dependencies !== undefined && Object.hasOwn(dependencies, "assetPicker")) {
      return dependencies.assetPicker ?? null;
    }
    return mode === "desktop"
      ? createDesktopPlanAssetPicker()
      : createSandboxPlanAssetPicker();
  }, [dependencies, mode]);
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
      applyPlanReferencePatch: (before, after) => store.applyPlanReferencePatch(before, after),
      onError: (error) => setActionError(errorValue(error)),
    })
  ));
  const sessionState = useSessionState(sessionStore);
  const selectionKey = [...sessionState.selectedIds].join("\u0000");

  useEffect(() => {
    if (state.error === null) setHandledStoreError(null);
  }, [state.error]);

  useEffect(() => {
    const snapshot = state.snapshot;
    const selectedIds = [...sessionStore.getState().selectedIds];
    const entityIds = new Set(
      snapshot?.project.entities.map(({ id }) => id) ?? [],
    );
    const referenceIds = new Set(
      snapshot?.project.planReferences.map(({ id }) => id) ?? [],
    );
    if (
      selectedIds.length === 1
      && !entityIds.has(selectedIds[0]!)
      && !referenceIds.has(selectedIds[0]!)
    ) {
      sessionStore.getState().setSelection([]);
      return;
    }
    setContext((current) => {
      if (selectedIds.length === 1) {
        const selectedId = selectedIds[0]!;
        return referenceIds.has(selectedId)
          ? { kind: "plan-reference", referenceId: selectedId }
          : { kind: "entity", entityId: selectedId };
      }
      if (selectedIds.length > 1) {
        return { kind: "multi", entityIds: selectedIds };
      }
      return current.kind === "entity" || current.kind === "multi" || current.kind === "plan-reference"
        ? { kind: "project" }
        : current;
    });
  }, [selectionKey, sessionStore, state.snapshot]);

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
  const visibleError = actionError
    ?? (state.error !== handledStoreError ? state.error : null);
  const selectedIds = sessionState.selectedIds;

  async function runPlanAssetImport(
    initiator: HTMLButtonElement,
    replacing?: PlanReference,
  ): Promise<void> {
    if (assetPicker === null ||
      assetPickerPending.current ||
      activeAssetOperation.current !== null) return;
    assetPickerPending.current = true;
    setAssetImportBusy(true);
    setActionError(null);
    let ownedOperationId: string | null = null;
    try {
      const source = await assetPicker.pick();
      if (source === null) return;

      const operationId = makeId();
      ownedOperationId = operationId;
      activeAssetOperation.current = { operationId, initiator };
      sessionStore.getState().setSidePanel("assets");
      const totalBytes = source.kind === "sandbox-blob" ? source.blob.size : 0;
      setImportProgress({
        operationId,
        stage: "capture",
        completedBytes: 0,
        totalBytes,
      });
      const onProgress = (value: AssetImportProgress): void => {
        if (activeAssetOperation.current?.operationId === operationId) {
          setImportProgress(value);
        }
      };

      let imported: PlanReference;
      if (replacing !== undefined) {
        imported = await store.replaceBrokenPlanReference(
          replacing.id,
          { operationId, role: "plan-reference", source },
          onProgress,
        );
      } else {
        const currentSnapshot = store.getState().snapshot;
        const floor = currentSnapshot?.project.floors.find(
          ({ id }) => id === sessionStore.getState().activeFloorId,
        );
        const layer = floor?.layers[0];
        if (floor === undefined || layer === undefined) {
          throw new Error("The active floor has no importable layer.");
        }
        imported = await store.importPlanReference(
          { operationId, role: "plan-reference", source },
          {
            id: makeId(),
            name: referenceName(source),
            tags: [],
            floorId: floor.id,
            layerId: layer.id,
          },
          onProgress,
        );
      }
      sessionStore.getState().setSelection([imported.id]);
      setContext({ kind: "plan-reference", referenceId: imported.id });
    } catch (error) {
      if (!isAssetImportCancellation(error)) setActionError(safeAssetImportError(error));
    } finally {
      assetPickerPending.current = false;
      setAssetImportBusy(false);
      if (ownedOperationId !== null &&
        activeAssetOperation.current?.operationId === ownedOperationId) {
        activeAssetOperation.current = null;
        setImportProgress(null);
      }
      setTimeout(() => {
        if (initiator.isConnected) initiator.focus();
        else assetLibraryTabRef.current?.focus();
      }, 0);
    }
  }

  async function cancelPlanAssetImport(): Promise<void> {
    const active = activeAssetOperation.current;
    if (active === null) return;
    try {
      await store.cancelAssetImport(active.operationId);
    } catch (error) {
      setActionError(safeAssetImportError(error));
    }
  }

  function selectPlanReference(referenceId: string): void {
    sessionStore.getState().setSelection([referenceId]);
    setContext({ kind: "plan-reference", referenceId });
  }

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
    const entityIds = new Set(snapshot.project.entities.map(({ id }) => id));
    const existingEntities = existing.filter((id) => entityIds.has(id));
    const next = additive
      ? current.selectedIds.has(entityId)
        ? existingEntities.filter((id) => id !== entityId)
        : [...existingEntities, entityId]
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

  function handleSidePanelTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>): void {
    let target: "tree" | "assets" | null = null;
    if (event.key === "Home") target = "tree";
    else if (event.key === "End") target = "assets";
    else if (event.key === "ArrowRight") {
      target = event.currentTarget === treeTabRef.current ? "assets" : "tree";
    } else if (event.key === "ArrowLeft") {
      target = event.currentTarget === treeTabRef.current ? "assets" : "tree";
    }
    if (target === null) return;
    event.preventDefault();
    sessionStore.getState().setSidePanel(target);
    if (target === "tree") treeTabRef.current?.focus();
    else assetLibraryTabRef.current?.focus();
  }

  const workspaceContext: PlanWorkspaceContext = {
    snapshot,
    activeFloorId: sessionState.activeFloorId,
    selectedIds,
    sessionStore,
    controller,
  };


  const floorTree = (
    <FloorTree
      snapshot={snapshot}
      activeFloorId={sessionState.activeFloorId}
      selectedIds={selectedIds}
      onFloorSelect={selectFloor}
      onLayerSelect={selectLayer}
      onEntitySelect={selectEntity}
      onReferenceSelect={selectPlanReference}
      onApplyFloorPatch={(change: FloorChange) => runAction(
        () => store.applyFloorPatch(change),
      )}
    />
  );
  const treePanel = assetPicker === null ? floorTree : (
    <div className="studio-plan-sidebar">
      <div className="studio-plan-sidebar__tabs" role="tablist" aria-label={"\u5de6\u4fa7\u9762\u677f"}>
        <button
          ref={treeTabRef}
          id={treeTabId}
          type="button"
          role="tab"
          aria-selected={sessionState.sidePanel === "tree"}
          aria-controls={treePanelId}
          tabIndex={sessionState.sidePanel === "tree" ? 0 : -1}
          onKeyDown={handleSidePanelTabKeyDown}
          onClick={() => sessionStore.getState().setSidePanel("tree")}
        >
          {"\u9879\u76ee\u6811"}
        </button>
        <button
          ref={assetLibraryTabRef}
          id={assetTabId}
          type="button"
          role="tab"
          aria-selected={sessionState.sidePanel === "assets"}
          aria-controls={assetPanelId}
          tabIndex={sessionState.sidePanel === "assets" ? 0 : -1}
          onKeyDown={handleSidePanelTabKeyDown}
          onClick={() => sessionStore.getState().setSidePanel("assets")}
        >
          {"\u8d44\u4ea7\u5e93"}
        </button>
      </div>
      {sessionState.sidePanel === "tree" ? (
        <div id={treePanelId} role="tabpanel" aria-labelledby={treeTabId}>
          {floorTree}
        </div>
      ) : (
        <div id={assetPanelId} role="tabpanel" aria-labelledby={assetTabId}>
          <AssetLibrary
            snapshot={snapshot}
            assetIssues={state.assetIssues}
            selectedIds={selectedIds}
            progress={importProgress}
            importDisabled={assetImportBusy}
            onImport={(initiator) => void runPlanAssetImport(initiator)}
            onCancel={() => void cancelPlanAssetImport()}
            onSelect={selectPlanReference}
            onReimport={(reference, initiator) => {
              void runPlanAssetImport(initiator, reference);
            }}
          />
        </div>
      )}
    </div>
  );
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
          {...(assetPicker === null ? {} : {
            importFloorPlanDisabled: assetImportBusy,
            onImportFloorPlan: (initiator: HTMLButtonElement) => {
              void runPlanAssetImport(initiator);
            },
          })}
        />
      }
      tree={treePanel}
      workspace={
        <div
          className="studio-plan-workspace"
          data-active-floor-id={sessionState.activeFloorId}
          data-selected-count={selectedIds.size}
        >
          {visibleError === null ? null : <ErrorNotice error={visibleError} />}
          {dependencies?.workspace?.(workspaceContext) ?? (
            <PlanCanvas
              store={store}
              assetSourceEpoch={store.getAssetSourceEpoch()}
              snapshot={snapshot}
              activeFloorId={sessionState.activeFloorId}
              sessionStore={sessionStore}
              controller={controller}
              onError={(error) => setActionError(errorValue(error))}
            />
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
          onApplyPlanReferencePatch={async (before, after) => {
            await store.applyPlanReferencePatch(before, after);
            if (
              after === null
              && sessionStore.getState().selectedIds.has(before.id)
            ) {
              sessionStore.getState().setSelection([]);
              setContext({ kind: "project" });
            }
          }}
          onError={(error) => setActionError(errorValue(error))}
        />
      }
    />
  );
}
