import {
  createInitialSnapshot,
  parseSnapshotV3,
  type Fixture,
  type Floor,
  type PlanLayer,
  type ProjectProfile,
  type ProjectSnapshot,
  type SpatialEntity,
} from "@aethertwin/core-model";
import type { FloorChange, PlanEditIntent } from "@aethertwin/plan-engine";
import type { ProjectStore, ProjectStoreState } from "@aethertwin/project-store";
import type {
  PlanPointerEvent,
  PlanRenderer,
  PlanRendererEventSink,
  PlanRendererInput,
} from "@aethertwin/render-plan-2d";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import { createPlanEditorStore } from "./editor-session";
import { createInteractionController } from "./interaction-controller";
import { PlanEditor, type PlanEditorDependencies } from "./plan-editor";
import { PlanCanvas, type PlanCanvasProps } from "./plan-canvas";

export function createPlanEditorTestHarness() {
  const initialIds = [1, 2, 3].map(
    (value) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`,
  );
  const initial = createInitialSnapshot({
    name: "Editor",
    profile: "market",
    uuid: () => initialIds.shift()!,
  });
  const floorA = initial.project.floors[0]!;
  const floorB: Floor = {
    id: "00000000-0000-4000-8000-000000000004",
    name: "Floor B",
    tags: [],
    layers: [{
      id: "00000000-0000-4000-8000-000000000005",
      name: "Default",
      tags: [],
      visible: true,
      locked: false,
    }],
  };
  const fixture: Fixture = {
    type: "fixture",
    id: "00000000-0000-4000-8000-000000000010",
    name: "Fixture",
    tags: [],
    floorId: floorA.id,
    layerId: floorA.layers[0]!.id,
    locked: false,
    transform: {
      translation: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    kind: "generic",
    size: { width: 100, height: 100 },
  };
  const snapshot = parseSnapshotV3({
    ...initial,
    project: { ...initial.project, floors: [floorA, floorB], entities: [fixture] },
  });
  const store = createPlanEditorStore({ activeFloorId: floorA.id });
  const applyPlanEdit = vi.fn(async (intent: PlanEditIntent) => {
    void intent;
    return undefined;
  });
  const errors: unknown[] = [];
  let nextId = 20;
  const controller = createInteractionController({
    getSnapshot: () => snapshot,
    store,
    makeId: () => `00000000-0000-4000-8000-${(nextId++).toString().padStart(12, "0")}`,
    applyPlanEdit,
    onError: (error) => errors.push(error),
  });
  return { snapshot, floorA, floorB, fixture, store, controller, applyPlanEdit, errors };
}

export const pointerAt = (
  type: PlanPointerEvent["type"], x: number, y: number, buttons = type === "pointerup" ? 0 : 1,
): PlanPointerEvent => ({
  type, pointerId: 1, screen: { x, y }, buttons,
  shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
});

export class FakePlanRenderer implements PlanRenderer {
  readonly updateInputs: PlanRendererInput[] = [];
  readonly invalidatedAssetIds: string[] = [];
  readonly resizeInputs: Array<readonly [number, number, number]> = [];
  initCount = 0;
  destroyCount = 0;
  initResult: Promise<void> = Promise.resolve();
  host: HTMLElement | null = null;
  sink: PlanRendererEventSink | null = null;

  async init(host: HTMLElement, sink: PlanRendererEventSink): Promise<void> {
    this.initCount += 1;
    this.host = host;
    this.sink = sink;
    await this.initResult;
  }

  update(input: PlanRendererInput): void {
    this.updateInputs.push(input);
  }

  invalidateAsset(assetId: string): void {
    this.invalidatedAssetIds.push(assetId);
  }

  resize(width: number, height: number, resolution: number): void {
    this.resizeInputs.push([width, height, resolution]);
  }

  destroy(): void {
    this.destroyCount += 1;
  }

  emit(event: PlanPointerEvent): void {
    if (this.sink === null) throw new Error("Renderer has not initialized");
    this.sink.handle(event);
  }
}

export function createPlanCanvasProps(
  harness: ReturnType<typeof createPlanEditorTestHarness>,
  renderer: FakePlanRenderer,
): PlanCanvasProps {
  return {
    store: {
      resolveAsset: vi.fn(async (assetId: string) => ({
        assetId,
        url: `blob:aethertwin/${assetId}`,
        mediaType: "image/png" as const,
      })),
    } as unknown as ProjectStore,
    assetSourceEpoch: 0,
    snapshot: harness.snapshot,
    activeFloorId: harness.floorA.id,
    sessionStore: harness.store,
    controller: harness.controller,
    rendererFactory: () => renderer,
    onError: vi.fn(),
  };
}


export type InvalidSelectionKind =
  | "hidden"
  | "locked-layer"
  | "entity-locked"
  | "other-floor"
  | "missing";

export interface RenderPlanEditorFixtureOptions {
  readonly profile?: ProjectProfile;
  readonly selectedEntityCount?: 2 | 3;
  readonly invalidSelection?: InvalidSelectionKind;
  readonly invalidGeneratedIds?: boolean;
  readonly primaryEntityType?: "fixture" | "wall" | "poi" | "dimension";
  readonly assetPicker?: PlanEditorDependencies["assetPicker"];
  readonly workspace?: PlanEditorDependencies["workspace"];
  readonly renderer?: FakePlanRenderer;
}

function fixtureEntity(
  fixture: Fixture,
  index: number,
): SpatialEntity {
  return {
    ...fixture,
    id: `00000000-0000-4000-8000-${(10 + index).toString().padStart(12, "0")}`,
    name: `Fixture ${index + 1}`,
    transform: {
      ...fixture.transform,
      translation: {
        x: [0, 250, 700][index] ?? index * 250,
        y: 0,
      },
    },
  };
}

function primaryEntity(
  fixture: Fixture,
  type: NonNullable<RenderPlanEditorFixtureOptions["primaryEntityType"]>,
): SpatialEntity {
  const common = {
    id: fixture.id,
    name: fixture.name,
    tags: fixture.tags,
    floorId: fixture.floorId,
    layerId: fixture.layerId,
    locked: fixture.locked,
    transform: fixture.transform,
  };
  if (type === "wall") {
    return {
      ...common,
      type: "wall",
      centerLine: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      thickness: 100,
    };
  }
  if (type === "poi") {
    return {
      ...common,
      type: "poi",
      kind: "custom",
      radius: 75,
    };
  }
  if (type === "dimension") {
    return {
      ...common,
      type: "dimension",
      start: { kind: "point", point: { x: 0, y: 0 } },
      end: { kind: "point", point: { x: 100, y: 0 } },
      offset: 25,
      displayUnit: "mm",
    };
  }
  return fixture;
}

export function renderPlanEditorFixture(
  options: RenderPlanEditorFixtureOptions = {},
) {
  const base = createPlanEditorTestHarness();
  const layerA: PlanLayer = {
    ...base.floorA.layers[0]!,
    visible: options.invalidSelection === "hidden" ? false : true,
    locked: options.invalidSelection === "locked-layer",
  };
  const layerB: PlanLayer = {
    id: "00000000-0000-4000-8000-000000000006",
    name: "Annotations",
    tags: [],
    visible: true,
    locked: false,
  };
  const floorA: Floor = {
    ...base.floorA,
    layers: [layerA, layerB],
  };
  const firstFixture = fixtureEntity(
    { ...base.fixture, layerId: layerA.id },
    0,
  ) as Fixture;
  let entities = [
    primaryEntity(firstFixture, options.primaryEntityType ?? "fixture"),
    fixtureEntity({ ...base.fixture, layerId: layerA.id }, 1),
    fixtureEntity({ ...base.fixture, layerId: layerA.id }, 2),
  ];
  if (options.invalidSelection === "entity-locked") {
    entities = [{ ...entities[0]!, locked: true }, ...entities.slice(1)];
  }
  if (options.invalidSelection === "other-floor") {
    entities = [{
      ...entities[0]!,
      floorId: base.floorB.id,
      layerId: base.floorB.layers[0]!.id,
    } as SpatialEntity, ...entities.slice(1)];
  }

  const snapshot = parseSnapshotV3({
    ...base.snapshot,
    project: {
      ...base.snapshot.project,
      profile: options.profile ?? "market",
      floors: [floorA, base.floorB],
      entities,
    },
  });
  let projectState: ProjectStoreState = Object.freeze({
    projectPath: "sandbox://fixture",
    manifest: null,
    snapshot,
    recovered: false,
    saveState: "saved",
    error: null,
    canUndo: false,
    canRedo: false,
    assetIssues: Object.freeze([]),
  });
  const listeners = new Set<() => void>();

  function publishState(nextState: ProjectStoreState) {
    projectState = Object.freeze(nextState);
    for (const listener of listeners) listener();
  }

  function publish(nextSnapshot: ProjectSnapshot) {
    publishState({
      ...projectState,
      snapshot: nextSnapshot,
      saveState: "dirty",
      error: null,
      canUndo: true,
      canRedo: false,
    });
  }

  const applyPlanEdit = vi.fn(async (intent: PlanEditIntent) => {
    const current = projectState.snapshot!;
    const byId = new Map(
      current.project.entities.map((entity) => [entity.id, entity]),
    );
    for (const change of intent.changes) {
      if (change.after === null) byId.delete(change.id);
      else byId.set(change.id, change.after);
    }
    publish(parseSnapshotV3({
      ...current,
      sequence: current.sequence + 1,
      project: {
        ...current.project,
        entities: [...byId.values()],
      },
    }));
  });
  const applyFloorPatch = vi.fn(async (change: FloorChange) => {
    const current = projectState.snapshot!;
    publish(parseSnapshotV3({
      ...current,
      sequence: current.sequence + 1,
      project: {
        ...current.project,
        floors: current.project.floors.map((floor) => (
          floor.id === change.floorId ? change.after : floor
        )),
      },
    }));
  });

  const projectStore = {
    getState: () => projectState,
    getAssetSourceEpoch: () => 0,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    applyPlanEdit,
    applyFloorPatch,
    renameProject: vi.fn(async () => undefined),
    setProjectTags: vi.fn(async () => undefined),
    save: vi.fn(async () => publishState({
      ...projectState,
      saveState: "saved",
    })),
    undo: vi.fn(async () => undefined),
    redo: vi.fn(async () => undefined),
    flush: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  } as unknown as ProjectStore;

  const sessionStore = createPlanEditorStore({ activeFloorId: floorA.id });
  const count = options.selectedEntityCount ?? 0;
  const selectedIds = entities.slice(0, count).map((entity) => entity.id);
  if (options.invalidSelection === "missing" && count > 0) {
    selectedIds[selectedIds.length - 1] =
      "00000000-0000-4000-8000-000000000099";
  }
  sessionStore.getState().setSelection(selectedIds);

  let nextId = 50;
  const makeId = options.invalidGeneratedIds
    ? () => "invalid-id"
    : () => `00000000-0000-4000-8000-${(nextId++).toString().padStart(12, "0")}`;
  const errors: unknown[] = [];
  const baseController = createInteractionController({
    getSnapshot: () => projectState.snapshot!,
    store: sessionStore,
    makeId,
    applyPlanEdit,
    onError: (error) => errors.push(error),
  });
  const controller = {
    handle: baseController.handle,
    keyDown: baseController.keyDown,
    copy: vi.fn(() => baseController.copy()),
    paste: vi.fn((offset?: { readonly x: number; readonly y: number }) => (
      baseController.paste(offset)
    )),
    cancel: baseController.cancel,
  };
  const renderer = options.renderer;
  const rendererFactory = renderer === undefined ? undefined : () => renderer;
  const workspaceOverride: NonNullable<PlanEditorDependencies["workspace"]> =
    () => <div data-testid="plan-workspace-override">Renderer override</div>;
  const workspace: PlanEditorDependencies["workspace"] =
    rendererFactory === undefined
      ? options.workspace
      : ({ snapshot: current, activeFloorId, sessionStore: currentStore, controller: currentController }) => (
        <PlanCanvas
          store={projectStore}
          assetSourceEpoch={0}
          snapshot={current}
          activeFloorId={activeFloorId}
          sessionStore={currentStore}
          controller={currentController}
          rendererFactory={rendererFactory}
          onError={(error) => errors.push(error)}
        />
      );
  const renderResult = render(
    <PlanEditor
      store={projectStore}
      backendMode="sandbox"
      dependencies={{
        sessionStore,
        controller,
        makeId,
        assetPicker: options.assetPicker ?? null,
        ...(workspace === undefined
          ? {}
          : { workspace }),
      }}
    />,
  );

  return {
    ...renderResult,
    snapshot,
    floorA,
    floorB: base.floorB,
    layerA,
    layerB,
    entities,
    fixture: firstFixture,
    sessionStore,
    controller,
    projectStore,
    applyPlanEdit,
    applyFloorPatch,
    errors,
    makeId,
    workspaceOverride,
    renderer,
  };
}
