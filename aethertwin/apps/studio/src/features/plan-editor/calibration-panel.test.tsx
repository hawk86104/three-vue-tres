// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createInitialSnapshot,
  parseSnapshotV3,
  type AssetRecord,
  type PlanReference,
  type ProjectSnapshot,
} from "@aethertwin/core-model";
import type { CalibrationPreview } from "@aethertwin/plan-engine";
import {
  ProjectStore,
  SandboxProjectBackend,
} from "@aethertwin/project-store";
import type {
  PlanPointerEvent,
  PlanRenderer,
  PlanRendererEventSink,
  PlanRendererInput,
} from "@aethertwin/render-plan-2d";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoreApi } from "zustand/vanilla";
import {
  createPlanEditorStore,
  type CalibrationDraft,
  type PlanEditorState,
} from "./editor-session";
import { CalibrationPanel } from "./calibration-panel";
import { PlanCanvas } from "./plan-canvas";
import { PlanEditor } from "./plan-editor";
import type { InteractionController } from "./interaction-controller";

/**
 * This file deliberately defines the Task 13 public seam in one place.  The
 * production session remains the sole owner of the draft; the panel and canvas
 * are only projections/actions over this state.
 */
interface CalibrationSessionState extends PlanEditorState {
  readonly calibrationDraft: CalibrationDraft | null;
  beginCalibration(referenceId: string): void;
  updateCalibration(draft: CalibrationDraft): void;
  cancelCalibration(): void;
}

function calibrationSession(
  store: StoreApi<PlanEditorState>,
): StoreApi<CalibrationSessionState> {
  return store as unknown as StoreApi<CalibrationSessionState>;
}

const ids = {
  project: "00000000-0000-4000-8000-000000000101",
  floor: "00000000-0000-4000-8000-000000000102",
  layer: "00000000-0000-4000-8000-000000000103",
  asset: "00000000-0000-4000-8000-000000000104",
  reference: "00000000-0000-4000-8000-000000000105",
};

function referenceFixture(overrides: Partial<PlanReference> = {}): PlanReference {
  return {
    id: ids.reference,
    name: "Ground-floor survey",
    tags: ["survey"],
    floorId: ids.floor,
    layerId: ids.layer,
    assetId: ids.asset,
    intrinsicSize: { width: 100, height: 50 },
    transform: {
      translation: { x: 10, y: 5 },
      rotation: 0,
      scale: { x: 2, y: 2 },
    },
    opacity: 0.65,
    locked: false,
    calibration: null,
    ...overrides,
  };
}

function snapshotFixture(reference = referenceFixture()): {
  readonly snapshot: ProjectSnapshot;
  readonly reference: PlanReference;
} {
  let nextInitialId = 101;
  const initial = createInitialSnapshot({
    name: "Calibration fixture",
    profile: "showroom",
    uuid: () => `00000000-0000-4000-8000-${
      (nextInitialId++).toString().padStart(12, "0")
    }`,
  });
  const floor = {
    ...initial.project.floors[0]!,
    id: ids.floor,
    layers: [{
      ...initial.project.floors[0]!.layers[0]!,
      id: ids.layer,
      visible: true,
      locked: false,
    }],
  };
  const asset: AssetRecord = {
    id: ids.asset,
    sha256: "a".repeat(64),
    relativePath: `assets/sha256/aa/${"a".repeat(64)}.png`,
    mediaType: "image/png",
    size: 128,
  };
  return {
    reference,
    snapshot: parseSnapshotV3({
      ...initial,
      assets: [asset],
      project: {
        ...initial.project,
        floors: [floor],
        planReferences: [reference],
      },
    }),
  };
}


function beginCalibration(
  store: StoreApi<PlanEditorState>,
  referenceId = ids.reference,
): StoreApi<CalibrationSessionState> {
  const session = calibrationSession(store);
  session.getState().beginCalibration(referenceId);
  return session;
}

function updateCalibration(
  session: StoreApi<CalibrationSessionState>,
  patch: Partial<CalibrationDraft>,
): void {
  const current = session.getState().calibrationDraft;
  if (current === null) throw new Error("Expected an active calibration draft.");
  session.getState().updateCalibration({ ...current, ...patch });
}

