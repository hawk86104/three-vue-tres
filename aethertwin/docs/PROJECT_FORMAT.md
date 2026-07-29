# Project format

Every editable project is a directory:

```text
ProjectName.twinproj/
  manifest.json
  project.db
  assets/
    sha256/
      <first-two-hex>/
        <sha256>.<canonical-extension>
  thumbnails/
  derived/
    recovery/
  exports/
```

The mutable source of truth is `project.db`; `manifest.json` is a lightweight identity/compatibility cache. Runtime validates manifest, database metadata, and the latest snapshot together. Identity/schema/profile disagreement returns `MANIFEST_DATABASE_MISMATCH`; a newer project version returns `UNSUPPORTED_SCHEMA_VERSION`.

## Manifest, snapshot, and migration

The current schema version is 3. Manifest fields are `schemaVersion`, UUID `projectId`, `name`, immutable `profile` (`showroom` or `market`), RFC 3339 `createdAt`/`updatedAt`, `appVersion`, and `minCompatibleAppVersion`. Snapshot repeats schema/project/profile identity and carries JavaScript-safe `sequence` and `checkpointSequence`.

Schema v3 stores floors/layers, M1 spatial entities and dimensions, assets, plan references, openings, product/media content, route networks, guided routes, materials/assignments, scene environment, and earlier contract collections. Stored plan units are millimetres and angles are radians.

Migration is deterministic: v1 -> v2 derives one default layer per floor and initializes v2 state; v2 -> v3 preserves IDs, values, collection order, `sequence`, and `checkpointSequence`, then adds only v3 collections and deterministic scene environment. Native project I/O checkpoints the complete v1 -> v2 -> v3 or v2 -> v3 chain before publishing an editor session. A failed migration checkpoint restores the prior coherent manifest/database pair.

## Asset records and project-relative paths

An `AssetRecord` contains UUID `id`, lowercase 64-hex `sha256`, exact canonical `relativePath`, canonical `mediaType`, and non-negative JavaScript-safe `size`. The only valid asset project-relative path is:

```text
assets/sha256/<first-two-hex>/<sha256>.<canonical-extension>
```

Canonical mappings are PNG -> `.png`, JPEG -> `.jpg`, sanitized SVG -> `.svg`, MP4 -> `.mp4`, and WebM -> `.webm`. Absolute paths, drive/UNC paths, backslashes, traversal, source filenames, remote URLs, and `file://` are invalid. SQLite stores metadata only and has no media BLOB column.

Native import publishes immutable bytes before record commit. Existing canonical destinations are reused only when regular-file identity, length, and digest match; a collision is never overwritten. Undo removes the record/reference but intentionally leaves immutable bytes. Orphan pruning is outside M2.1.

## Plan references and calibration

A plan reference contains `id`, name/tags, `floorId`, `layerId`, `assetId`, intrinsic source size, source-to-world transform, opacity, `locked`, and optional calibration. `transform.translation` and rendered distances are millimetres; rotation is radians; scale converts source-image units to world millimetres.

Calibration contains `sourcePointA`, `sourcePointB`, and positive `measuredDistanceMm`. Applying calibration and its exact uniform scale is one reversible record patch. A missing/corrupt asset does not delete or rewrite the reference. Reimport creates a new immutable asset record, retargets the reference while preserving transform/property state, and always clears calibration so the replacement must be measured again.

## SQLite storage migration 1

SQLite uses WAL, foreign keys, and a 5,000 ms busy timeout. Storage migration 1 creates exactly these tables; its number is independent from snapshot schema v3.

| Table | Columns and constraints |
| --- | --- |
| `schema_migrations` | `version INTEGER PRIMARY KEY`, `checksum TEXT NOT NULL`, `applied_at TEXT NOT NULL` |
| `project_meta` | `key TEXT PRIMARY KEY`, `value_json TEXT NOT NULL` |
| `entity_records` | `id TEXT PRIMARY KEY`, `entity_type TEXT NOT NULL`, `parent_id TEXT`, `revision INTEGER NOT NULL`, `payload_json TEXT NOT NULL` |
| `command_journal` | `sequence INTEGER PRIMARY KEY`, `transaction_id TEXT NOT NULL`, `command_type TEXT NOT NULL`, `payload_json TEXT NOT NULL`, `inverse_payload_json TEXT NOT NULL`, `action TEXT NOT NULL CHECK(action IN ('apply','undo','redo'))`, `created_at TEXT NOT NULL` |
| `snapshots` | `sequence INTEGER PRIMARY KEY`, `snapshot_json TEXT NOT NULL`, `checksum TEXT NOT NULL`, `created_at TEXT NOT NULL` |
| `asset_records` | `id TEXT PRIMARY KEY`, `sha256 TEXT NOT NULL`, `relative_path TEXT NOT NULL`, `media_type TEXT NOT NULL`, `size INTEGER NOT NULL CHECK(size >= 0)`, `metadata_json TEXT NOT NULL` |

`snapshot.records.patch` is a discriminated collection allowlist for `assets`, `planReferences`, `openings`, `productContents`, `mediaAssets`, `routeNetworks`, `guidedRoutes`, `materials`, and `materialAssignments`. Rust parses each selected collection into its schema-v3 type, validates exact before/after/inverse values and normalized indexes, then writes entity/asset records, journal rows, and metadata in one transaction.

## Stable native and asset codes

Project/host codes include `INVALID_PROJECT_NAME`, `PROJECT_ALREADY_EXISTS`, `PROJECT_NOT_FOUND`, `INVALID_PROJECT_STRUCTURE`, `UNSUPPORTED_SCHEMA_VERSION`, `MANIFEST_DATABASE_MISMATCH`, `DATABASE_ERROR`, `PROJECT_LOCKED`, `STALE_PROJECT_LOCK`, `INVALID_RESOURCE_PATH`, `RECOVERY_FAILED`, `FILESYSTEM_ERROR`, `IPC_INVALID_REQUEST`, `SESSION_NOT_FOUND`, `HOST_STATE_UNAVAILABLE`, `SESSION_STATE_UNAVAILABLE`, `SESSION_RECOVERY_REQUIRED`, and `PROJECT_CREATED_SESSION_UNAVAILABLE`.

Import codes include `INVALID_ASSET_IMPORT_REQUEST`, `UNSUPPORTED_ASSET_TYPE`, `ASSET_EXTENSION_SIGNATURE_MISMATCH`, `ASSET_ROLE_MEDIA_MISMATCH`, `ASSET_TOO_LARGE`, `INVALID_ASSET_IMAGE_DIMENSIONS`, `UNSAFE_SVG`, `ASSET_SOURCE_CHANGED`, `ASSET_SOURCE_NOT_REGULAR_FILE`, `ASSET_IMPORT_CANCELLED`, `ASSET_COLLISION`, and `ASSET_IO_FAILED`. Host operation/progress codes include `ASSET_IMPORT_OPERATION_EXISTS`, `ASSET_IMPORT_OPERATION_NOT_FOUND`, `ASSET_PROGRESS_OPERATION_MISMATCH`, `ASSET_PROGRESS_NOT_MONOTONIC`, and `ASSET_PROGRESS_DELIVERY_FAILED`.

Resolver issues are `ASSET_NOT_FOUND`, `ASSET_MISSING`, `ASSET_NOT_REGULAR_FILE`, `ASSET_SIZE_MISMATCH`, `ASSET_DIGEST_MISMATCH`, and `ASSET_UNAVAILABLE`. Raw paths, SQL, source filenames, and operating-system details are never part of the public error contract.