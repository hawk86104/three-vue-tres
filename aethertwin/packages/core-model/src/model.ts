import type {
  CameraShot,
  GuidedRoute,
  MaterialAssignment,
  MaterialDefinition,
  MediaAsset,
  Opening,
  PlanReference,
  ProductContent,
  RouteNetwork,
  SceneEnvironment,
  StorySequence,
  ThemeConfig,
  Vendor,
} from "./content-model";
import type { Floor, SpatialEntity } from "./spatial-entities";
import {
  assertNonEmptyString,
  assertProfile,
  assertUuid,
  parseManifest,
  parseSnapshotV3,
} from "./validation";

export const CURRENT_SCHEMA_VERSION = 3 as const;

export type ProjectProfile = "showroom" | "market";
export type SaveState = "dirty" | "saving" | "saved" | "error" | "recovered";
export type AssetMediaType = "image/png" | "image/jpeg" | "image/svg+xml" | "video/mp4" | "video/webm";
export const DEFAULT_SCENE_ENVIRONMENT: SceneEnvironment = Object.freeze({
  backgroundColor: "#101820",
  ambient: Object.freeze({ color: "#dce8f0", intensity: 0.55 }),
  key: Object.freeze({ color: "#fff1dc", intensity: 1.1, direction: Object.freeze([4, 8, 5]) as readonly [number, number, number] }),
  shadowsEnabled: true,
  shadowSoftness: 0.5,
});

export interface ProjectManifest {
  readonly schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  readonly projectId: string;
  readonly name: string;
  readonly profile: ProjectProfile;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly appVersion: string;
  readonly minCompatibleAppVersion: string;
}

export interface AssetRecordV2 {
  readonly id: string;
  readonly sha256: string;
  readonly relativePath: string;
  readonly mediaType: string;
  readonly size: number;
}

export interface AssetRecord extends AssetRecordV2 {
  readonly mediaType: AssetMediaType;
}

export interface SpatialProjectV2 {
  readonly id: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly profile: ProjectProfile;
  readonly floors: readonly Floor[];
  readonly entities: readonly SpatialEntity[];
  readonly vendors: readonly Vendor[];
  readonly productContents: readonly ProductContent[];
  readonly mediaAssets: readonly MediaAsset[];
  readonly routeNetworks: readonly RouteNetwork[];
  readonly themes: readonly ThemeConfig[];
  readonly cameraShots: readonly CameraShot[];
  readonly storySequences: readonly StorySequence[];
}

export interface SpatialProject extends SpatialProjectV2 {
  readonly planReferences: readonly PlanReference[];
  readonly openings: readonly Opening[];
  readonly guidedRoutes: readonly GuidedRoute[];
  readonly materials: readonly MaterialDefinition[];
  readonly materialAssignments: readonly MaterialAssignment[];
  readonly sceneEnvironment: SceneEnvironment;
}

export interface ProjectSnapshot {
  readonly schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  readonly sequence: number;
  readonly checkpointSequence: number;
  readonly project: SpatialProject;
  readonly assets: readonly AssetRecord[];
}

export interface ProjectSnapshotV2 {
  readonly schemaVersion: 2;
  readonly sequence: number;
  readonly checkpointSequence: number;
  readonly project: SpatialProjectV2;
  readonly assets: readonly AssetRecordV2[];
}

export interface InitialProjectInput {
  name: string;
  profile: ProjectProfile;
  uuid?: () => string;
}

export function createInitialSnapshot(input: InitialProjectInput): ProjectSnapshot {
  const makeId = input.uuid ?? (() => crypto.randomUUID());
  const name = assertNonEmptyString(input.name, "name").trim();
  const profile = assertProfile(input.profile, "profile");
  const projectId = assertUuid(makeId(), "project.id");
  const floorId = assertUuid(makeId(), "project.floors[0].id");
  const layerId = assertUuid(makeId(), "project.floors[0].layers[0].id");

  return parseSnapshotV3({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sequence: 0,
    checkpointSequence: 0,
    project: {
      id: projectId,
      name,
      tags: [],
      profile,
      floors: [{
        id: floorId,
        name: "一层",
        tags: [],
        layers: [{ id: layerId, name: "默认图层", tags: [], visible: true, locked: false }],
      }],
      entities: [],
      vendors: [],
      productContents: [],
      mediaAssets: [],
      routeNetworks: [],
      themes: [],
      cameraShots: [],
      storySequences: [],
      planReferences: [],
      openings: [],
      guidedRoutes: [],
      materials: [],
      materialAssignments: [],
      sceneEnvironment: DEFAULT_SCENE_ENVIRONMENT,
    },
    assets: [],
  });
}

export function createManifest(
  snapshot: ProjectSnapshot,
  options: { now?: () => string; appVersion: string },
): ProjectManifest {
  const validatedSnapshot = parseSnapshotV3(snapshot);
  const timestamp = (options.now ?? (() => new Date().toISOString()))();
  return parseManifest({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    projectId: validatedSnapshot.project.id,
    name: validatedSnapshot.project.name,
    profile: validatedSnapshot.project.profile,
    createdAt: timestamp,
    updatedAt: timestamp,
    appVersion: options.appVersion,
    minCompatibleAppVersion: options.appVersion,
  });
}
