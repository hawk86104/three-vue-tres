# AetherTwin Studio

AetherTwin is a local-first, desktop-first digital-twin authoring product with exactly two immutable project profiles: `showroom` and `market`. M0 through M2.4 are accepted and closed. Studio opens directly in the 2D editor. Showroom can switch to synchronized 3D or a fixed 50/50 split, while Market remains 2D-only. Player is still a deferred, intentionally noninteractive boundary.

## Implemented capabilities

- schema-v3 projects with deterministic v1 -> v2 -> v3 migration before editor-session publication and no M2.4 SQLite migration;
- floors/layers, 2D authoring, calibrated project-bound plan references, openings, deterministic room confirmation, seven showroom fixture kinds, product content/hotspots, and guided routes;
- showroom view modes `2d`, `3d`, and fixed `split`, defaulting to `2d`; Market exposes no 3D mode;
- deterministic 3D projection for space-unit/zone floors, walls and door/window openings, seven showroom catalogue fixture kinds, compatible generic fixtures, product hotspots, and the active guided route;
- reversible material definitions/assignments and the singleton scene environment through ProjectStore and CommandBus;
- project-bound PNG, JPEG, and sanitized SVG material textures; no remote runtime assets or persisted absolute paths;
- incremental Three/R3F resource ownership, generation-safe async texture resolution, and exact cleanup;
- WebGL or texture-decode failure that preserves 2D and base-color rendering; one automatic context-loss recovery attempt, then `disabled` until an explicit retry starts a fresh round;
- a camera/offscreen `SceneExportPort` for the future M2.5 implementation, without an Export control or M2.4 output workflow.

## Ownership and dependency direction

```text
Studio React application
  -> core-model + design-system + editor-shell
  -> asset-pipeline + plan-engine + route-engine + mode-showroom
  -> render-plan-2d + render-scene-3d
  -> project-store -> command-bus + core-model

Desktop backend
  -> TauriProjectBackend -> desktop-host
  -> desktop-host -> project-io + asset-io
  -> project-io -> SQLite/filesystem project state
  -> asset-io -> staged import + verified content-addressed reads

Development sandbox
  -> SandboxProjectBackend (in-memory project metadata and Blob-backed assets)
```

ProjectStore is the durable UI coordinator and the only owner of Blob URL leases. Materials, assignments, the scene environment, assets, building/content/route records, and all other business data exist only in the ProjectStore snapshot. Camera, view mode, renderer status/errors, selection, previews, and other session state exist only in Zustand. React, PixiJS, Three.js, R3F, decoded textures, and renderer resource tables do not own or mutate business data and never revoke ProjectStore-owned Blob URLs.

The native boundary remains exactly eight typed Tauri invokes: the six project commands plus `import_project_asset` and `cancel_project_asset_import`. Asset bytes use the session-bound `aethertwin-asset` protocol, not a ninth invoke. Desktop capabilities remain exactly `core:window:default` and `dialog:allow-open` for the `main` window.

## Deliberate boundary

M2.4 does not add export, publish, Player, Market 3D, GLTF import/export, arbitrary lights or shaders, 3D geometry editing, remote services, CDN assets, or remote runtime fallbacks. M2.5 is the next milestone and may consume only the already exposed immutable camera/offscreen export port until a separately approved plan expands the product surface.

## Verification boundary

Task 17 passed its focused acceptance evidence: Studio 4/4, ProjectStore 1/1, render-scene-3d 2/2, project-io M2.4 1/1, schema-v3 recovery 8/8, scene-environment replay 6/6, desktop-host command contract 21/21, three TypeScript checks, rustfmt, and Cargo check. Independent final re-review reported no Critical, Important, or Minor findings.

Task 18's full non-build gate passed: frozen install exited 0 for 14 workspace projects and was already up to date; lint first exited 1 on eight M2.4-introduced issues, then passed after minimal repairs in five files; typecheck exited 0 with 13 of 14 workspace projects completed; Node policy tests passed 32/32; Vitest passed 68 files and 1,355 tests with only the known non-failing JSDOM HTMLCanvasElement.getContext notice; rustfmt exited 0; Rust tests passed 208 with one approved ignored Windows privileged reparse/symlink test while the deterministic reparse-bit unit test passed; and Cargo check exited 0. Schema v3, the exact eight commands, and both protected hashes remain unchanged. Final independent review passed with no findings: Spec Compliance Pass; Code/Doc Quality Approved; Critical/Important/Minor None; Ready Yes. M2.4 is accepted and closed.

Build, dev/debug, browser, Playwright, packaged-runtime, packaging, screenshot, real-browser, real-GPU, visual-correctness, and performance evidence is not claimed. In a non-Tauri production web context Studio fails closed; the Vite-only sandbox is not a browser-persistence claim.
