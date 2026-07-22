# AetherTwin Studio

AetherTwin M1 is a local-first, desktop-first unified 2D authoring core with exactly two immutable profiles: `showroom` and `market`. Studio opens a project directly in the plan editor; Player remains an intentionally noninteractive future boundary.

## Implemented M1 capabilities

- schema-v2 core model with deterministic v1-to-v2 migration;
- floors and explicit layers with one active floor rendered at a time;
- six editable business entities (boundary, wall, zone, space unit, fixture, and POI) plus dimension annotation;
- nine authoring tools: select, pan, boundary, wall, zone, space unit, fixture, POI, and dimension;
- millimetre coordinates and dimensions, radian rotations, snapping, transforms, rectangular arrays, and spatial indexing;
- tree, Pixi canvas, accessible DOM mirror, and Inspector selection parity;
- generic reversible JSON entity patch journal through ProjectStore and CommandBus;
- durable save, checkpoint, close/reopen, undo/redo, lock, and recovery contracts;
- PixiJS 8.19.0 under the MIT notice recorded in `THIRD_PARTY_NOTICES.md`.

## Current dependency direction

```text
Studio React application
  -> core-model + design-system + editor-shell
  -> plan-engine + render-plan-2d + project-store
  -> editor-shell -> core-model + design-system
  -> project-store -> command-bus + core-model

Desktop backend
  -> TauriProjectBackend -> desktop-host -> project-io -> SQLite/filesystem

Studio web development sandbox
  -> SandboxProjectBackend (in-memory only; no native filesystem or SQLite)
```

`project-store` is the UI persistence coordinator; CommandBus serializes mutations and publishes only after persistence commits. Native `desktop-host` owns the six typed Tauri commands; `project-io` owns `.twinproj`, SQLite, locking, recovery, and the exact schema-v1 checkpoint upgrade to schema v2.

## Deliberate boundary

M1 does not implement opening/content/vendor/route/theme/camera/story authoring, 3D preview, route authoring, data import, export/publish, real Player/media, browser/GPU profiling, or an M5 performance claim. M2 is the next milestone.

## Verification boundary

The manifests declare normal lint, typecheck, test, and build entry points, but declarations are not success claims. Task 12 verification is recorded in [docs/M1_REPORT.md](docs/M1_REPORT.md). Project rules intentionally exclude build, dev, debug, local server, browser, Playwright, packaging, packaged runtime, and screenshot commands from that evidence. The historical [docs/M0_REPORT.md](docs/M0_REPORT.md) remains the M0 record.

In a non-Tauri production web context, Studio fails closed. The in-memory sandbox is selected only in Vite development mode and is not a browser persistence claim.
