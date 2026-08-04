import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  TextureLoader,
  type Group,
  type Object3D,
  type Texture,
} from "three";
import type {
  SceneDisposableResource,
  SceneRecordBinding,
  SceneResourceFactory,
} from "./scene-reconciler";
import type {
  SceneAssetSource,
  SceneMaterialProjection,
  ScenePrimitiveTopology,
  SceneRecord,
} from "./types";

export interface SceneTextureLoader {
  loadAsync(url: string): Promise<Texture>;
}

export interface ThreeSceneResourceFactoryOptions {
  readonly root: Group;
  readonly invalidate: () => void;
  readonly textureLoader?: SceneTextureLoader;
}

class ThreeGeometryResource implements SceneDisposableResource {
  private disposed = false;

  constructor(readonly geometry: BufferGeometry) {}

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.geometry.dispose();
  }
}

class ThreeTextureResource implements SceneDisposableResource {
  private disposed = false;

  constructor(
    readonly texture: Texture,
    private readonly owned = true,
  ) {}

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.owned) this.texture.dispose();
  }
}

class ThreeMaterialResource implements SceneDisposableResource {
  readonly mesh: MeshStandardMaterial;
  readonly line: LineBasicMaterial;
  readonly points: PointsMaterial;
  private disposed = false;

  constructor(
    projection: SceneMaterialProjection,
    texture: Texture | null,
  ) {
    const transparent = projection.opacity < 1;
    this.mesh = new MeshStandardMaterial({
      color: projection.baseColor,
      roughness: projection.roughness,
      metalness: projection.metalness,
      opacity: projection.opacity,
      transparent,
      map: texture,
      side: DoubleSide,
    });
    this.line = new LineBasicMaterial({
      color: projection.baseColor,
      opacity: projection.opacity,
      transparent,
    });
    this.points = new PointsMaterial({
      color: projection.baseColor,
      opacity: projection.opacity,
      transparent,
      map: texture,
      size: 0.12,
      sizeAttenuation: true,
    });
  }

  forTopology(topology: ScenePrimitiveTopology) {
    if (topology === "lines") return this.line;
    if (topology === "points") return this.points;
    return this.mesh;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.dispose();
    this.line.dispose();
    this.points.dispose();
  }
}

function requireGeometry(resource: SceneDisposableResource): ThreeGeometryResource {
  if (!(resource instanceof ThreeGeometryResource)) {
    throw new Error("Expected a Three geometry resource");
  }
  return resource;
}

function requireMaterial(resource: SceneDisposableResource): ThreeMaterialResource {
  if (!(resource instanceof ThreeMaterialResource)) {
    throw new Error("Expected a Three material resource");
  }
  return resource;
}

function textureFrom(resource: SceneDisposableResource | null): Texture | null {
  if (resource === null) return null;
  if (!(resource instanceof ThreeTextureResource)) {
    throw new Error("Expected a Three texture resource");
  }
  return resource.texture;
}

function createGeometry(record: SceneRecord): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(record.geometry.positions, 3),
  );
  if (record.geometry.normals.length > 0) {
    geometry.setAttribute(
      "normal",
      new Float32BufferAttribute(record.geometry.normals, 3),
    );
  }
  if (record.geometry.uvs.length > 0) {
    geometry.setAttribute(
      "uv",
      new Float32BufferAttribute(record.geometry.uvs, 2),
    );
  }
  geometry.setIndex([...record.geometry.indices]);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createObject(
  record: SceneRecord,
  geometry: ThreeGeometryResource,
  material: ThreeMaterialResource,
): Object3D {
  const selectedMaterial = material.forTopology(record.geometry.topology);
  if (record.geometry.topology === "lines") {
    return new LineSegments(geometry.geometry, selectedMaterial);
  }
  if (record.geometry.topology === "points") {
    return new Points(geometry.geometry, selectedMaterial);
  }
  const mesh = new Mesh(geometry.geometry, selectedMaterial);
  mesh.castShadow = record.kind !== "floor" && record.kind !== "opening";
  mesh.receiveShadow = record.kind === "floor" || record.kind === "wall-piece";
  return mesh;
}

