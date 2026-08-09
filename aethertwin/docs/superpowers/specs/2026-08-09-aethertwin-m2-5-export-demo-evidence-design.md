# AetherTwin M2.5 Export, Demo, and Evidence Design

**Status:** Approved in conversation on 2026-08-09
**Milestone:** M2.5 — project-bound PNG export, deterministic Showroom Demo, and M2 closure evidence
**Branch:** `codex/aethertwin-m2`
**Baseline:** M2.4 closure commit `0df14ac9`
**Parent:** [`2026-07-22-aethertwin-m2-showroom-workflow-design.md`](./2026-07-22-aethertwin-m2-showroom-workflow-design.md)
**Supersedes where different:** [`2026-07-22-aethertwin-m2-5-export-demo-evidence-design.md`](./2026-07-22-aethertwin-m2-5-export-demo-evidence-design.md)

## 1. Goal

Complete M2 with project-bound offscreen PNG export for the current synchronized Showroom 3D view, a deterministic and reviewable Showroom Demo source fixture plus generator, and a truthful milestone evidence report.

M2.5 consumes the immutable `SceneExportPort` delivered by M2.4. It does not introduce another business model, persist camera state, or treat renderer objects as project data.

## 2. Approved scope

M2.5 delivers exactly:

- two opaque PNG presets: `full-hd` at 1920×1080 and `ultra-hd` at 3840×2160;
- export of the current Showroom 3D camera using a fixed 16:9 aspect ratio;
- no-overwrite publication under the current project `exports/` directory;
- a deterministic schema-v3 Showroom Demo source fixture, local fixture assets, and a developer generator;
- `docs/M2_REPORT.md` with complete automated evidence and explicit runtime-evidence gaps.

M2.5 does not deliver Player, visitor themes, kiosk behavior, MP4, `.twinpack`, GLTF, Market 3D, a remote publication service, a system Save As flow, transparent output, arbitrary export sizes, camera presets, or an end-user Create Demo action.

## 3. Locked platform boundaries

- Project schema remains v3. M2.5 adds no project-schema migration or SQLite storage migration.
- Export is an output operation. It does not enter ProjectStore, CommandBus, the journal, checkpoint state, dirty state, undo/redo, or `AssetRecord` collections.
- Native invokes increase from eight to exactly twelve by adding only the four export commands specified below.
- The existing two desktop capabilities remain unchanged. No broad filesystem, shell, HTTP, clipboard, or path-reveal capability is added.
- ProjectStore remains the sole owner of project-asset Blob URLs. M2.5 does not create a project-asset Blob URL.
- The two protected manifests `crates/asset-io/Cargo.toml` and `crates/desktop-host/Cargo.toml` are not modified, formatted, staged, or committed.
- Runtime source remains offline and contains no CDN or remote-asset fallback.

## 4. Component responsibilities

### `packages/render-scene-3d`

Owns immutable scene/camera capture, required-texture waiting, GPU-limit reporting, and dedicated offscreen RGBA readback. It restores visible renderer state and releases temporary render targets on success, failure, cancellation, context loss, replacement, and destroy.

`SceneExportCapture` gains immutable provenance:

```ts
export interface SceneExportProvenance {
  readonly projectId: string;
  readonly snapshotSequence: number;
  readonly activeFloorId: string;
}

export interface SceneExportCapture {
  readonly provenance: SceneExportProvenance;
  readonly scene: SceneProjection;
  readonly camera: SceneCameraState;
  readonly requiredTextureAssetIds: readonly string[];
  readonly limits: SceneGpuLimits;
}
```

The renderer derives provenance from the same `SceneRendererInput` that produced the captured scene. A capture is valid only for its renderer generation.

### `packages/exporter`

Becomes an active TypeScript package with no renderer, filesystem, React, or Tauri ownership. It owns:

- the exact preset table;
- request and result validation;
- capture-provenance checks;
- GPU-limit checks;
- typed progress and cancellation coordination;
- bottom-left to top-left row normalization;
- generation of zero-based sequential chunks no larger than 1,048,576 bytes;
- the separate `ProjectExportBackend` contract.

