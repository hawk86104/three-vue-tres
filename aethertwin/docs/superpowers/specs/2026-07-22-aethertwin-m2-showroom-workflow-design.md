# AetherTwin M2 Showroom Workflow Design

**Status:** Approved in conversation on 2026-07-22
**Milestone:** M2 — complete showroom authoring workflow
**Branch:** `codex/aethertwin-m2`
**Base:** local `master` at `d257ef60d8317916241816be47852129661e022e`

## 1. Context

M0 established project lifecycle, native persistence, recovery, CommandBus, EditorShell, and the Aether design system. M1 established schema v2, the pure plan engine, durable plan commands, the 2D Pixi projection, and the real PlanEditor. M2 turns that authoring core into a complete showroom workflow without weakening the local-first, 2D-first, or single-model boundaries.

M2 is too large for one implementation plan. It is one product milestone delivered through five independently reviewable subprojects:

1. native assets, plan references, and two-point calibration;
2. openings, room recognition, and parametric showroom fixtures;
3. product content, hotspots, and reusable route authoring;
4. synchronized 3D preview, materials, lights, and shadows;
5. offscreen PNG export, the Showroom Demo, and final evidence.

Each subproject receives its own implementation plan and must close the full model-to-persistence-to-Studio loop before the next subproject begins.

## 2. Approved product decisions

- M2 retains the complete showroom scope but uses five vertical delivery slices.
- Assets use a real Rust import pipeline: project-local copy, streaming SHA-256, deduplication, relative paths, and atomic publication.
- M2 establishes the shared `route-engine`. It supports normal showroom routes and synchronized 2D/3D preview. Accessible routing and temporary-closure authoring remain M3 work.
- Showroom fixtures use deterministic parametric primitives. Arbitrary GLB/GLTF import is not an M2 feature.
- Closed-room recognition produces transient candidates. A room changes only after explicit user confirmation through CommandBus.
- M2 exports only synchronized 3D preview PNGs at 1920×1080 or 3840×2160. It does not capture the operating-system screen or the visible canvas at window resolution.
- The Showroom Demo contains real M2 content, but visitor Player themes remain M4 work. No placeholder Player or theme selector is exposed.
- Market authoring, vendor CSV, accessible routing, Player, kiosk behavior, story timelines, MP4 video export, and M5 performance work remain outside M2.

## 3. Chosen delivery architecture

Three implementation organizations were considered:

1. vertical end-to-end slices;
2. horizontal platform layers followed by one late UI integration;
3. UI and 3D mocks followed by later persistence hardening.

The first option is selected. Every visible feature must have a real typed model, reversible command, durable native representation, and recovery evidence. The horizontal option delays integration feedback; the UI-first option conflicts with No Fake Features and repeats persistence risks already removed in M0 and M1.

The M2 data flow is:

```text
native asset selection or Studio authoring input
  -> pure policy / geometry / route calculation
  -> typed ProjectStore command or CommandBus transaction
  -> native journal commit and immutable ProjectSnapshot publication
  -> 2D, tree, Inspector, accessible mirror, and 3D projection
  -> optional offscreen PNG export through a native project-bound writer
```

Preview geometry, room candidates, route hover paths, orbit camera state, and export progress remain transient. They do not enter the project until an explicit command is accepted.

## 4. Global constraints

- The only project profiles are immutable `showroom` and `market`.
- Millimetres remain the stored plan unit; angles remain radians.
- Project assets remain project-relative and offline. Runtime source may not depend on a CDN or remote URL.
- Zustand stores only transient UI state. Project state remains in ProjectStore and CommandBus.
- PixiJS and Three.js objects are projections, never business records.
- M2 does not add a broad frontend filesystem capability.
- Every new native error uses a stable code, safe message, and log reference without absolute-path or database-detail leakage.
- Controls appear only when their end-to-end implementation exists.
- M2 makes no Player, theme, MP4-export, market, real-browser, GPU-performance, or M5 performance claim.

## 5. Schema v3

