# AetherTwin executable continuation plan

This plan is intentionally bounded to branch stabilization and M2.1. Tasks are dependency-ordered and sized for one focused Spark execution. Execute exactly one unchecked task at a time, obtain an independent review, and commit it before starting the next task.

Completed prerequisites:

- [x] M2.1 Task 1 — TypeScript schema v3 (`542f75f9`)
- [x] M2.1 Task 2 — native guarded v3 upgrade (`c004e998`, `371b46c4`)
- [x] M2.1 Task 3 — pure asset policy (`440f9d40`, `97f71c54`)
- [x] M2.1 Task 4 implementation commit (`da9cd919`)
- [ ] M2.1 Task 4 independent acceptance review

M2.2-M2.5 are not executable from this file. After M2.1 acceptance, a higher-reasoning planning pass must turn the next approved child spec into a new atomic plan.

## Task H01 — close the independent Task 4 review

- [ ] **Status**
- **Goal:** independently accept or repair `snapshot.records.patch` in `97f71c54..da9cd919`.
- **Prerequisites:** branch contains `da9cd919`; read `AGENTS.md`, `HANDOFF.md`, the M2.1 spec, and original implementation-plan Task 4.
- **Files:** review only `packages/project-store/src/{snapshot-records-command.ts,snapshot-records-command.test.ts,project-store.ts,index.ts,project-store.test.ts}`, `crates/project-io/src/{model.rs,project.rs}`, `crates/project-io/tests/commit_recovery.rs`, `crates/desktop-host/src/dto.rs`, and `crates/desktop-host/tests/command_contract.rs`. Modify only a file in this list when a Critical or Important finding requires it.
- **Implementation steps:**
  1. Run the four read-only Git commands in `HANDOFF.md` section 15.
  2. Compare the implementation against all Task 4 interfaces and hostile-payload cases.
  3. Trace one heterogeneous assets + planReferences apply, undo, redo, checkpoint, reopen, and recovery sequence across TypeScript, DTO validation, Rust replay, and normalized rows.
  4. Record findings as Critical, Important, or Minor. A no-finding review must state the files and contracts checked.
  5. For each Critical/Important finding, add a failing focused test, implement one fix, and rerun the commands below.
  6. Update ignored `.superpowers/sdd/progress.md` only after all Critical/Important findings are closed.
- **Do not modify:** collection allowlist, public Tauri invoke count, schema version, asset files, UI, docs, lockfile, or unrelated lint/format debt.
- **Acceptance criteria:** exact root/change keys; nine and only nine collections; canonical UUIDs; no duplicate IDs; concrete typed records; exact before/index/order; normalized reverse inverse; one transaction/history entry; atomic SQLite rows/journal/meta; claimed-after equality; recovery parity; safe DTO failure. No open Critical/Important finding.
- **Tests:**
  ```powershell
  pnpm.cmd vitest run packages/project-store/src/snapshot-records-command.test.ts packages/project-store/src/project-store.test.ts
  pnpm.cmd exec tsc -p packages/project-store/tsconfig.json --noEmit
  cargo test -p project-io --test commit_recovery
  cargo test -p desktop-host --test command_contract
  cargo check -p project-io -p desktop-host
  git diff --check
  ```
- **Expected result:** 52 TypeScript tests, 39 project-io tests, and 16 desktop-host tests pass; both checks exit 0. If counts increase because a review test is added, every listed test must pass.
- **Failure inspection:** `patchSnapshotRecordsCommand.prepare/applyInverse`, `ProjectStore.applySnapshotRecordPatches`, `SnapshotRecordsPatch`, `apply_record_changes`, `validate_commit_batch`, `normalized_entity_rows`, `write_asset_records`, and DTO `strict_snapshot_records_patch`.
- **Risk and rollback:** a replay change can corrupt recovery semantics. Keep any repair in one commit; if it fails review, revert that repair commit and retain `da9cd919` for renewed analysis.

## Task H02 — restore reproducible pnpm installation

- [ ] **Status**
- **Goal:** synchronize the lockfile with the committed `asset-pipeline` workspace package without updating dependency versions.
- **Prerequisites:** H01 accepted; worktree clean.
- **Files:** modify only `pnpm-lock.yaml`.
- **Implementation steps:**
  1. Reproduce `ERR_PNPM_OUTDATED_LOCKFILE` with the frozen command.
  2. Run `pnpm.cmd install --no-frozen-lockfile`.
  3. Inspect `git diff -- pnpm-lock.yaml`.
  4. Require exactly one new `packages/asset-pipeline` importer linking `@aethertwin/core-model` as `workspace:*`; reject unrelated resolver/version changes.
  5. Run the frozen install again and commit.
- **Do not modify:** any `package.json`, package version, dependency version, source file, or generated `dist/`.
- **Acceptance criteria:** a clean checkout can install with `--frozen-lockfile`; lockfile diff contains only the missing local importer.
- **Tests:**
  ```powershell
  pnpm.cmd install --frozen-lockfile
  git diff --check
  ```
