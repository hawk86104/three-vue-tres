# AetherTwin M2.3 Content and Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver durable showroom product content with local image/video attachments, deterministic route-network authoring and resolution, and one keyboard-operable guided route that survives save, reopen, and dirty recovery.

**Architecture:** Keep schema v3 and the eight-command native boundary. `core-model` and Rust `project-io` jointly enforce durable content/route invariants; a new pure `route-engine` owns segment insertion and deterministic resolution; `plan-engine` owns hotspot/content intents; `project-store` composes asset import with one multi-collection `snapshot.records.patch`; `render-plan-2d` projects authored and resolved routes; Studio owns transient tools, drafts, selection, preview, and accessible controls.

**Tech Stack:** Node.js 24, pnpm 11, React 19, TypeScript 6, Vitest 4, Testing Library, Zustand 5, PixiJS 8.19.0, Tauri 2.11, Rust 1.94, serde, SQLite, and the existing Aether design system.

## Global Constraints

- Implement `docs/superpowers/specs/2026-07-22-aethertwin-m2-3-content-routes-design.md`; do not add synchronized 3D, materials/lights UI, export, Player, market workflow, accessible-route toggles, temporary closures, vendor destinations, or live indoor position.
- Keep `CURRENT_SCHEMA_VERSION` exactly `3`; add no migration and keep profiles exactly `'showroom' | 'market'`.
- Keep native invokes exactly eight. Content and route durability use the existing `snapshot.records.patch`; asset bytes use the existing import/cancel commands.
- Store millimetres and radians. Route positions and distances are millimetres; route costs are `distance * weight`.
- Product content targets only `Fixture` or `PointOfInterest(kind="product-hotspot")`. Every product hotspot has exactly one content record; a fixture has zero or one.
- M2 media kinds are exactly `image | video`. Image media accepts PNG/JPEG/sanitized SVG; video accepts MP4/WebM. Durable paths remain canonical project-relative paths.
- Product media order is durable and contains no duplicate `MediaAsset` IDs. Removing references never removes immutable asset bytes.
- Route node kinds are exactly `junction | entrance | showroom-stop`. Route edges connect distinct same-floor nodes, have exact Euclidean distance within `1e-7 mm`, positive width, weight at least `1`, and finite values.
- Duplicate same-floor nodes within `1e-7 mm` are invalid. Edge arc duplication is invalid: a bidirectional edge owns both arcs; two opposing unidirectional edges remain valid.
- Segment insertion uses snap tolerance `5 mm` by default, accepts `[0.1, 100] mm`, defaults new edge width to `1200 mm`, splits crossings deterministically, rejects positive collinear overlap, and aborts before mutation after `100_000` intersection checks.
- Route resolution ignores disabled edges. Cost ties within `1e-9` choose the lexicographically smallest canonical node/edge path signature.
- Guided routes contain at least two stops in one network and one floor. Adjacent stop IDs must differ; a later repeated stop is allowed for loop tours. Persist stops, never a cached resolved path.
- Zustand stores only transient active tools, draft segments, stop drafts, preview results, focus targets, and errors. ProjectStore remains the only durable publication path.
- Work from `E:\数字孪生\.worktrees\aethertwin-m2\aethertwin`; run Git commands from `E:\数字孪生\.worktrees\aethertwin-m2`.
- Preserve the existing modifications in `crates/asset-io/Cargo.toml` and `crates/desktop-host/Cargo.toml`. Never edit, restore, stage, or commit them.
- Tests, lint, TypeScript checks, Rust tests, `cargo fmt`, and `cargo check` are execution-time approval gates. Run only after explicit user approval for that command class.
- Never run build, dev, debug, browser, Playwright, packaged runtime, or screenshot commands unless separately authorized.
- Each task uses RED before implementation, stages only its listed files, inspects the staged diff, and ends in one focused commit after approved checks pass.
- At every boundary run only the read-only checks `git diff --check`, `git status --short`, and staged-diff inspection without further approval.

---

## File and Responsibility Map

### Durable contracts

- `fixtures/contracts/content-routes.v1.json` — language-neutral valid/invalid M2.3 contract vectors.
- `packages/core-model/src/content-model.ts` — exact M2 media and route kind unions.
- `packages/core-model/src/validation.ts` — content cardinality, media compatibility, route topology, distance, duplication, and guided-stop validation.
- `crates/project-io/src/model.rs` — typed Rust collections and the same final-snapshot invariants.
- `packages/project-store/src/project-store.ts` — atomic asset/media/content import and broken-media replacement.

### Pure domain logic

- `packages/route-engine/src/insertion.ts` — snap, crossing split, collinear rejection, deterministic IDs/order, and no-partial-result insertion.
- `packages/route-engine/src/resolver.ts` — deterministic Dijkstra and multi-stop guided-route concatenation.
- `packages/plan-engine/src/content.ts` — product-hotspot/content creation and media-order intents.

### Projection and Studio

- `packages/render-plan-2d/src/scene-projection.ts` — hotspot style, authored route network, and resolved-route overlay records.
- `apps/studio/src/features/plan-editor/editor-session.ts` — transient route segment/stop drafts and active route IDs.
- `apps/studio/src/features/plan-editor/interaction-controller.ts` — hotspot and route pointer/keyboard state machines.
- `apps/studio/src/features/plan-editor/content-inspector.tsx` — metadata, local media, ordering, repair, and preview.
- `apps/studio/src/features/plan-editor/route-panel.tsx` — node/edge editing, stop authoring, validation, and preview.
- `apps/studio/src/features/plan-editor/plan-accessibility.tsx` — equivalent hotspot, route-node, route-edge, stop, and preview operations.

---

### Task 1: Activate exact TypeScript content and route contracts

**Files:**
- Create: `fixtures/contracts/content-routes.v1.json`
- Modify: `packages/core-model/src/content-model.ts`
- Modify: `packages/core-model/src/spatial-entities.ts`
- Modify: `packages/core-model/src/validation.ts`
- Modify: `packages/core-model/src/index.ts`
- Modify: `packages/core-model/src/core-model.test.ts`
- Create: `packages/core-model/src/content-routes.test.ts`

