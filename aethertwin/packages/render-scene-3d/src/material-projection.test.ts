import {
  createInitialSnapshot,
  type AssetRecord,
  type Fixture,
  type MaterialAssignment,
  type MaterialDefinition,
  type ProjectSnapshot,
  type SceneEnvironment,
  type SpaceUnit,
  type Wall,
} from "@aethertwin/core-model";
import {
  projectScene,
  type SceneRendererInput,
} from "@aethertwin/render-scene-3d";
import { describe, expect, it } from "vitest";

const uuid = (value: number): string => (
  `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`
);

const initialIds = [1, 2, 3].map(uuid);
const base = createInitialSnapshot({
  name: "3D materials",
  profile: "showroom",
  uuid: () => initialIds.shift()!,
});
const floor = base.project.floors[0]!;
const layerId = floor.layers[0]!.id;

function room(id: number): SpaceUnit {
  return {
    id: uuid(id), name: `Room ${id}`, tags: [], type: "space-unit", kind: "room",
    floorId: floor.id, layerId, locked: false,
    transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
    footprint: [
      { x: 0, y: 0 }, { x: 2_000, y: 0 },
      { x: 2_000, y: 2_000 }, { x: 0, y: 2_000 },
    ],
  };
}

function wall(id: number): Wall {
  return {
    id: uuid(id), name: `Wall ${id}`, tags: [], type: "wall",
    floorId: floor.id, layerId, locked: false,
    transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
    centerLine: [{ x: 0, y: 0 }, { x: 4_000, y: 0 }],
    thickness: 200,
  };
}

function fixture(id: number, kind: Fixture["kind"] = "generic"): Fixture {
  return {
    id: uuid(id), name: `Fixture ${id}`, tags: [], type: "fixture", kind,
    floorId: floor.id, layerId, locked: false,
    transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
    size: { width: 1_000, height: 1_000 },
    spatial3D: { elevation: 0, height: 1_000 },
  };
}

function material(
  id: number,
  overrides: Partial<MaterialDefinition> = {},
): MaterialDefinition {
  return {
    id: uuid(id), name: `Material ${id}`, tags: [],
    baseColor: "#123456", roughness: 0.35, metalness: 0.45, opacity: 0.65,
    assetId: null,
    ...overrides,
  };
}

function assignment(
  id: number,
  materialId: string,
  targetKind: MaterialAssignment["targetKind"],
  targetId: string,
): MaterialAssignment {
  return {
    id: uuid(id), name: `Assignment ${id}`, tags: [], materialId, targetKind, targetId,
  };
}

function asset(id: number): AssetRecord {
  const sha256 = (id % 16).toString(16).repeat(64);
  return {
    id: uuid(id),
    sha256,
    relativePath: `assets/sha256/${sha256.slice(0, 2)}/${sha256}.png`,
    mediaType: "image/png",
    size: 128,
  };
}

function snapshotWith(options: {
  readonly entities?: ProjectSnapshot["project"]["entities"];
  readonly materials?: readonly MaterialDefinition[];
  readonly materialAssignments?: readonly MaterialAssignment[];
  readonly assets?: readonly AssetRecord[];
  readonly sceneEnvironment?: SceneEnvironment;
} = {}): ProjectSnapshot {
  return {
    ...base,
    project: {
      ...base.project,
      entities: options.entities ?? [],
      materials: options.materials ?? [],
      materialAssignments: options.materialAssignments ?? [],
      sceneEnvironment: options.sceneEnvironment ?? base.project.sceneEnvironment,
    },
    assets: options.assets ?? [],
  };
}

function inputFor(
  snapshot: ProjectSnapshot,
  options: Partial<Omit<SceneRendererInput, "snapshot">> = {},
): SceneRendererInput {
  return {
    snapshot,
    activeFloorId: floor.id,
    selectedIds: new Set(),
    activeGuidedRoute: null,
    camera: {
      position: { x: 4, y: 5, z: 6 },
      target: { x: 0, y: 0, z: 0 },
      fieldOfView: 45,
    },
    assetIssues: [],
    ...options,
  };
}

function recordFor(projection: ReturnType<typeof projectScene>, selectionId: string) {
  const record = projection.records.find((candidate) => candidate.selectionId === selectionId);
  if (record === undefined) throw new Error(`Missing record for ${selectionId}`);
  return record;
}

