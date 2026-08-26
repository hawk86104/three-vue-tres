# Roadmap

## Current status

- M0 foundation: complete.
- M1 unified 2D authoring core: complete; evidence is in `M1_REPORT.md`.
- M2 showroom workflow: complete and accepted through M2.5.
  - M2.1 safe assets and calibrated plan references: accepted.
  - M2.2 openings, room recognition, and parametric showroom fixtures: accepted.
  - M2.3 content and guided routes: accepted.
  - M2.4 synchronized 3D, durable materials/environment, and renderer lifecycle: complete and accepted. Tasks 0-18, the full non-build gate, and final independent review are closed with no findings.
  - M2.5 export/demo/evidence: accepted; Task 20's final non-build gate and independent review closed with no findings.
- Local Web Demo: source, build, localhost, browser, and WebGL acceptance are complete; the current portable baseline was revalidated in installed Edge and Chrome on 2026-08-26.
- Bilingual Studio UI: complete; Simplified Chinese is the default and English is optional, with source-policy coverage plus Edge/Chrome portable-runtime acceptance.
- Windows portable preview: the internal unsigned Windows 10/11 x64 baseline is retained, integrity verified, and identified by an annotated source tag.
- M3 market workflow: next milestone, deferred until a separate high-reasoning specification and atomic plan are approved.
- M4 Player and media: deferred.
- M5 hardening and performance profiling: deferred; no performance claim is made.

Task 17 evidence is Studio 4/4, ProjectStore 1/1, render-scene-3d 2/2, project-io M2.4 1/1, schema-v3 recovery 8/8, scene-environment replay 6/6, desktop-host command contract 21/21, three TypeScript checks, rustfmt, and Cargo check.

Task 18's full non-build gate passed: frozen install exited 0 for 14 workspace projects and was already up to date; lint first exited 1 on eight M2.4-introduced issues, then passed after minimal repairs in five files; typecheck exited 0 with 13 of 14 workspace projects completed; Node policy tests passed 32/32; Vitest passed 68 files and 1,355 tests with only the known non-failing JSDOM HTMLCanvasElement.getContext notice; rustfmt exited 0; Rust tests passed 208 with one approved ignored Windows privileged reparse/symlink test while the deterministic reparse-bit unit test passed; and Cargo check exited 0. Schema v3, the exact eight commands, and both protected hashes remain unchanged. Final independent review passed with no findings: Spec Compliance Pass; Code/Doc Quality Approved; Critical/Important/Minor None; Ready Yes. M2.4 is accepted and closed.

M2.4 keeps schema v3, one SQLite storage migration, exactly eight native invokes, and the existing two desktop capabilities. Showroom defaults to 2D and supports 3D and fixed 50/50 split; Market remains 2D-only. The M2.4 closure gate itself was non-build and made no runtime claim; later Local Web Demo and portable-preview gates supplied the separately approved browser/WebGL evidence recorded below. No screenshot, cross-device visual, or performance claim is made.

## M2 closure result

The approved M2.5 plan is complete. Showroom has two fixed project-bound PNG presets, deterministic Demo sources, strict native publication, and cancellation/cleanup. Schema remains v3, the native surface is exactly twelve commands, and desktop capabilities remain exactly two.

Task 20's final gate passed frozen install, lint, typecheck, Node 45/45, Vitest 77 files and 1,500 tests, rustfmt, Rust 302 passed with 2 approved ignored privileged-Windows tests, four-crate all-targets Cargo check, and diff check. Final independent review returned Spec Compliance Pass, Code Quality Approved, Critical/Important/Minor None, and Ready Yes. M2.5 is accepted and M2 is closed. Publish, MP4, `.twinpack`, Player, Market 3D/export, GLTF, arbitrary lights/shaders, and 3D geometry editing remain deferred.

## Local Web Demo delivery

The dedicated `web-demo` Vite mode is implemented as an isolated localhost preview: it verifies and opens the canonical Showroom Demo in an in-memory sandbox, defaults to 2D, reuses 3D/split, and leaves ordinary production Web fail-closed. It does not add persistence, browser export, native commands, capabilities, remote sources, or a supported `file://` artifact.

The configured endpoint is `http://127.0.0.1:4173`. The separately approved
Task 6 run completed build, localhost, Chromium, and WebGL2 acceptance on
2026-08-14. The 2026-08-26 portable baseline then verified installed Edge and
Chrome, the Chinese default and live English option, 2D/3D/fixed split, shared
selection, disabled desktop-only Export, refresh reset, loopback/Blob-only
requests, empty browser storage, and clean host shutdown.

Initial WebGL creation now fails closed at source `988b16df`. When WebGL2 was
deliberately unavailable, the preview returned automatically to a complete 2D
view, disabled 3D/split, exposed localized unavailable/retry copy, and remained
stable after retry. Three.js context-creation errors are expected during this
injected failure only; normal Edge and Chrome paths had no unexpected console
errors.

## Internal portable baseline

- artifact: `AetherTwin-Preview-win-x64.zip`;
- version: `0.1.0`;
- size: `2,595,766` bytes;
- SHA-256: `CCC76399566C1056C949D7312333A554A6C791088BEBA6185BD214120D59BADF`;
- source: `988b16dfc548823b333be4401b9940a410043834`;
- accepted: `2026-08-26`;
- status: internal, unsigned, Windows x64 preview baseline;
- annotated source tag: `aethertwin-preview-v0.1.0-internal.20260826`.

The ZIP remains ignored at `artifacts/AetherTwin-Preview-win-x64.zip` and is
not committed or publicly released. The maintainable Git baseline is
`codex/aethertwin-baseline-20260826`, which preserves the 193-commit
AetherTwin continuation and explicitly merges refreshed `origin/master` at
`e3e79cba`. Its PR must remain pending human review and must not be squashed or
rebased.

## Milestone definitions

- M0 - Foundation: workspace, product shells, Project Center, persistence, CommandBus, save, close, and recovery.
- M1 - Unified authoring core: schema, plan engine, 2D rendering, transforms, snapping, dimensions, arrays, indexing, and undo/redo.
- M2 - Showroom workflow: calibrated plans, openings/rooms, fixtures/content, routes, synchronized 3D, materials/environment, then separately planned export/demo evidence.
- M3 - Market workflow: regions, booths, vendor CSV, POIs, routes, search, accessible routing, and guide-map export.
- M4 - Player and media: offline Player, visitor themes, kiosk behavior, deterministic frames, and optional media encoding.
- M5 - Hardening: validation, large-project profiling, accessibility, and interaction polish.

Every child milestone must distinguish implemented source/test evidence from runtime/browser/GPU evidence and must not expose controls before their durable path exists.