**Interfaces:**

```ts
export type MediaAssetKind = "image" | "video";
export type RouteNodeKind = "junction" | "entrance" | "showroom-stop";
export const ROUTE_GEOMETRY_EPSILON_MM = 1e-7;

export type PointOfInterestKind =
  | "entrance" | "exit" | "service-desk" | "restroom" | "accessible-restroom"
  | "stage" | "food" | "rest-area" | "medical" | "fire-safety" | "parking"
  | "charging" | "storage" | "nursery" | "water" | "atm" | "closed-area"
  | "custom" | "product-hotspot";

export interface MediaAsset extends ProjectRecordBase {
  readonly assetId: string;
  readonly kind: MediaAssetKind;
}

export interface RouteNode extends ProjectRecordBase {
  readonly position: Point2;
  readonly floorId: string;
  readonly kind: RouteNodeKind;
}
```

- [ ] **Step 1: Add failing shared vectors and TypeScript tests**

Create vectors for fixture/hotspot targets, hotspot cardinality, duplicate content/media IDs, media-kind/signature mismatch, route kinds, same-floor edges, exact distance, zero-length/duplicate nodes, expanded-arc duplication, weight boundary, guided route network/floor/adjacent-stop rules, and valid loop tours.

- [ ] **Step 2: With approval, run RED**

```powershell
pnpm.cmd vitest run packages/core-model/src/content-routes.test.ts packages/core-model/src/core-model.test.ts
```

Expected: new cases fail because kinds and final-snapshot invariants are still broad.

- [ ] **Step 3: Implement exact parsing and candidate-snapshot validation**

Use these rules in the final validation pass:

```ts
const expectedDistance = Math.hypot(to.position.x - from.position.x, to.position.y - from.position.y);
if (Math.abs(edge.distance - expectedDistance) > ROUTE_GEOMETRY_EPSILON_MM) {
  fail("INVALID_VALUE", `${path}.distance`, "must equal the Euclidean node distance");
}
if (edge.weight < 1) {
  fail("INVALID_VALUE", `${path}.weight`, "must be at least 1");
}
```

Build target/media/network maps only after every collection is parsed. Expand each edge into directed arc keys; insert the reverse key only for bidirectional edges and reject an already-owned arc.

- [ ] **Step 4: With approval, run GREEN and typecheck**

```powershell
pnpm.cmd vitest run packages/core-model/src/content-routes.test.ts packages/core-model/src/core-model.test.ts
pnpm.cmd exec tsc -p packages/core-model/tsconfig.json --noEmit
```

Expected: shared vectors and existing schema-v3 tests pass; schema version remains 3.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/fixtures/contracts/content-routes.v1.json aethertwin/packages/core-model/src/content-model.ts aethertwin/packages/core-model/src/spatial-entities.ts aethertwin/packages/core-model/src/validation.ts aethertwin/packages/core-model/src/index.ts aethertwin/packages/core-model/src/core-model.test.ts aethertwin/packages/core-model/src/content-routes.test.ts
git commit -m "feat: validate showroom content and route records"
```

**Acceptance:** `parseSnapshot` rejects every broken target/media/route relation atomically and accepts the complete valid vector set without changing schema version.

**Failure inspection:** `validation.ts` parse order, global UUID registration, `spatial-entities.ts` POI kinds, and media-type constants.

**Risk and rollback:** Tightening previously permissive v3 records can reject experimental files. Revert this commit rather than adding a migration or weakening target/media cardinality.

---

### Task 2: Match M2.3 validation in Rust

**Files:**
- Modify: `crates/project-io/src/model.rs`
- Create: `crates/project-io/tests/content_routes.rs`
- Modify: `crates/project-io/tests/contract_fixture.rs`

**Interfaces:**

```rust
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RouteNodeKind { Junction, Entrance, ShowroomStop }

pub struct SpatialProject {
    pub product_contents: Vec<ProductContent>,
    pub media_assets: Vec<MediaAsset>,
    pub route_networks: Vec<RouteNetwork>,
    // existing fields unchanged
}
```

- [ ] **Step 1: Add a Rust harness for the shared vectors**

Deserialize `../../../fixtures/contracts/content-routes.v1.json`, materialize each candidate snapshot, and assert exact accept/reject parity with TypeScript.

- [ ] **Step 2: With approval, run RED**

```powershell
cargo test -p project-io --test content_routes
```

Expected: failures show broad `Value` collections and missing M2.3 invariants.

- [ ] **Step 3: Convert only activated collections to typed Rust records**

Keep unrelated deferred collections as `Value`. Validate media-to-asset type, target cardinality, node kinds, distance epsilon, expanded arcs, same-floor edges, and guided-stop rules after the complete candidate snapshot is deserialized.

- [ ] **Step 4: With approval, run focused parity checks**

```powershell
cargo test -p project-io --test content_routes
cargo test -p project-io --test contract_fixture
cargo check -p project-io
cargo fmt --all -- --check
```

Expected: parity, fixture, crate check, and formatting pass.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/crates/project-io/src/model.rs aethertwin/crates/project-io/tests/content_routes.rs aethertwin/crates/project-io/tests/contract_fixture.rs
git commit -m "feat: enforce content and route contracts in project io"
```

**Acceptance:** Rust rejects every shared invalid vector before session publication and serializes valid typed records back to the exact camel-case schema-v3 shape.

**Failure inspection:** `SpatialProject` serde defaults, `SnapshotRecordsPatch` typed variants, UUID registration, and `register_route_networks` replacement.

**Risk and rollback:** Typed conversion may expose old test fixtures that relied on loose JSON. Fix fixtures to the approved contract; do not restore broad runtime acceptance.

---

### Task 3: Create the pure route-engine segment insertion boundary

**Files:**
- Create: `packages/route-engine/package.json`
- Create: `packages/route-engine/tsconfig.json`
- Create: `packages/route-engine/src/index.ts`
- Create: `packages/route-engine/src/result.ts`
- Create: `packages/route-engine/src/insertion.ts`
- Create: `packages/route-engine/src/insertion.test.ts`
- Modify: `pnpm-lock.yaml`
- Modify: `tests/workspace-structure.test.mjs`

