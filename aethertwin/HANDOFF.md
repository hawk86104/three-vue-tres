# AetherTwin engineering handoff

Finalized: 2026-07-26
Product workspace: `aethertwin/`
Handoff target: GPT-5.3-Codex-Spark

## 1. Project final goal

AetherTwin is a local-first, desktop-first digital-twin authoring product with one durable model and exactly two immutable profiles: `showroom` and `market`. The complete roadmap is M0 foundation, M1 unified 2D authoring, M2 showroom workflow, M3 market workflow, M4 offline Player/media, and M5 hardening/performance.

The active goal is the approved M2 showroom workflow. Work is currently bounded to M2.1: schema v3, safe project-bound native asset import, verified asset resolution, persisted plan references, and keyboard-operable two-point calibration. Do not start M2.2 or later until M2.1 is accepted.

Normative design:

- `docs/superpowers/specs/2026-07-22-aethertwin-m2-showroom-workflow-design.md`
- `docs/superpowers/specs/2026-07-22-aethertwin-m2-1-assets-calibration-design.md`
- `docs/superpowers/plans/2026-07-22-aethertwin-m2-1-assets-calibration.md`

## 2. Current branch and baseline

- Current branch: `codex/aethertwin-m2`
- HEAD before this handoff documentation: `da9cd919aee3d4b59b82502c9dd336c3ee3282ce`
- Baseline branch: local `master`
- Baseline commit and merge base: `d257ef60d8317916241816be47852129661e022e`
- Branch relation to local `master`: 0 behind, 8 ahead
- Branch diff against local `master`: 42 files, 6,669 insertions, 514 deletions; every changed file is under `aethertwin/`
- `origin/master`: `12f921f22cc50a13b254fdef3dbfa66ae138194e`
- Local `master` and `origin/master` have diverged: local is 57 commits ahead and 2 commits behind. The two remote-only commits have no commit message.

Do not rebase, merge, reset, or change the baseline. A human must choose how the divergent local and remote histories will eventually be integrated.

Recent 15 commits at the handoff point:

1. `da9cd919` feat: persist typed schema v3 record patches
2. `97f71c54` fix: harden pure asset import policy
3. `440f9d40` feat: add pure asset import policy
4. `371b46c4` fix: harden schema v3 publication
5. `c004e998` feat: upgrade native projects to schema v3
6. `542f75f9` feat: define AetherTwin schema v3
7. `28c9848b` docs: plan AetherTwin M2.1 assets and calibration
8. `f4de69c5` docs: design AetherTwin M2 showroom workflow
9. `d257ef60` docs: complete AetherTwin M1 evidence
10. `6de0c07a` feat: integrate accessible Pixi plan canvas
11. `c603fe1d` feat: open projects in the 2D plan editor
12. `a9f5c519` feat: add plan editor interaction session
13. `92ddaa83` feat: add PixiJS plan rendering layer
14. `fb35e438` feat: add plan batch editing operations
15. `9453d2ca` feat: persist plan entity patch commands

## 3. Current working state

Feature development is frozen for handoff. Before the handoff documents were edited, the worktree was clean. The intended uncommitted scope at finalization is only:

- `AGENTS.md`
- `HANDOFF.md`
- `PLANS.md`

M2.1 Tasks 1-3 are implemented, committed, and independently reviewed. Task 4 is implemented and committed with green focused verification, but its independent review was interrupted and is not accepted yet. M2.1 Tasks 5-14 have not started.

The root repository is an unrelated legacy TvT.js/Vue/Tres workspace. Never run its scripts or modify its source for AetherTwin work.

## 4. Completed content

### M0 and M1

- Project creation/open/checkpoint/close/recovery, SQLite/WAL, locks, safe errors, and six typed Tauri commands.
- Immutable `showroom` and `market` profiles.
- CommandBus/ProjectStore durable mutation, undo/redo, checkpoint acknowledgement, and recovery.
- Schema v2 unified 2D authoring: floors/layers, six business spatial entities, dimensions, nine tools, PixiJS projection, shared selection, Inspector, arrays, transforms, snapping, and unit conversion.

### M2.1 Task 1 — schema v3

Commit: `542f75f9`

- TypeScript schema v3 and exact validation.
- Deterministic v2-to-v3 migration.
- New records: assets, plan references, openings, guided routes, materials, material assignments, and scene environment.
- Schema-v3 cross-language fixture.