- **Expected result:** install exits 0 and reports an up-to-date workspace; diff check exits 0.
- **Failure inspection:** `packages/asset-pipeline/package.json`, lockfile `importers`, pnpm 11.9.0 version, and workspace glob in `pnpm-workspace.yaml`.
- **Risk and rollback:** pnpm may refresh unrelated resolution data. Do not commit such a diff; restore the task commit and regenerate with pnpm 11.9.0.

## Task H03 — align the schema-v3 scene default with the approved M2.4 contract

- [ ] **Status**
- **Goal:** make TypeScript, Rust, migration, and fixture use the approved default environment before more v3 projects are created.
- **Prerequisites:** H02 complete; human confirms no external v3 project requires preservation of the provisional default.
- **Files:** `packages/core-model/src/model.ts`, `packages/core-model/src/core-model.test.ts`, `crates/project-io/src/model.rs`, `crates/project-io/tests/contract_fixture.rs`, `crates/project-io/tests/commit_recovery.rs`, and `fixtures/contracts/snapshot.v3.json`.
- **Implementation steps:**
  1. Add TS and Rust assertions for exact default values and v2-to-v3 migration output.
  2. Confirm RED against the current provisional values.
  3. Set background `#101820`; ambient colour `#dce8f0`, intensity `0.55`; key colour `#fff1dc`, intensity `1.1`, direction `[4,8,5]`; shadows enabled; softness `0.5`.
  4. Update the v3 fixture to the same values.
  5. Verify new-project, v2 upgrade, public recovery upgrade, and fixture parity.
- **Do not modify:** schema version 3, validation ranges, persisted field names, sequence/checkpoint semantics, or existing v1/v2 fixture content.
- **Acceptance criteria:** every newly created or migrated v3 snapshot receives exactly the approved default; arbitrary valid user-edited environment values remain accepted; no hidden v3-to-v3 mutation is introduced.
- **Tests:**
  ```powershell
  pnpm.cmd vitest run packages/core-model/src/core-model.test.ts
  pnpm.cmd exec tsc -p packages/core-model/tsconfig.json --noEmit
  cargo test -p project-io --test contract_fixture
  cargo test -p project-io --test commit_recovery
  cargo check -p project-io
  ```
- **Expected result:** all listed tests and checks exit 0; migration assertions match the exact six approved values.
- **Failure inspection:** `DEFAULT_SCENE_ENVIRONMENT`, Rust `impl Default for SceneEnvironment`, `migrateSnapshotV2ToV3`, Rust `migrate_snapshot_v2_to_v3`, and fixture serialization.
- **Risk and rollback:** changing a default affects newly migrated data. If external v3 projects exist, stop and design an explicit migration policy with the human; do not silently preserve two defaults.

## Task H04 — repair schema-v3 build, policy, and current-state documentation

- [ ] **Status**
- **Goal:** remove v2 compatibility drift and make current documentation describe partial M2 truth without claiming unfinished asset I/O.
- **Prerequisites:** H03 complete.
- **Files:** `packages/render-plan-2d/src/pixi-plan-renderer.test.ts`, `packages/render-plan-2d/src/scene-projection.test.ts`, `tests/project-format-policy.test.mjs`, `README.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT_FORMAT.md`, `docs/DECISIONS.md`, `docs/PRODUCT_SPEC.md`, and `docs/ROADMAP.md`.
- **Implementation steps:**
  1. Change the two render-plan test fixtures from `parseSnapshotV2` to `parseSnapshotV3`; do not change renderer production code.
  2. Update project-format policy to load `snapshot.v3.json`, assert schema 3 across TS/Rust/fixture/docs, and inspect `parseAssetV3` exact canonical path enforcement.
  3. Retain explicit v1/v2 migration compatibility assertions; do not delete old fixtures.
  4. Update current docs to say M2.1 Tasks 1-4 are implemented, Task 4 review status, current six native invokes, and asset import/resolution/calibration not yet implemented.
  5. Remove the stale core-model test title that says v2 while asserting v3.
- **Do not modify:** schema/parser behavior, runtime renderer, Tauri commands, capabilities, UI actions, or later-M2 claims.
- **Acceptance criteria:** render-plan typecheck is green; policy asserts the real v3 path rather than an old function name; docs do not claim Task 5+ capabilities.
- **Tests:**
  ```powershell
  pnpm.cmd vitest run packages/render-plan-2d/src/scene-projection.test.ts packages/render-plan-2d/src/pixi-plan-renderer.test.ts packages/core-model/src/core-model.test.ts
  pnpm.cmd exec tsc -p packages/render-plan-2d/tsconfig.json --noEmit
  node --test tests/workspace-structure.test.mjs tests/visible-actions.test.mjs tests/project-format-policy.test.mjs tests/offline-source-policy.test.mjs
  ```
- **Expected result:** all Vitest files pass, render-plan typecheck exits 0, and all 18 Node policy tests pass.
- **Failure inspection:** fixture return types, `parseSnapshotV3`, policy regex/function extraction, `parseAssetV3`, `CURRENT_SCHEMA_VERSION`, and stale schema wording in the nine docs.
- **Risk and rollback:** a policy rewrite can stop testing path safety. Require assertions for digest/media extension equality, absolute/UNC/backslash/traversal rejection through invalid canonical-path tests, and no BLOB column.

