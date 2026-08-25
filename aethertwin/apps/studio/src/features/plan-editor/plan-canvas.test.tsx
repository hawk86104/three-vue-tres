// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  parseSnapshotV3,
  type GuidedRoute,
  type Opening,
  type PlanReference,
  type RouteEdge,
  type RouteNetwork,
  type RouteNode,
  type Wall,
} from "@aethertwin/core-model";
import type {
  PlanAssetSourcePort,
  PlanPointerEvent,
} from "@aethertwin/render-plan-2d";
import {
  act, cleanup, fireEvent, render, screen, waitFor, within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanCanvas } from "./plan-canvas";
import type { PlanDraft, PlanEditorState } from "./editor-session";
import { StudioI18nTestProvider } from "../../i18n/test-support";
import { LanguageSwitcher } from "../../i18n/language-switcher";
import {
  createPlanCanvasProps,
  createPlanEditorTestHarness,
  FakePlanRenderer,
} from "./plan-editor.test-support";

const productionRendererHarness = vi.hoisted(() => ({
  sourcePorts: [] as unknown[],
  instances: [] as Array<{ readonly sourcePort: unknown; destroyCount: number }>,
}));

vi.mock("@aethertwin/render-plan-2d", () => ({
  PixiPlanRenderer: class {
    readonly sourcePort: unknown;
    destroyCount = 0;

    constructor(sourcePort: unknown) {
      this.sourcePort = sourcePort;
      productionRendererHarness.sourcePorts.push(sourcePort);
      productionRendererHarness.instances.push(this);
    }
    async init(): Promise<void> {}
    update(): void {}
    resize(): void {}
    destroy(): void { this.destroyCount += 1; }
  },
}));

interface ResizeEntry {
  readonly contentRect: { readonly width: number; readonly height: number };
}

class FakeResizeObserver {
  static readonly instances: FakeResizeObserver[] = [];
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();

  constructor(
    private readonly callback: (entries: readonly ResizeEntry[]) => void,
  ) {
    FakeResizeObserver.instances.push(this);
  }

  publish(width: number, height: number): void {
    this.callback([{ contentRect: { width, height } }]);
  }
}

function deferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
} {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  productionRendererHarness.sourcePorts.length = 0;
  productionRendererHarness.instances.length = 0;
  FakeResizeObserver.instances.length = 0;
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal("devicePixelRatio", 3);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PlanCanvas lifecycle", () => {
  it("changes the canvas label live without replacing the renderer or selection", async () => {
    const harness = createPlanEditorTestHarness();
    const renderer = new FakePlanRenderer();
    act(() => harness.store.getState().setSelection([harness.fixture.id]));
    const props = createPlanCanvasProps(harness, renderer);
    const view = render(
      <StudioI18nTestProvider>
        <LanguageSwitcher />
        <PlanCanvas {...props} />
      </StudioI18nTestProvider>,
    );
    await waitFor(() => expect(renderer.initCount).toBe(1));
    expect(screen.getByRole("region", { name: "二维平面画布" })).toBeVisible();

    fireEvent.change(screen.getByLabelText("界面语言"), { target: { value: "en" } });

    expect(screen.getByRole("region", { name: "2D plan canvas" })).toBeVisible();
    expect(renderer.initCount).toBe(1);
    expect([...harness.store.getState().selectedIds]).toEqual([harness.fixture.id]);
  });

  it("initializes once, publishes the latest renderer input, and destroys once", async () => {
    const harness = createPlanEditorTestHarness();
    const renderer = new FakePlanRenderer();
    const props = createPlanCanvasProps(harness, renderer);
    const movedSnapshot = parseSnapshotV3({
      ...harness.snapshot,
      project: {
        ...harness.snapshot.project,
        entities: harness.snapshot.project.entities.map((entity) => (
          entity.id === harness.fixture.id
            ? {
                ...entity,
                transform: {
                  ...entity.transform,
                  translation: { x: 100, y: 0 },
                },
              }
            : entity
        )),
      },
    });

    const view = render(<PlanCanvas {...props} />);
    await waitFor(() => expect(renderer.initCount).toBe(1));
    await waitFor(() => expect(renderer.updateInputs.at(-1)?.snapshot).toBe(harness.snapshot));

    view.rerender(<PlanCanvas {...props} snapshot={movedSnapshot} />);
    await waitFor(() => expect(renderer.updateInputs.at(-1)?.snapshot).toBe(movedSnapshot));

    act(() => {
      harness.store.getState().setSelection([harness.fixture.id]);
      const state = harness.store.getState();
      state.setActiveRouteNetwork({
        sessionId: state.sessionId,
        floorId: state.activeFloorId,
        networkId: null,
        tool: state.activeTool,
      }, "00000000-0000-4000-8000-000000000700");
    });
    await waitFor(() => expect(
      renderer.updateInputs.at(-1)?.selectedIds.has(harness.fixture.id),
    ).toBe(true));
    expect(renderer.updateInputs.at(-1)?.activeRouteNetworkId)
      .toBe("00000000-0000-4000-8000-000000000700");
    expect(props.store.resolveAsset).not.toHaveBeenCalled();

    view.unmount();
    expect(renderer.destroyCount).toBe(1);
    expect(FakeResizeObserver.instances[0]?.disconnect).toHaveBeenCalledOnce();
  });

  it("does not update a renderer whose pending initialization is unmounted", async () => {
    const harness = createPlanEditorTestHarness();
    const renderer = new FakePlanRenderer();
    const gate = deferred();
    renderer.initResult = gate.promise;
    const view = render(<PlanCanvas {...createPlanCanvasProps(harness, renderer)} />);
    await waitFor(() => expect(renderer.initCount).toBe(1));

    view.unmount();
    gate.resolve();
    await gate.promise;
    await Promise.resolve();

    expect(renderer.updateInputs).toEqual([]);
    expect(renderer.resizeInputs).toEqual([]);
    expect(renderer.destroyCount).toBe(1);
  });

  it("reports initialization rejection and still tears down exactly once", async () => {
    const harness = createPlanEditorTestHarness();
    const renderer = new FakePlanRenderer();
    const failure = new Error("renderer init failed");
    const gate = deferred();
    renderer.initResult = gate.promise;
    const props = createPlanCanvasProps(harness, renderer);
    const view = render(<PlanCanvas {...props} />);
    await waitFor(() => expect(renderer.initCount).toBe(1));

    gate.reject(failure);
    await waitFor(() => expect(props.onError).toHaveBeenCalledWith(failure));
    view.unmount();
    view.unmount();

    expect(renderer.destroyCount).toBe(1);
  });

  it("reports non-negative observed dimensions with a capped device resolution", async () => {
    const harness = createPlanEditorTestHarness();
    const renderer = new FakePlanRenderer();
    render(<PlanCanvas {...createPlanCanvasProps(harness, renderer)} />);
    await waitFor(() => expect(renderer.initCount).toBe(1));
    const observer = FakeResizeObserver.instances[0]!;

    act(() => observer.publish(640, 480));
    await waitFor(() => expect(renderer.resizeInputs.at(-1)).toEqual([640, 480, 2]));
    act(() => observer.publish(-10, -20));
    await waitFor(() => expect(renderer.resizeInputs.at(-1)).toEqual([0, 0, 2]));

    expect(observer.observe).toHaveBeenCalledWith(
      screen.getByRole("region", { name: "二维平面画布" }),
    );
  });
});

