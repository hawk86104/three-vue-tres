# Decisions

## Isolated workspace and fixed profiles

AetherTwin remains isolated in the `aethertwin/` workspace. The product accepts only immutable `showroom` and `market` profiles. Showroom has M2.4 2D/3D/fixed-split preview; Market remains 2D-only.

## One durable model and transient projections

ProjectStore and CommandBus are the only durable publication path. Floors, entities, openings, content, routes, assets, material definitions, material assignments, and scene environment exist in the schema-v3 snapshot.

Camera, view mode, renderer status/error, selection, route projection, drafts, previews, and focus state are scoped Zustand session state only. PixiJS and Three/R3F objects are projections. They never become records and never directly mutate business data.

ProjectStore is the sole owner of renderer-facing source leases. Source backends own Blob URL creation/revocation; the dedicated Web Demo uses `SandboxProjectBackend` for that role. Renderer resource tables own only decoded textures, geometry, materials, and temporary render targets. They release those resources exactly once but never revoke a source-backend Blob URL directly.

## Schema v3 and command stability

M2.4 activates existing schema-v3 material/assignment/environment contracts. It does not add a schema version or SQLite storage migration. Deterministic v1 -> v2 -> v3 and v2 -> v3 migration remains the only project-schema upgrade path.

The M2.5 native invoke allowlist is exactly twelve after adding begin/write/finish/cancel export. Desktop capabilities remain exactly two. Material textures reuse `import_project_asset`, `cancel_project_asset_import`, and the session-bound custom protocol. The journal command `scene.environment.patch` is not a native invoke.

## Immutable content-addressed assets

Persisted asset paths are derived only from SHA-256 and canonical media extension. Native import uses unique staging, streaming validation/hash, flush/fsync, and no-replace publication. Existing destinations are reused only after regular-file identity, length, and full digest match. A collision never overwrites existing bytes.

Byte publication and metadata commit remain deliberately separate. If metadata commit fails, immutable unreferenced bytes can remain and the same import/commit can safely retry. Undo removes records and does not delete bytes. This avoids destructive rollback races; orphan pruning remains a later explicit operation.

## Verified custom-protocol reads

Asset bytes are resolved by `(sessionId, assetId)`, never by a renderer-supplied path. The resolver re-derives the canonical project-relative path, verifies regular-file identity, size, and digest, and returns an owner-bound handle. The custom protocol provides GET, HEAD, and one bounded Range; corrupt or replaced bytes are never served. Session close, commit reconciliation, record replacement, and recovery invalidate affected handles.

At the M2.1 boundary, this preserved exactly eight native invokes. M2.5 later adds the four export invokes, bringing the current surface to exactly twelve. The `main` window retains only `core:window:default` and `dialog:allow-open`; broad filesystem permission remains rejected.

## Atomic plan references and calibration

Importing a floor plan commits the `AssetRecord` and initial `PlanReference` in one reversible transaction. Reference transform maps source-image coordinates into world millimetres. Two-point calibration stores both source points and measured millimetres and updates the uniform scale in the same patch. Lock state blocks ordinary property, transform, and calibration mutation until explicitly unlocked.

Missing or corrupt assets preserve the durable reference and render a placeholder. Reimport publishes new immutable content, retargets the reference, preserves transform/property state, and always clears calibration so the replacement must be measured again. The old asset record remains available for history and later pruning policy.

## Explicit recovery and shutdown

Stale or crash state requires structured `STALE_PROJECT_LOCK` data and explicit user confirmation. Recovery operates on a verified copy and never mutates the source when recovery is refused. Checkpoint returns one authoritative manifest/snapshot pair. Clean close checkpoints, marks clean shutdown, truncates WAL, closes SQLite, invalidates asset handles, and removes the held lock.

Create, open, recover, and import work participates in session lifecycle coordination. `close_all` waits for in-flight work, drains successful sessions, keeps failures retryable, and prevents publication after successful shutdown.

## Deterministic 3D projection instead of a second model

`render-scene-3d` consumes immutable snapshot/session inputs and returns stable keyed projection records. It covers floors, wall/opening pieces, catalogue and generic fixtures, product hotspots, and a validated guided route. A projection error fails closed to an empty scene; partial 3D publication is rejected.

Stored millimetres map to Three metres as `(x / 1000, elevation / 1000, -y / 1000)`. Walls/openings use deterministic prisms rather than CSG. The seven fixture kinds reuse pure showroom descriptors; generic remains a compatibility box and is not added to the catalogue.