## Task H05 — remove explicit-any debt from core-model tests

- [ ] **Status**
- **Goal:** make `core-model.test.ts` satisfy the existing no-explicit-any rule without weakening validation coverage.
- **Prerequisites:** H04 complete.
- **Files:** modify only `packages/core-model/src/core-model.test.ts`; optionally create `packages/core-model/src/test-json-helpers.ts` when a reusable test-only helper is necessary.
- **Implementation steps:**
  1. Run ESLint on the file and record the exact current errors.
  2. Introduce test-only `unknown`/JSON record guards and path mutation helpers.
  3. Replace direct `(value: any)` hostile mutations with guarded mutations that throw if the fixture shape changes.
  4. Type valid fixture builders with schema interfaces; keep invalid input as `unknown`.
  5. Preserve every validation case and assertion.
- **Do not modify:** ESLint config, production validation/model code, test expectations, or schema behavior.
- **Acceptance criteria:** no `any`, no eslint suppression, no skipped test, and the hostile-payload matrix is unchanged or larger.
- **Tests:**
  ```powershell
  pnpm.cmd exec eslint packages/core-model/src/core-model.test.ts
  pnpm.cmd vitest run packages/core-model/src/core-model.test.ts
  pnpm.cmd exec tsc -p packages/core-model/tsconfig.json --noEmit
  ```
- **Expected result:** ESLint, Vitest, and typecheck exit 0.
- **Failure inspection:** JSON clone helpers, readonly-to-mutable conversion boundary, callback table typing, and exact invalid-path expectations.
- **Risk and rollback:** over-typing may prevent construction of intentionally invalid JSON. Keep invalid mutation at a guarded `unknown` boundary instead of casting to a valid project type.

## Task H06 — make the remaining workspace ESLint gate green

- [ ] **Status**
- **Goal:** fix every non-core-model lint error without changing lint rules or runtime behavior.
- **Prerequisites:** H05 complete.
- **Files:** only the files reported by `pnpm.cmd lint` outside `core-model.test.ts`: Studio backend/plan-editor/project-center files, `packages/asset-pipeline/src/media-policy.ts`, `packages/command-bus/src/command-bus.ts`, plan-engine tests, `packages/project-store/src/sandbox-backend.ts`, and `packages/render-plan-2d/src/pixi-plan-renderer.test.ts`.
- **Implementation steps:**
  1. Re-run full lint and save the file/line list in the task report.
  2. Use `const` for non-reassigned bindings and `import type` for type-only imports.
  3. Remove unused callback parameters or consume required interface parameters with `void parameter`; do not disable the rule.
  4. Replace the control-character regex in `media-policy.ts` with an explicit character-code filter preserving U+0000..U+001F and U+007F removal.
  5. Remove the unused generic type in `command-bus.ts` without changing its public inferred API.
  6. Run focused tests and all changed-package type checks.
- **Do not modify:** `eslint.config.mjs`, tsconfig strictness, public behavior, test counts, or dependency versions.
- **Acceptance criteria:** full workspace lint exits 0; display-name sanitization still removes the same code points; no test is skipped.
- **Tests:**
  ```powershell
  pnpm.cmd lint
  pnpm.cmd vitest run packages/asset-pipeline/src/asset-pipeline.test.ts packages/command-bus/src/command-bus.test.ts packages/plan-engine/src packages/project-store/src/project-store.test.ts packages/render-plan-2d/src/pixi-plan-renderer.test.ts apps/studio/src/backend/tauri-backend.test.ts apps/studio/src/features/project-center/project-center.test.tsx apps/studio/src/features/plan-editor
  pnpm.cmd typecheck
  ```
- **Expected result:** lint, all selected Vitest files, and recursive typecheck exit 0.
- **Failure inspection:** sanitizer boundary tests, `CommandDefinition` inference, callback interface signatures, and type-only imports.
- **Risk and rollback:** unused-parameter cleanup can accidentally stop invoking a callback. Do not remove a callback itself; change only its local parameter list/body.

## Task H07 — normalize Rust formatting without behavior changes

- [ ] **Status**
- **Goal:** make rustfmt green for the eight branch-modified Rust files.
- **Prerequisites:** H06 complete; clean worktree.
- **Files:** only the eight files listed under `HANDOFF.md` K5.
- **Implementation steps:**
  1. Run `cargo fmt --all`.
  2. Inspect the diff and verify it is whitespace/layout only.
  3. Run full Rust tests and checks.
  4. Commit formatting separately.
- **Do not modify:** logic, tests, dependencies, Cargo manifests, error codes, or generated schema files.
- **Acceptance criteria:** `cargo fmt --all -- --check` exits 0 and semantic tests remain identical.
- **Tests:**
  ```powershell
  cargo fmt --all -- --check
  cargo test -p project-io
  cargo test -p desktop-host
  cargo check -p project-io -p desktop-host
  ```
