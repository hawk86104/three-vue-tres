import type {
  SceneAssetSource,
  SceneGeometry,
  SceneMaterialProjection,
  SceneProjection,
  SceneRecord,
} from "./types";
import {
  createSceneReconciler,
  type SceneDisposableResource,
  type SceneRecordBinding,
  type SceneResourceFactory,
} from "./scene-reconciler";
import { describe, expect, it } from "vitest";

class Deferred<T> {
  readonly promise: Promise<T>;
  private resolvePromise!: (value: T) => void;
  private rejectPromise!: (reason: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
  }

  resolve(value: T): void {
    this.resolvePromise(value);
  }

  reject(reason: unknown): void {
    this.rejectPromise(reason);
  }
}

class FakeResource implements SceneDisposableResource {
  disposeCount = 0;

  constructor(
    readonly id: string,
    private readonly onDispose: () => void = () => undefined,
  ) {}

  dispose(): void {
    this.disposeCount += 1;
    if (this.disposeCount === 1) this.onDispose();
  }
}

class FakeBinding implements SceneRecordBinding {
  attachCount = 0;
  detachCount = 0;
  readonly updates: Array<{
    readonly record: SceneRecord;
    readonly geometry: FakeResource;
    readonly material: FakeResource;
  }> = [];

  constructor(
    readonly key: string,
    private readonly events: string[],
    readonly initialGeometry: FakeResource,
    readonly initialMaterial: FakeResource,
  ) {}

  attach(): void {
    this.attachCount += 1;
    this.events.push("attach:" + this.key);
  }

  update(
    record: SceneRecord,
    geometry: SceneDisposableResource,
    material: SceneDisposableResource,
  ): void {
    this.updates.push({
      record,
      geometry: geometry as FakeResource,
      material: material as FakeResource,
    });
    this.events.push("update:" + this.key);
  }

  detach(): void {
    this.detachCount += 1;
    this.events.push("detach:" + this.key);
  }
}

class FakeFactory implements SceneResourceFactory {
  readonly events: string[] = [];
  readonly geometries: Array<{ readonly key: string; readonly resource: FakeResource }> = [];
  readonly materials: Array<{
    readonly projection: SceneMaterialProjection;
    readonly texture: FakeResource | null;
    readonly resource: FakeResource;
  }> = [];
  readonly textures: FakeResource[] = [];
  readonly bindings = new Map<string, FakeBinding>();
  readonly decodeCalls: SceneAssetSource[] = [];
  private nextResource = 0;

  constructor(
    private readonly decodeImpl: (
      source: SceneAssetSource,
    ) => Promise<FakeResource> = async (source) => new FakeResource("texture:" + source.assetId),
  ) {}

  createGeometry(record: SceneRecord): FakeResource {
    const resource = new FakeResource("geometry:" + record.key + ":" + this.nextResource++, () => this.events.push("dispose-geometry:" + record.key));
    this.geometries.push({ key: record.key, resource });
    this.events.push("create-geometry:" + record.key);
    return resource;
  }

  createMaterial(
    material: SceneMaterialProjection,
    texture: SceneDisposableResource | null,
  ): FakeResource {
    const resource = new FakeResource("material:" + this.nextResource++);
    this.materials.push({
      projection: material,
      texture: texture as FakeResource | null,
      resource,
    });
    this.events.push("create-material:" + material.baseColor);
    return resource;
  }

  async decodeTexture(source: SceneAssetSource): Promise<FakeResource> {
    this.decodeCalls.push(source);
    const texture = await this.decodeImpl(source);
    this.textures.push(texture);
    return texture;
  }

  createBinding(
    record: SceneRecord,
    geometry: SceneDisposableResource,
    material: SceneDisposableResource,
  ): FakeBinding {
    const binding = new FakeBinding(
      record.key,
      this.events,
      geometry as FakeResource,
      material as FakeResource,
    );
    this.bindings.set(record.key, binding);
    this.events.push("create-binding:" + record.key);
    return binding;
  }
}

class FakeIssueReporter {
  readonly reports: Array<{ readonly assetId: string; readonly code: string }> = [];
  readonly clears: string[] = [];

