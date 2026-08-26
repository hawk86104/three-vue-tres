# AetherTwin engineering handoff

Updated: 2026-08-26
Product workspace: `aethertwin/`
Active branch: `codex/aethertwin-baseline-20260826`
Local Web Demo source baseline: `5f49ace12d7226a9a3eace727b90f87c6aa73f13` (the Task 5 closure commit hash is intentionally not invented before commit)
Portable preview internal baseline source: `988b16dfc548823b333be4401b9940a410043834` (retained ignored ZIP)

## 1. Current outcome

M0 through M2.5 are accepted and M2 is closed. The dedicated Local Web Demo source implementation and Task 5 source gate are complete, and Task 6 localhost/browser/WebGL runtime acceptance passed under explicit approval.
The retained Windows portable preview completed its separately approved package,
bilingual Edge/Chrome runtime, WebGL fail-closed, integrity, and shutdown
acceptance on 2026-08-26.

Showroom defaults to 2D, supports synchronized 3D plus fixed 50/50 split, and exports project-bound PNG through two fixed presets. Market remains 2D-only with no Export action. Player remains deferred.

Normative plans:

- M2.4: `docs/superpowers/plans/2026-08-03-aethertwin-m2-4-synchronized-3d.md`
- M2.5: `docs/superpowers/plans/2026-08-09-aethertwin-m2-5-export-demo-evidence.md`
- Local Web Demo design: `docs/superpowers/specs/2026-08-14-aethertwin-local-web-demo-design.md`
- Local Web Demo plan: `docs/superpowers/plans/2026-08-14-aethertwin-local-web-demo.md`
- Portable preview design: `docs/superpowers/specs/2026-08-15-aethertwin-portable-web-demo-design.md`
- Portable preview plan: `docs/superpowers/plans/2026-08-15-aethertwin-portable-web-demo.md`

The ignored execution ledger `.superpowers/sdd/progress.md` is the authoritative task-by-task implementation/review record.

## 2. Branch, baseline, and integration guard

The original M2.5 closure checkpoint recorded `57 2` and carried the explicit
guard: do not rebase, merge, or reset either history without a human integration
decision. That approval was granted for this baseline operation. After the
required remote refresh, the actual pre-integration divergence was `57 16`.

The maintainable integration branch `codex/aethertwin-baseline-20260826`
starts from the accepted AetherTwin source `988b16df` and contains an explicit
non-fast-forward merge of `origin/master` at `e3e79cba`. Before that merge,
local `master` was 57 commits ahead and 16 behind the refreshed remote, while
`codex/aethertwin-m2` was exactly 193 commits ahead of local `master`. The
integration branch preserves both histories without rebase, squash,
cherry-pick, or force-push.

Local `master` and `origin/master` intentionally remain unmoved until the
baseline PR is reviewed. Merge that PR with a merge commit only; after approval,
refresh and fast-forward local `master` to the resulting `origin/master`.

## Bilingual Studio UI source closure

Studio defaults to Simplified Chinese, with English selectable through the
visible language control. Normal Studio stores the selection at
`aethertwin.studio.locale.v1`; absent, malformed, or inaccessible storage falls
back to Simplified Chinese. Web Demo and portable preview retain locale only in
memory and reset to Simplified Chinese on refresh or a fresh session.

Localization is presentation-only. Author-provided names, IDs, paths, command
payloads, persisted project data, and operation lifecycle state remain stable.
Known stable errors map to safe bilingual copy and unknown errors use the
generic fallback; raw error text, paths, details, stacks, and untrusted
diagnostic references are not displayed. Developer galleries, tests, internal
logs, and the portable-host console are excluded.

The bilingual rollout's source-only gate is recorded in
`docs/superpowers/reports/2026-08-20-aethertwin-bilingual-ui-report.md`.
The separately approved 2026-08-26 portable run then verified Simplified
Chinese by default, live English switching, refresh reset, editor 2D/3D/split
copy, disabled Export copy, and the WebGL fallback state in installed Edge and
Chrome. It is bounded evidence for this machine and artifact, not a Firefox,
macOS, ARM64, screenshot, cross-device visual, or performance result.

## 3. Locked contracts