- **Expected result:** rustfmt and checks exit 0; project-io has at least 85 passing tests and desktop-host at least 26, with 0 failures.
- **Failure inspection:** unexpected non-format diff, conditional compilation sections, and test fixture serialization.
- **Risk and rollback:** minimal; if rustfmt touches an unlisted file, exclude it from the commit or explain why it belongs to the formatted workspace.

## Task H08 — enable an exact production CSP before custom asset protocol work

- [ ] **Status**
- **Goal:** replace `security.csp: null` with a least-privilege policy compatible with Tauri IPC and the planned project-bound asset scheme.
- **Prerequisites:** H07 complete.
- **Files:** `crates/desktop-host/tauri.conf.json`, `crates/desktop-host/tests/command_contract.rs`, and `tests/offline-source-policy.test.mjs`.
- **Implementation steps:**
  1. Add failing tests requiring non-null CSP and forbidding `*`, `unsafe-eval`, remote origins, and built-in broad `assetProtocol`.
  2. Configure exactly:
     - `default-src`: `'self'`
     - `connect-src`: `ipc: http://ipc.localhost`
     - `img-src`: `'self' aethertwin-asset: http://aethertwin-asset.localhost blob: data:`
     - `media-src`: `'self' aethertwin-asset: http://aethertwin-asset.localhost blob:`
     - `style-src`: `'self' 'unsafe-inline'`
     - `font-src`: `'self'`
     - `object-src`, `frame-src`, and `base-uri`: `'none'`
  3. Do not enable Tauri `assetProtocol`; M2.1 uses an application-owned session-bound protocol.
  4. Assert capability permissions remain exactly window + dialog and invoke commands remain six.
- **Do not modify:** command implementations, capabilities, plugins, remote dependencies, or dev server configuration.
- **Acceptance criteria:** policy is exact and contains only local/IPC/custom-protocol sources; no broad file scope exists.
- **Tests:**
  ```powershell
  cargo test -p desktop-host --test command_contract
  node --test tests/offline-source-policy.test.mjs
  cargo check -p desktop-host
  ```
- **Expected result:** all commands exit 0; command surface remains six and capability list remains two entries.
- **Failure inspection:** Tauri config JSON shape, platform custom-protocol origin, offline URL scanner, and command-contract config assertions.
- **Risk and rollback:** an incorrect source list can block production assets. Never widen globally; add only the exact blocked local source with a new assertion.

## Task H09 — close the branch-stabilization gate

- [ ] **Status**
- **Goal:** establish one all-green non-runtime baseline before native asset implementation.
- **Prerequisites:** H01-H08 complete and independently reviewed.
- **Files:** no production changes expected; update only task evidence/progress notes.
- **Implementation steps:**
  1. Run all commands below from `aethertwin/`.
  2. Record exact test counts, durations, exit codes, and any retries.
  3. Obtain current user approval before `pnpm.cmd build`; if approval is denied, record the skip and do not claim the build passes.
  4. Require a clean Git status before M2.1 Task 5.
- **Do not modify:** source while running the gate; diagnose any failure in a new atomic repair task.
- **Acceptance criteria:** frozen install, lint, typecheck, focused/full tests, policy, rustfmt, Cargo tests/check, and approved build all pass; no generated artifacts are tracked.
- **Tests:**
  ```powershell
  pnpm.cmd install --frozen-lockfile
  pnpm.cmd lint
  pnpm.cmd typecheck
  pnpm.cmd test
  node --test tests/*.test.mjs
  cargo fmt --all -- --check
  cargo test -p project-io
  cargo test -p desktop-host
  cargo check -p project-io -p desktop-host
  pnpm.cmd build
  git diff --check
  git status --short
  ```
- **Expected result:** all authorized commands exit 0; final status is empty.
- **Failure inspection:** use the first failing command and `HANDOFF.md` K1-K8; do not continue down the list after an unexplained failure.
- **Risk and rollback:** none when no source changes are made. If a command mutates the lockfile, stop and inspect it before any cleanup.

## Task M21-05 — implement the `asset-io` import core

- [ ] **Status**
- **Goal:** capture, validate, hash, stage, and atomically publish immutable project assets.
- **Prerequisites:** H09 green; approved M2.1 asset policy; no import UI.
- **Files:** delete `crates/asset-io/.gitkeep`; create `crates/asset-io/Cargo.toml`, `src/{lib.rs,error.rs,source.rs,media.rs,svg.rs,import.rs}`, and `tests/{media_policy.rs,svg_policy.rs,import_pipeline.rs}`; modify root `Cargo.toml`, `Cargo.lock`, and `THIRD_PARTY_NOTICES.md`.
- **Implementation steps:**
  1. Add RED tests for every extension/signature/size/dimension boundary, SVG unsafe construct, source replacement, symlink/reparse point, stage cleanup, collision, exact dedup, hash, and cancellation terminal state.
  2. Capture one stable read-only source handle and verify regular-file identity; never reopen bytes by path.
  3. Parse PNG IHDR, JPEG SOF, SVG XML, MP4 `ftyp`, and WebM EBML without full media decode.
  4. Stream in 1 MiB chunks, SHA-256 hash, report monotonic progress, check cancellation, `sync_all`, verify size/digest, and publish no-replace to the canonical path.
  5. Reuse an existing destination only after same-handle regular identity, size, and full digest verification.
  6. Remove only the importer-owned staging file on failure.
