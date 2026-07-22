# AetherTwin M2.1 Assets and Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver schema v3, a safe project-bound native asset pipeline, immutable project asset resolution, normalized plan references, and two-point calibration that survives undo/redo, save, reopen, and recovery.

**Architecture:** `core-model` remains the schema authority; `asset-pipeline` owns platform-neutral media policy and composition; `asset-io` owns captured files, validation, hashing, publication, and verified reads; `project-store` combines explicit record patches in CommandBus transactions; `plan-engine` owns calibration mathematics and reference bounds; `render-plan-2d` projects references into a dedicated Pixi layer; Studio owns picker/progress/selection/calibration drafts and accessible controls. Native asset paths never cross into project data or renderer state.

**Tech Stack:** Node.js 24, pnpm 11, React 19, TypeScript 6, Vitest 4, Testing Library, Zustand 5, PixiJS 8.19.0, Tauri 2.11, Rust 1.94, rusqlite, serde, SHA-256, `quick-xml` 0.41.0, UUID, and the existing Aether design system.

## Global Constraints

- Implement the approved M2 umbrella and M2.1 child specifications; do not expand into openings UI, room recognition, fixtures, content UI, routes, 3D, or export.
- Profiles remain exactly `'showroom' | 'market'`; profile stays immutable.
- `CURRENT_SCHEMA_VERSION` becomes exactly `3`. New projects are v3. Coherent v1/v2 projects upgrade through a deterministic chain before an editor session is published.
- The v2→v3 step preserves existing IDs, values, collection order, `sequence`, and `checkpointSequence`; it only adds v3 collections and deterministic `sceneEnvironment`.
- Millimetres remain the stored plan unit, angles remain radians, and `PlanReference.transform` maps source-image coordinates into world millimetres.
- `AssetRecord.relativePath` is exactly `assets/sha256/<first-two-hex>/<sha256>.<canonical-extension>`. Absolute paths, filenames, remote URLs, `file://`, traversal, and backslashes are never persisted.
- Canonical media are PNG, JPEG, sanitized SVG, MP4, and WebM. Plan references accept only PNG, JPEG, and sanitized SVG.
- Raster limits are 256 MiB, axes `1..=16_384`, and decoded pixels at most `268_435_456`. SVG is UTF-8 and at most 32 MiB. MP4/WebM is at most 4 GiB. Byte counts are non-negative JavaScript-safe integers.
- SVG rejects DTD/entities, processing instructions, scripts, event attributes, `foreignObject`, external styles, remote/protocol-relative URLs, and non-fragment resource references. Only `url(#fragment)` and `href='#fragment'` are valid resource references.
- Native publication uses unique staging, flush/fsync, and no-replace semantics. Existing destinations may be reused only after regular-file identity, length, and digest match. Nothing overwrites a collision.
- Undo removes records, not immutable content-addressed bytes. Orphan pruning is outside M2.1.
- `snapshot.records.patch` is a discriminated collection allowlist, never JSON Pointer or arbitrary field paths. Rust parses the selected collection into its real v3 type.
- Pixi objects, texture/Blob/native handles, progress, selection, and calibration preview are transient projections, not project records.
- The invoke allowlist becomes exactly eight application commands: the existing six plus `import_project_asset` and `cancel_project_asset_import`. Asset reads use a custom protocol, not another invoke command.
- Existing `core:window:default` and `dialog:allow-open` permissions remain unchanged; add no broad filesystem permission.
- Work from `E:\数字孪生\.worktrees\aethertwin-m2\aethertwin`; run Git commands from `E:\数字孪生\.worktrees\aethertwin-m2`.
- Every test, TypeScript check, Rust test, or `cargo check` below is an execution-time approval gate. Do not run it until the user explicitly approves that command class.
- Do not run build, dev, debug, browser, Playwright, packaged-runtime, or screenshot commands unless separately authorized.
- Each task stages only listed files and ends with one focused commit after approved checks pass.

---

## File and responsibility map

### Model, policy, and durable mutation

- `packages/core-model/src/content-model.ts`, `model.ts`, `validation.ts`, `migrations.ts` — v3 types, validation, paths, migration.
- `fixtures/contracts/snapshot.v3.json` — shared TypeScript/Rust v3 contract.
- `packages/asset-pipeline/src/types.ts`, `media-policy.ts`, `plan-reference.ts` — pure import contracts, safe policy, composition.
- `packages/project-store/src/snapshot-records-command.ts` — allowlisted exact record patches.
- `packages/project-store/src/backend.ts`, `project-store.ts`, `sandbox-backend.ts` — import/cancel/resolve, transactions, Blob ownership.
- `crates/project-io/src/model.rs`, `project.rs`, `schema.rs` — typed v3 persistence, migration, replay, recovery.

### Native asset boundary

- `crates/asset-io/src/source.rs` — stable handles and file identity.
- `crates/asset-io/src/media.rs` — PNG/JPEG/MP4/WebM signatures, facts, limits.
- `crates/asset-io/src/svg.rs` — UTF-8 XML safety validation and intrinsic geometry.
- `crates/asset-io/src/import.rs` — staging, progress, cancellation, hash, fsync, deduplication, publication.
- `crates/asset-io/src/resolver.rs` — verified session handles and range reads.
- `crates/desktop-host/src/dto.rs`, `state.rs`, `commands.rs`, `lib.rs`, `asset_protocol.rs` — DTOs, registry, commands, protocol.

### Calibration, rendering, and Studio

- `packages/plan-engine/src/calibration.ts`, `plan-references.ts` — scale/evidence/bounds/source-world conversion/hit test.
- `packages/render-plan-2d/src/types.ts`, `scene-projection.ts`, `pixi-plan-renderer.ts` — image nodes, layer, texture lifecycle, placeholder.
- `apps/studio/src/features/plan-editor/asset-library.tsx` — left-panel assets/references/issues.
- `apps/studio/src/features/plan-editor/asset-picker.ts` — desktop dialog and sandbox file input.
- `apps/studio/src/features/plan-editor/calibration-panel.tsx` — keyboard point/distance/preview/confirm flow.
- `apps/studio/src/features/plan-editor/reference-inspector.tsx` — durable properties and lock behavior.
- Existing PlanEditor/session/canvas/accessibility files — composition, focus, shared selection, transient state.

