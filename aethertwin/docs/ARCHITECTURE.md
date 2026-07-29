# Architecture

## Implemented graph

```text
apps/studio (React)
  -> core-model + design-system + editor-shell
  -> asset-pipeline + plan-engine + render-plan-2d + project-store
  -> PlanEditor -> editor session/controller -> plan-engine operations
  -> PlanCanvas -> render-plan-2d -> PixiJS + verified asset source port
  -> Asset Library -> ProjectStore import/reimport coordinator
  -> project-store -> command-bus + core-model
  -> desktop: TauriProjectBackend -> desktop-host -> project-io + asset-io
  -> development web: SandboxProjectBackend + Blob asset leases

apps/player -> design-system (deferred noninteractive boundary)
```

`core-model` owns schema-v3 parsing, deterministic v1 -> v2 -> v3 migration, immutable profile contracts, floors/layers, M1 entities, asset records, plan references, and deferred record contracts. Stored plan coordinates are millimetres and rotations are radians.

`command-bus` is the serialized mutation path. Each command's durable rows, exact journal payload/inverse, and metadata commit in the same SQLite transaction. The next immutable snapshot is published only after persistence commits. `project-store` coordinates save, autosave, undo/redo, close, recovery, asset import, asset/reference transactions, reimport, and application-local recents. Zustand stores transient UI state only; it is not the project database.

## Unified 2D authoring and plan-reference path

`PlanEditor` publishes one active floor to the tree, Inspector, Asset Library, and `PlanCanvas`. The controller normalizes M1 tools, transforms, arrays, deletes, plan-reference placement, lock edits, and calibration before they reach ProjectStore. Selection, active tool, placement preview, calibration points, focus return target, import progress, and renderer handles are transient.

`render-plan-2d` projects visible M1 entities and plan references owned by the active floor/layer. `PixiPlanRenderer` owns the ordered `grid`, `content`, `annotation`, `overlay`, and `interaction` containers. Asset-backed sprites resolve by asset ID through a source port; project paths, native file handles, Blob leases, textures, and Pixi objects never become project records. The accessible DOM mirror shares selection with the canvas but is not a second model.

A plan reference stores intrinsic source size, source-to-world transform, opacity, lock state, and optional two-point calibration. Calibration retains source points and measured millimetres; the committed transform uses one exact uniform scale. Preview and overlay state remain transient until a single confirmation publishes one reversible `snapshot.records.patch`.

## Asset import and resolution boundaries

TypeScript `asset-pipeline` owns cross-runtime media classification, role checks, initial plan-reference composition, and shared limits. Native `asset-io` owns source identity capture, streaming validation/hash, unique staging, flush/fsync, no-replace publication, collision verification, cancellation, canonical path derivation, and verified resolution. Supported media are PNG, JPEG, sanitized SVG, MP4, and WebM; plan references accept only the three image formats.

Native import publishes bytes inside the project and returns only asset metadata/media facts over invoke; it does not mutate project records. ProjectStore commits the `AssetRecord` and optional initial `PlanReference` atomically through the typed `snapshot.records.patch` allowlist. If metadata commit fails, immutable published bytes may remain as unreferenced residue and a retry is safe. Undo removes records, not content-addressed bytes; orphan pruning is later work.

The resolver re-derives the canonical path from digest and media type instead of trusting persisted `relativePath`, verifies regular-file identity, size, and digest before serving, and caches only session/owner-bound handles. Commit, close, replacement, and recovery reconcile or invalidate those handles. The `aethertwin-asset` custom protocol supports GET/HEAD and one bounded byte range with canonical MIME and security headers. Missing, non-regular, size-mismatched, or digest-mismatched assets are never served as trusted bytes.

The development sandbox implements the same project-level contracts with in-memory snapshots and Blob-backed sources. Blob URLs are leased and revoked through explicit renderer/source lifecycle rules. It is a development aid, not a browser-persistence claim.

## Native command and permission boundary

`desktop-host` exposes exactly eight typed commands:

1. `create_project`
2. `open_project`
3. `commit_project`
4. `checkpoint_project`
5. `close_project`
6. `recover_project`
7. `import_project_asset`
8. `cancel_project_asset_import`

Asset reads use the custom protocol, not another invoke. Every failure uses the safe `{ code, message, details, logRef }` envelope. The `main` window has exactly `core:window:default` and `dialog:allow-open`; no broad filesystem, shell, HTTP, or SQL permission is enabled. CSP permits only local application sources plus the custom asset scheme for images/media and retains `object-src 'none'`.

## Persistence, migration, and shutdown

Creation publishes a bound staging directory without replacing an existing destination. Opening validates manifest/database/snapshot identity and SQLite runtime settings. Opening a session acquires `.aethertwin.lock`, records `cleanShutdown=false`, and returns saved, dirty, or recovered state. Stale/crash residue requires explicit confirmed recovery from a verified copy.

New projects use schema v3. A coherent v1 project migrates deterministically through v2 to v3; a coherent v2 project migrates to v3. The v2 -> v3 step preserves IDs, values, collection order, `sequence`, and `checkpointSequence`, adding only v3 collections and deterministic scene environment. Native migration checkpoints durably before the editor session is published. Checkpoint failure restores the previous coherent manifest/database pair.

A clean close checkpoints, writes `cleanShutdown=true`, truncates WAL, closes SQLite, invalidates session asset handles, and removes the held lock. `close_all` takes the exclusive lifecycle lease, waits for in-flight session publication/import work, drains the registry without holding it across individual closes, and leaves failed sessions retryable.

## Current boundary

M1 and M2.1 are accepted. The environment-limited Windows reparse test was explicitly waived without being claimed as passing. Openings/room recognition, fixture catalogues, content placement UI, routes, synchronized 3D, export, Player/media, and market workflow remain deferred. Task 14 includes no build, browser, packaged-runtime, screenshot, real-GPU, or visual-performance evidence.