- **Do not modify:** desktop-host, Studio, ProjectStore, Tauri commands/capabilities/CSP, snapshot records, or existing destination bytes.
- **Acceptance criteria:** supported media and exact limits match `asset-pipeline`; source identity cannot be swapped; identical bytes deduplicate; mismatched destination never overwrites; errors expose stable codes without paths.
- **Tests:**
  ```powershell
  cargo test -p asset-io --test media_policy
  cargo test -p asset-io --test svg_policy
  cargo test -p asset-io --test import_pipeline
  cargo check -p asset-io
  cargo fmt --all -- --check
  ```
- **Expected result:** all new tests and checks exit 0.
- **Failure inspection:** OS-specific source identity, Windows share flags/reparse handling, SVG local-name/URL/CSS checks, stage ownership, publication primitive, and cancellation observer.
- **Risk and rollback:** highest filesystem risk. Keep the crate commit isolated; revert it if any test shows overwrite, path leakage, or cleanup outside the owned staging leaf.

## Task M21-06 — expose session-bound import, progress, and cancellation

- [ ] **Status**
- **Goal:** add exactly two native commands and typed frontend methods for asset import lifecycle.
- **Prerequisites:** M21-05 accepted.
- **Files:** `crates/desktop-host/Cargo.toml`, `src/{dto.rs,error.rs,state.rs,commands.rs,lib.rs}`, state tests, `tests/command_contract.rs`, and Studio `backend/{tauri-backend.ts,tauri-backend.test.ts}`.
- **Implementation steps:**
  1. Add RED DTO/lifecycle tests for operation UUID, role, session ownership, duplicate operation, monotonic progress, cross-session cancel, cancel/complete race, close waiting, command count, and redaction.
  2. Register `operationId -> sessionId + cancellation token` before file access.
  3. Bind import to the active `ProjectSession` lock and execute blocking I/O through `spawn_blocking`.
  4. Remove the operation exactly once after one terminal result.
  5. Map stable asset errors to the existing safe envelope.
  6. Add Tauri Channel parsing and cancel methods; keep source path only in the transient request.
- **Do not modify:** capability permissions, CSP, custom protocol, ProjectStore records, or UI.
- **Acceptance criteria:** native invoke list is exactly eight; cancel affects only the matching operation/session; close cannot race past active import; no path appears in result/error/log DTO text.
- **Tests:**
  ```powershell
  cargo test -p desktop-host --test command_contract
  cargo test -p desktop-host state::tests
  pnpm.cmd vitest run apps/studio/src/backend/tauri-backend.test.ts
  pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
  cargo check -p desktop-host
  ```
- **Expected result:** all tests/checks exit 0 and exact command-count assertion equals eight.
- **Failure inspection:** operation registry insertion/removal, session mutex lifetime, Channel DTO parser, cancel token terminal compare/exchange, and error presentation.
- **Risk and rollback:** cancellation/close races can leak stages or publish after close. Revert the isolated task commit if terminal ownership is not deterministic.

## Task M21-07 — implement verified project asset resolution

- [ ] **Status**
- **Goal:** serve project assets by session ID and asset ID only, with verified handles and safe byte ranges.
- **Prerequisites:** M21-06 accepted and H08 CSP present.
- **Files:** create `crates/asset-io/src/resolver.rs`, `crates/asset-io/tests/resolver.rs`, and `crates/desktop-host/src/asset_protocol.rs`; modify asset-io `lib.rs` and desktop-host `lib.rs`, `main.rs`, `state.rs`, and state tests.
- **Implementation steps:**
  1. Add RED tests for URL shape, wrong session/asset, traversal, schemes, missing/non-regular/corrupt/replaced files, cache, invalidation, MIME, `nosniff`, GET/HEAD/range/416, and redaction.
  2. Resolve membership from the authoritative session snapshot and rederive the canonical path.
  3. Open one no-delete-shared handle, verify identity/size, hash before serving, then cache by `(sessionId, assetId)`.
  4. Register only `aethertwin-asset://asset/<session-id>/<asset-id>`; support one valid byte range.
  5. Invalidate handles on record removal/change, recovery, project replacement, and close.
- **Do not modify:** invoke command count, capability list, built-in Tauri asset protocol, broad filesystem scope, or frontend paths.
- **Acceptance criteria:** no byte is served before full verification; Windows origin mapping is handled; corrupt bytes produce a typed issue; structural editing remains available.
- **Tests:**
  ```powershell
  cargo test -p asset-io --test resolver
  cargo test -p desktop-host asset_protocol
  cargo test -p desktop-host state::tests
  cargo check -p asset-io -p desktop-host
  ```