M2 upgrades the project to schema v3. A deterministic v2-to-v3 migration initializes all new collections and the singleton scene environment without changing existing M1 floors, layers, entities, ordering, sequence, or checkpoint state.

The native host upgrades a v2 project before publishing an editor session. A database-commit or manifest-publication failure restores the exact v2 database/manifest pair and leaves the session on v2. Recovery accepts coherent v2 projects long enough to perform the same guarded upgrade; newly created projects are v3.

### 5.1 New durable records

`PlanReference` stores:

- UUID, name, and tags;
- `floorId` and `layerId`;
- referenced `assetId`;
- intrinsic pixel width and height;
- `Transform2D`, with positive uniform scale for a calibrated image;
- opacity in `[0, 1]` and a lock flag;
- calibration evidence: two distinct source-image points and their positive measured distance in millimetres.

`Opening` becomes a normalized project collection. It stores UUID/name/tags, `wallId`, kind (`door` or `window`), distance along the wall centre-line, width, height, and sill height. Its floor and layer are derived from the referenced wall and validated on every snapshot.

`MaterialDefinition` stores UUID/name/tags, sRGB base colour, roughness, metalness, opacity, and an optional image `assetId`. `MaterialAssignment` stores UUID/name/tags, `materialId`, a target kind (`space-floor`, `wall`, or `fixture`), and `targetId`. Each target kind/ID pair has at most one assignment; the assignment covers the whole target surface in M2.

`SceneEnvironment` is a project singleton containing background colour, ambient light colour/intensity, one soft key light colour/intensity/direction, shadow enabled state, and shadow softness. M2 does not expose an unrestricted arbitrary-light graph.

`GuidedRoute` stores UUID/name/tags, `routeNetworkId`, and at least two ordered stop-node IDs. It is a curated showroom route; each segment between stops is resolved by the shared route engine.

The `PointOfInterestKind` union gains `product-hotspot`. A product hotspot is a normal POI plus one `ProductContent` record; media remains normalized through `MediaAsset` and `AssetRecord`.

### 5.2 Enabled schema-v3 collections

Schema v3 validates and persists:

- existing floors and spatial entities;
- `planReferences`;
- `openings`;
- existing `productContents` and `mediaAssets`;
- existing `routeNetworks` plus `guidedRoutes`;
- `materials` and `materialAssignments`;
- singleton `sceneEnvironment`;
- top-level immutable `assets`.

Vendor, theme, camera-story, and Player work remains contract-only or deferred unless a later milestone explicitly activates it.

## 6. Mutation and persistence

M1 `plan.entities.patch` and `plan.floor.patch` remain unchanged for spatial entities and floor/layer properties.

M2 adds one discriminated, allowlisted `snapshot.records.patch` command. Its collection discriminator may address only `assets`, `planReferences`, `openings`, `productContents`, `mediaAssets`, `routeNetworks`, `guidedRoutes`, `materials`, or `materialAssignments`. Each change carries an ID, exact before/after values, and an ordered index when insertion or removal affects order. TypeScript and Rust parse the selected collection into its real schema-v3 type before publication. Arbitrary JSON Pointer or field paths are not accepted.

`scene.environment.patch` handles the singleton environment with exact before/after payloads. A ProjectStore transaction may combine multiple record patches, for example an `AssetRecord`, `MediaAsset`, and `ProductContent` attachment.

Native replay supports only the explicit M0/M1 commands plus these M2 command types. Every apply, undo, and redo batch remains contiguous, idempotence-protected, and validated against exact `before` state.

## 7. Native asset boundary

M2 adds `crates/asset-io` as the only project-asset writer. Import is a two-phase operation:

1. capture the selected source without following a later replacement;
2. validate extension, signature, media policy, size, and SVG safety;
3. stream SHA-256 while copying to a unique staging file under the bound project;
4. fsync, verify the completed hash/size, and atomically publish a content-addressed file;
5. return an immutable `AssetRecord` to ProjectStore;
6. commit the `AssetRecord` and business reference in one CommandBus transaction.

