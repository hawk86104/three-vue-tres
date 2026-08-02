import {
  Application,
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  type FederatedPointerEvent,
  type FederatedWheelEvent,
  type Texture,
} from "pixi.js";
import { projectScene } from "./scene-projection";
import type {
  PlanPointerEvent,
  PlanAssetSourcePort,
  PlanRenderPort,
  PlanRenderPortFactory,
  PlanRenderer,
  PlanRendererEventSink,
  PlanRendererInput,
  RenderNode,
} from "./types";

type RenderLayer = RenderNode["layer"];
const MOUSE_POINTER_ID = 1;

interface RenderEntry {
  display: Container;
  layer: RenderLayer;
  fingerprint: string;
  assetId: string | null;
  generation: number;
  node: RenderNode;
}

interface TextureResource {
  readonly assetId: string;
  readonly references: Map<string, number>;
  texture: Texture | null;
  lease: SharedTextureLease | null;
  pending: Promise<void> | null;
  invalidated: boolean;
}

interface SharedTextureEntry {
  readonly url: string;
  readonly texture: Promise<Texture>;
  references: number;
  retirement: Promise<void> | null;
  blocked: boolean;
  blockedError: unknown;
  retirementErrorReported: boolean;
}

interface SharedTextureLease {
  readonly entry: SharedTextureEntry;
  readonly texture: Texture;
  released: boolean;
}

const sharedTextureEntries = new Map<string, SharedTextureEntry>();
const sharedTextureOperations = new Set<Promise<void>>();
let reservedPixiPortCount = 0;
let pixiPortGeneration = 0;

function trackSharedTextureOperation<T>(operation: Promise<T>): Promise<T> {
  const settlement = operation.then(() => undefined, () => undefined);
  sharedTextureOperations.add(settlement);
  void settlement.then(() => sharedTextureOperations.delete(settlement));
  return operation;
}

async function waitForSharedTextureIdle(): Promise<void> {
  while (sharedTextureOperations.size > 0) {
    await Promise.all([...sharedTextureOperations]);
  }
}

async function acquireSharedTexture(url: string): Promise<SharedTextureLease> {
  while (true) {
    let entry = sharedTextureEntries.get(url);
    if (entry === undefined) {
      entry = {
        url,
        texture: Promise.resolve().then(() => Assets.load<Texture>(url)),
        references: 0,
        retirement: null,
        blocked: false,
        blockedError: undefined,
        retirementErrorReported: false,
      };
      sharedTextureEntries.set(url, entry);
    }
    if (entry.blocked) throw entry.blockedError;
    if (entry.retirement !== null) {
      await entry.retirement;
      continue;
    }
    entry.references += 1;
    try {
      const texture = await entry.texture;
      return { entry, texture, released: false };
    } catch (error) {
      entry.references -= 1;
      if (entry.references === 0 && sharedTextureEntries.get(url) === entry) {
        sharedTextureEntries.delete(url);
      }
      throw error;
    }
  }
}

function releaseSharedTexture(
  lease: SharedTextureLease,
  reportError: ((error: unknown) => void) | undefined,
): Promise<void> {
  if (lease.released) return Promise.resolve();
  lease.released = true;
  const entry = lease.entry;
  entry.references -= 1;
  if (entry.references !== 0 || entry.retirement !== null) return Promise.resolve();
  const retirement = Promise.resolve()
    .then(() => Assets.unload(entry.url))
    .then(
      () => {
        if (sharedTextureEntries.get(entry.url) === entry) {
          sharedTextureEntries.delete(entry.url);
        }
      },
      (error: unknown) => {
        entry.blocked = true;
        entry.blockedError = error;
        if (!entry.retirementErrorReported) {
          entry.retirementErrorReported = true;
          try {
            reportError?.(error);
          } catch {
            // The shared URL remains blocked even if its observer throws.
          }
        }
      },
    );
  entry.retirement = retirement;
  return trackSharedTextureOperation(retirement);
}

interface LayerContainers {
  readonly grid: Container;
  readonly reference: Container;
  readonly content: Container;
  readonly annotation: Container;
  readonly overlay: Container;
  readonly interaction: Container;
}

interface PointerInputBridge {
  pointerDown(event: PlanPointerEvent): void;
  globalPointerMove(event: PlanPointerEvent): void;
  pointerUp(event: PlanPointerEvent): void;
  pointerCancel(event: PlanPointerEvent): void;
  destroy(): void;
}

