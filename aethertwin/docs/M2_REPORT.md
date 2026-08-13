# AetherTwin M2 Evidence Report

## Scope and explicit exclusions

This report records source, contract, persistence, and injected-renderer evidence for M2.1 through M2.5. M2.5 adds one Showroom-only PNG export workflow. It does not change schema v3, add a SQLite migration, add a Sandbox export capability, or add Player or Market 3D/export entry points.

Build, dev, debug, browser, Playwright, packaged-runtime, packaging, screenshot, real GPU, visual-correctness, and performance verification were not performed for M2.5. A real GPU frame was not verified. Fake and injected renderer tests verify request construction, orientation, renderer-state restoration, encoding, publication, cancellation, and cleanup; they do not verify visual correctness.

## M2.1-M2.5 completed capabilities

- M2.1: immutable content-addressed project assets, verified session-bound reads, plan-reference placement, and two-point calibration.
- M2.2: wall-bound doors/windows, deterministic room candidates with explicit confirmation, and seven parametric Showroom fixture kinds.
- M2.3: product hotspots/content/media, route-network editing, and guided routes.
- M2.4: synchronized 2D, 3D, and fixed 50/50 split for Showroom; deterministic scene projection; durable materials/environment; bounded renderer recovery and exact resource ownership.
- M2.5: Full HD and Ultra HD Showroom PNG export, scope-safe capture, bounded row streaming, strict native IPC, project-bound no-overwrite publication, cancellation/cleanup, and deterministic Demo evidence.

ProjectStore remains the business-state owner. Studio/Zustand and R3F own transient renderer/session state only. `render-scene-3d` owns capture/readback, `exporter` owns pure preflight/coordinator/row ordering, `desktop-host` owns the strict Tauri boundary and active-operation registry, `project-io` owns project-relative paths/staging/publication, and `media-export` owns PNG encoding/validation.

## Deterministic Showroom Demo inventory and semantic digest

The canonical source is `fixtures/contracts/showroom-demo.v3.json`. It is materialized through `crates/asset-io/examples/generate_showroom_demo.rs`; fixed local asset generation lives at `fixtures/assets/showroom-demo/generate-assets.mjs` with its manifest beside the four assets. All are offline sources.

The Demo contains one floor/layer, four rooms, one zone, eight walls, four doors, four windows, all seven Showroom fixture kinds three times, one compatible generic fixture, ten product hotspots with content/media, three materials, twenty-four assignments, a connected five-stop guided route, and the approved environment. Task 17 pins semantic digest `9c613551a8cf59d6af4560a53b9cef6766da01f7b0c2d108a18e3797ef5a6ada` and asserts all eleven persisted journal rows, payload/inverse ordering, canonical assets, and unsafe SVG rejection.

No `.twinproj` package or exported PNG is committed. The fixture PNG under `fixtures/assets/showroom-demo/` is an input asset, not generated export evidence.

## PNG export contract and publication evidence

The two exact presets are `full-hd` at 1920 x 1080 and `ultra-hd` at 3840 x 2160. Capture is immutable and carries project/session/floor/sequence provenance plus sorted required texture IDs and GPU limits. Renderer bottom-left RGBA is streamed as top-left row-major chunks with a maximum chunk size of 1,048,576 bytes and strict serial backpressure.

`media-export` emits opaque RGBA8 PNG with sRGB intent and deterministic SHA-256 validation. `project-io` returns a project-relative `exports/<name>.png` result with dimensions, `byteSize`, and `sha256`. Publication uses private `.aethertwin-export-` staging, verified project binding, first-absent naming, no overwrite, post-publication validation, and cleanup on failure. Identical input evidence produced identical size and digest in the native acceptance test.

## Lifecycle, cancellation and cleanup evidence

Only one Studio coordinator export and one native export per session may be active. Every awaited boundary rechecks cancellation and current project/session/floor/renderer scope. Project replacement and explicit close cancel before closing; late renderer, texture, frame, chunk, and finish results are rejected.

Native finish/cancel/write failure uses a sole terminal state under the per-operation lock. Concurrent matching cancels are idempotent. Close and close-all cancel active exports and wait without holding the file-operation lock. Open and recovery remove stale private staging. Cancellation before capture, while rendering, and during native upload leaves the complete `exports/` directory unchanged and leaves no staging residue.

## Schema, command, capability, offline and redaction policy

