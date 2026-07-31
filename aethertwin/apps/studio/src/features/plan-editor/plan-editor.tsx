import { Button, StatusNotice } from "@aethertwin/design-system";
import { EditorShell } from "@aethertwin/editor-shell";
import type {
  AssetImportProgress,
  ProjectBackend,
  ProjectStore,
  ProjectStoreState,
} from "@aethertwin/project-store";
import {
  recognizeClosedRooms,
  representedRoomCandidateKeys,
  roomCreationIntent,
  roomInputFingerprint,
  roomReplacementIntent,
  type FloorChange,
  type PlanEditIntent,
  type RoomRecognitionResult,
} from "@aethertwin/plan-engine";
import type { PlanReference, ProjectSnapshot, SpaceUnit, Wall } from "@aethertwin/core-model";
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
import {
  createPlanEditorStore,
  type OpeningPreviewState,
  type PlanEditorState,
  type PlanTool,
} from "./editor-session";
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
import { CalibrationPanel } from "./calibration-panel";
import { RoomRecognitionPanel } from "./room-recognition-panel";

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
  readonly recognizeRooms?: (
    input: Parameters<typeof recognizeClosedRooms>[0],
  ) => RoomRecognitionResult | Promise<RoomRecognitionResult>;
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

const openingIssueLabels = {
  OPENING_WALL_NOT_FOUND: "支撑墙不存在",
  OPENING_WALL_GEOMETRY_INVALID: "墙体几何无效",
  OPENING_SPAN_CROSSES_JOINT: "跨越墙体转角",
  OPENING_ENDPOINT_CLEARANCE: "距墙端过近",
  OPENING_OVERLAP: "与其他门窗重叠",
  OPENING_HEIGHT_EXCEEDED: "超出墙体高度",
  OPENING_DOOR_SILL_NONZERO: "门的窗台高度必须为 0",
  OPENING_TARGET_LOCKED: "支撑墙已锁定",
} as const;

function OpeningPreview({ preview }: { readonly preview: OpeningPreviewState }) {
  const issue = preview.candidate.issue;
  return (
    <section
      className="studio-opening-preview"
      role="status"
      aria-label="门窗放置预览"
      data-valid={preview.candidate.valid ? "true" : "false"}
      {...(issue === undefined ? {} : { "data-issue-code": issue.code })}
    >
      <strong>{preview.tool === "door" ? "门" : "窗"}</strong>
      <span>{`${preview.width} × ${preview.height} mm`}</span>
      <span>{`窗台高度 ${preview.sillHeight} mm`}</span>
      <span>{`沿墙距离 ${preview.candidate.distanceAlongWall} mm`}</span>
      <span>
        {preview.candidate.valid
          ? "有效"
          : `无效：${issue === undefined ? "未知几何问题" : openingIssueLabels[issue.code]}`}
      </span>
      {preview.persistenceError === undefined ? null : (
        <span>{`保存失败：${preview.persistenceError}`}</span>
      )}
    </section>
  );
}

function editableCalibrationReference(
  snapshot: ProjectSnapshot | null,
  activeFloorId: string,
  referenceId: string,
): PlanReference | null {
  const floor = snapshot?.project.floors.find(({ id }) => id === activeFloorId);
  const reference = snapshot?.project.planReferences.find(
    ({ id }) => id === referenceId,
  );
  if (
    floor === undefined
    || reference === undefined
    || reference.floorId !== activeFloorId
    || reference.locked
  ) return null;
  const layer = floor.layers.find(({ id }) => id === reference.layerId);
  return layer !== undefined && layer.visible && !layer.locked
    ? reference
    : null;
}

function visibleRoomWalls(
  snapshot: ProjectSnapshot,
  floorId: string,
): readonly Wall[] {
  const floor = snapshot.project.floors.find((candidate) => candidate.id === floorId);
  const visibleLayerIds = new Set(
    floor?.layers.filter((layer) => layer.visible).map((layer) => layer.id) ?? [],
  );
  return snapshot.project.entities.filter((entity): entity is Wall => (
    entity.type === "wall"
    && entity.floorId === floorId
    && visibleLayerIds.has(entity.layerId)
  ));
}