describe("PlanCanvas production asset source", () => {
  it("restarts the production renderer only when store identity or asset source epoch changes", async () => {
    const harness = createPlanEditorTestHarness();
    const props = createPlanCanvasProps(harness, new FakePlanRenderer());
    const { rendererFactory: _injectedRendererFactory, ...productionProps } = props;
    void _injectedRendererFactory;
    const firstResolve = vi.fn(async (assetId: string) => ({
      assetId, url: `blob:first/${assetId}`, mediaType: "image/png" as const,
    }));
    const secondResolve = vi.fn(async (assetId: string) => ({
      assetId, url: `blob:second/${assetId}`, mediaType: "image/png" as const,
    }));
    const firstStore = { resolveAsset: firstResolve } as unknown as typeof props.store;
    const secondStore = { resolveAsset: secondResolve } as unknown as typeof props.store;
    const view = render(
      <PlanCanvas {...productionProps} store={firstStore} assetSourceEpoch={7} />,
    );
    await waitFor(() => expect(productionRendererHarness.instances).toHaveLength(1));
    const firstRenderer = productionRendererHarness.instances[0]!;

    view.rerender(
      <PlanCanvas {...productionProps} store={firstStore} assetSourceEpoch={7} />,
    );
    await Promise.resolve();
    expect(productionRendererHarness.instances).toEqual([firstRenderer]);
    expect(firstRenderer.destroyCount).toBe(0);

    view.rerender(
      <PlanCanvas {...productionProps} store={secondStore} assetSourceEpoch={7} />,
    );
    await waitFor(() => expect(productionRendererHarness.instances).toHaveLength(2));
    const secondRenderer = productionRendererHarness.instances[1]!;
    expect(firstRenderer.destroyCount).toBe(1);
    const secondSource = secondRenderer.sourcePort as PlanAssetSourcePort;
    await expect(secondSource.resolve("asset-b")).resolves.toMatchObject({
      assetId: "asset-b", url: "blob:second/asset-b",
    });

    view.rerender(
      <PlanCanvas {...productionProps} store={secondStore} assetSourceEpoch={8} />,
    );
    await waitFor(() => expect(productionRendererHarness.instances).toHaveLength(3));
    expect(secondRenderer.destroyCount).toBe(1);
    expect(firstResolve).not.toHaveBeenCalled();
    expect(secondResolve).toHaveBeenCalledOnce();
  });

  it("keeps one stable adapter that resolves exact ProjectStore sources by asset ID", async () => {
    const harness = createPlanEditorTestHarness();
    const props = createPlanCanvasProps(harness, new FakePlanRenderer());
    const { rendererFactory: _injectedRendererFactory, ...productionProps } = props;
    void _injectedRendererFactory;
    const resolved = {
      assetId: "asset-a",
      url: "blob:aethertwin/asset-a",
      mediaType: "image/png" as const,
    };
    const resolveAsset = vi.fn(async (assetId: string) => ({ ...resolved, assetId }));
    const store = { resolveAsset } as unknown as typeof props.store;
    const view = render(<PlanCanvas {...productionProps} store={store} />);
    await waitFor(() => expect(productionRendererHarness.sourcePorts).toHaveLength(1));
    const sourcePort = productionRendererHarness.sourcePorts[0] as PlanAssetSourcePort;

    await expect(sourcePort.resolve("asset-a")).resolves.toEqual(resolved);
    expect(Object.keys(await sourcePort.resolve("asset-a")).sort()).toEqual([
      "assetId", "mediaType", "url",
    ]);
    expect(resolveAsset.mock.calls).toEqual([["asset-a"], ["asset-a"]]);

    view.rerender(<PlanCanvas {...productionProps} store={store} />);
    await Promise.resolve();
    expect(productionRendererHarness.sourcePorts).toEqual([sourcePort]);
  });

  it("reports ProjectStore resolution failure and rethrows the same typed error", async () => {
    const harness = createPlanEditorTestHarness();
    const props = createPlanCanvasProps(harness, new FakePlanRenderer());
    const { rendererFactory: _injectedRendererFactory, ...productionProps } = props;
    void _injectedRendererFactory;
    const failure = Object.assign(new Error("Asset resolution failed."), {
      code: "ASSET_MISSING" as const,
    });
    const resolveAsset = vi.fn(async () => Promise.reject(failure));
    const store = { resolveAsset } as unknown as typeof props.store;
    const onError = vi.fn();
    render(<PlanCanvas {...productionProps} store={store} onError={onError} />);
    await waitFor(() => expect(productionRendererHarness.sourcePorts).toHaveLength(1));
    const sourcePort = productionRendererHarness.sourcePorts[0] as PlanAssetSourcePort;

    await expect(sourcePort.resolve("asset-b")).rejects.toBe(failure);
    expect(resolveAsset).toHaveBeenCalledOnce();
    expect(resolveAsset).toHaveBeenCalledWith("asset-b");
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(failure);
  });
});