interface PointerInputBounds {
  contains(x: number, y: number): boolean;
}

interface NativePointerCancelEvent {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly buttons: number;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

interface NativePointerCancelSource {
  listen(listener: (event: NativePointerCancelEvent) => void): () => void;
  mapClientToScreen(clientX: number, clientY: number): { readonly x: number; readonly y: number };
}

export function createPointerInputBridge(
  bounds: PointerInputBounds,
  sink: PlanRendererEventSink,
  nativePointerCancel?: NativePointerCancelSource,
): PointerInputBridge {
  const activePointerIds = new Set<number>();
  let destroyed = false;
  const cancel = (event: PlanPointerEvent): void => {
    if (activePointerIds.delete(event.pointerId)) sink.handle(event);
  };
  const removeNativePointerCancel = nativePointerCancel?.listen((event) => {
    if (!activePointerIds.has(event.pointerId)) return;
    cancel({
      type: "pointercancel",
      pointerId: event.pointerId,
      screen: nativePointerCancel.mapClientToScreen(event.clientX, event.clientY),
      buttons: event.buttons,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    });
  });
  return {
    pointerDown(event) {
      activePointerIds.add(event.pointerId);
      sink.handle(event);
    },
    globalPointerMove(event) {
      if (
        activePointerIds.has(event.pointerId)
        || bounds.contains(event.screen.x, event.screen.y)
      ) sink.handle(event);
    },
    pointerUp(event) {
      activePointerIds.delete(event.pointerId);
      sink.handle(event);
    },
    pointerCancel(event) {
      cancel(event);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      removeNativePointerCancel?.();
      activePointerIds.clear();
    },
  };
}

function createNativePointerCancelSource(application: Application): NativePointerCancelSource {
  return {
    listen(listener) {
      const nativeListener = (event: PointerEvent): void => listener(event);
      globalThis.addEventListener("pointercancel", nativeListener, true);
      return () => {
        globalThis.removeEventListener("pointercancel", nativeListener, true);
      };
    },
    mapClientToScreen(clientX, clientY) {
      const screen = { x: 0, y: 0 };
      application.renderer.events.mapPositionToPoint(screen, clientX, clientY);
      return screen;
    },
  };
}

function fingerprint(node: RenderNode): string {
  return JSON.stringify(node);
}

function compareLabels(left: Container, right: Container): number {
  const leftLabel = left.label ?? "";
  const rightLabel = right.label ?? "";
  return leftLabel < rightLabel ? -1 : leftLabel > rightLabel ? 1 : 0;
}

function restoreLayerOrder(container: Container): void {
  const ordered = [...container.children].sort(compareLabels);
  for (let index = 0; index < ordered.length; index += 1) {
    const child = ordered[index]!;
    if (container.children[index] !== child) container.setChildIndex(child, index);
  }
}

function destroyApplication(
  application: Application,
  releaseGlobalResources = false,
): void {
  application.destroy(
    releaseGlobalResources
      ? { removeView: true, releaseGlobalResources: true }
      : { removeView: true },
    { children: true, texture: false, textureSource: false },
  );
}

function tryDestroyApplication(
  application: Application,
  releaseGlobalResources = false,
): void {
  try {
    destroyApplication(application, releaseGlobalResources);
  } catch {
    // Best-effort cleanup for a partially initialized Pixi application.
  }
}

function pointerEvent(
  type: Exclude<PlanPointerEvent["type"], "wheel">,
  event: FederatedPointerEvent,
): PlanPointerEvent {
  return {
    type,
    pointerId: event.pointerId,
    screen: { x: event.global.x, y: event.global.y },
    buttons: event.buttons,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
  };
}

function wheelEvent(event: FederatedWheelEvent): PlanPointerEvent {
  return {
    type: "wheel",
    pointerId: MOUSE_POINTER_ID,
    screen: { x: event.global.x, y: event.global.y },
    buttons: event.buttons,
    wheelDelta: { x: event.deltaX, y: event.deltaY },
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
  };
}

function layerContainer(layers: LayerContainers, layer: RenderLayer): Container {
  return layers[layer];
}

function paintFor(node: RenderNode): {
  readonly color: number;
  readonly alpha: number;
  readonly width: number;
  readonly fillAlpha: number;
} {
  if (node.styleToken === "grid-axis") {
    return { color: 0x6f89a8, alpha: 0.9, width: 1.5, fillAlpha: 0 };
  }
  if (node.styleToken === "grid-major") {
    return { color: 0x34455e, alpha: 0.5, width: 1, fillAlpha: 0 };
  }
  if (node.styleToken.startsWith("selection-")) {
    return { color: 0x58d7ff, alpha: 1, width: 3, fillAlpha: 0.04 };
  }
  if (node.styleToken.startsWith("draft-")) {
    return { color: 0xf2b84b, alpha: 0.9, width: 2, fillAlpha: 0.1 };
  }
  if (node.styleToken.startsWith("room-candidate")) {
    if (node.styleToken === "room-candidate-represented") {
      return { color: 0x7f92aa, alpha: 0.65, width: 1.5, fillAlpha: 0.04 };
    }
    return {
      color: node.styleToken === "room-candidate-selected" ? 0x58d7ff : 0x67d5b5,
      alpha: 0.95,
      width: node.styleToken === "room-candidate-selected" ? 3 : 2,
      fillAlpha: 0.08,
    };
  }
  if (node.styleToken === "entity-poi-product-hotspot") {
    return { color: 0xf2b84b, alpha: 1, width: 2, fillAlpha: 0.24 };
  }
  if (node.styleToken === "route-edge-resolved") {
    return { color: 0x67d5b5, alpha: 1, width: 4, fillAlpha: 0 };
  }
  if (node.styleToken === "route-edge-directed") {
    return { color: 0xf2b84b, alpha: 0.95, width: 2, fillAlpha: 0 };
  }
  if (node.styleToken === "route-edge-bidirectional") {
    return { color: 0x86a5c7, alpha: 0.85, width: 2, fillAlpha: 0 };
  }
  if (node.styleToken === "route-node-entrance") {
    return { color: 0x67d5b5, alpha: 1, width: 2, fillAlpha: 0.2 };
  }
  if (node.styleToken === "route-node-showroom-stop") {
    return { color: 0xf2b84b, alpha: 1, width: 2, fillAlpha: 0.24 };
  }
  if (node.styleToken === "route-node-junction") {
    return { color: 0x9fb4ce, alpha: 0.95, width: 2, fillAlpha: 0.16 };
  }
  if (node.styleToken.startsWith("opening-")) {
    return { color: 0xe7f3ff, alpha: node.locked ? 0.55 : 0.95, width: 2, fillAlpha: 0 };
  }
  if (node.styleToken === "dimension") {
    return { color: 0x9fb4ce, alpha: 0.95, width: 1.5, fillAlpha: 0 };
  }
  const selectedColor = node.selected ? 0x58d7ff : 0x86a5c7;
  return {
    color: selectedColor,
    alpha: node.locked ? 0.55 : 0.9,
    width: node.styleToken === "entity-wall" ? 3 : 1.5,
    fillAlpha: node.styleToken === "entity-zone" ? 0.16 : 0.08,
  };
}

function drawNode(graphics: Graphics, node: RenderNode): void {
  graphics.clear();
  const paint = paintFor(node);
  const stroke = {
    color: paint.color,
    alpha: paint.alpha,
    width: paint.width,
    pixelLine: paint.width <= 1,
  };
  const geometry = node.geometry;
  switch (geometry.kind) {
    case "polygon": {
      const coordinates = geometry.points.flatMap((point) => [point.x, point.y]);
      graphics.poly(coordinates, geometry.closed)
        .fill({ color: paint.color, alpha: paint.fillAlpha })
        .stroke(stroke);
      break;
    }
    case "polyline": {
      const first = geometry.points[0];
      if (first === undefined) break;
      graphics.moveTo(first.x, first.y);
      for (let index = 1; index < geometry.points.length; index += 1) {
        const point = geometry.points[index]!;
        graphics.lineTo(point.x, point.y);
      }
      if (geometry.closed) graphics.closePath();
      graphics.stroke(stroke);
      break;
    }
    case "circle":
      graphics.circle(geometry.center.x, geometry.center.y, geometry.radius)
        .fill({ color: paint.color, alpha: Math.max(paint.fillAlpha, 0.18) })
        .stroke(stroke);
      break;
    case "route-node": {
      const radius = geometry.nodeKind === "showroom-stop"
        ? 7
        : geometry.nodeKind === "entrance"
          ? 6
          : 5;
      graphics.circle(geometry.center.x, geometry.center.y, radius)
        .fill({ color: paint.color, alpha: Math.max(paint.fillAlpha, 0.18) })
        .stroke(stroke);
      break;
    }
    case "route-edge":
      graphics.moveTo(geometry.start.x, geometry.start.y)
        .lineTo(geometry.end.x, geometry.end.y)
        .stroke(stroke);
      break;
    case "dimension":
      graphics.moveTo(geometry.start.x, geometry.start.y)
        .lineTo(geometry.end.x, geometry.end.y)
        .stroke(stroke)
        .circle(geometry.label.x, geometry.label.y, 2.5)
        .fill({ color: paint.color, alpha: paint.alpha });
      break;
    case "opening": {
      const { symbol } = geometry;
      const tangent = { x: Math.cos(symbol.angle), y: Math.sin(symbol.angle) };
      const normal = { x: -tangent.y, y: tangent.x };
      const halfWidth = symbol.width / 2;
      const start = {
        x: symbol.center.x - tangent.x * halfWidth,
        y: symbol.center.y - tangent.y * halfWidth,
      };
      const end = {
        x: symbol.center.x + tangent.x * halfWidth,
        y: symbol.center.y + tangent.y * halfWidth,
      };
      graphics.moveTo(start.x, start.y).lineTo(end.x, end.y).stroke(stroke);
      if (symbol.kind === "door") {
        graphics.moveTo(start.x, start.y)
          .lineTo(
            start.x + normal.x * symbol.width,
            start.y + normal.y * symbol.width,
          )
          .stroke(stroke)
          .arc(
            start.x,
            start.y,
            symbol.width,
            symbol.angle,
            symbol.angle + Math.PI / 2,
          )
          .stroke(stroke);
      } else {
        for (const direction of [-1, 1]) {
          const offset = direction * symbol.wallThickness / 4;
          graphics.moveTo(
            start.x + normal.x * offset,
            start.y + normal.y * offset,
          ).lineTo(
            end.x + normal.x * offset,
            end.y + normal.y * offset,
          ).stroke(stroke);
        }
      }
      break;
    }
    case "room-candidate": {
      const coordinates = geometry.candidate.ring.flatMap((point) => [point.x, point.y]);
      graphics.poly(coordinates, true)
        .fill({ color: paint.color, alpha: paint.fillAlpha })
        .stroke(stroke);
      break;
    }
    case "image": {
      const coordinates = geometry.corners.flatMap((point) => [point.x, point.y]);
      graphics.poly(coordinates, true)
        .fill({ color: 0x27384c, alpha: 0.28 })
        .stroke({ color: 0x86a5c7, alpha: 0.8, width: 1.5 });
      break;
    }
  }
}

function cleanupApplication(
  application: Application,
  lifecycleGeneration: number | null,
): void {
  if (lifecycleGeneration === null || reservedPixiPortCount > 0) {
    tryDestroyApplication(application);
    return;
  }
  void waitForSharedTextureIdle().then(() => {
    tryDestroyApplication(
      application,
      reservedPixiPortCount === 0 && pixiPortGeneration === lifecycleGeneration,
    );
  });
}

function createImageSprite(node: RenderNode, texture: Texture): Sprite | null {
  if (node.geometry.kind !== "image" || texture.width <= 0 || texture.height <= 0) {
    return null;
  }
  const [origin, horizontal, , vertical] = node.geometry.corners;
  const horizontalX = horizontal.x - origin.x;
  const horizontalY = horizontal.y - origin.y;
  const verticalX = vertical.x - origin.x;
  const verticalY = vertical.y - origin.y;
  const horizontalLength = Math.hypot(horizontalX, horizontalY);
  const verticalLength = Math.hypot(verticalX, verticalY);
  if (horizontalLength === 0 || verticalLength === 0) return null;
  const orientation = horizontalX * verticalY - horizontalY * verticalX;
  if (orientation === 0) return null;

  const sprite = new Sprite({ texture, label: node.key, eventMode: "none" });
  sprite.x = origin.x;
  sprite.y = origin.y;
  sprite.rotation = Math.atan2(horizontalY, horizontalX);
  sprite.scale.set(
    horizontalLength / texture.width,
    Math.sign(orientation) * verticalLength / texture.height,
  );
  sprite.alpha = node.geometry.opacity * (node.locked ? 0.55 : 1);
  return sprite;
}

function destroyDisplay(display: Container): void {
  display.removeFromParent();
  if (display instanceof Graphics) {
    display.destroy({ context: true });
  } else {
    display.destroy();
  }
}

class PixiRenderPort implements PlanRenderPort {
  readonly #entries = new Map<string, RenderEntry>();
  readonly #resources = new Map<string, TextureResource>();
  readonly #retirementBarriers = new Map<string, Promise<void>>();
  #application: Application | null = null;
  #layers: LayerContainers | null = null;
  #interactionBounds: Rectangle | null = null;
  #inputBridge: PointerInputBridge | null = null;
  #initialization: Promise<void> | null = null;
  #lifecycleGeneration: number | null = null;
  #destroyed = false;