## Durable materials and a bounded environment

Material definitions and assignments are normal durable records and change only through exact reversible ProjectStore transactions. Project-bound texture inputs are limited to PNG, JPEG, and sanitized SVG. Missing/decode-failed textures retain durable `baseColor`.

The environment remains one approved ambient light and one directional key light with bounded values. M2.4 intentionally rejects arbitrary lights, shaders, and UV-authoring controls. Selection is a separate overlay so it never rewrites the underlying material.

## Incremental renderer lifecycle

Stable scene keys drive incremental reconciliation. Geometry is record-owned; material and texture resources are fingerprint-shared with reference counts. New records attach before old resources retire. Every async resolution carries a generation; late results are discarded and cleaned up.

R3F automatic disposal is disabled for registry-owned resources. This avoids double disposal and makes replacement/destroy idempotent. The renderer can be injected for deterministic source tests without claiming real GPU behavior.

## Fail-safe 2D priority

A WebGL initialization or rendering failure must leave the full 2D workflow available. One context-loss reconstruction is automatic. A further failure disables 3D until the user explicitly retries, which starts a fresh round. Texture decode failure degrades only that texture to base color.

This recovery policy is transient. It does not change or delete durable project data.

## M2.5 port without a fake export product

M2.4 exposes immutable camera/scene capture and offscreen readback through `SceneExportPort`. The port waits for required textures, uses a dedicated render target, restores visible renderer state, and returns unflipped RGBA.

The port is only a technical boundary for M2.5. M2.4 deliberately exposes no Export/publish control and creates no PNG, MP4, package, demo, or evidence artifact.
## M2.5 bounded export without a second business model

Showroom Export consumes the existing immutable `SceneExportPort`; it never copies scene/camera state into schema v3. ProjectStore remains the business-state owner, while Studio/Zustand and R3F own only transient export-panel, progress, input-lock, camera, and renderer state.

Ownership is one-way: `render-scene-3d` captures/readbacks, pure `exporter` validates and streams rows, `desktop-host` owns strict IPC and active native lifecycle, `project-io` owns project binding/staging/no-overwrite publication, and `media-export` owns PNG encoding/validation. The Sandbox backend has no export capability.

Only `full-hd` 1920 x 1080 and `ultra-hd` 3840 x 2160 are supported. The native result is project-relative `exports/<name>.png` plus dimensions, `byteSize`, and `sha256`. Export files are generated evidence outside schema, journal, checkpoint, and `AssetRecord` semantics.

Cancellation and close are explicit lifecycle transitions. Late capture/texture/frame/chunk/finish results are rejected; stale private stages are cleaned on failure, cancellation, open, and recovery. No overwrite is permitted.


## Local-first assets and security

Project asset identity remains content-addressed and project-relative. Absolute paths, source filenames, drive/UNC paths, `file://`, remote runtime URLs, CDN fallbacks, and media BLOBs are rejected. Import/source resolution stays behind the typed Rust and custom-protocol boundary.

Native errors remain safe structured envelopes. Broad filesystem, shell, HTTP, and SQL capabilities remain rejected.

## Honest milestone boundary

M2.4 Tasks 0-17 are implemented and independently reviewed. Task 17 passed the recorded focused TypeScript/Vitest/Rust evidence. Task 18's full non-build gate passed: frozen install exited 0 for 14 workspace projects and was already up to date; lint first exited 1 on eight M2.4-introduced issues, then passed after minimal repairs in five files; typecheck exited 0 with 13 of 14 workspace projects completed; Node policy tests passed 32/32; Vitest passed 68 files and 1,355 tests with only the known non-failing JSDOM HTMLCanvasElement.getContext notice; rustfmt exited 0; Rust tests passed 208 with one approved ignored Windows privileged reparse/symlink test while the deterministic reparse-bit unit test passed; and Cargo check exited 0. Schema v3, the exact eight commands, and both protected hashes remain unchanged. Final independent review passed with no findings: Spec Compliance Pass; Code/Doc Quality Approved; Critical/Important/Minor None; Ready Yes. M2.4 is accepted and closed.

M2.5 Tasks 1-19 are implemented and independently reviewed. Task 19 records the accepted policy/evidence baseline; Task 20 remains the only final non-build closure gate. Player, Market 3D/export, publish, MP4, `.twinpack`, GLTF, arbitrary lights/shaders, 3D geometry editing, remote runtime assets, and real-browser/GPU/visual claims remain absent.
