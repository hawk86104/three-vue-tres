# AetherTwin Local Web Demo Design

**Date:** 2026-08-14

**Status:** Source implementation complete; runtime acceptance pending explicit approval

**Baseline:** `codex/aethertwin-m2@87b6dbc4`

## Implementation status

Tasks 1-4 are implemented, independently reviewed, and committed through `5f49ace12d7226a9a3eace727b90f87c6aa73f13`: seeded sandbox state, verified bundled fixtures, generation-safe WebDemoApp lifecycle, and the exclusive Vite/root/policy boundary are present. Task 5 documentation and independent-review repairs are applied. Focused RED/GREEN covered duplicate seed paths, duplicate manifest consumption, and strict port binding; final lint, typecheck, Node 51/51, Vitest 81 files / 1,542 tests, and diff check all exited 0. Clean independent re-review returned Critical/Important/Minor 0, Spec Pass, Quality Approved, Ready Yes.

Task 6 remains a distinct acceptance gate. No `build:web-demo`, localhost server, real browser, screenshot, Playwright, or real WebGL command has run under current approval, so this status claims implementation but not visible rendering or visual correctness.

## Goal

Deliver the first locally experienceable browser preview of AetherTwin at
`http://127.0.0.1:4173`. The preview opens the canonical schema-v3 Showroom
Demo directly, preserves the implemented 2D/3D/split authoring experience, and
truthfully omits native-only persistence and PNG publication.

This is a dedicated Web Demo build mode. It is not a general production Web
backend, a single-file HTML artifact, or a replacement for the Tauri desktop
application.

## Approved decisions

- The preview automatically opens the canonical Showroom Demo.
- Refreshing or resetting restores the exact canonical Demo; browser
  persistence is not implemented.
- A dedicated `web-demo` Vite mode injects the compile-time value
  `VITE_AETHERTWIN_WEB_DEMO=1`.
- Ordinary production Web startup remains fail-closed outside Tauri.
- The Web Demo has no `ProjectExportBackend`; Export remains visible but
  disabled with the existing desktop-required explanation.
- Build, dev-server, browser, screenshot, Playwright, and real-GPU validation
  require separate explicit approval after implementation.

## Architecture and isolation

### Bootstrap selection

`apps/studio/src/main.tsx` selects exactly one root:

- ordinary modes render the existing `<App />`;
- `VITE_AETHERTWIN_WEB_DEMO === "1"` renders a new `<WebDemoApp />`.

The flag is emitted by `apps/studio/vite.config.ts` only when Vite runs with
`--mode web-demo`. No committed `.env` file is introduced.

`selectBackend()`, `TauriProjectBackend`, the twelve native commands, the two
desktop capabilities, and the ordinary non-Tauri production failure remain
unchanged. The Web Demo does not pretend that the desktop runtime exists.

### WebDemoApp

`WebDemoApp` owns one complete preview-session generation:

1. load and verify the canonical snapshot and four local fixture assets;
2. create a seeded `SandboxProjectBackend`;
3. create a `ProjectStore` and open the seeded project;
4. render `PlanEditor` with `backendMode="sandbox"` and
   `exportBackend={null}`;
5. cancel loading and dispose the store/backend on reset, replacement, or
   unmount.

The ordinary `App` and Project Center are not mounted in this mode. The
PlanEditor Back action resets the complete preview session and reopens the
canonical Demo.

### Seeded sandbox contract

`SandboxProjectBackend` gains an optional, sandbox-specific seed input while
its no-argument behavior remains byte-for-byte compatible:

```ts
export interface SandboxProjectSeedAsset {
  readonly relativePath: string;
  readonly blob: Blob;
}

export interface SandboxProjectSeed {
  readonly openedProject: OpenedProject;
  readonly assets: readonly SandboxProjectSeedAsset[];
}

export interface SandboxProjectBackendOptions {
  readonly seed?: SandboxProjectSeed;
}
```

The constructor parses and clones the manifest and snapshot, requires
`projectPath === "sandbox://" + snapshot.project.id`, checks manifest identity,
name, profile, and schema against the snapshot, and requires a one-to-one match
between snapshot asset relative paths and seed assets. Duplicate, missing, and
extra asset paths are rejected. Blob media type and byte size must match the
durable `AssetRecord`.

SHA-256 verification happens before construction in the async Web Demo loader.
The constructor receives only verified blobs. The backend remains the sole
owner of Blob storage and object-URL revocation.

## Demo loading and data flow

The loader imports:

- `fixtures/contracts/showroom-demo.v3.json`;
- `fixtures/assets/showroom-demo/manifest.json`;
- `plan-reference.svg`, `floor.png`, `wall.jpg`, and `fixture.svg` through
  Vite-owned local asset URLs.

The snapshot is parsed with the production schema-v3 parser. The loader creates
a deterministic manifest from the snapshot using the fixed Demo timestamp
`2026-08-09T12:34:56.789Z` and an application-local Web Demo version string.
For every asset-manifest entry it:

1. resolves only the statically bundled local URL;
2. fetches the complete bytes with the current generation's `AbortSignal`;
3. checks HTTP success, media type, byte size, and SHA-256;
4. matches the digest to exactly one snapshot `AssetRecord`;
5. creates the Blob passed to the sandbox seed.

No project session is published until the snapshot and all four assets pass.
Remote URLs, CDN fallback, native paths, `file://`, drive/UNC paths, and
partially loaded sessions are forbidden.

