import { OrbitControls } from "@react-three/drei";
import {
  Canvas,
  type RootState,
  type ThreeEvent,
  useThree,
} from "@react-three/fiber";
import {
  Component,
  useEffect,
  useRef,
  type ElementRef,
  type ReactNode,
} from "react";
import {
  createRoot as createDomRoot,
  type Root as DomRoot,
} from "react-dom/client";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  PCFSoftShadowMap,
  PerspectiveCamera,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  UnsignedByteType,
  Vector4,
  WebGLRenderTarget,
  type Object3D,
  type Texture,
  type ToneMapping,
  type WebGLRenderer,
} from "three";
import {
  renderSceneOffscreen,
  SceneOffscreenQueue,
  type SceneOffscreenDriver,
} from "./offscreen-render";
import {
  createSceneReconciler,
  type SceneDisposableResource,
  type SceneRecordBinding,
  type SceneResourceReconciler,
} from "./scene-reconciler";
import { frameCameraToProjection } from "./scene-camera";
import {
  borrowThreeTexture,
  createThreeSceneResourceFactory,
  type SceneTextureLoader,
} from "./three-resources";
import type {
  SceneCameraState,
  SceneExportRenderRequest,
  SceneFrameTarget,
  SceneGpuLimits,
  SceneProjection,
  SceneRendererDependencies,
} from "./types";
import type {
  SceneRendererBackend,
  SceneRendererBackendEvents,
} from "./renderer";

type ControlsHandle = ElementRef<typeof OrbitControls>;

interface SurfaceCallbacks {
  readonly onSelectionChange: (selectedIds: ReadonlySet<string>) => void;
  readonly onCameraChange: (camera: SceneCameraState) => void;
  readonly onContextLost: () => void;
}

interface VisibleRendererState {
  readonly target: WebGLRenderTarget | null;
  readonly viewport: Vector4;
  readonly scissor: Vector4;
  readonly scissorTest: boolean;
  readonly clearColor: Color;
  readonly clearAlpha: number;
  readonly autoClear: boolean;
  readonly toneMapping: ToneMapping;
  readonly outputColorSpace: string;
  readonly shadowEnabled: boolean;
  readonly xrEnabled: boolean;
}

export interface OffscreenRenderable {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly bindings: readonly SceneRecordBinding[];
  readonly geometries: readonly SceneDisposableResource[];
  readonly materials: readonly SceneDisposableResource[];
  readonly shadowOwners: readonly { dispose(): void }[];
}

interface BoundaryProps {
  readonly children: ReactNode;
  readonly onError: (error: Error) => void;
}

interface BoundaryState {
  readonly failed: boolean;
}

class CanvasErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    this.props.onError(error);
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

function findSelectionId(object: Object3D): string | null {
  let current: Object3D | null = object;
  while (current !== null) {
    const value = current.userData.selectionId;
    if (typeof value === "string" && value.length > 0) return value;
    current = current.parent;
  }
  return null;
}

function SurfaceScene(props: {
  readonly surface: R3FSceneSurface;
  readonly projection: SceneProjection | null;
  readonly cameraState: SceneCameraState | null;
}) {
  const controlsRef = useRef<ControlsHandle>(null);
  const state = useThree();
  const perspective = state.camera as PerspectiveCamera;
  const environment = props.projection?.environment ?? null;

  useEffect(() => {
    props.surface.attachView(
      perspective,
      controlsRef.current,
      state.invalidate,
      (width, height) => state.setSize(width, height),
    );
    if (props.cameraState !== null) {
      props.surface.applyCamera(props.cameraState);
    }
  }, [
    perspective,
    props.cameraState,
    props.surface,
    state,
  ]);

  const shadowBounds = environment?.shadows.cameraBounds ?? null;
  const shadowDepth = shadowBounds === null
    ? 100
    : Math.max(
      100,
      shadowBounds.max.y - shadowBounds.min.y
        + shadowBounds.max.z - shadowBounds.min.z,
    );

  return (
    <>
      <primitive
        object={props.surface.rootGroup}
        dispose={null}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          props.surface.select(findSelectionId(event.object));
        }}
      />
      {environment === null ? null : (
        <>
          <color attach="background" args={[environment.backgroundColor]} />
          <ambientLight
            color={environment.ambient.color}
            intensity={environment.ambient.intensity}
          />
          <directionalLight
            color={environment.key.color}
            intensity={environment.key.intensity}
            position={[
              environment.key.position.x,
              environment.key.position.y,
              environment.key.position.z,
            ]}
            castShadow={environment.shadows.enabled}
            shadow-radius={environment.shadows.radius}
            shadow-camera-left={shadowBounds?.min.x ?? -10}
            shadow-camera-right={shadowBounds?.max.x ?? 10}
            shadow-camera-bottom={shadowBounds?.min.z ?? -10}
            shadow-camera-top={shadowBounds?.max.z ?? 10}
            shadow-camera-near={0.01}
            shadow-camera-far={shadowDepth}
          />
        </>
      )}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        onChange={() => props.surface.emitCamera()}
      />
    </>
  );
}

