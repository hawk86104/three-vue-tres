// @vitest-environment jsdom

import {
  createInitialSnapshot,
  parseSnapshotV3,
  type AssetRecord,
  type Fixture,
  type Floor,
  type PlanReference,
} from "@aethertwin/core-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as pixiRendererModule from "./pixi-plan-renderer";
import { PixiPlanRenderer } from "./pixi-plan-renderer";
import type {
  PlanAssetSourcePort,
  PlanPointerEvent,
  PlanRenderPort,
  PlanRenderPortFactory,
  PlanRendererEventSink,
  PlanRendererInput,
  ProjectAssetSource,
  RenderNode,
} from "./types";

const pixiHarness = vi.hoisted(() => {
  class TestContainer {
    readonly label: string;
    readonly children: TestContainer[] = [];
    parent: TestContainer | null = null;
    alpha = 1;
    destroyed = false;
    destroyedWhileParented = false;

    constructor(options: { readonly label?: string } = {}) {
      this.label = options.label ?? "";
    }

    addChild(...children: TestContainer[]): void {
      for (const child of children) {
        child.removeFromParent();
        child.parent = this;
        this.children.push(child);
      }
    }

    setChildIndex(child: TestContainer, index: number): void {
      const current = this.children.indexOf(child);
      if (current < 0) return;
      this.children.splice(current, 1);
      this.children.splice(index, 0, child);
    }

    removeFromParent(): void {
      if (this.parent === null) return;
      const index = this.parent.children.indexOf(this);
      if (index >= 0) this.parent.children.splice(index, 1);
      this.parent = null;
    }

    on(): this {
      return this;
    }

    destroy(options?: { readonly children?: boolean }): void {
      this.destroyedWhileParented ||= this.parent !== null;
      this.removeFromParent();
      if (options?.children) {
        for (const child of [...this.children]) child.destroy(options);
      }
      this.destroyed = true;
    }
  }

  class TestGraphics extends TestContainer {
    readonly commands: Array<{ readonly method: string; readonly args: readonly unknown[] }> = [];
    clear(): this { this.commands.length = 0; return this; }
    poly(...args: readonly unknown[]): this { this.commands.push({ method: "poly", args }); return this; }
    fill(...args: readonly unknown[]): this { this.commands.push({ method: "fill", args }); return this; }
    stroke(...args: readonly unknown[]): this { this.commands.push({ method: "stroke", args }); return this; }
    moveTo(...args: readonly unknown[]): this { this.commands.push({ method: "moveTo", args }); return this; }
    lineTo(...args: readonly unknown[]): this { this.commands.push({ method: "lineTo", args }); return this; }
    closePath(...args: readonly unknown[]): this { this.commands.push({ method: "closePath", args }); return this; }
    circle(...args: readonly unknown[]): this { this.commands.push({ method: "circle", args }); return this; }
    arc(...args: readonly unknown[]): this { this.commands.push({ method: "arc", args }); return this; }
  }

  class TestTexture {
    destroyCalls = 0;
    readonly width = 100;
    readonly height = 50;
    destroy(): void { this.destroyCalls += 1; }
  }

  class TestSprite extends TestContainer {
    alpha = 1;
    x = 0;
    y = 0;
    rotation = 0;
    readonly position = { set: (x: number, y: number) => {
      this.x = x;
      this.y = y;
    } };
    readonly scale = { x: 1, y: 1, set: (x: number, y: number) => {
      this.scale.x = x;
      this.scale.y = y;
    } };
    readonly texture: TestTexture;

    constructor(options: { readonly label?: string; readonly texture: TestTexture }) {
      super(options);
      this.texture = options.texture;
    }
  }

  class TestRectangle {
    constructor(
      public x = 0,
      public y = 0,
      public width = 0,
      public height = 0,
    ) {}
    contains(x: number, y: number): boolean {
      return x >= this.x && x <= this.x + this.width
        && y >= this.y && y <= this.y + this.height;
    }
  }

  class TestApplication {
    static readonly instances: TestApplication[] = [];
    static initGate: Promise<void> = Promise.resolve();
    readonly stage = new TestContainer({ label: "stage" });
    readonly canvas = document.createElement("canvas");
    readonly renderer = {
      resize: vi.fn(),
      events: { mapPositionToPoint: vi.fn() },
    };
    readonly render = vi.fn();
    readonly destroy = vi.fn();

    constructor() {
      TestApplication.instances.push(this);
    }

    async init(): Promise<void> { await TestApplication.initGate; }
  }

  const load = vi.fn<(url: string) => Promise<TestTexture>>();
  const unload = vi.fn<(url: string) => Promise<void>>();
  return {
    TestApplication,
    TestContainer,
    TestGraphics,
    TestRectangle,
    TestSprite,
    TestTexture,
    load,
    unload,
  };
});