  constructor(private readonly sourcePort: PlanAssetSourcePort) {}

  init(host: HTMLElement, sink: PlanRendererEventSink): Promise<void> {
    if (this.#destroyed) {
      return Promise.reject(new Error("Cannot initialize a destroyed Pixi render port."));
    }
    if (this.#application !== null) return Promise.resolve();
    if (this.#initialization === null) {
      reservedPixiPortCount += 1;
      this.#lifecycleGeneration = ++pixiPortGeneration;
      this.#initialization = this.#initialize(host, sink).catch((error: unknown) => {
        this.#releaseLifecycleReservation();
        if (!this.#destroyed) this.#initialization = null;
        throw error;
      });
    }
    return this.#initialization;
  }

  async #initialize(host: HTMLElement, sink: PlanRendererEventSink): Promise<void> {
    const application = new Application();
    let inputBridge: PointerInputBridge | null = null;
    try {
      await application.init({
        width: 1,
        height: 1,
        resolution: 1,
        autoDensity: true,
        antialias: true,
        backgroundAlpha: 0,
        autoStart: false,
        eventFeatures: { move: true, globalMove: true, click: true, wheel: true },
      });
      if (this.#destroyed) {
        const generation = this.#releaseLifecycleReservation();
        cleanupApplication(application, generation);
        return;
      }

      const grid = new Container({ label: "grid", eventMode: "none" });
      const reference = new Container({ label: "reference", eventMode: "none" });
      const content = new Container({ label: "content", eventMode: "none" });
      const annotation = new Container({ label: "annotation", eventMode: "none" });
      const overlay = new Container({ label: "overlay", eventMode: "none" });
      const interactionBounds = new Rectangle(0, 0, 1, 1);
      const interaction = new Container({
        label: "interaction",
        eventMode: "static",
        interactiveChildren: false,
        hitArea: interactionBounds,
      });
      application.stage.addChild(grid, reference, content, annotation, overlay, interaction);

      inputBridge = createPointerInputBridge(
        interactionBounds,
        sink,
        createNativePointerCancelSource(application),
      );
      interaction.on("pointerdown", (event: FederatedPointerEvent) => {
        inputBridge!.pointerDown(pointerEvent("pointerdown", event));
      });
      interaction.on("globalpointermove", (event: FederatedPointerEvent) => {
        inputBridge!.globalPointerMove(pointerEvent("pointermove", event));
      });
      interaction.on("pointerup", (event: FederatedPointerEvent) => {
        inputBridge!.pointerUp(pointerEvent("pointerup", event));
      });
      interaction.on("pointerupoutside", (event: FederatedPointerEvent) => {
        inputBridge!.pointerUp(pointerEvent("pointerup", event));
      });
      interaction.on("pointercancel", (event: FederatedPointerEvent) => {
        inputBridge!.pointerCancel(pointerEvent("pointercancel", event));
      });
      interaction.on("wheel", (event: FederatedWheelEvent) => {
        sink.handle(wheelEvent(event));
      });

      host.appendChild(application.canvas);
      this.#application = application;
      this.#layers = { grid, reference, content, annotation, overlay, interaction };
      this.#interactionBounds = interactionBounds;
      this.#inputBridge = inputBridge;
    } catch (error) {
      inputBridge?.destroy();
      const generation = this.#releaseLifecycleReservation();
      cleanupApplication(application, generation);
      throw error;
    }
  }

