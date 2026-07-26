import { describe, expect, it } from "vitest";
import snapshotV1Fixture from "../../../fixtures/contracts/snapshot.v1.json";
import snapshotV2Fixture from "../../../fixtures/contracts/snapshot.v2.json";
import snapshotV3Fixture from "../../../fixtures/contracts/snapshot.v3.json";
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SCENE_ENVIRONMENT,
  createManifest,
  createInitialSnapshot,
  defaultLayerIdForFloor,
  identityTransform2D,
  migrateSnapshot,
  ModelValidationError,
  parseManifest,
  parseSnapshot,
  parseSnapshotV2,
  parseSnapshotV3,
  type ModelIssueCode,
} from "./index";

const validManifest = {
  schemaVersion: 2,
  projectId: "00000000-0000-4000-8000-000000000001",
  name: "Demo",
  profile: "showroom",
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z",
  appVersion: "0.1.0",
  minCompatibleAppVersion: "0.1.0",
};
const APPROVED_SCENE_ENVIRONMENT = {
  backgroundColor: "#101820",
  ambient: { color: "#dce8f0", intensity: 0.55 },
  key: { color: "#fff1dc", intensity: 1.1, direction: [4, 8, 5] },
  shadowsEnabled: true,
  shadowSoftness: 0.5,
} as const;


function contractId(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

function cloneFixture(): any {
  return JSON.parse(JSON.stringify(snapshotV2Fixture));
}

function cloneV3Fixture(): any {
  return JSON.parse(JSON.stringify(snapshotV3Fixture));
}

function asV3Input(input: any): any {
  input.schemaVersion = 3;
  Object.assign(input.project, {
    planReferences: [],
    openings: [],
    guidedRoutes: [],
    materials: [],
    materialAssignments: [],
    sceneEnvironment: JSON.parse(JSON.stringify(DEFAULT_SCENE_ENVIRONMENT)),
  });
  return input;
}

function planReferenceSnapshot(mediaType = "image/png"): any {
  const snapshot = cloneV3Fixture();
  const sha256 = "a".repeat(64);
  const extension = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/webm": "webm",
  }[mediaType] ?? "bin";
  snapshot.assets = [{
    id: contractId(20),
    sha256,
    relativePath: `assets/sha256/aa/${sha256}.${extension}`,
    mediaType,
    size: 42,
  }];
  snapshot.project.planReferences = [{
    id: contractId(21),
    name: "Floor plan",
    tags: [],
    floorId: contractId(2),
    layerId: contractId(3),
    assetId: contractId(20),
    intrinsicSize: { width: 100, height: 50 },
    transform: JSON.parse(JSON.stringify(identityTransform2D)),
    opacity: 0.65,
    locked: false,
    calibration: null,
  }];
  return snapshot;
}