function configureDirectionalLight(
  light: DirectionalLight,
  projection: SceneProjection,
): void {
  const environment = projection.environment;
  if (environment === null) return;
  light.color.set(environment.key.color);
  light.intensity = environment.key.intensity;
  light.position.set(
    environment.key.position.x,
    environment.key.position.y,
    environment.key.position.z,
  );
  light.castShadow = environment.shadows.enabled;
  light.shadow.radius = environment.shadows.radius;
  const bounds = environment.shadows.cameraBounds;
  if (bounds !== null) {
    light.shadow.camera.left = bounds.min.x;
    light.shadow.camera.right = bounds.max.x;
    light.shadow.camera.bottom = bounds.min.z;
    light.shadow.camera.top = bounds.max.z;
    light.shadow.camera.near = 0.01;
    light.shadow.camera.far = Math.max(
      100,
      bounds.max.y - bounds.min.y + bounds.max.z - bounds.min.z,
    );
    light.shadow.camera.updateProjectionMatrix();
  }
}

export function disposeOffscreenRenderable(renderable: OffscreenRenderable): void {
  let failure: unknown;
  const cleanup = (operation: () => void): void => {
    try {
      operation();
    } catch (error) {
      if (failure === undefined) failure = error;
    }
  };
  for (const binding of renderable.bindings) {
    cleanup(() => binding.detach());
    cleanup(() => binding.dispose?.());
  }
  for (const geometry of renderable.geometries) {
    cleanup(() => geometry.dispose());
  }
  for (const material of renderable.materials) {
    cleanup(() => material.dispose());
  }
  for (const shadowOwner of renderable.shadowOwners) {
    cleanup(() => shadowOwner.dispose());
  }
  cleanup(() => renderable.scene.clear());
  if (failure !== undefined) throw failure;
}

export class R3FSceneSurface {
  readonly rootGroup = new Group();
  private domRoot: DomRoot | null = null;
  private rootState: RootState | null = null;
  private renderer: WebGLRenderer | null = null;
  private camera: PerspectiveCamera | null = null;
  private controls: ControlsHandle | null = null;
  private invalidateView: (() => void) | null = null;
  private setViewSize: ((width: number, height: number) => void) | null = null;
  private callbacks: SurfaceCallbacks | null = null;
  private projection: SceneProjection | null = null;
  private cameraState: SceneCameraState | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;
  private readonly exportTextures = new Map<string, Texture>();
  private readonly exportTextureLoads = new Map<string, Promise<Texture>>();
  private contextCanvas: HTMLCanvasElement | null = null;
  private destroyed = false;
  private readonly offscreenQueue = new SceneOffscreenQueue();

  constructor(
    private readonly dependencies: SceneRendererDependencies,
    private readonly textureLoader: SceneTextureLoader = new TextureLoader(),
  ) {
    this.rootGroup.name = "AetherTwinSceneRecords";
  }