  report(issue: { readonly assetId: string; readonly code: "ASSET_CODEC_PREVIEW_UNAVAILABLE" }): void {
    this.reports.push(issue);
  }

  clear(assetId: string): void {
    this.clears.push(assetId);
  }
}

function geometry(offset = 0): SceneGeometry {
  return {
    topology: "triangles",
    positions: [
      offset, 0, 0,
      offset + 1, 0, 0,
      offset, 0, -1,
    ],
    indices: [0, 1, 2],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0],
    uvs: [0, 0, 1, 0, 0, 1],
  };
}

function material(overrides: Partial<SceneMaterialProjection> = {}): SceneMaterialProjection {
  return {
    role: "fixture",
    definitionId: null,
    baseColor: "#78909c",
    roughness: 0.6,
    metalness: 0.08,
    opacity: 1,
    textureAssetId: null,
    textureColorSpace: null,
    ...overrides,
  };
}

function record(
  key: string,
  options: {
    readonly geometryOffset?: number;
    readonly material?: SceneMaterialProjection;
    readonly selected?: boolean;
  } = {},
): SceneRecord {
  return {
    key,
    kind: "fixture-part",
    sourceIds: [key],
    selectionId: key,
    selected: options.selected ?? false,
    bounds: {
      min: { x: options.geometryOffset ?? 0, y: 0, z: -1 },
      max: { x: (options.geometryOffset ?? 0) + 1, y: 1, z: 0 },
    },
    geometry: geometry(options.geometryOffset),
    material: options.material ?? material(),
    materialTargetId: key,
    selectionOverlay: options.selected ? { color: "#58b8c4" } : null,
  };
}

function projection(records: readonly SceneRecord[]): SceneProjection {
  const requiredTextureAssetIds = [...new Set(records.flatMap(({ material: value }) => (
    value.textureAssetId === null ? [] : [value.textureAssetId]
  )))].sort();
  return {
    records,
    bounds: records.length === 0
      ? null
      : { min: { x: 0, y: 0, z: -1 }, max: { x: 10, y: 1, z: 0 } },
    requiredTextureAssetIds,
    environment: null,
    issues: [],
  };
}

function assetSource(assetId: string): SceneAssetSource {
  return {
    assetId,
    url: "asset://localhost/" + assetId,
    mediaType: "image/png",
  };
}

function harness(options: {
  readonly resolve?: (assetId: string) => Promise<SceneAssetSource>;
  readonly decode?: (source: SceneAssetSource) => Promise<FakeResource>;
} = {}) {
  const resolveCalls: string[] = [];
  const factory = new FakeFactory(options.decode);
  const issueReporter = new FakeIssueReporter();
  const reconciler = createSceneReconciler({
    assetSource: {
      resolve(assetId: string) {
        resolveCalls.push(assetId);
        return options.resolve === undefined
          ? Promise.resolve(assetSource(assetId))
          : options.resolve(assetId);
      },
    },
    issueReporter,
    resourceFactory: factory,
  });
  return { factory, issueReporter, reconciler, resolveCalls };
}