Supported M2 media are PNG, JPEG, sanitized SVG, MP4, and WebM. Plan references accept only PNG, JPEG, or sanitized SVG. M2 stores video without transcoding and reports an explicit codec-preview error when the platform WebView cannot decode it.

Content-addressed files use a deterministic project-relative path derived from SHA-256 and canonical media extension. Importing identical bytes reuses the published file. Undo removes the business/asset records from the snapshot but does not delete the immutable file, because redo may still refer to it. Automatic orphan pruning is not part of M2.

The frontend never receives a project asset path for rendering. Native Studio exposes a project/session-bound asset resolver keyed by `assetId`; the sandbox backend exposes equivalent Blob URLs. Missing or digest-mismatched bytes are never served.

The AetherTwin application-command allowlist is exact. M2 retains the M1 six commands (`create_project`, `open_project`, `commit_project`, `checkpoint_project`, `close_project`, and `recover_project`) and adds only `import_project_asset`, `cancel_project_asset_import`, `begin_project_export`, `write_project_export_chunk`, `finish_project_export`, and `cancel_project_export`. Asset reads use only the project/session-bound `aethertwin-asset://asset/<session-id>/<asset-id>` protocol. Existing Tauri core-window and scoped `dialog:allow-open` plugin permissions remain separate and unchanged. Source paths selected by the user are transient inputs and are never persisted in the snapshot, manifest, journal, logs, or frontend error text.

## 8. Package responsibilities

### `packages/core-model`

Owns schema v3, all new record types, reference integrity, serialization, immutability, and deterministic v2-to-v3 migration.

### `packages/asset-pipeline`

Owns pure media-policy decisions, import request/result types, safe media classification, and asset-to-business-record composition. It does not read or write the filesystem.

### `crates/asset-io`

Owns bound source handles, streaming validation/hash/copy, content-addressed publication, SVG policy enforcement, asset resolution, and export-file publication.

### `packages/plan-engine`

Adds two-point calibration, opening projection, wall topology normalization, planar face extraction, closed-room candidates, and explicit candidate-to-room edit intents. It remains independent of React, PixiJS, Three.js, Tauri, and persistence.

### `packages/mode-showroom`

Owns the seven-item parametric fixture catalogue, showroom defaults, fixture descriptors, content workflow policy, and showroom-specific tool grouping. It does not own project state.

### `packages/route-engine`

Owns normalized route-graph validation, deterministic segment insertion/intersection splitting, Dijkstra path resolution, curated-stop expansion, distance, turns, and 2D/3D route projection. M2 uses only normal enabled routes; M3 later consumes accessibility and closure fields.

### `packages/render-scene-3d`

Owns the pure scene projection and the React Three Fiber adapter. It converts millimetres to metres at the Three.js boundary, creates floors/walls/opening cuts/fixtures/hotspots/routes, reconciles scene objects, synchronizes selection, and disposes GPU resources.

### `packages/exporter`

Owns resolution presets, export request validation, pixel-row normalization, PNG encoding boundaries, deterministic naming input, and the project-export port. It does not choose project paths.

### `packages/project-store`

Owns schema-v3 commands/transactions, inverse payloads, autosave integration, and authoritative publication after native commit.

### `apps/studio`

Owns the progressive showroom workflow, transient candidates/camera/progress, shared selection, accessible UI, and error recovery affordances.

## 9. Five subprojects

The detailed boundaries are normative in these child specifications:

1. [`2026-07-22-aethertwin-m2-1-assets-calibration-design.md`](./2026-07-22-aethertwin-m2-1-assets-calibration-design.md)
2. [`2026-07-22-aethertwin-m2-2-building-fixtures-design.md`](./2026-07-22-aethertwin-m2-2-building-fixtures-design.md)
3. [`2026-07-22-aethertwin-m2-3-content-routes-design.md`](./2026-07-22-aethertwin-m2-3-content-routes-design.md)
4. [`2026-07-22-aethertwin-m2-4-synchronized-3d-design.md`](./2026-07-22-aethertwin-m2-4-synchronized-3d-design.md)
5. [`2026-07-22-aethertwin-m2-5-export-demo-evidence-design.md`](./2026-07-22-aethertwin-m2-5-export-demo-evidence-design.md)

