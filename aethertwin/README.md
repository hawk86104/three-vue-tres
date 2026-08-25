# AetherTwin Studio

AetherTwin is a local-first, desktop-first digital-twin authoring product with exactly two immutable project profiles: `showroom` and `market`. M0 through M2.5 are accepted and M2 is closed. Studio opens directly in the 2D editor. Showroom can switch to synchronized 3D or a fixed 50/50 split and export a project-bound PNG, while Market remains 2D-only. Player is still a deferred, intentionally noninteractive boundary.

## Implemented capabilities

- schema-v3 projects with deterministic v1 -> v2 -> v3 migration before editor-session publication and no M2.4 SQLite migration;
- floors/layers, 2D authoring, calibrated project-bound plan references, openings, deterministic room confirmation, seven showroom fixture kinds, product content/hotspots, and guided routes;
- showroom view modes `2d`, `3d`, and fixed `split`, defaulting to `2d`; Market exposes no 3D mode;
- deterministic 3D projection for space-unit/zone floors, walls and door/window openings, seven showroom catalogue fixture kinds, compatible generic fixtures, product hotspots, and the active guided route;
- reversible material definitions/assignments and the singleton scene environment through ProjectStore and CommandBus;
- project-bound PNG, JPEG, and sanitized SVG material textures; no remote runtime assets or persisted absolute paths;
- incremental Three/R3F resource ownership, generation-safe async texture resolution, and exact cleanup;
- WebGL or texture-decode failure that preserves 2D and base-color rendering; one automatic context-loss recovery attempt, then `disabled` until an explicit retry starts a fresh round;
- a Showroom-only Export panel with `full-hd` 1920 x 1080 and `ultra-hd` 3840 x 2160 presets, scope-safe capture, bounded PNG streaming, cancellation, no-overwrite publication, and a project-relative result.

## Local Web Demo

The dedicated localhost Web Demo source is implemented without changing the ordinary desktop or production-Web startup path. From `aethertwin/`, its configured command is:

```powershell
pnpm.cmd --filter @aethertwin/studio web-demo
```

The configured address is `http://127.0.0.1:4173`; the command fails if that port is occupied rather than falling back to another port. This mode automatically opens the fully verified canonical Showroom Demo, starts in 2D, and reuses the existing 3D and fixed split views. Its project and assets are held only in memory; Back, Retry, or browser refresh creates a fresh canonical session, so edits do not survive refresh.

PNG export remains desktop-only. In the Web Demo, Export stays visible but disabled with the desktop-required explanation. Browser persistence, `.twinproj` open/save, recovery, native dialogs, and browser publication are not implemented. Direct `file://` launch and a single self-contained HTML file are unsupported; the first supported delivery is localhost serving.

Task 6 runtime acceptance ran under explicit approval on 2026-08-14. The dedicated build completed, Vite bound the strict address `http://127.0.0.1:4173`, and a headed Chromium session opened the canonical Demo. The real browser verified the 2D, 3D, and fixed 50/50 split views, shared selection and active-floor state, disabled desktop-only Export, fresh Back/refresh behavior, and a WebGL2 context. One forced context loss reconstructed 3D; a second loss disabled 3D and left a complete interactive 2D pane. All recorded requests were loopback or same-origin Blob URLs, and browser storage remained empty.

Runtime acceptance exposed and repaired fixture byte rewriting, SVG/raster texture upload, nested R3F root recovery, shadow-mode, and favicon gaps before the final pass. The final source gate passed lint, typecheck across 14/15 workspace projects, Node 53/53, and Vitest 82/82 files with 1,547/1,547 tests. The final Web Demo build transformed 3,215 modules and emitted only relative asset references. Chromium recorded zero console errors; the remaining warnings came from the upstream Three/R3F clock deprecation and the intentionally forced context-loss teardown. This is real evidence for this machine and browser, not a cross-device visual-correctness or performance certification. No screenshot was captured.

The Task 5 non-build source gate passed after recorded, attributable repairs: lint first found one type-only import; Node policy exposed one stale deferred-action rule; independent review then found duplicate asset mappings, a non-strict port, and documentation inconsistencies. Each behavioral repair was proven by focused RED/GREEN tests. On the final bytes, lint and typecheck exited 0, Node passed 51/51, Vitest passed 81/81 files and 1,542/1,542 tests, and `git diff --check` exited 0. Clean independent re-review returned Critical/Important/Minor 0, Spec Pass, Quality Approved, Ready Yes.

