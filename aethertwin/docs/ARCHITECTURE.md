# Architecture

## Implemented graph

```text
apps/studio (React)
  -> core-model + design-system + editor-shell
  -> asset-pipeline + plan-engine + route-engine + mode-showroom
  -> render-plan-2d + render-scene-3d + project-store
  -> PlanCanvas -> render-plan-2d -> PixiJS
  -> SceneCanvas -> render-scene-3d -> Three.js / R3F
  -> render-scene-3d -> exporter -> desktop-host -> project-io -> media-export
  -> project-store -> command-bus + core-model
  -> desktop: TauriProjectBackend -> desktop-host -> project-io + asset-io
  -> development web: SandboxProjectBackend-owned seeded Blob URLs + ProjectStore source leases

apps/player -> design-system (deferred noninteractive boundary)
```

`core-model` owns schema-v3 parsing, deterministic v1 -> v2 -> v3 migration, immutable profile contracts, durable building/content/route/material/environment records, and their cross-record invariants. Stored plan coordinates are millimetres and rotations are radians. M2.4 adds no schema version and no SQLite storage migration.

`command-bus` is the serialized mutation path. Exact before/after values, inverse payloads, normalized rows, journal entries, metadata, and the next immutable snapshot publish in the same SQLite transaction. ProjectStore coordinates save, autosave, undo/redo, close, recovery, asset import and asset-source lifetime.

## Durable and transient ownership

| State or resource | Sole owner | Persistence |
| --- | --- | --- |
| floors, layers, entities, openings, content, routes, assets | ProjectStore snapshot | schema v3 / SQLite |
| material definitions and assignments | ProjectStore snapshot | schema v3 / SQLite |
| singleton scene environment | ProjectStore snapshot via `scene.environment.patch` | schema v3 / SQLite |
| view mode, per-floor camera, renderer status/error | Studio Zustand session | transient only |
| selection, tools, drafts, previews, focused route | Studio Zustand session | transient only |
| Asset source leases / Blob URLs | ProjectStore owns renderer-facing leases; the source backend owns URL creation/revocation | transient source lease |
| Three/R3F geometry, materials, textures, render targets | render-scene-3d resource registry | transient renderer resource |
| export request, progress, result, cancellation | Studio/exporter coordinator | transient only |
| PNG codec and validation | media-export | transient stream/file evidence |
| export staging, name, and publication | project-io | generated `exports/` output |

Zustand stores transient UI state only. React, PixiJS, Three.js, R3F, and Zustand never own or directly mutate business data. Three/R3F records are projections keyed back to durable source IDs. The 3D layer consumes ProjectStore asset-source and issue ports; it never persists URLs and never directly revokes a source-backend Blob URL.

## 2D building, content, and route boundary

M2.1 project-bound import publishes immutable content-addressed bytes and durable metadata separately, then ProjectStore commits allowlisted asset/reference records. Plan-reference previews and calibration drafts remain transient until one exact reversible command is confirmed.

M2.2 wall/opening edits use one `building.structure.patch`. Deterministic room recognition is transient; explicit confirmation alone publishes a normal `SpaceUnit`. Catalogue descriptors remain runtime metadata; placements persist only ordinary schema-v3 fixture fields.

M2.3 content/media/network/route changes use `snapshot.records.patch`. Product hotspots and required content publish atomically. A `GuidedRoute` stores stop node IDs only; resolved paths and previews are recomputed. PixiJS projects records but does not own them.

## M2.4 synchronized 3D boundary

Showroom defaults to `2d` and exposes `2d`, `3d`, and a fixed 50/50 `split`. Market stays 2D-only. SceneCanvas and PlanCanvas share the active floor, selection, and guided-route scope through the Studio session while consuming the same immutable ProjectStore snapshot.

`render-scene-3d` exposes these public boundaries:

- `SceneRendererInput`: snapshot, active floor, selected IDs, active guided-route projection, camera, and asset issues;
- `SceneRecord`: stable `floor`, `wall-piece`, `opening`, `fixture-part`, `hotspot`, and `route` records;
- `SceneProjectionIssue`: stable codes with sorted source IDs; any projection error fails closed to an empty scene rather than publishing a partial result;
- `SceneRenderer` / `SceneRendererFactory`: init, update, resize, frame, retry, and destroy;
- `SceneCameraState`: position, target, and field of view;
- `SceneExportPort`: an immutable scene/camera capture and dedicated offscreen readback contract reserved for M2.5.

Projection covers space-unit/zone floors, walls and door/window openings, all seven showroom catalogue fixture kinds, a compatible generic fixture box, product hotspots, and validated guided routes. Plan references, boundaries, dimensions, and ordinary POIs are deliberately ignored by 3D projection. Coordinates map as `(x / 1000, elevation / 1000, -y / 1000)`; routes sit 30 mm above their floor reference.

Material assignment is deterministic for space floors, walls, and fixtures. A missing material uses the documented defaults. A missing or undecodable texture reports a safe issue and retains `baseColor`. Material textures resolve only from project-bound PNG, JPEG, or sanitized SVG assets. Selection uses a separate overlay and never mutates the durable material.

The environment maps the one durable ambient light and one durable directional key light. R3F uses demand rendering, sRGB output, ACES tone mapping, normalized key direction, bounded softness-derived shadow radius, and padded shadow bounds. M2.4 has no arbitrary lights or shaders.

## Renderer and source lifecycle