  init(host: HTMLElement, callbacks: SurfaceCallbacks): Promise<void> {
    if (this.destroyed) return Promise.reject(new Error("R3F surface is destroyed"));
    this.callbacks = callbacks;
    return new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
      try {
        this.domRoot = createDomRoot(host);
        this.renderCanvas();
      } catch (error) {
        this.failInitialization(error);
      }
    });
  }

  update(projection: SceneProjection, camera: SceneCameraState): void {
    if (this.destroyed) return;
    this.projection = projection;
    this.cameraState = camera;
    this.renderCanvas();
    this.applyCamera(camera);
    this.invalidate();
  }

  resize(width: number, height: number, devicePixelRatio: number): void {
    if (this.destroyed) return;
    const renderer = this.renderer;
    if (renderer !== null) {
      renderer.setPixelRatio(Math.max(0.25, Math.min(4, devicePixelRatio)));
    }
    this.setViewSize?.(width, height);
    this.invalidate();
  }

  frame(target: SceneFrameTarget): void {
    if (this.projection === null || this.cameraState === null) return;
    const framed = frameCameraToProjection(
      this.projection,
      this.cameraState,
      target,
      this.camera?.aspect ?? 1,
    );
    if (framed === null) return;
    this.cameraState = framed;
    this.applyCamera(framed);
    this.callbacks?.onCameraChange(framed);
    this.invalidate();
  }

  getLimits(): SceneGpuLimits {
    const renderer = this.requireRenderer();
    const context = renderer.getContext();
    return Object.freeze({
      maxTextureSize: Number(context.getParameter(context.MAX_TEXTURE_SIZE)),
      maxRenderbufferSize: Number(
        context.getParameter(context.MAX_RENDERBUFFER_SIZE),
      ),
      maxSamples: renderer.capabilities.maxSamples,
    });
  }

  async waitForExportTextures(assetIds: readonly string[]): Promise<void> {
    await Promise.all(
      [...new Set(assetIds)].sort().map((assetId) => this.loadExportTexture(assetId)),
    );
  }

  renderOffscreen(
    projection: SceneProjection,
    camera: SceneCameraState,
    request: SceneExportRenderRequest,
  ): Promise<Uint8Array> {
    return this.offscreenQueue.run(
      () => this.renderOffscreenNow(projection, camera, request),
    );
  }

  private async renderOffscreenNow(
    projection: SceneProjection,
    camera: SceneCameraState,
    request: SceneExportRenderRequest,
  ): Promise<Uint8Array> {
    const renderer = this.requireRenderer();
    const limits = this.getLimits();
    const maximum = Math.min(limits.maxTextureSize, limits.maxRenderbufferSize);
    if (request.width > maximum || request.height > maximum) {
      throw new Error("Offscreen render dimensions exceed GPU limits");
    }

    const driver: SceneOffscreenDriver<
      VisibleRendererState,
      WebGLRenderTarget,
      OffscreenRenderable
    > = {
      captureVisibleState: () => ({
        target: renderer.getRenderTarget(),
        viewport: renderer.getViewport(new Vector4()).clone(),
        scissor: renderer.getScissor(new Vector4()).clone(),
        scissorTest: renderer.getScissorTest(),
        clearColor: renderer.getClearColor(new Color()).clone(),
        clearAlpha: renderer.getClearAlpha(),
        autoClear: renderer.autoClear,
        toneMapping: renderer.toneMapping,
        outputColorSpace: renderer.outputColorSpace,
        shadowEnabled: renderer.shadowMap.enabled,
        xrEnabled: renderer.xr.enabled,
      }),
      createRenderable: (sceneProjection, cameraState, width, height) => (
        this.createOffscreenRenderable(sceneProjection, cameraState, width, height)
      ),
      createRenderTarget: (width, height) => {
        const target = new WebGLRenderTarget(width, height, {
          format: RGBAFormat,
          type: UnsignedByteType,
          depthBuffer: true,
          stencilBuffer: false,
          samples: Math.min(4, limits.maxSamples),
        });
        target.texture.colorSpace = SRGBColorSpace;
        return target;
      },
      bindRenderTarget: (target, width, height) => {
        renderer.setRenderTarget(target);
        renderer.setViewport(0, 0, width, height);
        renderer.setScissor(0, 0, width, height);
        renderer.setScissorTest(false);
        renderer.setClearColor(
          projection.environment?.backgroundColor ?? "#101820",
          1,
        );
        renderer.autoClear = true;
        renderer.toneMapping = ACESFilmicToneMapping;
        renderer.outputColorSpace = SRGBColorSpace;
        renderer.shadowMap.enabled = projection.environment?.shadows.enabled ?? false;
        renderer.xr.enabled = false;
      },
      render: (renderable) => {
        renderer.render(renderable.scene, renderable.camera);
      },
      readRgba: async (target, width, height, rgba) => {
        await renderer.readRenderTargetPixelsAsync(
          target,
          0,
          0,
          width,
          height,
          rgba,
        );
      },
      restoreVisibleState: (state) => {
        renderer.setRenderTarget(state.target);
        renderer.setViewport(state.viewport);
        renderer.setScissor(state.scissor);
        renderer.setScissorTest(state.scissorTest);
        renderer.setClearColor(state.clearColor, state.clearAlpha);
        renderer.autoClear = state.autoClear;
        renderer.toneMapping = state.toneMapping;
        renderer.outputColorSpace = state.outputColorSpace;
        renderer.shadowMap.enabled = state.shadowEnabled;
        renderer.xr.enabled = state.xrEnabled;
      },
      disposeRenderTarget: (target) => target.dispose(),
      disposeRenderable: disposeOffscreenRenderable,
    };

    return renderSceneOffscreen(driver, projection, camera, request);
  }

  attachView(
    camera: PerspectiveCamera,
    controls: ControlsHandle | null,
    invalidate: () => void,
    setSize: (width: number, height: number) => void,
  ): void {
    this.camera = camera;
    this.controls = controls;
    this.invalidateView = invalidate;
    this.setViewSize = setSize;
    if (this.cameraState !== null) this.applyCamera(this.cameraState);
  }

  handleCreated(state: RootState): void {
    if (this.destroyed) return;
    const renderer = state.gl as WebGLRenderer;
    if (
      typeof renderer.getContext !== "function" ||
      typeof renderer.readRenderTargetPixelsAsync !== "function"
    ) {
      this.failInitialization(new Error("R3F did not create a WebGL renderer"));
      return;
    }
    this.rootState = state;
    this.renderer = renderer;
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    this.contextCanvas = renderer.domElement;
    this.contextCanvas.addEventListener("webglcontextlost", this.onContextLost);
    const resolve = this.readyResolve;
    this.readyResolve = null;
    this.readyReject = null;
    resolve?.();
    state.invalidate();
  }

  applyCamera(cameraState: SceneCameraState): void {
    const camera = this.camera;
    if (camera === null) return;
    camera.position.set(
      cameraState.position.x,
      cameraState.position.y,
      cameraState.position.z,
    );
    camera.fov = cameraState.fieldOfView;
    camera.near = 0.01;
    camera.far = 10_000;
    camera.updateProjectionMatrix();
    if (this.controls !== null) {
      this.controls.target.set(
        cameraState.target.x,
        cameraState.target.y,
        cameraState.target.z,
      );
      this.controls.update();
    } else {
      camera.lookAt(
        cameraState.target.x,
        cameraState.target.y,
        cameraState.target.z,
      );
    }
  }

  emitCamera(): void {
    if (this.camera === null) return;
    const target = this.controls?.target ?? this.cameraState?.target;
    if (target === undefined) return;
    const next = Object.freeze({
      position: Object.freeze({
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
      }),
      target: Object.freeze({ x: target.x, y: target.y, z: target.z }),
      fieldOfView: this.camera.fov,
    });
    this.cameraState = next;
    this.callbacks?.onCameraChange(next);
    this.invalidate();
  }

  select(selectionId: string | null): void {
    this.callbacks?.onSelectionChange(
      selectionId === null ? new Set() : new Set([selectionId]),
    );
  }

  invalidate(): void {
    this.invalidateView?.();
    this.rootState?.invalidate();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const contextCanvas = this.contextCanvas;
    const domRoot = this.domRoot;
    const reject = this.readyReject;
    const textures = [...this.exportTextures.values()];
    this.contextCanvas = null;
    this.readyResolve = null;
    this.readyReject = null;
    this.domRoot = null;
    this.rootState = null;
    this.renderer = null;
    this.camera = null;
    this.controls = null;
    this.invalidateView = null;
    this.setViewSize = null;
    this.exportTextures.clear();
    this.exportTextureLoads.clear();
    this.callbacks = null;

    let failure: unknown;
    const cleanup = (operation: () => void): void => {
      try {
        operation();
      } catch (error) {
        if (failure === undefined) failure = error;
      }
    };
    if (contextCanvas !== null) {
      cleanup(() => contextCanvas.removeEventListener(
        "webglcontextlost",
        this.onContextLost,
      ));
    }
    reject?.(new Error("R3F surface was destroyed during initialization"));
    if (domRoot !== null) cleanup(() => domRoot.unmount());
    for (const texture of textures) {
      cleanup(() => texture.dispose());
    }
    if (failure !== undefined) throw failure;
  }

  private renderCanvas(): void {
    if (this.domRoot === null || this.destroyed) return;
    this.domRoot.render(
      <CanvasErrorBoundary onError={(error) => this.failInitialization(error)}>
        <Canvas
          frameloop="demand"
          shadows
          camera={{
            position: [8, 6, 8],
            fov: 45,
            near: 0.01,
            far: 10_000,
          }}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
          }}
          onCreated={(state) => this.handleCreated(state)}
          onPointerMissed={() => this.select(null)}
        >
          <SurfaceScene
            surface={this}
            projection={this.projection}
            cameraState={this.cameraState}
          />
        </Canvas>
      </CanvasErrorBoundary>,
    );
  }

  private createOffscreenRenderable(
    projection: SceneProjection,
    cameraState: SceneCameraState,
    width: number,
    height: number,
  ): OffscreenRenderable {
    const scene = new Scene();
    const group = new Group();
    scene.add(group);
    const camera = new PerspectiveCamera(
      cameraState.fieldOfView,
      width / height,
      0.01,
      10_000,
    );
    camera.position.set(
      cameraState.position.x,
      cameraState.position.y,
      cameraState.position.z,
    );
    camera.lookAt(
      cameraState.target.x,
      cameraState.target.y,
      cameraState.target.z,
    );
    camera.updateProjectionMatrix();

    const bindings: SceneRecordBinding[] = [];
    const geometries: SceneDisposableResource[] = [];
    const materials: SceneDisposableResource[] = [];
    const shadowOwners: Array<{ dispose(): void }> = [];
    const environment = projection.environment;
    if (environment !== null) {
      scene.background = new Color(environment.backgroundColor);
      scene.add(new AmbientLight(
        environment.ambient.color,
        environment.ambient.intensity,
      ));
      const key = new DirectionalLight();
      configureDirectionalLight(key, projection);
      shadowOwners.push(key.shadow);
      scene.add(key);
    }

    const factory = createThreeSceneResourceFactory({
      root: group,
      invalidate: () => undefined,
    });
    try {
      for (const record of projection.records) {
        const geometry = factory.createGeometry(record);
        geometries.push(geometry);
        const texture = record.material.textureAssetId === null
          ? null
          : this.exportTextures.get(record.material.textureAssetId) ?? null;
        const material = factory.createMaterial(
          record.material,
          texture === null ? null : borrowThreeTexture(texture),
        );
        materials.push(material);
        const binding = factory.createBinding(record, geometry, material);
        bindings.push(binding);
        binding.attach();
      }
    } catch (error) {
      try {
        disposeOffscreenRenderable({
          scene,
          camera,
          bindings,
          geometries,
          materials,
          shadowOwners,
        });
      } catch {
        // Preserve the acquisition failure after attempting every cleanup.
      }
      throw error;
    }
    return {
      scene,
      camera,
      bindings,
      geometries,
      materials,
      shadowOwners,
    };
  }

  private async loadExportTexture(assetId: string): Promise<Texture> {
    const cached = this.exportTextures.get(assetId);
    if (cached !== undefined) return cached;
    const existing = this.exportTextureLoads.get(assetId);
    if (existing !== undefined) return existing;
    const pending = (async () => {
      try {
        const source = await this.dependencies.assetSource.resolve(assetId);
        if (this.destroyed) {
          throw new Error("Scene renderer was destroyed while resolving export texture");
        }
        const texture = await this.textureLoader.loadAsync(source.url);
        texture.colorSpace = SRGBColorSpace;
        texture.needsUpdate = true;
        if (this.destroyed) {
          texture.dispose();
          throw new Error("Scene renderer was destroyed while loading export texture");
        }
        this.exportTextures.set(assetId, texture);
        this.dependencies.issueReporter.clear(assetId);
        return texture;
      } catch (error) {
        if (this.destroyed) {
          throw error;
        }
        this.dependencies.issueReporter.report({
          assetId,
          code: "ASSET_CODEC_PREVIEW_UNAVAILABLE",
        });
        throw new Error("Texture is unavailable for scene export", {
          cause: error,
        });
      } finally {
        this.exportTextureLoads.delete(assetId);
      }
    })();
    this.exportTextureLoads.set(assetId, pending);
    return pending;
  }

  private requireRenderer(): WebGLRenderer {
    if (this.renderer === null || this.destroyed) {
      throw new Error("R3F WebGL renderer is not ready");
    }
    return this.renderer;
  }

  private failInitialization(error: unknown): void {
    const normalized = error instanceof Error
      ? error
      : new Error("R3F WebGL initialization failed");
    const reject = this.readyReject;
    this.readyResolve = null;
    this.readyReject = null;
    reject?.(normalized);
  }

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.callbacks?.onContextLost();
  };
}