**Interfaces:**

```ts
export type RouteMutationErrorCode =
  | "ROUTE_ZERO_LENGTH"
  | "ROUTE_COLLINEAR_OVERLAP"
  | "ROUTE_COMPLEXITY_LIMIT";

export interface RouteIdSource {
  next(kind: "node" | "edge", canonicalKey: string): string;
}

export interface InsertRouteSegmentInput {
  readonly network: RouteNetwork;
  readonly floorId: string;
  readonly start: Point2;
  readonly end: Point2;
  readonly idSource: RouteIdSource;
  readonly snapToleranceMm?: number;
  readonly widthMm?: number;
}

export function insertRouteSegment(input: InsertRouteSegmentInput): Result<RouteNetwork, RouteMutationError>;
```

- [ ] **Step 1: Add package ownership and failing insertion tests**

Cover new endpoints, endpoint snapping, T-junctions, proper crossings, multiple crossings, existing-edge split property preservation, inserted-edge defaults, canonical allocation order, positive collinear overlap, zero length, duplicate prevention, and the 100,000-check cap.

- [ ] **Step 2: With approval, run RED and lockfile update**

```powershell
pnpm.cmd install --lockfile-only --offline
pnpm.cmd vitest run packages/route-engine/src/insertion.test.ts
node --test tests/workspace-structure.test.mjs
```

Expected: route-engine tests fail before implementation; workspace policy passes only after the real package files and dependency are present.

- [ ] **Step 3: Implement immutable segment insertion**

Compute every intersection before allocating IDs or constructing output. Sort split points by segment parameter then canonical existing edge ID. Call `idSource.next` only in that canonical order. Split an existing edge into edges that retain its name/tags/width/weight/enabled/bidirectional/accessible fields and recompute exact distances.

- [ ] **Step 4: With approval, run GREEN and typecheck**

```powershell
pnpm.cmd vitest run packages/route-engine/src/insertion.test.ts
pnpm.cmd exec tsc -p packages/route-engine/tsconfig.json --noEmit
node --test tests/workspace-structure.test.mjs
```

Expected: all route insertion and workspace ownership tests pass.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/packages/route-engine/package.json aethertwin/packages/route-engine/tsconfig.json aethertwin/packages/route-engine/src/index.ts aethertwin/packages/route-engine/src/result.ts aethertwin/packages/route-engine/src/insertion.ts aethertwin/packages/route-engine/src/insertion.test.ts aethertwin/pnpm-lock.yaml aethertwin/tests/workspace-structure.test.mjs
git commit -m "feat: insert deterministic route segments"
```

**Acceptance:** success returns one complete immutable network; every failure returns no partial network and never consumes an ID.

**Failure inspection:** segment intersection classification, tolerance comparisons, split parameter sorting, and arc de-duplication.

**Risk and rollback:** Intersection mistakes corrupt topology. Revert the package commit; do not move mutation logic into Studio or ProjectStore.

---

### Task 4: Resolve deterministic routes and guided tours

**Files:**
- Create: `packages/route-engine/src/resolver.ts`
- Create: `packages/route-engine/src/resolver.test.ts`
- Modify: `packages/route-engine/src/index.ts`

**Interfaces:**

```ts
export interface ResolvedRoute {
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly totalDistance: number;
  readonly turnPoints: readonly Point2[];
}

export interface NoRouteError {
  readonly code: "NO_ROUTE";
  readonly fromStopId: string;
  readonly toStopId: string;
  readonly pairIndex: number;
}

export function resolveRoute(network: RouteNetwork, fromNodeId: string, toNodeId: string): Result<ResolvedRoute, NoRouteError>;
export function resolveGuidedRoute(network: RouteNetwork, route: GuidedRoute): Result<ResolvedRoute, NoRouteError>;
```

- [ ] **Step 1: Write failing resolver tests**

Cover bidirectional/unidirectional traversal, disabled edges, distance-times-weight costs, canonical tie breaks, cycles, disconnected pairs, missing stops, multi-stop concatenation, duplicate boundary removal, loop tours, and turn-point extraction.

- [ ] **Step 2: With approval, run RED**

```powershell
pnpm.cmd vitest run packages/route-engine/src/resolver.test.ts
```

Expected: exports are missing.

- [ ] **Step 3: Implement stable Dijkstra**

Sort adjacency by destination node ID then edge ID. Queue entries carry `{ cost, signature, nodeId }`; lower cost wins and costs within `1e-9` compare by signature. Never mutate the network or cache a path in `GuidedRoute`.

- [ ] **Step 4: With approval, run GREEN and package typecheck**

```powershell
pnpm.cmd vitest run packages/route-engine/src/insertion.test.ts packages/route-engine/src/resolver.test.ts
pnpm.cmd exec tsc -p packages/route-engine/tsconfig.json --noEmit
```

Expected: insertion and resolution suites pass.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/packages/route-engine/src/resolver.ts aethertwin/packages/route-engine/src/resolver.test.ts aethertwin/packages/route-engine/src/index.ts
git commit -m "feat: resolve deterministic guided routes"
```

**Acceptance:** equal inputs return byte-equivalent ordered IDs and errors identify the exact failing stop pair.

**Failure inspection:** priority ordering, directed arc expansion, path signature construction, and boundary-node concatenation.

**Risk and rollback:** An unstable tie break makes saved demos nondeterministic. Revert the resolver commit without changing durable route records.

---

### Task 5: Add pure product-hotspot and media-order intents

**Files:**
- Create: `packages/plan-engine/src/content.ts`
- Create: `packages/plan-engine/src/content.test.ts`
- Modify: `packages/plan-engine/src/index.ts`

**Interfaces:**

```ts
export interface ProductHotspotIntent {
  readonly entity: PointOfInterest;
  readonly content: ProductContent;
}

export function createProductHotspotIntent(input: {
  entityId: string; contentId: string; floorId: string; layerId: string;
  point: Point2; name: string;
}): Result<ProductHotspotIntent, PlanError>;

export function reorderProductMedia(
  content: ProductContent,
  mediaAssetId: string,
  direction: "up" | "down",
): Result<ProductContent, PlanError>;
```

