# AetherTwin M1 evidence report

## Evidence boundary

This report describes the implemented M1 source at Task 12. It separates commands run during Task 12 from evidence produced by earlier M1 tasks. Earlier task commits and recovery ledgers remain useful history, but no earlier command is presented here as if Task 12 reran it.

Task 12 uses a sandbox ProjectStore integration, a mocked native adapter command boundary, Rust project/native tests, static policy checks, and TypeScript type checks. It does not launch Tauri, a packaged application, a browser, or a GPU renderer.

## Completed M1 capabilities

- Core model schema v2 with deterministic schema-v1 migration and one derived default layer per floor.
- Schema-v2 native checkpoint upgrade before an editor session is exposed.
- Exactly two immutable profiles: `showroom` and `market`.
- Floors and explicit layers, with one active floor projected at a time.
- Six editable business entity kinds: boundary, wall, zone, space unit, fixture, and POI.
- Dimension annotation as a separate annotation entity.
- Nine visible tools: select, pan, boundary, wall, zone, space unit, fixture, POI, and dimension.
- Millimetre coordinates/dimensions and radian rotations, with explicit unit parsing at input boundaries.
- Selection, snapping, transforms, rectangular arrays, delete, undo, and redo.
- Generic reversible JSON `plan.entities.patch` journal through ProjectStore and CommandBus.
- Durable create/edit/save/close/reopen evidence, including array, undo, and redo state.
- Five renderer layers: `grid`, `content`, `annotation`, `overlay`, and `interaction`.
- One selection shared by the floor tree, Pixi canvas projection, accessible DOM mirror, and Inspector.
- PixiJS 8.19.0, with its MIT notice recorded in `THIRD_PARTY_NOTICES.md`.
- Six-command Tauri adapter mapping with exact schema-v2 snapshot, patch, checkpoint, and session payload evidence.

## Task 12 commands actually run

### Focused integration and policy tests

The exact Vitest command was run repeatedly while closing test-only integration boundaries:

```powershell
pnpm.cmd vitest run packages/core-model/src/core-model.test.ts packages/plan-engine/src packages/project-store/src/project-store.test.ts packages/project-store/src/plan-commands.test.ts packages/render-plan-2d/src apps/studio/src/backend/tauri-backend.test.ts apps/studio/src/features/plan-editor
```

Observed attempts:

| Attempt | Result |
| --- | --- |
| Initial integration | 19/20 files and 444/445 tests passed; the new integration file lacked a jsdom environment. |
| After jsdom boundary | The command exceeded its execution window because an inline test renderer factory changed identity on every render. |
| Stable renderer recovery | 19/20 files and 444/445 tests passed; the remaining assertion compared the read-only selection facade with a native `Set`. A jsdom canvas import warning also remained. |
| Selection and Pixi test mock fix | 20/20 files and 445/445 tests passed, exit 0, with no warning. |
| Native schema-v2 evidence added | 20/20 files and 446/446 tests passed, exit 0. |
| Final run after the contextual type fix | 20/20 files and 446/446 tests passed, exit 0; duration 15.97 s. |
| Fresh run after independent-review fixes | 20/20 files and 446/446 tests passed, exit 0; duration 13.82 s. |

The ProjectStore create/edit/array/undo/redo/save/close/reopen test was a characterization of already implemented behavior and passed when first included. Independent review then required exact intermediate evidence: the test now asserts the sequence and checkpoint sequence at every array/undo/redo state plus the ordered IDs and complete geometry of the boundary, source fixture, and five generated fixtures. The Tauri schema-v2 patch/checkpoint evidence also characterized the existing adapter pass-through contract; no production repair was required.

The exact Node policy command was also run repeatedly:

```powershell
node --test tests/workspace-structure.test.mjs tests/visible-actions.test.mjs tests/project-format-policy.test.mjs tests/offline-source-policy.test.mjs
```

Observed attempts:

| Attempt | Result |
| --- | --- |
| New M1 policies | 14/18 passed; three failures identified stale M0/schema-v1 documentation, and one order-sensitive tool assertion was invalid. |
| Tool source-order dependence removed | 15/18 passed; only documentation truth remained red. |
| Documentation GREEN | 18/18 passed, exit 0. |
| Final run | 18/18 passed, exit 0; duration 114.68 ms. |
| Review edge-case RED | 17/18 passed; the offline detector missed single-label, IPv4, and IPv6 protocol-relative remote URLs; duration 114.256 ms. |
| Broad protocol-relative recovery | 17/18 passed; the new edge cases passed, while the runtime scan exposed a Rust `//!` documentation-comment false positive; duration 84.8563 ms. |
| Fresh run after all review fixes | 18/18 passed, exit 0; duration 93.3838 ms. |

Independent-review policy fixes also made the nine-tool wiring assertion validate unique key/tool equality through a `Map` rather than source order, and bound the project-format policy to the production `parseAsset` to `parseRelativePath` path, the non-empty schema-v2 asset in `completeSnapshotInput`, and the existing unsafe-path rejection tests. The offline detector now performs Unicode-aware protocol-relative candidate discovery before URL parsing while continuing to permit loopback URLs and ignore source comments.

### TypeScript checks

These six commands were run:

```powershell
pnpm.cmd exec tsc -p packages/core-model/tsconfig.json --noEmit
pnpm.cmd exec tsc -p packages/plan-engine/tsconfig.json --noEmit
pnpm.cmd exec tsc -p packages/project-store/tsconfig.json --noEmit
pnpm.cmd exec tsc -p packages/render-plan-2d/tsconfig.json --noEmit
pnpm.cmd exec tsc -p packages/editor-shell/tsconfig.json --noEmit
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
```

The first sequence passed core-model, plan-engine, and project-store, then stopped when render-plan-2d exposed four `implicit any` parameters in the new Studio test helper. The helper received the existing `PlanEditorDependencies["workspace"]` contextual type. The complete six-command sequence was rerun and every command exited 0.

After the independent-review fixes, all six commands were run again and exited 0: core-model 1.5 s, plan-engine 1.6 s, project-store 1.5 s, render-plan-2d 2.8 s, editor-shell 2.2 s, and Studio 3.4 s.

### Rust checks

```powershell
cargo test -p project-io
cargo test -p desktop-host
cargo check -p project-io -p desktop-host
```

Observed results:

- `project-io`: 80 tests passed across unit and integration targets; 0 failed; doc tests contained 0 tests; exit 0.
- `desktop-host`: 25 tests passed across unit and command-contract targets; 0 failed; the main/doc targets contained 0 tests; exit 0.
- combined Cargo check: exit 0; the fresh post-review run finished in 0.58 s.

The fresh post-review Rust runs preserved the same totals: `project-io` 80/80 and `desktop-host` 25/25, with no failures.

Read-only Git scope/status/diff checks and the approved staged patch workflow were used throughout Task 12. Source-inspection and patch-application commands are implementation mechanics, not additional runtime evidence.

## Explicitly skipped commands and evidence

Project rules and the user's approval excluded all of the following, so none was run:

- build commands, including pnpm/npm build scripts and `cargo build`;
- dev, serve, preview, debug, or local-server commands;
- browser automation or manual browser validation;
- Playwright execution (the offline policy only inspects its source contract);
- Tauri application launch, packaged runtime, packaging, or installer execution;
- screenshots, image capture, or visual regression capture;
- full root package scripts, lint, Clippy, formatting, or other unlisted verification.

There is no real-browser, WebGL/WebGPU, or GPU performance evidence in M1. The integration test injects a fake renderer and uses a no-op Pixi module boundary to verify editor wiring without claiming GPU execution.

## Deferred and known limitations

Opening, product content, vendor, route network, theme, camera shot, and story sequence records are contract-only or deferred in M1. The corresponding authoring workflows are not exposed.

M1 does not provide a synchronized 3D preview, route authoring, accessible routing, search, vendor/data import, export/publish, screenshots, PNG/MP4 generation, `.twinpack` sharing, real Player/media, visitor themes, or kiosk behavior.

The save/reopen integration uses the in-memory sandbox backend; native persistence is evidenced separately by Rust tests and mocked adapter payloads. No packaged-runtime end-to-end test was run. Real-browser/GPU profiling and large-scene performance acceptance are deferred to M5, so this report makes no M5 performance claim.

## Next milestone

M2 is next: the showroom workflow must build on the M1 model, ProjectStore/CommandBus durability, plan engine, and renderer boundaries without duplicating business state or bypassing the journal.