function expectUnitUvs(uvs: readonly number[]): void {
  expect(uvs.length % 2).toBe(0);
  expect(uvs.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
}

describe("projectScene materials", () => {
  it("resolves all three assignment kinds and deduplicates a shared sRGB texture", () => {
    const sourceRoom = room(10);
    const sourceWall = wall(11);
    const sourceFixture = fixture(12);
    const texture = asset(20);
    const shared = material(30, { assetId: texture.id });
    const wallMaterial = material(31, {
      baseColor: "#abcdef", roughness: 0.8, metalness: 0.1, opacity: 0.9,
    });

    const projection = projectScene(inputFor(snapshotWith({
      entities: [sourceRoom, sourceWall, sourceFixture],
      materials: [wallMaterial, shared],
      materialAssignments: [
        assignment(40, shared.id, "space-floor", sourceRoom.id),
        assignment(41, wallMaterial.id, "wall", sourceWall.id),
        assignment(42, shared.id, "fixture", sourceFixture.id),
      ],
      assets: [texture],
    })));

    expect(recordFor(projection, sourceRoom.id).material).toEqual({
      role: "space-floor",
      definitionId: shared.id,
      baseColor: "#123456",
      roughness: 0.35,
      metalness: 0.45,
      opacity: 0.65,
      textureAssetId: texture.id,
      textureColorSpace: "srgb",
    });
    expect(recordFor(projection, sourceWall.id).material).toEqual({
      role: "wall",
      definitionId: wallMaterial.id,
      baseColor: "#abcdef",
      roughness: 0.8,
      metalness: 0.1,
      opacity: 0.9,
      textureAssetId: null,
      textureColorSpace: null,
    });
    expect(recordFor(projection, sourceFixture.id).material.definitionId).toBe(shared.id);
    expect(projection.requiredTextureAssetIds).toEqual([texture.id]);
  });

  it("uses exact defaults for unassigned and missing definitions", () => {
    const sourceRoom = room(50);
    const sourceWall = wall(51);
    const sourceFixture = fixture(52);
    const missingMaterialId = uuid(53);

    const projection = projectScene(inputFor(snapshotWith({
      entities: [sourceRoom, sourceWall, sourceFixture],
      materialAssignments: [assignment(54, missingMaterialId, "fixture", sourceFixture.id)],
    })));

    expect(recordFor(projection, sourceRoom.id).material).toMatchObject({
      role: "space-floor", definitionId: null, baseColor: "#445760",
      roughness: 0.9, metalness: 0, opacity: 1,
      textureAssetId: null, textureColorSpace: null,
    });
    expect(recordFor(projection, sourceWall.id).material).toMatchObject({
      role: "wall", definitionId: null, baseColor: "#c8d2d8",
      roughness: 0.82, metalness: 0, opacity: 1,
    });
    expect(recordFor(projection, sourceFixture.id).material).toMatchObject({
      role: "fixture", definitionId: null, baseColor: "#78909c",
      roughness: 0.6, metalness: 0.08, opacity: 1,
    });
  });

  it("keeps definition values but drops missing or known-failed textures", () => {
    const sourceFixture = fixture(60);
    const missingAssetId = uuid(61);
    const definition = material(62, { assetId: missingAssetId });
    const assigned = assignment(63, definition.id, "fixture", sourceFixture.id);
    const missingProjection = projectScene(inputFor(snapshotWith({
      entities: [sourceFixture], materials: [definition], materialAssignments: [assigned],
    })));
    expect(recordFor(missingProjection, sourceFixture.id).material).toMatchObject({
      definitionId: definition.id,
      baseColor: definition.baseColor,
      textureAssetId: null,
      textureColorSpace: null,
    });
    expect(missingProjection.requiredTextureAssetIds).toEqual([]);

    const texture = asset(61);
    for (const code of [
      "ASSET_MISSING",
      "ASSET_CORRUPT",
      "ASSET_CODEC_PREVIEW_UNAVAILABLE",
    ] as const) {
      const failedProjection = projectScene(inputFor(snapshotWith({
        entities: [sourceFixture], materials: [definition],
        materialAssignments: [assigned], assets: [texture],
      }), { assetIssues: [{ assetId: texture.id, code }] }));
      expect(recordFor(failedProjection, sourceFixture.id).material.textureAssetId).toBeNull();
      expect(failedProjection.requiredTextureAssetIds).toEqual([]);
    }
  });

  it("publishes selection as a separate overlay without changing material", () => {
    const sourceFixture = fixture(70);
    const snapshot = snapshotWith({ entities: [sourceFixture] });
    const unselected = recordFor(projectScene(inputFor(snapshot)), sourceFixture.id);
    const selected = recordFor(projectScene(inputFor(snapshot, {
      selectedIds: new Set([sourceFixture.id]),
    })), sourceFixture.id);

    expect(selected.material).toEqual(unselected.material);
    expect(unselected.selectionOverlay).toBeNull();
    expect(selected.selectionOverlay).toEqual({ color: "#58b8c4" });
  });
});

describe("projectScene target UVs", () => {
  it("keeps floor, cumulative wall, and whole-fixture box UVs within one target range", () => {
    const sourceRoom = room(80);
    const sourceWall = wall(81);
    const sourceFixture = fixture(82, "display-table");
    const projection = projectScene(inputFor(snapshotWith({
      entities: [sourceRoom, sourceWall, sourceFixture],
    })));

    for (const record of projection.records) expectUnitUvs(record.geometry.uvs);
    expect(recordFor(projection, sourceRoom.id).geometry.uvs).toEqual([
      0, 0, 1, 0, 1, 1, 0, 1,
    ]);
    const wallRecord = recordFor(projection, sourceWall.id);
    expect(new Set(wallRecord.geometry.uvs)).toEqual(new Set([0, 1]));
    const leg = projection.records.find(({ key }) => key === `fixture-part:${sourceFixture.id}:leg-fl`)!;
    expect(leg.geometry.uvs).toContain(0.04);
    expect(leg.geometry.uvs).toContain(0.12);
  });
});

describe("projectScene environment", () => {
  it("normalizes key direction, maps softness bounds, and pads shadow bounds by ten percent", () => {
    const sourceFixture = fixture(90);
    const environment: SceneEnvironment = {
      backgroundColor: "#010203",
      ambient: { color: "#111213", intensity: 0.4 },
      key: { color: "#f0e0d0", intensity: 1.5, direction: [3, 4, 0] },
      shadowsEnabled: true,
      shadowSoftness: 0,
    };
    const projection = projectScene(inputFor(snapshotWith({
      entities: [sourceFixture], sceneEnvironment: environment,
    })));

    expect(projection.environment).toEqual({
      backgroundColor: "#010203",
      ambient: { color: "#111213", intensity: 0.4 },
      key: { color: "#f0e0d0", intensity: 1.5, position: { x: 6, y: 8, z: 0 } },
      shadows: {
        enabled: true,
        radius: 1,
        cameraBounds: {
          min: { x: -0.1, y: -0.1, z: -1.1 },
          max: { x: 1.1, y: 1.1, z: 0.1 },
        },
      },
    });

    const soft = projectScene(inputFor(snapshotWith({
      entities: [sourceFixture],
      sceneEnvironment: { ...environment, shadowsEnabled: false, shadowSoftness: 1 },
    })));
    expect(soft.environment?.shadows).toEqual({
      enabled: false,
      radius: 8,
      cameraBounds: null,
    });
  });

  it("accepts key direction component boundaries", () => {
    const sourceFixture = fixture(91);
    const projection = projectScene(inputFor(snapshotWith({
      entities: [sourceFixture],
      sceneEnvironment: {
        ...base.project.sceneEnvironment,
        key: { ...base.project.sceneEnvironment.key, direction: [100, -100, 100] },
      },
    })));
    const position = projection.environment?.key.position;
    expect(projection.issues).toEqual([]);
    expect(position?.x).toBeCloseTo(10 / Math.sqrt(3), 12);
    expect(position?.y).toBeCloseTo(-10 / Math.sqrt(3), 12);
    expect(position?.z).toBeCloseTo(10 / Math.sqrt(3), 12);
  });

  it("fails closed for environment values outside durable bounds", () => {
    const sourceFixture = fixture(91);
    const environments: readonly SceneEnvironment[] = [
      {
        ...base.project.sceneEnvironment,
        ambient: { ...base.project.sceneEnvironment.ambient, intensity: 4.01 },
      },
      {
        ...base.project.sceneEnvironment,
        key: { ...base.project.sceneEnvironment.key, intensity: 8.01 },
      },
      {
        ...base.project.sceneEnvironment,
        key: { ...base.project.sceneEnvironment.key, direction: [100.01, 0, 0] },
      },
      {
        ...base.project.sceneEnvironment,
        key: { ...base.project.sceneEnvironment.key, direction: [-100.01, 0, 0] },
      },
    ];

    for (const sceneEnvironment of environments) {
      const projection = projectScene(inputFor(snapshotWith({
        entities: [sourceFixture],
        sceneEnvironment,
      })));
      expect(projection.records).toEqual([]);
      expect(projection.environment).toBeNull();
      expect(projection.issues).toEqual([{
        code: "SCENE_INVALID_RECORD", sourceIds: [base.project.id],
      }]);
    }
  });
  it("fails closed for a zero key direction", () => {
    const sourceFixture = fixture(91);
    const projection = projectScene(inputFor(snapshotWith({
      entities: [sourceFixture],
      sceneEnvironment: {
        ...base.project.sceneEnvironment,
        key: { ...base.project.sceneEnvironment.key, direction: [0, 0, 0] },
      },
    })));

    expect(projection.records).toEqual([]);
    expect(projection.bounds).toBeNull();
    expect(projection.environment).toBeNull();
    expect(projection.issues).toEqual([{
      code: "SCENE_INVALID_RECORD",
      sourceIds: [base.project.id],
    }]);
  });
});
