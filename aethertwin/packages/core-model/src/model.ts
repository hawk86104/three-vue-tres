export const CURRENT_SCHEMA_VERSION = 1 as const;

export type ProjectProfile = "showroom" | "market";
export type SaveState = "dirty" | "saving" | "saved" | "error" | "recovered";

export interface ProjectManifest {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  projectId: string;
  name: string;
  profile: ProjectProfile;
  createdAt: string;
  updatedAt: string;
  appVersion: string;
  minCompatibleAppVersion: string;
}

export interface Floor {
  id: string;
  name: string;
  tags: string[];
}

export interface SpatialProject {
  id: string;
  name: string;
  tags: string[];
  profile: ProjectProfile;
  floors: Floor[];
}

export interface AssetRecord {
  id: string;
  sha256: string;
  relativePath: string;
  mediaType: string;
  size: number;
}

export interface ProjectSnapshot {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  sequence: number;
  checkpointSequence: number;
  project: SpatialProject;
  assets: AssetRecord[];
}

export interface InitialProjectInput {
  name: string;
  profile: ProjectProfile;
  uuid?: () => string;
}

export function createInitialSnapshot(input: InitialProjectInput): ProjectSnapshot {
  const makeId = input.uuid ?? (() => crypto.randomUUID());

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sequence: 0,
    checkpointSequence: 0,
    project: {
      id: makeId(),
      name: input.name.trim(),
      tags: [],
      profile: input.profile,
      floors: [{ id: makeId(), name: "一层", tags: [] }],
    },
    assets: [],
  };
}

export function createManifest(
  snapshot: ProjectSnapshot,
  options: { now?: () => string; appVersion: string },
): ProjectManifest {
  const timestamp = (options.now ?? (() => new Date().toISOString()))();

  return {
    schemaVersion: snapshot.schemaVersion,
    projectId: snapshot.project.id,
    name: snapshot.project.name,
    profile: snapshot.project.profile,
    createdAt: timestamp,
    updatedAt: timestamp,
    appVersion: options.appVersion,
    minCompatibleAppVersion: options.appVersion,
  };
}
