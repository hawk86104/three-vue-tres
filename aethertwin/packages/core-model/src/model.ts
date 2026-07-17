import {
  assertNonEmptyString,
  assertProfile,
  assertTimestamp,
  assertUuid,
  parseManifest,
  parseSnapshotV1,
} from "./validation";

export const CURRENT_SCHEMA_VERSION = 1 as const;

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

export interface Floor {
  readonly id: string;
  readonly name: string;
  readonly tags: readonly string[];
}

export interface SpatialProject {
  readonly id: string;
  readonly name: string;
  readonly tags: readonly string[];
  readonly profile: ProjectProfile;
  readonly floors: readonly Floor[];
}

export interface AssetRecord {
  readonly id: string;
  readonly sha256: string;
  readonly relativePath: string;
  readonly mediaType: string;
  readonly size: number;
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

  return parseSnapshotV1({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sequence: 0,
    checkpointSequence: 0,
    project: {
      id: assertUuid(makeId(), "project.id"),
      name,
      tags: [],
      profile,
      floors: [{ id: assertUuid(makeId(), "project.floors[0].id"), name: "一层", tags: [] }],
    },
    assets: [],
  });
}

export function createManifest(
  snapshot: ProjectSnapshot,
  options: { now?: () => string; appVersion: string },
): ProjectManifest {
  const validatedSnapshot = parseSnapshotV1(snapshot);
  const timestamp = assertTimestamp((options.now ?? (() => new Date().toISOString()))(), "createdAt");
  const appVersion = assertNonEmptyString(options.appVersion, "appVersion");

  return parseManifest({
    schemaVersion: validatedSnapshot.schemaVersion,
    projectId: validatedSnapshot.project.id,
    name: validatedSnapshot.project.name,
    profile: validatedSnapshot.project.profile,
    createdAt: timestamp,
    updatedAt: timestamp,
    appVersion,
    minCompatibleAppVersion: appVersion,
  });
}