  upsert(node: RenderNode): void {
    this.#requireLayers();
    const nextFingerprint = fingerprint(node);
    const existing = this.#entries.get(node.key);
    if (existing?.fingerprint === nextFingerprint) return;
    if (node.geometry.kind === "image") {
      this.#upsertImage(node, nextFingerprint, existing);
      return;
    }

    if (existing?.assetId !== null && existing?.assetId !== undefined) {
      this.#releaseAsset(existing.assetId, node.key);
    }
    const graphics = this.#graphicsFor(node);
    if (existing === undefined) {
      const entry: RenderEntry = {
        display: graphics,
        layer: node.layer,
        fingerprint: nextFingerprint,
        assetId: null,
        generation: 1,
        node,
      };
      this.#entries.set(node.key, entry);
      this.#attach(entry);
      return;
    }
    existing.assetId = null;
    existing.fingerprint = nextFingerprint;
    existing.generation += 1;
    existing.node = node;
    this.#replaceDisplay(existing, graphics, node.layer);
  }

  #upsertImage(
    node: RenderNode,
    nextFingerprint: string,
    existing: RenderEntry | undefined,
  ): void {
    if (node.geometry.kind !== "image") return;
    const generation = (existing?.generation ?? 0) + 1;
    if (existing?.assetId !== null && existing?.assetId !== undefined
      && existing.assetId !== node.geometry.assetId) {
      this.#releaseAsset(existing.assetId, node.key);
    }
    const resource = this.#resourceFor(node.geometry.assetId);
    resource.references.set(node.key, generation);
    const display = resource.texture === null
      ? this.#graphicsFor(node)
      : createImageSprite(node, resource.texture) ?? this.#graphicsFor(node);

    if (existing === undefined) {
      const entry: RenderEntry = {
        display,
        layer: node.layer,
        fingerprint: nextFingerprint,
        assetId: node.geometry.assetId,
        generation,
        node,
      };
      this.#entries.set(node.key, entry);
      this.#attach(entry);
    } else {
      existing.assetId = node.geometry.assetId;
      existing.fingerprint = nextFingerprint;
      existing.generation = generation;
      existing.node = node;
      this.#replaceDisplay(existing, display, node.layer);
    }
    this.#startLoad(resource);
  }

  #graphicsFor(node: RenderNode): Graphics {
    const graphics = new Graphics({ label: node.key, eventMode: "none" });
    drawNode(graphics, node);
    if (node.geometry.kind === 'image') {
      graphics.alpha = node.geometry.opacity * (node.locked ? 0.55 : 1);
    }
    return graphics;
  }

  #attach(entry: RenderEntry): void {
    const container = layerContainer(this.#requireLayers(), entry.layer);
    container.addChild(entry.display);
    restoreLayerOrder(container);
  }

  #replaceDisplay(entry: RenderEntry, display: Container, layer: RenderLayer): void {
    destroyDisplay(entry.display);
    entry.display = display;
    entry.layer = layer;
    this.#attach(entry);
  }

  #resourceFor(assetId: string): TextureResource {
    const existing = this.#resources.get(assetId);
    if (existing !== undefined) return existing;
    const resource: TextureResource = {
      assetId,
      references: new Map(),
      texture: null,
      lease: null,
      pending: null,
      invalidated: false,
    };
    this.#resources.set(assetId, resource);
    return resource;
  }

  #startLoad(resource: TextureResource): void {
    if (resource.texture !== null || resource.pending !== null || resource.invalidated) return;
    const priorRetirement = this.#retirementBarriers.get(resource.assetId)
      ?? Promise.resolve();
    const operation = async (): Promise<void> => {
      await priorRetirement;
      if (
        this.#destroyed
        || resource.invalidated
        || resource.references.size === 0
        || this.#resources.get(resource.assetId) !== resource
      ) return;
      try {
        const source = await this.sourcePort.resolve(resource.assetId);
        if (source.assetId !== resource.assetId) {
          throw new Error("Resolved asset identity does not match the requested asset.");
        }
        if (
          this.#destroyed
          || resource.invalidated
          || resource.references.size === 0
          || this.#resources.get(resource.assetId) !== resource
        ) return;
        const lease = await acquireSharedTexture(source.url);
        const texture = lease.texture;
        if (
          this.#destroyed
          || resource.invalidated
          || resource.references.size === 0
          || this.#resources.get(resource.assetId) !== resource
        ) {
          await releaseSharedTexture(
            lease,
            this.sourcePort.reportRetirementError,
          );
          return;
        }
        resource.lease = lease;
        resource.texture = texture;
        for (const [key, generation] of resource.references) {
          const entry = this.#entries.get(key);
          if (
            entry === undefined
            || entry.assetId !== resource.assetId
            || entry.generation !== generation
          ) continue;
          const sprite = createImageSprite(entry.node, texture);
          if (sprite !== null) this.#replaceDisplay(entry, sprite, "reference");
        }
        this.#application?.render();
      } catch {
        // The existing Graphics leaf is the safe degraded representation.
      }
    };
    resource.pending = trackSharedTextureOperation(operation().finally(() => {
        resource.pending = null;
        if (resource.references.size === 0) {
          if (this.#resources.get(resource.assetId) === resource) {
            this.#resources.delete(resource.assetId);
          }
        }
      }));
  }

  #extendRetirement(assetId: string, retirement: Promise<void>): void {
    const previous = this.#retirementBarriers.get(assetId) ?? Promise.resolve();
    const barrier = Promise.all([previous, retirement]).then(() => undefined, () => undefined);
    this.#retirementBarriers.set(assetId, barrier);
    void barrier.then(() => {
      if (this.#retirementBarriers.get(assetId) === barrier) {
        this.#retirementBarriers.delete(assetId);
      }
    });
  }

  async #unloadResource(resource: TextureResource, register: boolean): Promise<void> {
    const lease = resource.lease;
    resource.texture = null;
    resource.lease = null;
    if (lease === null) return;
    const retirement = releaseSharedTexture(
      lease,
      this.sourcePort.reportRetirementError,
    );
    if (register) this.#extendRetirement(resource.assetId, retirement);
    await retirement;
  }

  #releaseAsset(assetId: string, key: string): void {
    const resource = this.#resources.get(assetId);
    if (resource === undefined) return;
    resource.references.delete(key);
    if (resource.references.size !== 0) return;
    if (resource.pending !== null) {
      this.#extendRetirement(assetId, resource.pending);
      return;
    }
    void this.#unloadResource(resource, true);
    this.#resources.delete(assetId);
  }

  remove(key: string): void {
    const entry = this.#entries.get(key);
    if (entry === undefined) return;
    destroyDisplay(entry.display);
    this.#entries.delete(key);
    if (entry.assetId !== null) this.#releaseAsset(entry.assetId, key);
  }

  invalidateAsset(assetId: string): void {
    if (this.#destroyed) return;
    const resource = this.#resources.get(assetId);
    if (resource !== undefined) {
      resource.invalidated = true;
      resource.references.clear();
      if (resource.pending !== null) {
        this.#extendRetirement(assetId, resource.pending);
      } else {
        void this.#unloadResource(resource, true);
      }
      this.#resources.delete(assetId);
    }
    let dirty = false;
    for (const entry of this.#entries.values()) {
      if (entry.assetId !== assetId) continue;
      entry.generation += 1;
      entry.fingerprint = "";
      this.#replaceDisplay(entry, this.#graphicsFor(entry.node), "reference");
      dirty = true;
    }
    if (dirty) this.#application?.render();
  }

  resize(width: number, height: number, resolution: number): void {
    const application = this.#requireApplication();
    application.renderer.resize(width, height, resolution);
    const interactionBounds = this.#interactionBounds!;
    interactionBounds.width = width;
    interactionBounds.height = height;
  }

  render(): void {
    this.#requireApplication().render();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    const application = this.#application;
    const lifecycleGeneration = application === null
      ? null
      : this.#releaseLifecycleReservation();
    for (const key of [...this.#entries.keys()]) this.remove(key);
    for (const resource of this.#resources.values()) {
      resource.invalidated = true;
      resource.references.clear();
      if (resource.pending !== null) {
        this.#extendRetirement(resource.assetId, resource.pending);
      } else {
        void this.#unloadResource(resource, true);
      }
    }
    this.#resources.clear();
    this.#inputBridge?.destroy();
    this.#application = null;
    this.#layers = null;
    this.#interactionBounds = null;
    this.#inputBridge = null;
    if (application === null) return;
    cleanupApplication(application, lifecycleGeneration);
  }

  #releaseLifecycleReservation(): number | null {
    const generation = this.#lifecycleGeneration;
    if (generation === null) return null;
    this.#lifecycleGeneration = null;
    reservedPixiPortCount -= 1;
    return generation;
  }

  #requireApplication(): Application {
    if (this.#application === null || this.#destroyed) {
      throw new Error("Pixi render port is not active.");
    }
    return this.#application;
  }

  #requireLayers(): LayerContainers {
    this.#requireApplication();
    return this.#layers!;
  }
}