- Schema is v3; storage migration 1 remains the only SQLite migration.
- The native invoke surface is exactly twelve commands: six project commands, two asset-import commands, and four export commands.
- Desktop capability count is exactly two: `core:window:default` and `dialog:allow-open`.
- Sandbox export capability is absent. Market Export is absent. Player and Market 3D/export were not added.
- Export paths and results are project-relative. Raw chunks use exact allowlisted headers; JSON DTOs reject unknown fields, non-canonical UUIDs, unsafe integers, empty chunks, unknown `x-aether-*` headers, and oversize bodies.
- Export failures retain stable codes and safe details only; request bodies, native paths, session/export IDs, and arbitrary underlying errors are not exposed.
- Runtime sources remain offline with no CDN or remote fallback.
- Protected manifests remained unchanged and unstaged: `crates/asset-io/Cargo.toml` and `crates/desktop-host/Cargo.toml`.

## Commands actually executed

The ignored `.superpowers/sdd/` reports, retained Codex session logs, and `progress.md` are the detailed task ledger. Dates below are accepted-commit dates. This section records every verification or retry command used to support a claim in this report; read-only source inspection and editing-transport commands are not release evidence. No shorthand such as `typechecks` or `exact filters` substitutes for a command string.

| Date | Task | Exact verification commands | Observed result |
| --- | --- | --- | --- |
| 2026-08-09 | 1 | `pnpm.cmd install --lockfile-only`<br>`pnpm.cmd install --frozen-lockfile`<br>`node --test tests/workspace-structure.test.mjs tests/offline-source-policy.test.mjs`<br>`pnpm.cmd vitest run packages/exporter/src/presets.test.ts`<br>`pnpm.cmd exec tsc -p packages/exporter/tsconfig.json --noEmit`<br>`pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit`<br>`git diff --check` | installs exit 0, downloaded 0; Node 25/25; presets 9/9; both tsc and diff exit 0 |
| 2026-08-09 | 2 | `pnpm.cmd vitest run packages/exporter/src/row-chunks.test.ts`<br>`pnpm.cmd exec tsc -p packages/exporter/tsconfig.json --noEmit`<br>`git diff --check` | 19/19; tsc and diff exit 0 |
| 2026-08-09 | 3 | `pnpm.cmd vitest run packages/render-scene-3d/src/renderer.test.ts packages/render-scene-3d/src/offscreen-render.test.ts apps/studio/src/features/plan-editor/scene-canvas.test.tsx`<br>`pnpm.cmd exec tsc -p packages/render-scene-3d/tsconfig.json --noEmit`<br>`pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit`<br>`git diff --check` | 22/22; both tsc and diff exit 0; non-failing jsdom canvas notice |
| 2026-08-09 | 4 | `pnpm.cmd vitest run packages/exporter/src/preflight.test.ts`<br>`pnpm.cmd exec tsc -p packages/exporter/tsconfig.json --noEmit`<br>`git diff --check` | 18/18; tsc and diff exit 0 |
| 2026-08-09 | 5 | `pnpm.cmd vitest run packages/exporter/src/coordinator.test.ts packages/exporter/src/preflight.test.ts packages/exporter/src/row-chunks.test.ts`<br>`pnpm.cmd exec tsc -p packages/exporter/tsconfig.json --noEmit`<br>`git diff --check` | 57/57; tsc and diff exit 0 |
| 2026-08-10 | 6 | `cargo test -p media-export --test png_stream`<br>`cargo check -p media-export --all-targets`<br>`node --test tests/workspace-structure.test.mjs tests/offline-source-policy.test.mjs`<br>`cargo fmt --all -- --check`<br>`git diff --check` | PNG 12/12; Node 27/27; check, fmt and diff exit 0 |
| 2026-08-11 | 7 | `cargo test -p project-io --test export_path`<br>`cargo check -p project-io --all-targets`<br>`cargo fmt --all -- --check`<br>`git diff --check` | export-path 7 passed, 0 failed, 1 approved privileged-Windows ignored; check, final fmt and diff exit 0 |
| 2026-08-11 | 8 | `cargo test -p project-io --test project_export`<br>`cargo test -p project-io --lib project_export`<br>`cargo test -p media-export --test png_stream`<br>`cargo check -p media-export -p project-io --all-targets`<br>`cargo fmt --all -- --check`<br>`git diff --check` | integration 18/18; final private state machine 8/8; PNG 12/12; check, final fmt and diff exit 0 |
| 2026-08-11 | 9 | `cargo test -p desktop-host --test export_boundary`<br>`cargo check -p desktop-host --all-targets`<br>`cargo fmt --all -- --check`<br>`git diff --check` | 17/17; check, fmt and diff exit 0 |
| 2026-08-11 | 10 | `cargo test -p desktop-host --test project_export native_export_success`<br>`cargo test -p desktop-host --test command_contract command_surface_is_exactly_twelve_with_one_raw_command`<br>`cargo test -p desktop-host --test command_contract tauri_configuration_and_capability_are_exact_and_least_privilege`<br>`cargo check -p media-export -p project-io -p desktop-host --all-targets`<br>`cargo fmt --all -- --check`<br>`git diff --check` | 2/2, 1/1 and 1/1; check, final fmt and diff exit 0 |
| 2026-08-11 | 11 | `cargo test -p desktop-host --lib export_registry`<br>`cargo test -p desktop-host --test project_export`<br>`cargo test -p desktop-host --test command_contract`<br>`cargo test -p project-io --test project_export`<br>`cargo test -p project-io --test create_open`<br>`cargo test -p project-io --test commit_recovery`<br>`cargo check -p media-export -p project-io -p desktop-host --all-targets`<br>`cargo fmt --all -- --check`<br>`git diff --check` | 2/2, 12/12, 22/22, 20/20, 21/21 and 42/42; check, final fmt and diff exit 0 |
| 2026-08-12 | 12 | `pnpm.cmd vitest run apps/studio/src/backend/tauri-backend.test.ts apps/studio/src/app.test.tsx`<br>`pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit`<br>`pnpm.cmd exec tsc -p packages/exporter/tsconfig.json --noEmit`<br>`git diff --check` | 92/92; both tsc and diff exit 0 |
| 2026-08-12 | 13 | `pnpm.cmd vitest run packages/mode-showroom/src/tool-policy.test.ts apps/studio/src/features/plan-editor/plan-toolbar.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx`<br>`node --test tests/visible-actions.test.mjs`<br>`pnpm.cmd exec tsc -p packages/mode-showroom/tsconfig.json --noEmit`<br>`pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit`<br>`git diff --check` | Vitest 120/120; Node 6/6; both tsc and diff exit 0 |
| 2026-08-12 | 14 | `pnpm.cmd vitest run apps/studio/src/features/plan-editor/scene-canvas.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx`<br>`pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit`<br>`git diff --check` | 118/118; tsc and diff exit 0 |
| 2026-08-12 | 15 | `pnpm.cmd vitest run apps/studio/src/features/plan-editor/export-panel.test.tsx apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx apps/studio/src/features/plan-editor/scene-canvas.test.tsx`<br>`pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit`<br>`pnpm.cmd exec tsc -p packages/exporter/tsconfig.json --noEmit`<br>`git diff --check` | 139/139; both tsc and diff exit 0; non-failing jsdom canvas notice |
| 2026-08-13 | 16 | `node --test tests/showroom-demo.test.mjs tests/project-format-policy.test.mjs tests/offline-source-policy.test.mjs`<br>`pnpm.cmd vitest run packages/core-model/src/core-model.test.ts`<br>`pnpm.cmd exec tsc -p packages/core-model/tsconfig.json --noEmit`<br>`git diff --check` | Node 21/21; core-model 99/99; tsc and diff exit 0 |
| 2026-08-13 | 17 | `cargo test -p project-io --test create_open deterministic_identity`<br>`cargo test -p asset-io --test showroom_demo`<br>`cargo check -p asset-io -p project-io --all-targets`<br>`cargo fmt --all -- --check`<br>`git diff --check` | identity 2/2; Demo 5/5; check, fmt and diff exit 0 |
| 2026-08-13 | 18 | `pnpm.cmd vitest run packages/exporter/src/m2-5-vertical-acceptance.test.ts apps/studio/src/features/plan-editor/m2-5-vertical-acceptance.test.tsx packages/render-scene-3d/src/renderer.test.ts`<br>`pnpm.cmd exec tsc -p packages/exporter/tsconfig.json --noEmit`<br>`pnpm.cmd exec tsc -p packages/render-scene-3d/tsconfig.json --noEmit`<br>`pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit`<br>`cargo test -p media-export`<br>`cargo test -p project-io --test m2_5_vertical_acceptance`<br>`cargo test -p desktop-host --test m2_5_vertical_acceptance`<br>`cargo check -p media-export -p project-io -p asset-io -p desktop-host --all-targets`<br>`cargo fmt --all -- --check`<br>`git diff --check` | Vitest 13/13; all three tsc exit 0; media 12/12; project-io 2/2; desktop-host 1/1; check, fmt and diff exit 0 |
| 2026-08-13 | 19 RED | `node --test tests/workspace-structure.test.mjs tests/project-format-policy.test.mjs tests/offline-source-policy.test.mjs tests/visible-actions.test.mjs` | exit 1; 37/41 passed; four failures were only missing `docs/M2_REPORT.md` |
| 2026-08-13 | 19 initial GREEN | `node --test tests/workspace-structure.test.mjs tests/project-format-policy.test.mjs tests/offline-source-policy.test.mjs tests/visible-actions.test.mjs tests/showroom-demo.test.mjs`<br>`git diff --check` | Node exit 0, 45/45; diff exit 0 with LF-to-CRLF warnings only |
| 2026-08-13 | 19 post-review launch | `node --test tests/workspace-structure.test.mjs tests/project-format-policy.test.mjs tests/offline-source-policy.test.mjs tests/visible-actions.test.mjs tests/showroom-demo.test.mjs`<br>`git diff --check` | combined launch failed before either claim-bearing command started because the Windows helper rejected process creation; no pass was inferred |
| 2026-08-13 | 19 post-review GREEN | `node --test tests/workspace-structure.test.mjs tests/project-format-policy.test.mjs tests/offline-source-policy.test.mjs tests/visible-actions.test.mjs tests/showroom-demo.test.mjs`<br>`git diff --check` | commands rerun separately on the repaired bytes: Node exit 0, 45/45; diff exit 0 with LF-to-CRLF warnings only |
| 2026-08-13 | 19 second-review repair GREEN | `node --test tests/workspace-structure.test.mjs tests/project-format-policy.test.mjs tests/offline-source-policy.test.mjs tests/visible-actions.test.mjs tests/showroom-demo.test.mjs`<br>`git diff --check` | Node exit 0, 45/45; diff exit 0 with LF-to-CRLF warnings only after historical-count, command-history, and UTF-8 repairs |

