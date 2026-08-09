import { parseSnapshotV3 } from "@aethertwin/core-model";
import { resolveGuidedRoute } from "@aethertwin/route-engine";
import showroomFixture from "../../../fixtures/contracts/showroom-m2-4.v3.json";
import { describe, expect, it, vi } from "vitest";
import { createSceneReconciler } from "./scene-reconciler";
import { projectScene } from "./scene-projection";
import type {
  SceneDisposableResource,
  SceneRecordBinding,
  SceneResourceFactory,
} from "./scene-reconciler";
import type {
  SceneAssetSource,
  SceneMaterialProjection,
  SceneRecord,
} from "./types";

class Resource implements SceneDisposableResource {
  disposeCount = 0;
  dispose(): void { this.disposeCount += 1; }
}

class Binding implements SceneRecordBinding {
  attachCount = 0;
  detachCount = 0;
  disposeCount = 0;
  readonly records: SceneRecord[] = [];
  readonly materialHistory: SceneDisposableResource[] = [];
  readonly events: Array<{ record: SceneRecord; material: SceneDisposableResource }> = [];
  constructor(record: SceneRecord, material: SceneDisposableResource) {
    this.records.push(record);
    this.materialHistory.push(material);
    this.events.push({ record, material });
  }
  attach(): void { this.attachCount += 1; }
  update(
    record: SceneRecord,
    _geometry: SceneDisposableResource,
    material: SceneDisposableResource,
  ): void {
    this.records.push(record);
    this.materialHistory.push(material);
    this.events.push({ record, material });
  }
  detach(): void { this.detachCount += 1; }
  dispose(): void { this.disposeCount += 1; }
}

class Factory implements SceneResourceFactory {
  readonly geometries: Resource[] = [];
  readonly materials: Resource[] = [];
  readonly materialBaseColors: string[] = [];
  readonly materialCreations: Array<{
    material: SceneMaterialProjection;
    texture: SceneDisposableResource | null;
    resource: Resource;
  }> = [];
  readonly textures: Resource[] = [];
  readonly bindings: Binding[] = [];

  constructor(private readonly decodeMode: "fail" | "success") {}

  createGeometry(): SceneDisposableResource {
    const resource = new Resource();
    this.geometries.push(resource);
    return resource;
  }

  createMaterial(
    material: SceneMaterialProjection,
    texture: SceneDisposableResource | null,
  ): SceneDisposableResource {
    const resource = new Resource();
    this.materials.push(resource);
    this.materialBaseColors.push(material.baseColor);
    this.materialCreations.push({ material, texture, resource });
    return resource;
  }

  async decodeTexture(source: SceneAssetSource): Promise<SceneDisposableResource> {
    void source;
    if (this.decodeMode === "fail") throw new Error("decoder unavailable");
    const texture = new Resource();
    this.textures.push(texture);
    return texture;
  }

  createBinding(
    record: SceneRecord,
    _geometry: SceneDisposableResource,
    material: SceneDisposableResource,
  ): SceneRecordBinding {
    const binding = new Binding(record, material);
    this.bindings.push(binding);
    return binding;
  }
}

const snapshot = parseSnapshotV3(showroomFixture);
const floor = snapshot.project.floors[0]!;
const network = snapshot.project.routeNetworks[0]!;
const route = snapshot.project.guidedRoutes[0]!;
const routeResult = resolveGuidedRoute(network, route);
if (!routeResult.ok) throw new Error("Task 17 fixture route must resolve");
const projection = projectScene({
  snapshot,
  activeFloorId: floor.id,
  selectedIds: new Set<string>(),
  activeGuidedRoute: {
    guidedRouteId: route.id,
    routeNetworkId: network.id,
    resolvedRoute: routeResult.value,
  },
  camera: {
    position: { x: 9, y: 7, z: 10 },
    target: { x: 4, y: 0, z: -3 },
    fieldOfView: 45,
  },
  assetIssues: [],
});

const texturedFloorAssignment = snapshot.project.materialAssignments.find(
  ({ targetKind }) => targetKind === "space-floor",
)!;
const texturedFloorDefinition = snapshot.project.materials.find(
  ({ id }) => id === texturedFloorAssignment.materialId,
)!;
const fixtureAssignment = snapshot.project.materialAssignments.find(
  ({ targetKind }) => targetKind === "fixture",
)!;
const fixtureDefinition = snapshot.project.materials.find(
  ({ id }) => id === fixtureAssignment.materialId,
)!;

function expectOwnershipReleasedExactlyOnce(factory: Factory): void {
  for (const binding of factory.bindings) {
    expect(binding.attachCount).toBe(1);
    expect(binding.detachCount).toBe(1);
    expect(binding.disposeCount).toBe(1);
  }
  for (const resource of [
    ...factory.geometries,
    ...factory.materials,
    ...factory.textures,
  ]) {
    expect(resource.disposeCount).toBe(1);
  }
}
function harness(decodeMode: "fail" | "success") {
  const factory = new Factory(decodeMode);
  const report = vi.fn();
  const clear = vi.fn();
  const reconciler = createSceneReconciler({
    assetSource: {
      async resolve(assetId) {
        return {
          assetId,
          url: "asset://localhost/" + assetId,
          mediaType: "image/png" as const,
        };
      },
    },
    issueReporter: { report, clear },
    resourceFactory: factory,
  });
  return { factory, report, clear, reconciler };
}

describe("Task 17 complete showroom resource acceptance", () => {
  it("retains complete base-color bindings and reports a safe issue when texture decode fails", async () => {
    const { factory, report, reconciler } = harness("fail");

    reconciler.update(projection);
    await reconciler.settle();

    expect(report).toHaveBeenCalledWith({
      assetId: snapshot.assets[0]!.id,
      code: "ASSET_CODEC_PREVIEW_UNAVAILABLE",
    });
    expect(factory.bindings).toHaveLength(projection.records.length);
    expect(factory.bindings.every(({ attachCount }) => attachCount === 1)).toBe(true);
    expect(factory.textures).toEqual([]);
    const texturedCreation = factory.materialCreations.find(
      ({ material }) => material.definitionId === texturedFloorDefinition.id,
    );
    expect(texturedCreation?.texture).toBeNull();
    expect(texturedCreation?.material.baseColor).toBe(texturedFloorDefinition.baseColor);
    const fixtureCreation = factory.materialCreations.find(
      ({ material }) => material.definitionId === fixtureDefinition.id,
    );
    expect(fixtureCreation?.material.baseColor).toBe(fixtureDefinition.baseColor);

    reconciler.destroy();
    reconciler.destroy();
    expectOwnershipReleasedExactlyOnce(factory);
  });

  it("disposes the successfully decoded complete-showroom texture exactly once", async () => {
    const { factory, report, clear, reconciler } = harness("success");

    reconciler.update(projection);
    await reconciler.settle();

    expect(factory.textures).toHaveLength(1);
    expect(report).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledWith(snapshot.assets[0]!.id);
    const texturedCreation = factory.materialCreations.find(
      ({ material, texture }) => (
        material.definitionId === texturedFloorDefinition.id
        && texture === factory.textures[0]
      ),
    );
    expect(texturedCreation).toBeDefined();
    const texturedBinding = factory.bindings.find((binding) => (
      binding.events.some(({ record, material }) => (
        record.material.definitionId === texturedFloorDefinition.id
        && material === texturedCreation!.resource
      ))
    ));
    expect(texturedBinding).toBeDefined();

    reconciler.destroy();
    reconciler.destroy();
    expectOwnershipReleasedExactlyOnce(factory);
  });
});