- Project schema remains v3; M2.4 adds no SQLite storage migration.
- Native invoke count is exactly twelve; desktop capabilities remain exactly two.
- Desktop capability list is unchanged.
- Showroom view modes are `2d`, `3d`, and fixed `split`, default `2d`.
- Market remains 2D-only.
- Camera, view mode, renderer status/error, selection, and previews are transient Zustand state.
- Materials, assignments, environment, and all other business data are durable ProjectStore snapshot state.
- ProjectStore owns asset source leases. In the dedicated Web Demo, `SandboxProjectBackend` alone creates and revokes seeded asset Blob URLs.
- Three.js/R3F owns only transient renderer resources and never owns or mutates business data.
- Material textures are project-bound PNG, JPEG, or sanitized SVG only.
- No remote runtime assets, durable absolute paths, CDN fallback, or generic filesystem read surface exists.

## 4. Implemented M2.4 surface

The 3D projection covers:

- space-unit/zone floors;
- walls and door/window openings;
- all seven showroom fixture catalogue kinds;
- compatible generic fixtures;
- product hotspots;
- the active valid guided route.

Materials resolve deterministically for space floors, walls, and fixtures. Missing/failed textures retain `baseColor`. The singleton scene environment is durable and changes through strict reversible `scene.environment.patch`.

Renderer records use stable keys and incremental reconciliation. New records attach before old records retire. Async texture completions are generation guarded. Geometry, materials, textures, and temporary targets are released exactly once by the renderer resource registry; ProjectStore source leases are released only through the ProjectStore source port, while the dedicated Web Demo backend owns its seeded asset Blob URLs.

An initial WebGL creation failure now fails closed before partial 3D
publication: Studio returns to a complete 2D view, disables 3D/split, and
exposes a localized explicit retry. Context loss gets one automatic recovery
attempt. A further failure moves the renderer to `disabled`; explicit retry
starts a fresh recovery round.

M2.4 exposes the immutable camera/offscreen `SceneExportPort` for M2.5. It does not expose an Export control or create export artifacts.

## 5. Actual Task 17 evidence

The following evidence actually passed:

| Scope | Result |
| --- | --- |
| Studio M2.4 acceptance | 4/4 |
| ProjectStore M2.4 acceptance | 1/1 |
| render-scene-3d resource acceptance | 2/2 |
| project-io M2.4 acceptance | 1/1 |
| schema-v3 recovery | 8/8 |
| scene-environment replay | 6/6 |
| desktop-host command contract | 21/21 |
| TypeScript | three focused checks passed |
| Rust formatting | rustfmt check passed |
| Rust compile | Cargo check passed |

Independent final re-review reported no Critical, Important, or Minor findings. No production code changed in Task 17.

## 6. Task 18 state

The full non-build gate passed after one attributable lint repair:

| Command | Actual result |
| --- | --- |
| `pnpm.cmd install --frozen-lockfile` | exit 0; 14 workspace projects; already up to date |
| first `pnpm.cmd lint` | exit 1; eight issues introduced by M2.4 Tasks 5/16/17 |
| repaired `pnpm.cmd lint` | exit 0 after minimal fixes in five files |
| `pnpm.cmd typecheck` | exit 0; 13 of 14 workspace projects completed |
| `node --test tests/*.test.mjs` | exit 0; 32/32 |
| `pnpm.cmd vitest run` | exit 0; 68 files / 1,355 tests |
| `cargo fmt --all -- --check` | exit 0 |
| `cargo test -p asset-io -p project-io -p desktop-host` | exit 0; 208 passed, 1 approved ignored |
| `cargo check -p asset-io -p project-io -p desktop-host` | exit 0 |

The ignored Rust case is the approved Windows privileged reparse/symlink test; the deterministic reparse-bit unit test passed. Vitest emitted the known non-failing JSDOM `HTMLCanvasElement.getContext` notice; it is not browser/GPU evidence.

The earlier focused workspace-structure retry exposed documentation compatibility regressions and ultimately passed 12/12; the full Node policy gate then passed 32/32. Schema v3, exactly eight commands, and both protected hashes remain unchanged.

Final independent review passed with no findings: Spec Compliance Pass; Code/Doc Quality Approved; Critical/Important/Minor None; Ready Yes. Task 18 and M2.4 are accepted and closed.
## 7. Implemented M2.5 surface and evidence

The Showroom-only Export panel offers `full-hd` 1920 x 1080 and capability-gated `ultra-hd` 3840 x 2160. It captures only a ready/current immutable scene/camera/provenance, waits for sorted textures, streams top-left rows in bounded chunks, encodes opaque sRGB PNG, and publishes without overwrite under the verified project `exports/` directory. The result is project-relative `exports/<name>.png` plus dimensions, `byteSize`, and `sha256`.

