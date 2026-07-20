# Architecture

## Implemented M0 graph

```text
apps/studio (React)
  -> packages/editor-shell -> packages/design-system
  -> packages/project-store -> packages/command-bus + packages/core-model
  -> desktop: apps/studio/backend/tauri-backend -> crates/desktop-host -> crates/project-io
  -> web development only: packages/project-store/SandboxProjectBackend

apps/player -> packages/design-system
```

`core-model` owns versioned manifest/snapshot parsing and immutable profile contracts. `command-bus` is the serialized mutation path: a command batch's entity delta, journal rows, and metadata commit together; the next immutable snapshot is published only after that persistence commit. `project-store` coordinates save, autosave, undo/redo, close, and app-local recents. Zustand is present in Studio dependencies for transient UI state, not as the project database.

The native chain is intentionally narrow. `desktop-host` exposes six typed commands (`create_project`, `open_project`, `commit_project`, `checkpoint_project`, `close_project`, `recover_project`) and returns a safe `{ code, message, details, logRef }` envelope. It keeps a per-session `ProjectSession`; `project-io` is the only layer that creates/opens project directories, owns SQLite, or manages locks and recovery.

## Desktop versus web sandbox

`TauriProjectBackend` is selected when Tauri internals are present (or the explicit desktop test mode is requested). It invokes the six native commands with `{ payload: ... }`, validates returned manifest/snapshot/session data, serializes backend operations, and tracks native sessions and pending cleanup.

`SandboxProjectBackend` exists only when `import.meta.env.DEV` is true. It keeps `sandbox://<uuid>` projects in an in-memory map, generates deterministic identifiers/timestamps, and performs no native filesystem, SQLite, dialog, lock, or recovery operation. A non-Tauri production web runtime throws `TAURI_RUNTIME_REQUIRED`; a forced sandbox there throws `WEB_SANDBOX_DISABLED`. Thus sandbox behavior is a development aid, not a web persistence claim.

## Native persistence lifecycle

Creation normalizes the project name, creates a bound staging directory, writes all required subdirectories/database/manifest, then publishes without replacing an existing destination. Opening validates the extension/structure and requires manifest, database, and snapshot identity fields to agree. SQLite runs with WAL, foreign keys enabled, and a 5-second busy timeout.

Opening a session acquires `.aethertwin.lock`, records `cleanShutdown=false`, and chooses `saved`, `dirty`, or `recovered` state. A live foreign lock yields `PROJECT_LOCKED`; stale/crash residue requires explicit recovery and otherwise yields `STALE_PROJECT_LOCK`. Recovery works from a verified copy under `derived/recovery` and validates/replays from the newest valid checkpoint. Post-publish replacement mismatch is detected; however, the Task 6 Linux/Android cleanup edge case can restore a substituted payload under a completed-looking name and remains scheduled for hardening. A clean close checkpoints, writes `cleanShutdown=true`, truncates WAL, closes SQLite, then removes the held lock. A failed close retains the session for retry.

M1–M5 work remains future roadmap: unified authoring/2D tools, showroom and market workflows, real Player/media, and hardening must consume these contracts without bypassing CommandBus or duplicating the model.