Independent review: accepted. One minor stale test title still says schema v2 while asserting v3 behavior.

### M2.1 Task 2 — native v3 upgrade

Commits: `c004e998`, `371b46c4`

- Typed Rust schema v3 and fixture parity.
- Guarded v1/v2-to-v3 upgrade before an editor session is published.
- Database/manifest rollback on upgrade publication failure.
- Public recovery can upgrade a coherent v2 project.
- Recursive JavaScript-safe integer validation.

Independent review: accepted with no remaining findings.

### M2.1 Task 3 — pure asset policy

Commits: `440f9d40`, `97f71c54`

- `packages/asset-pipeline` implemented without filesystem access.
- Exact media roles, extensions, signatures, sizes, dimensions, canonical relative paths, and safe display names.
- Pure composition of an immutable `AssetRecord` and `PlanReference`.

Independent review: accepted with no remaining findings.

## 5. Partially completed content

### M2.1 Task 4 — typed snapshot record patches

Commit: `da9cd919`

Implemented:

- TypeScript `snapshot.records.patch` with nine allowlisted collections.
- Exact `before`, index, order, inverse, duplicate-ID, unknown-field, and claimed-after validation.
- `ProjectStore.applySnapshotRecordPatches` groups heterogeneous patches into one CommandBus transaction/history entry.
- Rust Serde enum uses concrete record types, not arbitrary JSON payloads.
- Native apply/undo/redo/recovery replay and normalized `asset_records` / `entity_records` writes.
- Desktop DTO validation delegates to the same typed commit validator.

Implementer evidence is in ignored file `.superpowers/sdd/task-4-implementer-report.md`. The frozen review package is `.superpowers/sdd/review-97f71c54..da9cd919.diff`.

Not completed:

- Independent Task 4 spec/code review and final finding closure.
- Validation-debt cleanup exposed by the broader handoff baseline.

Spark must complete this review before changing Task 4 code or starting Task 5.

## 6. Not started

### Remaining M2.1

1. Native `asset-io` import core.
2. Session-bound import progress and cancellation.
3. Verified custom-protocol asset resolution.
4. ProjectStore and sandbox import orchestration.
5. Pure plan-reference geometry and calibration.
6. Plan-reference Pixi rendering.
7. Asset Library and import flow.
8. PlanReference selection, placement, editing, delete, and lock.
9. Keyboard-operable two-point calibration.
10. M2.1 integration, recovery, policy, documentation, and evidence report.

### Later milestones

- M2.2 doors/windows, room recognition, and seven parametric fixture kinds.
- M2.3 product content, hotspots, route graph, and guided route.
- M2.4 synchronized 3D preview, materials, environment, and resource lifecycle.
- M2.5 offscreen PNG export, deterministic demo, and M2 evidence.
- M3 market workflow, M4 Player/media, and M5 hardening/performance.

The M2.2-M2.5 design specs are approved, but implementation plans do not exist. A higher-reasoning planning pass must create each subproject plan after the previous subproject is accepted; Spark must not expand into them from this handoff.

## 7. Important modified files and purpose

- `packages/core-model/src/model.ts`, `content-model.ts`, `validation.ts`, `migrations.ts`: schema v3 types, strict parsers, reference integrity, and migration.
- `fixtures/contracts/snapshot.v3.json`: TypeScript/Rust schema-v3 parity fixture.
- `crates/project-io/src/model.rs`: Rust schema-v3 model, strict Serde and validation.
- `crates/project-io/src/project.rs`: guarded migration, typed journal replay, normalized SQLite rows, recovery.
- `crates/desktop-host/src/dto.rs`, `state.rs`: native request validation and schema-v3 session publication.
- `apps/studio/src/backend/tauri-backend.ts`: schema-v3 native response validation.
- `packages/asset-pipeline/`: pure media and PlanReference import policy.
- `packages/project-store/src/snapshot-records-command.ts`: allowlisted reversible record patch.
- `packages/project-store/src/project-store.ts`: transactional record-patch entry point.
- `docs/superpowers/specs/2026-07-22-aethertwin-m2-*.md`: approved M2 architecture.
- `docs/superpowers/plans/2026-07-22-aethertwin-m2-1-assets-calibration.md`: original 14-task M2.1 implementation plan.