## Windows portable preview

The internal, unsigned Windows 10/11 x64 portable preview completed its
separately approved package and runtime acceptance on 2026-08-20. Regenerate it
from `aethertwin/` with:

```powershell
pnpm.cmd package:web-demo:win-x64
```

The intended recipient workflow is to unzip the package and double-click
`AetherTwin-Preview.exe`; the target machine needs no Node.js, pnpm, or
installer. The visible console prints the actual loopback URL, preferring
`http://127.0.0.1:4173/` and using another free loopback port only when 4173 is
occupied. If the default browser cannot open, copy that printed URL. Close the
console to stop the preview. Edge and Chrome are the acceptance baseline.

The accepted ZIP was built from source commit
`6ec8d499425f7578902fc18799839a00ee9e4bd9` and had SHA-256
`AC144D56A47EC23C169B0616E7FF6A7596D2302C3CCADD07A0DE331B657E0F84`.
Its fixed root contained `AetherTwin-Preview.exe`, `app/`, `README.txt`,
`BUILD_INFO.json`, `SHA256SUMS.txt`, and `THIRD_PARTY_NOTICES.md`; all 26
payload checksums and all relative HTML references were verified after
extraction to a path containing Chinese characters and spaces. The generated
ZIP, staging tree, Studio `dist/`, and acceptance extraction were then removed
as required by the artifact policy, so this hash records the accepted artifact
rather than promising that the ZIP remains in the worktree.

With PATH restricted to Windows system tools, the EXE used no Node.js or pnpm
child process, bound `127.0.0.1:4173`, and selected another loopback port when
4173 was deliberately occupied. Automated sessions using the installed Edge
and Chrome binaries verified the canonical Showroom in 2D, synchronized 3D,
and fixed split; shared selection, Back/refresh/restart reset behavior, the
disabled desktop-only Export explanation, WebGL2, and 2D survival after forced
WebGL context loss. Observed requests were limited to loopback plus owned
Blob/data URLs, browser storage remained empty, and stopping each console
process closed its listener.

This source does not add browser persistence, project open/save or recovery,
native dialogs, remote services, `file://`, a single-file HTML build, Player,
publish, signing, ARM64, macOS, Firefox support, or cross-device/performance
guarantees. This is bounded evidence for the accepted artifact on this machine
with the installed Edge and Chrome versions, not a signed release,
cross-device visual certification, or performance certification. No screenshot
was captured.

## Studio interface language

Studio starts in Simplified Chinese and exposes a visible language selector in
the project centre, Web Demo loading/error states, and editor header. English
is an alternative presentation language; changing it updates visible copy in
place without translating authored project names, stable IDs, paths, command
payloads, or stored data.

Normal Studio remembers the selection in local storage under
`aethertwin.studio.locale.v1`. A missing, malformed, or inaccessible value
falls back to Simplified Chinese. The Web Demo and Windows portable preview use
an in-memory preference only: they do not use browser persistence and return to
Simplified Chinese after refresh or a new session.

User-facing failures are rendered from known stable error-code mappings; an
unknown error receives a safe generic message. Raw error messages, paths,
details, stacks, and untrusted diagnostic references are not presentation
copy. Developer galleries, test fixtures, internal logs, and the portable-host
console are intentionally outside this translation scope.

The bilingual source gate consists of the localization, visible-action, Web
Demo, and offline policy tests; the focused Studio/editor-shell Vitest suite;
both TypeScript checks; lint; and `git diff --check`. Build, dev server,
browser, Playwright, screenshot, WebGL, and packaged-runtime acceptance remain
separately approved operations. Bilingual browser/build acceptance has not run
as part of this source closure.

## Ownership and dependency direction

```text
Studio React application
  -> core-model + design-system + editor-shell
  -> asset-pipeline + plan-engine + route-engine + mode-showroom
  -> render-plan-2d + render-scene-3d
  -> render-scene-3d -> exporter -> TauriProjectExportBackend
  -> project-store -> command-bus + core-model

Desktop backend
  -> TauriProjectBackend -> desktop-host
  -> desktop-host -> project-io + asset-io
  -> project-io -> media-export + verified exports/ publication
  -> project-io -> SQLite/filesystem project state
  -> asset-io -> staged import + verified content-addressed reads

Development sandbox
  -> SandboxProjectBackend (in-memory project metadata and Blob-backed assets)
```