class RendererProbe implements PlanRenderer {
  readonly inputs: PlanRendererInput[] = [];
  sink: PlanRendererEventSink | null = null;

  async init(_host: HTMLElement, sink: PlanRendererEventSink): Promise<void> {
    this.sink = sink;
  }

  update(input: PlanRendererInput): void {
    this.inputs.push(input);
  }

  resize(): void {}
  destroy(): void {}

  emit(event: PlanPointerEvent): void {
    if (this.sink === null) throw new Error("Renderer was not initialized.");
    this.sink.handle(event);
  }
}

function pointerDown(x: number, y: number): PlanPointerEvent {
  return {
    type: "pointerdown",
    pointerId: 1,
    screen: { x, y },
    buttons: 1,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  };
}

const stores: ProjectStore[] = [];

afterEach(async () => {
  cleanup();
  await Promise.allSettled(stores.splice(0).map((store) => store.dispose()));
  vi.restoreAllMocks();
});

describe("Task 13 calibration session ownership and invalidation", () => {
  it("owns and freezes the exact transient draft without ever accepting a durable snapshot", () => {
    const store = createPlanEditorStore({ activeFloorId: ids.floor });
    const session = beginCalibration(store);
    const mutablePoint = { x: 12, y: 8 };

    updateCalibration(session, {
      sourcePointA: mutablePoint,
      distanceText: "2m",
    });
    mutablePoint.x = 999;

    const draft = session.getState().calibrationDraft;
    expect(draft).toEqual({
      referenceId: ids.reference,
      sourcePointA: { x: 12, y: 8 },
      sourcePointB: null,
      distanceText: "2m",
      preview: null,
    });
    expect(Object.isFrozen(draft)).toBe(true);
    expect(Object.isFrozen(draft?.sourcePointA)).toBe(true);
    expect(session.getState()).not.toHaveProperty("snapshot");
    expect(session.getState()).not.toHaveProperty("project");
  });

  it("cancels only on real floor, selection, or tool changes, while same values retain evidence", () => {
    const store = createPlanEditorStore({ activeFloorId: ids.floor });
    const session = beginCalibration(store);
    const evidence = { x: 10, y: 10 };
    updateCalibration(session, { sourcePointA: evidence, distanceText: "100cm" });

    session.getState().setSelection([]);
    session.getState().setActiveTool("select");
    expect(session.getState().calibrationDraft).toMatchObject({
      sourcePointA: evidence,
      distanceText: "100cm",
    });

    session.getState().setSelection([ids.reference]);
    expect(session.getState().calibrationDraft).toBeNull();

    beginCalibration(store);
    session.getState().setActiveFloor(ids.floor);
    expect(session.getState().calibrationDraft).not.toBeNull();
    session.getState().setActiveTool("pan");
    expect(session.getState().calibrationDraft).toBeNull();

    beginCalibration(store);
    expect(session.getState().setActiveFloor("00000000-0000-4000-8000-000000000106"))
      .toBe(true);
    expect(session.getState().calibrationDraft).toBeNull();
  });
});

