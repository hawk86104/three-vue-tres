# Roadmap

## Current status

- M0 foundation: complete.
- M1 unified 2D authoring core: complete; evidence is in `M1_REPORT.md`.
- M2 showroom workflow: complete and accepted through M2.5.
  - M2.1 safe assets and calibrated plan references: accepted.
  - M2.2 openings, room recognition, and parametric showroom fixtures: accepted.
  - M2.3 content and guided routes: accepted.
  - M2.4 synchronized 3D, durable materials/environment, and renderer lifecycle: complete and accepted. Tasks 0-18, the full non-build gate, and final independent review are closed with no findings.
  - M2.5 export/demo/evidence: accepted; Task 20's final non-build gate and independent review closed with no findings.
- M3 market workflow: next milestone, deferred until a separate high-reasoning specification and atomic plan are approved.
- M4 Player and media: deferred.
- M5 hardening and performance profiling: deferred; no performance claim is made.

Task 17 evidence is Studio 4/4, ProjectStore 1/1, render-scene-3d 2/2, project-io M2.4 1/1, schema-v3 recovery 8/8, scene-environment replay 6/6, desktop-host command contract 21/21, three TypeScript checks, rustfmt, and Cargo check.

Task 18's full non-build gate passed: frozen install exited 0 for 14 workspace projects and was already up to date; lint first exited 1 on eight M2.4-introduced issues, then passed after minimal repairs in five files; typecheck exited 0 with 13 of 14 workspace projects completed; Node policy tests passed 32/32; Vitest passed 68 files and 1,355 tests with only the known non-failing JSDOM HTMLCanvasElement.getContext notice; rustfmt exited 0; Rust tests passed 208 with one approved ignored Windows privileged reparse/symlink test while the deterministic reparse-bit unit test passed; and Cargo check exited 0. Schema v3, the exact eight commands, and both protected hashes remain unchanged. Final independent review passed with no findings: Spec Compliance Pass; Code/Doc Quality Approved; Critical/Important/Minor None; Ready Yes. M2.4 is accepted and closed.

M2.4 keeps schema v3, one SQLite storage migration, exactly eight native invokes, and the existing two desktop capabilities. Showroom defaults to 2D and supports 3D and fixed 50/50 split; Market remains 2D-only. No build, dev/debug, browser, Playwright, packaged-runtime, packaging, screenshot, real-GPU, visual, or performance evidence is claimed.

## M2 closure result

The approved M2.5 plan is complete. Showroom has two fixed project-bound PNG presets, deterministic Demo sources, strict native publication, and cancellation/cleanup. Schema remains v3, the native surface is exactly twelve commands, and desktop capabilities remain exactly two.

Task 20's final gate passed frozen install, lint, typecheck, Node 45/45, Vitest 77 files and 1,500 tests, rustfmt, Rust 302 passed with 2 approved ignored privileged-Windows tests, four-crate all-targets Cargo check, and diff check. Final independent review returned Spec Compliance Pass, Code Quality Approved, Critical/Important/Minor None, and Ready Yes. M2.5 is accepted and M2 is closed. Publish, MP4, `.twinpack`, Player, Market 3D/export, GLTF, arbitrary lights/shaders, and 3D geometry editing remain deferred.

## Milestone definitions

- M0 - Foundation: workspace, product shells, Project Center, persistence, CommandBus, save, close, and recovery.
- M1 - Unified authoring core: schema, plan engine, 2D rendering, transforms, snapping, dimensions, arrays, indexing, and undo/redo.
- M2 - Showroom workflow: calibrated plans, openings/rooms, fixtures/content, routes, synchronized 3D, materials/environment, then separately planned export/demo evidence.
- M3 - Market workflow: regions, booths, vendor CSV, POIs, routes, search, accessible routing, and guide-map export.
- M4 - Player and media: offline Player, visitor themes, kiosk behavior, deterministic frames, and optional media encoding.
- M5 - Hardening: validation, large-project profiling, accessibility, and interaction polish.

Every child milestone must distinguish implemented source/test evidence from runtime/browser/GPU evidence and must not expose controls before their durable path exists.
