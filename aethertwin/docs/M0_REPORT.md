# M0 Milestone Report

## Completed

- Isolated pnpm/Cargo workspace with Studio, independent Player boundary, core model, CommandBus, project store, design system, `project-io`, and `desktop-host`.
- Exactly two immutable profile values: `showroom` and `market`; manifest/snapshot validation, cross-language fixture parity, project-relative asset paths, and SHA-256 metadata.
- M0 Studio project center and project overview: native desktop adapter plus development-only in-memory sandbox; real name/tag mutation, save/autosave, undo/redo, close, recent preferences, and honest status UI.
- Native `.twinproj` creation/opening, SQLite v1 migrations/WAL, manifest/database identity checks, atomic command journal persistence, checkpoints, locking, clean close, and explicit recovery.
- Typed least-privilege Tauri host contract with six commands and safe native error envelope; Player remains a noninteractive M4 placeholder.
- Aether design-system tokens/components and source-policy gates for offline/no-fake-action behavior.

Evidence is in the implementation source and Tasks 1–13 reports. This is the M0 foundation only; it is not completion of M1–M5 product scope.

## Incomplete

- Task 13 Chromium/Playwright browser acceptance was not authorized: Chromium was not installed and `pnpm.cmd exec playwright test apps/studio/e2e/m0.spec.ts` was not run.
- Task 14 fresh milestone commands were not run because current authorization did not include package scripts, Cargo validation, local servers, debug/browser control, or screenshots.
- Consequently fresh build, runtime, desktop smoke, and browser evidence is missing. M1 unified authoring, M2 showroom workflow, M3 market workflow, M4 Player/media, and M5 hardening are roadmap, not M0 implementation claims.

## Test Results

These are prior, locatable Task 1–13 results; they are not fresh M0 milestone verification by Task 14.

- Task 13: `node --test` source-policy suite reported 13 passed, 0 failed; its WebSocket correction targeted suite reported 3 passed, 0 failed.
- Task 12: Player focused test reported 1 passed and Player typecheck exit 0.
- Task 11: reported focused package tests of project-store 39/39, design-system 18/18, Studio 159/159; Rust contract fixture 4/4, create/open 20/20, and desktop-host command contract 14/14. These reported results were supplied by the prior task context, not rerun here.
- Task 10 final report recorded project-store 37/37, Studio 106/106, and design-system 18/18 focused tests, with package typechecks exiting 0.
- Task 7 final host evidence recorded 13/13 command-contract tests, 6/6 state regressions, and a focused `cargo check -p desktop-host` exit 0. Task 6 earlier reported 64 Windows-executed Rust tests passed.

## Exact Commands

Task 14 ran only the allowed static integrity commands:

```powershell
git diff --check -- aethertwin
rg -n "IMPLEMENTATION_PENDING|FILL_ME_IN|localhost-only-exception" aethertwin
```

The scan returned two self-referential documentation hits: this exact-command transcript and the same command text in `docs/superpowers/plans/2026-07-17-aethertwin-m0-foundation.md`. No implementation marker was reported.

The required fresh milestone commands below were deliberately not run under the current restriction, so no passing result is claimed:

```powershell
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd build
cargo check --workspace
pnpm.cmd exec playwright test apps/studio/e2e/m0.spec.ts
```

## Known Issues

- Task 1 ledger finding: `glob@10.5.0` remains a deprecated transitive development dependency; defer removal to an upstream-compatible tooling refresh.
- Task 6 ledger finding: Linux/Android recovery publication has a reviewed edge case around source-name substitution/mismatch cleanup; final hardening should continue to quarantine unverified replacements under a hidden leaf.
- Task 8 ledger finding: its CSS contract test permits glow/shadow on all selectors and does not itself catch protocol-relative URLs or string-form remote `@import`. Task 13's broader runtime source gate now covers those remote URL forms; selector-specific glow restrictions remain for final hardening.
- Task 13 source policy was corrected to classify remote WebSocket URLs and to close them in the Playwright source, but real Chromium/Playwright browser acceptance has not run.

## Next Milestone

M1 is the unified authoring core: model/plan engine, 2D rendering, transforms, snapping, dimensions, arrays, indexing, and the corresponding undo/redo authoring workflows. None of those M1 capabilities is implemented by this M0 report.