- [ ] **Step 1: Write failing intent tests**

Assert identity transform, `kind: "product-hotspot"`, optional `spatial3D` omission, exact content target, no duplicate media IDs, bounds-safe reordering, and immutable results.

- [ ] **Step 2: With approval, run RED**

```powershell
pnpm.cmd vitest run packages/plan-engine/src/content.test.ts
```

Expected: missing exports.

- [ ] **Step 3: Implement pure intents**

Use normal `PointOfInterest` and `ProductContent` records. Do not import ProjectStore, route-engine, React, or Zustand.

- [ ] **Step 4: With approval, run GREEN and typecheck**

```powershell
pnpm.cmd vitest run packages/plan-engine/src/content.test.ts packages/plan-engine/src/operations.test.ts
pnpm.cmd exec tsc -p packages/plan-engine/tsconfig.json --noEmit
```

Expected: content and existing operation tests pass.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/packages/plan-engine/src/content.ts aethertwin/packages/plan-engine/src/content.test.ts aethertwin/packages/plan-engine/src/index.ts
git commit -m "feat: create showroom product content intents"
```

**Acceptance:** hotspot and media-order logic is deterministic, immutable, and independent of persistence/UI.

**Failure inspection:** `spatial-entities.ts` POI shape, existing identity-transform helpers, and result/error conventions.

**Risk and rollback:** Avoid expanding the generic POI model. Revert this task if the intent cannot remain a pure schema-v3 composition.

---

### Task 6: Import and repair product media atomically in ProjectStore

**Files:**
- Modify: `packages/project-store/src/project-store.ts`
- Modify: `packages/project-store/src/project-store.test.ts`
- Modify: `packages/project-store/src/index.ts`

**Interfaces:**

```ts
export interface ProductMediaImportInput {
  readonly request: AssetImportRequest; // role is content-image or content-video
  readonly media: Omit<MediaAsset, "assetId">;
  readonly contentBefore: ProductContent | null;
  readonly contentAfter: ProductContent; // contains media.id exactly once
}

export interface ProductMediaImportResult {
  readonly asset: AssetRecord;
  readonly media: MediaAsset;
  readonly content: ProductContent;
}

ProjectStore.importProductMedia(input, onProgress?): Promise<ProductMediaImportResult>;
ProjectStore.replaceBrokenProductMedia(mediaAssetId, request, onProgress?): Promise<MediaAsset>;
```

- [ ] **Step 1: Write failing transaction tests**

Assert one backend import plus one CommandBus transaction creates `AssetRecord`, `MediaAsset`, and the appended `ProductContent`; `contentBefore: null` creates first content for a Fixture in that same transaction; commit failure publishes no records; stale `contentBefore` is rejected; cancellation is safe; repair retargets only the media record, preserves product order, clears the old asset issue, and retains old immutable bytes.

- [ ] **Step 2: With approval, run RED**

```powershell
pnpm.cmd vitest run packages/project-store/src/project-store.test.ts
```

Expected: new methods are absent.

- [ ] **Step 3: Implement queued mutation coordinators**

Follow `performPlanReferenceImport`, but create one `bus.transaction` with `assets`, `mediaAssets`, and `productContents` patch intents. Validate request role against `media.kind` before native work. Reread the content in the queued mutation and require exact `contentBefore` ownership.

- [ ] **Step 4: With approval, run GREEN and typecheck**

```powershell
pnpm.cmd vitest run packages/project-store/src/project-store.test.ts packages/project-store/src/snapshot-records-command.test.ts
pnpm.cmd exec tsc -p packages/project-store/tsconfig.json --noEmit
```

Expected: all ProjectStore and record-patch tests pass.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/packages/project-store/src/project-store.ts aethertwin/packages/project-store/src/project-store.test.ts aethertwin/packages/project-store/src/index.ts
git commit -m "feat: attach local media to product content"
```

**Acceptance:** visible product-media records publish together or not at all; retry never trusts or deletes old immutable bytes.

**Failure inspection:** queued mutation ownership, `performPlanReferenceImport`, snapshot-record inverse generation, and asset issue reconciliation.

**Risk and rollback:** Native bytes can outlive a failed metadata commit by design. Revert metadata coordination only; never delete content-addressed bytes as rollback.

---

### Task 7: Prove content and route replay through the existing journal command

**Files:**
- Modify: `packages/project-store/src/snapshot-records-command.test.ts`
- Modify: `packages/project-store/src/project-store.test.ts`
- Modify: `crates/project-io/tests/commit_recovery.rs`
- Modify: `crates/project-io/tests/schema_v3_recovery.rs`
- Modify: `crates/desktop-host/tests/command_contract.rs`

**Interfaces:** Use existing `ProjectStore.applySnapshotRecordPatches` and `snapshot.records.patch`; add no production command or invoke.

- [ ] **Step 1: Add failing end-to-end replay tests**

Create heterogeneous entity/content/media records, one route network, and one guided route. Exercise apply, undo, redo, checkpoint, close/reopen, and dirty recovery. Include commit failure and exact retry.

- [ ] **Step 2: With approval, run RED**

```powershell
pnpm.cmd vitest run packages/project-store/src/snapshot-records-command.test.ts packages/project-store/src/project-store.test.ts
cargo test -p project-io --test commit_recovery
cargo test -p project-io --test schema_v3_recovery
```

Expected: tests expose any typed-collection/replay mismatch; no ninth native command is introduced.

- [ ] **Step 3: Make only replay/normalization fixes required by the tests**

Keep one journal row per collection patch and one CommandBus transaction for related rows. Candidate final-snapshot validation occurs after all rows are applied.

- [ ] **Step 4: With approval, run GREEN and native contract checks**

```powershell
pnpm.cmd vitest run packages/project-store/src/snapshot-records-command.test.ts packages/project-store/src/project-store.test.ts
cargo test -p project-io --test commit_recovery
cargo test -p project-io --test schema_v3_recovery
cargo test -p desktop-host --test command_contract
cargo check -p project-io
```