---

### Task 1: Define schema v3 and deterministic TypeScript migration

**Files:**
- Create: `fixtures/contracts/snapshot.v3.json`
- Modify: `packages/core-model/src/content-model.ts`
- Modify: `packages/core-model/src/model.ts`
- Modify: `packages/core-model/src/validation.ts`
- Modify: `packages/core-model/src/migrations.ts`
- Modify: `packages/core-model/src/index.ts`
- Modify: `packages/core-model/src/core-model.test.ts`

**Interfaces:**
- Consumes: schema-v2 snapshot, `Transform2D`, `Point2`, `ProjectRecordBase`, migration registry.
- Produces: v3 `ProjectSnapshot`, `PlanReference`, later-M2 normalized contracts, `DEFAULT_SCENE_ENVIRONMENT`, `parseSnapshotV3`, v2→v3 migration.

- [ ] **Step 1: Add failing v3 creator, parser, immutability, reference, and migration tests**

Cover exact empty collections, singleton defaults, preserved v2 IDs/order/sequences, duplicate IDs, foreign floor/layer/asset references, opacity, calibration evidence/uniform scale, canonical asset paths/media, and fixture round-trip.

- [ ] **Step 2: With approval, run the focused test and confirm schema v2 fails**

```powershell
pnpm.cmd vitest run packages/core-model/src/core-model.test.ts
```

Expected: FAIL because v3 types/defaults/parser do not exist.

- [ ] **Step 3: Add exact public contracts**

```ts
export type AssetMediaType =
  | image/png | image/jpeg | image/svg+xml
  | video/mp4 | video/webm;
export interface CalibrationEvidence {
  readonly sourcePointA: Point2;
  readonly sourcePointB: Point2;
  readonly measuredDistanceMm: number;
}
export interface PlanReference extends ProjectRecordBase {
  readonly floorId: string; readonly layerId: string; readonly assetId: string;
  readonly intrinsicSize: Size2; readonly transform: Transform2D;
  readonly opacity: number; readonly locked: boolean;
  readonly calibration: CalibrationEvidence | null;
}
```

Also define typed `GuidedRoute`, `MaterialDefinition`, `MaterialAssignment`, and `SceneEnvironment`. Deterministic defaults are background `#10151c`, ambient `#ffffff/0.6`, key `#ffffff/1` direction `[-0.5,-1,-0.5]`, shadows enabled, softness `0.5`.

- [ ] **Step 4: Implement strict v3 parsing and migration**

Gather IDs before references, require exact keys, enforce global UUID uniqueness, validate references/bounds/uniform calibrated scale, and deep-freeze once. Derive asset paths from digest/media. Add only new fields in 2→3; route current parsing through 1→2→3 while retaining `parseSnapshotV2` for compatibility tests.

- [ ] **Step 5: With approval, rerun test and type check**

```powershell
pnpm.cmd vitest run packages/core-model/src/core-model.test.ts
pnpm.cmd exec tsc -p packages/core-model/tsconfig.json --noEmit
```

Expected: tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit schema v3**

```powershell
git add -- aethertwin/fixtures/contracts/snapshot.v3.json aethertwin/packages/core-model/src
git commit -m 'feat: define AetherTwin schema v3'
```

---

### Task 2: Upgrade native persistence before session publication

**Files:**
- Modify: `crates/project-io/src/model.rs`, `project.rs`, `schema.rs`
- Modify: `crates/project-io/tests/contract_fixture.rs`, `create_open.rs`, `commit_recovery.rs`
- Modify: `crates/desktop-host/src/dto.rs`, `state.rs`
- Modify: `crates/desktop-host/src/state/tests.rs`
- Modify: `apps/studio/src/backend/tauri-backend.ts`, `tauri-backend.test.ts`

**Interfaces:**
- Consumes: v1/v2/v3 fixtures, atomic checkpoint/manifest rollback, session lifecycle lease.
- Produces: typed Rust v3, guarded v1/v2→v3 upgrade, v3-only `OpenedProjectDto`.

- [ ] **Step 1: Add failing parity and rollback tests**

Prove v3 fixture round-trip, exact v2 and v1 migration, v3 creation, database-failure rollback, manifest-failure restoration of exact old database/manifest bytes, and recovered-v2 upgrade before return.

- [ ] **Step 2: With approval, confirm focused Rust tests fail**

```powershell
cargo test -p project-io --test contract_fixture
cargo test -p project-io --test create_open
cargo test -p project-io --test commit_recovery
```

Expected: FAIL because Rust still declares schema 2.

- [ ] **Step 3: Mirror real v3 records and validation in Rust**

Use `deny_unknown_fields`; type `PlanReference`, `Opening`, `GuidedRoute`, material records, and environment rather than `Value`. Validate JS-safe integers, canonical media/path, UUID uniqueness, references, finite values, and calibrated uniform scale.

- [ ] **Step 4: Implement guarded native migration**

Add pure 1→2→3 value migration. After open/recovery reconstruction and before returning a session, checkpoint the migrated pair with existing database+manifest restoration. Publish v3 in memory only after both durable phases succeed.

- [ ] **Step 5: Make the Tauri adapter v3-only**

Remove frontend-owned v1 checkpointing. Parse only a coherent v3 native response and preserve pending-session cleanup on parse failure.

- [ ] **Step 6: With approval, run parity, adapter, and checks**

```powershell
cargo test -p project-io --test contract_fixture
cargo test -p project-io --test create_open
cargo test -p project-io --test commit_recovery
pnpm.cmd vitest run apps/studio/src/backend/tauri-backend.test.ts
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
cargo check -p project-io -p desktop-host
```

Expected: tests pass and checks exit 0.

- [ ] **Step 7: Commit native schema publication**