Every listed task also ended with `git diff --check` exit 0 on its accepted bytes; Windows emitted documented LF-to-CRLF working-copy warnings in some runs.

The changed-file and retry trace is commit-based:

| Task | Accepted commit(s) | Changed-file scope and retry outcome |
| --- | --- | --- |
| 0 | `b4bbea72` | approved plan only; no runtime verification claim |
| 1 | `eab9a2b6..ea17e9b9` | exporter package/contracts/presets, Studio dependency, renderer provenance forward type, lock/policy; review policy gap repaired |
| 2 | `4ebd206e` | exporter row-chunks source/test/index; one test microtask expectation and TS narrowing repaired |
| 3 | `a4bd44a0` | render-scene-3d types/renderer plus renderer/offscreen tests; provenance and lifecycle evidence closed |
| 4 | `cb9486ec..f7e92208` | exporter contracts/preflight/errors/tests; safe/frozen issue details hardened |
| 5 | `b178ffd7..1cc7621f` | exporter coordinator/contracts/tests/index; progress reentrancy and start-slot reservation repaired |
| 6 | `173e45ad` | media-export crate, workspace Cargo/lock edges, policy tests; duplicate terminal IEND repaired |
| 7 | `fec9a2ed` | project-io export path/bound-directory source and tests; publication/cleanup race review repaired before closure |
| 8 | `1e6600b1` | project-io export operation, paths, errors, manifest/lock edge and tests; post-rename and content-stability review repaired |
| 9 | `fa0d59dc` | desktop-host DTO/raw parser/error/export boundary and tests; positive maximum-size/index coverage added |
| 10 | `cacbfc92` | desktop-host registry/commands/DTO/error/state/lib and success/contract tests; native reservation completed |
| 11 | `437ee2f7` | desktop-host export registry/state/error plus project-io open/recovery and tests; close/terminal/concurrent-cancel findings repaired |
| 12 | `a0643859` | Studio Tauri adapter/composition/App/PlanEditor and tests; stale close tracking repaired |
| 13 | `14349fb3` | Showroom policy, toolbar/PlanEditor, visible-action tests; Export remains Showroom-only |
| 14 | `1eccd23d` | SceneCanvas/export handle, 16:9 CSS, gallery/acceptance support and tests; failure-order/framing findings repaired |
| 15 | `d25db132` | Export panel, editor session, PlanEditor/toolbar/tree/CSS and tests; generation-after-cancel ordering repaired |
| 16 | `22be966d` | Demo fixture/assets/generator/manifest and core/policy tests; obsolete command policy and room kind repaired |
| 17 | `9b8f5fd3` | real Demo generator support, project identity/journal seams and Rust tests; digest/asset mismatch evidence repaired |
| 18 | `813bcebd` | four vertical acceptance tests plus test-only workspace dependency edges; expectation/syntax/type/format issues repaired |
| 19 | reviewed closure commit | README, ARCHITECTURE, PRODUCT_SPEC, PROJECT_FORMAT, ROADMAP, DECISIONS, M2_REPORT, HANDOFF, PLANS, the M2.5 plan, and four policy tests; RED was missing-report-only and final policy reruns passed 45/45. Two documentation review waves were repaired without product changes; final re-review returned Pass / Approved / Ready Yes with no findings |