Expected: replay/recovery tests pass and the command test still reports exactly eight invokes.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/packages/project-store/src/snapshot-records-command.test.ts aethertwin/packages/project-store/src/project-store.test.ts aethertwin/crates/project-io/tests/commit_recovery.rs aethertwin/crates/project-io/tests/schema_v3_recovery.rs aethertwin/crates/desktop-host/tests/command_contract.rs
git commit -m "test: recover showroom content and routes"
```

**Acceptance:** one valid content/route snapshot is semantically identical after all live and recovery paths.

**Failure inspection:** collection allowlists in TypeScript/Rust, inverse row order, normalized indices, and final-state parser timing.

**Risk and rollback:** Do not add a specialized native command to bypass replay gaps. Revert and fix typed serialization first.

---

### Task 8: Project hotspots, authored routes, and guided previews in 2D

**Files:**
- Modify: `packages/render-plan-2d/package.json`
- Modify: `packages/render-plan-2d/src/types.ts`
- Modify: `packages/render-plan-2d/src/scene-projection.ts`
- Modify: `packages/render-plan-2d/src/scene-projection.test.ts`
- Modify: `packages/render-plan-2d/src/pixi-plan-renderer.ts`
- Modify: `packages/render-plan-2d/src/pixi-plan-renderer.test.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

```ts
export interface PlanRendererInput {
  // existing fields
  readonly activeRouteNetworkId?: string | null;
  readonly resolvedRoute?: ResolvedRoute | null;
}

export type RenderGeometry =
  | { readonly kind: "polygon" | "polyline"; readonly points: readonly Point2[]; readonly closed: boolean }
  | { readonly kind: "circle"; readonly center: Point2; readonly radius: number }
  | { readonly kind: "dimension"; readonly start: Point2; readonly end: Point2; readonly label: Point2; readonly millimetres: number }
  | { readonly kind: "opening"; readonly symbol: RenderOpeningSymbol }
  | { readonly kind: "room-candidate"; readonly candidate: RenderRoomCandidate }
  | { readonly kind: "image"; readonly assetId: string; readonly corners: readonly [Point2, Point2, Point2, Point2]; readonly opacity: number }
  | { readonly kind: "route-node"; readonly center: Point2; readonly nodeKind: RouteNodeKind }
  | { readonly kind: "route-edge"; readonly start: Point2; readonly end: Point2; readonly resolved: boolean };
```

- [ ] **Step 1: Add failing projection and renderer tests**

Assert active-floor filtering, hotspot style token, authored node/edge IDs, directed/bidirectional style metadata, resolved overlay ordering, selection, visibility, removal, and no route-engine business state inside Pixi objects.

- [ ] **Step 2: With approval, run RED and lockfile update**

```powershell
pnpm.cmd install --lockfile-only --offline
pnpm.cmd vitest run packages/render-plan-2d/src/scene-projection.test.ts packages/render-plan-2d/src/pixi-plan-renderer.test.ts
```

Expected: route geometry is absent.

- [ ] **Step 3: Implement immutable route render records**

Depend on `@aethertwin/route-engine` only for `ResolvedRoute` type. Render authored routes below selection overlays and the resolved route above authored edges. Use durable node/edge IDs for hit/selection identity.

- [ ] **Step 4: With approval, run GREEN and typecheck**

```powershell
pnpm.cmd vitest run packages/render-plan-2d/src/scene-projection.test.ts packages/render-plan-2d/src/pixi-plan-renderer.test.ts
pnpm.cmd exec tsc -p packages/render-plan-2d/tsconfig.json --noEmit
```

Expected: projection, reconciliation, and typecheck pass.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/packages/render-plan-2d/package.json aethertwin/packages/render-plan-2d/src/types.ts aethertwin/packages/render-plan-2d/src/scene-projection.ts aethertwin/packages/render-plan-2d/src/scene-projection.test.ts aethertwin/packages/render-plan-2d/src/pixi-plan-renderer.ts aethertwin/packages/render-plan-2d/src/pixi-plan-renderer.test.ts aethertwin/pnpm-lock.yaml
git commit -m "feat: render showroom routes in plan view"
```

**Acceptance:** one active-floor network and optional resolved route project deterministically without becoming Pixi-owned business data.

**Failure inspection:** render-layer ordering, hit identity, `projectScene` active-floor filters, and renderer removal/disposal.

**Risk and rollback:** Route visuals must not introduce a second model. Revert projection changes if Pixi state becomes authoritative.

---

### Task 9: Add M2.3 transient session state and visible tool policy

**Files:**
- Modify: `packages/mode-showroom/src/tool-policy.ts`
- Modify: `packages/mode-showroom/src/tool-policy.test.ts`
- Modify: `apps/studio/package.json`
- Modify: `apps/studio/src/features/plan-editor/editor-session.ts`
- Modify: `apps/studio/src/features/plan-editor/editor-session.test.ts`
- Modify: `apps/studio/src/features/plan-editor/plan-toolbar.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.test.tsx`
- Modify: `tests/visible-actions.test.mjs`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

```ts
export type PlanTool =
  | "select" | "pan" | "boundary" | "wall" | "door" | "window"
  | "zone" | "space-unit" | "fixture" | "poi" | "dimension"
  | "product-hotspot" | "route-node" | "route-edge";