```powershell
git add -- aethertwin/crates/project-io aethertwin/crates/desktop-host/src/dto.rs aethertwin/crates/desktop-host/src/state.rs aethertwin/apps/studio/src/backend
git commit -m 'feat: upgrade native projects to schema v3'
```

---

### Task 3: Implement the pure asset-pipeline package

**Files:**
- Delete: `packages/asset-pipeline/.gitkeep`
- Create: `packages/asset-pipeline/package.json`
- Create: `packages/asset-pipeline/tsconfig.json`
- Create: `packages/asset-pipeline/src/types.ts`, `media-policy.ts`, `plan-reference.ts`, `index.ts`
- Create: `packages/asset-pipeline/src/asset-pipeline.test.ts`

**Interfaces:**
- Consumes: v3 `AssetRecord`, `AssetMediaType`, `PlanReference`.
- Produces: import role/source/request/result/progress/facts, safe display-name policy, role validation, plan-reference composition.

- [ ] **Step 1: Add failing policy and composition tests**

Cover extension/signature mismatch, JPEG `.jpg`, exact limits, JS-safe sizes, plan-reference video rejection, sanitized basename, operation UUID, stable asset issue codes, and initial uncalibrated reference.

- [ ] **Step 2: With approval, confirm the placeholder fails**

```powershell
pnpm.cmd vitest run packages/asset-pipeline/src/asset-pipeline.test.ts
```

Expected: FAIL because no implementation exists.

- [ ] **Step 3: Define the boundary and implement policy**

```ts
export type AssetImportRole = 'plan-reference' | 'content-image' | 'content-video';
export type AssetImportSource =
  | { readonly kind: 'native-path'; readonly path: string; readonly displayName: string }
  | { readonly kind: 'sandbox-blob'; readonly blob: Blob; readonly displayName: string };
export type AssetMediaFacts =
  | { readonly kind: 'image'; readonly width: number; readonly height: number }
  | { readonly kind: 'video' };
```

Add the five stages and transient issue codes for missing, corrupt, and codec-preview-unavailable assets. Requests carry caller UUID, source, and role. Results contain only `asset` and facts. Composition creates scale 1, opacity 0.65, unlocked state, and `calibration:null`.

- [ ] **Step 4: With approval, run tests and type check**

```powershell
pnpm.cmd vitest run packages/asset-pipeline/src/asset-pipeline.test.ts
pnpm.cmd exec tsc -p packages/asset-pipeline/tsconfig.json --noEmit
```

- [ ] **Step 5: Commit**

```powershell
git add -- aethertwin/packages/asset-pipeline
git commit -m 'feat: add pure asset import policy'
```

---

### Task 4: Add allowlisted snapshot record patches end to end

**Files:**
- Create: `packages/project-store/src/snapshot-records-command.ts`
- Create: `packages/project-store/src/snapshot-records-command.test.ts`
- Modify: `packages/project-store/src/project-store.ts`, `index.ts`
- Modify: `crates/project-io/src/model.rs`, `project.rs`
- Modify: `crates/project-io/tests/commit_recovery.rs`
- Modify: `crates/desktop-host/src/dto.rs`
- Modify: `crates/desktop-host/tests/command_contract.rs`

**Interfaces:**
- Consumes: CommandBus transactions, typed v3 collections, native journal replay.
- Produces: `SnapshotRecordsPatch<K>`, exact inverse payload, strict Rust collection enum, replay/recovery support.

- [ ] **Step 1: Add failing apply/undo/redo and hostile payload tests**

Test insert/update/remove/index ordering for `assets` and `planReferences`, heterogeneous one-transaction undo, before mismatch, duplicate IDs, unknown collection, extra fields, arbitrary paths, and claimed-after mismatch.

- [ ] **Step 2: With approval, confirm focused tests fail**

```powershell
pnpm.cmd vitest run packages/project-store/src/snapshot-records-command.test.ts
cargo test -p project-io --test commit_recovery
cargo test -p desktop-host --test command_contract
```

- [ ] **Step 3: Implement the discriminated patch**

```ts
export interface SnapshotRecordChange<T> {
  readonly id: string; readonly before: T | null; readonly after: T | null;
  readonly index?: number;
}
export interface SnapshotRecordsPatch<K extends SnapshotRecordCollection> {
  readonly collection: K;
  readonly changes: readonly SnapshotRecordChange<SnapshotRecordByCollection[K]>[];
}
```

Allow only `assets|planReferences|openings|productContents|mediaAssets|routeNetworks|guidedRoutes|materials|materialAssignments`. Invert by reversing changes and swapping before/after. Parse the resulting whole snapshot before publication.

- [ ] **Step 4: Implement typed native replay**

Use a Serde enum tagged by `collection`, with a concrete `RecordChange<T>` per variant. Apply exact before/index checks, update `asset_records` and normalized `entity_records` in the same SQLite transaction, and verify the computed snapshot equals batch `after`.

- [ ] **Step 5: With approval, rerun focused tests and checks**

```powershell
pnpm.cmd vitest run packages/project-store/src/snapshot-records-command.test.ts packages/project-store/src/project-store.test.ts
pnpm.cmd exec tsc -p packages/project-store/tsconfig.json --noEmit
cargo test -p project-io --test commit_recovery
cargo test -p desktop-host --test command_contract
cargo check -p project-io -p desktop-host
```

- [ ] **Step 6: Commit**

```powershell
git add -- aethertwin/packages/project-store/src aethertwin/crates/project-io aethertwin/crates/desktop-host/src/dto.rs aethertwin/crates/desktop-host/tests/command_contract.rs
git commit -m 'feat: persist typed schema v3 record patches'
```

---

### Task 5: Implement the asset-io import core

**Files:**
- Delete: `crates/asset-io/.gitkeep`
- Create: `crates/asset-io/Cargo.toml`
- Create: `crates/asset-io/src/lib.rs`, `error.rs`, `source.rs`, `media.rs`, `svg.rs`, `import.rs`
- Create: `crates/asset-io/tests/media_policy.rs`, `svg_policy.rs`, `import_pipeline.rs`
- Modify: `Cargo.toml`
- Modify: `THIRD_PARTY_NOTICES.md`

