import { CURRENT_SCHEMA_VERSION, type ProjectSnapshot } from "./model";
import { parseSnapshotV1 } from "./validation";

type UnknownRecord = Record<string, unknown>;
export type SnapshotMigration = (snapshot: UnknownRecord) => UnknownRecord;

// Migrations are keyed by the schema version they consume. M0 has no prior schema.
export const snapshotMigrationRegistry: ReadonlyMap<number, SnapshotMigration> = new Map();

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

  return parseSnapshotV1(candidate);
}
