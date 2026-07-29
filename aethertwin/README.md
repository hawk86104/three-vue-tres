# AetherTwin Studio

AetherTwin is a local-first, desktop-first digital-twin authoring product with exactly two immutable project profiles: `showroom` and `market`. M0, M1, and M2.1 are accepted. The environment-limited Windows reparse test was explicitly waived without being claimed as passing. Studio opens a project directly in the 2D plan editor; Player remains a deferred, intentionally noninteractive boundary.

## Implemented capabilities

- schema-v3 projects with deterministic v1 -> v2 -> v3 migration before an editor session is published;
- floors and explicit layers, with one active floor rendered at a time;
- six editable business entities plus dimension annotations and nine M1 authoring tools;
- millimetre plan coordinates, radian rotations, snapping, transforms, arrays, indexing, undo/redo, checkpoint, close/reopen, and recovery;
- project-bound import of PNG, JPEG, sanitized SVG, MP4, and WebM into immutable content-addressed files;
- canonical asset identity at `assets/sha256/<first-two-hex>/<sha256>.<canonical-extension>` with no persisted source path or remote URL;
- verified custom-protocol asset reads, missing/corrupt placeholders, selective cache invalidation, and reimport repair;
- plan-reference placement, selection, properties, lock state, atomic undo/redo, and keyboard-operable two-point calibration;
- PixiJS 8.19.0 under the MIT notice in `THIRD_PARTY_NOTICES.md`.

Only PNG, JPEG, and sanitized SVG are accepted as floor-plan references. MP4 and WebM are accepted content assets but M2.1 does not expose later content authoring UI.

## Dependency direction

```text
Studio React application
  -> core-model + design-system + editor-shell
  -> asset-pipeline + plan-engine + render-plan-2d + project-store
  -> project-store -> command-bus + core-model

Desktop backend
  -> TauriProjectBackend -> desktop-host
  -> desktop-host -> project-io + asset-io
  -> project-io -> SQLite/filesystem project state
  -> asset-io -> staged import + verified content-addressed reads

Development sandbox
  -> SandboxProjectBackend (in-memory project metadata and Blob-backed assets)
```

`project-store` remains the UI persistence coordinator. CommandBus serializes mutations and publishes only after persistence commits. `desktop-host` owns exactly eight typed Tauri commands: the original six project commands plus `import_project_asset` and `cancel_project_asset_import`. Asset bytes are read through the `aethertwin-asset` custom protocol, not a ninth invoke. Desktop capabilities remain exactly `core:window:default` and `dialog:allow-open` for the `main` window.

## Deliberate boundary

M2.1 is accepted; openings/room recognition, fixture catalogues, content placement UI, routes, synchronized 3D, export, Player/media, and market workflows are not implemented. M2.2 must begin with a separate higher-reasoning design and atomic implementation plan.

## Verification boundary

The executed M2.1 evidence is recorded in [docs/M2_1_REPORT.md](docs/M2_1_REPORT.md). Build, dev, debug, browser, Playwright, packaging, packaged-runtime, screenshot, real-GPU, and visual-performance commands were not run for Task 14. Historical evidence remains in [docs/M1_REPORT.md](docs/M1_REPORT.md) and [docs/M0_REPORT.md](docs/M0_REPORT.md).

In a non-Tauri production web context, Studio fails closed. The sandbox is selected only in Vite development mode and is not a browser-persistence claim.