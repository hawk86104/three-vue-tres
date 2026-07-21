# AetherTwin M1 Unified Authoring Core Design

**Status:** Approved in conversation on 2026-07-21
**Milestone:** M1 — unified model, plan engine, 2D rendering, transforms, snapping, dimensions, arrays, indexing, and undo/redo
**Branch:** `codex/aethertwin-m1`

## 1. Context and approved product decisions

M0 established the isolated AetherTwin workspace, immutable project profiles, native and sandbox persistence, CommandBus, project save/recovery, EditorShell, and the Aether design system. M1 replaces the honest M0 project overview with the first real 2D authoring surface while preserving every M0 persistence boundary.

The approved M1 scope is:

- Define and validate the complete unified model required by the product specification.
- Provide interactive M1 editing for `Boundary`, `Wall`, `Zone`, `SpaceUnit`, `Fixture`, and `PointOfInterest`.
- Treat dimension annotations as authoring aids, not as a seventh business-space object.
- Defer semantic door/window editing, wall-derived room closure, booth numbering, vendor data, route authoring, content authoring, 3D preview, and exports to M2 or M3.
- Open a project directly into the real 2D plan editor. Move project metadata into the Inspector and remove the M0 overview workspace.
- Edit and render one active floor at a time. Do not overlay other floors in M1.
- Do not expose 3D, timeline, asset import, route, data-import, or export controls until those capabilities are real.

M1 remains local-first and 2D-first. PixiJS is a renderer and input adapter; it never becomes the project database.

## 2. Chosen architecture

Three architectures were considered:

1. A pure plan engine plus a PixiJS rendering adapter.
2. A live mutable scene model synchronized with `ProjectSnapshot`.
3. Studio or PixiJS display objects directly mutating project data.

The first option is selected. It provides deterministic geometry tests, keeps the renderer replaceable, and preserves the M0 mutation and durability guarantees. The other options create two sources of truth or bypass CommandBus.

The committed data flow is:

```text
Studio input
  -> plan-engine geometry calculation and edit intent
  -> ProjectStore command or transaction
  -> CommandBus prepare + persistence commit
  -> immutable ProjectSnapshot publication
  -> render-plan-2d scene reconciliation
```

A pointer preview is transient. No project state is published until the command batch and its persistence rows commit together.

## 3. Package responsibilities

### 3.1 `packages/core-model`

`core-model` owns schema v2 types, validation, serialization, immutability, and deterministic v1-to-v2 migration. It contains no rendering or interaction behavior.

### 3.2 `packages/plan-engine`

`plan-engine` is pure TypeScript with no React, PixiJS, DOM, Tauri, or persistence dependency. It owns:

- world/screen coordinate conversion;
- unit conversion;
- matrices and normalized transforms;
- bounds and geometric hit testing;
- point, multi-, and box selection calculations;
- move, rotate, resize, and scale calculations;
- grid, endpoint, midpoint, edge, angle, and alignment snapping;
- guides and dimension geometry;
- array, alignment, and equal-distribution calculations;
- spatial indexing and viewport queries;
- typed edit intents returned to the application layer.

It does not mutate a snapshot or create a durable command.

### 3.3 `packages/project-store`

`project-store` translates validated edit intents into CommandBus definitions. It owns project commands, inverse payloads, atomic multi-entity transactions, autosave integration, and the existing save/close lifecycle.

### 3.4 `packages/render-plan-2d`

`render-plan-2d` owns the PixiJS `Application`, scene containers, incremental display-object reconciliation, viewport culling, resource disposal, and conversion of canvas input into engine input. It consumes model and transient editor state; it does not persist authoritative geometry or selection in `DisplayObject` instances.

### 3.5 `apps/studio`

Studio composes EditorShell, transient editor-session state, plan tools, the floor/layer tree, canvas, Inspector, status feedback, and the ProjectStore. Zustand may hold transient state only: active tool, active floor, selection, draft, viewport, snap settings, per-floor viewports, and temporary field input.

### 3.6 Rust persistence

`project-io` and `desktop-host` continue to own project directories, SQLite, locks, checkpoints, recovery, and typed error envelopes. They accept the supported schema range during migration but contain no geometry business rules.