It must not allocate a second complete 4K frame. Row normalization uses one bounded chunk buffer while reading rows from the immutable RGBA frame in reverse order.

### `crates/media-export`

Becomes an active Rust crate. It owns 8-bit sRGB RGBA PNG streaming encode, exact raw-byte accounting, opaque-alpha validation, encoder finalization, PNG structural validation, and content hashing. It never chooses or resolves a project path.

The workspace pins `png = "=0.18.1"`. The crate may otherwise use approved workspace dependencies only.

### `crates/project-io`

Owns verified access to the project-bound `exports/` directory, unique staging files, regular-file and reparse/symlink defenses, fsync, collision-safe no-overwrite publication, and crash-staging cleanup. It depends on `media-export` and exposes export operations through the existing `project-io` dependency already held by `desktop-host`.

### `crates/desktop-host`

Owns the four typed Tauri commands, strict payload/header parsing, per-session export registry, lifecycle coordination, and safe error envelopes. It does not encode pixels or choose arbitrary paths.

### `apps/studio`

Owns the Export action, 16:9 framing mode, preset selection, progress, cancellation, result display, focus restoration, and session-generation rejection. Export state is transient and never enters ProjectStore or Zustand durable data.

## 5. Export data flow

The coordinator executes this order:

1. Require a Showroom session in `3d` or `split`, renderer status `ready`, a current `SceneExportPort`, and no active export.
2. Capture immutable scene, current camera, provenance, required texture IDs, and GPU limits.
3. Verify capture provenance matches the current project ID, snapshot sequence, active floor, and Studio session generation.
4. Resolve the selected fixed preset and reject it if either `maxTextureSize` or `maxRenderbufferSize` is smaller than the requested width or height.
5. Reject known required-texture issues with sorted asset IDs, then await all required textures. There is no base-color fallback for an export that claims the assigned texture.
6. Begin the native export session. Native verifies the open Showroom session, project ID, exact current snapshot sequence, and active floor before returning an export ID.
7. Render once through the captured `SceneExportPort` with the fixed preset width and height. The camera position, target, and vertical field of view remain unchanged; only the render aspect is 16:9.
8. Require `origin === "bottom-left"`, exact dimensions, and exactly `width * height * 4` RGBA bytes.
9. Stream top-left rows as sequential raw chunks to native while reporting exact uploaded bytes.
10. Finish native encoding/publication and return the safe result.

If cancellation occurs while texture waiting or render/readback is pending, the coordinator marks the operation cancelled immediately. A begun native session is cancelled and awaited. Any late texture or frame result is discarded without starting or resuming chunk delivery.

An ordinary project edit after native begin does not rewrite the immutable capture and does not invalidate the output. Project close, project replacement, renderer replacement, context loss, renderer destroy, or Studio session-generation change cancels the operation.

## 6. TypeScript export contracts

The preset and progress surface is closed:

```ts
export type ProjectExportPreset = "full-hd" | "ultra-hd";

export type ProjectExportPhase =
  | "preparing-textures"
  | "rendering"
  | "uploading"
  | "encoding-publishing";

export interface ProjectExportProgress {
  readonly phase: ProjectExportPhase;
  readonly sentBytes: number | null;
  readonly totalBytes: number | null;
}

export type ProjectExportDimensions =
  | {
      readonly preset: "full-hd";
      readonly width: 1920;
      readonly height: 1080;
    }
  | {
      readonly preset: "ultra-hd";
      readonly width: 3840;
      readonly height: 2160;
    };

export type ProjectExportResult = ProjectExportDimensions & {
  readonly relativePath: string;
  readonly byteSize: number;
  readonly sha256: string;
};

export interface ProjectExportBeginRequest {
  readonly provenance: SceneExportProvenance;
  readonly preset: ProjectExportPreset;
}

export type ProjectExportBeginResult = ProjectExportDimensions & {
  readonly exportId: string;
  readonly expectedByteLength: number;
  readonly maxChunkBytes: 1048576;
};

export interface ProjectExportBackend {
  begin(
    projectPath: string,
    request: ProjectExportBeginRequest,
  ): Promise<ProjectExportBeginResult>;
  writeChunk(
    projectPath: string,
    exportId: string,
    chunkIndex: number,
    bytes: Uint8Array,
  ): Promise<void>;
  finish(projectPath: string, exportId: string): Promise<ProjectExportResult>;
  cancel(projectPath: string, exportId: string): Promise<void>;
}
```