**Interfaces:**
- Consumes: bound project root, stable source path, operation UUID/role, cancellation observer.
- Produces: immutable `AssetRecord` plus media facts; stable `AssetIoError` codes; content-addressed file.

- [ ] **Step 1: Add failing media, SVG, race, hash, collision, dedup, and cancellation tests**

Use generated byte fixtures. Cover every boundary, extension/signature mismatch, PNG IHDR, JPEG SOF, SVG encoding/tags/attributes/URLs/CSS, MP4 `ftyp`, WebM EBML, source swap/symlink/reparse behavior, stage cleanup, wrong existing destination, exact reuse, and one terminal cancel/complete result.

- [ ] **Step 2: With approval, confirm the new crate tests fail**

```powershell
cargo test -p asset-io --test media_policy
cargo test -p asset-io --test svg_policy
cargo test -p asset-io --test import_pipeline
```

Expected: FAIL because the crate is a placeholder.

- [ ] **Step 3: Implement stable capture and media validation**

Record source identity before open, open read-only without delete sharing, verify opened-handle identity and regular-file status, and never reopen source bytes by pathname. Parse PNG/JPEG dimensions without decoding. Use `quick-xml = 0.41.0` with DTD/PI/entity rejection and case-insensitive local-name checks; accept SVG source geometry only from finite positive px/unitless width/height or `viewBox`.

- [ ] **Step 4: Implement streaming publication**

Copy/hash in 1 MiB chunks to a unique stage; check cancellation; flush and `sync_all`; verify length/digest; publish no-replace. Reopen the published destination without delete sharing and verify identity/size/digest before returning. Existing destinations receive the same verification before reuse. Remove only the owned stage on failure.

```rust
pub trait ImportObserver: Send + Sync {
    fn progress(&self, value: ImportProgress);
    fn is_cancelled(&self) -> bool;
}
pub fn import_project_asset(
    request: ImportRequest,
    observer: &dyn ImportObserver,
) -> Result<ImportResult, AssetIoError>;
```

- [ ] **Step 5: With approval, run crate tests and check**

```powershell
cargo test -p asset-io --test media_policy
cargo test -p asset-io --test svg_policy
cargo test -p asset-io --test import_pipeline
cargo check -p asset-io
```

- [ ] **Step 6: Commit**

```powershell
git add -- aethertwin/Cargo.toml aethertwin/Cargo.lock aethertwin/crates/asset-io aethertwin/THIRD_PARTY_NOTICES.md
git commit -m 'feat: add safe content-addressed asset import'
```

---

### Task 6: Expose session-bound import, progress, and cancellation

**Files:**
- Modify: `crates/desktop-host/Cargo.toml`
- Modify: `crates/desktop-host/src/dto.rs`, `error.rs`, `state.rs`, `commands.rs`, `lib.rs`
- Modify: `crates/desktop-host/src/state/tests.rs`
- Modify: `crates/desktop-host/tests/command_contract.rs`
- Modify: `apps/studio/src/backend/tauri-backend.ts`, `tauri-backend.test.ts`

**Interfaces:**
- Consumes: `asset_io::import_project_asset`, active session/lock, Tauri `Channel<ImportProgressDto>`.
- Produces: `import_project_asset`, `cancel_project_asset_import`, frontend import/cancel methods, safe errors.

- [ ] **Step 1: Add failing lifecycle and IPC tests**

Test exact DTO keys, caller UUID, role, session ownership, duplicate operation rejection, progress monotonicity, cross-session cancel rejection, cancel/complete race, close waiting for import, eight-command count, and redaction of paths/OS details.

- [ ] **Step 2: With approval, confirm host and adapter tests fail**

```powershell
cargo test -p desktop-host --test command_contract
cargo test -p desktop-host state::tests
pnpm.cmd vitest run apps/studio/src/backend/tauri-backend.test.ts
```

- [ ] **Step 3: Implement the operation registry**

Register `operationId -> {sessionId,cancelFlag}` before file access. Hold the target `ProjectSession` mutex while the blocking importer uses its canonical root so close/recovery cannot replace ownership. Cancellation only flips the matching token. Remove the registry entry exactly once in terminal cleanup.

- [ ] **Step 4: Add async Tauri commands and safe mapping**

Pass the progress channel into a `spawn_blocking` observer. Map stable codes including unsupported type, size/dimensions, unsafe SVG, source changed, cancelled, collision, and asset I/O failure. Public errors remain `{code,message,details,logRef}` without source/destination paths.

- [ ] **Step 5: Add the two frontend methods**

Construct a Tauri `Channel`, parse every progress/result field, require the operation ID to match, and serialize import/cancel with the existing backend operation queue. Keep source paths only in the transient invoke request.

- [ ] **Step 6: With approval, rerun tests and checks**

```powershell
cargo test -p desktop-host --test command_contract
cargo test -p desktop-host state::tests
pnpm.cmd vitest run apps/studio/src/backend/tauri-backend.test.ts
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
cargo check -p desktop-host
```

- [ ] **Step 7: Commit**

```powershell
git add -- aethertwin/crates/desktop-host aethertwin/apps/studio/src/backend
git commit -m 'feat: expose session-bound asset imports'
```

---

### Task 7: Implement verified project asset resolution

**Files:**
- Create: `crates/asset-io/src/resolver.rs`
- Create: `crates/asset-io/tests/resolver.rs`
- Create: `crates/desktop-host/src/asset_protocol.rs`
- Modify: `crates/asset-io/src/lib.rs`
- Modify: `crates/desktop-host/src/lib.rs`, `main.rs`, `state.rs`
- Modify: `crates/desktop-host/src/state/tests.rs`

**Interfaces:**
- Consumes: open session snapshot, canonical asset record, project root, protocol request.
- Produces: cached verified read handle, single byte-range response, typed missing/corrupt issue, protocol handler.