The following current documents are stale and still describe M1/schema v2 as the present boundary: `README.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT_FORMAT.md`, `docs/DECISIONS.md`, `docs/PRODUCT_SPEC.md`, and `docs/ROADMAP.md`.

## 8. Fixed technical decisions and reasons

1. **Vertical slices, not horizontal platform work.** Every visible control must already have a typed model, reversible command, durable native representation, recovery, and tests.
2. **CommandBus is the only durable mutation path.** It preserves one transaction, journal, undo/redo, checkpoint, and recovery model.
3. **Schema v3 is current.** New projects are v3; v1/v2 upgrade deterministically before session publication. Failure rollback is supported; user-visible down-migration from v3 is not.
4. **Project bytes stay outside SQLite.** SQLite holds metadata and normalized records; immutable files use `assets/sha256/<prefix>/<digest>.<ext>`.
5. **No native paths cross into rendering.** Asset reads are keyed by session and asset ID.
6. **M2.1 command surface becomes exactly eight only at import Task 6.** It adds `import_project_asset` and `cancel_project_asset_import` to the existing six. Asset reads use `aethertwin-asset://`, not another invoke command.
7. **Undo never deletes immutable bytes.** A record may disappear while bytes remain for redo; orphan pruning is out of M2.1.
8. **Import completion and cancellation race to one terminal result.** Operation UUID and session ownership are mandatory.
9. **Approved M2.4 scene defaults are normative.** Current code/fixture values (`#10151c`, white lights) conflict with the approved values (`#101820`, ambient `#dce8f0` at `0.55`, key `#fff1dc` at `1.1`, direction `[4,8,5]`). Correct TypeScript, Rust, fixtures, and v2-to-v3 migration before more v3 artifacts are created. Do not add an in-place v3-to-v3 hidden migration.
10. **CSP must be enabled before custom asset resolution.** Production CSP is an object allowlist: `default-src 'self'`; Tauri IPC only in `connect-src`; `aethertwin-asset:` and Windows/Android `http://aethertwin-asset.localhost` only in `img-src`/`media-src`; local inline styles only; `object-src`, `frame-src`, and `base-uri` disabled. Never enable Tauri's broad built-in asset protocol scope. Tauri documents that CSP protection is active only when configured and that Windows custom protocols use an HTTP localhost origin.
11. **No authentication subsystem is required for this local desktop milestone.** The authorization boundary is Tauri capability + session ownership + project lock. No token or credential belongs in localStorage; current localStorage use is limited to optional recent-project preferences.

Official security references used for decision 10:

- <https://v2.tauri.app/security/csp/>
- <https://v2.tauri.app/security/>
- <https://docs.rs/tauri/latest/tauri/plugin/struct.Builder.html>

## 9. Rejected approaches and reasons

- UI/3D mocks before persistence: violates No Fake Features and delays integration evidence.
- Broad frontend filesystem or Tauri asset-protocol scope: exposes arbitrary user files and bypasses the session/asset record boundary.
- Persisting absolute source paths, source filenames, `file://`, remote URLs, or BLOBs: breaks portability, privacy, and offline integrity.
- Generic JSON Pointer/field patch commands: bypass typed collection validation and safe recovery replay.
- New invoke command for asset reads: expands the command surface and duplicates the custom protocol.
- Overwriting a digest destination: destroys content-addressed immutability; a mismatch is a hard collision.
- Automatic orphan-byte deletion on undo: breaks redo and introduces dangerous concurrent cleanup.
- Silent profile mutation: `showroom` and `market` are immutable; future conversion needs an explicit migration.
- Weakening ESLint/rustfmt/policy assertions to hide failures: gates must reflect the current schema and code.
- Leaving `security.csp` null or using `*`/`unsafe-eval`: unacceptable before loading user-selected media.
- Rebasing onto `origin/master` during feature work: remote and local master histories have unresolved divergence.

## 10. Known issues and reproduction

### K1 — frozen install fails

Command:

```powershell
pnpm.cmd install --frozen-lockfile
```

Result: `ERR_PNPM_OUTDATED_LOCKFILE`. `packages/asset-pipeline/package.json` adds `@aethertwin/core-model@workspace:*`, but its importer is missing from `pnpm-lock.yaml`.

Origin: introduced by M2 Task 3; the package was committed without the lockfile update.