## 4. Schema v2 and unified model

### 4.1 Coordinates and units

- The canonical stored plan unit is the millimetre.
- The UI accepts and displays metres, centimetres, and millimetres.
- Angles are stored in radians.
- World X points right and world Y points up.
- PixiJS converts the Y axis at the rendering boundary.
- All persisted numeric geometry must be finite.

Core geometry primitives include `Point2`, `Size2`, `Bounds2`, `Transform2D`, and optional `Spatial3D`. `Transform2D` contains translation, rotation, and positive scale. Geometry is stored in entity-local coordinates and transformed into world coordinates for indexing, interaction, and rendering.

### 4.2 Record bases

Every domain object stored in the unified project collections has a UUID, non-empty `name`, and normalized `tags`. Infrastructure envelopes (`ProjectManifest`, `ProjectSnapshot`, and `AssetRecord`) retain their purpose-specific M0 identity fields instead of duplicating meaningless object metadata.

Physical objects use `SpatialEntityBase`, which additionally contains:

- `floorId`;
- `layerId`;
- `transform`;
- optional `spatial3D`;
- `locked`.

Non-spatial records such as a vendor or theme do not receive a meaningless transform. They use `ProjectRecordBase` and reference spatial objects explicitly when needed.

### 4.3 Normalized project structure

`SpatialProject` contains ordered floors and normalized collections rather than placing project data inside renderer objects. Each floor contains ordered plan-layer definitions. Spatial entities carry `floorId` and `layerId`, which gives commands, indexes, and future cross-floor references a uniform lookup path.

The v2 project contains collections for:

- floors and plan layers;
- spatial entities;
- vendors;
- product content;
- media assets;
- route networks;
- themes;
- camera shots;
- story sequences.

`ProjectSnapshot.assets` continues to hold immutable `AssetRecord` values for project-relative or content-addressed assets. Absolute asset paths remain invalid.

### 4.4 Interactive M1 entities

- `Boundary`: a closed simple polygon with at least three vertices.
- `Wall`: a centre-line polyline with at least two distinct points, positive thickness, and optional height.
- `Zone`: a closed simple polygon plus purpose and visual metadata.
- `SpaceUnit`: a rectangle or simple polygon footprint plus `kind`. Its kinds include `room`, `shop`, `booth`, `exhibition`, `service`, and `restricted`.
- `Fixture`: a rectangular footprint, fixture kind, and optional height.
- `PointOfInterest`: an anchor, POI kind, and optional influence radius. The complete POI-kind union from the product specification is part of schema v2.
- `DimensionAnnotation`: persistent measurement anchors, offset, and display-unit override. It is an auxiliary plan annotation, not a semantic venue object.

An incomplete drawing exists only as a transient draft. A committed polygon is closed and valid; a committed wall has non-zero length.

### 4.5 Contract-only M1 types

M1 also defines, parses, freezes, serializes, and migrates the following contracts without exposing editing UI:

- `Opening`;
- `Vendor`;
- `ProductContent`;
- `MediaAsset`;
- `RouteNode`;
- `RouteEdge`;
- `RouteNetwork`;
- `ThemeConfig`;
- `CameraShot`;
- `StorySequence`.

Their validation is structural and referential. Domain workflows remain deferred to their owning milestone.

### 4.6 Validation

Schema parsing rejects:

- invalid or duplicate UUIDs;
- missing floor or layer references;
- NaN or infinite values;
- zero-area or self-intersecting polygons;
- repeated consecutive vertices;
- non-positive wall thickness, sizes, scale, or dimension values;
- invalid enum members;
- absolute asset paths;
- malformed references between contract-only records.

Bounds, snap candidates, spatial indexes, selection boxes, alignment guides, and pointer drafts are derived and are never persisted.

### 4.7 v1-to-v2 migration

The deterministic migration:

- preserves project, floor, and asset IDs;
- preserves profile, project name, tags, floor names, sequence, and checkpoint sequence;
- adds one default visible and unlocked layer to every existing floor;
- initializes new collections as empty;
- adds no fake spatial content;
- does not synthesize timestamps inside the pure migration function.