- [ ] **Step 1: Add failing resolver and protocol tests**

Cover exact URL shape, wrong session/asset, remote/file schemes, traversal, missing file, non-regular file, size/digest mismatch, same-size corruption, destination replacement, cache reuse, invalidation on commit/recovery/close, MIME, `nosniff`, GET/HEAD, valid single ranges, 416 for invalid/multiple ranges, and no absolute-path leakage.

- [ ] **Step 2: With approval, confirm focused tests fail**

```powershell
cargo test -p asset-io --test resolver
cargo test -p desktop-host asset_protocol
cargo test -p desktop-host state::tests
```

- [ ] **Step 3: Verify and cache one handle**

Resolve membership from the session snapshot, rederive the canonical path, open read-only without delete sharing on Windows, verify regular identity/length, hash through that handle, rewind/read by offset, and cache by `(sessionId,assetId)`. Never serve before verification.

- [ ] **Step 4: Implement protocol responses**

Parse only `aethertwin-asset://asset/<session-id>/<asset-id>`. Return canonical MIME, `X-Content-Type-Options: nosniff`, `Accept-Ranges: bytes`, correct `Content-Length/Content-Range`, 206/416 behavior, and safe issue headers/status. Register the protocol without adding an invoke command or capability.

- [ ] **Step 5: Wire lifecycle invalidation and degraded issues**

Close cached handles when an asset record changes/disappears, a project is recovered/replaced, or the session closes. Preflight missing/non-regular/size issues during open; discover same-size digest corruption on first resolve. Structural editing remains available.

- [ ] **Step 6: With approval, rerun tests and check**

```powershell
cargo test -p asset-io --test resolver
cargo test -p desktop-host asset_protocol
cargo test -p desktop-host state::tests
cargo check -p asset-io -p desktop-host
```

- [ ] **Step 7: Commit**

```powershell
git add -- aethertwin/crates/asset-io aethertwin/crates/desktop-host/src
git commit -m 'feat: serve verified project assets'
```

---

### Task 8: Orchestrate imports in ProjectStore and sandbox

**Files:**
- Modify: `packages/project-store/package.json`
- Modify: `packages/project-store/src/backend.ts`, `project-store.ts`, `sandbox-backend.ts`, `index.ts`
- Modify: `packages/project-store/src/project-store.test.ts`
- Modify: `apps/studio/src/backend/tauri-backend.ts`, `tauri-backend.test.ts`

**Interfaces:**
- Consumes: backend import result, pure reference composition, two record patch intents.
- Produces: `importPlanReference`, `cancelAssetImport`, `replaceBrokenPlanReference`, `resolveAsset`, transient `assetIssues`.

- [ ] **Step 1: Add failing transaction and lifecycle tests**

Test native result validation; one commit with adjacent asset/reference journal rows and one transaction ID; undo/redo as one history step; commit failure leaving no records; cancellation no-op; reimport replacing only the reference; save/close/reopen; project replacement cleanup; sandbox digest/dedup; Blob URL reuse/revocation.

- [ ] **Step 2: With approval, confirm focused tests fail**

```powershell
pnpm.cmd vitest run packages/project-store/src/project-store.test.ts
pnpm.cmd vitest run apps/studio/src/backend/tauri-backend.test.ts
```

- [ ] **Step 3: Extend the backend port**

```ts
interface BackendAssetSource {
  readonly assetId: string;
  readonly url: string;
}
interface ProjectBackend {
  importAsset(projectPath: string, request: AssetImportRequest,
    onProgress: (value: AssetImportProgress) => void): Promise<AssetImportResult>;
  cancelAssetImport(projectPath: string, operationId: string): Promise<void>;
  resolveAsset(projectPath: string, assetId: string): Promise<BackendAssetSource>;
}
```

Desktop source URLs are session-bound custom protocol URLs. The sandbox stores owned Blobs by canonical path and owns/revokes every generated object URL. ProjectStore joins the backend URL with the authoritative snapshot media type before returning `ProjectAssetSource`.

- [ ] **Step 4: Commit asset and PlanReference atomically**

After native publication, compose the reference and call `bus.transaction` with an `assets` patch then a `planReferences` patch. Validate both against the current snapshot first. A failed journal commit publishes neither record; the immutable file may remain residue.

- [ ] **Step 5: Implement sandbox equivalence**

Validate a Blob with the pure policy, hash it with Web Crypto, store immutable bytes by canonical path, return the same facts, and synthesize monotonic progress. Revoke object URLs on asset invalidation, project replacement, close, and backend disposal.

- [ ] **Step 6: With approval, rerun tests and type checks**

```powershell
pnpm.cmd vitest run packages/project-store/src/snapshot-records-command.test.ts packages/project-store/src/project-store.test.ts
pnpm.cmd vitest run apps/studio/src/backend/tauri-backend.test.ts
pnpm.cmd exec tsc -p packages/project-store/tsconfig.json --noEmit
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
```

- [ ] **Step 7: Commit**

```powershell
git add -- aethertwin/packages/project-store aethertwin/apps/studio/src/backend
git commit -m 'feat: transact imported plan references'
```

---

### Task 9: Implement pure plan-reference geometry and calibration

**Files:**
- Create: `packages/plan-engine/src/calibration.ts`
- Create: `packages/plan-engine/src/calibration.test.ts`
- Create: `packages/plan-engine/src/plan-references.ts`
- Create: `packages/plan-engine/src/plan-references.test.ts`
- Modify: `packages/plan-engine/src/index.ts`
- Modify: `packages/plan-engine/package.json`

**Interfaces:**
- Consumes: `PlanReference`, `Point2`, `Transform2D`, `PlanResult`.
- Produces: source/world conversion, polygon/bounds/hit test, `previewCalibration`, calibrated reference.

- [ ] **Step 1: Add failing formula, bounds, transform, and invalid-input tests**

