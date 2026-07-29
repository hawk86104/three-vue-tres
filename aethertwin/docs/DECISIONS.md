# Decisions

## Isolated workspace and fixed profiles

AetherTwin is implemented in the isolated `aethertwin/` workspace because the parent repository contains unrelated work. The product accepts only `showroom` and `market`; profile is validated in TypeScript and Rust and cannot be changed after creation.

## Local-first, desktop-first persistence

Project creation/opening, SQLite, locks, recovery, import publication, and verified filesystem access remain inside Rust behind typed boundaries. Studio validates every native DTO and never exposes raw native errors. The web sandbox is in-memory and Vite-development-only; production web without Tauri fails closed.

## One durable model and transient projections

Tree, canvas, accessible mirror, Inspector, and Asset Library project one schema-v3 snapshot. Zustand stores transient UI state only. Pixi objects, textures, Blob/native handles, progress, selection, placement previews, and calibration previews are never project records.

M1 entity edits use `plan.entities.patch`; M2.1 records use the typed `snapshot.records.patch` collection allowlist. Both retain exact inverse values and publish only after the same SQLite transaction commits. There is no arbitrary JSON Pointer mutation path.

## Deterministic schema-v3 migration

New projects are v3. Coherent v1 projects migrate through v2; coherent v2 projects migrate directly to v3. The v2 -> v3 step preserves all existing IDs, values, order, sequence, and checkpoint sequence while adding only deterministic v3 state. Native checkpoint completes before the editor session is published, and failure restores the previous coherent pair.

## Immutable content-addressed assets

Persisted asset paths are derived only from SHA-256 and canonical media extension. Native import uses unique staging, streaming validation/hash, flush/fsync, and no-replace publication. Existing destinations are reused only after identity, length, and digest match. A collision never overwrites existing bytes.

Record commit is deliberately separate from byte publication. If metadata commit fails, immutable unreferenced bytes can remain and the same import/commit can safely retry. Undo removes records, not bytes. This avoids destructive rollback races; orphan pruning is a later explicit operation.

## Verified custom-protocol reads

Asset bytes are resolved by `(sessionId, assetId)`, not by a renderer-supplied path. The resolver re-derives the canonical path, verifies identity/size/digest, and returns an owner-bound handle. The custom protocol provides GET/HEAD and one bounded Range; corrupt bytes are never served. Session close, commit reconciliation, replacement, and recovery invalidate affected handles.

This keeps the native surface at exactly eight invokes. The `main` window retains only `core:window:default` and `dialog:allow-open`; broad filesystem permission is rejected.

## Atomic plan references and calibration

Importing a floor plan commits the `AssetRecord` and initial `PlanReference` in one reversible transaction. Reference transform maps source-image coordinates into world millimetres. Two-point calibration stores both source points and measured millimetres and updates the uniform scale in the same patch. Lock state blocks ordinary property/transform/calibration mutation until explicitly unlocked.

Missing/corrupt assets preserve the durable reference and show a placeholder. Reimport creates new immutable content, retargets the reference, preserves transform/property state, and always clears calibration so the replacement must be measured again. The old asset record remains for history and later pruning policy.

## Explicit recovery and shutdown

Stale/crash state requires structured `STALE_PROJECT_LOCK` data and explicit user confirmation. Recovery works on a verified copy and never mutates the source on a refused attempt. Checkpoint returns one authoritative manifest/snapshot pair. Clean close checkpoints, marks clean shutdown, truncates WAL, closes SQLite, invalidates asset handles, and removes the held lock.

Create/open/recover/import work participates in session lifecycle coordination. `close_all` waits for in-flight work, drains successful sessions, keeps failures retryable, and prevents publication after successful shutdown.

## Honest milestone boundary

M1 and M2.1 are accepted. The environment-limited Windows reparse test was explicitly waived without being claimed as passing. Only working Import and Calibrate controls were added. Openings/rooms, fixture catalogues, content UI, routes, 3D, export, Player/media, and market workflow remain deferred. Task 14 claims source/test/type/lint/Rust evidence only; it does not claim build, browser, packaged-runtime, screenshot, real-GPU, or performance evidence.