function editableSelectedRoom(
  snapshot: ProjectSnapshot,
  activeFloorId: string,
  selectedIds: ReadonlySet<string>,
): SpaceUnit | null {
  if (selectedIds.size !== 1) return null;
  const selectedId = [...selectedIds][0]!;
  const entity = snapshot.project.entities.find(({ id }) => id === selectedId);
  if (
    entity?.type !== "space-unit"
    || entity.kind !== "room"
    || entity.floorId !== activeFloorId
    || entity.locked
  ) return null;
  const floor = snapshot.project.floors.find(({ id }) => id === activeFloorId);
  const layer = floor?.layers.find(({ id }) => id === entity.layerId);
  return layer !== undefined && layer.visible && !layer.locked ? entity : null;
}

function planIssueMessage(issue: { readonly code: string; readonly message: string }): string {
  return `${issue.code}: ${issue.message}`;
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
  const [roomPanelOpen, setRoomPanelOpen] = useState(false);
  const [roomRecognitionBusy, setRoomRecognitionBusy] = useState(false);
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
  const calibrationInitiator = useRef<HTMLButtonElement | null>(null);
  const assetPickerPending = useRef(false);
  const treeTabRef = useRef<HTMLButtonElement>(null);
  const assetLibraryTabRef = useRef<HTMLButtonElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const projectSessionGeneration = useRef(0);
  const mountedRef = useRef(true);
  const roomRecognitionGeneration = useRef(0);
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
  const [recognizeRoomPort] = useState(() => (
    dependencies?.recognizeRooms ?? recognizeClosedRooms
  ));
  const openingToolInitiator = useRef<HTMLButtonElement | null>(null);
  const previousActiveTool = useRef<PlanTool>(sessionStore.getState().activeTool);
  const calibrationProjectId = useRef<string | null>(
    state.snapshot?.project.id ?? null,
  );

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
      applySnapshotRecordPatches: (patches) => store.applySnapshotRecordPatches(patches),
      applyBuildingStructurePatch: (patch) => store.applyBuildingStructurePatch(patch),
      onError: (error) => setActionError(errorValue(error)),
    })
  ));
  const sessionState = useSessionState(sessionStore);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionStore.getState().clearRoomRecognition();
    };
  }, [sessionStore]);
  const selectionKey = [...sessionState.selectedIds].join("\u0000");

  const activeCalibrationReferenceId =
    sessionState.calibrationDraft?.referenceId ?? null;
  const roomRecognition = sessionState.roomRecognition;

  useEffect(() => {
    const previous = previousActiveTool.current;
    previousActiveTool.current = sessionState.activeTool;
    if (
      (previous === "door" || previous === "window")
      && sessionState.activeTool === "select"
    ) {
      const initiator = openingToolInitiator.current;
      openingToolInitiator.current = null;
      queueMicrotask(() => {
        if (initiator?.isConnected) initiator.focus();
      });
    }
  }, [sessionState.activeTool]);

  useEffect(() => {
    const nextProjectId = state.snapshot?.project.id ?? null;
    if (calibrationProjectId.current !== nextProjectId) {
      openingToolInitiator.current = null;
      setRoomPanelOpen(false);
      setRoomRecognitionBusy(false);
      roomRecognitionGeneration.current += 1;
      projectSessionGeneration.current += 1;
      sessionStore.getState().replaceSession(
        `plan-editor-project-session-${projectSessionGeneration.current}`,
        state.snapshot?.project.floors[0]?.id ?? "",
      );
      calibrationProjectId.current = nextProjectId;
    }
  }, [sessionStore, state.snapshot]);

  useEffect(() => {
    if (activeCalibrationReferenceId === null) return;
    if (
      editableCalibrationReference(
        state.snapshot,
        sessionState.activeFloorId,
        activeCalibrationReferenceId,
      ) === null
    ) {
      sessionStore.getState().cancelCalibration();
    }
  }, [
    activeCalibrationReferenceId,
    sessionState.activeFloorId,
    sessionStore,
    state.snapshot,
  ]);

  useEffect(() => {
    if (roomRecognition === null || roomRecognition.stale || state.snapshot === null) return;
    const fingerprint = roomInputFingerprint({
      snapshot: state.snapshot,
      floorId: sessionState.activeFloorId,
      toleranceMm: roomRecognition.toleranceMm,
    });
    if (fingerprint !== roomRecognition.fingerprint) {
      sessionStore.getState().markRoomRecognitionStale();
    }
  }, [
    roomRecognition,
    sessionState.activeFloorId,
    sessionStore,
    state.snapshot,
  ]);

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
    const openingIds = new Set(
      snapshot?.project.openings.map(({ id }) => id) ?? [],
    );
    if (
      selectedIds.length === 1
      && !entityIds.has(selectedIds[0]!)
      && !referenceIds.has(selectedIds[0]!)
      && !openingIds.has(selectedIds[0]!)
    ) {
      sessionStore.getState().setSelection([]);
      return;
    }
    setContext((current) => {
      if (selectedIds.length === 1) {
        const selectedId = selectedIds[0]!;
        if (referenceIds.has(selectedId)) {
          return { kind: "plan-reference", referenceId: selectedId };
        }
        return openingIds.has(selectedId)
          ? { kind: "opening", openingId: selectedId }
          : { kind: "entity", entityId: selectedId };
      }
      if (selectedIds.length > 1) {
        return { kind: "multi", entityIds: selectedIds };
      }
      return current.kind === "entity"
        || current.kind === "multi"
        || current.kind === "plan-reference"
        || current.kind === "opening"
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

  const selectedId = selectedIds.size === 1 ? [...selectedIds][0]! : null;
  const selectedCalibrationReference = selectedId === null
    ? null
    : editableCalibrationReference(
      snapshot,
      sessionState.activeFloorId,
      selectedId,
    );
  const activeCalibrationReference = activeCalibrationReferenceId === null
    ? null
    : editableCalibrationReference(
      snapshot,
      sessionState.activeFloorId,
      activeCalibrationReferenceId,
    );

  const representedRoomKeys = new Set(roomRecognition === null ? [] : (
    representedRoomCandidateKeys({
      candidates: roomRecognition.candidates,
      entities: snapshot.project.entities,
      floorId: sessionState.activeFloorId,
    })
  ));
  const selectedEditableRoom = editableSelectedRoom(
    snapshot,
    sessionState.activeFloorId,
    selectedIds,
  );

  async function runRoomRecognition(): Promise<void> {
    const current = sessionStore.getState();
    const currentSnapshot = store.getState().snapshot;
    if (currentSnapshot === null) return;
    const sessionId = current.sessionId;
    const floorId = current.activeFloorId;
    const toleranceMm = current.roomRecognition?.toleranceMm ?? 5;
    const fingerprint = roomInputFingerprint({
      snapshot: currentSnapshot,
      floorId,
      toleranceMm,
    });
    const generation = roomRecognitionGeneration.current + 1;
    roomRecognitionGeneration.current = generation;
    setRoomPanelOpen(true);
    setRoomRecognitionBusy(true);
    current.setRoomRecognition(sessionId, floorId, {
      toleranceMm,
      fingerprint,
      candidates: [],
      diagnostics: [],
      stale: false,
    });
    try {
      await Promise.resolve();
      const result = await recognizeRoomPort({
        walls: visibleRoomWalls(currentSnapshot, floorId),
        toleranceMm,
      });
      if (!mountedRef.current || generation !== roomRecognitionGeneration.current) return;
      if (!result.ok) {
        sessionStore.getState().setRoomRecognition(sessionId, floorId, {
          toleranceMm,
          fingerprint,
          candidates: [],
          diagnostics: [],
          stale: true,
          persistenceError: `${result.issue.code}: ${result.issue.message}`,
        });
        return;
      }
      sessionStore.getState().setRoomRecognition(sessionId, floorId, {
        toleranceMm,
        fingerprint,
        candidates: result.value,
        ...(result.value[0] === undefined
          ? {}
          : { selectedCandidateKey: result.value[0].key }),
        diagnostics: result.diagnostics,
        stale: false,
      });
    } catch (error) {
      if (mountedRef.current && generation === roomRecognitionGeneration.current) {
        sessionStore.getState().setRoomRecognitionPersistenceError(
          errorValue(error).message,
        );
      }
    } finally {
      if (mountedRef.current && generation === roomRecognitionGeneration.current) {
        setRoomRecognitionBusy(false);
      }
    }
  }

  async function applyRoomCandidate(
    action: "one" | "all" | "replace",
  ): Promise<void> {
    const current = sessionStore.getState();
    const recognition = current.roomRecognition;
    const currentSnapshot = store.getState().snapshot;
    if (recognition === null || currentSnapshot === null || recognition.stale) return;
    const fingerprint = roomInputFingerprint({
      snapshot: currentSnapshot,
      floorId: current.activeFloorId,
      toleranceMm: recognition.toleranceMm,
    });
    if (fingerprint !== recognition.fingerprint) {
      current.markRoomRecognitionStale();
      return;
    }
    const selectedCandidate = recognition.candidates.find(
      ({ key }) => key === recognition.selectedCandidateKey,
    );
    const result = action === "replace"
      ? selectedCandidate === undefined || selectedEditableRoom === null
        ? null
        : roomReplacementIntent({
          snapshot: currentSnapshot,
          roomId: selectedEditableRoom.id,
          candidate: selectedCandidate,
        })
      : roomCreationIntent({
        snapshot: currentSnapshot,
        floorId: current.activeFloorId,
        candidates: action === "one"
          ? selectedCandidate === undefined ? [] : [selectedCandidate]
          : recognition.candidates,
        makeId,
      });
    if (result === null) return;
    if (!result.ok) {
      current.setRoomRecognitionPersistenceError(planIssueMessage(result.issue));
      return;
    }
    current.clearRoomRecognitionPersistenceError();
    try {
      await store.applyPlanEdit(result.value);
    } catch (error) {
      sessionStore.getState().setRoomRecognitionPersistenceError(
        errorValue(error).message,
      );
    }
  }

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

  function startCalibration(
    referenceId: string,
    initiator: HTMLButtonElement,
  ): void {
    const current = sessionStore.getState();
    const currentReference = editableCalibrationReference(
      store.getState().snapshot,
      current.activeFloorId,
      referenceId,
    );
    if (currentReference === null) return;
    calibrationInitiator.current = initiator;
    current.setSelection([referenceId]);
    current.beginCalibration(referenceId);
    setContext({ kind: "plan-reference", referenceId });
  }

  function returnCalibrationFocus(): void {
    const initiator = calibrationInitiator.current;
    calibrationInitiator.current = null;
    if (initiator?.isConnected) initiator.focus();
  }

  function selectPlanReference(referenceId: string): void {
    sessionStore.getState().setSelection([referenceId]);
    setContext({ kind: "plan-reference", referenceId });
  }

  function selectTool(tool: PlanTool, initiator: HTMLButtonElement): void {
    sessionStore.getState().setActiveTool(tool);
    if (tool !== "door" && tool !== "window") {
      openingToolInitiator.current = null;
      return;
    }
    openingToolInitiator.current = initiator;
    queueMicrotask(() => {
      workspaceRef.current
        ?.querySelector<HTMLElement>(".studio-plan-canvas")
        ?.focus();
    });
  }

  function selectFloor(floorId: string) {
    const current = sessionStore.getState();
    if (!current.setActiveFloor(floorId)) {
      setActionError(new Error("当前绘制或变换尚未完成，无法切换楼层。"));
      return;
    }
    current.setSelection([]);
    setRoomPanelOpen(false);
    setRoomRecognitionBusy(false);
    roomRecognitionGeneration.current += 1;
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
          onToolChange={selectTool}
          onRecognizeRooms={() => void runRoomRecognition()}
          {...(selectedCalibrationReference === null ? {} : {
            onCalibrate: (initiator: HTMLButtonElement) => {
              startCalibration(selectedCalibrationReference.id, initiator);
            },
          })}
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
          ref={workspaceRef}
          className="studio-plan-workspace"
          data-active-floor-id={sessionState.activeFloorId}
          data-selected-count={selectedIds.size}
        >
          {visibleError === null ? null : <ErrorNotice error={visibleError} />}
          {!roomPanelOpen || roomRecognition === null ? null : (
            <RoomRecognitionPanel
              state={roomRecognition}
              representedKeys={representedRoomKeys}
              canReplaceSelectedRoom={selectedEditableRoom !== null}
              busy={roomRecognitionBusy}
              onToleranceChange={(toleranceMm) => {
                sessionStore.getState().setRoomRecognitionTolerance(toleranceMm);
              }}
              onRecognize={() => void runRoomRecognition()}
              onSelectCandidate={(key) => {
                sessionStore.getState().selectRoomCandidate(key);
              }}
              onConfirmOne={() => void applyRoomCandidate("one")}
              onConfirmAll={() => void applyRoomCandidate("all")}
              onReplaceSelectedRoom={() => void applyRoomCandidate("replace")}
              onClose={() => {
                roomRecognitionGeneration.current += 1;
                setRoomRecognitionBusy(false);
                setRoomPanelOpen(false);
                sessionStore.getState().clearRoomRecognition();
              }}
            />
          )}
          {sessionState.openingPreview === null ? null : (
            <OpeningPreview preview={sessionState.openingPreview} />
          )}
          {sessionState.draft?.kind !== "opening-transform"
            || sessionState.draft.issue === undefined ? null : (
            <StatusNotice
              tone="error"
              data-issue-code={sessionState.draft.issue.code}
            >
              门窗拖动无效：{openingIssueLabels[sessionState.draft.issue.code]}（{sessionState.draft.issue.openingId}）
            </StatusNotice>
          )}
          {activeCalibrationReference === null ? null : (
            <CalibrationPanel
              reference={activeCalibrationReference}
              sessionStore={sessionStore}
              onConfirm={(before, after) => (
                store.applyPlanReferencePatch(before, after)
              )}
              onCancel={() => undefined}
              onReturnFocus={returnCalibrationFocus}
            />
          )}
          {dependencies?.workspace?.(workspaceContext) ?? (
            <PlanCanvas
              store={store}
              assetSourceEpoch={store.getAssetSourceEpoch()}
              snapshot={snapshot}
              activeFloorId={sessionState.activeFloorId}
              sessionStore={sessionStore}
              controller={controller}
              onError={(error) => setActionError(errorValue(error))}
              onStartCalibration={startCalibration}
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
          onApplyOpeningPatch={async (before, after) => {
            await store.applySnapshotRecordPatches([{
              collection: "openings",
              changes: [{ id: before.id, before, after }],
            }]);
            if (
              after === null
              && sessionStore.getState().selectedIds.has(before.id)
            ) {
              sessionStore.getState().setSelection([]);
              setContext({ kind: "project" });
            }
          }}
          onApplyBuildingStructurePatch={(patch) => (
            store.applyBuildingStructurePatch(patch)
          )}
          onError={(error) => setActionError(errorValue(error))}
        />
      }
    />
  );
}