function pointerEvent(
  type: PlanPointerEvent["type"],
  overrides: Partial<PlanPointerEvent> = {},
): PlanPointerEvent {
  return {
    type,
    pointerId: 1,
    screen: { x: 20, y: 30 },
    buttons: type === "pointerdown" ? 1 : 0,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...overrides,
  };
}

function inputController() {
  return {
    createAt: vi.fn(async function (
      point: { readonly x: number; readonly y: number },
    ) {
      void point;
    }),
    handle: vi.fn(async (event: PlanPointerEvent) => {
      void event;
    }),
    keyDown: vi.fn(async (key: string) => {
      void key;
    }),
    copy: vi.fn(),
    paste: vi.fn(async () => {}),
    cancel: vi.fn(),
  };
}

describe("PlanCanvas input forwarding", () => {
  it("focuses on primary pointer start, forwards renderer events, and reports sink rejection", async () => {
    const harness = createPlanEditorTestHarness();
    const renderer = new FakePlanRenderer();
    const failure = new Error("controller rejected renderer input");
    const controller = inputController();
    controller.handle.mockRejectedValueOnce(failure);
    const props = {
      ...createPlanCanvasProps(harness, renderer),
      controller,
    };
    render(<PlanCanvas {...props} />);
    await waitFor(() => expect(renderer.initCount).toBe(1));
    const region = screen.getByRole("region", { name: "二维平面画布" });

    renderer.emit(pointerEvent("pointerdown"));
    await waitFor(() => expect(controller.handle).toHaveBeenCalledOnce());

    expect(region).toHaveFocus();
    expect(controller.handle).toHaveBeenCalledWith(pointerEvent("pointerdown"));
    expect(props.onError).toHaveBeenCalledWith(failure);
  });

  it("cancels a same-turn renderer pointer start when the canvas unmounts", async () => {
    const harness = createPlanEditorTestHarness();
    const renderer = new FakePlanRenderer();
    harness.store.getState().setActiveTool("fixture");
    const view = render(
      <PlanCanvas {...createPlanCanvasProps(harness, renderer)} />,
    );
    await waitFor(() => expect(renderer.initCount).toBe(1));

    renderer.emit(pointerEvent("pointerdown"));
    view.unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(harness.store.getState()).toMatchObject({
      draft: null,
      gestureActive: false,
    });
    expect(harness.applyPlanEdit).not.toHaveBeenCalled();
    expect(renderer.destroyCount).toBe(1);
  });

  it("cancels on teardown without reporting a pending input rejection", async () => {
    const harness = createPlanEditorTestHarness();
    const renderer = new FakePlanRenderer();
    const controller = inputController();
    const gate = deferred();
    const failure = new Error("input rejected after canvas teardown");
    controller.handle.mockReturnValueOnce(gate.promise);
    const props = {
      ...createPlanCanvasProps(harness, renderer),
      controller,
    };
    const view = render(<PlanCanvas {...props} />);
    await waitFor(() => expect(renderer.initCount).toBe(1));

    renderer.emit(pointerEvent("pointerdown"));
    await waitFor(() => expect(controller.handle).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => {
      gate.reject(failure);
      await gate.promise.catch(() => undefined);
      await Promise.resolve();
    });

    expect(controller.cancel).toHaveBeenCalledOnce();
    expect(props.onError).not.toHaveBeenCalled();
    expect(renderer.destroyCount).toBe(1);
  });

  it("handles only canvas shortcuts and cancels transient state on blur", async () => {
    const harness = createPlanEditorTestHarness();
    const renderer = new FakePlanRenderer();
    const controller = inputController();
    render(<PlanCanvas
      {...createPlanCanvasProps(harness, renderer)}
      controller={controller}
    />);
    await waitFor(() => expect(renderer.initCount).toBe(1));
    const region = screen.getByRole("region", { name: "二维平面画布" });
    region.focus();

    fireEvent.keyDown(region, { key: "c", ctrlKey: true });
    fireEvent.keyDown(region, { key: "v", metaKey: true });
    fireEvent.keyDown(region, { key: "Delete" });
    fireEvent.keyDown(region, { key: "Escape" });
    fireEvent.keyDown(region, { key: "ArrowRight" });

    expect(controller.copy).toHaveBeenCalledOnce();
    expect(controller.paste).toHaveBeenCalledOnce();
    expect(controller.keyDown.mock.calls.map(([key]) => key)).toEqual([
      "Delete",
      "Escape",
      "ArrowRight",
    ]);

    controller.copy.mockClear();
    controller.paste.mockClear();
    controller.keyDown.mockClear();
    const input = document.createElement("input");
    region.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "c", ctrlKey: true });
    fireEvent.keyDown(input, { key: "v", ctrlKey: true });
    fireEvent.keyDown(input, { key: "Delete" });
    fireEvent.keyDown(input, { key: "ArrowLeft" });

    expect(controller.copy).not.toHaveBeenCalled();
    expect(controller.paste).not.toHaveBeenCalled();
    expect(controller.keyDown).not.toHaveBeenCalled();

    fireEvent.blur(region, { relatedTarget: null });
    expect(controller.cancel).toHaveBeenCalledOnce();
  });
});