`ProjectExportBackend` is separate from `ProjectBackend`. The desktop adapter implements both; tests inject a dedicated fake export backend. ProjectStore consumes only `ProjectBackend`, and the Studio composition boundary receives the optional export capability it needs.

The backend uses the existing transient `projectPath` key to locate its tracked native session. It never returns or persists that absolute path in an export result.

## 7. Native command protocol

### `begin_project_export`

Strict JSON payload:

```json
{
  "sessionId": "uuid",
  "projectId": "uuid",
  "snapshotSequence": 0,
  "activeFloorId": "uuid",
  "preset": "full-hd"
}
```

Native derives width, height, and expected raw byte count from the preset. It validates safe integers, the tracked open session, Showroom profile, project ID, exact current snapshot sequence, and floor membership. Each session permits at most one active export.

Success returns:

```json
{
  "exportId": "uuid",
  "width": 1920,
  "height": 1080,
  "expectedByteLength": 8294400,
  "maxChunkBytes": 1048576
}
```

### `write_project_export_chunk`

The request body must be Tauri raw bytes, not JSON. The only accepted application metadata headers are:

- `X-Aether-Session-Id`;
- `X-Aether-Export-Id`;
- `X-Aether-Chunk-Index` as canonical unsigned decimal.

Unknown `X-Aether-*` headers are rejected. Tauri/internal transport headers are ignored rather than treated as application metadata.

Chunk indices start at zero and must be contiguous. Chunks are non-empty, at most 1,048,576 bytes, and may not make the cumulative total exceed the preset byte count. A gap, repeat, out-of-order index, oversized chunk, malformed body/header, or overrun atomically transitions the operation to failed and removes only its staging file.

### `finish_project_export`

Strict JSON payload contains only `sessionId` and `exportId`. Finish requires the exact expected raw byte count. It finalizes the PNG, validates PNG signature and IHDR, verifies the preset dimensions, 8-bit RGBA, sRGB declaration, and opaque alpha, flushes and fsyncs, computes SHA-256, and publishes no-overwrite.

### `cancel_project_export`

Strict JSON payload contains only `sessionId` and `exportId`. Cancellation is idempotent for the matching active or last-cancelled operation in the same session. Unknown, cross-session, or already-completed IDs cannot remove or alter a file. A bounded terminal marker is cleared on session close.

The finish/cancel race is serialized. Exactly one terminal transition wins; all resources and registry entries are released once.

## 8. File publication

Published names are:

```text
<sanitized-project>-<YYYYMMDDTHHMMSSmmmZ>-<preset>[-N].png
```

Project-name sanitization replaces control characters and `<>:"/\\|?*` with `-`, collapses replacement runs, trims trailing dots/spaces, and truncates on a UTF-8 character boundary to 80 bytes. An empty result uses `aethertwin-<first-eight-project-id-hex>`.

The UTC clock and UUID source are injectable for deterministic tests. Collision suffixes begin at `-1` and select the first absent name through no-replace publication. Existing exports are never opened for replacement or automatic deletion.

Staging names contain a private fixed prefix plus the export UUID. Cleanup on project open or recovery may remove only matching entries that are verified regular files inside the bound `exports/` directory. A symlink, reparse point, unexpected file type, or identity mismatch is quarantined or reported safely; it is never followed.

Success returns only a project-relative `exports/<name>.png` path, dimensions, byte size, and lowercase SHA-256.

## 9. Studio interaction

The Showroom Preview group is:

```text
2D / 3D / Split / Frame Selection / Frame Route / Export
```