Cover horizontal/diagonal points, coincident points, NaN/infinity, nonpositive distance, overflow, safe world range, preservation of translation/rotation, exact uniform scale/evidence, cancellation immutability, and locked-reference rejection.

- [ ] **Step 2: With approval, confirm focused tests fail**

```powershell
pnpm.cmd vitest run packages/plan-engine/src/calibration.test.ts packages/plan-engine/src/plan-references.test.ts
```

- [ ] **Step 3: Implement exact calibration**

```ts
export interface CalibrationInput {
  readonly sourcePointA: Point2;
  readonly sourcePointB: Point2;
  readonly measuredDistanceMm: number;
}
export interface CalibrationPreview {
  readonly millimetresPerPixel: number;
  readonly bounds: Bounds2;
  readonly after: PlanReference;
}
```

Compute `hypot(dx,dy)`, then `measuredDistanceMm / pixelDistance`. Set both scale axes to that value, preserve translation/rotation, store exact evidence, and reject any transformed corner outside `±1_000_000_000` mm or non-finite.

- [ ] **Step 4: Implement geometry and reference hit ordering**

Transform the four source corners to world coordinates. Business entities remain above references; reference hits are considered only when no higher content hit succeeds. Locked references remain selectable but return a typed failure for transform/calibration.

- [ ] **Step 5: With approval, rerun tests and type check**

```powershell
pnpm.cmd vitest run packages/plan-engine/src/calibration.test.ts packages/plan-engine/src/plan-references.test.ts
pnpm.cmd exec tsc -p packages/plan-engine/tsconfig.json --noEmit
```

- [ ] **Step 6: Commit**

```powershell
git add -- aethertwin/packages/plan-engine
git commit -m 'feat: calibrate plan references'
```

---

### Task 10: Render plan references through verified asset IDs

**Files:**
- Modify: `packages/render-plan-2d/src/types.ts`, `scene-projection.ts`, `pixi-plan-renderer.ts`, `index.ts`
- Modify: `packages/render-plan-2d/src/scene-projection.test.ts`, `pixi-plan-renderer.test.ts`
- Modify: `apps/studio/src/features/plan-editor/plan-canvas.tsx`, `plan-canvas.test.tsx`

**Interfaces:**
- Consumes: active-floor references, viewport, selected IDs, `ProjectStore.resolveAsset`, transient calibration preview.
- Produces: image render node, dedicated `reference` layer, owned texture lifecycle, safe placeholder.

- [ ] **Step 1: Add failing projection and renderer lifecycle tests**

Test floor/layer visibility, world-to-screen corners, grid→reference→content order, opacity/selection/locked styles, offscreen culling, source resolution by asset ID only, one load per asset, stale completion, invalidation, destroy cleanup, and typed placeholder without unsafe bytes.

- [ ] **Step 2: With approval, confirm focused tests fail**

```powershell
pnpm.cmd vitest run packages/render-plan-2d/src/scene-projection.test.ts packages/render-plan-2d/src/pixi-plan-renderer.test.ts
pnpm.cmd vitest run apps/studio/src/features/plan-editor/plan-canvas.test.tsx
```

- [ ] **Step 3: Add image nodes and source port**

```ts
export interface ProjectAssetSource {
  readonly assetId: string;
  readonly url: string;
  readonly mediaType: AssetMediaType;
}
export interface PlanAssetSourcePort {
  resolve(assetId: string): Promise<ProjectAssetSource>;
}
```

Image geometry carries only `assetId`, four screen corners, opacity, and bounds. It never carries a filesystem path. Calibration preview supplies alternate corners without changing the snapshot.

- [ ] **Step 4: Implement Pixi reference resources**

Insert `reference` between grid and content. Load through the injected source port, discard stale promises by generation, apply affine sprite transform, render a Graphics placeholder on typed failure, and destroy textures/sprites on invalidation or renderer destruction.

- [ ] **Step 5: Wire PlanCanvas through ProjectStore**

Pass a stable source adapter that calls `store.resolveAsset(assetId)`; report safe resolution issues to Studio; preserve the injected renderer factory used by jsdom tests.

- [ ] **Step 6: With approval, rerun tests and type checks**

```powershell
pnpm.cmd vitest run packages/render-plan-2d/src/scene-projection.test.ts packages/render-plan-2d/src/pixi-plan-renderer.test.ts
pnpm.cmd vitest run apps/studio/src/features/plan-editor/plan-canvas.test.tsx
pnpm.cmd exec tsc -p packages/render-plan-2d/tsconfig.json --noEmit
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
```

- [ ] **Step 7: Commit**

```powershell
git add -- aethertwin/packages/render-plan-2d aethertwin/apps/studio/src/features/plan-editor/plan-canvas.tsx aethertwin/apps/studio/src/features/plan-editor/plan-canvas.test.tsx
git commit -m 'feat: render verified plan references'
```

---

### Task 11: Add the real Asset Library and import flow

**Files:**
- Create: `apps/studio/src/features/plan-editor/asset-picker.ts`
- Create: `apps/studio/src/features/plan-editor/asset-library.tsx`
- Create: `apps/studio/src/features/plan-editor/asset-library.test.tsx`
- Modify: `apps/studio/src/features/plan-editor/editor-session.ts`, `plan-editor.tsx`, `plan-toolbar.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.test.tsx`
- Modify: `apps/studio/src/app.css`

**Interfaces:**
- Consumes: picker-selected path or Blob, `ProjectStore.importPlanReference`, progress/cancel/issues.
- Produces: left-panel Tree/Asset Library tabs, working Import floor plan control, progress and retry/reimport UI.

- [ ] **Step 1: Add failing visibility, import, cancellation, focus, and error tests**

Test desktop dialog filters, sandbox file input, picker cancellation no-op, one import call, progress labels, cancel operation ID, success selection, commit failure, corrupt issue/reimport, no source path text, and absence of deferred M2 controls.