Opening a v1 native project stages the migrated v2 snapshot and performs an atomic checkpoint before exposing the editor. Only that successful checkpoint may update the manifest schema version and normal persistence timestamp. If migration validation or checkpointing fails, the session is closed and the original v1 project remains unchanged.

Rust accepts v1 and v2 while opening or recovering supported projects. New M1 commits and checkpoints write v2 and continue to require manifest, database, and snapshot identity/version agreement.

## 5. Editing interaction and commands

### 5.1 Tools

M1 tools are `select`, `boundary`, `wall`, `zone`, `space-unit`, `fixture`, `poi`, `dimension`, and `pan`.

- Polygon and wall tools use point-by-point construction.
- Rectangle-like space units and fixtures use drag construction plus exact Inspector dimensions.
- POIs use click placement.
- Dimensions use two anchors followed by an offset placement.
- Pan and wheel zoom affect only the transient viewport.

### 5.2 Gesture lifecycle

1. Pointer down starts a transient edit session.
2. Pointer movement calculates preview geometry, snap candidates, guides, and dimensions.
3. Pointer up or explicit drawing completion produces one validated edit intent.
4. ProjectStore converts the intent into one command or transaction.
5. CommandBus persists the batch and then publishes the immutable snapshot.
6. Escape, lost focus, invalid completion, or explicit cancel discards the draft without dirtying the project.

One drag produces one undo entry. Pointer-move events never enter the journal.

### 5.3 Selection and transforms

Selection supports single, additive multi-selection, and box selection. Locked objects remain visible and inspectable through the tree but cannot be transformed or deleted. Hidden layers are not rendered, indexed for hit testing, or offered as snap targets.

Move, rotate, resize, and scale previews use the same plan-engine functions as exact Inspector edits. Commit normalization prevents accumulated matrix error. Walls may not receive non-uniform scaling that distorts thickness.

### 5.4 Snapping

Snap tolerance is specified in screen pixels and converted to world distance at the active zoom. Candidate priority is:

1. endpoint;
2. midpoint;
3. edge projection;
4. alignment guide;
5. grid.

The closest screen-space candidate wins within one priority. Rotation uses angle snapping. The UI exposes active snap modes and a temporary modifier to disable snapping.

### 5.5 Batch operations

Multi-object transforms, deletion, duplication, linear array, rectangular array, alignment, and equal distribution are atomic transactions. Copy/paste produces fresh UUIDs while retaining the internal relative layout. M1 does not silently cascade-delete referenced objects; it rejects the operation with an explicit reference error.

## 6. PixiJS scene and rendering

The scene contains five stable layers:

1. `grid` for the adaptive grid and origin;
2. `content` for visible active-floor spatial entities;
3. `annotation` for persistent dimensions;
4. `overlay` for selection, handles, guides, snaps, and drafts;
5. `interaction` as the canvas event boundary.

Display objects are keyed by entity ID for incremental reconciliation. This map is a rendering cache, not authoritative project data. Geometric hit testing remains in `plan-engine`.

The renderer:

- initializes one PixiJS Application for the editor lifetime;
- resizes the renderer without reconstructing project state;
- queries a plan-engine spatial index with the viewport AABB;
- creates or updates only visible active-floor entities;
- uses on-demand rendering while static and continuous updates only during interaction or brief feedback animation;
- caps effective device-pixel ratio to avoid waste on high-DPI displays;
- reuses compatible drawing resources;
- destroys entity, floor, and application resources deterministically.

The M1 engineering baseline is correct indexing, selection, pan, and zoom for 2,000 simple rectangular entities. Large-market profiling and deeper optimization remain M5 work.

## 7. Studio experience

The project opens directly into EditorShell with:

- a top bar for return, save, undo, redo, and implemented plan tools;
- a left floor/layer/space-object tree;
- a central 2D canvas;
- a contextual right Inspector;
- no visible bottom panel in M1.

Showroom groups the shared tools under Select, Building, Fixtures, and Markers. Market groups them under Select, Venue, Space Units, and Markers. Group labels and default kinds differ, but both profiles use the same underlying model and tools.

Only the active floor is rendered and editable. A per-floor viewport is retained in transient session state. Floor switching is disabled during an active drawing or transform gesture so drafts cannot disappear silently.

