import {
  Application,
  Container,
  Graphics,
  Rectangle,
  type FederatedPointerEvent,
  type FederatedWheelEvent,
} from "pixi.js";
import { projectScene } from "./scene-projection";
import type {
  PlanPointerEvent,
  PlanRenderPort,
  PlanRenderPortFactory,
  PlanRenderer,
  PlanRendererEventSink,
  PlanRendererInput,
  RenderNode,
} from "./types";

type RenderLayer = RenderNode["layer"];
const MOUSE_POINTER_ID = 1;

interface GraphicsEntry {
  readonly graphics: Graphics;
  layer: RenderLayer;
  fingerprint: string;
}

interface LayerContainers {
  readonly grid: Container;
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

function destroyApplication(application: Application): void {
  application.destroy(
    { removeView: true, releaseGlobalResources: true },
    { children: true, texture: true, textureSource: true },
  );
}

function tryDestroyApplication(application: Application): void {
  try {
    destroyApplication(application);
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
    case "dimension":
      graphics.moveTo(geometry.start.x, geometry.start.y)
        .lineTo(geometry.end.x, geometry.end.y)
        .stroke(stroke)
        .circle(geometry.label.x, geometry.label.y, 2.5)
        .fill({ color: paint.color, alpha: paint.alpha });
      break;
  }
}

class PixiRenderPort implements PlanRenderPort {
  readonly #entries = new Map<string, GraphicsEntry>();
  #application: Application | null = null;
  #layers: LayerContainers | null = null;
  #interactionBounds: Rectangle | null = null;
  #inputBridge: PointerInputBridge | null = null;
  #initialization: Promise<void> | null = null;
  #destroyed = false;

  init(host: HTMLElement, sink: PlanRendererEventSink): Promise<void> {
    if (this.#destroyed) {
      return Promise.reject(new Error("Cannot initialize a destroyed Pixi render port."));
    }
    if (this.#application !== null) return Promise.resolve();
    if (this.#initialization === null) {
      this.#initialization = this.#initialize(host, sink).catch((error: unknown) => {
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
        tryDestroyApplication(application);
        return;
      }

      const grid = new Container({ label: "grid", eventMode: "none" });
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
      application.stage.addChild(grid, content, annotation, overlay, interaction);

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
      this.#layers = { grid, content, annotation, overlay, interaction };
      this.#interactionBounds = interactionBounds;
      this.#inputBridge = inputBridge;
    } catch (error) {
      inputBridge?.destroy();
      tryDestroyApplication(application);
      throw error;
    }
  }

  upsert(node: RenderNode): void {
    const layers = this.#requireLayers();
    const nextFingerprint = fingerprint(node);
    const existing = this.#entries.get(node.key);
    if (existing?.fingerprint === nextFingerprint) return;

    const entry = existing ?? {
      graphics: new Graphics({ label: node.key, eventMode: "none" }),
      layer: node.layer,
      fingerprint: "",
    };
    if (existing === undefined) {
      layerContainer(layers, node.layer).addChild(entry.graphics);
      this.#entries.set(node.key, entry);
    } else if (existing.layer !== node.layer) {
      existing.graphics.removeFromParent();
      layerContainer(layers, node.layer).addChild(existing.graphics);
    }
    drawNode(entry.graphics, node);
    entry.layer = node.layer;
    entry.fingerprint = nextFingerprint;
    restoreLayerOrder(layerContainer(layers, node.layer));
  }

  remove(key: string): void {
    const entry = this.#entries.get(key);
    if (entry === undefined) return;
    entry.graphics.removeFromParent();
    entry.graphics.destroy({ context: true });
    this.#entries.delete(key);
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
    for (const key of [...this.#entries.keys()]) this.remove(key);
    const application = this.#application;
    this.#inputBridge?.destroy();
    this.#application = null;
    this.#layers = null;
    this.#interactionBounds = null;
    this.#inputBridge = null;
    if (application !== null) destroyApplication(application);
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

export function createPixiRenderPort(): PlanRenderPort {
  return new PixiRenderPort();
}

export class PixiPlanRenderer implements PlanRenderer {
  readonly #port: PlanRenderPort;
  readonly #fingerprints = new Map<string, string>();
  #initialized = false;
  #initialization: Promise<void> | null = null;
  #destroyed = false;

  constructor(portFactory: PlanRenderPortFactory = createPixiRenderPort) {
    this.#port = portFactory();
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
    let dirty = false;
    for (const node of scene.nodes) {
      const nextFingerprint = fingerprint(node);
      nextFingerprints.set(node.key, nextFingerprint);
      if (this.#fingerprints.get(node.key) === nextFingerprint) continue;
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
    if (dirty) this.#port.render();
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
    this.#port.destroy();
  }

  #requireActive(): void {
    if (!this.#initialized || this.#destroyed) {
      throw new Error("Plan renderer is not active.");
    }
  }
}