ProjectStore remains the business-state owner. Transient Studio/R3F owns renderer and progress state; `media-export` owns PNG codec/validation; `project-io` owns paths/staging/publication. Schema remains v3 and storage migration 1 remains the only migration. Sandbox export, Player, Market 3D/export, publish, MP4, and `.twinpack` are absent.

Task 18's final gate passed 13/13 focused Vitest, three TypeScript checks, media-export 12/12, project-io 2/2, desktop-host 1/1, four-crate all-targets Cargo check, rustfmt, and diff check. Independent re-review returned Spec Compliance Pass; Code Quality Approved; Critical/Important/Minor 0; Ready Yes. Details and explicit runtime exclusions are in `docs/M2_REPORT.md`.

Task 19's policy gate passed 45/45 and `git diff --check` exited 0. Its independent documentation re-review returned Pass / Approved / Ready Yes with no Critical, Important, or Minor finding.

Task 20's final reviewed gate passed frozen install for 15 workspace projects, lint, typecheck across 14/15 workspace projects, Node 45/45, Vitest 77/77 files and 1,500/1,500 tests, rustfmt, Rust 302 passed with 2 approved privileged-Windows tests ignored, four-crate all-targets Cargo check, and diff check. Its final independent review returned Spec Compliance Pass, Code Quality Approved, Critical/Important/Minor None, and Ready Yes. Schema v3, exactly 12 native commands, exactly 2 desktop capabilities, the Showroom Demo digest, and both protected manifest hashes remain verified.


## 8. Local Web Demo runtime state

Tasks 1-4 are committed at the recorded source baseline. The dedicated Vite mode mounts `WebDemoApp` through the sole `StudioRoot` fork, verifies the canonical Showroom snapshot and four bundled assets before publication, and opens a fresh in-memory `SandboxProjectBackend`/ProjectStore session. Ordinary `App`, `selectBackend()`, Tauri commands, capabilities, schema, and desktop export remain unchanged.

The configured command is `pnpm.cmd --filter @aethertwin/studio web-demo` and the configured address is `http://127.0.0.1:4173`. The Web Demo defaults to 2D, reuses 3D/split, resets on Back/Retry/refresh, and keeps Export disabled because PNG publication is desktop-only. It has no browser persistence, service worker, native dialogs, supported `file://` launch, or browser export.

Task 5's non-build gate passed on the current source/docs: lint exited 0; typecheck exited 0 across 14/15 workspace projects; Node policy passed 51/51; Vitest passed 81/81 files and 1,542/1,542 tests; and `git diff --check` exited 0 with only preserved line-ending warnings.

The first lint run exited 1 on one Web Demo test type-only import. The first Node run passed 50/51 and exposed a stale deferred-action policy that did not permit the single exact truthful disabled-export notice; the focused repair passed 7/7 before the complete 51/51 rerun. Vitest emitted only the known non-failing JSDOM canvas notices, which are not browser/GPU evidence.

Independent Task 5 source review identified four Important and two Minor findings. Duplicate seed paths, duplicate manifest consumption, strict port binding, Blob URL ownership wording, HANDOFF ordering, and the recorded commit scope were corrected; the three behavioral repairs each had a focused failing RED followed by GREEN. Clean re-review returned Critical/Important/Minor 0, Spec Compliance Pass, Code Quality Approved, Ready Yes.

Task 6 then ran under explicit runtime approval. The dedicated build exited 0 after transforming 3,215 modules and emitted relative assets. Vite bound the strict address `http://127.0.0.1:4173`. Headed Chromium verified the canonical inventory, 2D/3D/fixed split, shared selection and floor, disabled desktop-only Export, fresh Back/refresh behavior, WebGL2, one automatic context reconstruction, and second-loss fallback to a complete interactive 2D pane. All 181 recorded requests were loopback or same-origin Blob URLs; localStorage, sessionStorage, and cookies were empty. The final browser console contained zero errors, and the controlled server was shut down after acceptance. No screenshot was captured and no cross-device visual-correctness or performance claim is made.

Runtime findings were repaired with focused RED/GREEN coverage: canonical assets bypass Vite inlining, Pixi receives explicit SVG parser metadata, deterministic 2x2 raster fixtures upload to WebGL, R3F recovery waits for the retired nested root, the supported shadow mode is used, and the shell provides a local favicon. Final gates passed lint, typecheck for 14/15 workspace projects, Node 53/53, Vitest 82/82 files and 1,547/1,547 tests, the final build, and diff checks.


## 9. Windows portable preview accepted state