Market never shows Export. Showroom 2D shows the action disabled with an instruction to switch to 3D or Split. In 3D/Split it is enabled only when the renderer is `ready`, the export port and provenance are current, and no export is active.

Export opens a right-side panel. While open, the 3D pane is resized into a real 16:9 letterboxed viewport, so the visible framing uses the same aspect as output. In Split, the fixed 50/50 layout and mounted 2D pane remain; letterboxing occurs only inside the 3D half.

The user may orbit before starting. The panel offers only the two fixed presets. Unsupported 4K is disabled with the actual GPU limit and is never silently downgraded. Output uses the durable scene background and an opaque render target; there is no transparent or override control.

Starting locks camera, active floor, view mode, and preset for the captured operation. Progress reports only truthful phases:

1. preparing textures;
2. rendering;
3. uploading with exact sent/total bytes;
4. encoding and publishing with no invented percentage.

Known required-texture problems show sorted asset IDs and prevent start. Failure leaves editing usable and retains the selected preset for retry. Closing the panel, pressing Escape during an active operation, replacing the project, or closing the project runs the same awaited cancellation path.

Success shows only relative path, resolution, PNG byte size, SHA-256, Export Again, and Close. There is no Open Folder, Save As, external share, clipboard-path, or publish action. Closing returns keyboard focus to Export.

## 10. Showroom Demo

The repository contains:

- `fixtures/contracts/showroom-demo.v3.json`;
- deterministic files under `fixtures/assets/showroom-demo/`;
- a manifest of expected SHA-256, media type, and purpose;
- a Rust example generator accepting one destination path and refusing an existing target.

The canonical demo contains exactly:

- one floor;
- one sanitized SVG plan reference with complete two-point calibration;
- four rooms and one zone;
- four doors and four windows;
- twenty-two fixtures: three instances of each of the seven Showroom catalogue descriptors plus one compatible generic fixture;
- ten product hotspots, ten `MediaAsset` records, and three shared local image assets;
- one connected route network and one guided route with five ordered stops;
- space-floor, wall, and fixture material assignments using PNG, JPEG, and sanitized SVG texture assets;
- the approved soft-light environment and shadows.

UUIDs, record order, geometry, calibration, fixture parameters, asset bytes, hashes, and generator clock inputs are fixed. The generator validates the same schema-v3 contracts and exercises real create, checkpoint, close/reopen, and recovery paths. It is developer tooling only and is not reachable from Studio or Player.

Generated `.twinproj` directories and exported PNG files are test/manual outputs and are not committed.

## 11. Errors and redaction

Stable frontend/renderer codes are:

- `EXPORT_RENDERER_NOT_READY`;
- `EXPORT_CAPTURE_EXPIRED`;
- `EXPORT_TEXTURE_UNAVAILABLE`;
- `EXPORT_RESOLUTION_UNSUPPORTED`;
- `EXPORT_FRAME_INVALID`;
- `EXPORT_CANCELLED`.

Stable native state codes are:

- `EXPORT_ALREADY_ACTIVE`;
- `EXPORT_NOT_FOUND`;
- `EXPORT_SESSION_MISMATCH`;
- `EXPORT_CHUNK_OUT_OF_ORDER`;
- `EXPORT_CHUNK_TOO_LARGE`;
- `EXPORT_BYTE_COUNT_MISMATCH`.

Stable native file codes are:

- `EXPORT_ENCODE_FAILED`;
- `EXPORT_VALIDATION_FAILED`;
- `EXPORT_PUBLISH_FAILED`.

Safe error details may contain preset, dimensions, safe counts, sorted asset IDs, and `logRef`. They never contain absolute paths, source filenames, SQL, database details, raw system errors, raw request headers, RGBA bytes, or staging names.

## 12. Lifecycle and race rules

