# AetherTwin M2.1 Assets and Calibration Design

**Status:** Approved as part of the M2 design on 2026-07-22
**Parent:** [`2026-07-22-aethertwin-m2-showroom-workflow-design.md`](./2026-07-22-aethertwin-m2-showroom-workflow-design.md)

## 1. Goal

Deliver the first complete M2 vertical slice: schema v3, a real project-bound native asset pipeline, safe project asset resolution, persisted plan references, and two-point scale calibration in Studio.

## 2. Scope

M2.1 includes:

- deterministic v2-to-v3 migration and native checkpoint publication;
- schema-v3 empty collections required by all later M2 slices;
- `AssetRecord` patching through CommandBus;
- PNG, JPEG, and sanitized SVG plan-reference import;
- PNG/JPEG/SVG/MP4/WebM content-asset import policy for later slices;
- content-addressed storage and exact-byte deduplication;
- project/session-bound asset resolution without frontend paths;
- `PlanReference` create, edit, delete, undo, redo, save, reopen, and recovery;
- two-point calibration with a transient preview and explicit confirmation;
- an asset-library view limited to capabilities implemented in this slice.

M2.1 does not add openings, room recognition, showroom fixtures, product content UI, routes, 3D, or exports.

## 3. Asset policy

Allowed source formats are detected from both canonical extension and file signature. A disagreement is rejected.

- Raster image: PNG or JPEG, at most 256 MiB, each axis from 1 through 16,384 pixels, and no more than 268,435,456 decoded pixels.
- SVG: UTF-8 SVG at most 32 MiB after capture. Script, event attributes, `foreignObject`, external stylesheets, remote/protocol-relative URLs, and references other than local `#fragment` references are rejected.
- Content video: MP4 or WebM at most 4 GiB. M2 stores but does not transcode it.
- Every file size must also be a non-negative JavaScript-safe integer.

The canonical stored path is `assets/sha256/<first-two-hex>/<sha256>.<canonical-extension>`. Original absolute paths and source filenames are not stored in `AssetRecord`. A user-facing `MediaAsset.name` or `PlanReference.name` may retain a sanitized display name.

## 4. Native import transaction

`import_project_asset` receives the open session ID, a caller-generated operation UUID, the picker-selected source path, intended media role, and a Rust-to-frontend progress channel. The operation registry binds that UUID to the session and active project lock before reading source bytes. The importer opens the source without following a later replacement, rejects unsupported symlink/reparse-point behavior, streams hash and copy to a uniquely owned staging file, flushes it, verifies size/hash, and publishes with no-replace semantics. `cancel_project_asset_import` can cancel only the matching operation UUID in the matching session; completion and cancellation race to one terminal result.

If the content-addressed destination already exists, it must match the expected regular-file identity, size, and SHA-256 before reuse. A mismatch is a hard collision, not permission to overwrite.

The native result contains only the new `AssetRecord` and safe media facts. ProjectStore then runs one CommandBus transaction that patches `snapshot.assets` and creates the referencing `PlanReference`. A failed journal commit leaves no project record. An already published but unreferenced immutable file is safe residue and is not automatically removed in M2.

## 5. Asset resolution

Desktop Studio requests `aethertwin-asset://asset/<session-id>/<asset-id>`, never a project path. On first access, the native protocol handler verifies the open session, snapshot membership, normalized relative path, regular-file identity, recorded size, and SHA-256 on one no-write/no-delete-shared file handle before serving any bytes. The session registry retains that verified handle for subsequent reads and valid video byte ranges, then closes it on asset invalidation, project replacement, recovery, or session close. Responses use the canonical MIME type and `nosniff`. Sandbox Studio exposes the same asset-ID interface with owned Blob URLs and revokes them on project replacement or disposal.

The resolver returns a typed missing/corrupt issue instead of an unsafe URL. Remote schemes and `file://` values are never accepted as stored asset references.

## 6. Plan references and calibration

`PlanReference` is a normalized record, not a `SpatialEntity`. It renders below business content but may be selected from the tree or canvas for placement. Its transform maps source-image pixels into world millimetres.

Calibration accepts two distinct source-image points and a finite positive real distance in millimetres. The pure calibration function computes:

```text
millimetresPerPixel = measuredDistanceMm / distance(sourcePointA, sourcePointB)
```

Confirmation sets a positive uniform transform scale `{ x: millimetresPerPixel, y: millimetresPerPixel }`, preserves translation and rotation, and stores the source points plus measured distance as evidence. Calibration rejects coincident points, non-finite values, non-positive distance, and a result outside the plan-engine safe coordinate range.

The editor displays the proposed scale and resulting reference bounds before the command runs. Cancellation changes nothing. Opacity, translation, rotation, lock state, name, and tags are durable edits. A locked reference remains inspectable but cannot be transformed or recalibrated.

## 7. Studio interaction

The left panel gains an Asset Library tab containing only plan references and imported media known to this slice. The Building group exposes `Import floor plan` and `Calibrate` only after their full native or sandbox path is available.

The calibration interaction is keyboard reachable: choose point A, choose point B, enter a unit-aware distance, inspect the preview, then confirm or cancel. Focus returns to the initiating control. The accessible mirror exposes the reference name, calibrated scale, lock state, opacity, and active selection.

## 8. Errors and recovery

- Picker cancellation is a successful no-op.
- Import, hash, staging, publication, or record-commit failure exposes one stable error and no partial record.
- v2-to-v3 migration failure restores exact v2 durable state.
- A missing or corrupt referenced asset opens as a typed degraded asset issue; its bytes are not served and its reference uses a safe placeholder.
- Re-import may replace a broken asset reference through one reversible transaction; it never mutates an existing immutable `AssetRecord` in place.

## 9. Verification and acceptance

Required evidence covers:

- v2-to-v3 TypeScript and Rust migration parity, rollback, reopen, and recovery;
- all file-type, size, path, SVG, replacement, collision, hash, and deduplication cases;
- exact `AssetRecord` plus `PlanReference` apply/undo/redo/checkpoint/reopen sequences;
- calibration formula, bounds, invalid inputs, and durable confirmation;
- asset resolver scope, digest enforcement, Blob URL cleanup, and error redaction;
- Studio import/calibration focus, accessible mirror, visibility, and failure states;
- offline and least-privilege capability policies.

M2.1 is accepted when an imported PNG/JPEG/SVG floor plan can be calibrated, placed, locked, saved, closed, reopened, and recovered with the same relative asset identity and world scale.