No subproject may expose its Studio controls before its persistence and recovery path exists.

## 10. Studio interaction model

The final showroom toolbar groups real tools under Select, Building, Fixtures, Content, Tour, and Preview/Export. The left side switches between the existing floor/space tree and the asset library. The centre defaults to 2D and supports `2D`, `3D`, or `split`; all modes share active floor, selection, snapshot, and error state. The Inspector keeps common properties visible and places calibration, material, light, and media metadata in collapsed advanced sections.

The bottom story area remains absent in M2. Player themes, story controls, and market data grids are not shown.

The accessible DOM mirror covers plan references, openings, rooms, fixtures, hotspots, and route elements. Tree, 2D canvas, Inspector, and 3D selection remain synchronized. Import dialogs, candidate confirmation, route editing, media repair, and export are keyboard operable with deterministic focus return.

## 11. Error handling and recovery

- User cancellation and validation failure publish no asset or project record.
- SVG rejects script, event attributes, `foreignObject`, remote URLs, external CSS, and non-fragment external references.
- Source replacement, symlink, reparse point, destination collision, and post-publication identity mismatch fail safely.
- A failed metadata commit may leave an unreferenced immutable file, never a referenced partial record.
- Absolute paths, path escape, duplicate IDs, and broken business references are hard project-open errors.
- Missing or digest-mismatched asset bytes produce a degraded open with typed asset issues. Unsafe bytes are not loaded; structural authoring remains available and Studio offers re-import.
- Room recognition errors return diagnostics and never create a room without confirmation.
- A disconnected route returns `NO_ROUTE` and does not mutate the network or guided route.
- A 3D initialization/resource failure leaves 2D fully usable and disables preview/export with an explanation.
- Export uses a unique project-bound staging file and atomic no-overwrite publication. Failure removes only that staging file.
- All native errors remain redacted and stable.

## 12. Testing and evidence

Each subproject provides:

- core/pure-engine Vitest coverage;
- ProjectStore apply/undo/redo/save/reopen/recovery integration evidence;
- Rust model, journal, asset/export, error-map, and lifecycle tests where applicable;
- Studio jsdom tests with injected Pixi/Three/export adapters;
- TypeScript checks for every changed workspace package;
- offline, visible-action, project-format, and capability policy updates.

The completed Showroom Demo contains one calibrated floor, at least four rooms or zones, doors and windows, at least twenty parametric fixtures, at least ten product hotspots with local media, one connected guided route, basic materials, soft lighting/shadows, save/close/reopen consistency, and both 1080p and 4K export contracts.

Current project rules and user approvals exclude build, dev, debug, browser, Playwright, packaged runtime, and actual screenshot execution. Source and injected-adapter tests may prove scene projection, renderer invocation, pixel/PNG processing, and native export publication, but M2 must not claim real WebGL/GPU or visual screenshot evidence unless the user separately approves those commands. `M2_REPORT.md` must state that limitation explicitly when it still applies.

## 13. External technical references

- React Three Fiber pairs v9 with React 19: <https://r3f.docs.pmnd.rs/getting-started/installation>
- Three.js render targets: <https://threejs.org/manual/en/rendertargets.html>
- Three.js asynchronous render-target pixel readback: <https://threejs.org/docs/pages/WebGLRenderer.html>
- Tauri v2 filesystem and Rust-side file operations: <https://v2.tauri.app/plugin/file-system/>
- Tauri capability allowlists: <https://v2.tauri.app/reference/acl/capability/>
- Tauri raw binary request bodies: <https://v2.tauri.app/develop/calling-rust/#accessing-the-raw-request>
- Three.js `0.185.1`: <https://www.npmjs.com/package/three/v/0.185.1>
- React Three Fiber `9.6.1`: <https://www.npmjs.com/package/@react-three/fiber/v/9.6.1>
- Drei `10.7.7`: <https://www.npmjs.com/package/@react-three/drei/v/10.7.7>
