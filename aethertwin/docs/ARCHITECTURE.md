# Architecture

## Implemented M0 graph

```text
apps/studio (React)
  -> packages/core-model + packages/design-system + packages/editor-shell + packages/project-store
  -> packages/editor-shell -> packages/core-model + packages/design-system
  -> packages/project-store -> packages/command-bus + packages/core-model
  -> desktop: apps/studio/src/backend/tauri-backend -> crates/desktop-host -> crates/project-io
  -> web: packages/project-store/src/sandbox-backend (development only)

apps/player -> packages/design-system
```

`core-model` owns versioned manifest/snapshot parsing and immutable profile contracts. `command-bus` is the serialized mutation path: a command batch's entity delta, journal rows, and metadata commit together; the next immutable snapshot is published only after that persistence commit. After a durable checkpoint, its queued acknowledgement rebases the current snapshot plus every undo/redo history endpoint to the authoritative checkpoint metadata without changing any sequence or history availability. `project-store` coordinates save, autosave, undo/redo, close, recovery, and app-local recents. Zustand is present in Studio dependencies for transient UI state, not as the project database.

The native chain is intentionally narrow. `desktop-host` exposes six typed commands (`create_project`, `open_project`, `commit_project`, `checkpoint_project`, `close_project`, `recover_project`) and returns a safe `{ code, message, details, logRef }` envelope. It keeps a per-session `ProjectSession`; `project-io` is the only layer that creates/opens project directories, owns SQLite, or manages locks and recovery.

## Desktop versus web sandbox

`TauriProjectBackend` is selected when Tauri internals are present (or the explicit desktop test mode is requested). It invokes the six native commands with `{ payload: ... }`, validates returned manifest/snapshot/session data, serializes backend operations, and tracks native sessions and pending cleanup. Recovery is a separate confirmed command: Studio offers it only for the structured `STALE_PROJECT_LOCK` response whose details set `recoveryRequired: true`, and requires a second user confirmation before sending `confirm: true`. A failed recovery response is re-evaluated against that same rule, so an active lock or any other ineligible result immediately clears the stale-recovery action.

`SandboxProjectBackend` exists only when `import.meta.env.DEV` is true. It keeps `sandbox://<uuid>` projects in an in-memory map, generates deterministic identifiers/timestamps, and performs no native filesystem, SQLite, dialog, lock, or recovery operation. A non-Tauri production web runtime throws `TAURI_RUNTIME_REQUIRED`; a forced sandbox there throws `WEB_SANDBOX_DISABLED`. Thus sandbox behavior is a development aid, not a web persistence claim.

## Native persistence lifecycle

Creation normalizes the project name, creates a bound staging directory, writes all required subdirectories/database/manifest, then publishes without replacing an existing destination. Opening validates the extension/structure and requires manifest, database, and snapshot identity fields to agree. SQLite runs with WAL, foreign keys enabled, and a 5-second busy timeout.

Opening a session acquires `.aethertwin.lock`, records `cleanShutdown=false`, and chooses `saved`, `dirty`, or `recovered` state. A live foreign lock yields `PROJECT_LOCKED`; stale/crash residue requires explicit recovery and otherwise yields `STALE_PROJECT_LOCK`. Recovery works from a verified copy under `derived/recovery` and validates/replays from the newest valid checkpoint. A post-publish replacement mismatch is detected and an unverified Linux/Android replacement remains under a hidden `.aethertwin-recovery-cleanup-*` quarantine leaf instead of receiving a completed-looking name. Checkpoint returns an authoritative `{ manifest, snapshot }` pair, and the native session publishes that pair in memory only after the database transaction and atomic manifest rewrite both succeed.

A clean close checkpoints, writes `cleanShutdown=true`, truncates WAL, closes SQLite, then removes the held lock. Session-producing create/open/recover operations hold a shared lifecycle lease from before disk work through registry publication. Desktop window-close and process-exit events call `close_all` under the exclusive lifecycle lease, which waits for in-flight producers, blocks publication while draining the registry, and confirms the registry is empty before success. Successful shutdown marks the lifecycle closed before releasing the exclusive lease, so waiting or later producers cannot publish; failed shutdown leaves it open after lease release so the user can retry. Registry locks are not held while individual sessions close, successful sessions are removed, failed sessions remain available for retry, and a close failure prevents exit while showing only the sanitized native message and log reference.

M1–M5 work remains future roadmap: unified authoring/2D tools, showroom and market workflows, real Player/media, and hardening must consume these contracts without bypassing CommandBus or duplicating the model.