describe("PlanCanvas accessible parity", () => {
  it("mirrors only active-floor visible-layer entities and selects locked objects", async () => {
    const user = userEvent.setup();
    const harness = createPlanEditorTestHarness();
    const renderer = new FakePlanRenderer();
    const hiddenLayer = {
      id: "00000000-0000-4000-8000-000000000006",
      name: "Hidden",
      tags: [],
      visible: false,
      locked: false,
    } as const;
    const floorA = {
      ...harness.floorA,
      layers: [...harness.floorA.layers, hiddenLayer],
    };
    const locked = {
      ...harness.fixture,
      id: "00000000-0000-4000-8000-000000000011",
      name: "Locked Fixture",
      locked: true,
    };
    const hidden = {
      ...harness.fixture,
      id: "00000000-0000-4000-8000-000000000012",
      name: "Hidden Fixture",
      layerId: hiddenLayer.id,
    };
    const otherFloor = {
      ...harness.fixture,
      id: "00000000-0000-4000-8000-000000000013",
      name: "Other Floor Fixture",
      floorId: harness.floorB.id,
      layerId: harness.floorB.layers[0]!.id,
    };
    const snapshot = parseSnapshotV3({
      ...harness.snapshot,
      project: {
        ...harness.snapshot.project,
        floors: [floorA, harness.floorB],
        entities: [harness.fixture, locked, hidden, otherFloor],
      },
    });
    act(() => harness.store.getState().setSelection([harness.fixture.id]));

    render(<PlanCanvas
      {...createPlanCanvasProps(harness, renderer)}
      snapshot={snapshot}
    />);
    await waitFor(() => expect(renderer.initCount).toBe(1));

    expect(screen.getByRole("button", { name: "选择对象：Fixture" })).toBeVisible();
    expect(screen.getByText(
      "通用陈设 · 陈设种类 通用陈设 · 宽度 100 mm · 深度 100 mm · 垂直高度 未设置 · Fixture · 已选择 · 可编辑",
    )).toBeVisible();
    expect(screen.getByText(
      "通用陈设 · 陈设种类 通用陈设 · 宽度 100 mm · 深度 100 mm · 垂直高度 未设置 · Locked Fixture · 未选择 · 已锁定",
    )).toBeVisible();
    expect(screen.queryByText(/Hidden Fixture/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Other Floor Fixture/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "选择对象：Locked Fixture" }));
    expect([...harness.store.getState().selectedIds]).toEqual([locked.id]);
  });
});