vi.mock("pixi.js", () => ({
  Application: pixiHarness.TestApplication,
  Assets: { load: pixiHarness.load, unload: pixiHarness.unload },
  Container: pixiHarness.TestContainer,
  Graphics: pixiHarness.TestGraphics,
  Rectangle: pixiHarness.TestRectangle,
  Sprite: pixiHarness.TestSprite,
}));

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
    calibrationPreview: null,
  };
}

const rendererAssetId = uuid(20);
const rendererReference: PlanReference = {
  id: uuid(21),
  name: "Reloadable reference",
  tags: [],
  floorId: floorA.id,
  layerId: floorA.layers[0]!.id,
  assetId: rendererAssetId,
  intrinsicSize: { width: 200, height: 100 },
  transform: {
    translation: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
  },
  opacity: 0.8,
  locked: false,
  calibration: null,
};
const rendererAsset: AssetRecord = {
  id: rendererAssetId,
  sha256: "a".repeat(64),
  relativePath: `assets/sha256/aa/${"a".repeat(64)}.png`,
  mediaType: "image/png",
  size: 42,
};

function rendererInputWithReference(): PlanRendererInput {
  return {
    ...rendererInput(),
    snapshot: parseSnapshotV3({
      ...snapshot,
      project: {
        ...snapshot.project,
        planReferences: [rendererReference],
      },
      assets: [rendererAsset],
    }),
  };
}

class FakePlanRenderPort implements PlanRenderPort {
  readonly upsertedNodes: RenderNode[] = [];
  readonly removedKeys: string[] = [];
  readonly invalidatedAssetIds: string[] = [];
  readonly resizeCalls: Array<readonly [number, number, number]> = [];
  initCalls = 0;
  renderCalls = 0;
  destroyCalls = 0;
  initGate: Promise<void> = Promise.resolve();

  async init(host: HTMLElement, sink: PlanRendererEventSink): Promise<void> {
    void host;
    void sink;
    this.initCalls += 1;
    await this.initGate;
  }

  upsert(node: RenderNode): void {
    this.upsertedNodes.push(node);
  }

  remove(key: string): void {
    this.removedKeys.push(key);
  }