### K2 — project-format policy is stale

Command:

```powershell
node --test tests/workspace-structure.test.mjs tests/visible-actions.test.mjs tests/project-format-policy.test.mjs tests/offline-source-policy.test.mjs
```

Result: 16/18 pass. Failures:

- `project format is relative-path metadata, never embedded media`
- `TypeScript, Rust, fixture, and documentation agree on schema v2`

Root cause: the unchanged policy searches for old `parseRelativePath` and schema v2. Production v3 deliberately uses exact content-addressed path validation in `parseAssetV3`; this is policy/document drift, not a path-validation bypass.

Origin: branch-introduced mismatch after Task 1.

### K3 — recursive build fails

Command:

```powershell
pnpm.cmd build
```

Result: Player and several packages build, then `@aethertwin/render-plan-2d` fails with four `TS2322` errors. `pixi-plan-renderer.test.ts` and `scene-projection.test.ts` still create `ProjectSnapshotV2` with `parseSnapshotV2` where `ProjectSnapshot` now requires v3. The equivalent Studio fixtures already use `parseSnapshotV3`.

Origin: branch-introduced schema-v3 compatibility gap. The recursive build stops at the first failed package, so Studio build was not reached.

### K4 — ESLint fails

Command:

```powershell
pnpm.cmd lint
```

Result: 75 errors. Line-level `git blame` classification:

- 37 errors existed on local `master`.
- 38 errors were introduced on this branch, mainly explicit `any` in new core-model tests plus one control-character regex in `asset-pipeline`.

Do not change ESLint rules. Refactor tests and source so the full command becomes green.

### K5 — rustfmt check fails

Command:

```powershell
cargo fmt --all -- --check
```

Result: exit 1. All eight failing files are branch-modified:

- `crates/desktop-host/src/dto.rs`
- `crates/desktop-host/src/state.rs`
- `crates/desktop-host/tests/command_contract.rs`
- `crates/project-io/src/model.rs`
- `crates/project-io/src/project.rs`
- `crates/project-io/tests/commit_recovery.rs`
- `crates/project-io/tests/contract_fixture.rs`
- `crates/project-io/tests/create_open.rs`

### K6 — scene environment default contradicts approved M2.4

Reproduction:

```powershell
rg -n "DEFAULT_SCENE_ENVIRONMENT|impl Default for SceneEnvironment|sceneEnvironment" packages/core-model/src/model.ts crates/project-io/src/model.rs fixtures/contracts/snapshot.v3.json docs/superpowers/specs/2026-07-22-aethertwin-m2-4-synchronized-3d-design.md
```

The current TS/Rust/fixture values agree with each other but not with the approved design. Resolve before asset work.

### K7 — Task 4 review is incomplete

Review `97f71c54..da9cd919` against Task 4 in the approved implementation plan. The implementer report is not independent acceptance.

### K8 — real runtime evidence is absent

No dev server, Tauri runtime, browser, Playwright, packaged application, screenshot, or GPU/WebGL execution was run. This is not a functional failure, but no visual/runtime claim is allowed.

## 11. Current test baseline

Commands below were actually run during this handoff. Unlisted commands are not claimed.

| Command | Actual result |
| --- | --- |
| `pnpm.cmd vitest run packages/core-model/src/core-model.test.ts packages/asset-pipeline/src/asset-pipeline.test.ts packages/project-store/src/snapshot-records-command.test.ts packages/project-store/src/project-store.test.ts apps/studio/src/backend/tauri-backend.test.ts apps/studio/src/features/plan-editor/interaction-controller.test.ts apps/studio/src/features/plan-editor/plan-canvas.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx` | 8/8 files, 311/311 tests passed |
| Four focused `tsc --noEmit` commands for core-model, asset-pipeline, project-store, and Studio | all four exit 0 |
| `cargo test -p project-io` | 85 tests passed, 0 failed; doc tests 0 |
| `cargo test -p desktop-host` | 26 tests passed, 0 failed; doc/main targets 0 |
| `cargo check -p project-io -p desktop-host` | exit 0 |
| Four Node policy files | 16/18 passed; K2 explains both failures |
| `pnpm.cmd lint` | exit 1, 75 errors; 37 baseline and 38 branch-introduced |
| `cargo fmt --all -- --check` | exit 1, eight branch-modified files |
| `pnpm.cmd build` | exit 1 at render-plan-2d with four schema-v2/v3 TS2322 errors |
| `pnpm.cmd install --frozen-lockfile` | exit 1 with outdated lockfile |
| `git diff --check master...HEAD` before handoff docs | exit 0 |