The initial editor view remains 2D to preserve the Showroom contract. Users can
switch to synchronized 3D or fixed 50/50 split and can exercise the existing
floor, selection, opening, fixture, hotspot, content, route, material,
environment, asset-import, save/checkpoint, undo, and redo paths for the current
in-memory session.

## User-visible behavior

Above the editor, the Web Demo displays a compact persistent notice:

> 本地预览 · 修改将在刷新后重置 · PNG 导出仅桌面版

The notice does not obstruct the canvas or change editor command semantics.
Export uses the existing disabled state and accessible description because the
Web Demo passes `exportBackend={null}`.

Loading displays a neutral progress state without invented percentages. A load
failure displays a safe message and one Retry action. Retry starts a new
generation; it never reuses a partly initialized store or backend.

The Back action, explicit Retry, and browser refresh all return to the exact
canonical Demo. No UI claims autosave across refresh, project-directory
ownership, recovery, native export, or browser persistence.

## Lifecycle and errors

Each load owns a monotonically increasing generation and an `AbortController`.
Every async completion checks both generation and mounted state before
publishing. Reset or unmount follows this order:

1. invalidate the generation;
2. abort outstanding local asset requests;
3. dispose an unpublished partial backend, if any;
4. dispose the published ProjectStore;
5. dispose its sandbox backend;
6. begin a fresh generation only when requested.

Disposal is idempotent. Late fetch, digest, store-open, renderer, or source
resolution results are discarded and may not replace the current session.

User-visible errors use stable Web Demo categories:

- `WEB_DEMO_PROJECT_INVALID`;
- `WEB_DEMO_ASSET_UNAVAILABLE`;
- `WEB_DEMO_ASSET_INVALID`;
- `WEB_DEMO_INITIALIZATION_FAILED`.

Messages do not contain absolute paths, stack traces, source filenames supplied
by users, browser internals, or raw lower-level exceptions. WebGL failure keeps
the existing complete 2D fallback and retry behavior.

## Commands and static output

`apps/studio/package.json` adds:

```json
{
  "scripts": {
    "web-demo": "vite --mode web-demo --host 127.0.0.1 --port 4173 --strictPort",
    "build:web-demo": "vite build --mode web-demo"
  }
}
```

`--strictPort` makes an occupied `4173` fail closed instead of silently moving the documented preview to another port.

The Vite base remains `"./"`, so `build:web-demo` produces an
`apps/studio/dist/` directory with `index.html` plus relative static assets.
The first supported experience is localhost serving, not double-click
`file://` execution and not a single self-contained HTML file.

## Test and policy design

Implementation follows RED/GREEN TDD.

### Seed backend tests

- accepts the exact canonical snapshot/manifest/assets;
- clones seed input and never publishes caller-owned mutable state;
- resolves every canonical asset through a backend-owned Blob URL;
- rejects duplicate, missing, extra, wrong-size, wrong-media-type, and
  mismatched-identity seeds;
- revokes object URLs and disposes exactly once.

### Loader and WebDemoApp tests

- publishes no editor before all assets validate;
- automatically opens the canonical Demo in 2D;
- renders the truthful persistent notice;
- exposes 3D and split while Export is disabled for the desktop-only reason;
- reset/back creates a fresh canonical session;
- Retry discards the failed generation;
- unmount and replacement reject late fetch/digest/open results;
- safe errors contain no absolute path, stack, or lower-level details;
- WebGL failure preserves 2D.

### Policy tests

- `web-demo` mode alone enables `VITE_AETHERTWIN_WEB_DEMO=1`;
- ordinary production Web startup still fails closed;
- schema remains v3;
- the native command count remains twelve;
- desktop capabilities remain exactly two;
- no remote runtime source, CDN, telemetry, or new Tauri invoke appears;
- no `.twinproj`, generated export PNG, build output, or credential is
  committed.

Focused Vitest, ProjectStore and Studio type checks, relevant Node policy tests,
and `git diff --check` are the automatic implementation gates. Build, dev,
browser, Playwright, packaged runtime, screenshot, and real-GPU checks are not
run without explicit current approval and are never inferred from fake/JSDOM
tests.

## Explicit exclusions

The first preview does not implement:

- IndexedDB, localStorage project persistence, service-worker offline caching,
  or cross-refresh recents;
- a single-file HTML artifact or supported `file://` launch;
- browser PNG export, native project publication, `.twinproj` open/save,
  recovery, or filesystem dialogs;
- Player, publish/share, MP4, `.twinpack`, GLTF, Market 3D/export, arbitrary
  lights/shaders, or 3D geometry editing;
- remote assets, remote APIs, telemetry, CDN dependencies, or runtime fallback.

## Acceptance

Source-level completion requires all approved behavior and exclusions, focused
tests and type checks passing, policy invariants unchanged, `git diff --check`
clean, and an independent specification/code review with no unresolved
Critical or Important finding.

Runtime completion is separate. Only after explicit approval may the agent run
the Web Demo command and browser/GPU checks. Until those checks run, the project
may claim that the localhost preview is implemented, but not that it visibly
rendered, achieved visual correctness, or passed real WebGL validation.

The existing unrelated working-tree entries
`crates/asset-io/Cargo.toml`, `crates/desktop-host/Cargo.toml`, and
`packages/mode-showroom/src/index.ts` remain untouched, unstaged, and outside
this feature.