ProjectStore is the durable UI coordinator and owns renderer-facing asset source leases. In the dedicated Web Demo, `SandboxProjectBackend` alone creates and revokes seeded asset Blob URLs. Materials, assignments, the scene environment, assets, building/content/route records, and all other business data exist only in the ProjectStore snapshot. Camera, view mode, renderer status/errors, selection, previews, and other session state exist only in Zustand. React, PixiJS, Three.js, R3F, decoded textures, and renderer resource tables do not own or mutate business data and never revoke source-backend URLs directly.

The native boundary is exactly twelve typed Tauri invokes: six project commands, `import_project_asset`, `cancel_project_asset_import`, and `begin_project_export`, `write_project_export_chunk`, `finish_project_export`, `cancel_project_export`. Asset bytes use the session-bound `aethertwin-asset` protocol. Desktop capabilities remain exactly `core:window:default` and `dialog:allow-open` for the `main` window; export adds no capability.

## Deliberate boundary

M2.5 adds only Showroom PNG export and deterministic Demo/evidence. It does not add publish, MP4, `.twinpack`, Player, Market 3D/export, GLTF import/export, arbitrary lights or shaders, 3D geometry editing, remote services, CDN assets, or remote runtime fallbacks. Sandbox export remains absent.

## Verification boundary

Task 17 passed its focused acceptance evidence: Studio 4/4, ProjectStore 1/1, render-scene-3d 2/2, project-io M2.4 1/1, schema-v3 recovery 8/8, scene-environment replay 6/6, desktop-host command contract 21/21, three TypeScript checks, rustfmt, and Cargo check. Independent final re-review reported no Critical, Important, or Minor findings.

Task 18's full non-build gate passed: frozen install exited 0 for 14 workspace projects and was already up to date; lint first exited 1 on eight M2.4-introduced issues, then passed after minimal repairs in five files; typecheck exited 0 with 13 of 14 workspace projects completed; Node policy tests passed 32/32; Vitest passed 68 files and 1,355 tests with only the known non-failing JSDOM HTMLCanvasElement.getContext notice; rustfmt exited 0; Rust tests passed 208 with one approved ignored Windows privileged reparse/symlink test while the deterministic reparse-bit unit test passed; and Cargo check exited 0. Schema v3, the exact eight commands, and both protected hashes remain unchanged. Final independent review passed with no findings: Spec Compliance Pass; Code/Doc Quality Approved; Critical/Important/Minor None; Ready Yes. M2.4 is accepted and closed.

M2.5 Task 18's final vertical gate passed 13/13 focused Vitest tests, three TypeScript checks, media-export 12/12, project-io 2/2, desktop-host 1/1, four-crate all-targets Cargo check, rustfmt, and diff check. The canonical Showroom Demo is offline and deterministic. Task 19's policy gate passed 45/45 and its independent documentation re-review returned Pass / Approved / Ready Yes with no findings.

M2.5 Task 20's final reviewed non-build gate passed on the final source bytes: frozen install for all 15 workspace projects, lint, typecheck across 14/15 workspace projects, Node policy 45/45, Vitest 77/77 files and 1,500/1,500 tests, rustfmt, Rust 302 passed with 2 approved privileged-Windows tests ignored, four-crate all-targets Cargo check, and diff check. The final independent review returned Spec Compliance Pass, Code Quality Approved, Critical/Important/Minor None, and Ready Yes. Schema remains v3; the native surface is exactly twelve commands; desktop capabilities remain exactly two; both protected manifest hashes remain unchanged. Full evidence and exclusions are in `docs/M2_REPORT.md`. M2.5 is accepted and M2 is closed.

Task 20's earlier non-build gate did not claim build or runtime evidence; Local Web Demo Task 6 and portable Task 4 later ran as separate, explicitly approved gates described above. No screenshot, cross-device visual-correctness, or performance evidence is claimed. In a non-Tauri production web context Studio fails closed; the Vite-only sandbox is not a browser-persistence claim.
