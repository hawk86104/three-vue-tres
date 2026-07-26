import {
  createInitialSnapshot,
  parseSnapshotV3,
  type Fixture,
  type Floor,
} from "@aethertwin/core-model";
import { describe, expect, it } from "vitest";
import * as pixiRendererModule from "./pixi-plan-renderer";
import { PixiPlanRenderer } from "./pixi-plan-renderer";
import type {
  PlanPointerEvent,
  PlanRenderPort,
  PlanRendererEventSink,
  PlanRendererInput,
  RenderNode,
} from "./types";

const uuid = (value: number): string => (
  `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`
);
const ids = [1, 2, 3].map(uuid);
const base = createInitialSnapshot({
  name: "Render",
  profile: "market",
  uuid: () => ids.shift()!,
});
const floorA = base.project.floors[0]!;
const floorB: Floor = {
  id: uuid(4),
  name: "Floor B",
  tags: [],
  layers: [{ id: uuid(5), name: "Default", tags: [], visible: true, locked: false }],
};
const viewport = {
  width: 800,
  height: 600,
  center: { x: 0, y: 0 },
  pixelsPerMillimetre: 1,
};

function fixtureAt(id: string, floor: Floor, x: number): Fixture {
  return {
    type: "fixture",
    id,
    name: id,
    tags: [],
    floorId: floor.id,
    layerId: floor.layers[0]!.id,
    locked: false,
    transform: { translation: { x, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
    kind: "generic",
    size: { width: 100, height: 100 },
  };
}

const visibleFixture = fixtureAt(uuid(10), floorA, 0);
const floorBFixture = fixtureAt(uuid(11), floorB, 0);
const snapshot = parseSnapshotV3({
  ...base,
  project: {
    ...base.project,
    floors: [floorA, floorB],
    entities: [visibleFixture, floorBFixture],
  },
});

function rendererInput(): PlanRendererInput {
  return {
    snapshot,
    activeFloorId: floorA.id,
    viewport,
    selectedIds: new Set<string>(),
    draft: null,
  };
}

class FakePlanRenderPort implements PlanRenderPort {
  readonly upsertedNodes: RenderNode[] = [];
  readonly removedKeys: string[] = [];
  readonly resizeCalls: Array<readonly [number, number, number]> = [];
  initCalls = 0;
  renderCalls = 0;
  destroyCalls = 0;
  initGate: Promise<void> = Promise.resolve();

  async init(_host: HTMLElement, _sink: PlanRendererEventSink): Promise<void> {
    this.initCalls += 1;
    await this.initGate;
  }

  upsert(node: RenderNode): void {
    this.upsertedNodes.push(node);
  }

  remove(key: string): void {
    this.removedKeys.push(key);
  }

  resize(width: number, height: number, resolution: number): void {
    this.resizeCalls.push([width, height, resolution]);
  }

  render(): void {
    this.renderCalls += 1;
  }

  destroy(): void {
    this.destroyCalls += 1;
  }
}

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

interface TestPointerInputBridge {
  pointerDown(event: PlanPointerEvent): void;
  globalPointerMove(event: PlanPointerEvent): void;
  pointerUp(event: PlanPointerEvent): void;
  pointerCancel(event: PlanPointerEvent): void;
  destroy(): void;
}

interface TestNativePointerCancelEvent {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly buttons: number;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

interface TestNativePointerCancelSource {
  listen(listener: (event: TestNativePointerCancelEvent) => void): () => void;
  mapClientToScreen(clientX: number, clientY: number): { readonly x: number; readonly y: number };
}

class NativePointerCancelSource implements TestNativePointerCancelSource {
  #listener: ((event: TestNativePointerCancelEvent) => void) | null = null;
  cleanupCalls = 0;

  listen(listener: (event: TestNativePointerCancelEvent) => void): () => void {
    this.#listener = listener;
    return () => {
      this.cleanupCalls += 1;
      this.#listener = null;
    };
  }

  mapClientToScreen(clientX: number, clientY: number): { readonly x: number; readonly y: number } {
    return { x: clientX - 10, y: clientY - 20 };
  }

  dispatch(event: TestNativePointerCancelEvent): void {
    this.#listener?.(event);
  }
}

type PointerInputBridgeFactory = (
  bounds: { contains(x: number, y: number): boolean },
  sink: PlanRendererEventSink,
  nativePointerCancel?: TestNativePointerCancelSource,
) => TestPointerInputBridge;

function pointerInputBridge(
  bounds: { contains(x: number, y: number): boolean },
  sink: PlanRendererEventSink,
  nativePointerCancel?: TestNativePointerCancelSource,
): TestPointerInputBridge {
  const factory = (pixiRendererModule as unknown as {
    createPointerInputBridge?: PointerInputBridgeFactory;
  }).createPointerInputBridge;
  if (factory === undefined) throw new Error("createPointerInputBridge is not implemented");
  return factory(bounds, sink, nativePointerCancel);
}

function planPointerEvent(
  type: PlanPointerEvent["type"],
  pointerId: number,
  x: number,
  y: number,
): PlanPointerEvent {
  return {
    type,
    pointerId,
    screen: { x, y },
    buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  };
}

const interactionBounds = {
  contains: (x: number, y: number): boolean => x >= 0 && x <= 100 && y >= 0 && y <= 100,
};

describe("PixiPlanRenderer", () => {
  it("forwards idle global pointer moves inside its interaction bounds", () => {
    const events: PlanPointerEvent[] = [];
    const bridge = pointerInputBridge(interactionBounds, { handle: (event) => events.push(event) });

    bridge.globalPointerMove(planPointerEvent("pointermove", 7, 50, 50));

    expect(events.map((event) => event.type)).toEqual(["pointermove"]);
  });

  it("ignores idle global pointer moves outside its interaction bounds", () => {
    const events: PlanPointerEvent[] = [];
    const bridge = pointerInputBridge(interactionBounds, { handle: (event) => events.push(event) });

    bridge.globalPointerMove(planPointerEvent("pointermove", 7, 150, 50));

    expect(events).toEqual([]);
  });

  it("forwards an active drag after it leaves its interaction bounds", () => {
    const events: PlanPointerEvent[] = [];
    const bridge = pointerInputBridge(interactionBounds, { handle: (event) => events.push(event) });
    bridge.pointerDown(planPointerEvent("pointerdown", 7, 50, 50));
    events.length = 0;

    bridge.globalPointerMove(planPointerEvent("pointermove", 7, 150, 50));

    expect(events.map((event) => event.type)).toEqual(["pointermove"]);
  });

  it("stops forwarding outside moves after pointer up or cancellation", () => {
    const events: PlanPointerEvent[] = [];
    const bridge = pointerInputBridge(interactionBounds, { handle: (event) => events.push(event) });
    bridge.pointerDown(planPointerEvent("pointerdown", 7, 50, 50));
    bridge.pointerUp(planPointerEvent("pointerup", 7, 150, 50));
    bridge.globalPointerMove(planPointerEvent("pointermove", 7, 150, 50));
    bridge.pointerDown(planPointerEvent("pointerdown", 8, 50, 50));
    bridge.pointerCancel(planPointerEvent("pointercancel", 8, 150, 50));
    bridge.globalPointerMove(planPointerEvent("pointermove", 8, 150, 50));

    expect(events.map((event) => event.type)).toEqual([
      "pointerdown",
      "pointerup",
      "pointerdown",
      "pointercancel",
    ]);
  });

  it("maps an active native pointer cancellation to one plan event", () => {
    const events: PlanPointerEvent[] = [];
    const nativePointerCancel = new NativePointerCancelSource();
    const bridge = pointerInputBridge(
      interactionBounds,
      { handle: (event) => events.push(event) },
      nativePointerCancel,
    );
    bridge.pointerDown(planPointerEvent("pointerdown", 9, 50, 50));
    events.length = 0;
    const cancellation: TestNativePointerCancelEvent = {
      pointerId: 9,
      clientX: 42,
      clientY: 55,
      buttons: 0,
      shiftKey: true,
      altKey: false,
      ctrlKey: true,
      metaKey: false,
    };

    nativePointerCancel.dispatch(cancellation);
    bridge.pointerCancel(planPointerEvent("pointercancel", 9, 32, 35));
    bridge.globalPointerMove(planPointerEvent("pointermove", 9, 150, 50));

    expect(events).toEqual([{
      type: "pointercancel",
      pointerId: 9,
      screen: { x: 32, y: 35 },
      buttons: 0,
      shiftKey: true,
      altKey: false,
      ctrlKey: true,
      metaKey: false,
    }]);
  });

  it("removes its native cancellation listener exactly once on teardown", () => {
    const events: PlanPointerEvent[] = [];
    const nativePointerCancel = new NativePointerCancelSource();
    const bridge = pointerInputBridge(
      interactionBounds,
      { handle: (event) => events.push(event) },
      nativePointerCancel,
    );
    bridge.pointerDown(planPointerEvent("pointerdown", 9, 50, 50));
    events.length = 0;

    bridge.destroy();
    bridge.destroy();
    nativePointerCancel.dispatch({
      pointerId: 9,
      clientX: 42,
      clientY: 55,
      buttons: 0,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
    });

    expect(nativePointerCancel.cleanupCalls).toBe(1);
    expect(events).toEqual([]);
  });

  it("shares one pending initialization across concurrent callers", async () => {
    const gate = deferred();
    const port = new FakePlanRenderPort();
    port.initGate = gate.promise;
    const renderer = new PixiPlanRenderer(() => port);

    const first = renderer.init({} as HTMLElement, { handle: () => undefined });
    const second = renderer.init({} as HTMLElement, { handle: () => undefined });

    expect(port.initCalls).toBe(1);
    gate.resolve();
    await Promise.all([first, second]);
  });

  it("keeps teardown terminal while initialization is pending", async () => {
    const gate = deferred();
    const port = new FakePlanRenderPort();
    port.initGate = gate.promise;
    const renderer = new PixiPlanRenderer(() => port);

    const initialization = renderer.init({} as HTMLElement, { handle: () => undefined });
    renderer.destroy();
    gate.resolve();
    await initialization;

    expect(port.destroyCalls).toBe(1);
    expect(() => renderer.update(rendererInput())).toThrow("Plan renderer is not active.");
  });

  it("upserts changed projections only and renders on dirty updates", async () => {
    const port = new FakePlanRenderPort();
    const renderer = new PixiPlanRenderer(() => port);
    const input = rendererInput();

    await renderer.init({} as HTMLElement, { handle: () => undefined });
    renderer.update(input);
    const firstUpsertCount = port.upsertedNodes.length;

    renderer.update(input);

    expect(port.initCalls).toBe(1);
    expect(firstUpsertCount).toBeGreaterThan(0);
    expect(port.upsertedNodes).toHaveLength(firstUpsertCount);
    expect(port.renderCalls).toBe(1);
  });

  it("removes stale display objects through the render port", async () => {
    const port = new FakePlanRenderPort();
    const renderer = new PixiPlanRenderer(() => port);
    const inputWithFixture = rendererInput();
    const inputWithoutFixture: PlanRendererInput = {
      ...inputWithFixture,
      snapshot: parseSnapshotV3({
        ...snapshot,
        project: { ...snapshot.project, entities: [floorBFixture] },
      }),
    };

    await renderer.init({} as HTMLElement, { handle: () => undefined });
    renderer.update(inputWithFixture);
    renderer.update(inputWithoutFixture);

    expect(port.removedKeys).toEqual([visibleFixture.id]);
    expect(port.renderCalls).toBe(2);
  });

  it("forwards resize as a dirty render and destroys its port once", async () => {
    const port = new FakePlanRenderPort();
    const renderer = new PixiPlanRenderer(() => port);

    await renderer.init({} as HTMLElement, { handle: () => undefined });
    renderer.resize(640, 480, 2);
    renderer.destroy();
    renderer.destroy();

    expect(port.resizeCalls).toEqual([[640, 480, 2]]);
    expect(port.renderCalls).toBe(1);
    expect(port.destroyCalls).toBe(1);
  });
});
