# Project format

Every editable project is a directory:

```text
ProjectName.twinproj/
  manifest.json
  project.db
  assets/
  thumbnails/
  derived/
    recovery/                 (created/used for verified recovery copies)
  exports/
```

The mutable source of truth is `project.db`; `manifest.json` is a lightweight compatibility/identity cache. The runtime validates the manifest, database metadata, and latest snapshot together. Identity/schema/profile disagreement returns `MANIFEST_DATABASE_MISMATCH`; a newer manifest version returns `UNSUPPORTED_SCHEMA_VERSION`.

## Manifest and path rules

The current schema version is 3. A manifest contains `schemaVersion`, UUID `projectId`, `name`, immutable `profile` (`showroom` or `market`), RFC 3339 `createdAt`/`updatedAt`, `appVersion`, and `minCompatibleAppVersion`. The snapshot repeats schema/project/profile identity and carries `sequence` and `checkpointSequence`.

Schema v3 stores floors with explicit layers; six business spatial entity kinds; dimension annotations; canonical asset metadata; plan references; openings; guided routes; materials and assignments; scene environment; and the earlier contract collections. Spatial coordinates and dimensions are millimetres. Entity transform rotation is radians.

The deterministic v1-to-v2 migration derives one default layer ID from each floor UUID and initializes the v2 collections empty. The deterministic v2-to-v3 migration adds only the v3 collections and approved default scene environment. TypeScript migrates before parsing the current model. Native project I/O accepts the migration chain and the Tauri adapter checkpoints the migrated snapshot before publishing the editor session. A failed upgrade checkpoint closes or retains cleanup ownership of the native session instead of exposing a partially upgraded project.

Asset records use a SHA-256 digest, allowed media type, byte size, and an exact canonical path: `assets/sha256/<first-two-hex>/<sha256>.<canonical-extension>`. This schema validation rejects absolute paths, drive-qualified paths, UNC paths, backslashes, and parent traversal; SQLite stores no media BLOB column. These are format contracts only: asset import, resolution, and calibration are not implemented.

## SQLite storage migration 1 used by project schema v3

SQLite is configured with WAL journal mode, foreign keys on, and a 5,000 ms busy timeout. Migration 1 creates exactly these tables; runtime validation compares the live schema objects with that migration.

| Table | Columns and constraints |
| --- | --- |
| `schema_migrations` | `version INTEGER PRIMARY KEY`, `checksum TEXT NOT NULL`, `applied_at TEXT NOT NULL` |
| `project_meta` | `key TEXT PRIMARY KEY`, `value_json TEXT NOT NULL` |
| `entity_records` | `id TEXT PRIMARY KEY`, `entity_type TEXT NOT NULL`, `parent_id TEXT`, `revision INTEGER NOT NULL`, `payload_json TEXT NOT NULL` |
| `command_journal` | `sequence INTEGER PRIMARY KEY`, `transaction_id TEXT NOT NULL`, `command_type TEXT NOT NULL`, `payload_json TEXT NOT NULL`, `inverse_payload_json TEXT NOT NULL`, `action TEXT NOT NULL CHECK(action IN ('apply','undo','redo'))`, `created_at TEXT NOT NULL` |
| `snapshots` | `sequence INTEGER PRIMARY KEY`, `snapshot_json TEXT NOT NULL`, `checksum TEXT NOT NULL`, `created_at TEXT NOT NULL` |
| `asset_records` | `id TEXT PRIMARY KEY`, `sha256 TEXT NOT NULL`, `relative_path TEXT NOT NULL`, `media_type TEXT NOT NULL`, `size INTEGER NOT NULL CHECK(size >= 0)`, `metadata_json TEXT NOT NULL` |

`schema_migrations` records storage migration 1 and the SHA-256 checksum of the migration SQL. This storage migration number is independent from the project snapshot schema version. Initial metadata includes schema/identity/version fields plus `lastCommittedSequence`, `lastCheckpointSequence`, and `cleanShutdown`; initial snapshot JSON is checksummed.

The generic `plan.entities.patch` command stores full JSON `before`/`after` entity changes plus the exact inverse payload in `command_journal`; the entity payload remains in `entity_records.payload_json`. Command commits update entity/asset records, append journal rows, and update metadata in one transaction. A checkpoint writes/replaces the current snapshot row and checkpoint/name/time metadata in one database transaction, then atomically refreshes the manifest cache. Its public result is the authoritative `{ manifest, snapshot }` pair, where `snapshot.checkpointSequence === snapshot.sequence`; the native session publishes that pair in memory only after both durable steps succeed.

## Stable native error codes

| Code | Meaning |
| --- | --- |
| `INVALID_PROJECT_NAME` | Name violates project naming policy. |
| `PROJECT_ALREADY_EXISTS` | Destination already exists and is never overwritten. |
| `PROJECT_NOT_FOUND` | Requested project root is absent/moved. |
| `INVALID_PROJECT_STRUCTURE` | Existing project directory, required files, or validated data is invalid. |
| `UNSUPPORTED_SCHEMA_VERSION` | Project schema is newer than the current implementation supports. |
| `MANIFEST_DATABASE_MISMATCH` | Manifest/database/snapshot identity does not agree. |
| `DATABASE_ERROR` | SQLite operation or invariant failed. |
| `PROJECT_LOCKED` | Another live session owns the project lock. |
| `STALE_PROJECT_LOCK` | Crash/stale state requires explicit recovery confirmation. |
| `INVALID_RESOURCE_PATH` | Resource path is not a safe project-relative path. |
| `RECOVERY_FAILED` | Recovery validation or replay failed. |
| `FILESYSTEM_ERROR` | Filesystem operation failed. |
| `IPC_INVALID_REQUEST` | Native command payload is malformed or violates DTO validation. |
| `SESSION_NOT_FOUND` | Native session does not exist or has closed. |
| `HOST_STATE_UNAVAILABLE` | Host registry state is temporarily unavailable. |
| `SESSION_STATE_UNAVAILABLE` | The target session state is temporarily unavailable. |
| `SESSION_RECOVERY_REQUIRED` | Session cleanup failed and confirmed recovery is required. |
| `PROJECT_CREATED_SESSION_UNAVAILABLE` | Durable creation succeeded but native session publication did not; details contain only safe project identity and reason code. |

All native failures use the safe native error envelope. Raw paths, SQL, and operating-system error details are not part of that public contract.
