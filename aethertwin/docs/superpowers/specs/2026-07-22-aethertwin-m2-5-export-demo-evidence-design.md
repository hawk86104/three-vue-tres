# AetherTwin M2.5 Export, Demo, and Evidence Design

**Status:** Approved as part of the M2 design on 2026-07-22
**Parent:** [`2026-07-22-aethertwin-m2-showroom-workflow-design.md`](./2026-07-22-aethertwin-m2-showroom-workflow-design.md)
**Consumes:** Complete M2.1–M2.4 showroom workflow and 3D export port

## 1. Goal

Complete M2 with project-bound offscreen PNG export, a real deterministic Showroom Demo fixture/project, milestone-wide policy gates, and an evidence report that separates automated contracts from any unapproved browser/GPU execution.

## 2. Export request and rendering

M2 exposes exactly two export presets:

- `full-hd`: 1920×1080;
- `ultra-hd`: 3840×2160.

An export request captures the validated project/session identity, active floor, immutable snapshot reference, current 3D camera position/target/FOV, preset, and opaque background. Export uses a dedicated Three.js render target with the preset aspect ratio, not the visible canvas dimensions. It waits for required project textures or fails with their asset IDs.

Pixel readback uses the renderer's asynchronous render-target API. Rows are normalized from WebGL bottom-left origin to PNG top-left order. `begin_project_export` validates the JSON metadata and returns an opaque export UUID bound to the session plus a fixed 1,048,576-byte maximum chunk size. Studio sends zero-based, strictly sequential chunks to `write_project_export_chunk` as Tauri raw `ArrayBuffer` request bodies; only `X-Aether-Session-Id`, `X-Aether-Export-Id`, and decimal `X-Aether-Chunk-Index` are accepted as protocol metadata. Gaps, repeats, oversized chunks, late chunks, or a total above `width * height * 4` cancel the upload. `finish_project_export` requires the exact byte count, encodes an 8-bit sRGB RGBA PNG, validates the completed PNG signature/IHDR, and publishes it under the bound project `exports/` directory. `cancel_project_export` closes only the matching bound upload and removes its staging file.

The exporter checks renderer maximum texture/renderbuffer size before allocation. Unsupported 4K returns `EXPORT_RESOLUTION_UNSUPPORTED`; it never silently lowers resolution.

## 3. File publication

Export names use a sanitized project name, UTC timestamp, preset, and a collision suffix. Publication is no-overwrite:

```text
<project>-<YYYYMMDDTHHMMSSmmmZ>-<preset>[-N].png
```

The native writer creates one unique staging file inside `exports/`, streams encoding, flushes, validates, and atomically publishes. Cancellation or failure removes only that staging file. Existing exports are never replaced. The success result contains a project-relative export path, dimensions, byte size, and SHA-256, never an absolute path.

Export is an output operation, not a project mutation. It does not enter CommandBus, alter sequence/checkpoint state, or create an `AssetRecord` in M2.

## 4. Studio interaction

Preview/Export appears only when the M2.4 renderer reports a ready scene. Studio shows the exact 16:9 frame, preset, estimated pixel count, missing-asset state, progress, cancel action, and success/error result. Success glow is permitted by the Aether visual policy but remains brief and restrained.

Closing/replacing the project while export runs requests cancellation and waits for native staging cleanup before final session close. A failed export leaves 2D/3D editing available.

## 5. Showroom Demo

The repository contains a deterministic schema-v3 Showroom Demo source fixture plus project-generation test support. Generated projects contain:

- one floor and one sanitized SVG plan reference with stored two-point calibration;
- at least four rooms/zones;
- representative doors and windows;
- at least twenty fixtures covering every catalogue kind;
- at least ten product hotspots, each with at least one project-local image `MediaAsset`;
- one connected route network and one guided route;
- material assignments for floor, wall, and fixtures;
- the approved soft-light scene environment.

The fixture uses deterministic canonical UUIDs and project-relative asset metadata. Native tests materialize it into a temporary `.twinproj`, save, close, reopen, recover, and validate exact semantic equality. No visitor theme or Player is included; those remain M4.

## 6. Milestone policy gates

M2 final policies require:

- schema-v3 agreement across TypeScript, Rust, fixtures, and documentation;
- no remote runtime URL/CDN import in any M2 source;
- no absolute project asset/export paths in durable data;
- no broad frontend filesystem permission;
- business data absent from Pixi/Three object ownership;
- only real M2 visible controls;
- Player/theme/market/MP4-export claims absent;
- AetherTwin application-command/custom-protocol surface exactly matching the documented M2 allowlist, with existing scoped Tauri plugin permissions unchanged.

## 7. Evidence report

`docs/M2_REPORT.md` lists:

- completed capabilities and explicit exclusions;
- every command actually run, exit code, test count, and failure/retry history;
- exact TypeScript, Node-policy, Rust, and Cargo evidence;
- demo contents and persistence evidence;
- build/dev/browser/Playwright/packaging/screenshot commands skipped under project/user rules;
- whether real WebGL/GPU and actual PNG visual inspection were authorized and run;
- known issues and M3 next scope.

Injected renderer/exporter tests may prove projection, render-target request, pixel orientation, PNG/native publication, cancellation, and cleanup. They do not prove a real GPU frame. If no separate runtime approval is granted, the report must call real 3D and visual screenshot evidence unverified.

## 8. Verification and acceptance

Required automated evidence covers both presets, camera/aspect capture, renderer limit rejection, asynchronous pixel read, row normalization, chunk ordering, byte-count validation, PNG structure, unique no-overwrite naming, cancellation, staging cleanup, lifecycle blocking, error redaction, demo materialization, save/reopen/recovery equality, and all final policy gates.

M2.5 is accepted when the source and approved automated verification demonstrate the complete M2 workflow and export contract, `M2_REPORT.md` truthfully records any real-runtime gap, and the worktree contains no unrelated change.