The two protected manifests and unrelated `packages/mode-showroom/src/index.ts` working-tree entry were excluded from every task commit.

## Failures, repairs and retries

The key RED and retry executions below are the failure evidence behind the accepted command ledger. Counts are stated only when retained output emitted them.

| Task | Exact failing or retry command | Observed failure and repair outcome |
| --- | --- | --- |
| 1 | `node --test tests/workspace-structure.test.mjs tests/offline-source-policy.test.mjs` | review RED exit 1, 23/25 passed: bare HTTP and DOM/WebGL source patterns escaped the policy regex; the narrowed policy repair reran 25/25 |
| 2 | `pnpm.cmd vitest run packages/exporter/src/row-chunks.test.ts`<br>`pnpm.cmd exec tsc -p packages/exporter/tsconfig.json --noEmit` | initial 19/19 failed on the missing export; the next run was 18/19 because the test observed one microtask too early, while tsc exposed one test-only narrowing error; both test fixes preceded final 19/19 and tsc exit 0 |
| 3 | `pnpm.cmd vitest run packages/render-scene-3d/src/renderer.test.ts packages/render-scene-3d/src/offscreen-render.test.ts` | RED exit 1, 12/14 passed; missing immutable provenance/pre-ready behavior was added, then the three-file GREEN row passed 22/22 |
| 4 | `pnpm.cmd vitest run packages/exporter/src/preflight.test.ts` | RED exit 1, 16/16 failed because both preflight exports were absent; implementation and frozen safe issue details produced final 18/18 |
| 5 | `pnpm.cmd vitest run packages/exporter/src/coordinator.test.ts` | RED exit 1, 14/14 failed because the coordinator export was absent; review retries closed progress callback reentrancy, exact 1 MiB protocol, and start-slot reservation before final 57/57 |
| 6 | `cargo test -p media-export --test png_stream` | initial exit 101 because the crate was absent; a review RED later accepted duplicate terminal IEND, which was rejected before final 12/12 |
| 7 | `cargo test -p project-io --test export_path`<br>`cargo test -p project-io --test export_path -- --nocapture` | initial exit 1 on missing APIs; semantic retries remained 5 passed/2 failed/1 ignored, including two diagnostic `--nocapture` runs; cleanup/revalidation repairs produced 7 passed/0 failed/1 approved ignored |
| 8 | `cargo test -p project-io --test project_export`<br>`cargo test -p project-io --lib project_export` | integration RED exited 1 at compile time on missing export APIs. The review state-machine run later exited 1 with 3/7 passed and four cleanup/content-stability failures; repairs progressed to 7/7 and then 8/8, while integration finished 18/18 |
| 9 | `cargo test -p desktop-host --test export_boundary` | RED exited nonzero on the missing raw parser/DTO boundary; implementation plus positive maximum-size/index coverage produced final 17/17 |
| 10 | `cargo test -p desktop-host --test command_contract command_surface_is_exactly_twelve_with_one_raw_command`<br>`cargo test -p desktop-host --test project_export native_export_success` | RED command count was 8 instead of 12 and the native command was absent; initial rustfmt check later found mechanical formatting only, after which the complete six-command gate reran green |
| 11 | `cargo test -p desktop-host --test project_export export_failure`<br>`cargo test -p project-io --test project_export cleanup`<br>`cargo test -p desktop-host --lib export_registry` | close and recovery REDs left staging residue; review RED exposed cloned terminal ownership, concurrent cancel, and unsafe details. The state machine, lock order, cleanup and error repairs preceded the final 2/2, 12/12, 22/22, 20/20, 21/21 and 42/42 gate |
| 12 | `pnpm.cmd vitest run apps/studio/src/backend/tauri-backend.test.ts apps/studio/src/app.test.tsx` | valid RED exit 1, 72/91 passed and 19 missing adapter/composition behaviors failed; a review RED then exposed stale close tracking; the final rerun passed 92/92 |
| 13 | `pnpm.cmd vitest run packages/mode-showroom/src/tool-policy.test.ts apps/studio/src/features/plan-editor/plan-toolbar.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx` | RED exit 1, 107/120 passed; retries passed 117/120 and 119/120 while toolbar order/grouping remained, then final GREEN passed 120/120 |
| 14 | `pnpm.cmd vitest run apps/studio/src/features/plan-editor/scene-canvas.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx` | RED exit 1, 114/118 passed; export-handle publication, failure retirement, container-bounded 16:9 framing and interaction locking produced final 118/118 |
| 15 | `pnpm.cmd vitest run apps/studio/src/features/plan-editor/export-panel.test.tsx apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx` | RED exited nonzero on the absent panel/session workflow; the durable report did not retain a trustworthy aggregate count, so none is inferred. Coordinator/session/focus repairs and a generation-order review fix preceded final four-file 139/139 |
| 16 | `node --test tests/showroom-demo.test.mjs`<br>`pnpm.cmd vitest run packages/core-model/src/core-model.test.ts` | Node RED exit 1, 0/4 passed because the fixture was absent; Vitest exited before collection on the same missing import. Local fixture/generator/policy fixes produced Node 21/21 and core-model 99/99 |
| 17 | `cargo test -p project-io --test create_open deterministic_identity`<br>`cargo test -p asset-io --test showroom_demo` | review REDs exposed literal-basename publication, digest placeholder, journal evidence and canonical-asset mismatch gaps; the scoped repairs produced identity 2/2 and Demo 5/5 |
| 18 | `pnpm.cmd vitest run packages/exporter/src/m2-5-vertical-acceptance.test.ts apps/studio/src/features/plan-editor/m2-5-vertical-acceptance.test.tsx`<br>`cargo test -p project-io --test m2_5_vertical_acceptance` | initial Vitest passed 1/4 and failed three test expectations that omitted locked preset data; project-io initially did not compile because of a malformed test literal. Test-only expectation/syntax/type/format repairs preceded the final gate; no product failure was manufactured |
| 19 | `node --test tests/workspace-structure.test.mjs tests/project-format-policy.test.mjs tests/offline-source-policy.test.mjs tests/visible-actions.test.mjs` | RED exit 1, 37/41 passed; all four failures were missing `docs/M2_REPORT.md`. Documentation produced 45/45 GREEN. The first review found stale status, shorthand audit, and command-list layout issues; the second found historical-count wording, merged execution history, and invalid UTF-8 bytes. Both repair waves returned 45/45 before re-review |