function completeSnapshotInput(): any {
  const snapshot = cloneFixture();
  const floorId = contractId(2);
  const layerId = contractId(3);
  const transform = JSON.parse(JSON.stringify(identityTransform2D));

  snapshot.assets = [{
    id: contractId(20),
    sha256: "a".repeat(64),
    relativePath: `assets/sha256/aa/${"a".repeat(64)}.png`,
    mediaType: "image/png",
    size: 42,
  }];
  snapshot.project.entities = [
    {
      type: "dimension", id: contractId(5), name: "Width", tags: [], floorId, layerId,
      transform, locked: false,
      start: { kind: "point", point: { x: 0, y: 0 } },
      end: { kind: "entity", entityId: contractId(6), locator: { vertex: 1 } },
      offset: 50, displayUnit: "mm",
    },
    {
      type: "boundary", id: contractId(6), name: "Boundary", tags: [], floorId, layerId,
      transform, locked: false,
      polygon: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }],
    },
    {
      type: "wall", id: contractId(7), name: "Wall", tags: [], floorId, layerId,
      transform, spatial3D: { elevation: 0, height: 2800 }, locked: false,
      centerLine: [{ x: 0, y: 0 }, { x: 4000, y: 0 }], thickness: 120,
    },
    {
      type: "zone", id: contractId(8), name: "Zone", tags: [], floorId, layerId,
      transform, locked: false,
      polygon: [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 1000 }, { x: 0, y: 1000 }],
      purpose: "display", color: "#5f8f96",
    },
    {
      type: "space-unit", id: contractId(9), name: "Shop", tags: [], floorId, layerId,
      transform, locked: false, kind: "shop",
      footprint: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }],
    },
    snapshot.project.entities[0],
    {
      type: "poi", id: contractId(10), name: "Entrance", tags: [], floorId, layerId,
      transform, locked: false, kind: "entrance", radius: 250,
    },
  ];
  snapshot.project.vendors = [{
    id: contractId(11), name: "Vendor", tags: [], spaceUnitId: contractId(9),
    externalId: "vendor-1", category: "retail", status: "active",
  }];
  snapshot.project.productContents = [{
    id: contractId(12), name: "Product", tags: [], targetEntityId: contractId(4),
    description: "Featured product", mediaAssetIds: [contractId(13)],
  }];
  snapshot.project.mediaAssets = [{
    id: contractId(13), name: "Display image", tags: [], assetId: contractId(20), kind: "image",
  }];
  snapshot.project.routeNetworks = [{
    id: contractId(14), name: "Public route", tags: [],
    nodes: [
      { id: contractId(15), name: "A", tags: [], position: { x: 0, y: 0 }, floorId, kind: "entrance" },
      { id: contractId(16), name: "B", tags: [], position: { x: 1000, y: 0 }, floorId, kind: "aisle" },
    ],
    edges: [{
      id: contractId(17), name: "A-B", tags: [], from: contractId(15), to: contractId(16),
      distance: 1000, bidirectional: true, accessible: true, enabled: true, width: 1200, weight: 1,
    }],
  }];
  snapshot.project.themes = [{
    id: contractId(18), name: "Theme", tags: [], profile: "market",
    values: { accent: "#5f8f96", gridSize: 100, showLabels: true },
  }];
  snapshot.project.cameraShots = [{
    id: contractId(19), name: "Overview", tags: [], position: [0, 2000, 3000],
    target: [0, 0, 0], fieldOfView: 45,
  }];
  snapshot.project.storySequences = [{
    id: contractId(21), name: "Tour", tags: [], cameraShotIds: [contractId(19)], duration: 5,
  }];
  return snapshot;
}

function expectModelIssue(action: () => unknown, code: ModelIssueCode, path: string): void {
  let thrown: unknown;
  try { action(); } catch (error) { thrown = error; }
  expect(thrown).toBeInstanceOf(ModelValidationError);
  expect(thrown).toMatchObject({ code, path });
}