- **Expected result:** all tests/checks exit 0; native invoke count remains eight.
- **Failure inspection:** URI parser, session registry, canonical path derivation, handle identity/cache, Content-Range math, invalidation hooks, and CSP source matching.
- **Risk and rollback:** serving stale or replaced bytes is a security failure. Revert the task if verification and serving do not use the same retained handle.

## Task M21-08 — orchestrate atomic imports in ProjectStore and sandbox

- [ ] **Status**
- **Goal:** import one plan asset and commit its `AssetRecord` plus `PlanReference` as one reversible transaction.
- **Prerequisites:** M21-07 accepted.
- **Files:** ProjectStore `package.json`, `src/{backend.ts,project-store.ts,sandbox-backend.ts,index.ts,project-store.test.ts}` and Studio Tauri backend files.
- **Implementation steps:**
  1. Add RED tests for result validation, adjacent records/one transaction ID, one-step undo/redo, commit failure, cancellation, replacement, reopen, sandbox digest/dedup, and Blob URL lifecycle.
  2. Extend `ProjectBackend` with import, cancel, and resolve-by-asset-ID ports.
  3. Validate native result, compose reference with pure `asset-pipeline`, then transactionally patch assets followed by planReferences.
  4. Implement sandbox Blob validation, Web Crypto digest, canonical-byte storage, monotonic progress, and URL reuse/revocation.
  5. Expose transient asset issues without placing URLs in snapshots.
- **Do not modify:** UI, Pixi renderer, native protocol, native files after publication, or immutable asset bytes on undo.
- **Acceptance criteria:** journal commit failure publishes no record; undo/redo is one history step; sandbox and desktop expose the same asset-ID contract; URLs are revoked exactly once.
- **Tests:**
  ```powershell
  pnpm.cmd vitest run packages/project-store/src/snapshot-records-command.test.ts packages/project-store/src/project-store.test.ts
  pnpm.cmd vitest run apps/studio/src/backend/tauri-backend.test.ts
  pnpm.cmd exec tsc -p packages/project-store/tsconfig.json --noEmit
  pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
  ```
- **Expected result:** all tests and type checks exit 0.
- **Failure inspection:** backend port ownership, `bus.transaction` intent order, authoritative snapshot publication, Blob URL registry, project replacement/close cleanup, and issue redaction.
- **Risk and rollback:** publishing only one of two records breaks reference integrity. Keep composition and transaction in one task commit and revert it if atomicity fails.

## Task M21-09 — implement pure plan-reference geometry and calibration

- [ ] **Status**
- **Goal:** compute reference bounds/hits/source transforms and exact two-point scale without UI or persistence.
- **Prerequisites:** M21-08 accepted.
- **Files:** create `packages/plan-engine/src/{calibration.ts,calibration.test.ts,plan-references.ts,plan-references.test.ts}`; modify `index.ts` and package manifest.
- **Implementation steps:**
  1. Add RED tests for horizontal/diagonal formula, invalid numbers, coincident points, nonpositive distance, overflow, safe bounds, preserved transform, evidence, cancellation, and locked reference.
  2. Compute `mmPerPixel = measuredDistanceMm / hypot(dx,dy)`.
  3. Set uniform scale, preserve translation/rotation, and store exact evidence.
  4. Transform four source corners; reject any world coordinate outside ±1,000,000,000 mm.
  5. Give business entities hit priority over references; locked references remain selectable but not mutable.
- **Do not modify:** React, PixiJS, Tauri, ProjectStore, or stored units.
- **Acceptance criteria:** pure deterministic functions; no side effects; exact formula and bounds; typed failures.
- **Tests:**
  ```powershell
  pnpm.cmd vitest run packages/plan-engine/src/calibration.test.ts packages/plan-engine/src/plan-references.test.ts
  pnpm.cmd exec tsc -p packages/plan-engine/tsconfig.json --noEmit
  pnpm.cmd exec eslint packages/plan-engine/src/calibration.ts packages/plan-engine/src/plan-references.ts
  ```
- **Expected result:** all commands exit 0.
- **Failure inspection:** inverse transform, corner order, floating-point equality required by schema calibration evidence, lock guard, and hit ordering.
- **Risk and rollback:** rounding can make stored evidence fail schema equality. Do not round persisted scale; format only UI display later.

## Task M21-10 — render plan references through verified asset IDs

- [ ] **Status**
- **Goal:** add a dedicated Pixi reference layer and safe asset-source lifecycle.
- **Prerequisites:** M21-09 accepted.
- **Files:** render-plan-2d `types.ts`, `scene-projection.ts`, `pixi-plan-renderer.ts`, `index.ts` and tests; Studio `plan-canvas.tsx` and test.
- **Implementation steps:**
  1. Add RED projection/lifecycle tests for visibility, corners, order, style, culling, asset-ID-only resolution, stale promises, invalidation, destroy, and placeholder.
  2. Add `reference` between `grid` and `content`.
  3. Project only asset ID, screen corners, opacity, and bounds.
  4. Resolve through an injected stable port; discard stale completions by generation.
  5. Destroy owned sprite/texture resources exactly once; render Graphics placeholder on typed failure.