Editing transports rejected by the Windows sandbox are recorded in ignored task reports but are not test evidence. No product pass is inferred from a failed, unstarted, or count-less command.

## Independent review verdicts

Tasks 1-18 each reached an independent closure verdict with no unresolved Critical, Important, or Minor finding. Task 18's final re-review was: Spec Compliance Pass; Code Quality Approved; Critical 0; Important 0; Minor 0; Ready Yes. Earlier findings are retained in the task reports and are listed above only after their targeted RED and GREEN evidence closed them.

Task 19's first documentation review returned Spec Compliance Fail / Changes Requested / Ready No with two Important findings (stale status and shorthand audit evidence) and one Minor command-list layout finding. A second independent review confirmed those were closed, then returned Fail / Changes Requested / Ready No for contradictory historical eight-invoke wording, merged Task 19 execution history, and invalid UTF-8 quote bytes. After both documentation-only repair waves, the final independent re-review returned Spec Compliance Pass; Code Quality Approved; Critical 0; Important 0; Minor 0; Ready Yes. Task 20 final whole-milestone review is a separate gate, so this report must not be read as completing Task 20.

## Runtime evidence not performed

No build was run for M2.5. No dev or debug server was run. No browser or Playwright flow was run. No packaged application was run. No packaging command was run. No screenshot was captured. No real GPU frame was rendered or inspected. No visual comparison, color-management measurement, performance profile, crash/power-loss hardware test, or accessibility audit in a real browser was performed.

The accepted evidence is therefore deterministic source-level, type-level, injected-renderer, codec, filesystem, SQLite, IPC, and policy evidence only.