- [ ] **Step 2: With approval, confirm focused tests fail**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/asset-library.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx
```

- [ ] **Step 3: Implement an injected picker port**

Production desktop uses `dialog:allow-open` with PNG/JPEG/SVG filters and returns `native-path`. Sandbox uses an owned hidden `input[type=file]` and returns `sandbox-blob`. Tests inject the port. Picker cancellation returns `null` and creates no operation.

- [ ] **Step 4: Implement library and progress**

Show only M2.1 assets/references, reference names, media kind, calibration/lock state, and typed issues. Generate operation/reference UUIDs before import, call ProjectStore, select the new reference, announce progress through `aria-live`, and return focus to the initiating button on success/cancel/failure.

- [ ] **Step 5: Expose controls only on the real path**

Add `Import floor plan` to the Building group and the Asset Library tab only when the injected backend supports import. Do not show openings, fixtures, content, routes, 3D, or export.

- [ ] **Step 6: With approval, rerun Studio tests and type check**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/asset-library.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
```

- [ ] **Step 7: Commit**

```powershell
git add -- aethertwin/apps/studio/src/features/plan-editor aethertwin/apps/studio/src/app.css
git commit -m 'feat: add plan asset library workflow'
```

---

### Task 12: Add PlanReference selection, placement, editing, and lock behavior

**Files:**
- Create: `apps/studio/src/features/plan-editor/reference-inspector.tsx`
- Create: `apps/studio/src/features/plan-editor/reference-inspector.test.tsx`
- Modify: `apps/studio/src/features/plan-editor/interaction-controller.ts`, `interaction-controller.test.ts`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.tsx`, `plan-inspector.tsx`, `floor-tree.tsx`
- Modify: `packages/project-store/src/project-store.ts`, `project-store.test.ts`

**Interfaces:**
- Consumes: reference hit test, exact record patch, current floor/layer/selection.
- Produces: shared tree/canvas/Inspector selection, reversible numeric placement/properties, guarded reference translation, deletion, lock.

- [ ] **Step 1: Add failing selection and durable edit tests**

Test reference row/canvas selection, entity-over-reference priority, name/tags/opacity/translation/rotation edits, delete, undo/redo, locked inspection, blocked drag/delete/recalibration, hidden/locked layer behavior, and no mutation on invalid numeric input.

- [ ] **Step 2: With approval, confirm focused tests fail**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/reference-inspector.test.tsx apps/studio/src/features/plan-editor/interaction-controller.test.ts
pnpm.cmd vitest run packages/project-store/src/project-store.test.ts
```

- [ ] **Step 3: Add a typed convenience mutation**

`ProjectStore.applyPlanReferencePatch(before, after)` executes one `snapshot.records.patch` intent. It requires the same ID/floor/layer/asset/intrinsic size for ordinary property edits; asset replacement uses the separate import transaction.

- [ ] **Step 4: Integrate selection and placement**

Extend selection context with `{kind:'plan-reference',referenceId}`. Pointer select checks business entities first, then references. Dragging an unlocked selected reference previews translation transiently and commits once on pointer-up; Escape/blur/cancel restores the durable snapshot.

- [ ] **Step 5: Implement Inspector fields**

Use unit-aware translation inputs, radians/degrees boundary conversion consistent with existing Inspector, opacity `0..1`, sanitized tags/name, and lock toggle. Locked references disable mutation controls but remain focusable and readable.

- [ ] **Step 6: With approval, rerun tests and type checks**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/reference-inspector.test.tsx apps/studio/src/features/plan-editor/interaction-controller.test.ts apps/studio/src/features/plan-editor/plan-editor.test.tsx
pnpm.cmd vitest run packages/project-store/src/project-store.test.ts
pnpm.cmd exec tsc -p packages/project-store/tsconfig.json --noEmit
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
```

- [ ] **Step 7: Commit**

```powershell
git add -- aethertwin/packages/project-store/src aethertwin/apps/studio/src/features/plan-editor
git commit -m 'feat: edit and place plan references'
```

---

### Task 13: Add keyboard-operable two-point calibration

**Files:**
- Create: `apps/studio/src/features/plan-editor/calibration-panel.tsx`
- Create: `apps/studio/src/features/plan-editor/calibration-panel.test.tsx`
- Modify: `apps/studio/src/features/plan-editor/editor-session.ts`, `editor-session.test.ts`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.tsx`, `plan-toolbar.tsx`, `plan-canvas.tsx`, `plan-accessibility.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.test.tsx`, `plan-canvas.test.tsx`
- Modify: `apps/studio/src/app.css`

**Interfaces:**
- Consumes: selected unlocked reference, source/world conversion, `previewCalibration`, reference patch.
- Produces: transient calibration draft, canvas/keyboard point entry, preview, explicit confirm/cancel, accessible mirror.

- [ ] **Step 1: Add failing workflow and accessibility tests**

Test Calibrate visibility in the Building group, locked/unsupported denial, point A/B by canvas, keyboard numeric X/Y inputs, unit-aware distance, coincident/invalid/out-of-range errors, proposed scale/bounds, preview-only snapshot stability, confirm one command, cancel/Escape, focus return, and mirror fields.

- [ ] **Step 2: With approval, confirm focused tests fail**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/calibration-panel.test.tsx apps/studio/src/features/plan-editor/editor-session.test.ts apps/studio/src/features/plan-editor/plan-canvas.test.tsx
```

- [ ] **Step 3: Define transient draft state**

```ts
export interface CalibrationDraft {
  readonly referenceId: string;
  readonly sourcePointA: Point2 | null;
  readonly sourcePointB: Point2 | null;
  readonly distanceText: string;
  readonly preview: CalibrationPreview | null;
}
```

The draft lives only in the vanilla Zustand session. Changing floor, selection, project, or active tool cancels it without durable mutation.

- [ ] **Step 4: Implement pointer and keyboard point entry**

Canvas clicks invert the reference transform to source coordinates and clamp only to the intrinsic rectangle. The panel exposes numeric X/Y controls for both points so the complete flow is keyboard operable. Distance uses the existing mm/cm/m parser.

- [ ] **Step 5: Preview then confirm**

Render source points/measurement/proposed bounds in the overlay and announce proposed mm/pixel and world size. Confirm sends the exact `before/after` patch; cancel changes nothing. Return focus to the initiating Calibrate button.

- [ ] **Step 6: Extend the accessible mirror**

Expose reference name, selected state, calibrated/unscaled status, mm/pixel, lock, opacity, and actions. Tree, canvas, Asset Library, Inspector, and mirror share the same selected ID.

- [ ] **Step 7: With approval, rerun tests and type check**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/calibration-panel.test.tsx apps/studio/src/features/plan-editor/editor-session.test.ts apps/studio/src/features/plan-editor/plan-canvas.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
```

