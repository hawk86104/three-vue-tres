import type {
  SceneAssetSource,
  SceneAssetSourcePort,
  SceneMaterialProjection,
  SceneProjection,
  SceneRecord,
  SceneRendererIssueReporter,
} from "./types";

export interface SceneDisposableResource {
  dispose(): void;
}

export interface SceneRecordBinding {
  attach(): void;
  update(
    record: SceneRecord,
    geometry: SceneDisposableResource,
    material: SceneDisposableResource,
  ): void;
  detach(): void;
  dispose?(): void;
}

export interface SceneResourceFactory {
  createGeometry(record: SceneRecord): SceneDisposableResource;
  createMaterial(
    material: SceneMaterialProjection,
    texture: SceneDisposableResource | null,
  ): SceneDisposableResource;
  decodeTexture(source: SceneAssetSource): Promise<SceneDisposableResource>;
  createBinding(
    record: SceneRecord,
    geometry: SceneDisposableResource,
    material: SceneDisposableResource,
  ): SceneRecordBinding;
}

export interface SceneResourceReconciler {
  update(projection: SceneProjection): void;
  settle(): Promise<void>;
  destroy(): void;
}

export interface SceneReconcilerDependencies {
  readonly assetSource: SceneAssetSourcePort;
  readonly issueReporter: SceneRendererIssueReporter;
  readonly resourceFactory: SceneResourceFactory;
}

interface MountedRecord {
  readonly record: SceneRecord;
  readonly recordFingerprint: string;
  readonly geometryFingerprint: string;
  readonly geometry: SceneDisposableResource;
  readonly materialKey: string;
  readonly material: SceneDisposableResource;
  readonly binding: SceneRecordBinding;
}

interface MaterialEntry {
  readonly resource: SceneDisposableResource;
  readonly textureAssetId: string | null;
  references: number;
}

interface TextureEntry {
  readonly resource: SceneDisposableResource;
  references: number;
}

interface PendingTexture {
  generation: number;
  promise: Promise<void>;
}

interface PreparedRecord {
  readonly mounted: MountedRecord;
  readonly existing: MountedRecord | undefined;
  readonly geometryAcquired: boolean;
  readonly materialAcquired: boolean;
}