describe("core model", () => {
  it.each(["showroom", "market"] as const)("creates a %s project", (profile) => {
    const ids = [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ];
    const snapshot = createInitialSnapshot({
      name: "Demo",
      profile,
      uuid: () => ids.shift()!,
    });

    expect(snapshot.project.profile).toBe(profile);
    expect(snapshot.project.floors).toHaveLength(1);
    expect(snapshot.project.floors[0]?.name).toBe("一层");
    expect(snapshot.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(parseSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
    expect(
      createManifest(snapshot, {
        now: () => "2026-07-17T00:00:00.000Z",
        appVersion: "0.1.0",
      }),
    ).toMatchObject({ projectId: snapshot.project.id, profile });
  });

  it("rejects a third profile", () => {
    expect(() => parseManifest({ ...validManifest, profile: "iot" })).toThrow(/profile/i);
  });

  it("rejects malformed UUIDs and timestamps", () => {
    expect(() => parseManifest({ ...validManifest, projectId: "not-a-uuid" })).toThrow(/projectId/i);
    expect(() => parseManifest({ ...validManifest, createdAt: "2026-07-17" })).toThrow(/createdAt/i);
  });

  it("canonicalizes accepted UUID text to lowercase", () => {
    expect(
      parseManifest({ ...validManifest, projectId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" })
        .projectId,
    ).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it.each(["/media/x.png", "\\media\\x.png", "C:\\media\\x.png", "\\\\server\\share\\x.png", "media/../x.png"])(
    "rejects unsafe asset path %s",
    (relativePath) => {
      const snapshot = createInitialSnapshot({ name: "Demo", profile: "market" });
      expect(() =>
        parseSnapshot({
          ...snapshot,
          assets: [
            {
              id: "00000000-0000-4000-8000-000000000003",
              sha256: "a".repeat(64),
              relativePath,
              mediaType: "image/png",
              size: 1,
            },
          ],
        }),
      ).toThrow(/relativePath/i);
    },
  );

  it("rejects invalid asset digests and invalid snapshot UUIDs", () => {
    const snapshot = createInitialSnapshot({ name: "Demo", profile: "market" });
    expect(() =>
      parseSnapshot({
        ...snapshot,
        project: { ...snapshot.project, id: "invalid" },
      }),
    ).toThrow(/project.id/i);
    expect(() =>
      parseSnapshot({
        ...snapshot,
        assets: [
          {
            id: "00000000-0000-4000-8000-000000000003",
            sha256: "A".repeat(64),
            relativePath: `assets/sha256/aa/${"a".repeat(64)}.png`,
            mediaType: "image/png",
            size: 1,
          },
        ],
      }),
    ).toThrow(/sha256/i);
  });

  it("migrates the current snapshot and rejects newer schema versions", () => {
    const snapshot = createInitialSnapshot({ name: "Demo", profile: "showroom" });
    expect(migrateSnapshot(snapshot)).toEqual(snapshot);
    expect(() => migrateSnapshot({ ...snapshot, schemaVersion: 4 })).toThrow(
      "UNSUPPORTED_SCHEMA_VERSION",
    );
  });

  it("parses a stored v1 manifest as current without changing timestamps", () => {
    const parsed = parseManifest({ ...validManifest, schemaVersion: 1 });
    expect(parsed.schemaVersion).toBe(3);
    expect(parsed.createdAt).toBe(validManifest.createdAt);
    expect(parsed.updatedAt).toBe(validManifest.updatedAt);
    expect(() => parseManifest({ ...validManifest, schemaVersion: 4 })).toThrow(
      /schemaVersion|unsupported/i,
    );
  });

  it("migrates a v1 snapshot without inventing authoring content", () => {
    const v1 = snapshotV1Fixture;
    const migrated = migrateSnapshot(v1);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.sequence).toBe(v1.sequence);
    expect(migrated.checkpointSequence).toBe(v1.checkpointSequence);
    expect(migrated.project.id).toBe(v1.project.id);
    expect(migrated.project.floors[0]!.layers).toEqual([{
      id: defaultLayerIdForFloor(v1.project.floors[0]!.id),
      name: "默认图层", tags: [], visible: true, locked: false,
    }]);
    expect(migrated.project.entities).toEqual([]);
  });

  it("returns deeply immutable snapshots and manifests from creators and parsers", () => {
    const snapshot = createInitialSnapshot({ name: "Demo", profile: "showroom" });
    const parsedSnapshot = parseSnapshot(JSON.parse(JSON.stringify(snapshot)));
    const parsedSnapshotWithAsset = parseSnapshot({
      ...JSON.parse(JSON.stringify(snapshot)),
      assets: [
        {
          id: "00000000-0000-4000-8000-000000000003",
          sha256: "a".repeat(64),
          relativePath: `assets/sha256/aa/${"a".repeat(64)}.png`,
          mediaType: "image/png",
          size: 1,
        },
      ],
    });
    const manifest = createManifest(snapshot, {
      now: () => "2026-07-17T00:00:00.000Z",
      appVersion: "0.1.0",
    });
    const parsedManifest = parseManifest({ ...validManifest });

    for (const immutableSnapshot of [snapshot, parsedSnapshot]) {
      expect(Object.isFrozen(immutableSnapshot)).toBe(true);
      expect(Object.isFrozen(immutableSnapshot.project)).toBe(true);
      expect(Object.isFrozen(immutableSnapshot.project.tags)).toBe(true);
      expect(Object.isFrozen(immutableSnapshot.project.floors)).toBe(true);
      expect(Object.isFrozen(immutableSnapshot.project.floors[0])).toBe(true);
      expect(Object.isFrozen(immutableSnapshot.assets)).toBe(true);
      expect(() => {
        (immutableSnapshot.project as { profile: string }).profile = "market";
      }).toThrow(TypeError);
      expect(() => {
        (immutableSnapshot.project.floors as unknown as { push: (value: unknown) => void }).push({});
      }).toThrow(TypeError);
    }

    const asset = parsedSnapshotWithAsset.assets[0];
    if (asset === undefined) {
      throw new Error("expected parsed asset");
    }
    expect(Object.isFrozen(asset)).toBe(true);
    expect(() => {
      (asset as { mediaType: string }).mediaType = "text/plain";
    }).toThrow(TypeError);

    for (const immutableManifest of [manifest, parsedManifest]) {
      expect(Object.isFrozen(immutableManifest)).toBe(true);
      expect(() => {
        (immutableManifest as { name: string }).name = "Changed";
      }).toThrow(TypeError);
    }
  });

  it.each([
    [{ name: "   ", profile: "showroom" }, /name/i],
    [{ name: "Demo", profile: "iot" as never }, /profile/i],
    [{ name: "Demo", profile: "showroom", uuid: () => "invalid" }, /uuid/i],
    [
      {
        name: "Demo",
        profile: "showroom",
        uuid: (() => {
          const ids = ["00000000-0000-4000-8000-000000000001", "invalid"];
          return () => ids.shift()!;
        })(),
      },
      /uuid/i,
    ],
  ])("rejects invalid initial project input %#", (input, error) => {
    expect(() => createInitialSnapshot(input as Parameters<typeof createInitialSnapshot>[0])).toThrow(error);
  });

  it("rejects invalid manifest creator inputs", () => {
    const snapshot = createInitialSnapshot({ name: "Demo", profile: "showroom" });
    expect(() =>
      createManifest(snapshot, { now: () => "2026-02-30T00:00:00.000Z", appVersion: "0.1.0" }),
    ).toThrow(/createdAt/i);
    expect(() =>
      createManifest(snapshot, { now: () => "2026-07-17T00:00:00.000Z", appVersion: " " }),
    ).toThrow(/appVersion/i);
    expect(() =>
      createManifest(
        {
          ...snapshot,
          project: { ...snapshot.project, id: "invalid" },
        },
        { now: () => "2026-07-17T00:00:00.000Z", appVersion: "0.1.0" },
      ),
    ).toThrow(/project.id/i);
  });
});
describe("schema v2 validation", () => {
  it("creates a complete current-schema project with one editable default layer", () => {
    const ids = [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
    ];
    const snapshot = createInitialSnapshot({ name: "Demo", profile: "showroom", uuid: () => ids.shift()! });

    expect(snapshot).toMatchObject({
      schemaVersion: 3,
      project: {
        floors: [{ layers: [{ id: "00000000-0000-4000-8000-000000000003", visible: true, locked: false }] }],
        entities: [], vendors: [], productContents: [], mediaAssets: [], routeNetworks: [],
        themes: [], cameraShots: [], storySequences: [],
      },
    });
    expect(Object.isFrozen(snapshot.project.floors[0]?.layers)).toBe(true);
  });

  it("reports self-intersecting entity geometry with a stable code and path", () => {
    const snapshot = createInitialSnapshot({ name: "Demo", profile: "market" });
    const floor = snapshot.project.floors[0]!;
    const layer = floor.layers[0]!;

    expectModelIssue(() => parseSnapshotV2({
      schemaVersion: 2, sequence: 0, checkpointSequence: 0, assets: [],
      project: {
        id: "00000000-0000-4000-8000-000000000001", name: "Demo", tags: [], profile: "market",
        floors: [{ id: floor.id, name: "Floor", tags: [], layers: [{ id: layer.id, name: "Default", tags: [], visible: true, locked: false }] }],
        entities: [{
          type: "zone", id: "00000000-0000-4000-8000-000000000010", name: "Crossed", tags: [],
          floorId: floor.id, layerId: layer.id, locked: false,
          transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
          polygon: [{ x: 0, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }, { x: 1000, y: 0 }],
          purpose: "test", color: "#5f8f96",
        }],
        vendors: [], productContents: [], mediaAssets: [], routeNetworks: [], themes: [], cameraShots: [], storySequences: [],
      },
    }), "SELF_INTERSECTING_POLYGON", "project.entities[0].polygon");
  });

  it("rejects duplicate UUIDs and invalid entity layer references", () => {
    const snapshot = createInitialSnapshot({ name: "Demo", profile: "market" });
    const floor = snapshot.project.floors[0]!;
    expectModelIssue(() => parseSnapshotV2({ ...snapshot, schemaVersion: 2, assets: [{
      id: floor.id, sha256: "a".repeat(64), relativePath: "assets/x.png", mediaType: "image/png", size: 1,
    }] }), "DUPLICATE_UUID", "assets[0].id");
    expectModelIssue(() => parseSnapshotV2({
      ...snapshot,
      schemaVersion: 2,
      project: {
        ...snapshot.project,
        entities: [{
          type: "fixture", id: "00000000-0000-4000-8000-000000000010", name: "Display", tags: [],
          floorId: floor.id, layerId: "00000000-0000-4000-8000-000000000011", locked: false,
          transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
          kind: "display-case", size: { width: 1000, height: 500 },
        }],
      },
    }), "INVALID_REFERENCE", "project.entities[0].layerId");
  });

  it("parses and deeply freezes every schema-v2 collection without declaration-order limits", () => {
    const input = completeSnapshotInput();
    const parsed = parseSnapshotV2(input);

    expect(parsed).toEqual(input);
    expect(Object.isFrozen(parsed.project.entities[0]?.transform.translation)).toBe(true);
    expect(Object.isFrozen(parsed.project.routeNetworks[0]?.edges[0])).toBe(true);
    expect(Object.isFrozen(parsed.project.themes[0]?.values)).toBe(true);
    expect(Object.isFrozen(parsed.project.storySequences[0]?.cameraShotIds)).toBe(true);
  });

  it("round-trips the shared schema-v2 fixture", () => {
    expect(parseSnapshotV2(snapshotV2Fixture)).toEqual(snapshotV2Fixture);
  });

  it.each([
    ["dimension entity", (value: any) => { value.project.entities[0].end.entityId = contractId(99); }, "project.entities[0].end.entityId"],
    ["vendor space", (value: any) => { value.project.vendors[0].spaceUnitId = contractId(99); }, "project.vendors[0].spaceUnitId"],
    ["product target", (value: any) => { value.project.productContents[0].targetEntityId = contractId(99); }, "project.productContents[0].targetEntityId"],
    ["product media", (value: any) => { value.project.productContents[0].mediaAssetIds[0] = contractId(99); }, "project.productContents[0].mediaAssetIds[0]"],
    ["media asset", (value: any) => { value.project.mediaAssets[0].assetId = contractId(99); }, "project.mediaAssets[0].assetId"],
    ["route floor", (value: any) => { value.project.routeNetworks[0].nodes[0].floorId = contractId(99); }, "project.routeNetworks[0].nodes[0].floorId"],
    ["route edge", (value: any) => { value.project.routeNetworks[0].edges[0].to = contractId(99); }, "project.routeNetworks[0].edges[0].to"],
    ["story shot", (value: any) => { value.project.storySequences[0].cameraShotIds[0] = contractId(99); }, "project.storySequences[0].cameraShotIds[0]"],
  ])("rejects an invalid %s reference", (_name, mutate, path) => {
    const input = completeSnapshotInput();
    mutate(input);
    expectModelIssue(() => parseSnapshotV2(input), "INVALID_REFERENCE", path);
  });

  it.each([
    ["wall thickness", (value: any) => { value.project.entities[2].thickness = 0; }, "project.entities[2].thickness"],
    ["fixture width", (value: any) => { value.project.entities[5].size.width = 0; }, "project.entities[5].size.width"],
    ["poi radius", (value: any) => { value.project.entities[6].radius = 0; }, "project.entities[6].radius"],
    ["route width", (value: any) => { value.project.routeNetworks[0].edges[0].width = 0; }, "project.routeNetworks[0].edges[0].width"],
    ["story duration", (value: any) => { value.project.storySequences[0].duration = 0; }, "project.storySequences[0].duration"],
  ])("rejects non-positive %s", (_name, mutate, path) => {
    const input = completeSnapshotInput();
    mutate(input);
    expectModelIssue(() => parseSnapshotV2(input), "INVALID_VALUE", path);
  });

  it("rejects non-primitive theme values", () => {
    const input = completeSnapshotInput();
    input.project.themes[0].values.bad = { executable: true };
    expectModelIssue(
      () => parseSnapshotV2(input),
      "INVALID_TYPE",
      "project.themes[0].values.bad",
    );
  });

  it.each([
    ["out-of-range vertex", (value: any) => { value.project.entities[0].end.locator = { vertex: 4 }; }, "project.entities[0].end.locator.vertex"],
    ["out-of-range segment", (value: any) => { value.project.entities[0].end = { kind: "entity", entityId: contractId(7), locator: { segment: 1, t: 0.5 } }; }, "project.entities[0].end.locator.segment"],
    ["fixture vertex", (value: any) => { value.project.entities[0].end = { kind: "entity", entityId: contractId(4), locator: { vertex: 0 } }; }, "project.entities[0].end.locator.vertex"],
    ["poi segment", (value: any) => { value.project.entities[0].end = { kind: "entity", entityId: contractId(10), locator: { segment: 0, t: 0.5 } }; }, "project.entities[0].end.locator.segment"],
  ])("rejects an invalid %s dimension locator", (_name, mutate, path) => {
    const input = completeSnapshotInput();
    mutate(input);
    expectModelIssue(() => parseSnapshotV2(input), "INVALID_REFERENCE", path);
  });

  it("preserves an own __proto__ theme key losslessly", () => {
    const input = completeSnapshotInput();
    input.project.themes[0].values = JSON.parse('{"__proto__":"preserved","enabled":true}');
    const parsed = parseSnapshotV2(input);

    const values = parsed.project.themes[0]!.values;
    expect(Object.prototype.hasOwnProperty.call(values, "__proto__")).toBe(true);
    expect(values.__proto__).toBe("preserved");
    expect(Object.isFrozen(values)).toBe(true);
  });
});

describe("schema v3 validation and migration", () => {
  it.each(["showroom", "market"] as const)("creates an exact immutable v3 %s snapshot", (profile) => {
    const ids = [contractId(31), contractId(32), contractId(33)];
    const snapshot = createInitialSnapshot({ name: "Demo", profile, uuid: () => ids.shift()! });

    expect(snapshot).toMatchObject({
      schemaVersion: 3,
      sequence: 0,
      checkpointSequence: 0,
      project: {
        profile,
        planReferences: [],
        openings: [],
        guidedRoutes: [],
        materials: [],
        materialAssignments: [],
        sceneEnvironment: APPROVED_SCENE_ENVIRONMENT,
      },
      assets: [],
    });
    expect(Object.isFrozen(snapshot.project.sceneEnvironment.key.direction)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SCENE_ENVIRONMENT.key.direction)).toBe(true);
  });

  it("migrates v2 to v3 by adding only deterministic v3 state", () => {
    const input = completeSnapshotInput();
    input.sequence = 19;
    input.checkpointSequence = 11;
    const before = JSON.parse(JSON.stringify(input));

    const migrated = migrateSnapshot(input);

    expect(migrated).toEqual({
      ...before,
      schemaVersion: 3,
      project: {
        ...before.project,
        planReferences: [],
        openings: [],
        guidedRoutes: [],
        materials: [],
        materialAssignments: [],
        sceneEnvironment: APPROVED_SCENE_ENVIRONMENT,
      },
    });
    expect(input).toEqual(before);
    expect(migrated.sequence).toBe(19);
    expect(migrated.checkpointSequence).toBe(11);
    expect(migrated.project.entities.map((entity) => entity.id)).toEqual(
      before.project.entities.map((entity: any) => entity.id),
    );
  });

  it("round-trips and deeply freezes the real schema-v3 fixture", () => {
    const parsed = parseSnapshotV3(snapshotV3Fixture);
    expect(parsed).toEqual(snapshotV3Fixture);
    expect(snapshotV3Fixture.project.sceneEnvironment).toEqual(APPROVED_SCENE_ENVIRONMENT);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.project.planReferences)).toBe(true);
    expect(Object.isFrozen(parsed.project.sceneEnvironment.key.direction)).toBe(true);
  });

  it.each([
    ["snapshot key", (value: any) => { value.executable = true; }, "snapshot.executable"],
    ["project key", (value: any) => { value.project.executable = true; }, "project.executable"],
    ["nested transform key", (value: any) => { value.project.planReferences[0].transform.scale.z = 1; }, "project.planReferences[0].transform.scale.z"],
    ["environment key", (value: any) => { value.project.sceneEnvironment.key.castShadow = true; }, "project.sceneEnvironment.key.castShadow"],
  ])("rejects an unknown exact-key v3 %s", (_name, mutate, path) => {
    const input = planReferenceSnapshot();
    mutate(input);
    expectModelIssue(() => parseSnapshotV3(input), "INVALID_VALUE", path);
  });

  it("enforces global UUID uniqueness across new v3 collections", () => {
    const input = planReferenceSnapshot();
    input.project.planReferences[0].id = input.assets[0].id;
    expectModelIssue(() => parseSnapshotV3(input), "DUPLICATE_UUID", "assets[0].id");
  });

  it.each([
    ["floor", (value: any) => { value.project.planReferences[0].floorId = contractId(90); }, "project.planReferences[0].floorId"],
    ["layer", (value: any) => { value.project.planReferences[0].layerId = contractId(90); }, "project.planReferences[0].layerId"],
    ["asset", (value: any) => { value.project.planReferences[0].assetId = contractId(90); }, "project.planReferences[0].assetId"],
  ])("rejects a foreign plan-reference %s", (_name, mutate, path) => {
    const input = planReferenceSnapshot();
    mutate(input);
    expectModelIssue(() => parseSnapshotV3(input), "INVALID_REFERENCE", path);
  });

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid plan-reference opacity %s",
    (opacity) => {
      const input = planReferenceSnapshot();
      input.project.planReferences[0].opacity = opacity;
      expectModelIssue(() => parseSnapshotV3(input), "INVALID_VALUE", "project.planReferences[0].opacity");
    },
  );

  it.each([
    ["unsupported media", (value: any) => { value.assets[0].mediaType = "application/pdf"; }, "assets[0].mediaType"],
    ["digest path mismatch", (value: any) => { value.assets[0].relativePath = `assets/sha256/bb/${"a".repeat(64)}.png`; }, "assets[0].relativePath"],
    ["filename", (value: any) => { value.assets[0].relativePath = "floor.png"; }, "assets[0].relativePath"],
    ["absolute path", (value: any) => { value.assets[0].relativePath = "C:\\floor.png"; }, "assets[0].relativePath"],
    ["remote URL", (value: any) => { value.assets[0].relativePath = "https://example.test/floor.png"; }, "assets[0].relativePath"],
    ["file URL", (value: any) => { value.assets[0].relativePath = "file:///floor.png"; }, "assets[0].relativePath"],
    ["traversal", (value: any) => { value.assets[0].relativePath = "assets/sha256/aa/../floor.png"; }, "assets[0].relativePath"],
    ["backslash", (value: any) => { value.assets[0].relativePath = `assets\\sha256\\aa\\${"a".repeat(64)}.png`; }, "assets[0].relativePath"],
    ["PNG byte limit", (value: any) => { value.assets[0].size = 268_435_457; }, "assets[0].size"],
    ["unsafe byte count", (value: any) => { value.assets[0].size = Number.MAX_SAFE_INTEGER + 1; }, "assets[0].size"],
  ])("rejects invalid canonical asset policy: %s", (_name, mutate, path) => {
    const input = planReferenceSnapshot();
    mutate(input);
    expectModelIssue(
      () => parseSnapshotV3(input),
      path.endsWith(".relativePath") ? "INVALID_RELATIVE_PATH" : "INVALID_VALUE",
      path,
    );
  });

  it.each([
    ["PNG", "image/png", 268_435_456],
    ["JPEG", "image/jpeg", 268_435_456],
    ["SVG", "image/svg+xml", 33_554_432],
    ["MP4", "video/mp4", 4_294_967_296],
    ["WebM", "video/webm", 4_294_967_296],
  ])("accepts the exact %s byte limit", (_name, mediaType, size) => {
    const input = planReferenceSnapshot(mediaType);
    input.assets[0].size = size;
    if (mediaType.startsWith("video/")) input.project.planReferences = [];
    expect(parseSnapshotV3(input).assets[0]?.size).toBe(size);
  });

  it("rejects video assets as plan references", () => {
    const input = planReferenceSnapshot("video/mp4");
    expectModelIssue(() => parseSnapshotV3(input), "INVALID_REFERENCE", "project.planReferences[0].assetId");
  });

  it.each([
    ["zero width", (value: any) => { value.project.planReferences[0].intrinsicSize.width = 0; }, "project.planReferences[0].intrinsicSize.width"],
    ["fractional width", (value: any) => { value.project.planReferences[0].intrinsicSize.width = 1.5; }, "project.planReferences[0].intrinsicSize.width"],
    ["oversized height", (value: any) => { value.project.planReferences[0].intrinsicSize.height = 16_385; }, "project.planReferences[0].intrinsicSize.height"],
  ])("rejects invalid intrinsic plan size: %s", (_name, mutate, path) => {
    const input = planReferenceSnapshot();
    mutate(input);
    expectModelIssue(() => parseSnapshotV3(input), "INVALID_VALUE", path);
  });

  it("accepts coherent calibration evidence and exact uniform scale", () => {
    const input = planReferenceSnapshot();
    input.project.planReferences[0].transform.scale = { x: 2.5, y: 2.5 };
    input.project.planReferences[0].calibration = {
      sourcePointA: { x: 0, y: 0 },
      sourcePointB: { x: 100, y: 0 },
      measuredDistanceMm: 250,
    };
    expect(parseSnapshotV3(input).project.planReferences[0]).toEqual(input.project.planReferences[0]);
  });

  it.each([
    ["coincident points", (value: any) => { value.project.planReferences[0].calibration.sourcePointB = { x: 0, y: 0 }; }, "project.planReferences[0].calibration.sourcePointB"],
    ["outside source", (value: any) => { value.project.planReferences[0].calibration.sourcePointB.x = 101; }, "project.planReferences[0].calibration.sourcePointB.x"],
    ["nonpositive distance", (value: any) => { value.project.planReferences[0].calibration.measuredDistanceMm = 0; }, "project.planReferences[0].calibration.measuredDistanceMm"],
    ["nonuniform scale", (value: any) => { value.project.planReferences[0].transform.scale.y = 2; }, "project.planReferences[0].transform.scale"],
    ["inconsistent scale", (value: any) => { value.project.planReferences[0].transform.scale = { x: 3, y: 3 }; }, "project.planReferences[0].transform.scale"],
  ])("rejects invalid calibration evidence: %s", (_name, mutate, path) => {
    const input = planReferenceSnapshot();
    input.project.planReferences[0].transform.scale = { x: 2.5, y: 2.5 };
    input.project.planReferences[0].calibration = {
      sourcePointA: { x: 0, y: 0 },
      sourcePointB: { x: 100, y: 0 },
      measuredDistanceMm: 250,
    };
    mutate(input);
    expectModelIssue(() => parseSnapshotV3(input), "INVALID_VALUE", path);
  });

  it.each([
    ["non-finite translation", (value: any) => { value.project.planReferences[0].transform.translation.x = Number.POSITIVE_INFINITY; }, "project.planReferences[0].transform.translation.x"],
    ["unsafe world bounds", (value: any) => { value.project.planReferences[0].transform.translation.x = 1_000_000_001; }, "project.planReferences[0].transform"],
    ["overflowing scale", (value: any) => { value.project.planReferences[0].transform.scale = { x: 20_000_000, y: 20_000_000 }; }, "project.planReferences[0].transform"],
  ])("rejects invalid or out-of-bounds plan transform: %s", (_name, mutate, path) => {
    const input = planReferenceSnapshot();
    mutate(input);
    expectModelIssue(() => parseSnapshotV3(input), "INVALID_VALUE", path);
  });

  it("parses normalized later-M2 records and validates their references", () => {
    const input = asV3Input(completeSnapshotInput());
    input.project.openings = [{
      id: contractId(30), name: "Door", tags: [], wallId: contractId(7), kind: "door",
      distanceAlongWall: 500, width: 900, height: 2100, sillHeight: 0,
    }];
    input.project.guidedRoutes = [{
      id: contractId(31), name: "Tour", tags: [], routeNetworkId: contractId(14),
      stopNodeIds: [contractId(15), contractId(16)],
    }];
    input.project.materials = [{
      id: contractId(32), name: "Paint", tags: [], baseColor: "#5f8f96",
      roughness: 0.4, metalness: 0, opacity: 1, assetId: contractId(20),
    }];
    input.project.materialAssignments = [{
      id: contractId(33), name: "Case material", tags: [], materialId: contractId(32),
      targetKind: "fixture", targetId: contractId(4),
    }];

    const parsed = parseSnapshotV3(input);
    expect(parsed.project.openings).toEqual(input.project.openings);
    expect(parsed.project.guidedRoutes).toEqual(input.project.guidedRoutes);
    expect(parsed.project.materials).toEqual(input.project.materials);
    expect(parsed.project.materialAssignments).toEqual(input.project.materialAssignments);
  });

  it.each([
    ["opening wall", (value: any) => { value.project.openings[0].wallId = contractId(4); }, "project.openings[0].wallId"],
    ["guided route network", (value: any) => { value.project.guidedRoutes[0].routeNetworkId = contractId(90); }, "project.guidedRoutes[0].routeNetworkId"],
    ["material asset", (value: any) => { value.project.materials[0].assetId = contractId(90); }, "project.materials[0].assetId"],
    ["material assignment", (value: any) => { value.project.materialAssignments[0].materialId = contractId(90); }, "project.materialAssignments[0].materialId"],
  ])("rejects an invalid normalized %s reference", (_name, mutate, path) => {
    const input = asV3Input(completeSnapshotInput());
    input.project.openings = [{ id: contractId(30), name: "Door", tags: [], wallId: contractId(7), kind: "door", distanceAlongWall: 500, width: 900, height: 2100, sillHeight: 0 }];
    input.project.guidedRoutes = [{ id: contractId(31), name: "Tour", tags: [], routeNetworkId: contractId(14), stopNodeIds: [contractId(15), contractId(16)] }];
    input.project.materials = [{ id: contractId(32), name: "Paint", tags: [], baseColor: "#5f8f96", roughness: 0.4, metalness: 0, opacity: 1, assetId: contractId(20) }];
    input.project.materialAssignments = [{ id: contractId(33), name: "Case material", tags: [], materialId: contractId(32), targetKind: "fixture", targetId: contractId(4) }];
    mutate(input);
    expectModelIssue(() => parseSnapshotV3(input), "INVALID_REFERENCE", path);
  });
});
