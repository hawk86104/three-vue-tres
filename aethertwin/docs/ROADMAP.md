# Roadmap

## Current status

- M0 foundation: complete.
- M1 unified 2D authoring core: complete; evidence is in `M1_REPORT.md`.
- M2 showroom workflow: in progress.
  - M2.1 safe assets and calibrated plan references: accepted with the environment-limited Windows reparse test explicitly waived and documented in `M2_1_REPORT.md`.
  - M2.2 openings, room recognition, and parametric showroom fixtures: implemented and closed on `codex/aethertwin-m2` with full approved non-build verification.
  - M2.3 content and routes: closed on `codex/aethertwin-m2`. Complete non-build closure evidence is lint PASS; typecheck PASS outside the sandbox with 12/13 workspace projects reported after the first Windows sandbox-helper attempt did not start; Node 31/31 plus Vitest 49 files/1,229 tests PASS with only nonfatal jsdom canvas warnings; rustfmt PASS after a first formatting-only exit 1 and mechanical corrections in three M2.3 Rust tests; project-io 105/105 and desktop-host 52/52 tests PASS; and both Cargo checks PASS.
  - M2.4 synchronized 3D and M2.5 export/demo/evidence: approved child designs exist but implementation has not started.
- M3 market workflow: deferred until after M2.
- M4 Player and media: deferred.
- M5 hardening and performance profiling: deferred; no performance claim is made.

M2.3 is closed. Any M2.4 work requires its own explicit approval and implementation planning. Build, dev/debug, browser, Playwright, packaged-runtime, packaging, screenshot, real-GPU, and performance evidence remain outside the M2.3 evidence boundary and are not claimed.

M2.4/M2.5 work must not start from a false M2.3 capability claim. Synchronized 3D, materials/lights UI, export/publish, Player, expanded Market workflow, accessible-route toggles, temporary-closure editing, vendor destinations, live indoor position, and remote fallback remain deferred and absent.

## Milestone definitions

- M0 - Foundation: workspace, product shells, Project Center, persistence, CommandBus, save, close, and recovery.
- M1 - Unified authoring core: schema, plan engine, 2D rendering, transforms, snapping, dimensions, arrays, indexing, and undo/redo.
- M2 - Showroom workflow: calibrated plans, openings/rooms, fixtures/content, routes, synchronized 3D, materials/lights, and screenshots, delivered as separately planned child milestones.
- M3 - Market workflow: regions, booths, vendor CSV, POIs, routes, search, accessible routing, and guide-map export.
- M4 - Player and media: offline Player, visitor themes, kiosk behavior, deterministic PNG frames, and optional FFmpeg MP4 encoding.
- M5 - Hardening: validation, label avoidance, large-project profiling, templates, shortcuts, accessibility, and interaction polish.

Every child milestone must distinguish implemented code evidence from runtime/browser/GPU evidence and must not expose controls before their durable path exists.