  invalidateAsset(assetId: string): void {
    this.invalidatedAssetIds.push(assetId);
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

function legacyPlanRenderPort(): PlanRenderPort {
  return {
    init: async () => undefined,
    upsert: () => undefined,
    remove: () => undefined,
    resize: () => undefined,
    render: () => undefined,
    destroy: () => undefined,
  };
}

function deferred<T = void>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function imageNode(
  key: string,
  assetId: string,
  corners: readonly [
    { readonly x: number; readonly y: number },
    { readonly x: number; readonly y: number },
    { readonly x: number; readonly y: number },
    { readonly x: number; readonly y: number },
  ] = [
    { x: 10, y: 20 },
    { x: 210, y: 20 },
    { x: 210, y: 120 },
    { x: 10, y: 120 },
  ],
  locked = false,
): RenderNode {
  const xs = corners.map(({ x }) => x);
  const ys = corners.map(({ y }) => y);
  return {
    key,
    entityId: key,
    layer: "reference",
    geometry: { kind: "image", assetId, corners, opacity: 0.4 },
    bounds: {
      min: { x: Math.min(...xs), y: Math.min(...ys) },
      max: { x: Math.max(...xs), y: Math.max(...ys) },
    },
    styleToken: "plan-reference",
    selected: false,
    locked,
  };
}

function projectAssetSource(assetId: string): ProjectAssetSource {
  return {
    assetId,
    url: `blob:aethertwin/${assetId}`,
    mediaType: "image/png",
  };
}

function latestApplication(): InstanceType<typeof pixiHarness.TestApplication> {
  const application = pixiHarness.TestApplication.instances.at(-1);
  if (application === undefined) throw new Error("Pixi application was not initialized");
  return application;
}

function referenceLayer(): InstanceType<typeof pixiHarness.TestContainer> {
  const layer = latestApplication().stage.children.find(({ label }) => label === "reference");
  if (layer === undefined) throw new Error("Reference layer was not created");
  return layer;
}

async function settleResources(): Promise<void> {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
}

function installSharedFakeAssetCache(
  loadTexture: (url: string) => Promise<InstanceType<typeof pixiHarness.TestTexture>>,
  retireUrl: (url: string) => Promise<void> = async () => undefined,
) {
  const cache = new Map<string, Promise<InstanceType<typeof pixiHarness.TestTexture>>>();
  const sourceLoads = vi.fn(loadTexture);
  const retire = vi.fn(async (url: string) => {
    await retireUrl(url);
    const pending = cache.get(url);
    if (pending === undefined) return;
    const texture = await pending;
    cache.delete(url);
    texture.destroy();
  });
  pixiHarness.load.mockImplementation((url) => {
    const cached = cache.get(url);
    if (cached !== undefined) return cached;
    const pending = sourceLoads(url);
    cache.set(url, pending);
    return pending;
  });
  pixiHarness.unload.mockImplementation(retire);
  return { sourceLoads, retire };
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

beforeEach(() => {
  pixiHarness.TestApplication.instances.length = 0;
  pixiHarness.TestApplication.initGate = Promise.resolve();
  pixiHarness.load.mockReset();
  pixiHarness.unload.mockReset();
});

const unusedSourcePort: PlanAssetSourcePort = {
  resolve: async (assetId) => projectAssetSource(assetId),
};

describe('Pixi resource ownership compatibility', () => {
  it('releases Pixi global resources only after the final render port exits', async () => {
    const firstPort = pixiRendererModule.createPixiRenderPort(unusedSourcePort);
    const secondPort = pixiRendererModule.createPixiRenderPort(unusedSourcePort);
    await firstPort.init(document.createElement('div'), { handle: () => undefined });
    const firstApplication = latestApplication();
    await secondPort.init(document.createElement('div'), { handle: () => undefined });
    const secondApplication = latestApplication();
    firstPort.destroy();
    await settleResources();
    expect(firstApplication.destroy).toHaveBeenCalledWith(
      { removeView: true },
      { children: true, texture: false, textureSource: false },
    );
    expect(secondApplication.destroy).not.toHaveBeenCalled();
    secondPort.destroy();
    await vi.waitFor(() => expect(secondApplication.destroy).toHaveBeenCalledOnce());
    expect(secondApplication.destroy).toHaveBeenCalledWith(
      { removeView: true, releaseGlobalResources: true },
      { children: true, texture: false, textureSource: false },
    );
  });

  it('keeps the legacy no-source port and factory surfaces callable', async () => {
    const directPort = pixiRendererModule.createPixiRenderPort();
    await directPort.init(document.createElement('div'), { handle: () => undefined });
    directPort.destroy();
    const legacyFactory: PlanRenderPortFactory = () => legacyPlanRenderPort();
    const legacyPort = legacyFactory();
    await legacyPort.init({} as HTMLElement, { handle: () => undefined });
    legacyPort.destroy();
    const renderer = new PixiPlanRenderer(legacyFactory);
    await renderer.init({} as HTMLElement, { handle: () => undefined });
    renderer.destroy();
  });

  it('removes an invalidated reference when the next projection omits it', async () => {
    const port = new FakePlanRenderPort();
    const renderer = new PixiPlanRenderer(unusedSourcePort, () => port);
    await renderer.init({} as HTMLElement, { handle: () => undefined });
    renderer.update(rendererInputWithReference());
    renderer.invalidateAsset(rendererAssetId);
    renderer.update(rendererInput());
    expect(port.invalidatedAssetIds).toEqual([rendererAssetId]);
    expect(port.removedKeys).toEqual([rendererReference.id]);
  });

  it('reserves global resources while a newer render port is still initializing', async () => {
    const firstPort = pixiRendererModule.createPixiRenderPort(unusedSourcePort);
    await firstPort.init(document.createElement('div'), { handle: () => undefined });
    const firstApplication = latestApplication();
    const initGate = deferred();
    pixiHarness.TestApplication.initGate = initGate.promise;
    const secondPort = pixiRendererModule.createPixiRenderPort(unusedSourcePort);
    const secondInitialization = secondPort.init(
      document.createElement('div'),
      { handle: () => undefined },
    );
    await settleResources();
    const secondApplication = latestApplication();

    firstPort.destroy();
    await settleResources();
    expect(firstApplication.destroy).toHaveBeenCalledWith(
      { removeView: true },
      { children: true, texture: false, textureSource: false },
    );
    secondPort.destroy();
    initGate.resolve();
    await secondInitialization;
    await vi.waitFor(() => expect(secondApplication.destroy).toHaveBeenCalledOnce());
    expect(secondApplication.destroy).toHaveBeenCalledWith(
      { removeView: true, releaseGlobalResources: true },
      { children: true, texture: false, textureSource: false },
    );
  });

  it('waits for retirement and rejects stale final-port global cleanup', async () => {
    const retirementGate = deferred();
    const texture = new pixiHarness.TestTexture();
    installSharedFakeAssetCache(
      async () => texture,
      async () => retirementGate.promise,
    );
    const sourcePort: PlanAssetSourcePort = {
      resolve: async (assetId) => ({
        assetId,
        url: 'blob:aethertwin/generation-retirement',
        mediaType: 'image/png',
      }),
    };
    const firstPort = pixiRendererModule.createPixiRenderPort(sourcePort);
    await firstPort.init(document.createElement('div'), { handle: () => undefined });
    const firstApplication = latestApplication();
    firstPort.upsert(imageNode('generation-reference', 'generation-asset'));
    await settleResources();
    firstPort.destroy();
    await settleResources();
    expect(firstApplication.destroy).not.toHaveBeenCalled();

    const secondPort = pixiRendererModule.createPixiRenderPort(unusedSourcePort);
    await secondPort.init(document.createElement('div'), { handle: () => undefined });
    const secondApplication = latestApplication();
    retirementGate.resolve();
    await vi.waitFor(() => expect(firstApplication.destroy).toHaveBeenCalledOnce());
    expect(firstApplication.destroy).toHaveBeenCalledWith(
      { removeView: true },
      { children: true, texture: false, textureSource: false },
    );
    secondPort.destroy();
    await vi.waitFor(() => expect(secondApplication.destroy).toHaveBeenCalledOnce());
    expect(secondApplication.destroy).toHaveBeenCalledWith(
      { removeView: true, releaseGlobalResources: true },
      { children: true, texture: false, textureSource: false },
    );
  });

  it('waits for older retirement before failed initialization releases globals', async () => {
    const retirementGate = deferred();
    const texture = new pixiHarness.TestTexture();
    installSharedFakeAssetCache(
      async () => texture,
      async () => retirementGate.promise,
    );
    const sourcePort: PlanAssetSourcePort = {
      resolve: async (assetId) => ({
        assetId,
        url: 'blob:aethertwin/rejected-init-retirement',
        mediaType: 'image/png',
      }),
    };
    const firstPort = pixiRendererModule.createPixiRenderPort(sourcePort);
    await firstPort.init(document.createElement('div'), { handle: () => undefined });
    const firstApplication = latestApplication();
    firstPort.upsert(imageNode('rejected-init-reference', 'rejected-init-asset'));
    await settleResources();
    firstPort.destroy();
    await settleResources();
    expect(firstApplication.destroy).not.toHaveBeenCalled();

    const failure = new Error('Pixi initialization rejected');
    let rejectInitialization!: (error: unknown) => void;
    pixiHarness.TestApplication.initGate = new Promise<void>((_resolve, reject) => {
      rejectInitialization = reject;
    });
    const secondPort = pixiRendererModule.createPixiRenderPort(unusedSourcePort);
    const secondInitialization = secondPort.init(
      document.createElement('div'),
      { handle: () => undefined },
    );
    await settleResources();
    const secondApplication = latestApplication();
    rejectInitialization(failure);
    await expect(secondInitialization).rejects.toBe(failure);
    await settleResources();
    expect(secondApplication.destroy).not.toHaveBeenCalled();

    retirementGate.resolve();
    await vi.waitFor(() => expect(secondApplication.destroy).toHaveBeenCalledOnce());
    expect(secondApplication.destroy).toHaveBeenCalledWith(
      { removeView: true, releaseGlobalResources: true },
      { children: true, texture: false, textureSource: false },
    );
    expect(firstApplication.destroy).toHaveBeenCalledWith(
      { removeView: true },
      { children: true, texture: false, textureSource: false },
    );
  });
});

describe("Pixi reference resources", () => {
  it("leases one cached URL across different asset IDs in the same render port", async () => {
    const texture = new pixiHarness.TestTexture();
    const sharedUrl = "blob:aethertwin/shared-floor-plan";
    const cache = installSharedFakeAssetCache(async () => texture);
    const sourcePort: PlanAssetSourcePort = {
      resolve: async (assetId) => ({ assetId, url: sharedUrl, mediaType: "image/png" }),
    };
    const port = pixiRendererModule.createPixiRenderPort(sourcePort);
    await port.init(document.createElement("div"), { handle: () => undefined });

    port.upsert(imageNode("reference-a", "asset-a"));
    port.upsert(imageNode("reference-b", "asset-b"));
    await settleResources();

    expect(pixiHarness.load).toHaveBeenCalledOnce();
    expect(cache.sourceLoads).toHaveBeenCalledOnce();
    expect(referenceLayer().children).toHaveLength(2);
    const sprites = referenceLayer().children as InstanceType<typeof pixiHarness.TestSprite>[];
    expect(sprites.map(({ texture: loaded }) => loaded)).toEqual([texture, texture]);

    port.remove("reference-a");
    await settleResources();
    expect(pixiHarness.unload).not.toHaveBeenCalled();
    port.remove("reference-b");
    await settleResources();
    expect(pixiHarness.unload).toHaveBeenCalledOnce();
    expect(cache.retire).toHaveBeenCalledWith(sharedUrl);
    expect(texture.destroyCalls).toBe(1);
  });

  it("leases one cached URL across independent render ports", async () => {
    const texture = new pixiHarness.TestTexture();
    const sharedUrl = "blob:aethertwin/shared-across-ports";
    const cache = installSharedFakeAssetCache(async () => texture);
    const sourcePort: PlanAssetSourcePort = {
      resolve: async (assetId) => ({ assetId, url: sharedUrl, mediaType: "image/png" }),
    };
    const firstPort = pixiRendererModule.createPixiRenderPort(sourcePort);
    const secondPort = pixiRendererModule.createPixiRenderPort(sourcePort);
    await firstPort.init(document.createElement("div"), { handle: () => undefined });
    await secondPort.init(document.createElement("div"), { handle: () => undefined });

    firstPort.upsert(imageNode("first-reference", "first-asset"));
    secondPort.upsert(imageNode("second-reference", "second-asset"));
    await settleResources();

    expect(pixiHarness.load).toHaveBeenCalledOnce();
    expect(cache.sourceLoads).toHaveBeenCalledOnce();
    firstPort.remove("first-reference");
    await settleResources();
    expect(pixiHarness.unload).not.toHaveBeenCalled();
    secondPort.remove("second-reference");
    await settleResources();
    expect(pixiHarness.unload).toHaveBeenCalledOnce();
    expect(texture.destroyCalls).toBe(1);
  });

  it("blocks a URL after unload rejection and reports that retirement failure once", async () => {
    const texture = new pixiHarness.TestTexture();
    const failure = new Error("Pixi URL retirement failed");
    const reportRetirementError = vi.fn();
    const cache = installSharedFakeAssetCache(
      async () => texture,
      async () => Promise.reject(failure),
    );
    const sourcePort: PlanAssetSourcePort = {
      resolve: async (assetId) => ({
        assetId,
        url: "blob:aethertwin/blocked-retirement",
        mediaType: "image/png",
      }),
      reportRetirementError,
    };
    const port = pixiRendererModule.createPixiRenderPort(sourcePort);
    await port.init(document.createElement("div"), { handle: () => undefined });
    const node = imageNode("blocked-reference", "blocked-asset");

    port.upsert(node);
    await settleResources();
    port.remove(node.key);
    await vi.waitFor(() => expect(reportRetirementError).toHaveBeenCalledOnce());

    expect(reportRetirementError).toHaveBeenCalledWith(failure);
    expect(cache.retire).toHaveBeenCalledOnce();
    expect(texture.destroyCalls).toBe(0);
    port.upsert(node);
    await settleResources();

    expect(pixiHarness.load).toHaveBeenCalledOnce();
    expect(cache.sourceLoads).toHaveBeenCalledOnce();
    expect(referenceLayer().children).toHaveLength(1);
    expect(referenceLayer().children[0]).toBeInstanceOf(pixiHarness.TestGraphics);
    expect(reportRetirementError).toHaveBeenCalledOnce();
  });

  it("loads one verified source per pending asset and keeps reference sprites as layer leaves", async () => {
    const sourceGate = deferred<ProjectAssetSource>();
    const textureGate = deferred<InstanceType<typeof pixiHarness.TestTexture>>();
    const resolve = vi.fn(() => sourceGate.promise);
    const sourcePort: PlanAssetSourcePort = { resolve };
    pixiHarness.load.mockReturnValue(textureGate.promise);
    const port = pixiRendererModule.createPixiRenderPort(sourcePort);
    const host = document.createElement("div");
    await port.init(host, { handle: () => undefined });

    const cosine = Math.cos(Math.PI / 6);
    const sine = Math.sin(Math.PI / 6);
    const origin = { x: 400, y: 300 };
    const screenX = { x: 200 * cosine, y: -200 * sine };
    const screenY = { x: -75 * sine, y: -75 * cosine };
    const rotatedCorners = [
      origin,
      { x: origin.x + screenX.x, y: origin.y + screenX.y },
      {
        x: origin.x + screenX.x + screenY.x,
        y: origin.y + screenX.y + screenY.y,
      },
      { x: origin.x + screenY.x, y: origin.y + screenY.y },
    ] as const;
    const first = imageNode("reference-a", "asset-shared", rotatedCorners, true);
    const second = imageNode("reference-b", "asset-shared", [
      { x: 300, y: 20 },
      { x: 500, y: 20 },
      { x: 500, y: 120 },
      { x: 300, y: 120 },
    ]);
    port.upsert(first);
    port.upsert(second);
    await settleResources();

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith("asset-shared");
    sourceGate.resolve(projectAssetSource("asset-shared"));
    await settleResources();
    expect(pixiHarness.load).toHaveBeenCalledOnce();
    expect(pixiHarness.load).toHaveBeenCalledWith("blob:aethertwin/asset-shared");

    const texture = new pixiHarness.TestTexture();
    pixiHarness.unload.mockImplementation(async () => texture.destroy());
    textureGate.resolve(texture);
    await settleResources();
    const layer = referenceLayer();
    expect(latestApplication().stage.children.map(({ label }) => label)).toEqual([
      "grid", "reference", "content", "annotation", "overlay", "interaction",
    ]);
    expect(layer.children).toHaveLength(2);
    expect(layer.children.every((child) => child instanceof pixiHarness.TestSprite)).toBe(true);
    expect(layer.children.every((child) => child.parent === layer && child.children.length === 0)).toBe(true);
    const firstSprite = layer.children.find(({ label }) => label === first.key);
    expect(firstSprite).toBeInstanceOf(pixiHarness.TestSprite);
    if (!(firstSprite instanceof pixiHarness.TestSprite)) return;
    expect(firstSprite.alpha).toBeCloseTo(0.4 * 0.55, 10);
    expect(firstSprite.x).toBeCloseTo(400, 10);
    expect(firstSprite.y).toBeCloseTo(300, 10);
    expect(firstSprite.rotation).toBeCloseTo(-Math.PI / 6, 10);
    expect(firstSprite.scale.x).toBeCloseTo(2, 10);
    expect(firstSprite.scale.y).toBeCloseTo(-1.5, 10);

    port.remove(first.key);
    expect(firstSprite).toMatchObject({ destroyed: true, destroyedWhileParented: false });
    expect(texture.destroyCalls).toBe(0);
    port.remove(second.key);
    await settleResources();
    expect(texture.destroyCalls).toBe(1);
  });

  it("discards stale asset completion by reference generation", async () => {
    const loadA = deferred<InstanceType<typeof pixiHarness.TestTexture>>();
    const loadB = deferred<InstanceType<typeof pixiHarness.TestTexture>>();
    const resolve = vi.fn(async (assetId: string) => projectAssetSource(assetId));
    const sourcePort: PlanAssetSourcePort = { resolve };
    pixiHarness.load.mockImplementation((url) => (
      url.endsWith("asset-a") ? loadA.promise : loadB.promise
    ));
    const port = pixiRendererModule.createPixiRenderPort(sourcePort);
    await port.init(document.createElement("div"), { handle: () => undefined });

    port.upsert(imageNode("reference", "asset-a"));
    await settleResources();
    port.upsert(imageNode("reference", "asset-b"));
    await settleResources();
    expect(resolve.mock.calls.map(([assetId]) => assetId)).toEqual(["asset-a", "asset-b"]);

    const textureB = new pixiHarness.TestTexture();
    loadB.resolve(textureB);
    await settleResources();
    const textureA = new pixiHarness.TestTexture();
    pixiHarness.unload.mockImplementation(async () => textureA.destroy());
    loadA.resolve(textureA);
    await settleResources();

    const sprites = referenceLayer().children.filter(
      (child) => child instanceof pixiHarness.TestSprite,
    ) as InstanceType<typeof pixiHarness.TestSprite>[];
    expect(sprites).toHaveLength(1);
    expect(sprites[0]?.texture).toBe(textureB);
    expect(textureA.destroyCalls).toBe(1);
    expect(textureB.destroyCalls).toBe(0);
  });

  it("waits for cached URL retirement before loading a removed asset again", async () => {
    const firstTexture = new pixiHarness.TestTexture();
    const secondTexture = new pixiHarness.TestTexture();
    const unloadGate = deferred();
    const resolve = vi.fn(async (assetId: string) => projectAssetSource(assetId));
    const sourcePort: PlanAssetSourcePort = { resolve };
    pixiHarness.load
      .mockResolvedValueOnce(firstTexture)
      .mockResolvedValueOnce(secondTexture);
    pixiHarness.unload.mockImplementation(async () => {
      await unloadGate.promise;
      firstTexture.destroy();
    });
    const port = pixiRendererModule.createPixiRenderPort(sourcePort);
    await port.init(document.createElement("div"), { handle: () => undefined });
    const node = imageNode("reference", "asset-reload");

    port.upsert(node);
    await settleResources();
    expect(pixiHarness.load).toHaveBeenCalledOnce();
    port.remove(node.key);
    port.upsert(node);
    await settleResources();

    expect(pixiHarness.unload).toHaveBeenCalledWith("blob:aethertwin/asset-reload");
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(pixiHarness.load).toHaveBeenCalledTimes(1);

    unloadGate.resolve();
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledTimes(2));
    expect(firstTexture.destroyCalls).toBe(1);
    expect(pixiHarness.load).toHaveBeenCalledTimes(2);
    const sprite = referenceLayer().children[0];
    expect(sprite).toBeInstanceOf(pixiHarness.TestSprite);
    expect((sprite as InstanceType<typeof pixiHarness.TestSprite>).texture).toBe(secondTexture);
  });

  it("retires an invalidated pending load before resolving its replacement", async () => {
    const firstLoad = deferred<InstanceType<typeof pixiHarness.TestTexture>>();
    const unloadGate = deferred();
    const firstTexture = new pixiHarness.TestTexture();
    const secondTexture = new pixiHarness.TestTexture();
    const resolve = vi.fn(async (assetId: string) => projectAssetSource(assetId));
    const sourcePort: PlanAssetSourcePort = { resolve };
    pixiHarness.load
      .mockReturnValueOnce(firstLoad.promise)
      .mockResolvedValueOnce(secondTexture);
    pixiHarness.unload.mockImplementation(async () => {
      await unloadGate.promise;
      firstTexture.destroy();
    });
    const port = pixiRendererModule.createPixiRenderPort(sourcePort);
    await port.init(document.createElement("div"), { handle: () => undefined });
    const node = imageNode("reference", "asset-pending");

    port.upsert(node);
    await settleResources();
    port.invalidateAsset("asset-pending");
    port.upsert(node);
    await settleResources();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(pixiHarness.load).toHaveBeenCalledTimes(1);

    firstLoad.resolve(firstTexture);
    await settleResources();
    expect(pixiHarness.unload).toHaveBeenCalledWith("blob:aethertwin/asset-pending");
    expect(resolve).toHaveBeenCalledTimes(1);

    unloadGate.resolve();
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledTimes(2));
    expect(firstTexture.destroyCalls).toBe(1);
    expect(pixiHarness.load).toHaveBeenCalledTimes(2);
    const sprite = referenceLayer().children[0];
    expect(sprite).toBeInstanceOf(pixiHarness.TestSprite);
    expect((sprite as InstanceType<typeof pixiHarness.TestSprite>).texture).toBe(secondTexture);
  });

  it("renders a Graphics-only placeholder for typed resolution failure without consuming unsafe fields", async () => {
    const unsafeBytes = new Uint8Array([1, 2, 3, 4]);
    const resolve = vi.fn(async () => Promise.reject({
      code: "ASSET_CORRUPT",
      url: "file:///private/floor.png",
      bytes: unsafeBytes,
    }));
    const sourcePort: PlanAssetSourcePort = { resolve };
    const port = pixiRendererModule.createPixiRenderPort(sourcePort);
    await port.init(document.createElement("div"), { handle: () => undefined });

    port.upsert(imageNode("broken-reference", "broken-asset"));
    await settleResources();

    expect(resolve).toHaveBeenCalledWith("broken-asset");
    expect(pixiHarness.load).not.toHaveBeenCalled();
    expect(referenceLayer().children).toHaveLength(1);
    expect(referenceLayer().children[0]).toBeInstanceOf(pixiHarness.TestGraphics);
    expect(referenceLayer().children[0]).not.toBeInstanceOf(pixiHarness.TestSprite);
    expect(referenceLayer().children[0]?.alpha).toBeCloseTo(0.4, 10);
  });

  it("rejects resolved identity mismatch and applies locked opacity to its placeholder", async () => {
    const resolve = vi.fn(async () => ({
      assetId: "different-asset",
      url: "blob:aethertwin/identity-mismatch",
      mediaType: "image/png" as const,
    }));
    const sourcePort: PlanAssetSourcePort = { resolve };
    const port = pixiRendererModule.createPixiRenderPort(sourcePort);
    await port.init(document.createElement("div"), { handle: () => undefined });

    port.upsert(imageNode("mismatched-reference", "expected-asset", undefined, true));
    await settleResources();

    expect(resolve).toHaveBeenCalledWith("expected-asset");
    expect(pixiHarness.load).not.toHaveBeenCalled();
    expect(referenceLayer().children).toHaveLength(1);
    expect(referenceLayer().children[0]).toBeInstanceOf(pixiHarness.TestGraphics);
    expect(referenceLayer().children[0]?.alpha).toBeCloseTo(0.4 * 0.55, 10);
  });

  it("invalidates and destroys referenced textures idempotently after removing their leaves", async () => {
    const resolve = vi.fn(async (assetId: string) => ({
      ...projectAssetSource(assetId),
      url: ['blob:aethertwin/destroy', assetId].join('/'),
    }));
    const sourcePort: PlanAssetSourcePort = { resolve };
    const firstTexture = new pixiHarness.TestTexture();
    const secondTexture = new pixiHarness.TestTexture();
    pixiHarness.load
      .mockResolvedValueOnce(firstTexture)
      .mockResolvedValueOnce(secondTexture);
    pixiHarness.unload.mockImplementation(async (url) => {
      (url.endsWith("asset-a") ? firstTexture : secondTexture).destroy();
    });
    const port = pixiRendererModule.createPixiRenderPort(sourcePort);
    await port.init(document.createElement("div"), { handle: () => undefined });

    port.upsert(imageNode("reference-a", "asset-a"));
    await settleResources();
    const invalidatedSprite = referenceLayer().children[0]!;
    port.invalidateAsset("asset-a");
    port.invalidateAsset("asset-a");
    await settleResources();
    expect(invalidatedSprite).toMatchObject({
      destroyed: true,
      destroyedWhileParented: false,
    });
    expect(firstTexture.destroyCalls).toBe(1);

    port.upsert(imageNode("reference-b", "asset-b"));
    await settleResources();
    const destroyedSprite = referenceLayer().children.find(
      ({ label }) => label === "reference-b",
    );
    port.destroy();
    port.destroy();
    await settleResources();

    expect(destroyedSprite).toMatchObject({
      destroyed: true,
      destroyedWhileParented: false,
    });
    expect(secondTexture.destroyCalls).toBe(1);
    expect(latestApplication().destroy).toHaveBeenCalledOnce();
  });
});

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
    const renderer = new PixiPlanRenderer(unusedSourcePort, () => port);

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
    const renderer = new PixiPlanRenderer(unusedSourcePort, () => port);

