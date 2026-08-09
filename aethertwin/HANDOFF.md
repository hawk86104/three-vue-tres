# AetherTwin engineering handoff

Updated: 2026-08-09
Product workspace: `aethertwin/`
Active branch: `codex/aethertwin-m2`
Current implementation baseline: `56583fe4`

## 1. Current outcome

M0 through M2.4 are accepted and closed. Task 18's full non-build gate passed, and final independent review passed with no findings: Spec Compliance Pass; Code/Doc Quality Approved; Critical/Important/Minor None; Ready Yes.

Showroom defaults to 2D and supports synchronized 3D plus fixed 50/50 split. Market remains 2D-only. The next product milestone is M2.5 export/demo/evidence, which requires a separately approved implementation plan.

Normative M2.4 plan:

- `docs/superpowers/plans/2026-08-03-aethertwin-m2-4-synchronized-3d.md`

The ignored execution ledger `.superpowers/sdd/progress.md` is the authoritative task-by-task implementation/review record.

## 2. Branch, baseline, and integration guard

The active branch remains `codex/aethertwin-m2` with local `master` as its baseline. Current `git rev-list --left-right --count master...origin/master` is `57 2`: local `master` and `origin/master` remain unresolved and diverged.

Do not rebase, merge, reset, or change the baseline during this handoff. Final integration of the divergent local and remote histories is a human decision.

## 3. Locked contracts

- Project schema remains v3; M2.4 adds no SQLite storage migration.
- Native invoke count remains exactly eight.
- Desktop capability list is unchanged.
- Showroom view modes are `2d`, `3d`, and fixed `split`, default `2d`.
- Market remains 2D-only.
- Camera, view mode, renderer status/error, selection, and previews are transient Zustand state.
- Materials, assignments, environment, and all other business data are durable ProjectStore snapshot state.
- ProjectStore is the only Blob URL owner.
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

Renderer records use stable keys and incremental reconciliation. New records attach before old records retire. Async texture completions are generation guarded. Geometry, materials, textures, and temporary targets are released exactly once by the renderer resource registry; ProjectStore-owned Blob URLs are released only through the ProjectStore source port.

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

## 7. Protected files

Do not modify, format, restore, stage, or commit these user-protected manifests:

- `crates/asset-io/Cargo.toml` — SHA-256 `9D22219E9F87C64E34BD201446C6CC2DC05EE91372C11C60A0D3FFA692DE7606`
- `crates/desktop-host/Cargo.toml` — SHA-256 `3713E909384117E3D3E8D63B246642A44FFEA51F90CCAF4D64B4C601B6C5900E`

Task 18 implementation did not stage or commit files. The controller or human integrator owns any eventual closure commit and branch integration.

## 8. Explicit exclusions

M2.4 does not include:

- Export/publish UI, PNG/MP4 output, `.twinpack`, or completed demo/evidence generation;
- Player, kiosk mode, visitor themes, or Market 3D;
- GLTF import/export, arbitrary lights/shaders, or 3D geometry editing;
- remote runtime media/services, telemetry, CDN fallback, or business APIs;
- real-browser, real-GPU, visual-correctness, or performance validation.

Build, dev/debug, browser, Playwright, packaging, packaged-runtime, screenshot, and real-GPU commands remain excluded by project rule and are not part of Task 18's authorized non-build gate.

## 9. Next operation

M2.4 is closed. The next operation is a separate higher-reasoning M2.5 specification and atomic implementation plan. M2.5 implementation has not started; do not add M2.5 UI from this handoff.