export interface RouteAuthoringState {
  readonly networkId: string | null;
  readonly segmentStart: Point2 | null;
  readonly stopDraft: readonly string[];
  readonly persistenceError?: string;
}
```

- [ ] **Step 1: Write failing policy/session tests**

Assert Content group (`product-hotspot`, attachment action), Tour group (`route-node`, `route-edge`, stop editing, preview), exact transient reset on floor/session/tool changes, focus return, and absence of M2.4/M2.5 controls.

- [ ] **Step 2: With approval, run RED and lockfile update**

```powershell
pnpm.cmd install --lockfile-only --offline
pnpm.cmd vitest run packages/mode-showroom/src/tool-policy.test.ts apps/studio/src/features/plan-editor/editor-session.test.ts apps/studio/src/features/plan-editor/plan-editor.test.tsx
node --test tests/visible-actions.test.mjs
```

Expected: missing tools/state/actions.

- [ ] **Step 3: Implement transient state and exact visible groups**

Studio depends on `@aethertwin/route-engine`; ProjectStore does not. Reset segment/stop drafts on project replacement, floor change, incompatible tool switch, and Escape. Never persist route previews.

- [ ] **Step 4: With approval, run GREEN and Studio typecheck**

```powershell
pnpm.cmd vitest run packages/mode-showroom/src/tool-policy.test.ts apps/studio/src/features/plan-editor/editor-session.test.ts apps/studio/src/features/plan-editor/plan-editor.test.tsx
node --test tests/visible-actions.test.mjs
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
```

Expected: exact M2.3 surface passes without future controls.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/packages/mode-showroom/src/tool-policy.ts aethertwin/packages/mode-showroom/src/tool-policy.test.ts aethertwin/apps/studio/package.json aethertwin/apps/studio/src/features/plan-editor/editor-session.ts aethertwin/apps/studio/src/features/plan-editor/editor-session.test.ts aethertwin/apps/studio/src/features/plan-editor/plan-toolbar.tsx aethertwin/apps/studio/src/features/plan-editor/plan-editor.test.tsx aethertwin/tests/visible-actions.test.mjs aethertwin/pnpm-lock.yaml
git commit -m "feat: expose showroom content and tour tools"
```

**Acceptance:** only implemented M2.3 actions appear and all new draft state is transient and session-bound.

**Failure inspection:** tool-policy/action mapping, session replacement guards, and focus-aware `selectTool` flow.

**Risk and rollback:** A visible control without persistence violates project policy. Revert the surface if its task-specific vertical path is not ready.

---

### Task 10: Create product hotspots through the live editor

**Files:**
- Modify: `apps/studio/src/features/plan-editor/interaction-controller.ts`
- Modify: `apps/studio/src/features/plan-editor/interaction-controller.test.ts`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.test.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-accessibility.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-canvas.test.tsx`

**Interfaces:** On one confirmed click/keyboard coordinate, call `createProductHotspotIntent`, then publish `entities` plus `productContents` in one `applySnapshotRecordPatches` transaction.

- [ ] **Step 1: Write failing interaction and accessibility tests**

Cover preview, confirm once, locked/hidden layer rejection, stale floor/session cancellation, exact two-record transaction, undo/redo, keyboard coordinate action, shared selection, focus return, and no implicit `spatial3D`.

- [ ] **Step 2: With approval, run RED**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/interaction-controller.test.ts apps/studio/src/features/plan-editor/plan-editor.test.tsx apps/studio/src/features/plan-editor/plan-canvas.test.tsx
```

Expected: product-hotspot tool has no live handler.

- [ ] **Step 3: Implement last-moment snapshot reread and atomic publication**

Generate entity/content UUIDs only at confirmation. If active floor/layer/session changed, clear preview and commit nothing. Select the new hotspot only after ProjectStore resolves.

- [ ] **Step 4: With approval, run GREEN and Studio typecheck**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/interaction-controller.test.ts apps/studio/src/features/plan-editor/plan-editor.test.tsx apps/studio/src/features/plan-editor/plan-canvas.test.tsx
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
```

Expected: pointer and accessible hotspot creation paths pass.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/apps/studio/src/features/plan-editor/interaction-controller.ts aethertwin/apps/studio/src/features/plan-editor/interaction-controller.test.ts aethertwin/apps/studio/src/features/plan-editor/plan-editor.tsx aethertwin/apps/studio/src/features/plan-editor/plan-editor.test.tsx aethertwin/apps/studio/src/features/plan-editor/plan-accessibility.tsx aethertwin/apps/studio/src/features/plan-editor/plan-canvas.test.tsx
git commit -m "feat: create showroom product hotspots"
```

**Acceptance:** every durable product hotspot is born with exactly one content record in the same transaction.

**Failure inspection:** controller gesture ownership, active layer guards, ID allocation timing, and heterogeneous patch ordering.

**Risk and rollback:** Never temporarily publish a hotspot without content. Revert both UI and controller changes together.

---

### Task 11: Edit content and manage local media in the Inspector

**Files:**
- Create: `apps/studio/src/features/plan-editor/content-inspector.tsx`
- Create: `apps/studio/src/features/plan-editor/content-inspector.test.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-inspector.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.tsx`
- Modify: `apps/studio/src/features/plan-editor/asset-picker.ts`
- Modify: `apps/studio/src/features/plan-editor/asset-library.tsx`
- Modify: `apps/studio/src/features/plan-editor/asset-library.test.tsx`
- Modify: `apps/studio/src/app.css`

**Interfaces:**

```ts
interface ContentInspectorProps {
  content: ProductContent;
  target: Fixture | PointOfInterest;
  media: readonly MediaAsset[];
  assetIssues: readonly AssetIssue[];
  onPatch(before: ProductContent, after: ProductContent): Promise<void>;
  onImport(role: "content-image" | "content-video", initiator: HTMLElement): Promise<void>;
  onRepair(media: MediaAsset, initiator: HTMLElement): Promise<void>;
}
```

- [ ] **Step 1: Write failing Inspector/media tests**

Cover name/description/tags, image/video picker filters, ordered media list, move up/down, remove reference without byte deletion, typed progress/cancel, broken-media repair, safe error redaction, image/video preview, codec-preview fallback, keyboard operation, and focus restoration.

- [ ] **Step 2: With approval, run RED**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/content-inspector.test.tsx apps/studio/src/features/plan-editor/asset-library.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx
```

Expected: content Inspector and content-role picker paths are absent.

- [ ] **Step 3: Implement one owned import/repair flow**

Use `ProjectStore.importProductMedia` and `replaceBrokenProductMedia`. Resolve previews through `store.resolveAsset`; use only returned local/custom URLs, never native paths or remote fallback. Disable duplicate import while one operation owns the picker.

- [ ] **Step 4: With approval, run GREEN and Studio typecheck**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/content-inspector.test.tsx apps/studio/src/features/plan-editor/asset-library.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
```

