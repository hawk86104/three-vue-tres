# Architecture

## Implemented M1 and accepted M2.1 graph

```text
apps/studio (React)
  -> packages/core-model + packages/design-system + packages/editor-shell
  -> packages/plan-engine + packages/render-plan-2d + packages/project-store
  -> PlanEditor -> editor session/controller -> plan-engine operations
  -> PlanCanvas -> render-plan-2d -> PixiJS
  -> packages/editor-shell -> packages/core-model + packages/design-system
  -> packages/project-store -> packages/command-bus + packages/core-model
  -> desktop: apps/studio/src/backend/tauri-backend -> crates/desktop-host -> crates/project-io
  -> web: packages/project-store/src/sandbox-backend (development only)

apps/player -> packages/design-system
```

`core-model` owns schema-v3 manifest/snapshot parsing, deterministic v1-to-v2-to-v3 migration, immutable profile contracts, floors/layers, six business spatial entities, dimension annotations, accepted M2.1 record contracts, and the deferred later-workflow records. Plan coordinates are millimetres; stored rotations are radians.

`command-bus` is the serialized mutation path. A command batch's entity delta, generic `plan.entities.patch` journal row, inverse payload, and metadata commit in the same SQLite transaction; the next immutable snapshot is published only after persistence commits. After a durable checkpoint, its queued acknowledgement rebases the current snapshot plus every undo/redo history endpoint to authoritative checkpoint metadata without changing sequence or history availability. `project-store` coordinates save, autosave, undo/redo, close, recovery, and app-local recents. Zustand stores transient UI state only; it is not the project database.

## Unified 2D authoring path

`PlanEditor` publishes one active floor to both the role-based tree/Inspector surface and `PlanCanvas`. The controller normalizes select, pan, boundary, wall, zone, space-unit, fixture, POI, dimension, transform, delete, and rectangular-array intents before they reach ProjectStore. Selection and tool state remain transient in the vanilla Zustand session store.

`render-plan-2d` projects only visible entities owned by the active floor. `PixiPlanRenderer` owns five ordered containers: `grid`, `content`, `annotation`, `overlay`, and `interaction`. Graphics are updated by stable entity keys and explicit renderer lifecycle calls. The canvas also exposes an accessible DOM mirror for selectable entities; it is not a second source of model state. PixiJS is pinned to 8.19.0 and is covered by its MIT notice in `THIRD_PARTY_NOTICES.md`.

The native chain is intentionally narrow. `desktop-host` exposes six typed commands (`create_project`, `open_project`, `commit_project`, `checkpoint_project`, `close_project`, `recover_project`) and returns a safe `{ code, message, details, logRef }` envelope. It keeps a per-session `ProjectSession`; `project-io` is the only layer that creates/opens project directories, owns SQLite, or manages locks and recovery.

## Desktop versus web sandbox

`TauriProjectBackend` is selected when Tauri internals are present (or the explicit desktop test mode is requested). It invokes the six native commands with `{ payload: ... }`, validates returned manifest/snapshot/session data, serializes backend operations, and tracks native sessions and pending cleanup. Recovery is a separate confirmed command: Studio offers it only for the structured `STALE_PROJECT_LOCK` response whose details set `recoveryRequired: true`, and requires a second user confirmation before sending `confirm: true`. A failed recovery response is re-evaluated against that same rule, so an active lock or any other ineligible result immediately clears the stale-recovery action.

`SandboxProjectBackend` exists only when `import.meta.env.DEV` is true. It keeps `sandbox://<uuid>` projects in an in-memory map, generates deterministic identifiers/timestamps, and performs no native filesystem, SQLite, dialog, lock, or recovery operation. A non-Tauri production web runtime throws `TAURI_RUNTIME_REQUIRED`; a forced sandbox there throws `WEB_SANDBOX_DISABLED`. Thus sandbox behavior is a development aid, not a web persistence claim.

## Native persistence lifecycle

Creation normalizes the project name, creates a bound staging directory, writes all required subdirectories/database/manifest, then publishes without replacing an existing destination. Opening validates the extension/structure and requires manifest, database, and snapshot identity fields to agree. SQLite runs with WAL, foreign keys enabled, and a 5-second busy timeout.

Opening a session acquires `.aethertwin.lock`, records `cleanShutdown=false`, and chooses `saved`, `dirty`, or `recovered` state. A live foreign lock yields `PROJECT_LOCKED`; stale/crash residue requires explicit recovery and otherwise yields `STALE_PROJECT_LOCK`. Recovery works from a verified copy under `derived/recovery` and validates/replays from the newest valid checkpoint. A post-publish replacement mismatch is detected and an unverified Linux/Android replacement remains under a hidden `.aethertwin-recovery-cleanup-*` quarantine leaf instead of receiving a completed-looking name. Checkpoint returns an authoritative `{ manifest, snapshot }` pair, and the native session publishes that pair in memory only after the database transaction and atomic manifest rewrite both succeed.

A clean close checkpoints, writes `cleanShutdown=true`, truncates WAL, closes SQLite, then removes the held lock. Session-producing create/open/recover operations hold a shared lifecycle lease from before disk work through registry publication. Desktop window-close and process-exit events call `close_all` under the exclusive lifecycle lease, which waits for in-flight producers, blocks publication while draining the registry, and confirms the registry is empty before success. Successful shutdown marks the lifecycle closed before releasing the exclusive lease, so waiting or later producers cannot publish; failed shutdown leaves it open after lease release so the user can retry. Registry locks are not held while individual sessions close, successful sessions are removed, failed sessions remain available for retry, and a close failure prevents exit while showing only the sanitized native message and log reference.

## Current boundary

M1 is the implemented unified authoring core. M2.1 Tasks 1?4 are implemented and independently accepted, including Task 4's independent review. Asset import, asset resolution, and calibration are not implemented; Task 5+ is not implemented. Native invokes remain exactly the six commands listed above. There is no runtime, browser, GPU, or packaged-application evidence claim.

Later workflow, Player/media, and hardening work must consume these contracts without bypassing CommandBus or duplicating the model.