Build/dev/debug/browser/Playwright/packaging/packaged-runtime/screenshot/GPU validation was otherwise skipped. The one `pnpm.cmd build` above was explicitly run for this handoff and did not launch an application or browser.

## 12. Environment and dependency notes

- Verified environment: Node `v24.14.0`, pnpm `11.9.0`, Cargo `1.94.1`, rustc `1.94.1`, Git `2.43.0.windows.1`.
- `node_modules/` and `target/` exist locally but are ignored build caches, not commit inputs.
- Standard install must be `pnpm.cmd install --frozen-lockfile`; it is currently blocked by K1.
- Cargo workspace currently has only `project-io` and `desktop-host`. `asset-io` is still a placeholder and must be added only in its task.
- Tauri capability is currently exactly `core:window:default` plus `dialog:allow-open`.
- Current native invoke surface is exactly six commands.
- The repository root contains `.env*` files unrelated to AetherTwin. They were not read and must never be staged or copied.
- `README.md` and several current-state docs are stale; approved M2 specs and code are authoritative until the documentation repair task completes.
- Existing graphify data predates M2 Tasks 1-4. It confirms the stable Studio -> ProjectStore -> CommandBus -> Tauri -> desktop-host -> project-io chain, but Git and current tests are authoritative for v3.

## 13. Highest-risk areas

1. **Native asset boundary on Windows:** source replacement, symlink/reparse points, delete sharing, no-replace publication, fsync, collision verification, and cancellation/completion races.
2. **Schema/persistence parity:** TypeScript, Rust, fixture, journal payload, normalized SQLite rows, undo/redo, checkpoint, reopen, and recovery must remain exact.
3. **Custom protocol security:** session ownership, asset membership, same-handle size/digest verification, range handling, invalidation, redaction, CSP, and no broad filesystem scope.
4. **Branch integration:** local master is not equivalent to origin/master.
5. **Validation debt:** frozen install, policy, build, lint, and rustfmt are red despite focused behavior tests being green.
6. **Unreleased v3 defaults:** changing the scene default is safe only if no external schema-v3 project must preserve the current provisional default.

No architecture contradiction was found in the core mutation chain. Migration rollback is tested for publication failure, but migration is not a general user downgrade. Current concurrency is serialized at ProjectStore/Tauri/session lifecycle boundaries; the new import operation registry and cancellation race do not exist yet and must be proven before import UI appears.

## 14. Spark must confirm before work

Spark must read `AGENTS.md`, this file, `PLANS.md`, the M2 umbrella/M2.1 specs, and the existing M2.1 implementation plan. Then confirm:

1. branch is `codex/aethertwin-m2`;
2. HEAD contains `da9cd919`;
3. uncommitted files are only the handoff documents, or the handoff-doc commit is already present;
4. local `master` remains the baseline and no rebase/merge will occur;
5. Task 4 independent review is still unclosed;
6. no important external schema-v3 projects rely on the provisional scene-environment defaults;
7. build/dev/browser/Playwright/packaging/screenshot approval is not inherited from this conversation.

Only items 6 and eventual branch integration require human confirmation. If item 6 cannot be confirmed, stop before changing scene defaults and ask the human whether existing v3 artifacts must be migrated.

## 15. First concrete next operation

Do not edit code first. Complete the independent Task 4 review:

```powershell
git status --short --branch
git diff --check 97f71c54..da9cd919
git diff --stat 97f71c54..da9cd919
git diff 97f71c54..da9cd919 -- aethertwin/packages/project-store/src aethertwin/crates/project-io aethertwin/crates/desktop-host/src/dto.rs aethertwin/crates/desktop-host/tests/command_contract.rs
```

Compare that diff with Task 4 in `docs/superpowers/plans/2026-07-22-aethertwin-m2-1-assets-calibration.md`. Review exact payload shape, collection allowlist, before/index semantics, inverse normalization, transaction atomicity, normalized row parity, recovery replay, and DTO error mapping. Record Critical/Important/Minor findings. Fix Critical/Important findings with focused tests before proceeding to PLANS.md Task 2.