function fingerprint(value: unknown): string {
  return JSON.stringify(value) ?? "undefined";
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

class DefaultSceneResourceReconciler implements SceneResourceReconciler {
  private readonly materials = new Map<string, MaterialEntry>();
  private readonly textures = new Map<string, TextureEntry>();
  private readonly pendingTextures = new Map<string, PendingTexture>();
  private readonly loadPromises = new Set<Promise<void>>();
  private mounted = new Map<string, MountedRecord>();
  private currentProjection: SceneProjection | null = null;
  private requiredTextureAssetIds = new Set<string>();
  private generation = 0;
  private destroyed = false;

  constructor(private readonly dependencies: SceneReconcilerDependencies) {}

  update(projection: SceneProjection): void {
    if (this.destroyed) return;
    this.applyProjection(projection, () => this.publishProjection(projection));
  }

  private publishProjection(projection: SceneProjection): void {
    this.generation += 1;
    this.currentProjection = projection;
    this.requiredTextureAssetIds = new Set(projection.requiredTextureAssetIds);
    for (const [assetId, pending] of this.pendingTextures) {
      if (this.requiredTextureAssetIds.has(assetId)) {
        pending.generation = this.generation;
      } else {
        this.pendingTextures.delete(assetId);
      }
    }

    for (const assetId of [...this.requiredTextureAssetIds].sort(compareText)) {
      if (!this.textures.has(assetId) && !this.pendingTextures.has(assetId)) {
        this.startTextureLoad(assetId);
      }
    }
  }

  async settle(): Promise<void> {
    while (this.loadPromises.size > 0) {
      await Promise.allSettled([...this.loadPromises]);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation += 1;
    this.currentProjection = null;
    this.requiredTextureAssetIds.clear();
    this.pendingTextures.clear();

    const mounted = [...this.mounted.values()];
    this.mounted.clear();
    const errors: unknown[] = [];
    for (const item of mounted) {
      this.runCleanup(errors, () => item.binding.detach());
      this.runCleanup(errors, () => item.binding.dispose?.());
    }
    for (const item of mounted) {
      this.runCleanup(errors, () => item.geometry.dispose());
      this.runCleanup(errors, () => this.releaseMaterial(item.materialKey));
    }

    const orphanedMaterials = [...this.materials.values()];
    this.materials.clear();
    for (const entry of orphanedMaterials) {
      this.runCleanup(errors, () => entry.resource.dispose());
      const textureAssetId = entry.textureAssetId;
      if (textureAssetId !== null) {
        this.runCleanup(errors, () => this.releaseTexture(textureAssetId));
      }
    }
    const orphanedTextures = [...this.textures.values()];
    this.textures.clear();
    for (const entry of orphanedTextures) {
      this.runCleanup(errors, () => entry.resource.dispose());
    }
    this.throwCleanupError(errors);
  }

  private applyProjection(
    projection: SceneProjection,
    onCommit: () => void = () => undefined,
  ): void {
    const previous = this.mounted;
    const next = new Map<string, MountedRecord>();
    const prepared: PreparedRecord[] = [];

    for (const record of projection.records) {
      const existing = previous.get(record.key);
      const geometryFingerprint = fingerprint(record.geometry);
      let geometry: SceneDisposableResource | undefined;
      let materialKey: string | undefined;
      let material: SceneDisposableResource | undefined;
      let geometryAcquired = false;
      let materialAcquired = false;
      try {
        geometry = existing?.geometryFingerprint === geometryFingerprint
          ? existing.geometry
          : this.dependencies.resourceFactory.createGeometry(record);
        geometryAcquired = geometry !== existing?.geometry;
        materialKey = this.materialKey(record.material);
        material = existing?.materialKey === materialKey
          ? existing.material
          : this.acquireMaterial(materialKey, record.material);
        materialAcquired = material !== existing?.material;
        const binding = existing?.binding
          ?? this.dependencies.resourceFactory.createBinding(record, geometry, material);
        const mounted: MountedRecord = {
          record,
          recordFingerprint: fingerprint(record),
          geometryFingerprint,
          geometry,
          materialKey,
          material,
          binding,
        };
        prepared.push({
          mounted,
          existing,
          geometryAcquired,
          materialAcquired,
        });
        next.set(record.key, mounted);
      } catch (error) {
        const cleanupErrors: unknown[] = [];
        if (materialAcquired && materialKey !== undefined) {
          this.runCleanup(cleanupErrors, () => this.releaseMaterial(materialKey!));
        }
        if (geometryAcquired && geometry !== undefined) {
          this.runCleanup(cleanupErrors, () => geometry!.dispose());
        }
        this.rollbackPreparedResources(prepared, cleanupErrors);
        throw error;
      }
    }

    const mutated: PreparedRecord[] = [];
    try {
      for (const item of prepared) {
        const { existing, mounted } = item;
        if (existing === undefined) {
          mutated.push(item);
          mounted.binding.attach();
        } else if (
          existing.recordFingerprint !== mounted.recordFingerprint
          || existing.geometry !== mounted.geometry
          || existing.material !== mounted.material
        ) {
          mutated.push(item);
          mounted.binding.update(
            mounted.record,
            mounted.geometry,
            mounted.material,
          );
        }
      }
    } catch (error) {
      const cleanupErrors: unknown[] = [];
      for (const item of [...mutated].reverse()) {
        if (item.existing === undefined) {
          this.runCleanup(cleanupErrors, () => item.mounted.binding.detach());
        } else {
          const existing = item.existing;
          this.runCleanup(cleanupErrors, () => item.mounted.binding.update(
            existing.record,
            existing.geometry,
            existing.material,
          ));
        }
      }
      this.rollbackPreparedResources(prepared, cleanupErrors);
      throw error;
    }

    this.mounted = next;
    onCommit();
    const removed = [...previous.values()]
      .filter(({ record }) => !next.has(record.key));
    const errors: unknown[] = [];
    for (const item of removed) {
      this.runCleanup(errors, () => item.binding.detach());
      this.runCleanup(errors, () => item.binding.dispose?.());
    }
    for (const item of prepared) {
      const existing = item.existing;
      if (existing === undefined) continue;
      if (existing.geometry !== item.mounted.geometry) {
        this.runCleanup(errors, () => existing.geometry.dispose());
      }
      if (existing.material !== item.mounted.material) {
        this.runCleanup(errors, () => this.releaseMaterial(existing.materialKey));
      }
    }
    for (const item of removed) {
      this.runCleanup(errors, () => item.geometry.dispose());
      this.runCleanup(errors, () => this.releaseMaterial(item.materialKey));
    }
    this.throwCleanupError(errors);
  }

  private rollbackPreparedResources(
    prepared: readonly PreparedRecord[],
    errors: unknown[],
  ): void {
    for (const item of [...prepared].reverse()) {
      if (item.existing === undefined) {
        this.runCleanup(errors, () => item.mounted.binding.dispose?.());
      }
      if (item.materialAcquired) {
        this.runCleanup(errors, () => this.releaseMaterial(item.mounted.materialKey));
      }
      if (item.geometryAcquired) {
        this.runCleanup(errors, () => item.mounted.geometry.dispose());
      }
    }
  }

  private runCleanup(errors: unknown[], action: () => void): void {
    try {
      action();
    } catch (error) {
      errors.push(error);
    }
  }

  private throwCleanupError(errors: readonly unknown[]): void {
    if (errors.length > 0) throw errors[0];
  }

  private materialKey(material: SceneMaterialProjection): string {
    const textureLoaded = material.textureAssetId !== null
      && this.textures.has(material.textureAssetId);
    return fingerprint({ material, textureLoaded });
  }

  private acquireMaterial(
    key: string,
    material: SceneMaterialProjection,
  ): SceneDisposableResource {
    const existing = this.materials.get(key);
    if (existing !== undefined) {
      existing.references += 1;
      return existing.resource;
    }

    const textureAssetId = material.textureAssetId !== null
      && this.textures.has(material.textureAssetId)
      ? material.textureAssetId
      : null;
    const texture = textureAssetId === null
      ? null
      : this.acquireTexture(textureAssetId);
    try {
      const resource = this.dependencies.resourceFactory.createMaterial(material, texture);
      this.materials.set(key, {
        resource,
        textureAssetId,
        references: 1,
      });
      return resource;
    } catch (error) {
      if (textureAssetId !== null) this.releaseTexture(textureAssetId);
      throw error;
    }
  }

  private releaseMaterial(key: string): void {
    const entry = this.materials.get(key);
    if (entry === undefined) return;
    entry.references -= 1;
    if (entry.references > 0) return;
    this.materials.delete(key);
    const errors: unknown[] = [];
    this.runCleanup(errors, () => entry.resource.dispose());
    const textureAssetId = entry.textureAssetId;
    if (textureAssetId !== null) {
      this.runCleanup(errors, () => this.releaseTexture(textureAssetId));
    }
    this.throwCleanupError(errors);
  }

  private acquireTexture(assetId: string): SceneDisposableResource {
    const entry = this.textures.get(assetId);
    if (entry === undefined) throw new Error("Texture resource is unavailable");
    entry.references += 1;
    return entry.resource;
  }

  private releaseTexture(assetId: string): void {
    const entry = this.textures.get(assetId);
    if (entry === undefined) return;
    entry.references -= 1;
    if (entry.references > 0) return;
    this.textures.delete(assetId);
    entry.resource.dispose();
  }

  private startTextureLoad(assetId: string): void {
    const pending: PendingTexture = {
      generation: this.generation,
      promise: Promise.resolve(),
    };
    this.pendingTextures.set(assetId, pending);
    const promise = this.loadTexture(assetId, pending);
    pending.promise = promise;
    this.loadPromises.add(promise);
    void promise.then(
      () => this.loadPromises.delete(promise),
      () => this.loadPromises.delete(promise),
    );
  }

  private isPendingCurrent(assetId: string, pending: PendingTexture): boolean {
    return !this.destroyed
      && this.pendingTextures.get(assetId) === pending
      && pending.generation === this.generation
      && this.requiredTextureAssetIds.has(assetId);
  }

  private async loadTexture(
    assetId: string,
    pending: PendingTexture,
  ): Promise<void> {
    let source: SceneAssetSource;
    try {
      source = await this.dependencies.assetSource.resolve(assetId);
    } catch {
      this.reportTextureFailure(assetId, pending);
      return;
    }
    if (!this.isPendingCurrent(assetId, pending)) return;

    let texture: SceneDisposableResource;
    try {
      texture = await this.dependencies.resourceFactory.decodeTexture(source);
    } catch {
      this.reportTextureFailure(assetId, pending);
      return;
    }
    if (!this.isPendingCurrent(assetId, pending)) {
      texture.dispose();
      return;
    }

    this.pendingTextures.delete(assetId);
    this.textures.set(assetId, { resource: texture, references: 0 });
    try {
      if (this.currentProjection !== null) this.applyProjection(this.currentProjection);
    } catch (error) {
      const cleanupErrors: unknown[] = [];
      this.disposeUnreferencedTexture(assetId, cleanupErrors);
      throw error;
    }
    const cleanupErrors: unknown[] = [];
    this.disposeUnreferencedTexture(assetId, cleanupErrors);
    this.throwCleanupError(cleanupErrors);
    this.dependencies.issueReporter.clear(assetId);
  }

  private reportTextureFailure(assetId: string, pending: PendingTexture): void {
    if (!this.isPendingCurrent(assetId, pending)) return;
    this.pendingTextures.delete(assetId);
    this.dependencies.issueReporter.report({
      assetId,
      code: "ASSET_CODEC_PREVIEW_UNAVAILABLE",
    });
  }

  private disposeUnreferencedTexture(assetId: string, errors: unknown[]): void {
    const entry = this.textures.get(assetId);
    if (entry === undefined || entry.references > 0) return;
    this.textures.delete(assetId);
    this.runCleanup(errors, () => entry.resource.dispose());
  }
}

export function createSceneReconciler(
  dependencies: SceneReconcilerDependencies,
): SceneResourceReconciler {
  return new DefaultSceneResourceReconciler(dependencies);
}