Expected: metadata, import, reordering, repair, preview, accessibility, and typecheck pass.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/apps/studio/src/features/plan-editor/content-inspector.tsx aethertwin/apps/studio/src/features/plan-editor/content-inspector.test.tsx aethertwin/apps/studio/src/features/plan-editor/plan-inspector.tsx aethertwin/apps/studio/src/features/plan-editor/plan-editor.tsx aethertwin/apps/studio/src/features/plan-editor/asset-picker.ts aethertwin/apps/studio/src/features/plan-editor/asset-library.tsx aethertwin/apps/studio/src/features/plan-editor/asset-library.test.tsx aethertwin/apps/studio/src/app.css
git commit -m "feat: edit showroom product media"
```

**Acceptance:** fixture/hotspot content and ordered local media are fully editable without exposing absolute paths or deleting immutable bytes.

**Failure inspection:** picker ownership, asset issue mapping, media kind/role mapping, preview URL lifecycle, and focus fallback.

**Risk and rollback:** Media preview must fail closed. Remove preview rendering rather than serving unverified or remote content.

---

### Task 12: Author route nodes and segments in Studio

**Files:**
- Modify: `apps/studio/src/features/plan-editor/interaction-controller.ts`
- Modify: `apps/studio/src/features/plan-editor/interaction-controller.test.ts`
- Modify: `apps/studio/src/features/plan-editor/editor-session.ts`
- Modify: `apps/studio/src/features/plan-editor/editor-session.test.ts`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.test.tsx`
- Create: `apps/studio/src/features/plan-editor/route-inspector.tsx`
- Create: `apps/studio/src/features/plan-editor/route-inspector.test.tsx`

**Interfaces:** First route action creates or selects a `RouteNetwork`; `route-node` creates a junction; `route-edge` collects two points and calls `insertRouteSegment`; one successful network replacement is one `routeNetworks` patch.

- [ ] **Step 1: Write failing route authoring tests**

Cover network creation, active network selection, node kind editing, two-click segment draft, snap/cross/split, collinear and complexity errors, locked floor rejection, Escape, stale snapshot reread, exact one-record patch, undo/redo, and selection.

- [ ] **Step 2: With approval, run RED**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/interaction-controller.test.ts apps/studio/src/features/plan-editor/editor-session.test.ts apps/studio/src/features/plan-editor/route-inspector.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx
```

Expected: route tools have no live transaction.

- [ ] **Step 3: Implement route authoring against route-engine**

Supply UUIDs through `RouteIdSource` only after final snapshot validation. Publish the returned whole network as `before/after`; on error retain the durable network exact and show the typed diagnostic.

- [ ] **Step 4: With approval, run GREEN and Studio typecheck**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/interaction-controller.test.ts apps/studio/src/features/plan-editor/editor-session.test.ts apps/studio/src/features/plan-editor/route-inspector.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
```

Expected: route creation/editing paths and typecheck pass.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/apps/studio/src/features/plan-editor/interaction-controller.ts aethertwin/apps/studio/src/features/plan-editor/interaction-controller.test.ts aethertwin/apps/studio/src/features/plan-editor/editor-session.ts aethertwin/apps/studio/src/features/plan-editor/editor-session.test.ts aethertwin/apps/studio/src/features/plan-editor/plan-editor.tsx aethertwin/apps/studio/src/features/plan-editor/plan-editor.test.tsx aethertwin/apps/studio/src/features/plan-editor/route-inspector.tsx aethertwin/apps/studio/src/features/plan-editor/route-inspector.test.tsx
git commit -m "feat: author showroom route networks"
```

**Acceptance:** authored crossings are connected, every route failure is non-mutating, and one network replacement is reversible/durable.

**Failure inspection:** route-engine error mapping, controller draft lifetime, active network/floor guards, and ID source call order.

**Risk and rollback:** Do not reproduce intersection logic in Studio. Revert Studio integration if it diverges from route-engine output.

---

### Task 13: Author, validate, and preview guided-route stops

**Files:**
- Create: `apps/studio/src/features/plan-editor/route-panel.tsx`
- Create: `apps/studio/src/features/plan-editor/route-panel.test.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.test.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-canvas.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-canvas.test.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-accessibility.tsx`
- Modify: `apps/studio/src/features/plan-editor/floor-tree.tsx`
- Modify: `apps/studio/src/app.css`

**Interfaces:** Stop edits remain transient until at least two adjacent-distinct node IDs are confirmed. Confirmation creates or patches one `GuidedRoute`. Preview always derives from the current snapshot through `resolveGuidedRoute`.

- [ ] **Step 1: Write failing panel/accessibility tests**

Cover add/remove/reorder stops, entrance/showroom-stop labels, fewer-than-two disabled confirmation, adjacent duplicate rejection, save exact stop order, route preview, `NO_ROUTE` failing pair, unchanged selection/route on failure, resolved overlay, keyboard controls, tree/canvas shared selection, and focus restoration.

- [ ] **Step 2: With approval, run RED**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/route-panel.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx apps/studio/src/features/plan-editor/plan-canvas.test.tsx
```

Expected: no guided-route authoring or preview panel exists.

- [ ] **Step 3: Implement transient stop draft and derived preview**

Do not persist a one-stop route. Before confirmation, construct the candidate `GuidedRoute` and call `resolveGuidedRoute`; on `NO_ROUTE`, preserve the saved route and selection exactly and show the failing pair. Use the saved route's ordered stop IDs as the next edit baseline. Resolve on every relevant snapshot/network/route change; never store `ResolvedRoute` in the project.

- [ ] **Step 4: With approval, run GREEN and Studio typecheck**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/route-panel.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx apps/studio/src/features/plan-editor/plan-canvas.test.tsx
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
```

Expected: stop editing, failure behavior, overlay, accessibility, and typecheck pass.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/apps/studio/src/features/plan-editor/route-panel.tsx aethertwin/apps/studio/src/features/plan-editor/route-panel.test.tsx aethertwin/apps/studio/src/features/plan-editor/plan-editor.tsx aethertwin/apps/studio/src/features/plan-editor/plan-editor.test.tsx aethertwin/apps/studio/src/features/plan-editor/plan-canvas.tsx aethertwin/apps/studio/src/features/plan-editor/plan-canvas.test.tsx aethertwin/apps/studio/src/features/plan-editor/plan-accessibility.tsx aethertwin/apps/studio/src/features/plan-editor/floor-tree.tsx aethertwin/apps/studio/src/app.css
git commit -m "feat: curate showroom guided routes"
```