describe("PlanCanvas host capability boundary", () => {
  it("still initializes and reports a missing ResizeObserver through onError", async () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const harness = createPlanEditorTestHarness();
    const renderer = new FakePlanRenderer();
    const props = createPlanCanvasProps(harness, renderer);

    const view = render(<PlanCanvas {...props} />);

    await waitFor(() => expect(renderer.initCount).toBe(1));
    await waitFor(() => expect(props.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "ResizeObserver is not available." }),
    ));
    view.unmount();
    expect(renderer.destroyCount).toBe(1);
  });
});

describe("PlanCanvas plan-reference transform preview", () => {
  it("projects only the transient reference override into the renderer snapshot", async () => {
    const harness = createPlanEditorTestHarness();
    const renderer = new FakePlanRenderer();
    const reference: PlanReference = {
      id: "00000000-0000-4000-8000-000000000030",
      name: "Floor plan",
      tags: ["reference"],
      floorId: harness.floorA.id,
      layerId: harness.floorA.layers[0]!.id,
      assetId: "00000000-0000-4000-8000-000000000031",
      intrinsicSize: { width: 100, height: 100 },
      transform: {
        translation: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
      },
      opacity: 0.65,
      locked: false,
      calibration: null,
    };
    const preview: PlanReference = {
      ...reference,
      transform: {
        ...reference.transform,
        translation: { x: 20, y: 0 },
      },
    };
    const snapshot = parseSnapshotV3({
      ...harness.snapshot,
      assets: [{
        id: reference.assetId,
        sha256: "a".repeat(64),
        relativePath: `assets/sha256/aa/${"a".repeat(64)}.png`,
        mediaType: "image/png",
        size: 42,
      }],
      project: {
        ...harness.snapshot.project,
        planReferences: [reference],
      },
    });
    const props = {
      ...createPlanCanvasProps(harness, renderer),
      snapshot,
    };
    render(<PlanCanvas {...props} />);
    await waitFor(() => expect(renderer.initCount).toBe(1));
    await waitFor(() => expect(renderer.updateInputs.at(-1)?.snapshot).toBe(snapshot));

    const draft: PlanDraft = {
      kind: "reference-transform",
      origin: { x: 25, y: 25 },
      preview,
    };
    act(() => harness.store.getState().beginGesture(draft));

    await waitFor(() => expect(
      renderer.updateInputs.at(-1)?.snapshot.project.planReferences,
    ).toEqual([preview]));
    const previewInput = renderer.updateInputs.at(-1)!;
    expect(previewInput.snapshot).not.toBe(snapshot);
    expect(previewInput.snapshot.project.entities).toBe(snapshot.project.entities);
    expect(previewInput.draft).toBeNull();
    expect(previewInput.calibrationPreview).toBeNull();
    expect(snapshot.project.planReferences).toEqual([reference]);

    act(() => harness.store.getState().cancelDraft());

    await waitFor(() => expect(renderer.updateInputs.at(-1)?.snapshot).toBe(snapshot));
    expect(renderer.updateInputs.at(-1)?.snapshot.project.planReferences).toEqual([reference]);
  });
});
function taskNineWall(
  harness: ReturnType<typeof createPlanEditorTestHarness>,
  locked = false,
): Wall {
  return {
    id: "00000000-0000-4000-8000-000000000040",
    name: "North wall",
    tags: [],
    type: "wall",
    floorId: harness.floorA.id,
    layerId: harness.floorA.layers[0]!.id,
    locked,
    transform: {
      translation: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
    },
    centerLine: [{ x: -2_500, y: 0 }, { x: 2_500, y: 0 }],
    thickness: 100,
  };
}

function taskNineOpening(wall: Wall): Opening {
  return {
    id: "00000000-0000-4000-8000-000000000041",
    name: "North window",
    tags: [],
    wallId: wall.id,
    kind: "window",
    distanceAlongWall: 2_500,
    width: 1_200,
    height: 1_200,
    sillHeight: 900,
  };
}