const unavailableAssetSourcePort: PlanAssetSourcePort = {
  async resolve() {
    throw new Error('No plan asset source port is configured.');
  },
};

export function createPixiRenderPort(
  sourcePort: PlanAssetSourcePort = unavailableAssetSourcePort,
): PlanRenderPort & { invalidateAsset(assetId: string): void } {
  return new PixiRenderPort(sourcePort);
}

export class PixiPlanRenderer implements PlanRenderer {
  readonly #port: PlanRenderPort;
  readonly #fingerprints = new Map<string, string>();
  readonly #assetIdsByKey = new Map<string, string>();
  readonly #forceUpsertKeys = new Set<string>();
  #initialized = false;
  #initialization: Promise<void> | null = null;
  #destroyed = false;

  constructor();
  constructor(portFactory: PlanRenderPortFactory);
  constructor(sourcePort: PlanAssetSourcePort, portFactory?: PlanRenderPortFactory);
  constructor(
    sourcePortOrFactory: PlanAssetSourcePort | PlanRenderPortFactory = unavailableAssetSourcePort,
    portFactory: PlanRenderPortFactory = createPixiRenderPort,
  ) {
    const sourcePort = typeof sourcePortOrFactory === 'function'
      ? unavailableAssetSourcePort
      : sourcePortOrFactory;
    const resolvedPortFactory = typeof sourcePortOrFactory === 'function'
      ? sourcePortOrFactory
      : portFactory;
    this.#port = resolvedPortFactory(sourcePort);
  }

