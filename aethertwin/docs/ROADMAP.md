# Roadmap

## Current status

- M0 foundation: complete.
- M1 unified 2D authoring core: complete; evidence is in `M1_REPORT.md`.
- M2 showroom workflow: in progress.
  - M2.1 safe assets and calibrated plan references: accepted with the environment-limited Windows reparse test explicitly waived and documented in `M2_1_REPORT.md`.
  - M2.2 through M2.5: not implemented and not executable from the current plan.
- M3 market workflow: deferred until after M2.
- M4 Player and media: deferred.
- M5 hardening and performance profiling: deferred; no performance claim is made.

The next project action is a higher-reasoning planning pass for the approved M2.2 child specification. It must produce a new dependency-ordered atomic plan before implementation begins. Task 14 does not authorize openings UI, room recognition, fixture catalogues, content UI, routes, 3D, export, Player, or market workflow.

## Milestone definitions

- M0 - Foundation: workspace, product shells, Project Center, persistence, CommandBus, save, close, and recovery.
- M1 - Unified authoring core: schema, plan engine, 2D rendering, transforms, snapping, dimensions, arrays, indexing, and undo/redo.
- M2 - Showroom workflow: calibrated plans, openings/rooms, fixtures/content, routes, synchronized 3D, materials/lights, and screenshots, delivered as separately planned child milestones.
- M3 - Market workflow: regions, booths, vendor CSV, POIs, routes, search, accessible routing, and guide-map export.
- M4 - Player and media: offline Player, visitor themes, kiosk behavior, deterministic PNG frames, and optional FFmpeg MP4 encoding.
- M5 - Hardening: validation, label avoidance, large-project profiling, templates, shortcuts, accessibility, and interaction polish.

Every child milestone must distinguish implemented code evidence from runtime/browser/GPU evidence and must not expose controls before their durable path exists.