describe("PlanCanvas Task 9 opening parity", () => {
  it("projects an opening drag preview without mutating the durable snapshot", async () => {
    const harness = createPlanEditorTestHarness();
    const renderer = new FakePlanRenderer();
    const wall = taskNineWall(harness);
    const opening = taskNineOpening(wall);
    const snapshot = parseSnapshotV3({
      ...harness.snapshot,
      project: {
        ...harness.snapshot.project,
        profile: "showroom",
        entities: [wall],
        openings: [opening],
      },
    });
    render(
      <PlanCanvas
        {...createPlanCanvasProps(harness, renderer)}
        snapshot={snapshot}
      />,
    );
    await waitFor(() => expect(renderer.initCount).toBe(1));

    const preview = { ...opening, distanceAlongWall: 3_000 };
    act(() => {
      harness.store.setState({
        draft: {
          kind: "opening-transform",
          origin: { x: 0, y: 0 },
          preview,
        },
        gestureActive: true,
      } as unknown as Partial<PlanEditorState>);
    });

    await waitFor(() => expect(
      renderer.updateInputs.at(-1)?.snapshot.project.openings,
    ).toEqual([preview]));
    expect(snapshot.project.openings).toEqual([opening]);
  });

  it("exposes opening metadata plus shared selection/delete actions and locked editability", async () => {
    const user = userEvent.setup();
    const harness = createPlanEditorTestHarness();
    const renderer = new FakePlanRenderer();
    const wall = taskNineWall(harness);
    const opening = taskNineOpening(wall);
    const snapshot = parseSnapshotV3({
      ...harness.snapshot,
      project: {
        ...harness.snapshot.project,
        profile: "showroom",
        entities: [wall],
        openings: [opening],
      },
    });
    const controller = {
      ...harness.controller,
      keyDown: vi.fn(async () => undefined),
    };
    const props = createPlanCanvasProps(harness, renderer);
    const view = render(
      <PlanCanvas
        {...props}
        snapshot={snapshot}
        controller={controller}
      />,
    );
    await waitFor(() => expect(renderer.initCount).toBe(1));

    const row = screen.getByTestId(`accessible-opening-${opening.id}`);
    expect(row).toHaveTextContent("window");
    expect(row).toHaveTextContent(opening.name);
    expect(row).toHaveTextContent(wall.name);
    expect(row).toHaveTextContent(wall.id);
    expect(row).toHaveTextContent("沿墙距离 2500 mm");
    expect(row).toHaveTextContent("1200 × 1200 mm");
    expect(row).toHaveTextContent("窗台高度 900 mm");
    expect(row).toHaveTextContent("可编辑");

    await user.click(screen.getByRole("button", {
      name: `选择门窗：${opening.name}`,
    }));
    expect([...harness.store.getState().selectedIds]).toEqual([opening.id]);

    await user.click(screen.getByRole("button", {
      name: `删除门窗：${opening.name}`,
    }));
    expect(controller.keyDown).toHaveBeenCalledWith("Delete");

    const lockedWall = taskNineWall(harness, true);
    const lockedOpening = taskNineOpening(lockedWall);
    const lockedSnapshot = parseSnapshotV3({
      ...snapshot,
      project: {
        ...snapshot.project,
        entities: [lockedWall],
        openings: [lockedOpening],
      },
    });
    view.rerender(
      <PlanCanvas
        {...props}
        snapshot={lockedSnapshot}
        controller={controller}
      />,
    );
    expect(screen.getByTestId(`accessible-opening-${lockedOpening.id}`))
      .toHaveTextContent("已锁定");
    expect(screen.getByRole("button", {
      name: `删除门窗：${lockedOpening.name}`,
    })).toBeDisabled();
  });
});

describe('PlanCanvas Task 10 product-hotspot accessible parity', function () {
  it('uses an exact keyboard coordinate and returns canvas focus', async function () {
    const user = userEvent.setup();
    const harness = createPlanEditorTestHarness();
    const renderer = new FakePlanRenderer();
    const hotspot = {
      id: '00000000-0000-4000-8000-000000000050',
      name: 'Featured product',
      tags: [],
      type: 'poi',
      kind: 'product-hotspot',
      floorId: harness.floorA.id,
      layerId: harness.floorA.layers[0]!.id,
      locked: false,
      transform: {
        translation: { x: 600, y: 400 },
        rotation: 0,
        scale: { x: 1, y: 1 },
      },
    } as const;
    const snapshot = parseSnapshotV3({
      ...harness.snapshot,
      project: {
        ...harness.snapshot.project,
        profile: 'showroom',
        entities: [...harness.snapshot.project.entities, hotspot],
        productContents: [{
          id: '00000000-0000-4000-8000-000000000051',
          name: hotspot.name,
          tags: [],
          targetEntityId: hotspot.id,
          description: '',
          mediaAssetIds: [],
        }],
      },
    });
    const controller = inputController();
    act(function () {
      harness.store.getState().setActiveTool('product-hotspot');
    });

    render(<PlanCanvas
      {...createPlanCanvasProps(harness, renderer)}
      snapshot={snapshot}
      controller={controller}
    />);
    await waitFor(function () {
      expect(renderer.initCount).toBe(1);
    });

    await user.click(screen.getByRole('button', { name: /Featured product/ }));
    expect([...harness.store.getState().selectedIds]).toEqual([hotspot.id]);
    expect(screen.getByText(/互动热点.*Featured product.*已选择/)).toBeVisible();

    const x = screen.getByLabelText('互动热点 X 坐标 (mm)');
    const y = screen.getByLabelText('互动热点 Y 坐标 (mm)');
    await user.clear(x);
    await user.type(x, '1250');
    await user.clear(y);
    await user.type(y, '-750');
    const create = screen.getByRole('button', { name: '在坐标创建互动热点' });
    create.focus();
    await user.keyboard('{Enter}');

    expect(controller.createAt).toHaveBeenCalledOnce();
    expect(controller.createAt).toHaveBeenCalledWith({ x: 1_250, y: -750 });
    expect(screen.getByRole('region', { name: '二维平面画布' })).toHaveFocus();
  });
});

