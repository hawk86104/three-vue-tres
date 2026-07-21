import { CURRENT_SCHEMA_VERSION, type ProjectSnapshot } from "./model";
import { parseSnapshotV2 } from "./validation";

type UnknownRecord = Record<string, unknown>;
export type SnapshotMigration = (snapshot: UnknownRecord) => UnknownRecord;

function asRecord(value: unknown, label: string): UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected an object`);
  }
  return value as UnknownRecord;
}

function asV1Project(value: unknown): UnknownRecord & { floors: UnknownRecord[] } {
  const project = asRecord(value, "project");
  if (!Array.isArray(project.floors)) {
    throw new Error("Invalid project.floors: expected an array");
  }
  return {
    ...project,
    floors: project.floors.map((floor, index) =>
      asRecord(floor, `project.floors[${index}]`)),
  };
}

export function defaultLayerIdForFloor(floorId: string): string {
  const canonical = floorId.toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(canonical)) {
    throw new Error("Invalid project floor UUID");
  }
  const bytes = canonical.replaceAll("-", "").match(/.{2}/g)?.map((pair) => Number.parseInt(pair, 16));
  if (bytes === undefined || bytes.length !== 16) {
    throw new Error("Invalid project floor UUID");
  }
  bytes[15] = bytes[15]! ^ 0xa7;
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const snapshotMigrationRegistry: ReadonlyMap<number, SnapshotMigration> = new Map([
  [1, (source) => {
    const project = asV1Project(source.project);
    return {
      ...source,
      schemaVersion: 2,
      project: {
        ...project,
        floors: project.floors.map((floor) => ({
          ...floor,
          layers: [{
            id: defaultLayerIdForFloor(String(floor.id)),
            name: "默认图层",
            tags: [],
            visible: true,
            locked: false,
          }],
        })),
        entities: [],
        vendors: [],
        productContents: [],
        mediaAssets: [],
        routeNetworks: [],
        themes: [],
        cameraShots: [],
        storySequences: [],
      },
    };
  }],
]);

function schemaVersionOf(value: unknown): number {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid schemaVersion: expected a snapshot object");
  }
  const schemaVersion = (value as UnknownRecord).schemaVersion;
  if (!Number.isSafeInteger(schemaVersion) || (schemaVersion as number) < 1) {
    throw new Error("Invalid schemaVersion: expected a positive safe integer");
  }
  return schemaVersion as number;
}

export function migrateSnapshot(value: unknown): ProjectSnapshot {
  let candidate = value;
  let schemaVersion = schemaVersionOf(candidate);

  if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error("UNSUPPORTED_SCHEMA_VERSION");
  }

  while (schemaVersion < CURRENT_SCHEMA_VERSION) {
    const migration = snapshotMigrationRegistry.get(schemaVersion);
    if (migration === undefined) {
      throw new Error("UNSUPPORTED_SCHEMA_VERSION");
    }
    candidate = migration(candidate as UnknownRecord);
    schemaVersion = schemaVersionOf(candidate);
  }

  return parseSnapshotV2(candidate);
}