- **Do not modify:** filesystem paths, snapshot URLs, business model ownership, renderer package versions, or higher layer order.
- **Acceptance criteria:** no render node contains a path; one load per asset generation; safe failure placeholder; complete cleanup.
- **Tests:**
  ```powershell
  pnpm.cmd vitest run packages/render-plan-2d/src/scene-projection.test.ts packages/render-plan-2d/src/pixi-plan-renderer.test.ts apps/studio/src/features/plan-editor/plan-canvas.test.tsx
  pnpm.cmd exec tsc -p packages/render-plan-2d/tsconfig.json --noEmit
  pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
  ```
- **Expected result:** all tests and type checks exit 0.
- **Failure inspection:** layer creation/order, source-port identity, async generation token, texture ownership, placeholder path, and renderer destroy.
- **Risk and rollback:** stale async loads can attach one project's texture to another. Revert if project replacement tests do not prove stale completion is ignored.

## Task M21-11 — add the real Asset Library and import flow

- [ ] **Status**
- **Goal:** expose only working M2.1 asset import and issue/retry UI.
- **Prerequisites:** M21-10 accepted.
- **Files:** create Studio plan-editor `asset-picker.ts`, `asset-library.tsx`, `asset-library.test.tsx`; modify editor session, plan editor, toolbar, plan-editor tests, and `app.css`.
- **Implementation steps:**
  1. Add RED tests for desktop filters, sandbox input, picker cancel, progress, cancel UUID, success selection, commit failure, corrupt issue/reimport, path redaction, and focus return.
  2. Implement an injected picker: Tauri dialog returns transient native path; sandbox returns owned Blob.
  3. Generate operation/reference UUIDs before import and call ProjectStore once.
  4. Announce progress via `aria-live`; return focus on success/cancel/failure.
  5. Show Asset Library and `Import floor plan` only when backend import capability exists.
- **Do not modify:** openings, fixtures catalogue, content, routes, 3D, export, Player, or source-path persistence.
- **Acceptance criteria:** every visible control performs a real backend/ProjectStore action; picker cancellation is a successful no-op; errors display no source path.
- **Tests:**
  ```powershell
  pnpm.cmd vitest run apps/studio/src/features/plan-editor/asset-library.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx
  pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
  pnpm.cmd exec eslint apps/studio/src/features/plan-editor
  ```
- **Expected result:** all tests/checks exit 0.
- **Failure inspection:** picker injection, feature capability detection, operation UUID, focus reference, aria-live state, and error rendering.
- **Risk and rollback:** displaying controls before sandbox/native parity violates No Fake Features. Gate visibility on the real backend port.

## Task M21-12 — add PlanReference selection, editing, and lock behavior

- [ ] **Status**
- **Goal:** share plan-reference selection across tree/canvas/Inspector and persist reversible edits.
- **Prerequisites:** M21-11 accepted.
- **Files:** create `reference-inspector.tsx` and test; modify Studio interaction controller/tests, plan editor, inspector, floor tree; modify ProjectStore and tests.
- **Implementation steps:**
  1. Add RED tests for tree/canvas selection, entity priority, all editable fields, delete, undo/redo, lock, hidden/locked layer, and invalid input.
  2. Add `applyPlanReferencePatch(before, after)` using one `snapshot.records.patch`.
  3. For ordinary edits require unchanged ID/floor/layer/asset/intrinsic size.
  4. Preview drag transiently; commit once on pointer-up; cancel/Escape/blur restores durable state.
  5. Disable mutation on locked reference while keeping it focusable and inspectable.
- **Do not modify:** asset replacement transaction, calibration formula, other spatial entity commands, or selection source of truth.
- **Acceptance criteria:** one shared selected ID; durable edits survive undo/redo and reopen; locked reference cannot drag/delete/recalibrate.
- **Tests:**
  ```powershell
  pnpm.cmd vitest run apps/studio/src/features/plan-editor/reference-inspector.test.tsx apps/studio/src/features/plan-editor/interaction-controller.test.ts apps/studio/src/features/plan-editor/plan-editor.test.tsx packages/project-store/src/project-store.test.ts
  pnpm.cmd exec tsc -p packages/project-store/tsconfig.json --noEmit
  pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
  ```
- **Expected result:** all tests/type checks exit 0.
- **Failure inspection:** selection discriminant, entity/reference hit order, drag draft lifecycle, before/after invariant, layer lock, and undo history.
- **Risk and rollback:** committing every pointer move floods the journal. Require exactly one commit on pointer-up.

## Task M21-13 — add keyboard-operable two-point calibration

