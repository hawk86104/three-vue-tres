import {
  CURRENT_SCHEMA_VERSION,
  type AssetRecord,
  type Floor,
  type ProjectManifest,
  type ProjectProfile,
  type ProjectSnapshot,
  type SpatialProject,
} from "./model";
import { deepFreeze } from "./immutability";

type UnknownRecord = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function invalid(field: string, detail: string): never {
  throw new Error(`Invalid ${field}: ${detail}`);
}

function asRecord(value: unknown, field: string): UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalid(field, "expected an object");
  }
  return value as UnknownRecord;
}

function stringField(record: UnknownRecord, key: string, field = key): string {
  const value = record[key];
  return assertString(value, field);
}

export function assertString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    invalid(field, "expected a string");
  }
  return value;
}

function nonEmptyStringField(record: UnknownRecord, key: string, field = key): string {
  return assertNonEmptyString(record[key], field);
}

export function assertNonEmptyString(value: unknown, field: string): string {
  const text = assertString(value, field);
  if (text.trim().length === 0) {
    invalid(field, "must not be empty");
  }
  return text;
}

function integerField(record: UnknownRecord, key: string, field = key): number {
  return assertNonNegativeSafeInteger(record[key], field);
}

function assertNonNegativeSafeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    invalid(field, "expected a non-negative safe integer");
  }
  return value as number;
}

function uuidField(record: UnknownRecord, key: string, field = key): string {
  return assertUuid(record[key], field);
}

export function assertUuid(value: unknown, field: string): string {
  const uuid = assertString(value, field);
  if (!UUID_PATTERN.test(uuid)) {
    invalid(field, "expected a UUID");
  }
  return uuid;
}

function timestampField(record: UnknownRecord, key: string, field = key): string {
  return assertTimestamp(record[key], field);
}

export function assertTimestamp(value: unknown, field: string): string {
  const timestamp = assertString(value, field);
  if (!UTC_TIMESTAMP_PATTERN.test(timestamp)) {
    invalid(field, "expected an ISO 8601 UTC timestamp");
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    invalid(field, "expected a real ISO 8601 timestamp");
  }

  const canonical = parsed.toISOString();
  if (timestamp !== canonical && timestamp !== canonical.replace(".000Z", "Z")) {
    invalid(field, "expected a real ISO 8601 timestamp");
  }
  return timestamp;
}

function profileField(record: UnknownRecord, key: string, field = key): ProjectProfile {
  return assertProfile(record[key], field);
}

export function assertProfile(value: unknown, field: string): ProjectProfile {
  const profile = assertString(value, field);
  if (profile !== "showroom" && profile !== "market") {
    invalid(field, "expected showroom or market");
  }
  return profile;
}

function stringArrayField(record: UnknownRecord, key: string, field = key): string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    invalid(field, "expected an array of strings");
  }
  return [...value];
}

function parseFloor(value: unknown, field: string): Floor {
  const record = asRecord(value, field);
  return {
    id: uuidField(record, "id", `${field}.id`),
    name: nonEmptyStringField(record, "name", `${field}.name`),
    tags: stringArrayField(record, "tags", `${field}.tags`),
  };
}

function parseProject(value: unknown): SpatialProject {
  const record = asRecord(value, "project");
  const floors = record.floors;
  if (!Array.isArray(floors)) {
    invalid("project.floors", "expected an array");
  }
  return {
    id: uuidField(record, "id", "project.id"),
    name: nonEmptyStringField(record, "name", "project.name"),
    tags: stringArrayField(record, "tags", "project.tags"),
    profile: profileField(record, "profile", "project.profile"),
    floors: floors.map((floor, index) => parseFloor(floor, `project.floors[${index}]`)),
  };
}

function relativePathField(record: UnknownRecord, key: string, field = key): string {
  const value = nonEmptyStringField(record, key, field);
  const segments = value.split("/");
  if (
    value.startsWith("/") ||
    value.startsWith("\\") ||
    value.includes("\\") ||
    /^[a-zA-Z]:/.test(value) ||
    segments.includes("..")
  ) {
    invalid(field, "must be a normalized project-relative path");
  }
  return value;
}

function parseAsset(value: unknown, index: number): AssetRecord {
  const field = `assets[${index}]`;
  const record = asRecord(value, field);
  const sha256 = stringField(record, "sha256", `${field}.sha256`);
  if (!SHA256_PATTERN.test(sha256)) {
    invalid(`${field}.sha256`, "expected a lowercase SHA-256 digest");
  }
  return {
    id: uuidField(record, "id", `${field}.id`),
    sha256,
    relativePath: relativePathField(record, "relativePath", `${field}.relativePath`),
    mediaType: nonEmptyStringField(record, "mediaType", `${field}.mediaType`),
    size: integerField(record, "size", `${field}.size`),
  };
}

function schemaVersionField(record: UnknownRecord, field: string): typeof CURRENT_SCHEMA_VERSION {
  const value = record[field];
  if (value !== CURRENT_SCHEMA_VERSION) {
    invalid(field, `expected ${CURRENT_SCHEMA_VERSION}`);
  }
  return CURRENT_SCHEMA_VERSION;
}

export function parseManifest(value: unknown): ProjectManifest {
  const record = asRecord(value, "manifest");
  return deepFreeze({
    schemaVersion: schemaVersionField(record, "schemaVersion"),
    projectId: uuidField(record, "projectId"),
    name: nonEmptyStringField(record, "name"),
    profile: profileField(record, "profile"),
    createdAt: timestampField(record, "createdAt"),
    updatedAt: timestampField(record, "updatedAt"),
    appVersion: nonEmptyStringField(record, "appVersion"),
    minCompatibleAppVersion: nonEmptyStringField(record, "minCompatibleAppVersion"),
  });
}

export function parseSnapshotV1(value: unknown): ProjectSnapshot {
  const record = asRecord(value, "snapshot");
  const assets = record.assets;
  if (!Array.isArray(assets)) {
    invalid("assets", "expected an array");
  }
  return deepFreeze({
    schemaVersion: schemaVersionField(record, "schemaVersion"),
    sequence: integerField(record, "sequence"),
    checkpointSequence: integerField(record, "checkpointSequence"),
    project: parseProject(record.project),
    assets: assets.map((asset, index) => parseAsset(asset, index)),
  });
}