describe("scene resource reconciler", () => {
  it("diffs stable keys minimally and attaches new records before releasing old records", () => {
    const { factory, reconciler } = harness();
    const firstA = record("a");
    const firstB = record("b");
    reconciler.update(projection([firstA, firstB]));
    const bindingA = factory.bindings.get("a")!;
    const bindingB = factory.bindings.get("b")!;
    const oldBGeometry = factory.geometries.find(({ key }) => key === "b")!.resource;

    factory.events.length = 0;
    reconciler.update(projection([
      record("b", { selected: true }),
      record("c"),
    ]));

    expect(factory.geometries.map(({ key }) => key)).toEqual(["a", "b", "c"]);
    expect(bindingA.detachCount).toBe(1);
    expect(bindingB.updates).toHaveLength(1);
    expect(factory.bindings.get("c")?.attachCount).toBe(1);
    expect(factory.events.indexOf("attach:c")).toBeLessThan(factory.events.indexOf("detach:a"));

    factory.events.length = 0;
    reconciler.update(projection([
      record("b", { geometryOffset: 2, selected: true }),
      record("c"),
    ]));
    expect(factory.geometries.filter(({ key }) => key === "b")).toHaveLength(2);
    expect(bindingB.updates).toHaveLength(2);
    expect(oldBGeometry.disposeCount).toBe(1);
    expect(factory.events.indexOf("update:b")).toBeLessThan(
      factory.events.indexOf("dispose-geometry:b"),
    );
  });

  it("shares material and texture resources until the final record releases them", async () => {
    const { factory, reconciler, resolveCalls } = harness();
    const shared = material({
      definitionId: "material-shared",
      textureAssetId: "texture-shared",
      textureColorSpace: "srgb",
    });
    reconciler.update(projection([
      record("a", { material: shared }),
      record("b", { material: shared }),
    ]));
    const baseMaterial = factory.materials[0]!.resource;
    await reconciler.settle();

    expect(resolveCalls).toEqual(["texture-shared"]);
    expect(factory.decodeCalls).toHaveLength(1);
    expect(factory.textures).toHaveLength(1);
    const texturedMaterial = factory.materials.find(({ texture }) => texture !== null)!;
    expect(factory.materials.filter(({ texture }) => texture !== null)).toHaveLength(1);
    expect(baseMaterial.disposeCount).toBe(1);
    expect(factory.bindings.get("a")?.updates).toHaveLength(1);
    expect(factory.bindings.get("b")?.updates).toHaveLength(1);

    reconciler.update(projection([record("b", { material: shared })]));
    expect(texturedMaterial.resource.disposeCount).toBe(0);
    expect(factory.textures[0]!.disposeCount).toBe(0);

    reconciler.update(projection([]));
    expect(texturedMaterial.resource.disposeCount).toBe(1);
    expect(factory.textures[0]!.disposeCount).toBe(1);
  });

  it("replaces changed shared materials without disposing a still-used texture", async () => {
    const { factory, reconciler } = harness();
    const before = material({
      definitionId: "material-a",
      baseColor: "#111111",
      textureAssetId: "texture-a",
      textureColorSpace: "srgb",
    });
    reconciler.update(projection([record("a", { material: before })]));
    await reconciler.settle();
    const oldMaterial = factory.materials.find(({ texture }) => texture !== null)!.resource;
    const texture = factory.textures[0]!;

    reconciler.update(projection([record("a", {
      material: { ...before, baseColor: "#222222" },
    })]));

    expect(oldMaterial.disposeCount).toBe(1);
    expect(texture.disposeCount).toBe(0);
    expect(factory.bindings.get("a")?.updates.at(-1)?.material).not.toBe(oldMaterial);

    reconciler.destroy();
    expect(texture.disposeCount).toBe(1);
  });

  it("discards and disposes a texture decoded after its scene generation was retired", async () => {
    const decoded = new Deferred<FakeResource>();
    const { factory, issueReporter, reconciler } = harness({
      decode: () => decoded.promise,
    });
    const textured = material({
      definitionId: "material-late",
      textureAssetId: "texture-late",
      textureColorSpace: "srgb",
    });
    reconciler.update(projection([record("late", { material: textured })]));
    await Promise.resolve();
    await Promise.resolve();
    expect(factory.decodeCalls).toHaveLength(1);

    reconciler.update(projection([]));
    const lateTexture = new FakeResource("texture-late");
    decoded.resolve(lateTexture);
    await reconciler.settle();

    expect(lateTexture.disposeCount).toBe(1);
    expect(issueReporter.clears).toEqual([]);
  });

  it("reports safe resolve and decode issues while retaining the base-color material", async () => {
    const textured = material({
      definitionId: "material-failed",
      textureAssetId: "texture-failed",
      textureColorSpace: "srgb",
    });
    const resolveFailure = harness({
      resolve: async () => {
        throw new Error("sensitive resolver detail");
      },
    });
    resolveFailure.reconciler.update(projection([record("resolve", { material: textured })]));
    await resolveFailure.reconciler.settle();
    expect(resolveFailure.issueReporter.reports).toEqual([{
      assetId: "texture-failed",
      code: "ASSET_CODEC_PREVIEW_UNAVAILABLE",
    }]);
    expect(resolveFailure.factory.bindings.get("resolve")?.updates).toEqual([]);
    expect(resolveFailure.factory.materials[0]?.texture).toBeNull();

    const decodeFailure = harness({
      decode: async () => {
        throw new Error("sensitive decoder detail");
      },
    });
    decodeFailure.reconciler.update(projection([record("decode", { material: textured })]));
    await decodeFailure.reconciler.settle();
    expect(decodeFailure.issueReporter.reports).toEqual([{
      assetId: "texture-failed",
      code: "ASSET_CODEC_PREVIEW_UNAVAILABLE",
    }]);
    expect(decodeFailure.factory.bindings.get("decode")?.updates).toEqual([]);
    expect(decodeFailure.factory.materials[0]?.texture).toBeNull();
  });

  it("clears a synchronously failed resolver token so a later update can retry", async () => {
    let attempts = 0;
    const textured = material({
      definitionId: "material-sync-failure",
      textureAssetId: "texture-sync-failure",
      textureColorSpace: "srgb",
    });
    const { factory, issueReporter, reconciler } = harness({
      resolve: (assetId) => {
        attempts += 1;
        if (attempts === 1) throw new Error("synchronous resolver failure");
        return Promise.resolve(assetSource(assetId));
      },
    });

    reconciler.update(projection([record("sync", { material: textured })]));
    await reconciler.settle();
    expect(issueReporter.reports).toEqual([{
      assetId: "texture-sync-failure",
      code: "ASSET_CODEC_PREVIEW_UNAVAILABLE",
    }]);

    reconciler.update(projection([record("sync", { material: textured })]));
    await reconciler.settle();
    expect(attempts).toBe(2);
    expect(factory.textures).toHaveLength(1);
    expect(issueReporter.clears).toEqual(["texture-sync-failure"]);
  });

  it("rolls back newly acquired resources when attaching a record fails", () => {
    const { factory, reconciler } = harness();
    reconciler.update(projection([record("stable")]));
    const createBinding = factory.createBinding.bind(factory);
    factory.createBinding = (nextRecord, geometryResource, materialResource) => {
      const binding = createBinding(nextRecord, geometryResource, materialResource);
      if (nextRecord.key === "failing") {
        binding.attach = () => {
          binding.attachCount += 1;
          throw new Error("attach failed");
        };
      }
      return binding;
    };
    const distinct = material({ definitionId: "distinct", baseColor: "#112233" });

    expect(() => reconciler.update(projection([
      record("stable"),
      record("failing", { material: distinct }),
    ]))).toThrow("attach failed");

    const failedBinding = factory.bindings.get("failing")!;
    const failedGeometry = factory.geometries.find(({ key }) => key === "failing")!.resource;
    const failedMaterial = factory.materials.find(({ projection: value }) => (
      value.definitionId === "distinct"
    ))!.resource;
    expect(failedBinding.detachCount).toBe(1);
    expect(failedGeometry.disposeCount).toBe(1);
    expect(failedMaterial.disposeCount).toBe(1);
    expect(factory.bindings.get("stable")?.detachCount).toBe(0);
  });

  it("restores an existing binding and releases replacements when update fails", () => {
    const { factory, reconciler } = harness();
    const before = record("existing");
    reconciler.update(projection([before]));
    const binding = factory.bindings.get("existing")!;
    const originalUpdate = binding.update.bind(binding);
    let shouldFail = true;
    binding.update = (nextRecord, geometryResource, materialResource) => {
      originalUpdate(nextRecord, geometryResource, materialResource);
      if (shouldFail) {
        shouldFail = false;
        throw new Error("update failed");
      }
    };
    const after = record("existing", {
      geometryOffset: 4,
      material: material({ definitionId: "replacement", baseColor: "#334455" }),
    });

    expect(() => reconciler.update(projection([after]))).toThrow("update failed");
    const replacementGeometry = factory.geometries.at(-1)!.resource;
    const replacementMaterial = factory.materials.at(-1)!.resource;
    expect(binding.updates.at(-1)?.record).toEqual(before);
    expect(replacementGeometry.disposeCount).toBe(1);
    expect(replacementMaterial.disposeCount).toBe(1);

    reconciler.update(projection([after]));
    expect(binding.updates.at(-1)?.record).toEqual(after);
  });

  it("disposes a decoded texture when textured reconciliation throws", async () => {
    const { factory, reconciler } = harness();
    const createMaterial = factory.createMaterial.bind(factory);
    factory.createMaterial = (materialProjection, texture) => {
      if (texture !== null) throw new Error("textured material creation failed");
      return createMaterial(materialProjection, texture);
    };
    const textured = material({
      definitionId: "material-reconcile-failure",
      textureAssetId: "texture-reconcile-failure",
      textureColorSpace: "srgb",
    });

    reconciler.update(projection([record("texture-failure", { material: textured })]));
    await reconciler.settle();

    expect(factory.textures).toHaveLength(1);
    expect(factory.textures[0]?.disposeCount).toBe(1);
  });

  it("keeps a committed projection current when retiring old resources throws", async () => {
    const decoded = new Deferred<FakeResource>();
    const { factory, reconciler } = harness({
      decode: () => decoded.promise,
    });
    const oldMaterial = material({
      definitionId: "material-retired",
      textureAssetId: "texture-retired",
      textureColorSpace: "srgb",
    });
    reconciler.update(projection([record("old", { material: oldMaterial })]));
    await Promise.resolve();
    await Promise.resolve();
    expect(factory.decodeCalls).toHaveLength(1);

    const oldBinding = factory.bindings.get("old")!;
    const oldGeometry = factory.geometries.find(({ key }) => key === "old")!.resource;
    oldGeometry.dispose = () => {
      oldGeometry.disposeCount += 1;
      throw new Error("retired geometry disposal failed");
    };

    expect(() => reconciler.update(projection([record("new")]))).toThrow(
      "retired geometry disposal failed",
    );
    const newBinding = factory.bindings.get("new")!;
    expect(oldBinding.detachCount).toBe(1);
    expect(newBinding.attachCount).toBe(1);

    const lateTexture = new FakeResource("texture-retired");
    decoded.resolve(lateTexture);
    await reconciler.settle();

    expect(lateTexture.disposeCount).toBe(1);
    expect(newBinding.detachCount).toBe(0);
    expect(factory.bindings.get("old")).toBe(oldBinding);
  });

  it("destroys bindings and every owned resource exactly once", () => {
    const { factory, reconciler } = harness();
    reconciler.update(projection([record("a"), record("b")]));
    const sharedMaterial = factory.materials[0]!.resource;

    reconciler.destroy();
    reconciler.destroy();

    expect(factory.bindings.get("a")?.detachCount).toBe(1);
    expect(factory.bindings.get("b")?.detachCount).toBe(1);
    expect(factory.geometries.every(({ resource }) => resource.disposeCount === 1)).toBe(true);
    expect(sharedMaterial.disposeCount).toBe(1);
  });
  it("continues best-effort destruction after cleanup throws and never retries owners", () => {

    const { factory, reconciler } = harness();
    reconciler.update(projection([record("a"), record("b")]));
    const bindingA = factory.bindings.get("a")!;
    bindingA.detach = () => {
      bindingA.detachCount += 1;
      throw new Error("detach failed");
    };
    const geometryA = factory.geometries.find(({ key }) => key === "a")!.resource;
    geometryA.dispose = () => {
      geometryA.disposeCount += 1;
      throw new Error("dispose failed");
    };
    const bindingB = factory.bindings.get("b")!;
    const geometryB = factory.geometries.find(({ key }) => key === "b")!.resource;
    const materialResource = factory.materials[0]!.resource;

    expect(() => reconciler.destroy()).toThrow();
    expect(bindingA.detachCount).toBe(1);
    expect(bindingB.detachCount).toBe(1);
    expect(geometryA.disposeCount).toBe(1);
    expect(geometryB.disposeCount).toBe(1);
    expect(materialResource.disposeCount).toBe(1);

    expect(() => reconciler.destroy()).not.toThrow();
    expect(bindingA.detachCount).toBe(1);
    expect(geometryA.disposeCount).toBe(1);
  });
});