    const initialization = renderer.init({} as HTMLElement, { handle: () => undefined });
    renderer.destroy();
    gate.resolve();
    await initialization;

    expect(port.destroyCalls).toBe(1);
    expect(() => renderer.update(rendererInput())).toThrow("Plan renderer is not active.");
  });

  it("upserts changed projections only and renders on dirty updates", async () => {
    const port = new FakePlanRenderPort();
    const renderer = new PixiPlanRenderer(unusedSourcePort, () => port);
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

  it("invalidates a referenced asset and re-upserts its image on an identical update", async () => {
    const port = new FakePlanRenderPort();
    const renderer = new PixiPlanRenderer(unusedSourcePort, () => port);
    const input = rendererInputWithReference();

    await renderer.init({} as HTMLElement, { handle: () => undefined });
    renderer.update(input);
    expect(port.upsertedNodes.some((node) => (
      node.geometry.kind === "image" && node.geometry.assetId === rendererAssetId
    ))).toBe(true);
    port.upsertedNodes.length = 0;

    renderer.invalidateAsset(rendererAssetId);
    renderer.update(input);

    expect(port.invalidatedAssetIds).toEqual([rendererAssetId]);
    expect(port.upsertedNodes).toHaveLength(1);
    expect(port.upsertedNodes[0]).toMatchObject({
      key: rendererReference.id,
      geometry: { kind: "image", assetId: rendererAssetId },
    });
  });

  it("removes stale display objects through the render port", async () => {
    const port = new FakePlanRenderPort();
    const renderer = new PixiPlanRenderer(unusedSourcePort, () => port);
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
    const renderer = new PixiPlanRenderer(unusedSourcePort, () => port);

    await renderer.init({} as HTMLElement, { handle: () => undefined });
    renderer.resize(640, 480, 2);
    renderer.destroy();
    renderer.destroy();

    expect(port.resizeCalls).toEqual([[640, 480, 2]]);
    expect(port.renderCalls).toBe(1);
    expect(port.destroyCalls).toBe(1);
  });
});
describe("Pixi M2.2 opening symbols", () => {
  function openingNode(
    key: string,
    kind: "door" | "window",
  ): RenderNode {
    return {
      key,
      entityId: key,
      layer: "content",
      geometry: {
        kind: "opening",
        symbol: {
          key,
          openingId: key,
          kind,
          center: { x: 100, y: 100 },
          angle: 0,
          width: 40,
          wallThickness: 12,
          selected: false,
        },
      },
      bounds: {
        min: { x: 80, y: 94 },
        max: { x: 120, y: 106 },
      },
      styleToken: `opening-${kind}`,
      selected: false,
      locked: false,
    };
  }

  it("draws the door width line, leaf, and one 90-degree swing arc", async () => {
    const port = pixiRendererModule.createPixiRenderPort(unusedSourcePort);
    await port.init(document.createElement("div"), { handle: () => undefined });
    port.upsert(openingNode("door-symbol", "door"));
    const content = latestApplication().stage.children.find(
      ({ label }) => label === "content",
    );
    const graphics = content?.children[0] as
      | InstanceType<typeof pixiHarness.TestGraphics>
      | undefined;

    expect(graphics?.commands.filter(({ method }) => method === "moveTo")).toHaveLength(2);
    expect(graphics?.commands.filter(({ method }) => method === "lineTo")).toHaveLength(2);
    const arcs = graphics?.commands.filter(({ method }) => method === "arc") ?? [];
    expect(arcs).toHaveLength(1);
    expect(Number(arcs[0]?.args[4]) - Number(arcs[0]?.args[3])).toBeCloseTo(Math.PI / 2);
    port.destroy();
  });

  it("draws the window width line plus two parallel lines without an arc", async () => {
    const port = pixiRendererModule.createPixiRenderPort(unusedSourcePort);
    await port.init(document.createElement("div"), { handle: () => undefined });
    port.upsert(openingNode("window-symbol", "window"));
    const content = latestApplication().stage.children.find(
      ({ label }) => label === "content",
    );
    const graphics = content?.children[0] as
      | InstanceType<typeof pixiHarness.TestGraphics>
      | undefined;

    expect(graphics?.commands.filter(({ method }) => method === "moveTo")).toHaveLength(3);
    expect(graphics?.commands.filter(({ method }) => method === "lineTo")).toHaveLength(3);
    expect(graphics?.commands.some(({ method }) => method === "arc")).toBe(false);
    port.destroy();
  });

  it("detaches and destroys an opening Graphics leaf when it is removed", async () => {
    const port = pixiRendererModule.createPixiRenderPort(unusedSourcePort);
    await port.init(document.createElement("div"), { handle: () => undefined });
    port.upsert(openingNode("removed-opening", "door"));
    const content = latestApplication().stage.children.find(
      ({ label }) => label === "content",
    );
    const graphics = content?.children[0] as
      | InstanceType<typeof pixiHarness.TestGraphics>
      | undefined;

    port.remove("removed-opening");

    expect(content?.children).toHaveLength(0);
    expect(graphics?.destroyed).toBe(true);
    expect(graphics?.destroyedWhileParented).toBe(false);
    port.destroy();
  });
});