describe("PlanCanvas Task 13 guided-route preview", () => {
  it("derives a resolved overlay from the current snapshot and shares route-node selection with the accessible canvas mirror", async () => {
    const harness = createPlanEditorTestHarness();
    const renderer = new FakePlanRenderer();
    const nodeA: RouteNode = {
      id: "00000000-0000-4000-8000-000000001351", name: "Arrival", tags: [],
      floorId: harness.floorA.id, position: { x: 0, y: 0 }, kind: "entrance",
    };
    const nodeB: RouteNode = {
      id: "00000000-0000-4000-8000-000000001352", name: "Centre gallery", tags: [],
      floorId: harness.floorA.id, position: { x: 100, y: 0 }, kind: "showroom-stop",
    };
    const nodeC: RouteNode = {
      id: "00000000-0000-4000-8000-000000001353", name: "Final gallery", tags: [],
      floorId: harness.floorA.id, position: { x: 200, y: 0 }, kind: "showroom-stop",
    };
    const edge = (id: string, from: string, to: string, distance: number): RouteEdge => ({
      id, name: id, tags: [], from, to, distance, bidirectional: true,
      accessible: true, enabled: true, width: 1200, weight: 1,
    });
    const network: RouteNetwork = {
      id: "00000000-0000-4000-8000-000000001354", name: "Gallery circuit", tags: [],
      nodes: [nodeA, nodeB, nodeC],
      edges: [
        edge("00000000-0000-4000-8000-000000001355", nodeA.id, nodeB.id, 100),
        edge("00000000-0000-4000-8000-000000001356", nodeB.id, nodeC.id, 100),
      ],
    };
    const route: GuidedRoute = {
      id: "00000000-0000-4000-8000-000000001357", name: "Showroom visit", tags: [],
      routeNetworkId: network.id, stopNodeIds: [nodeA.id, nodeC.id],
    };
    const snapshot = parseSnapshotV3({
      ...harness.snapshot,
      project: {
        ...harness.snapshot.project,
        profile: "showroom",
        routeNetworks: [network],
        guidedRoutes: [route],
      },
    });
    act(() => {
      const state = harness.store.getState();
      state.setActiveTool("route-node");
      state.setActiveRouteNetwork({
        sessionId: state.sessionId, floorId: harness.floorA.id,
        networkId: null, tool: "route-node",
      }, network.id);
      state.setRouteStopDraft({
        sessionId: state.sessionId, floorId: harness.floorA.id,
        networkId: network.id, tool: "route-node",
      }, route.stopNodeIds);
    });

    render(<PlanCanvas {...createPlanCanvasProps(harness, renderer)} snapshot={snapshot} />);
    await waitFor(() => expect(renderer.updateInputs.at(-1)?.resolvedRoute).toEqual({
      nodeIds: [nodeA.id, nodeB.id, nodeC.id],
      edgeIds: [
        "00000000-0000-4000-8000-000000001355",
        "00000000-0000-4000-8000-000000001356",
      ],
      totalDistance: 200,
      turnPoints: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
    }));

    const canvas = screen.getByRole("region", { name: "二维平面画布" });
    await userEvent.click(within(canvas).getByRole("button", {
      name: "选择路线节点：Centre gallery",
    }));
    expect([...harness.store.getState().selectedIds]).toEqual([nodeB.id]);
  });

  it("does not fall back to saved stops when an active guided-route draft is empty", async () => {
    const harness = createPlanEditorTestHarness();
    const renderer = new FakePlanRenderer();
    const entrance: RouteNode = {
      id: "00000000-0000-4000-8000-000000001361", name: "Arrival", tags: [],
      floorId: harness.floorA.id, position: { x: 0, y: 0 }, kind: "entrance",
    };
    const gallery: RouteNode = {
      id: "00000000-0000-4000-8000-000000001362", name: "Gallery", tags: [],
      floorId: harness.floorA.id, position: { x: 100, y: 0 }, kind: "showroom-stop",
    };
    const network: RouteNetwork = {
      id: "00000000-0000-4000-8000-000000001363", name: "Saved circuit", tags: [],
      nodes: [entrance, gallery],
      edges: [{
        id: "00000000-0000-4000-8000-000000001364", name: "arrival edge", tags: [],
        from: entrance.id, to: gallery.id, distance: 100, bidirectional: true,
        accessible: true, enabled: true, width: 1200, weight: 1,
      }],
    };
    const route: GuidedRoute = {
      id: "00000000-0000-4000-8000-000000001365", name: "Saved route", tags: [],
      routeNetworkId: network.id, stopNodeIds: [entrance.id, gallery.id],
    };
    const snapshot = parseSnapshotV3({
      ...harness.snapshot,
      project: {
        ...harness.snapshot.project, profile: "showroom",
        routeNetworks: [network], guidedRoutes: [route],
      },
    });
    act(() => {
      const state = harness.store.getState();
      state.setActiveTool("route-node");
      state.setActiveRouteNetwork({
        sessionId: state.sessionId, floorId: harness.floorA.id,
        networkId: null, tool: "route-node",
      }, network.id);
      state.setRouteStopDraft({
        sessionId: state.sessionId, floorId: harness.floorA.id,
        networkId: network.id, tool: "route-node",
      }, []);
    });

    render(<PlanCanvas
      {...createPlanCanvasProps(harness, renderer)}
      snapshot={snapshot}
      guidedRouteDraftActive
    />);
    await waitFor(() => expect(renderer.updateInputs.at(-1)?.resolvedRoute).toBeNull());
  });

  it("uses the current saved route instead of a non-empty stale draft after the route panel closes", async () => {
    const harness = createPlanEditorTestHarness();
    const renderer = new FakePlanRenderer();
    const arrival: RouteNode = {
      id: "00000000-0000-4000-8000-000000001366", name: "Arrival", tags: [],
      floorId: harness.floorA.id, position: { x: 0, y: 0 }, kind: "entrance",
    };
    const savedStop: RouteNode = {
      id: "00000000-0000-4000-8000-000000001367", name: "Saved stop", tags: [],
      floorId: harness.floorA.id, position: { x: 100, y: 0 }, kind: "showroom-stop",
    };
    const staleStop: RouteNode = {
      id: "00000000-0000-4000-8000-000000001368", name: "Stale stop", tags: [],
      floorId: harness.floorA.id, position: { x: 200, y: 0 }, kind: "showroom-stop",
    };
    const network: RouteNetwork = {
      id: "00000000-0000-4000-8000-000000001369", name: "Overlay circuit", tags: [],
      nodes: [arrival, savedStop, staleStop],
      edges: [
        {
          id: "00000000-0000-4000-8000-000000001370", name: "saved edge", tags: [],
          from: arrival.id, to: savedStop.id, distance: 100, bidirectional: true,
          accessible: true, enabled: true, width: 1200, weight: 1,
        },
        {
          id: "00000000-0000-4000-8000-000000001371", name: "stale edge", tags: [],
          from: savedStop.id, to: staleStop.id, distance: 100, bidirectional: true,
          accessible: true, enabled: true, width: 1200, weight: 1,
        },
      ],
    };
    const route: GuidedRoute = {
      id: "00000000-0000-4000-8000-000000001372", name: "Saved overlay", tags: [],
      routeNetworkId: network.id, stopNodeIds: [arrival.id, savedStop.id],
    };
    const snapshot = parseSnapshotV3({
      ...harness.snapshot,
      project: {
        ...harness.snapshot.project, profile: "showroom",
        routeNetworks: [network], guidedRoutes: [route],
      },
    });
    act(() => {
      const state = harness.store.getState();
      state.setActiveTool("route-node");
      state.setActiveRouteNetwork({
        sessionId: state.sessionId, floorId: harness.floorA.id,
        networkId: null, tool: "route-node",
      }, network.id);
      state.setRouteStopDraft({
        sessionId: state.sessionId, floorId: harness.floorA.id,
        networkId: network.id, tool: "route-node",
      }, [arrival.id, staleStop.id]);
    });

    render(<PlanCanvas
      {...createPlanCanvasProps(harness, renderer)}
      snapshot={snapshot}
      guidedRouteDraftActive={false}
    />);
    await waitFor(() => expect(renderer.updateInputs.at(-1)?.resolvedRoute).toMatchObject({
      nodeIds: [arrival.id, savedStop.id],
      totalDistance: 100,
    }));
  });
});
