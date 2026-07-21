import type {
  CameraShot,
  MediaAsset,
  ProductContent,
  RouteNetwork,
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
  parseSnapshotV2,
} from "./validation";

export const CURRENT_SCHEMA_VERSION = 2 as const;

export type ProjectProfile = "showroom" | "market";
export type SaveState = "dirty" | "saving" | "saved" | "error" | "recovered";

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

export interface AssetRecord {
  readonly id: string;
  readonly sha256: string;
  readonly relativePath: string;
  readonly mediaType: string;
  readonly size: number;
}

export interface SpatialProject {
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

export interface ProjectSnapshot {
  readonly schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  readonly sequence: number;
  readonly checkpointSequence: number;
  readonly project: SpatialProject;
  readonly assets: readonly AssetRecord[];
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

  return parseSnapshotV2({
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
    },
    assets: [],
  });
}

export function createManifest(
  snapshot: ProjectSnapshot,
  options: { now?: () => string; appVersion: string },
): ProjectManifest {
  const validatedSnapshot = parseSnapshotV2(snapshot);
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