**Acceptance:** one persisted stop list resolves deterministically and every disconnected preview failure is visible and non-mutating.

**Failure inspection:** stop-draft reset, current-network selection, route-engine error identity, and renderer input memoization.

**Risk and rollback:** Never save cached node/edge paths. Revert the panel if it cannot derive preview solely from current durable data.

---

### Task 14: Close the complete M2.3 vertical workflow

**Files:**
- Modify: `apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx`
- Modify: `packages/project-store/src/project-store.test.ts`
- Modify: `crates/project-io/tests/schema_v3_recovery.rs`
- Modify: `crates/desktop-host/tests/command_contract.rs`
- Modify: `tests/offline-source-policy.test.mjs`
- Modify: `tests/visible-actions.test.mjs`
- Modify: `tests/workspace-structure.test.mjs`

**Acceptance fixture:** One schema-v3 showroom with ten product hotspots, each linked to one content record and at least one local image/video `MediaAsset`; one network with entrance, junction, and showroom-stop nodes; one connected guided route with at least two stops. Include at least one real sandbox image import and one real sandbox video import so metadata is not synthesized only in the UI test.

- [ ] **Step 1: Add failing milestone acceptance tests**

Exercise create/import/edit/reorder/repair, route insertion/resolution, undo/redo, save/close/reopen, dirty recovery, selection/accessibility, offline policy, exact visible controls, schema v3, and exact eight commands.

- [ ] **Step 2: With approval, run focused RED**

```powershell
pnpm.cmd vitest run packages/project-store/src/project-store.test.ts apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx
node --test tests/offline-source-policy.test.mjs tests/visible-actions.test.mjs tests/workspace-structure.test.mjs
cargo test -p project-io --test schema_v3_recovery
cargo test -p desktop-host --test command_contract
```

Expected: any missing vertical link fails with an exact assertion; established M2.1/M2.2 behavior remains green.

- [ ] **Step 3: Fix only integration gaps exposed by acceptance**

Do not add M2.4/M2.5 controls, new invokes, remote media, cached route paths, or synthetic success states.

- [ ] **Step 4: With approval, rerun focused GREEN**

Run the same five command groups from Step 2.

Expected: ten hotspots, local media, connected guided route, reopen, recovery, policy, and native boundary all pass.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx aethertwin/packages/project-store/src/project-store.test.ts aethertwin/crates/project-io/tests/schema_v3_recovery.rs aethertwin/crates/desktop-host/tests/command_contract.rs aethertwin/tests/offline-source-policy.test.mjs aethertwin/tests/visible-actions.test.mjs aethertwin/tests/workspace-structure.test.mjs
git commit -m "test: close AetherTwin M2.3 content workflow"
```

**Acceptance:** the complete M2.3 fixture is durable and recoverable, with no unsupported runtime or future-feature claim.

**Failure inspection:** atomic content import, candidate final-state validation, nested network serde, active-floor projection, and stop resolution.

**Risk and rollback:** A broad acceptance failure must be traced to the owning task; do not weaken milestone assertions to obtain green.

---

### Task 15: Document and verify the M2.3 boundary

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/PROJECT_FORMAT.md`
- Modify: `docs/PRODUCT_SPEC.md`
- Modify: `docs/ROADMAP.md`
- Modify: `.superpowers/sdd/progress.md` locally; keep it ignored unless repository policy changes.

- [ ] **Step 1: Update durable and transient ownership documentation**

Document content target/cardinality, media kind/path rules, route topology/distance/arc rules, guided-stop-only persistence, route-engine ownership, and exact exclusions.

- [ ] **Step 2: Review the whole M2.3 branch diff**

```powershell
git diff --check
git diff --stat 8518f462..HEAD
git status --short
```

Confirm schema v3, eight native invokes, no remote runtime URLs, no absolute durable paths, no cached resolved route, and untouched protected Cargo manifests.

- [ ] **Step 3: With approval, run the complete non-build verification set**

```powershell
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd test
cargo fmt --all -- --check
cargo test -p project-io
cargo test -p desktop-host
cargo check -p project-io
cargo check -p desktop-host
```

Expected: every command exits 0. Record actual counts and any retry history; do not claim unrun runtime/browser/GPU evidence.

- [ ] **Step 4: Stage only documentation and closure fixes**

```powershell
git add -- aethertwin/docs/ARCHITECTURE.md aethertwin/docs/PROJECT_FORMAT.md aethertwin/docs/PRODUCT_SPEC.md aethertwin/docs/ROADMAP.md
git diff --cached --check
```

- [ ] **Step 5: Commit M2.3 closure**

```powershell
git commit -m "docs: close AetherTwin M2.3 content and routes"
```

**Acceptance:** documentation and real verification evidence agree exactly; M2.4 remains visibly and durably deferred.

**Failure inspection:** stale policy baselines, omitted runtime source roots, protected Cargo status, and claims not backed by executed commands.

**Risk and rollback:** Documentation drift can misstate readiness. Amend only the closure documentation commit; never rewrite implementation history to hide failed evidence.

---

## Plan Self-Review Checklist

- Every requirement in the approved M2.3 design maps to Tasks 1–15.
- TypeScript and Rust share one contract-vector source for durable validation.
- Route-engine is pure and depends only on core-model; ProjectStore does not depend on Studio, rendering, or mode-showroom.
- Content import uses one asset/media/content transaction and existing native commands.
- Hotspot creation uses one entity/content transaction; every hotspot always has one content record.
- Route insertion and `NO_ROUTE` failures publish nothing.
- Guided routes persist ordered stops only; resolved paths remain transient.
- 2D, tree, Inspector, Asset Library, route panel, and accessible mirror share IDs and selection.
- M2.4/M2.5, Player, Market, accessible routing, closure editing, and remote fallback remain absent.
- Every test/build-like command is an explicit execution-time approval gate, and prohibited runtime commands are not listed.
