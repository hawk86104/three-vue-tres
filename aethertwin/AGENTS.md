# AetherTwin workspace rules

## Scope and layout

`aethertwin/` is an isolated product workspace. Never add runtime, build, test, or import dependencies on the parent repository's Vue, Electron, Longfu Market, OpenRemote, root scripts, or root `.env*` files.

- `apps/studio`: React authoring application and typed Tauri adapter.
- `apps/player`: deferred read-only product boundary.
- `packages/core-model`: schema, validation, migration, and immutable contracts.
- `packages/command-bus` and `packages/project-store`: serialized durable mutations and UI persistence coordination.
- `packages/plan-engine` and `packages/render-plan-2d`: pure plan logic and PixiJS projection.
- `packages/asset-pipeline`: pure media/import policy; it never touches the filesystem.
- `crates/project-io`: `.twinproj`, SQLite, locking, migration, recovery, and safe paths.
- `crates/desktop-host`: Tauri DTOs, command allowlist, sessions, lifecycle, and error mapping.
- `fixtures/contracts`, `tests`, and `docs/superpowers`: cross-language fixtures, policy gates, approved specs, and implementation plans.

Deferred package/crate directories remain boundaries until an approved plan implements them. Do not expose their controls or import placeholders.

## Toolchain and commands

Run all commands from `aethertwin/`.

- Required: Node.js 24+, pnpm 11.9.x, Rust/Cargo 1.94.x.
- Install: `pnpm.cmd install --frozen-lockfile`.
- JavaScript lint: `pnpm.cmd lint`.
- Type checks: `pnpm.cmd typecheck`, or focused `pnpm.cmd exec tsc -p <package>/tsconfig.json --noEmit`.
- JavaScript tests: `pnpm.cmd test`, or focused `pnpm.cmd vitest run <test-files>`.
- Policy tests: `node --test tests/*.test.mjs`.
- Rust tests: `cargo test -p project-io` and `cargo test -p desktop-host`.
- Rust checks: `cargo fmt --all -- --check` and `cargo check -p project-io -p desktop-host`.
- Frontend build: `pnpm.cmd build`.
- Rust build: `cargo build -p desktop-host`.
- With explicit current user approval only, Studio dev server:
  `pnpm.cmd --filter @aethertwin/studio exec vite --host 127.0.0.1 --port 5173`.
- With explicit current user approval only, Tauri dev:
  `pnpm.cmd exec tauri dev --config crates/desktop-host/tauri.conf.json`.
- Playwright uses `pnpm.cmd exec playwright test`; it starts a server/browser and therefore also needs explicit current approval.

The parent project rule forbids automatic build, dev, debug, browser, Playwright, packaging, packaged-runtime, and screenshot commands after code changes. Run them only when the user explicitly authorizes them in the current conversation. Never carry an earlier approval into a new agent session. Record skipped verification honestly.

## Code and architecture

- TypeScript is strict with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, consistent type imports, and no explicit `any`.
- Rust uses edition 2024 and must pass rustfmt.
- Keep dependency direction: Studio -> typed packages -> ProjectStore/CommandBus -> Tauri adapter -> desktop-host -> project-io/SQLite.
- All durable project mutations flow through ProjectStore and CommandBus. React, PixiJS, Three.js, and Zustand never own or directly mutate business data.
- Zustand contains transient UI state only.
- Pure packages do not import React, Tauri, SQLite, filesystem APIs, or renderer objects.
- Add tests before production behavior changes. Keep each commit scoped to one approved atomic task.

## Persistence and migration

- `project.db` is the mutable source of truth; `manifest.json` is an atomic compatibility/identity cache.
- Current project schema is v3. Accept only deterministic v1 -> v2 -> v3 upgrades. A failed upgrade must restore the exact previous coherent database/manifest pair before any editor session is published.
- SQLite storage migration numbers are independent of project schema versions. Never edit applied migration SQL or checksums; append a new numbered migration and add rollback/recovery evidence.
- Persist normalized project-relative paths only. Never persist native absolute paths, drive/UNC paths, `file://`, traversal, source filenames, or media BLOBs.
- Commit journal rows, normalized records, metadata, and snapshot publication atomically. Apply/undo/redo must verify exact `before`, inverse, ordering, and claimed `after`.
- Recovery reuses the same typed parsers and command replay as live commits.

## Stable product and native contracts

- The only project profiles are immutable `showroom` and `market`.
- Stored plan distances are millimetres; rotations are radians.
- `plan.entities.patch` and `plan.floor.patch` remain compatible.
- `snapshot.records.patch` is discriminated and allowlisted; do not add arbitrary JSON paths or untyped record payloads.
- Native errors remain `{ code, message, details, logRef }`; never expose raw paths, SQL, OS errors, or source filenames.
- Tauri commands and capabilities are exact allowlists. Do not add broad filesystem/shell/SQLite capability.
- Asset reads use the project/session-bound custom protocol, not a new generic file-read invoke command.
- Controls appear only after their complete typed, durable, recoverable implementation exists.

## Security and sensitive data

Runtime is local-first/offline. Do not add remote services, CDNs, fonts, icons, maps, telemetry, business APIs, or remote fallback media. Do not commit or print `.env`, credentials, API keys, tokens, cookies, private keys, database contents, or user-selected absolute paths. Application-local recents may contain paths but never secrets or project payloads.

Keep Tauri CSP explicit and least-privilege once enabled; never use `*`, `unsafe-eval`, a broad asset-protocol scope, or `security.csp: null` as a workaround. Validate all WebView/native boundary DTOs and keep custom asset resolution session-bound.

## Definition of Done

A task is done only when:

1. its approved behavior and exclusions are implemented without unrelated changes;
2. focused RED/GREEN tests, changed-package type checks, relevant Rust tests, and policy gates have actual recorded results;
3. lint, rustfmt, Cargo check, and the permitted build gates are green, or pre-existing failures are precisely documented and not increased;
4. migration, undo/redo, reopen, recovery, cancellation, error redaction, and least-privilege cases relevant to the task are covered;
5. docs and cross-language fixtures match the implementation without claiming unrun runtime/GPU/browser evidence;
6. `git diff --check` passes and the worktree contains no credentials, build products, or unrelated files;
7. the task receives an independent spec/code review before the next dependent task starts.