class R3FSceneBackend implements SceneRendererBackend {
  private readonly surface: R3FSceneSurface;
  private readonly reconciler: SceneResourceReconciler;
  private destroyed = false;

  constructor(dependencies: SceneRendererDependencies) {
    this.surface = new R3FSceneSurface(dependencies);
    this.reconciler = createSceneReconciler({
      assetSource: dependencies.assetSource,
      issueReporter: dependencies.issueReporter,
      resourceFactory: createThreeSceneResourceFactory({
        root: this.surface.rootGroup,
        invalidate: () => this.surface.invalidate(),
      }),
    });
  }

  async init(
    host: HTMLElement,
    events: SceneRendererBackendEvents,
  ): Promise<void> {
    await this.surface.init(host, {
      onSelectionChange: events.onSelectionChange,
      onCameraChange: events.onCameraChange,
      onContextLost: events.onContextLost,
    });
  }

  update(projection: SceneProjection, camera: SceneCameraState): void {
    if (this.destroyed) return;
    this.reconciler.update(projection);
    this.surface.update(projection, camera);
  }

  resize(width: number, height: number, devicePixelRatio: number): void {
    this.surface.resize(width, height, devicePixelRatio);
  }

  frame(target: SceneFrameTarget): void {
    this.surface.frame(target);
  }

  getLimits(): SceneGpuLimits {
    return this.surface.getLimits();
  }

  async waitForTextures(assetIds: readonly string[]): Promise<void> {
    await this.surface.waitForExportTextures(assetIds);
  }

  async renderOffscreen(
    projection: SceneProjection,
    camera: SceneCameraState,
    request: SceneExportRenderRequest,
  ): Promise<Uint8Array> {
    return this.surface.renderOffscreen(projection, camera, request);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    let failure: unknown;
    try {
      this.reconciler.destroy();
    } catch (error) {
      failure = error;
    }
    try {
      this.surface.destroy();
    } catch (error) {
      if (failure === undefined) failure = error;
    }
    if (failure !== undefined) throw failure;
  }
}

export function createR3FSceneBackend(
  dependencies: SceneRendererDependencies,
): SceneRendererBackend {
  return new R3FSceneBackend(dependencies);
}
