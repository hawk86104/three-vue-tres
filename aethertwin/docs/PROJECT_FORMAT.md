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

The current schema version is 3. Manifest fields are `schemaVersion`, UUID `projectId`, `name`, immutable `profile` (`showroom` or `market`), RFC 3339 timestamps, `appVersion`, and `minCompatibleAppVersion`. Snapshot repeats schema/project/profile identity and carries JavaScript-safe `sequence` and `checkpointSequence`.

Schema v3 stores floors/layers, M1 entities/dimensions, assets, plan references, openings, product/media content, route networks, guided routes, material definitions, material assignments, and one scene environment. M2.4 activates existing v3 material/assignment/environment contracts; it does not change schema version and adds no SQLite storage migration.

Migration remains deterministic: v1 -> v2 -> v3 or v2 -> v3 before editor-session publication. IDs, values, collection order, sequence, and checkpoint sequence are preserved; a failed migration checkpoint restores the prior coherent manifest/database pair.

## Durable M2.4 records

`MaterialDefinition` stores the durable surface values used by the renderer, including base color, roughness, metalness, opacity, and an optional project asset reference. `MaterialAssignment` binds one definition to an allowlisted space-floor, wall, or fixture target. Shared definitions remain independent durable records; editing one affects each assignment that references its stable ID.

The project has one durable `SceneEnvironment`. Environment edits use the strict journal command:

```text
scene.environment.patch
  { before: SceneEnvironment, after: SceneEnvironment }
```

The complete before/after value is validated with exact-before semantics during apply, undo, redo, reopen, and recovery replay. A no-op does not publish.

Materials and assignments continue to use the discriminated `snapshot.records.patch` allowlist. Creating a definition and its first assignment is one heterogeneous transaction. Removing an assignment does not implicitly delete an unreferenced definition.

Camera state, view mode, renderer status/error, selection, route preview, decoded texture, Three/R3F objects, GPU resources, render targets, and Blob URLs are not project-format fields. ProjectStore owns transient Blob URL leases; the renderer owns only its transient Three/R3F resources. The M2.5 `SceneExportPort` captures immutable runtime scene/camera state and does not add a schema-v3 record.

## Asset records and project-relative paths

An `AssetRecord` contains UUID `id`, lowercase 64-hex `sha256`, exact canonical `relativePath`, canonical `mediaType`, and a non-negative JavaScript-safe `size`. The only valid asset project-relative path is:

```text
assets/sha256/<first-two-hex>/<sha256>.<canonical-extension>
```

Canonical mappings are PNG -> `.png`, JPEG -> `.jpg`, sanitized SVG -> `.svg`, MP4 -> `.mp4`, and WebM -> `.webm`. Absolute paths, drive/UNC paths, backslashes, traversal, source filenames, remote URLs, and `file://` are invalid. SQLite stores metadata only and has no media BLOB column.

M2.4 material textures reuse the existing project-bound import and custom-protocol path with the `material-texture` role. That role accepts only PNG, JPEG, and sanitized SVG. It does not accept video, remote URLs, or unsanitized SVG. Import completion rechecks project identity, material exact-before state, and ProjectStore generation before publishing the asset plus material reference transaction.

A missing or undecodable texture does not alter durable material data. Rendering falls back to the saved `baseColor` and reports a transient safe issue.

## Building, content, routes, and references

Plan references store project asset ID, source dimensions, source-to-world transform, opacity, lock state, and optional calibration. Source points and measured distance are durable; previews and renderer objects are not.

Openings are wall-bound durable records. Wall plus attached-opening mutation is one `building.structure.patch`, validated against one candidate final snapshot and replayed atomically.

A product content record targets a fixture or product hotspot and owns ordered media IDs. Each media record points to one local durable asset. A route network owns authored nodes/edges. A guided route persists only ordered stop node IDs; resolved paths, turn points, distance, drafts, and diagnostics are transient.

Seven showroom catalogue descriptors and primitive parts are runtime metadata. A placement persists only ordinary fixture fields. Compatible generic fixtures may omit `spatial3D`; 3D projection uses a 1,000 mm fallback without materializing it into the snapshot.

## Atomic history and recovery

M2.4 adds no native invoke and no storage migration. Existing typed commands remain the only durable mutation path:

- `plan.entities.patch` and `plan.floor.patch` for plan data;
- `snapshot.records.patch` for allowlisted record collections, including materials and assignments;
- `building.structure.patch` for atomic wall/opening changes;
- `scene.environment.patch` for the singleton environment.

Exact before/index/order, after, inverse values, journal rows, normalized records, metadata, and snapshot publication commit atomically. Apply, undo, redo, checkpoint/reopen, and confirmed dirty recovery reuse the same typed schema-v3 parsers and replay rules. A failed candidate never publishes partial data.

## SQLite storage migration 1

SQLite uses WAL, foreign keys, and a 5,000 ms busy timeout. Storage migration 1 remains the only migration and is independent from project schema v3.

| Table | Purpose |
| --- | --- |
| `schema_migrations` | applied storage migration number/checksum |
| `project_meta` | project/session metadata |
| `entity_records` | normalized typed project records |
| `command_journal` | exact apply/undo/redo payload and inverse |
| `snapshots` | checksummed immutable snapshot publications |
| `asset_records` | asset identity and metadata, never media BLOBs |

The native invoke allowlist remains exactly eight. Asset reads remain on the session-bound custom protocol rather than a new invoke. M2.4 adds no capability.
