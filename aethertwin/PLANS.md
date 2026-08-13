# AetherTwin executable continuation plan

This file records the current executable boundary. Detailed historical task evidence lives in the ignored `.superpowers/sdd/progress.md`; approved milestone plans remain under `docs/superpowers/plans/`.

## Completed milestones and task groups

- [x] M0 foundation
- [x] M1 unified 2D authoring
- [x] M2.1 assets and calibrated plan references
- [x] M2.2 building openings, room confirmation, and showroom fixture catalogue
- [x] M2.3 product content and guided routes
- [x] M2.4 Task 0 — plan baseline
- [x] M2.4 Task 1 — TypeScript scene environment command
- [x] M2.4 Task 2 — Rust environment replay
- [x] M2.4 Task 3 — material texture import role
- [x] M2.4 Task 4 — ProjectStore material texture transaction and issue state
- [x] M2.4 Task 5 — render-scene-3d package activation
- [x] M2.4 Task 6 — coordinates, floor projection, and fail-closed projection
- [x] M2.4 Task 7 — walls and openings
- [x] M2.4 Task 8 — fixtures, hotspots, and guided routes
- [x] M2.4 Task 9 — materials, UVs, environment, and selection overlay
- [x] M2.4 Task 10 — incremental reconciler and resource registry
- [x] M2.4 Task 11 — R3F renderer, camera, recovery, and M2.5 port
- [x] M2.4 Task 12 — transient Zustand view/camera/status and showroom actions
- [x] M2.4 Task 13 — synchronized 2D/3D/fixed-split integration
- [x] M2.4 Task 14 — durable material Inspector
- [x] M2.4 Task 15 — durable environment Inspector
- [x] M2.4 Task 16 — deterministic DEV scene gallery
- [x] M2.4 Task 17 — complete vertical acceptance and independent re-review
- [x] M2.4 Task 18 — documentation, full non-build gate, and final independent closure review complete; no findings

M2.4 Tasks 0-18 are complete and have no remaining TODO status. The accepted milestone record is `docs/superpowers/plans/2026-08-03-aethertwin-m2-4-synchronized-3d.md`.

## Locked M2.4 result

- schema remains v3; no M2.4 SQLite migration;
- native invoke count remains eight; desktop capabilities are unchanged;
- Showroom defaults to 2D and supports 3D plus fixed 50/50 split;
- Market remains 2D-only;
- ProjectStore owns every durable business record and every Blob URL lease;
- Zustand owns only transient camera/view/renderer/session state;
- Three/R3F owns no business data;
- 3D covers floors, walls/openings, seven fixture kinds, generic, hotspot, and guided route;
- material textures are local project-bound PNG/JPEG/sanitized SVG only;
- WebGL/decode failures preserve 2D/baseColor with bounded recovery;
- M2.5 receives only the immutable camera/offscreen export port;
- no Export, Player, Market 3D, GLTF, arbitrary light/shader, or 3D geometry editing exists.

## Task 18 closure gate

- [x] Frozen install: exit 0; 14 workspace projects; already up to date.
- [x] Lint: initial exit 1 on eight M2.4 Task 5/16/17 issues; five-file minimal repair; rerun exit 0.
- [x] Typecheck: exit 0; 13 of 14 workspace projects completed.
- [x] Node policy tests: exit 0; 32/32.
- [x] Vitest: exit 0; 68 files / 1,355 tests.
- [x] Rustfmt: exit 0.
- [x] Rust tests: exit 0; 208 passed / 1 approved ignored Windows privileged reparse/symlink test; deterministic reparse-bit unit test passed.
- [x] Cargo check: exit 0.
- [x] Schema v3, exact eight commands, and both protected hashes unchanged.
- [x] Final independent closure review: Spec Compliance Pass; Code/Doc Quality Approved; Critical/Important/Minor None; Ready Yes.

The earlier focused workspace-structure policy retry repaired documentation compatibility and ended at 12/12 before the full Node 32/32 pass. Vitest's known non-failing JSDOM `HTMLCanvasElement.getContext` notice is not browser/GPU evidence.

Task 18 and M2.4 are accepted and closed. Task 17 evidence remains separately recorded: Studio 4/4, ProjectStore 1/1, render-scene-3d 2/2, project-io M2.4 1/1, schema-v3 recovery 8/8, scene-environment replay 6/6, desktop-host command contract 21/21, three TypeScript checks, rustfmt, and Cargo check.

## M2.5 export, Demo, and evidence

- [x] Task 0 - approved plan baseline
- [x] Task 1 - pure exporter contracts and exact presets
- [x] Task 2 - bounded top-left RGBA row streaming
- [x] Task 3 - immutable renderer capture provenance
- [x] Task 4 - export preflight and frame validation
- [x] Task 5 - cancellable single-active coordinator
- [x] Task 6 - opaque sRGB PNG codec
- [x] Task 7 - verified export names, staging, and cleanup
- [x] Task 8 - project-bound streaming export operation
- [x] Task 9 - strict JSON and raw Tauri boundaries
- [x] Task 10 - exact twelve-command native success path
- [x] Task 11 - native cancellation, close, cleanup, and terminal races
- [x] Task 12 - desktop raw-byte adapter and explicit backend composition
- [x] Task 13 - Showroom Export action and capability policy
- [x] Task 14 - scope-safe current export port and real 16:9 host
- [x] Task 15 - controlled Export panel and cancellable workflow
- [x] Task 16 - deterministic Showroom Demo fixture and local assets
- [x] Task 17 - real create/import/commit/checkpoint/recovery Demo materialization
- [x] Task 18 - complete injected-renderer M2.5 vertical acceptance
- [x] Task 19 - truthful documentation/policy evidence assembly (45/45 GREEN; independent review Pass / Approved / Ready Yes)
- [x] Task 20 - full non-build gate, final review, closure documents, and closure commit

Tasks 0-20 are complete. M2.5 is accepted and M2 is closed while preserving schema v3, exactly twelve native commands, exactly two desktop capabilities, both protected manifest hashes, offline sources, Showroom-only export, Market 2D-only, and the unresolved `57 2` branch-integration guard.

## M2.5 Task 20 closure gate

- [x] Frozen install: exit 0; all 15 workspace projects already up to date.
- [x] Lint: exit 0.
- [x] Typecheck: exit 0 across 14 of 15 workspace projects.
- [x] Node policy: 45/45.
- [x] Vitest: 77/77 files and 1,500/1,500 tests; only known non-failing jsdom canvas notices.
- [x] Rustfmt and four-crate all-targets Cargo check: exit 0.
- [x] Rust tests: 302 passed; 2 approved privileged-Windows tests ignored.
- [x] Final review: Spec Compliance Pass; Code Quality Approved; Critical/Important/Minor None; Ready Yes.
- [x] Schema v3, 12 commands, 2 capabilities, protected hashes, Demo digest, and `57 2` human-integration guard verified.

M2.5 adds no Player, Market 3D/export, publish, MP4, `.twinpack`, GLTF, arbitrary lights/shaders, 3D geometry editing, remote runtime asset, or Sandbox export surface.

Build, dev/debug, browser, Playwright, packaged-runtime, packaging, screenshot, real-GPU, visual-correctness, and performance evidence are not authorized by this plan and are not claimed.
