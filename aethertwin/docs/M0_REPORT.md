# M0 Milestone Report

## Completed

- Isolated pnpm/Cargo workspace with Studio, independent Player boundary, core model, CommandBus, project store, design system, `project-io`, and `desktop-host`.
- Exactly two immutable profile values: `showroom` and `market`; manifest/snapshot validation, cross-language fixture parity, project-relative asset paths, and SHA-256 metadata.
- M0 Studio project center and project overview: native desktop adapter plus development-only in-memory sandbox; real name/tag mutation, save/autosave, undo/redo, close, recent preferences, and honest status UI.
- Native `.twinproj` creation/opening, SQLite v1 migrations/WAL, manifest/database identity checks, atomic command journal persistence, checkpoints, locking, clean close, and explicit recovery.
- Authoritative checkpoint acknowledgement across Rust, Tauri, ProjectStore, sandbox, and CommandBus. The checkpoint result carries a coherent manifest/snapshot pair; durable checkpoint metadata rebases current and undo/redo snapshots without clearing history.
- Explicit stale-lock recovery in the desktop project center. Recovery appears only for a structured `STALE_PROJECT_LOCK` response that requires recovery, then sends the native command only after a second confirmation.
- Coordinated native close lifecycle for window close and process exit. All sessions checkpoint and close without holding the registry lock; failures prevent termination and remain retryable.
- Typed least-privilege Tauri host contract with six commands and safe native error envelope; Player remains a noninteractive M4 placeholder.
- Aether design-system tokens/components and source-policy gates for offline/no-fake-action behavior, including selector-specific glow restrictions and protocol-relative/string-form remote import fixtures.

This is the M0 foundation only; it is not completion of M1–M5 product scope.

## Incomplete

- Build, dev, debug, local-server, browser, Playwright, packaged-runtime, and screenshot validation were prohibited for this final-review fix wave and were not run.
- The Linux/Android hidden-quarantine regression is target-gated and could not execute on Windows. The common Rust code compiled, but Windows evidence does not prove that runtime branch.
- Tauri close/exit behavior has Rust unit, source-contract, and compile coverage; packaged desktop event handling remains unexecuted.
- M1 unified authoring, M2 showroom workflow, M3 market workflow, M4 Player/media, and M5 hardening remain roadmap work.

## Fresh Final-Review Verification

- CommandBus: 18/18 passed.
- ProjectStore: 41/41 passed.
- Studio: 166/166 passed.
- Design System: 19/19 passed.
- Offline source policy: 4/4 passed.
- Affected package typechecks for CommandBus, ProjectStore, Studio, and Design System all exited 0.
- `cargo test -p project-io -p desktop-host` exited 0: desktop-host 9 unit + 14 command-contract tests; project-io 13 unit + 27 commit/recovery + 4 contract + 20 create/open + 3 path-policy tests; doc-tests completed.
- `cargo check -p project-io -p desktop-host` exited 0.
- Focused TDD evidence and the transient Windows Application Control interruption are recorded in `m0-final-review-fix-report.md`.

## Exact Commands

```powershell
pnpm.cmd --filter @aethertwin/command-bus test
pnpm.cmd --filter @aethertwin/project-store test
pnpm.cmd --filter @aethertwin/studio test
pnpm.cmd --filter @aethertwin/design-system test
pnpm.cmd --filter @aethertwin/command-bus typecheck
pnpm.cmd --filter @aethertwin/project-store typecheck
pnpm.cmd --filter @aethertwin/studio typecheck
pnpm.cmd --filter @aethertwin/design-system typecheck
node --test tests/offline-source-policy.test.mjs
cargo test -p project-io -p desktop-host
cargo check -p project-io -p desktop-host
git diff --check
```

No build, dev server, browser, Playwright, packaged runtime, or screenshot command was run.

## Known Issues

- `glob@10.5.0` remains a deprecated transitive development dependency. Removing it requires an upstream-compatible tooling refresh; broad dependency churn was outside this focused fix.
- The Linux/Android post-publication identity-mismatch path now quarantines an unverified replacement under a hidden leaf, but its cfg-specific runtime test was not executable on Windows.
- Real packaged Tauri close/exit and Chromium/Playwright acceptance remain unverified because runtime/browser validation was prohibited.

## Next Milestone

M1 is the unified authoring core: model/plan engine, 2D rendering, transforms, snapping, dimensions, arrays, indexing, and the corresponding undo/redo authoring workflows. None of those M1 capabilities is implemented by this M0 report.