Inspector contexts are:

- no object: project name, tags, immutable profile, save state, backend mode, and project location;
- floor or layer: name, order, visibility, and lock state;
- one object: name, type, dimensions, position, angle, layer, lock, and tags;
- multiple objects: common properties and batch transform/alignment actions.

The canvas displays zoom, unit, pointer coordinates, and snap state. It has keyboard focus and a visible focus indicator. The DOM tree and Inspector provide an accessible path to the same selection state as the canvas.

## 8. Failure behavior

Expected model and geometry failures use typed issues containing a stable code, user-safe message, and field or entity path. Programming defects may still throw.

If command preparation or persistence fails:

- CommandBus publishes no candidate snapshot;
- undo/redo history does not advance;
- the last valid snapshot and selection remain usable;
- invalid preview geometry is removed;
- Studio displays a contextual error and log reference when available.

If PixiJS initialization fails, Studio displays a real failure state and a safe return path rather than an empty fake editor. Existing M0 close and recovery guarantees remain authoritative.

## 9. Verification strategy

### 9.1 Focused tests

- `core-model`: every new type, UUID and reference validation, geometry validation, deep immutability, and v1-to-v2 migration.
- `plan-engine`: coordinate round trips, matrices, bounds, hit tests, box selection, snap priority/tolerance, transforms, dimensions, arrays, alignment, distribution, and spatial queries.
- `project-store`: CRUD and batch commands, exact undo/redo, transaction atomicity, failed persistence non-publication, and save/reopen equality.
- `render-plan-2d`: scene reconciliation, active-floor filtering, culling decisions, coordinate-event conversion, and resource disposal without requiring a real browser.
- Studio: direct editor entry, tool state, tree/canvas/Inspector synchronization, exact inputs, floor switching, keyboard semantics, and error states.
- Rust: v1/v2 open, commit, checkpoint, recover, identity/version mismatches, and desktop error mapping.
- offline source policy: no remote runtime asset, font, icon, CDN, or unexpected network dependency.

### 9.2 Allowed commands

The approved M1 verification set is focused Vitest, TypeScript type checking, Rust tests, `cargo check`, read-only git checks, and offline-source policy tests. Project rules prohibit build, dev, debug, browser, Playwright, packaged-runtime, and screenshot validation unless the user later authorizes them explicitly.

## 10. M1 acceptance criteria

M1 is complete only when:

- showroom and market projects open directly into the real 2D editor;
- the full schema v2 model and v1 migration are validated in TypeScript and accepted by native persistence;
- all six scoped spatial entity kinds can be created, selected, box-selected, transformed, copied, and deleted;
- grid, endpoint, midpoint, edge, angle, and alignment snapping operate consistently across zoom levels;
- layer visibility/locking, object locking, dimensions, precise unit input, arrays, alignment, and equal distribution work;
- active-floor isolation and per-floor viewport behavior are deterministic;
- spatial indexing and viewport culling handle the 2,000-rectangle engineering fixture;
- undo/redo restores exact multi-object state;
- save, close, and reopen reproduce the same project model;
- failed commands never publish partial state;
- no M2/M3 feature is represented by a non-working UI control;
- all approved focused verification passes.

## 11. Implementation work breakdown

The detailed writing-plans phase will expand these into exact file edits and red-green test commands:

1. Schema v2 unified types and validation.
2. v1-to-v2 migration and Rust version compatibility.
3. Units, coordinates, matrices, and geometry kernel.
4. Bounds, hit testing, box selection, and spatial index.
5. Snapping, alignment guides, and dimensions.
6. Spatial-entity CRUD CommandBus commands.
7. Batch transforms, copy/paste, arrays, alignment, and distribution commands.
8. PixiJS Application and layered scene reconciliation.
9. Editor session and pointer interaction state machine.
10. Studio toolbar, floor tree, canvas host, and Inspector.
11. Canvas integration, culling, resource lifecycle, and accessibility semantics.
12. Save/reopen integration, offline checks, documentation, and M1 report.

Each task follows failing test, minimal implementation, focused verification, specification review, and code-quality review. Work stays on the isolated `codex/aethertwin-m1` worktree and does not modify the unrelated dirty root checkout.