- Renderer generation guards reject a capture after context loss, backend replacement, retry, or destroy.
- Studio session generation guards reject late texture, render, progress, finish, cancel, and focus events after project replacement.
- A native export holds a session operation lease. `close_project` and `close_all` request cancellation, wait for cleanup, and prevent post-close publication.
- Failed begin creates no registry entry or file. Failed write, finish, validation, or publication removes only the matching staging file.
- A failed metadata-free output operation never changes project sequence, checkpoint, recovery data, or clean-shutdown state.
- Production `SandboxProjectBackend` does not simulate a successful project-bound export. Studio receives no production export backend in sandbox mode and keeps Export disabled with a desktop-only explanation. Studio and coordinator tests inject a separate deterministic fake `ProjectExportBackend`.
- Renderer and native cleanup are idempotent and release each temporary resource exactly once.

## 13. Automated verification

Focused TypeScript/Vitest coverage includes:

- both preset mappings and exact byte counts;
- GPU texture/renderbuffer rejection without fallback;
- immutable provenance, camera, scene, limits, and required texture IDs;
- current camera with fixed 16:9 aspect;
- required-texture failure with sorted IDs;
- expired capture and renderer/session-generation races;
- bottom-left to top-left row order, including row data crossing chunk boundaries;
- bounded memory behavior through one reusable chunk buffer;
- sequential backend calls, progress, cancellation, and late-result discard;
- Showroom/Market/2D/3D/Split visible-action policy;
- real 16:9 letterbox resize, 4K disablement, phase text, focus return, and failure retry.

Focused Rust coverage includes:

- strict begin/finish/cancel DTO keys and safe integer bounds;
- raw-body requirement and exact `X-Aether-*` metadata parsing;
- gap, repeat, out-of-order, empty, oversized, overrun, underrun, and cross-session chunks;
- one-active-export enforcement and finish/cancel/close races;
- PNG signature, IHDR, 8-bit RGBA, sRGB, opaque alpha, and decode-to-exact-pixels;
- deterministic naming, collision suffix, no-overwrite publication, fsync, hash, and relative result;
- cancellation, encode failure, publish failure, crash staging, symlink/reparse, and identity mismatch cleanup;
- exact twelve-command invoke surface and unchanged two-capability policy;
- Demo materialization, semantic digest, save/checkpoint/close/reopen, and recovery equality.

M2 closure runs, only after the applicable execution approval:

```text
pnpm.cmd install --frozen-lockfile
pnpm.cmd lint
pnpm.cmd typecheck
node --test tests/*.test.mjs
pnpm.cmd vitest run
cargo fmt --all -- --check
cargo test -p media-export -p project-io -p asset-io -p desktop-host
cargo check -p media-export -p project-io -p asset-io -p desktop-host --all-targets
git diff --check
```

Build, dev, debug, browser, Playwright, packaged runtime, packaging, screenshot, real-GPU, visual-correctness, and performance commands are not run automatically under the project rule.

## 14. Evidence report

`docs/M2_REPORT.md` records:

- completed M2.1–M2.5 capabilities and explicit exclusions;
- every command actually run, exit code, test count, failure, repair, and retry;
- Demo contents and deterministic semantic digest;
- 1080p/4K contract, PNG structure, publication, cancellation, cleanup, and lifecycle evidence;
- schema v3, exactly twelve commands, unchanged capabilities, offline source, and path-redaction policy evidence;
- whether build/browser/GPU/visual execution was separately authorized and actually performed.

Injected/fake renderer evidence may prove request construction, pixel orientation, state restoration, PNG encoding, native publication, cancellation, and cleanup. It does not prove a real GPU frame or visual correctness. If separate runtime approval is absent, the report states those items are unverified.

## 15. Acceptance

M2.5 and M2 are accepted only when:

1. both fixed presets complete the typed source-to-project-export contract;
2. all failure paths preserve editing and leave no published partial output;
3. Demo generation and persistence/recovery equality pass;
4. schema remains v3, invokes are exactly twelve, capabilities remain unchanged, and both protected manifests retain their existing SHA-256 values;
5. the approved automated gate passes with actual evidence recorded;
6. independent specification and code reviews report no unresolved blocking finding;
7. `docs/M2_REPORT.md` truthfully separates automated evidence from any unperformed runtime/browser/GPU/visual verification;
8. the worktree contains no unrelated staged or committed change.