- [ ] **Step 8: Commit**

```powershell
git add -- aethertwin/apps/studio/src/features/plan-editor aethertwin/apps/studio/src/app.css
git commit -m 'feat: add two-point plan calibration'
```

---

### Task 14: Prove the vertical slice and update contracts

**Files:**
- Modify: `apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx`
- Create: `crates/project-io/tests/schema_v3_recovery.rs`
- Create: `crates/desktop-host/tests/asset_lifecycle.rs`
- Modify: `tests/workspace-structure.test.mjs`, `visible-actions.test.mjs`, `project-format-policy.test.mjs`, `offline-source-policy.test.mjs`
- Modify: `crates/desktop-host/capabilities/default.json`
- Modify: `docs/ARCHITECTURE.md`, `PROJECT_FORMAT.md`, `PRODUCT_SPEC.md`, `DECISIONS.md`, `ROADMAP.md`
- Create: `docs/M2_1_REPORT.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: complete schema→native bytes→records→render→calibration path.
- Produces: reopen/recovery evidence, exact policy assertions, honest M2.1 report, clean handoff to M2.2.

- [ ] **Step 1: Add failing end-to-end injected integration tests**

Exercise import PNG/JPEG/SVG, asset+reference transaction, placement, calibration, lock, undo/redo, checkpoint, close/reopen, simulated recovery, same relative identity/scale, missing/corrupt placeholder, and reimport repair. Use injected renderer/backend only; do not start a browser or runtime.

- [ ] **Step 2: Add native lifecycle integration tests**

Prove v2 migration rollback/reopen/recovery, import dedup/collision/cancel, metadata commit failure residue, verified resolver/range behavior, close cleanup, and stable error mapping. Assert the invoke list is exactly eight and capability permissions remain exactly window+dialog.

- [ ] **Step 3: Update policy tests before documentation**

Require real `asset-pipeline` and `asset-io` implementations; schema parity at v3; canonical path; offline scanning of new boundaries; only implemented Import/Calibrate actions visible; no openings/fixtures/content/routes/3D/export claims; no remote runtime URL or broad filesystem permission.

- [ ] **Step 4: With approval, run focused TypeScript and Node evidence**

```powershell
pnpm.cmd vitest run packages/core-model/src/core-model.test.ts packages/asset-pipeline/src/asset-pipeline.test.ts packages/project-store/src/snapshot-records-command.test.ts packages/project-store/src/project-store.test.ts packages/plan-engine/src/calibration.test.ts packages/plan-engine/src/plan-references.test.ts packages/render-plan-2d/src/scene-projection.test.ts packages/render-plan-2d/src/pixi-plan-renderer.test.ts apps/studio/src/backend/tauri-backend.test.ts apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx
node --test tests/workspace-structure.test.mjs tests/visible-actions.test.mjs tests/project-format-policy.test.mjs tests/offline-source-policy.test.mjs
```

Expected: all tests pass with no browser/runtime launch.

- [ ] **Step 5: With approval, run all changed-package type checks**

```powershell
pnpm.cmd exec tsc -p packages/core-model/tsconfig.json --noEmit
pnpm.cmd exec tsc -p packages/asset-pipeline/tsconfig.json --noEmit
pnpm.cmd exec tsc -p packages/project-store/tsconfig.json --noEmit
pnpm.cmd exec tsc -p packages/plan-engine/tsconfig.json --noEmit
pnpm.cmd exec tsc -p packages/render-plan-2d/tsconfig.json --noEmit
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
```

Expected: all six checks exit 0.

- [ ] **Step 6: With approval, run focused Rust evidence**

```powershell
cargo test -p asset-io
cargo test -p project-io --test contract_fixture
cargo test -p project-io --test commit_recovery
cargo test -p project-io --test schema_v3_recovery
cargo test -p desktop-host --test command_contract
cargo test -p desktop-host --test asset_lifecycle
cargo check -p asset-io -p project-io -p desktop-host
```

Expected: all tests pass and Cargo check exits 0.

- [ ] **Step 7: Update documentation and evidence honestly**

Document schema v3, canonical paths, import/protocol boundary, eight commands, reference/calibration semantics, stable error codes, and M2.1 acceptance. `M2_1_REPORT.md` must explicitly state that build/dev/debug/browser/Playwright/packaged runtime/screenshot and real GPU evidence were not run.

- [ ] **Step 8: Perform final read-only hygiene**

```powershell
git diff --check
git diff --stat
git status --short
```

Expected: no whitespace errors; only the listed M2.1 files are modified before the final commit.

- [ ] **Step 9: Commit M2.1 evidence**

```powershell
git add -- aethertwin/apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx aethertwin/crates/project-io/tests/schema_v3_recovery.rs aethertwin/crates/desktop-host/tests/asset_lifecycle.rs aethertwin/tests aethertwin/crates/desktop-host/capabilities/default.json aethertwin/docs aethertwin/README.md
git commit -m 'docs: close AetherTwin M2.1 assets and calibration'
```

---

## Acceptance checkpoint

M2.1 is complete only when an imported PNG, JPEG, or sanitized SVG can be selected by asset ID, placed, calibrated from two source points, locked, saved, closed, reopened, and recovered with the same content-addressed relative identity and world scale. Missing or digest-mismatched bytes must remain unserved while structural authoring and reimport stay available. No later-M2 control may be visible.