describe("CalibrationPanel keyboard and preview contract", () => {
  function renderPanel(reference = referenceFixture()) {
    const store = createPlanEditorStore({ activeFloorId: reference.floorId });
    const session = beginCalibration(store, reference.id);
    const onConfirm = vi.fn(async () => undefined);
    const onCancel = vi.fn();
    const returnFocus = vi.fn();
    render(
      <CalibrationPanel
        reference={reference}
        sessionStore={store}
        onConfirm={onConfirm}
        onCancel={onCancel}
        onReturnFocus={returnFocus}
      />,
    );
    return { session, onConfirm, onCancel, returnFocus };
  }

  async function enterPointsAndDistance(
    user: ReturnType<typeof userEvent.setup>,
    distance = "2m",
  ) {
    for (const [label, value] of [
      ["校准点 A X (px)", "0"],
      ["校准点 A Y (px)", "0"],
      ["校准点 B X (px)", "10"],
      ["校准点 B Y (px)", "0"],
      ["实测距离", distance],
    ] as const) {
      const field = screen.getByLabelText(label);
      await user.clear(field);
      await user.type(field, value);
    }
  }

  it("supports fully keyboard-operated numeric points and mm/cm/m distance parsing before any durable action", async () => {
    const user = userEvent.setup();
    const reference = referenceFixture();
    const { session, onConfirm } = renderPanel(reference);
    const before = structuredClone(reference);

    await enterPointsAndDistance(user, "2m");
    await user.click(screen.getByRole("button", { name: "预览校准" }));

    const preview = session.getState().calibrationDraft?.preview;
    expect(preview).toMatchObject({
      millimetresPerPixel: 200,
      after: {
        transform: { scale: { x: 200, y: 200 } },
        calibration: {
          sourcePointA: { x: 0, y: 0 },
          sourcePointB: { x: 10, y: 0 },
          measuredDistanceMm: 2000,
        },
      },
    });
    expect(screen.getByText("200 mm/px")).toBeVisible();
    expect(screen.getByText("建议世界宽度：20000 mm")).toBeVisible();
    expect(screen.getByText("建议世界高度：10000 mm")).toBeVisible();
    expect(reference).toEqual(before);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it.each([
    ["coincident points", "0", "0", "0", "0", "10cm"],
    ["non-positive distance", "0", "0", "10", "0", "0mm"],
    ["safe-range overflow", "0", "0", "10", "0", "1000000000m"],
  ] as const)(
    "exposes one accessible error and no preview for %s",
    async (_caseName, ax, ay, bx, by, distance) => {
      const user = userEvent.setup();
      const { session, onConfirm } = renderPanel();
      for (const [label, value] of [
        ["校准点 A X (px)", ax],
        ["校准点 A Y (px)", ay],
        ["校准点 B X (px)", bx],
        ["校准点 B Y (px)", by],
        ["实测距离", distance],
      ] as const) {
        const field = screen.getByLabelText(label);
        await user.clear(field);
        await user.type(field, value);
      }

      await user.click(screen.getByRole("button", { name: "预览校准" }));

      expect(screen.getAllByRole("alert")).toHaveLength(1);
      expect(session.getState().calibrationDraft?.preview).toBeNull();
      expect(onConfirm).not.toHaveBeenCalled();
    },
  );

  it("confirms the exact before/preview-after once, while explicit cancel and Escape only clear transient state and restore focus", async () => {
    const user = userEvent.setup();
    const reference = referenceFixture();
    const { session, onConfirm, onCancel, returnFocus } = renderPanel(reference);
    await enterPointsAndDistance(user, "200cm");
    await user.click(screen.getByRole("button", { name: "预览校准" }));
    const preview = session.getState().calibrationDraft?.preview;
    expect(preview).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "确认校准" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledWith(reference, preview?.after);
    expect(returnFocus).toHaveBeenCalledOnce();

    act(() => {
      session.getState().beginCalibration(reference.id);
    });
    await user.click(screen.getByRole("button", { name: "取消校准" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(session.getState().calibrationDraft).toBeNull();

    act(() => {
      session.getState().beginCalibration(reference.id);
    });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(session.getState().calibrationDraft).toBeNull();
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(returnFocus).toHaveBeenCalledTimes(3);
  });

  it("invalidates a preview when the durable reference changes before confirmation", async () => {
    const user = userEvent.setup();
    const reference = referenceFixture();
    const store = createPlanEditorStore({ activeFloorId: reference.floorId });
    const session = beginCalibration(store, reference.id);
    const onConfirm = vi.fn(async () => undefined);
    const view = render(
      <CalibrationPanel
        reference={reference}
        sessionStore={store}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        onReturnFocus={vi.fn()}
      />,
    );

    await enterPointsAndDistance(user, "2m");
    const [previewButton, confirmButton] = screen.getAllByRole("button");
    await user.click(previewButton!);
    expect(session.getState().calibrationDraft?.preview).not.toBeNull();

    view.rerender(
      <CalibrationPanel
        reference={{ ...reference, opacity: 0.25 }}
        sessionStore={store}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        onReturnFocus={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(session.getState().calibrationDraft?.preview).toBeNull();
    });
    expect(confirmButton).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("ignores Escape while durable confirmation is in flight", async () => {
    const user = userEvent.setup();
    const reference = referenceFixture();
    const store = createPlanEditorStore({ activeFloorId: reference.floorId });
    const session = beginCalibration(store, reference.id);
    let resolveConfirm: (() => void) | undefined;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => {
      resolveConfirm = resolve;
    }));
    const onCancel = vi.fn();
    const returnFocus = vi.fn();
    render(
      <CalibrationPanel
        reference={reference}
        sessionStore={store}
        onConfirm={onConfirm}
        onCancel={onCancel}
        onReturnFocus={returnFocus}
      />,
    );

    await enterPointsAndDistance(user, "2m");
    const [previewButton, confirmButton] = screen.getAllByRole("button");
    await user.click(previewButton!);
    await user.click(confirmButton!);
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(session.getState().calibrationDraft).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
    expect(returnFocus).not.toHaveBeenCalled();
    expect(session.getState().calibrationDraft).not.toBeNull();

    act(() => resolveConfirm?.());
    await waitFor(() => expect(session.getState().calibrationDraft).toBeNull());
    expect(returnFocus).toHaveBeenCalledOnce();
  });
});

describe("PlanCanvas calibration pointer, preview, overlay, and mirror contract", () => {
  it("consumes left clicks, converts screen/world/source in order, clamps intrinsic coordinates, and never replaces completed evidence", async () => {
    const { snapshot, reference } = snapshotFixture();
    const sessionStore = createPlanEditorStore({ activeFloorId: reference.floorId });
    const session = beginCalibration(sessionStore, reference.id);
    session.getState().setViewport({
      width: 200,
      height: 100,
      center: { x: 0, y: 0 },
      pixelsPerMillimetre: 2,
    });
    updateCalibration(session, {
      preview: {
        millimetresPerPixel: 1,
        bounds: { min: { x: 0, y: 0 }, max: { x: 100, y: 50 } },
        after: reference,
      },
    });
    const renderer = new RendererProbe();
    const controller = {
      handle: vi.fn(),
      keyDown: vi.fn(),
      copy: vi.fn(),
      paste: vi.fn(async () => undefined),
      cancel: vi.fn(),
    } as unknown as InteractionController;
    render(
      <PlanCanvas
        store={{ resolveAsset: vi.fn() } as never}
        snapshot={snapshot}
        activeFloorId={reference.floorId}
        sessionStore={sessionStore}
        controller={controller}
        rendererFactory={() => renderer}
        onError={vi.fn()}
      />,
    );
    await waitFor(() => expect(renderer.sink).not.toBeNull());

    // screen (140, 75) -> world (20, -12.5) -> source (5, -8.75) -> clamp (5, 0)
    act(() => renderer.emit(pointerDown(140, 75)));
    expect(session.getState().calibrationDraft).toMatchObject({
      sourcePointA: { x: 5, y: 0 },
      sourcePointB: null,
      preview: null,
    });
    // screen (300, 0) -> world (100, 25) -> source (45, 10)
    act(() => renderer.emit(pointerDown(300, 0)));
    expect(session.getState().calibrationDraft).toMatchObject({
      sourcePointA: { x: 5, y: 0 },
      sourcePointB: { x: 45, y: 10 },
    });
    act(() => renderer.emit(pointerDown(0, 0)));
    expect(session.getState().calibrationDraft).toMatchObject({
      sourcePointA: { x: 5, y: 0 },
      sourcePointB: { x: 45, y: 10 },
    });
    expect(controller.handle).not.toHaveBeenCalled();
  });

  it("passes the exact calibration preview to the renderer and shows a transient A/B measurement overlay", async () => {
    const { snapshot, reference } = snapshotFixture();
    const sessionStore = createPlanEditorStore({ activeFloorId: reference.floorId });
    const session = beginCalibration(sessionStore, reference.id);
    const preview: CalibrationPreview = {
      millimetresPerPixel: 25,
      bounds: { min: { x: 10, y: 5 }, max: { x: 2510, y: 1255 } },
      after: {
        ...reference,
        transform: { ...reference.transform, scale: { x: 25, y: 25 } },
      },
    };
    updateCalibration(session, {
      sourcePointA: { x: 0, y: 0 },
      sourcePointB: { x: 100, y: 50 },
      distanceText: "2.5m",
      preview,
    });
    const renderer = new RendererProbe();
    render(
      <PlanCanvas
        store={{ resolveAsset: vi.fn() } as never}
        snapshot={snapshot}
        activeFloorId={reference.floorId}
        sessionStore={sessionStore}
        controller={{
          handle: vi.fn(), keyDown: vi.fn(), copy: vi.fn(),
          paste: vi.fn(async () => undefined), cancel: vi.fn(),
        } as unknown as InteractionController}
        rendererFactory={() => renderer}
        onError={vi.fn()}
      />,
    );
    await waitFor(() => expect(renderer.inputs.length).toBeGreaterThan(0));
    const input = renderer.inputs.at(-1)!;

    expect(input.calibrationPreview).toEqual(preview);
    expect(input.calibrationPreview).not.toBe(preview);
    const canvas = screen.getByRole("region", { name: "二维平面画布" });
    expect(within(canvas).getByTestId("calibration-overlay")).toBeVisible();
    expect(within(canvas).getByTestId("calibration-point-a")).toBeVisible();
    expect(within(canvas).getByTestId("calibration-point-b")).toBeVisible();
    expect(within(canvas).getByTestId("calibration-measurement-line")).toBeVisible();
  });

  it("mirrors visible plan references by the shared ID with inspect/select/calibrate actions and lock-aware calibration denial", async () => {
    const unlocked = referenceFixture({ calibration: {
      sourcePointA: { x: 0, y: 0 },
      sourcePointB: { x: 10, y: 0 },
      measuredDistanceMm: 125,
    }, transform: {
      translation: { x: 10, y: 5 }, rotation: 0, scale: { x: 12.5, y: 12.5 },
    } });
    const { snapshot } = snapshotFixture(unlocked);
    const sessionStore = createPlanEditorStore({ activeFloorId: unlocked.floorId });
    const onStartCalibration = vi.fn();
    render(
      <PlanCanvas
        store={{ resolveAsset: vi.fn() } as never}
        snapshot={snapshot}
        activeFloorId={unlocked.floorId}
        sessionStore={sessionStore}
        controller={{
          handle: vi.fn(), keyDown: vi.fn(), copy: vi.fn(),
          paste: vi.fn(async () => undefined), cancel: vi.fn(),
        } as unknown as InteractionController}
        rendererFactory={() => new RendererProbe()}
        onError={vi.fn()}
        onStartCalibration={onStartCalibration}
      />,
    );
    const mirror = screen.getByRole("region", { name: "可访问对象列表" });
    const row = within(mirror).getByTestId(`accessible-reference-${unlocked.id}`);

    expect(row).toHaveTextContent(unlocked.name);
    expect(row).toHaveTextContent(unlocked.id);
    expect(row).toHaveTextContent("已校准");
    expect(row).toHaveTextContent("12.5 mm/px");
    expect(row).toHaveTextContent("未锁定");
    expect(row).toHaveTextContent("65%");
    await userEvent.click(within(row).getByRole("button", { name: `选择平面参考：${unlocked.name}` }));
    expect([...sessionStore.getState().selectedIds]).toEqual([unlocked.id]);
    await userEvent.click(within(row).getByRole("button", { name: `校准平面参考：${unlocked.name}` }));
    expect(onStartCalibration).toHaveBeenCalledWith(unlocked.id, expect.any(HTMLButtonElement));

    const locked = referenceFixture({ id: "00000000-0000-4000-8000-000000000107", locked: true });
    const lockedSnapshot = snapshotFixture(locked).snapshot;
    render(
      <PlanCanvas
        store={{ resolveAsset: vi.fn() } as never}
        snapshot={lockedSnapshot}
        activeFloorId={locked.floorId}
        sessionStore={createPlanEditorStore({ activeFloorId: locked.floorId })}
        controller={{
          handle: vi.fn(), keyDown: vi.fn(), copy: vi.fn(),
          paste: vi.fn(async () => undefined), cancel: vi.fn(),
        } as unknown as InteractionController}
        rendererFactory={() => new RendererProbe()}
        onError={vi.fn()}
        onStartCalibration={onStartCalibration}
      />,
    );
    const lockedRow = screen.getByTestId(`accessible-reference-${locked.id}`);
    expect(lockedRow).toHaveTextContent("已锁定");
    expect(within(lockedRow).getByRole("button", {
      name: `校准平面参考：${locked.name}`,
    })).toBeDisabled();
  });
});

describe("PlanEditor calibration entry point and durable confirmation contract", () => {
  async function editorStoreWithReference(): Promise<{
    readonly store: ProjectStore;
    readonly reference: PlanReference;
  }> {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
    stores.push(store);
    await store.create({ name: "Calibration editor", location: "sandbox", profile: "showroom" });
    const snapshot = store.getState().snapshot!;
    const floor = snapshot.project.floors[0]!;
    const asset: AssetRecord = {
      id: ids.asset,
      sha256: "b".repeat(64),
      relativePath: `assets/sha256/bb/${"b".repeat(64)}.png`,
      mediaType: "image/png",
      size: 128,
    };
    const reference = referenceFixture({
      floorId: floor.id,
      layerId: floor.layers[0]!.id,
    });
    await store.applySnapshotRecordPatches([
      { collection: "assets", changes: [{ id: asset.id, before: null, after: asset }] },
      { collection: "planReferences", changes: [{ id: reference.id, before: null, after: reference }] },
    ]);
    return { store, reference };
  }

  it("shows Calibrate only for one selected visible unlocked reference, then commits exactly one exact patch and restores initiating focus", async () => {
    const user = userEvent.setup();
    const { store, reference } = await editorStoreWithReference();
    const applyPatch = vi.spyOn(store, "applyPlanReferencePatch");
    const sessionStore = createPlanEditorStore({ activeFloorId: reference.floorId });
    render(
      <PlanEditor
        store={store}
        dependencies={{ sessionStore, assetPicker: null, workspace: () => <div /> }}
      />,
    );
    expect(screen.queryByRole("button", { name: "校准" })).not.toBeInTheDocument();

    const referenceRow = document.querySelector(`[data-reference-id="${reference.id}"]`);
    expect(referenceRow).toBeInstanceOf(HTMLElement);
    await user.click(referenceRow as HTMLElement);
    const calibrate = within(screen.getByRole("group", { name: "建筑" }))
      .getByRole("button", { name: "校准" });
    expect(calibrate).toBeEnabled();
    await user.click(calibrate);

    await enterEditorCalibration(user, "2m");
    const beforePreview = store.getState().snapshot?.project.planReferences.find(
      ({ id }) => id === reference.id,
    );
    await user.click(screen.getByRole("button", { name: "预览校准" }));
    expect(store.getState().snapshot?.project.planReferences.find(({ id }) => id === reference.id))
      .toEqual(beforePreview);
    await user.click(screen.getByRole("button", { name: "确认校准" }));

    await waitFor(() => expect(applyPatch).toHaveBeenCalledOnce());
    expect(applyPatch).toHaveBeenCalledWith(reference, expect.objectContaining({
      id: reference.id,
      transform: expect.objectContaining({ scale: { x: 200, y: 200 } }),
    }));
    await waitFor(() => expect(sessionStore.getState().calibrationDraft).toBeNull());
    expect(calibrate).toHaveFocus();
  });
});

async function enterEditorCalibration(
  user: ReturnType<typeof userEvent.setup>,
  distance: string,
): Promise<void> {
  for (const [label, value] of [
    ["校准点 A X (px)", "0"],
    ["校准点 A Y (px)", "0"],
    ["校准点 B X (px)", "10"],
    ["校准点 B Y (px)", "0"],
    ["实测距离", distance],
  ] as const) {
    const field = screen.getByLabelText(label);
    await user.clear(field);
    await user.type(field, value);
  }
}