function createOverlay(
  record: SceneRecord,
  geometry: ThreeGeometryResource,
): Object3D | null {
  if (record.selectionOverlay === null) return null;
  let overlay: Object3D;
  if (record.geometry.topology === "lines") {
    overlay = new LineSegments(
      geometry.geometry,
      new LineBasicMaterial({
        color: record.selectionOverlay.color,
        depthTest: false,
        transparent: true,
        opacity: 0.95,
      }),
    );
  } else if (record.geometry.topology === "points") {
    overlay = new Points(
      geometry.geometry,
      new PointsMaterial({
        color: record.selectionOverlay.color,
        depthTest: false,
        size: 0.16,
        sizeAttenuation: true,
      }),
    );
  } else {
    overlay = new Mesh(
      geometry.geometry,
      new MeshBasicMaterial({
        color: record.selectionOverlay.color,
        depthTest: false,
        transparent: true,
        opacity: 0.78,
        wireframe: true,
      }),
    );
  }
  overlay.renderOrder = 10_000;
  overlay.userData.selectionId = record.selectionId;
  overlay.userData.selectionOverlay = true;
  return overlay;
}

function disposeOverlay(overlay: Object3D | null): void {
  if (overlay === null) return;
  const object = overlay as Object3D & {
    material?: { dispose(): void } | { dispose(): void }[];
  };
  if (Array.isArray(object.material)) {
    for (const material of object.material) material.dispose();
  } else {
    object.material?.dispose();
  }
  overlay.removeFromParent();
}

class ThreeRecordBinding implements SceneRecordBinding {
  private object: Object3D;
  private overlay: Object3D | null = null;
  private attached = false;
  private disposed = false;

  constructor(
    private record: SceneRecord,
    private geometry: ThreeGeometryResource,
    private material: ThreeMaterialResource,
    private readonly root: Group,
    private readonly invalidate: () => void,
  ) {
    this.object = createObject(record, geometry, material);
    this.configureObject();
  }

  attach(): void {
    if (this.disposed || this.attached) return;
    this.root.add(this.object);
    this.attached = true;
    this.invalidate();
  }

  update(
    record: SceneRecord,
    geometryResource: SceneDisposableResource,
    materialResource: SceneDisposableResource,
  ): void {
    if (this.disposed) return;
    const geometry = requireGeometry(geometryResource);
    const material = requireMaterial(materialResource);
    const topologyChanged = record.geometry.topology !== this.record.geometry.topology;
    this.record = record;
    this.geometry = geometry;
    this.material = material;

    if (topologyChanged) {
      const wasAttached = this.attached;
      this.object.removeFromParent();
      this.disposeSelectionOverlay();
      this.object = createObject(record, geometry, material);
      this.attached = false;
      this.configureObject();
      if (wasAttached) {
        this.root.add(this.object);
        this.attached = true;
      }
    } else {
      const renderable = this.object as Object3D & {
        geometry: BufferGeometry;
        material: ReturnType<ThreeMaterialResource["forTopology"]>;
      };
      renderable.geometry = geometry.geometry;
      renderable.material = material.forTopology(record.geometry.topology);
      this.configureObject();
    }
    this.invalidate();
  }

  detach(): void {
    if (!this.attached) return;
    this.object.removeFromParent();
    this.attached = false;
    this.invalidate();
  }

  dispose(): void {
    if (this.disposed) return;
    this.detach();
    this.disposed = true;
    this.disposeSelectionOverlay();
    this.object.clear();
  }

  private configureObject(): void {
    this.object.name = this.record.key;
    this.object.userData.sceneRecordKey = this.record.key;
    this.object.userData.selectionId = this.record.selectionId;
    this.object.userData.sourceIds = [...this.record.sourceIds];
    this.disposeSelectionOverlay();
    this.overlay = createOverlay(this.record, this.geometry);
    if (this.overlay !== null) this.object.add(this.overlay);
  }

  private disposeSelectionOverlay(): void {
    disposeOverlay(this.overlay);
    this.overlay = null;
  }
}

export function createThreeSceneResourceFactory(
  options: ThreeSceneResourceFactoryOptions,
): SceneResourceFactory {
  const textureLoader = options.textureLoader ?? new TextureLoader();
  return {
    createGeometry(record) {
      return new ThreeGeometryResource(createGeometry(record));
    },
    createMaterial(material, texture) {
      return new ThreeMaterialResource(material, textureFrom(texture));
    },
    async decodeTexture(source: SceneAssetSource) {
      const texture = await textureLoader.loadAsync(source.url);
      texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
      return new ThreeTextureResource(texture);
    },
    createBinding(record, geometry, material) {
      return new ThreeRecordBinding(
        record,
        requireGeometry(geometry),
        requireMaterial(material),
        options.root,
        options.invalidate,
      );
    },
  };
}

export function borrowThreeTexture(
  texture: Texture,
): SceneDisposableResource {
  return new ThreeTextureResource(texture, false);
}