Tasks 1-3 remain anchored by host commit `74b59244`, assembler hardening
`d37644f6`, source handoff `fe229e03`, and clean review repair `a4a2dc92`.
The earlier Task 4 package acceptance on 2026-08-20 was followed by bilingual
UI acceptance and the fail-closed WebGL repair. The current retained baseline
was accepted on 2026-08-26 at source `988b16df`.

The exact entry point remains `pnpm.cmd package:web-demo:win-x64`; it is not an
install, test, postinstall, or ordinary build hook. The fixed baseline metadata
is:

- artifact: `AetherTwin-Preview-win-x64.zip`;
- version: `0.1.0`;
- size: `2,595,766` bytes;
- SHA-256: `CCC76399566C1056C949D7312333A554A6C791088BEBA6185BD214120D59BADF`;
- source: `988b16dfc548823b333be4401b9940a410043834`;
- accepted: `2026-08-26`;
- status: internal, unsigned, Windows x64 preview baseline;
- annotated source tag: `aethertwin-preview-v0.1.0-internal.20260826`.

The ignored ZIP is retained at `artifacts/AetherTwin-Preview-win-x64.zip` and
is not committed or publicly released. Its six fixed root entries, 27 total
archive entries, all 26 payload checksums, `BUILD_INFO.json`, all relative HTML
references, and ordinary-file containment verified after extraction to a path
containing Chinese characters and spaces.

With PATH limited to Windows system tools, the EXE had no Node.js or pnpm child
process. It bound `127.0.0.1:4173` when free and `127.0.0.1:57448` during the
controlled occupied-port run. Automated sessions with installed Edge and
Chrome verified Simplified Chinese by default, live English switching,
canonical 2D, synchronized 3D, fixed split, shared selection,
Back/refresh/restart reset, disabled desktop-only Export, and WebGL2. Recorded
requests were only loopback or owned Blob URLs; browser storage remained empty.
Stopping the console ended the host and released both tested listeners.

Source `988b16df` repairs initial WebGL creation so it fails closed rather than
publishing a partial or stuck 3D state. With WebGL2 deliberately unavailable,
the app returned automatically to an interactive 2D view, disabled 3D/split,
showed `3D 预览不可用` and `重试 3D`, and remained stable after retry. The
Three.js context-creation errors observed during this injection are expected;
normal Edge and Chrome paths had no unexpected console errors.

Final source bytes passed lint, 14/15 workspace typechecks, Node policy 80/81
with one Windows symlink-privilege skip, Vitest 94/94 files and 1,720/1,720
tests, Rust fmt/check, all 18 host tests, and `git diff --check`. Temporary
staging, extraction, browser-cache, and runtime processes were removed; the
verified ZIP alone remains ignored. This is bounded evidence for this machine
and installed Edge/Chrome versions; no screenshot, signing, installer, external
distribution, Firefox/macOS/ARM64 support, cross-device certification, or
performance result is claimed.

## 10. Protected files

Do not modify, format, restore, stage, or commit these user-protected working-tree entries:

- `crates/asset-io/Cargo.toml` — SHA-256 `9D22219E9F87C64E34BD201446C6CC2DC05EE91372C11C60A0D3FFA692DE7606`
- `crates/desktop-host/Cargo.toml` — SHA-256 `3713E909384117E3D3E8D63B246642A44FFEA51F90CCAF4D64B4C601B6C5900E`
- `packages/mode-showroom/src/index.ts`: preserved pre-existing working-tree entry; no Web Demo content change

The Local Web Demo and portable-preview scopes exclude all three entries. Their
original worktree modifications remain untouched and must not enter the
baseline PR.

## 11. Explicit exclusions

M2.5 does not include:

- publish UI, MP4 output, `.twinpack`, or export formats beyond the two fixed PNG presets;
- Player, kiosk mode, visitor themes, or Market 3D;
- GLTF import/export, arbitrary lights/shaders, or 3D geometry editing;
- remote runtime media/services, telemetry, CDN fallback, or business APIs;
- cross-device visual-correctness or performance certification.

Build, dev/debug, browser, Playwright, packaging, packaged-runtime, screenshot, and real-GPU commands remained excluded from Task 20's earlier non-build gate.
Local Web Demo Task 6 and portable Task 4 are separate, explicitly approved runtime gates; neither adds signing, external distribution, or cross-device claims.

## 12. Next operation

The internal preview baseline is retained and identified by
`aethertwin-preview-v0.1.0-internal.20260826`. The next operation is human
review of `codex/aethertwin-baseline-20260826` against `master`. Do not
squash, rebase, force-push, publish the ZIP, or move local `master` before that
review; after an approved merge, synchronize local `master` with
`git merge --ff-only origin/master`.