Geometry is owned per stable scene record. Materials and decoded textures are fingerprint-shared through reference counts. A replacement attaches new records before retiring old records. Async completions carry a generation; late results are discarded and any newly allocated renderer resources are released. R3F automatic disposal is disabled for registry-owned resources so each resource is released exactly once.

ProjectStore remains the sole owner of renderer-facing source leases. The source backend owns Blob URL creation/revocation; in the dedicated Web Demo that backend is `SandboxProjectBackend`. Renderer destroy, scene replacement, failed decode, and late completion release only renderer-owned resources and source leases through the supplied port.

A WebGL creation failure or renderer failure preserves the complete 2D workflow. Context loss gets one automatic reconstruction attempt. A further failure moves the 3D renderer to `disabled`; an explicit retry creates a fresh recovery round. Texture decode failure preserves base-color rendering. No browser, GPU, or visual correctness is inferred from the injected/fake-renderer tests.

## M2.5 export ownership chain

`render-scene-3d` captures one immutable current scene/camera/provenance and performs dedicated offscreen readback. The pure `exporter` package validates preset, scope, textures, GPU limits, frame dimensions, and top-left bounded row streaming. It never owns React, DOM, Tauri, paths, files, or PNG encoding.

`desktop-host` owns the strict JSON/raw-byte IPC boundary and the per-session active-export lifecycle. `project-io` owns the verified project `exports/` directory, private staging, no-overwrite naming, crash cleanup, and project-relative result. `media-export` alone owns opaque RGBA8 sRGB PNG encoding and validation. This dependency direction is `render-scene-3d -> exporter -> desktop-host -> project-io -> media-export`; no layer writes business state.

## Local Web Demo source boundary

`StudioRoot` is the only mode fork. Ordinary modes mount the existing `App` and retain the unchanged fail-closed `selectBackend()`/Tauri path; only Vite `--mode web-demo` mounts `WebDemoApp`.

`WebDemoApp` owns verified bundled-seed loading, generation/Abort control, and the in-memory `ProjectStore`/`SandboxProjectBackend` session lifecycle. `SandboxProjectBackend` remains the sole creator and revoker of Web Demo Blob URLs while ProjectStore owns their source leases. No partially validated snapshot or asset set is published.

The preview reuses the normal PlanEditor with default 2D plus the existing synchronized 3D and fixed split projections. It adds no browser persistence, service worker, native command, capability, browser export backend, or production-Web sandbox bypass. Refresh/Back/Retry creates a new canonical session. The localhost build/server/browser/WebGL runtime gate remains separate and pending explicit approval.


## Native command and permission boundary

`desktop-host` exposes exactly twelve typed invokes:

1. `create_project`
2. `open_project`
3. `commit_project`
4. `checkpoint_project`
5. `close_project`
6. `recover_project`
7. `import_project_asset`
8. `cancel_project_asset_import`
9. `begin_project_export`
10. `write_project_export_chunk`
11. `finish_project_export`
12. `cancel_project_export`

Asset reads use the session-bound custom protocol, not another invoke. Export bytes use one strict raw chunk command. Failures use `{ code, message, details, logRef }`. The `main` window retains exactly `core:window:default` and `dialog:allow-open`; no broad filesystem, shell, HTTP, SQL, Sandbox export, or new M2.5 capability is enabled.

## Persistence, migration, and current boundary

`project.db` remains the mutable source of truth and `manifest.json` the identity/compatibility cache. New projects use schema v3. A coherent v1/v2 project migrates deterministically before editor publication; M2.4 introduces no migration. Materials and assignments use allowlisted `snapshot.records.patch`; environment edits use strict `scene.environment.patch` with exact before-state validation through apply, undo, redo, reopen, and recovery.

M2.4 Tasks 0-17 are implemented and independently reviewed at the current baseline. Task 17 passed Studio 4/4, ProjectStore 1/1, render-scene-3d 2/2, project-io M2.4 1/1, schema-v3 recovery 8/8, scene-environment replay 6/6, desktop-host command contract 21/21, three TypeScript checks, rustfmt, and Cargo check.

Task 18's full non-build gate passed: frozen install exited 0 for 14 workspace projects and was already up to date; lint first exited 1 on eight M2.4-introduced issues, then passed after minimal repairs in five files; typecheck exited 0 with 13 of 14 workspace projects completed; Node policy tests passed 32/32; Vitest passed 68 files and 1,355 tests with only the known non-failing JSDOM HTMLCanvasElement.getContext notice; rustfmt exited 0; Rust tests passed 208 with one approved ignored Windows privileged reparse/symlink test while the deterministic reparse-bit unit test passed; and Cargo check exited 0. Schema v3, the exact eight commands, and both protected hashes remain unchanged. Final independent review passed with no findings: Spec Compliance Pass; Code/Doc Quality Approved; Critical/Important/Minor None; Ready Yes. M2.4 is accepted and closed.

M2.5 Tasks 0-20 are complete and independently closed without changing schema v3 or storage migration 1. Player, Market 3D/export, publish, MP4, `.twinpack`, GLTF, arbitrary lighting/shaders, 3D geometry editing, and remote runtime assets remain absent.

The Local Web Demo source implementation is present on top of that accepted baseline. Source tests and policy gates are distinct from Task 6 runtime acceptance: no build, dev server, browser, Playwright, screenshot, real-GPU, visual, or performance result is claimed until that separately approved gate runs.
