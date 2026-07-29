// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { parseSnapshotV3, type PlanReference } from "@aethertwin/core-model";
import type {
  PlanAssetSourcePort,
  PlanPointerEvent,
} from "@aethertwin/render-plan-2d";
import {
  act, cleanup, fireEvent, render, screen, waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanCanvas } from "./plan-canvas";
import type { PlanDraft } from "./editor-session";
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
    });
    await waitFor(() => expect(
      renderer.updateInputs.at(-1)?.selectedIds.has(harness.fixture.id),
    ).toBe(true));
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
    expect(screen.getByText("fixture · Fixture · 已选择 · 可编辑")).toBeVisible();
    expect(screen.getByText("fixture · Locked Fixture · 未选择 · 已锁定")).toBeVisible();
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
