# Product specification

AetherTwin supports exactly two immutable project profiles: `showroom` and `market`. Profile cannot change after creation; any future conversion requires an explicit migration workflow.

M0, M1, M2.1, M2.2, and the implemented M2.3 content/routes workflow are present on the M2 branch. M2.1 closes the vertical path from safe asset import through durable asset/reference records, 2D rendering, calibration, save/reopen, and recovery; M2.2 adds durable openings, explicit room confirmation, and catalogue fixture placement; M2.3 adds product hotspots, ordered local image/video media, route-network authoring, and one curated guided route. All retain schema v3 and exactly eight native invokes: `create_project`, `open_project`, `commit_project`, `checkpoint_project`, `close_project`, `recover_project`, `import_project_asset`, and `cancel_project_asset_import`.

M2.3 is closed with complete non-build evidence. Lint passed. The first typecheck attempt did not start because of a Windows sandbox helper error; the same command passed outside the sandbox, reporting 12/13 workspace projects. Tests passed with 31/31 Node tests and 49 Vitest files/1,229 tests; the only output caveat was nonfatal jsdom canvas `getContext` warnings. The first rustfmt check exited 1 only for mechanical formatting in three M2.3 Rust tests; after formatting-only corrections it passed. Project-io passed 105/105 tests, desktop-host passed 52/52 tests, and both Cargo checks passed.

## Implemented 2D-first editor

Studio opens a project directly in a 2D-first editor. The editor shows one active floor at a time and keeps the floor tree, Pixi canvas, accessible DOM mirror, Asset Library, and Inspector on the same durable snapshot and transient selection.

The nine M1 tools remain Select, Pan, Boundary, Wall, Zone, Space unit, Fixture, POI, and Dimension. Showroom projects add Door, Window, Product hotspot, Route node, and Route edge, for fourteen implemented plan tools; Market retains the M1 surface. Contextual showroom actions attach product media, edit guided-route stops, and preview the current route. M1 has six editable business entity kinds: boundary, wall, zone, space unit, fixture, and POI. Dimension is a separate annotation entity. Property edits, transforms, arrays, delete, undo, redo, save, reopen, lock, and recovery are durable.

## Implemented M2.3 product content and guided routes

- Product content targets an existing fixture or product hotspot. Fixtures have zero or one `ProductContent`; every product hotspot has exactly one, created atomically with the hotspot.
- Ordered media IDs are durable and unique. Each `MediaAsset` is exactly `image` or `video`, references a durable local `AssetRecord`, and resolves only through verified project-owned/custom or development Blob sources. Durable paths are canonical `assets/sha256/...` project-relative paths, never absolute paths or remote runtime URLs.
- New attachment publishes asset, media, and new-or-updated content records in one transaction. Missing-media repair reuses the existing asset import boundary and preserves the stable media ID and product order while retargeting to a new immutable asset.
- `RouteNetwork` owns floor-bound `junction`, `entrance`, and `showroom-stop` nodes plus authored edges. Edge endpoints are distinct and on one floor; stored distance is Euclidean millimetres, and duplicate directed arcs are rejected.
- Pure `route-engine` owns deterministic segment insertion and route resolution. `GuidedRoute` persists only ordered stop node IDs; resolved node/edge paths, total distance, turn points, previews, and drafts are transient and recomputed from the current snapshot.
- Content/media/network/stop changes use the existing reversible `snapshot.records.patch` path. Exact history, save/reopen, and dirty recovery are validated through the same schema-v3 parsers and replay rules.
- Tree, 2D canvas, accessible mirror, Inspector, Asset Library, and route panel use durable IDs and one Studio selection/editor-session boundary.

## Implemented M2.2 building and fixture workflow

- Doors and windows are normalized `Opening` records bound to transformed wall centre-lines and validated identically in TypeScript and Rust.
- Wall and attached-opening changes commit as one reversible `building.structure.patch` journal operation without adding a native invoke.
- Closed-room recognition is deterministic and transient. Only explicit confirmation creates or replaces durable `SpaceUnit` records, and stale fingerprints are rejected.
- Showroom exposes seven immutable parametric fixture descriptors. New catalogue placements persist normal schema-v3 fixture fields and positive vertical height.
- Legacy fixtures without `spatial3D` remain readable and are not materialized by unrelated selection, save, reopen, or recovery operations.
- The active-floor 2D canvas, accessible mirror, Inspector, tree, undo/redo, save/reopen, and dirty recovery share the same durable snapshot.

All stored plan distances are millimetres and rotations are radians. One `PlanReference.transform` maps source-image coordinates into world millimetres.

## Implemented M2.1 asset and plan-reference workflow

- Import accepts PNG, JPEG, sanitized SVG, MP4, and WebM under the documented byte/media limits.
- Floor-plan references accept only PNG, JPEG, and sanitized SVG.
- Native import publishes immutable content-addressed bytes and returns an `AssetRecord`; ProjectStore commits the record and its initial plan reference atomically.
- Asset Library exposes real import progress, cancellation, selection, typed failures, and reimport repair.
- Plan references can be selected, placed, renamed, tagged, transformed, faded, locked, deleted, undone, and redone through the durable record-patch path.
- Two-point calibration is keyboard operable. The user selects two source-image points, enters a measured millimetre distance, confirms once, and receives an exact uniform scale update plus calibration record in the same reversible patch.
- Missing or corrupt bytes are never rendered as trusted content. The editor shows a placeholder, keeps the durable reference, and permits reimport without mutating the old immutable asset record.
- Save, close/reopen, and confirmed recovery preserve canonical relative identity, reference transform, calibration, and lock state.

## Current deliberate exclusions

Schema v3 activates product content, media assets, route networks, and guided routes for M2.3. Materials, assignments, and scene environment remain durable future-facing contracts without an M2.3 authoring surface.

The current product deliberately excludes:

- M2.4 synchronized 3D, materials/lights authoring, and any 3D preview;
- M2.5 export/demo/evidence, publish, screenshots, PNG/MP4 output, or `.twinpack` sharing;
- Player, visitor themes, kiosk mode, or expanded Market workflow;
- accessible-route toggles, temporary-closure editing, vendor destinations, or live indoor position;
- remote services, remote media, CDN/remote fallback, telemetry, or business APIs;
- build, dev/debug, browser, Playwright, packaged-runtime, packaging, screenshot, GPU, or performance evidence.

Only end-to-end implemented M2.1, M2.2, and M2.3 actions are visible. Deferred controls remain absent.
