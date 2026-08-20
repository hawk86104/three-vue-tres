# AetherTwin engineering handoff

Updated: 2026-08-15
Product workspace: `aethertwin/`
Active branch: `codex/aethertwin-m2`
Local Web Demo source baseline: `5f49ace12d7226a9a3eace727b90f87c6aa73f13` (the Task 5 closure commit hash is intentionally not invented before commit)
Portable preview Task 3 source commit: `fe229e03` (host, assembler, source gates, and handoff; no generated package)

## 1. Current outcome

M0 through M2.5 are accepted and M2 is closed. The dedicated Local Web Demo source implementation and Task 5 source gate are complete, and Task 6 localhost/browser/WebGL runtime acceptance passed under explicit approval.
The Windows portable-preview host and assembler source are implemented and independently reviewed; package creation and runtime acceptance have not run.

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

The active branch remains `codex/aethertwin-m2` with local `master` as its baseline. Current `git rev-list --left-right --count master...origin/master` is `57 2`: local `master` and `origin/master` remain unresolved and diverged.

Do not rebase, merge, reset, or change the baseline during this handoff. Final integration of the divergent local and remote histories is a human decision.

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

A WebGL failure leaves 2D intact. Context loss gets one automatic recovery attempt. A further failure moves the renderer to `disabled`; explicit retry starts a fresh recovery round.

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

Task 6 then ran under explicit runtime approval. The dedicated build exited 0 after transforming 3,215 modules and emitted relative assets. Vite bound the strict address `http://127.0.0.1:4173`; the controlled server is intentionally still running for the requested preview. Headed Chromium verified the canonical inventory, 2D/3D/fixed split, shared selection and floor, disabled desktop-only Export, fresh Back/refresh behavior, WebGL2, one automatic context reconstruction, and second-loss fallback to a complete interactive 2D pane. All 181 recorded requests were loopback or same-origin Blob URLs; localStorage, sessionStorage, and cookies were empty. The final browser console contained zero errors. No screenshot was captured and no cross-device visual-correctness or performance claim is made.

Runtime findings were repaired with focused RED/GREEN coverage: canonical assets bypass Vite inlining, Pixi receives explicit SVG parser metadata, deterministic 2x2 raster fixtures upload to WebGL, R3F recovery waits for the retired nested root, the supported shadow mode is used, and the shell provides a local favicon. Final gates passed lint, typecheck for 14/15 workspace projects, Node 53/53, Vitest 82/82 files and 1,547/1,547 tests, the final build, and diff checks.


## 9. Windows portable preview source state

The standard-library loopback host is committed through `74b59244`; the
assembler is committed through `d37644f6`. Both received independent review;
the assembler re-review returned Critical 0, Important 0, and Ready Yes.
The scoped Task 3 source-gate and handoff commit is `fe229e03`; review-status
repair `a4a2dc92` received clean independent re-review: Critical/Important/Minor
0, Spec Pass, Documentation Approved, Ready Yes.

The exact source entry point is `pnpm.cmd package:web-demo:win-x64`. It is not
an install, test, postinstall, or ordinary build hook and it has not been run
on this source baseline.

The intended internal, unsigned Windows 10/11 x64 ZIP contains the EXE, `app/`,
`README.txt`, `BUILD_INFO.json`, `SHA256SUMS.txt`, and the committed notices.
The target needs no Node.js, pnpm, or installer.

No package command, Web Demo build, Rust release build, ZIP, extraction,
EXE launch, portable localhost service, Edge/Chrome session, restricted-PATH,
network/storage/WebGL inspection, shutdown check, extracted checksum, or cleanup
has run for this portable target. The earlier Local Web Demo evidence above is
not portable EXE/ZIP evidence.

The approved non-build source-closure gate completed on 2026-08-20. Lint and
workspace typecheck exited 0; Node passed 71/72 tests with one
Windows-symlink-privilege skip; Vitest passed 82/82 files and 1,547/1,547 tests
with only the known JSDOM canvas notice; Rust fmt, host check, and all 17 host
tests exited 0. `git diff --check` first identified one extra EOF blank line in
`PLANS.md`; after that exact documentation repair it exited 0 with only
working-copy LF-to-CRLF warnings. These are source-level results only.

The next runtime approval must explicitly cover the exact package command,
extraction to a Chinese-and-space path, EXE launch, occupied-4173 fallback,
restricted PATH, Edge and Chrome, network/storage/WebGL checks, extracted-file
checksums, console shutdown, and safe cleanup of verified generated paths.


## 10. Protected files

Do not modify, format, restore, stage, or commit these user-protected working-tree entries:

- `crates/asset-io/Cargo.toml` — SHA-256 `9D22219E9F87C64E34BD201446C6CC2DC05EE91372C11C60A0D3FFA692DE7606`
- `crates/desktop-host/Cargo.toml` — SHA-256 `3713E909384117E3D3E8D63B246642A44FFEA51F90CCAF4D64B4C601B6C5900E`
- `packages/mode-showroom/src/index.ts`: preserved pre-existing working-tree entry; no Web Demo content change

The Local Web Demo and portable-preview scopes exclude all three entries. The human integrator still owns final branch integration.

## 11. Explicit exclusions

M2.5 does not include:

- publish UI, MP4 output, `.twinpack`, or export formats beyond the two fixed PNG presets;
- Player, kiosk mode, visitor themes, or Market 3D;
- GLTF import/export, arbitrary lights/shaders, or 3D geometry editing;
- remote runtime media/services, telemetry, CDN fallback, or business APIs;
- cross-device visual-correctness or performance certification.

Build, dev/debug, browser, Playwright, packaging, packaged-runtime, screenshot, and real-GPU commands remained excluded by project rule and were not part of Task 20's authorized non-build gate.
Local Web Demo Task 6 is the separate localhost browser/WebGL gate recorded above; it does not add packaged-desktop or cross-device claims.

## 12. Next operation

Portable Task 3 source closure and independent review are complete. Obtain fresh explicit approval for `pnpm.cmd package:web-demo:win-x64` and the bounded Task 4 runtime acceptance listed above. Do not rebase, merge, reset, change the baseline, or resolve the `57 2` divergence without a human integration decision.