  init(host: HTMLElement, sink: PlanRendererEventSink): Promise<void> {
    if (this.#destroyed) {
      return Promise.reject(new Error("Cannot initialize a destroyed plan renderer."));
    }
    if (this.#initialized) return Promise.resolve();
    if (this.#initialization === null) {
      try {
        const initialization = this.#port.init(host, sink);
        this.#initialization = initialization.then(() => {
          if (!this.#destroyed) this.#initialized = true;
        }, (error: unknown) => {
          if (!this.#destroyed) this.#initialization = null;
          throw error;
        });
      } catch (error) {
        return Promise.reject(error);
      }
    }
    return this.#initialization;
  }

  update(input: PlanRendererInput): void {
    this.#requireActive();
    const scene = projectScene(input);
    const nextFingerprints = new Map<string, string>();
    const nextAssetIdsByKey = new Map<string, string>();
    let dirty = false;
    for (const node of scene.nodes) {
      const nextFingerprint = fingerprint(node);
      nextFingerprints.set(node.key, nextFingerprint);
      if (node.geometry.kind === 'image') {
        nextAssetIdsByKey.set(node.key, node.geometry.assetId);
      }
      if (
        !this.#forceUpsertKeys.has(node.key)
        && this.#fingerprints.get(node.key) === nextFingerprint
      ) continue;
      this.#port.upsert(node);
      dirty = true;
    }
    for (const key of this.#fingerprints.keys()) {
      if (nextFingerprints.has(key)) continue;
      this.#port.remove(key);
      dirty = true;
    }
    this.#fingerprints.clear();
    for (const [key, value] of nextFingerprints) this.#fingerprints.set(key, value);
    this.#assetIdsByKey.clear();
    for (const [key, value] of nextAssetIdsByKey) this.#assetIdsByKey.set(key, value);
    this.#forceUpsertKeys.clear();
    if (dirty) this.#port.render();
  }

  invalidateAsset(assetId: string): void {
    this.#requireActive();
    this.#port.invalidateAsset?.(assetId);
    for (const [key, currentAssetId] of this.#assetIdsByKey) {
      if (currentAssetId === assetId) this.#forceUpsertKeys.add(key);
    }
  }

  resize(width: number, height: number, resolution: number): void {
    this.#requireActive();
    this.#port.resize(width, height, resolution);
    this.#port.render();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#fingerprints.clear();
    this.#assetIdsByKey.clear();
    this.#forceUpsertKeys.clear();
    this.#port.destroy();
  }

  #requireActive(): void {
    if (!this.#initialized || this.#destroyed) {
      throw new Error("Plan renderer is not active.");
    }
  }
}
