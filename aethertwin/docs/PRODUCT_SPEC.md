# Product specification

AetherTwin supports exactly two immutable project profiles: `showroom` and `market`. Profile cannot change after creation; any future conversion requires an explicit migration workflow.

M0 through M2.4 are accepted and closed. M2.4 retains schema v3, introduces no SQLite storage migration, and keeps exactly eight native invokes: `create_project`, `open_project`, `commit_project`, `checkpoint_project`, `close_project`, `recover_project`, `import_project_asset`, and `cancel_project_asset_import`.

## Implemented editor profiles and views

Studio opens directly in the 2D-first editor, which shows one active floor at a time and retains six editable business entity kinds. Showroom defaults to `2d` and can switch to synchronized `3d` or a fixed 50/50 `split`. The two panes share the active floor, durable selection IDs, and active guided route. Market remains 2D-only and exposes no 3D or split action.

The M1 plan tools remain Select, Pan, Boundary, Wall, Zone, Space unit, Fixture, POI, and Dimension. Showroom additionally exposes Door, Window, Product hotspot, Route node, and Route edge, plus real 2D/3D/split preview and framing actions. Export, Player, and Market 3D actions are absent.

## Implemented M2.4 synchronized 3D

- 3D projection covers space-unit/zone floors, walls, door/window openings, all seven showroom catalogue fixture kinds, compatible generic fixtures, product hotspots, and a valid active guided route.
- Plan references, boundaries, dimensions, ordinary POIs, invalid routes, and stale sources are deliberately ignored or fail closed; a projection error never publishes a partial scene.
- Coordinates convert from stored millimetres to Three metres, including floor/entity elevation. Wall compatibility height is 3,000 mm, generic fixture compatibility height is 1,000 mm, and route geometry is raised 30 mm.
- Space-floor, wall, and fixture material assignments resolve deterministically. Missing definitions use stable defaults. Selection is a separate overlay, not a mutation of the durable material.
- Material definitions, assignments, and the singleton scene environment are durable ProjectStore data. Material/environment changes are reversible, replayable, reopen-safe, and recovery-safe.
- Material textures use only project-bound PNG, JPEG, or sanitized SVG imports. Missing or undecodable texture bytes report a safe renderer issue and keep `baseColor`; no remote runtime URL is used.
- Renderer geometry, material, texture, and render-target resources are generation-safe and released exactly once through the renderer registry. ProjectStore remains the only Blob URL owner.
- WebGL failure never disables 2D. One context-loss reconstruction is automatic; a second failure moves 3D to `disabled`, and explicit retry begins a new recovery round.
- Camera, view mode, renderer status/error, selection, and preview state live only in scoped Zustand session state and are never persisted.
- The public `SceneExportPort` exposes immutable camera/scene capture and offscreen RGBA readback for future M2.5 work. M2.4 has no Export UI and produces no export artifact.

## Implemented durable showroom workflow

M2.1 provides project-bound local assets and calibrated plan references. Native import publishes immutable content-addressed bytes; ProjectStore owns durable records, import transactions, repair, and source leases.

M2.2 provides durable door/window openings, deterministic transient room recognition with explicit confirmation, and seven immutable parametric showroom fixture descriptors. Placements persist normal schema-v3 fixture fields.

M2.3 provides product hotspots/content, ordered local image/video media, route-network authoring, and a curated guided route. Resolved route paths and drafts remain transient; durable changes flow through exact reversible ProjectStore commands.

All stored plan distances are millimetres and rotations are radians. Absolute native paths, drive/UNC paths, `file://`, source filenames, and remote runtime URLs are not durable project data.

## Ownership rules

ProjectStore and CommandBus are the only durable publication path. Three.js, R3F, PixiJS, React, and Zustand do not own business data. ProjectStore is the only Blob URL owner. Renderer resources are transient projections keyed to durable source IDs; the 3D layer may release its own GPU/Three resources but may not revoke ProjectStore URLs.

## M2.4 evidence state

Task 17 actually passed:

- Studio: 4/4;
- ProjectStore: 1/1;
- render-scene-3d: 2/2;
- project-io M2.4: 1/1;
- schema-v3 recovery: 8/8;
- scene-environment replay: 6/6;
- desktop-host command contract: 21/21;
- three TypeScript checks, rustfmt, and Cargo check.

The independent Task 17 final re-review reported no Critical, Important, or Minor findings. Task 18's full non-build gate passed: frozen install exited 0 for 14 workspace projects and was already up to date; lint first exited 1 on eight M2.4-introduced issues, then passed after minimal repairs in five files; typecheck exited 0 with 13 of 14 workspace projects completed; Node policy tests passed 32/32; Vitest passed 68 files and 1,355 tests with only the known non-failing JSDOM HTMLCanvasElement.getContext notice; rustfmt exited 0; Rust tests passed 208 with one approved ignored Windows privileged reparse/symlink test while the deterministic reparse-bit unit test passed; and Cargo check exited 0. Schema v3, the exact eight commands, and both protected hashes remain unchanged. Final independent review passed with no findings: Spec Compliance Pass; Code/Doc Quality Approved; Critical/Important/Minor None; Ready Yes. M2.4 is accepted and closed.

## Current deliberate exclusions

M2.5 is the next milestone. M2.4 deliberately excludes:

- Export/publish controls, PNG/MP4 output, `.twinpack`, demo/evidence generation, and any claim that the offscreen port is a completed export product;
- Player, visitor themes, kiosk mode, and expanded Market workflows;
- Market 3D or split mode;
- GLTF import/export, arbitrary lights, arbitrary shaders, and 3D geometry editing;
- accessible-route toggles, temporary-closure editing, vendor destinations, and live indoor position;
- remote services, remote media, CDN/remote fallback, telemetry, and business APIs;
- build, dev/debug, browser, Playwright, packaged-runtime, packaging, screenshot, real-GPU, visual-correctness, or performance evidence.

Only controls backed by the implemented durable/recoverable paths are visible.