- [ ] **Status**
- **Goal:** provide transient point/distance preview and one explicit durable calibration command.
- **Prerequisites:** M21-12 accepted.
- **Files:** create `calibration-panel.tsx` and test; modify editor session/tests, plan editor, toolbar, canvas, accessibility mirror, related tests, and `app.css`.
- **Implementation steps:**
  1. Add RED tests for visibility, lock/media denial, pointer and keyboard points, unit distance, invalid inputs, preview, snapshot stability, confirm, cancel/Escape, focus return, and mirror.
  2. Store `CalibrationDraft` only in transient vanilla Zustand.
  3. Convert canvas world clicks to source pixels through inverse reference transform; expose numeric X/Y fields for keyboard input.
  4. Use existing mm/cm/m parser; render preview in overlay without snapshot mutation.
  5. Confirm one exact before/after reference patch; cancel on project/floor/selection/tool change.
- **Do not modify:** persistent snapshot before confirmation, calibration formula, asset bytes, or other entity selection.
- **Acceptance criteria:** complete flow works without pointer; preview never changes sequence; confirm creates one undoable command; focus returns deterministically.
- **Tests:**
  ```powershell
  pnpm.cmd vitest run apps/studio/src/features/plan-editor/calibration-panel.test.tsx apps/studio/src/features/plan-editor/editor-session.test.ts apps/studio/src/features/plan-editor/plan-canvas.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx
  pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
  pnpm.cmd exec eslint apps/studio/src/features/plan-editor
  ```
- **Expected result:** all tests/checks exit 0.
- **Failure inspection:** draft cancellation subscriptions, inverse transform/clamp, unit parser, overlay source, focus ref, accessible action labels, and command count.
- **Risk and rollback:** preview state can leak across projects. Project replacement/disposal tests must prove synchronous draft cleanup.

## Task M21-14 — prove and document the complete M2.1 vertical slice

- [ ] **Status**
- **Goal:** close import -> asset record -> reference -> render -> calibration -> save/reopen/recovery with honest evidence.
- **Prerequisites:** M21-05 through M21-13 accepted and independently reviewed.
- **Files:** Studio integration test; new project-io schema-v3 recovery test; new desktop-host asset lifecycle test; four Node policy files; desktop capability/config tests; current architecture/project/product/decision/roadmap docs; `README.md`; create `docs/M2_1_REPORT.md`.
- **Implementation steps:**
  1. Add injected end-to-end tests for PNG/JPEG/SVG import, transaction, placement, calibration, lock, undo/redo, checkpoint, close/reopen, dirty recovery, corrupt placeholder, and reimport repair.
  2. Add native tests for migration rollback, dedup/collision/cancel, commit-failure residue, resolver/ranges, close cleanup, error mapping, exact eight commands, CSP, and unchanged two permissions.
  3. Update policies for real asset-io, schema v3, canonical paths, offline source, visible Import/Calibrate only, no later controls, and no broad permissions.
  4. Run the complete commands below with actual counts.
  5. Update docs and `M2_1_REPORT.md` with capabilities, exclusions, failures/retries, and skipped runtime evidence.
  6. Require clean status and independent milestone review.
- **Do not modify:** M2.2 records/UI, arbitrary model import, routes, 3D, export, Player, market workflow, broad capability, or runtime claims.
- **Acceptance criteria:** imported PNG/JPEG/sanitized SVG is selected by asset ID, placed, calibrated, locked, saved, closed, reopened, and recovered with identical relative identity and world scale; corrupt bytes are never served; reimport remains available; only M2.1 controls are visible.
- **Tests:**
  ```powershell
  pnpm.cmd lint
  pnpm.cmd typecheck
  pnpm.cmd vitest run packages/core-model/src/core-model.test.ts packages/asset-pipeline/src/asset-pipeline.test.ts packages/project-store/src/snapshot-records-command.test.ts packages/project-store/src/project-store.test.ts packages/plan-engine/src/calibration.test.ts packages/plan-engine/src/plan-references.test.ts packages/render-plan-2d/src/scene-projection.test.ts packages/render-plan-2d/src/pixi-plan-renderer.test.ts apps/studio/src/backend/tauri-backend.test.ts apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx
  node --test tests/workspace-structure.test.mjs tests/visible-actions.test.mjs tests/project-format-policy.test.mjs tests/offline-source-policy.test.mjs
  cargo fmt --all -- --check
  cargo test -p asset-io
  cargo test -p project-io
  cargo test -p desktop-host
  cargo check -p asset-io -p project-io -p desktop-host
  git diff --check
  git status --short
  ```
- **Expected result:** every listed command exits 0; no test is skipped; final worktree is clean after the evidence commit.
- **Failure inspection:** follow the vertical data flow in order: media policy -> asset-io stage/publication -> session operation registry -> protocol verification -> ProjectStore transaction -> record patch replay -> renderer source lifecycle -> calibration patch -> checkpoint/recovery.
- **Risk and rollback:** this is an evidence task, not a feature catch-all. If a behavior defect appears, stop and create one new atomic repair task; do not bury code fixes in the documentation commit.

## M2.1 completion gate

M2.1 is complete only after every checkbox above is checked, every task has independent acceptance, the branch has an all-green authorized baseline, and `docs/M2_1_REPORT.md` truthfully distinguishes automated source evidence from any unrun Tauri/browser/GPU/visual validation.
