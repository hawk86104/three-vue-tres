# AetherTwin Studio M1 Unified Authoring Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first real local-first 2D authoring editor with schema v2, deterministic v1 migration, a PixiJS-independent plan engine, durable CommandBus editing, PixiJS rendering, one-floor Studio workflows, and exact save/reopen behavior.

**Architecture:** `core-model` remains the versioned authority; pure `plan-engine` functions produce edit intents; `project-store` turns those intents into durable commands; `render-plan-2d` projects immutable snapshots into PixiJS v8 without owning business data; Studio owns transient tool, selection, draft, and viewport state. Native Rust preserves and transactionally checkpoints schema v2 JSON while validating identity, sequencing, and generic patch replay rather than duplicating geometry algorithms.

**Tech Stack:** Node.js 24, pnpm 11, React 19, TypeScript 6, Vite 8, Vitest 4, Testing Library, Zustand 5, PixiJS 8.19.0, Tauri 2, Rust 1.94, rusqlite, serde, UUID, and the existing Aether design system.

## Global Constraints

- Product profiles remain exactly `"showroom" | "market"`; profile is immutable after project creation.
- `CURRENT_SCHEMA_VERSION` becomes exactly `2`; v1 projects migrate deterministically and new writes are v2.
- Stored plan lengths use millimetres, angles use radians, world X points right, and world Y points up.
- Interactive M1 business entities are exactly `Boundary`, `Wall`, `Zone`, `SpaceUnit`, `Fixture`, and `PointOfInterest`; `DimensionAnnotation` is an auxiliary annotation.
- `Opening`, content, vendor, route, theme, camera, and story records receive contracts but no M1 editing UI.
- Only one active floor is rendered and edited; other floors are neither overlaid nor snap targets.
- All durable mutations go through CommandBus. Pointer previews, active tools, selection, drafts, snapping switches, and viewports remain transient.
- `plan-engine` must not import React, PixiJS, DOM, Tauri, Zustand, or persistence code.
- `render-plan-2d` may cache ID-to-display-object mappings but must not store authoritative model geometry in PixiJS objects.
- Runtime remains offline: no remote URL, CDN, font, map, telemetry, or business API.
- Install PixiJS as exact `pixi.js@8.19.0`; it is MIT licensed and must be added to `THIRD_PARTY_NOTICES.md`.
- No additional geometry or spatial-index dependency is introduced; M1 uses a deterministic in-house uniform-grid index behind a replaceable interface.
- Run commands from `E:\数字孪生\.worktrees\aethertwin-m1\aethertwin`; run Git commands from `E:\数字孪生\.worktrees\aethertwin-m1`.
- The approved verification set is focused Vitest, direct TypeScript type checking, Node policy tests, Rust tests, `cargo check`, and read-only Git checks.
- Do not run build, dev, debug, browser, Playwright, packaged-runtime, or screenshot commands unless the user explicitly authorizes them later.
- Each task stages only its listed files and ends with one focused commit after its tests and type checks pass.

---

## File and responsibility map

### Versioned domain model

- `packages/core-model/src/geometry.ts` — serializable points, sizes, bounds, transforms, and optional 3D parameters.
- `packages/core-model/src/spatial-entities.ts` — plan layers, floors, six interactive entity types, dimensions, and their unions.
- `packages/core-model/src/content-model.ts` — contract-only opening, vendor, content, media, route, theme, camera, and story records.
- `packages/core-model/src/model.ts` — profile, manifest, aggregate project, snapshot, asset, and creators.
- `packages/core-model/src/validation-primitives.ts` — typed validation issues and reusable scalar/record helpers.
- `packages/core-model/src/geometry-validation.ts` — finite geometry, polygon, transform, and reference-independent checks.
- `packages/core-model/src/validation.ts` — aggregate parsing, UUID/reference uniqueness, and deep freeze.
- `packages/core-model/src/migrations.ts` — v1 types, deterministic default-layer ID, v1-to-v2 migration, and current parser routing.
- `fixtures/contracts/snapshot.v1.json` and `snapshot.v2.json` — shared TypeScript/Rust schema fixtures.

### Pure plan engine

- `packages/plan-engine/src/result.ts` — `PlanResult<T>` and typed expected-operation issues.
- `packages/plan-engine/src/units.ts` — mm/cm/m parsing, conversion, and formatting.
- `packages/plan-engine/src/coordinates.ts` — viewport transform and world/screen conversion.
- `packages/plan-engine/src/transforms.ts` — affine application, inversion, composition, and normalized entity transforms.
- `packages/plan-engine/src/bounds.ts` — world vertices and AABBs for every M1 entity.
- `packages/plan-engine/src/spatial-index.ts` — uniform-grid index and viewport query interface.
- `packages/plan-engine/src/selection.ts` — hit testing and box selection.
- `packages/plan-engine/src/snapping.ts` — candidate generation, screen-space tolerance, priority, and guides.
- `packages/plan-engine/src/dimensions.ts` — dimension anchors, measurement, and display geometry.
- `packages/plan-engine/src/intents.ts` — generic entity changes and `PlanEditIntent`.
- `packages/plan-engine/src/operations.ts` — translate, rotate, resize, duplicate, arrays, align, and distribute.

### Durable editing and native replay

- `packages/project-store/src/plan-commands.ts` — generic entity patch command and layer patch command.
- `packages/project-store/src/project-store.ts` — public `applyPlanEdit` and `applyFloorPatch` orchestration.
- `crates/project-io/src/model.rs` — schema range, v2 layer envelope, and JSON-preserving collections.
- `crates/project-io/src/project.rs` — requested checkpoint upgrade, generic patch replay, and entity-record projection.
- `crates/desktop-host/src/dto.rs` — strict v2 snapshot DTO and allowed generic patch payload.
- `apps/studio/src/backend/tauri-backend.ts` — pre-exposure v1 migration checkpoint and migrated-response parsing.

### PixiJS rendering and Studio

- `packages/render-plan-2d/src/scene-projection.ts` — pure snapshot-to-render-node projection and culling.
- `packages/render-plan-2d/src/pixi-plan-renderer.ts` — PixiJS Application and five-layer incremental scene.
- `packages/render-plan-2d/src/types.ts` — renderer input, event sink, render node, and factory interfaces.
- `apps/studio/src/features/plan-editor/editor-session.ts` — Zustand vanilla transient session store.
- `apps/studio/src/features/plan-editor/interaction-controller.ts` — pointer gesture state machine and edit-intent commit boundary.
- `apps/studio/src/features/plan-editor/plan-editor.test-support.tsx` — fixed-ID two-floor fixtures, controller/store harness, renderer fake, and shared React renderer.
- `apps/studio/src/features/plan-editor/plan-editor.tsx` — EditorShell composition.
- `apps/studio/src/features/plan-editor/plan-toolbar.tsx` — profile-aware implemented tool groups.
- `apps/studio/src/features/plan-editor/floor-tree.tsx` — floor/layer/object tree and active-floor control.
- `apps/studio/src/features/plan-editor/plan-inspector.tsx` — project, layer, single-, and multi-object Inspector contexts.
- `apps/studio/src/features/plan-editor/plan-canvas.tsx` — renderer lifecycle, pointer adapter, status HUD, and DOM accessibility mirror.

---

### Task 1: Implement schema v2 types and strict validation

**Files:**
- Create: `packages/core-model/src/geometry.ts`
- Create: `packages/core-model/src/spatial-entities.ts`
- Create: `packages/core-model/src/content-model.ts`
- Create: `packages/core-model/src/validation-primitives.ts`
- Create: `packages/core-model/src/geometry-validation.ts`
- Create: `fixtures/contracts/snapshot.v2.json`
- Modify: `packages/core-model/src/model.ts`
- Modify: `packages/core-model/src/validation.ts`
- Modify: `packages/core-model/src/index.ts`
- Modify: `packages/core-model/src/core-model.test.ts`

**Interfaces:**
- Consumes: M0 `ProjectManifest`, `ProjectSnapshot`, `AssetRecord`, deep-freeze behavior, UUID helper injection.
- Produces: schema v2 `ProjectSnapshot`, `SpatialEntity`, `PlanLayer`, full contract-only records, `ModelValidationError`, `parseSnapshotV2`.

- [ ] **Step 1: Add failing schema-v2 creator and validator tests**

Add tests that assert the third injected UUID becomes the default layer, every new collection is present, all values are deeply frozen, duplicate UUIDs fail, invalid references fail, and malformed geometry returns a typed path.

```ts
it("creates a complete schema-v2 project with one editable default layer", () => {
  const ids = [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000003",
  ];
  const snapshot = createInitialSnapshot({
    name: "Demo",
    profile: "showroom",
    uuid: () => ids.shift()!,
  });

  expect(snapshot).toMatchObject({
    schemaVersion: 2,
    project: {
      floors: [{ layers: [{ id: "00000000-0000-4000-8000-000000000003", visible: true, locked: false }] }],
      entities: [], vendors: [], productContents: [], mediaAssets: [], routeNetworks: [],
      themes: [], cameraShots: [], storySequences: [],
    },
  });
  expect(Object.isFrozen(snapshot.project.floors[0]?.layers)).toBe(true);
});

it("reports self-intersecting entity geometry with a stable code and path", () => {
  const snapshot = createInitialSnapshot({ name: "Demo", profile: "market" });
  const floor = snapshot.project.floors[0]!;
  const layer = floor.layers[0]!;
  expect(() => parseSnapshotV2({
    ...snapshot,
    project: {
      ...snapshot.project,
      entities: [{
        type: "zone",
        id: "00000000-0000-4000-8000-000000000010",
        name: "Crossed",
        tags: [], floorId: floor.id, layerId: layer.id, locked: false,
        transform: identityTransform2D,
        polygon: [{ x: 0, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }, { x: 1000, y: 0 }],
        purpose: "test", color: "#5f8f96",
      }],
    },
  })).toThrow(/Invalid project\.entities\[0\]\.polygon:.*self-intersect/i);
});
```

- [ ] **Step 2: Run the focused test and confirm the v1 model fails it**

Run:

```powershell
pnpm.cmd vitest run packages/core-model/src/core-model.test.ts
```

Expected: FAIL because schema version is `1`, floors have no layers, and v2 exports do not exist.

- [ ] **Step 3: Define the exact geometry and record contracts**

Use these public shapes; do not store derived bounds or renderer state:

```ts
export interface Point2 { readonly x: number; readonly y: number }
export interface Size2 { readonly width: number; readonly height: number }
export interface Bounds2 { readonly min: Point2; readonly max: Point2 }
export interface Transform2D {
  readonly translation: Point2;
  readonly rotation: number;
  readonly scale: Point2;
}
export interface Spatial3D { readonly elevation: number; readonly height: number }
export const identityTransform2D: Transform2D = Object.freeze({
  translation: Object.freeze({ x: 0, y: 0 }), rotation: 0,
  scale: Object.freeze({ x: 1, y: 1 }),
});

export interface ProjectRecordBase { readonly id: string; readonly name: string; readonly tags: readonly string[] }
export interface PlanLayer extends ProjectRecordBase { readonly visible: boolean; readonly locked: boolean }
export interface Floor extends ProjectRecordBase { readonly layers: readonly PlanLayer[] }
export interface SpatialEntityBase extends ProjectRecordBase {
  readonly floorId: string; readonly layerId: string; readonly transform: Transform2D;
  readonly spatial3D?: Spatial3D; readonly locked: boolean;
}
export type SpaceUnitKind = "room" | "shop" | "booth" | "exhibition" | "service" | "restricted";
export type FixtureKind = "display-case" | "display-table" | "shelf" | "checkout" | "screen" | "partition" | "signage" | "generic";
export type PointOfInterestKind =
  | "entrance" | "exit" | "service-desk" | "restroom" | "accessible-restroom"
  | "stage" | "food" | "rest-area" | "medical" | "fire-safety" | "parking"
  | "charging" | "storage" | "nursery" | "water" | "atm" | "closed-area" | "custom";
export interface Boundary extends SpatialEntityBase { readonly type: "boundary"; readonly polygon: readonly Point2[] }
export interface Wall extends SpatialEntityBase { readonly type: "wall"; readonly centerLine: readonly Point2[]; readonly thickness: number }
export interface Zone extends SpatialEntityBase { readonly type: "zone"; readonly polygon: readonly Point2[]; readonly purpose: string; readonly color: string }
export interface SpaceUnit extends SpatialEntityBase { readonly type: "space-unit"; readonly kind: SpaceUnitKind; readonly footprint: readonly Point2[] }
export interface Fixture extends SpatialEntityBase { readonly type: "fixture"; readonly kind: FixtureKind; readonly size: Size2 }
export interface PointOfInterest extends SpatialEntityBase { readonly type: "poi"; readonly kind: PointOfInterestKind; readonly radius?: number }
export type DimensionAnchor =
  | { readonly kind: "point"; readonly point: Point2 }
  | { readonly kind: "entity"; readonly entityId: string; readonly locator: "origin" | { readonly vertex: number } | { readonly segment: number; readonly t: number } };
export interface DimensionAnnotation extends SpatialEntityBase {
  readonly type: "dimension"; readonly start: DimensionAnchor; readonly end: DimensionAnchor;
  readonly offset: number; readonly displayUnit?: "m" | "cm" | "mm";
}
export type SpatialEntity = Boundary | Wall | Zone | SpaceUnit | Fixture | PointOfInterest | DimensionAnnotation;

export interface Opening extends ProjectRecordBase {
  readonly wallId: string; readonly kind: "door" | "window"; readonly distanceAlongWall: number;
  readonly width: number; readonly height: number; readonly sillHeight: number;
}
export interface Vendor extends ProjectRecordBase {
  readonly spaceUnitId: string | null; readonly externalId: string; readonly category: string;
  readonly status: "unassigned" | "active" | "inactive";
}
export interface ProductContent extends ProjectRecordBase {
  readonly targetEntityId: string; readonly description: string; readonly mediaAssetIds: readonly string[];
}
export interface MediaAsset extends ProjectRecordBase {
  readonly assetId: string; readonly kind: "image" | "video" | "audio" | "model" | "document";
}
export interface RouteNode extends ProjectRecordBase { readonly position: Point2; readonly floorId: string; readonly kind: string }
export interface RouteEdge extends ProjectRecordBase {
  readonly from: string; readonly to: string; readonly distance: number; readonly bidirectional: boolean;
  readonly accessible: boolean; readonly enabled: boolean; readonly width: number; readonly weight: number;
}
export interface RouteNetwork extends ProjectRecordBase { readonly nodes: readonly RouteNode[]; readonly edges: readonly RouteEdge[] }
export interface ThemeConfig extends ProjectRecordBase { readonly profile: ProjectProfile; readonly values: Readonly<Record<string, string | number | boolean>> }
export interface CameraShot extends ProjectRecordBase { readonly position: readonly [number, number, number]; readonly target: readonly [number, number, number]; readonly fieldOfView: number }
export interface StorySequence extends ProjectRecordBase { readonly cameraShotIds: readonly string[]; readonly duration: number }
```

Contract-only records use the explicit references above. Theme values are JSON-safe primitives and story sequences contain ordered IDs, never executable code.

- [ ] **Step 4: Implement typed validation and aggregate reference checks**

Introduce the stable error surface and keep all parser outputs deeply frozen:

```ts
export type ModelIssueCode =
  | "INVALID_TYPE" | "INVALID_VALUE" | "INVALID_UUID" | "DUPLICATE_UUID"
  | "INVALID_REFERENCE" | "INVALID_RELATIVE_PATH" | "DEGENERATE_GEOMETRY"
  | "SELF_INTERSECTING_POLYGON" | "UNSUPPORTED_SCHEMA_VERSION";

export class ModelValidationError extends Error {
  constructor(
    readonly code: ModelIssueCode,
    readonly path: string,
    detail: string,
  ) {
    super(`Invalid ${path}: ${detail}`);
    this.name = "ModelValidationError";
    Object.freeze(this);
  }
}
```

`parseSnapshotV2` must parse every collection, gather all IDs before resolving references, reject duplicate IDs across collections, verify entity floor/layer ownership, enforce simple non-zero polygons and positive dimensions, and call `deepFreeze` once on the complete result.

- [ ] **Step 5: Update creators, exports, and the shared v2 fixture**

Set `CURRENT_SCHEMA_VERSION = 2 as const`. `createInitialSnapshot` consumes project, floor, and layer UUIDs in that order and initializes every v2 collection to `[]`. `snapshot.v2.json` uses fixed UUIDs and one valid fixture entity so both languages can assert lossless round trips.

- [ ] **Step 6: Run focused tests and type checking**

Run:

```powershell
pnpm.cmd vitest run packages/core-model/src/core-model.test.ts
pnpm.cmd exec tsc -p packages/core-model/tsconfig.json --noEmit
```

Expected: all core-model tests pass; TypeScript exits `0`.

- [ ] **Step 7: Commit Task 1**

```powershell
git add -- aethertwin/packages/core-model aethertwin/fixtures/contracts/snapshot.v2.json
git commit -m "feat: define AetherTwin schema v2 model"
```

---

### Task 2: Add deterministic v1 migration and native schema-v2 checkpointing

**Files:**
- Create: `fixtures/contracts/snapshot.v1.json`
- Modify: `packages/core-model/src/migrations.ts`
- Modify: `packages/core-model/src/core-model.test.ts`
- Modify: `apps/studio/src/backend/tauri-backend.ts`
- Modify: `apps/studio/src/backend/tauri-backend.test.ts`
- Modify: `crates/project-io/src/model.rs`
- Modify: `crates/project-io/src/project.rs`
- Modify: `crates/project-io/src/schema.rs`
- Modify: `crates/project-io/tests/contract_fixture.rs`
- Modify: `crates/project-io/tests/create_open.rs`
- Modify: `crates/project-io/tests/commit_recovery.rs`
- Modify: `crates/desktop-host/src/dto.rs`
- Modify: `crates/desktop-host/src/state.rs`
- Modify: `crates/desktop-host/src/commands.rs`
- Modify: `crates/desktop-host/tests/command_contract.rs`

**Interfaces:**
- Consumes: `parseSnapshotV2`, schema v2 collections, existing six-command native surface.
- Produces: `defaultLayerIdForFloor(floorId)`, `migrateSnapshot`, pre-editor atomic upgrade through `checkpoint_project({ sessionId, snapshot })`.

- [ ] **Step 1: Write failing cross-language migration tests**

TypeScript must preserve identity and sequence while adding deterministic layers:

```ts
it("migrates a v1 snapshot without inventing authoring content", () => {
  const v1 = JSON.parse(readFileSync("fixtures/contracts/snapshot.v1.json", "utf8"));
  const migrated = migrateSnapshot(v1);
  expect(migrated.schemaVersion).toBe(2);
  expect(migrated.sequence).toBe(v1.sequence);
  expect(migrated.checkpointSequence).toBe(v1.checkpointSequence);
  expect(migrated.project.id).toBe(v1.project.id);
  expect(migrated.project.floors[0].layers).toEqual([{
    id: defaultLayerIdForFloor(v1.project.floors[0].id),
    name: "默认图层", tags: [], visible: true, locked: false,
  }]);
  expect(migrated.project.entities).toEqual([]);
});
```

Rust fixture tests deserialize the v1 and v2 files, preserve every v2 JSON collection, accept opening v1, and reject schema `3`. Desktop-host tests assert `checkpoint_project` requires both `sessionId` and `snapshot` and rejects any unrelated replacement snapshot. Recovery tests inject failures before manifest publication and at database commit, then assert the original v1 manifest/database pair remains coherent and the in-memory session still exposes v1.

- [ ] **Step 2: Run the focused tests and observe unsupported-v1 failures**

```powershell
pnpm.cmd vitest run packages/core-model/src/core-model.test.ts apps/studio/src/backend/tauri-backend.test.ts
cargo test -p project-io --test contract_fixture
cargo test -p desktop-host --test command_contract
```

Expected: migration registry and checkpoint payload tests fail before implementation.

- [ ] **Step 3: Implement deterministic TypeScript migration**

`defaultLayerIdForFloor` canonicalizes the floor UUID bytes, XORs the final byte with `0xa7`, sets UUID version bits to `5`, sets the RFC4122 variant, and formats lowercase hyphenated text. The same algorithm is mirrored in Rust only to validate the persistence-boundary upgrade.

```ts
export const snapshotMigrationRegistry = new Map<number, SnapshotMigration>([
  [1, (source) => ({
    ...source,
    schemaVersion: 2,
    project: {
      ...asV1Project(source.project),
      floors: asV1Project(source.project).floors.map((floor) => ({
        ...floor,
        layers: [{ id: defaultLayerIdForFloor(floor.id), name: "默认图层", tags: [], visible: true, locked: false }],
      })),
      entities: [], vendors: [], productContents: [], mediaAssets: [], routeNetworks: [],
      themes: [], cameraShots: [], storySequences: [],
    },
  })],
]);
```

`parseManifest` accepts stored versions `1` and `2`, returns a current v2 manifest without changing timestamps, and still rejects `> 2`.

- [ ] **Step 4: Make native snapshots preserve v2 collections without geometry logic**

Set Rust `CURRENT_SCHEMA_VERSION` to `2` and `MIN_SUPPORTED_SCHEMA_VERSION` to `1`. Add typed `PlanLayer` to `Floor`; add `entities` and contract collections as `Vec<serde_json::Value>` on `SpatialProject`. Rust validates project/floor/layer identity, safe integers, relative assets, schema range, and collection JSON size/shape, but does not validate polygon or snapping math.

`initial_snapshot` creates one v2 floor with one random v4 default layer and empty collections. `write_entity_records` additionally projects each `project.entities` entry using its `id`, `type`, and `floorId`, rejecting missing or duplicate IDs.

- [ ] **Step 5: Extend checkpoint to accept the requested snapshot**

Keep the command name and count unchanged. Change the DTO and session interface:

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CheckpointProjectDto {
    session_id: String,
    snapshot: ProjectSnapshotDto,
}

pub fn checkpoint(&mut self, requested: ProjectSnapshot) -> Result<CheckpointResult, ProjectIoError> {
    validate_checkpoint_request(&self.snapshot, &requested)?;
    self.checkpoint_inner(requested)
}
```

`validate_checkpoint_request` accepts exact current state for ordinary saves. It accepts v1-to-v2 only when project/floor/asset identity, names, tags, profile, sequence, and checkpoint sequence are unchanged; each floor has exactly the deterministic default layer; and all new collections are empty. For a schema upgrade, keep database writes in an uncommitted transaction, write and fsync a temporary v2 manifest, atomically replace the manifest, and only then commit the database transaction. If manifest publication fails, roll back the database transaction. If database commit fails after manifest publication, restore the exact saved v1 manifest bytes; if restoration itself fails, return a recovery-required error rather than exposing either snapshot. Update the in-memory session only after both durable publications succeed.

- [ ] **Step 6: Upgrade in Tauri before exposing the editor**

`TauriProjectBackend.acceptOpenedProject` parses raw stored versions. When the raw snapshot is v1, migrate it, invoke `checkpoint_project` with `{ sessionId, snapshot: migrated }`, validate the returned v2 pair, and only then publish the session mapping. Failure closes the session or records pending cleanup.

For all normal saves, change:

```ts
await invokeNative("checkpoint_project", { sessionId, snapshot });
```

ProjectStore continues to receive only a coherent current-schema `OpenedProject`.

- [ ] **Step 7: Run migration, native, and type verification**

```powershell
pnpm.cmd vitest run packages/core-model/src/core-model.test.ts packages/project-store/src/project-store.test.ts apps/studio/src/backend/tauri-backend.test.ts
pnpm.cmd exec tsc -p packages/core-model/tsconfig.json --noEmit
pnpm.cmd exec tsc -p packages/project-store/tsconfig.json --noEmit
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
cargo test -p project-io --test contract_fixture
cargo test -p project-io --test create_open
cargo test -p project-io --test commit_recovery
cargo test -p desktop-host --test command_contract
cargo check -p project-io -p desktop-host
```

Expected: all listed tests pass; all three type checks and Cargo check exit `0`.

- [ ] **Step 8: Commit Task 2**

```powershell
git add -- aethertwin/fixtures/contracts aethertwin/packages/core-model aethertwin/apps/studio/src/backend aethertwin/crates/project-io aethertwin/crates/desktop-host
git commit -m "feat: migrate AetherTwin projects to schema v2"
```

---

### Task 3: Create the pure units, coordinates, and transform kernel

**Files:**
- Delete: `packages/plan-engine/.gitkeep`
- Create: `packages/plan-engine/package.json`
- Create: `packages/plan-engine/tsconfig.json`
- Create: `packages/plan-engine/src/result.ts`
- Create: `packages/plan-engine/src/units.ts`
- Create: `packages/plan-engine/src/coordinates.ts`
- Create: `packages/plan-engine/src/transforms.ts`
- Create: `packages/plan-engine/src/index.ts`
- Create: `packages/plan-engine/src/units.test.ts`
- Create: `packages/plan-engine/src/coordinates.test.ts`
- Create: `packages/plan-engine/src/transforms.test.ts`

**Interfaces:**
- Consumes: core-model `Point2`, `Transform2D`, `SpatialEntity`.
- Produces: `PlanResult<T>`, `parseLength`, `formatLength`, `worldToScreen`, `screenToWorld`, `applyTransform`, `invertTransform`, `composeTransform`, `normalizeTransform`.

- [ ] **Step 1: Scaffold the package and write failing unit/coordinate tests**

`package.json` is private ESM, exports `src/index.ts`, depends only on `@aethertwin/core-model`, and pins no external geometry library.

```ts
it.each([["1m", 1000], ["25cm", 250], ["12.5mm", 12.5]])("parses %s", (text, mm) => {
  expect(parseLength(text, "mm")).toEqual({ ok: true, value: mm });
});

it("round-trips y-up world coordinates through a y-down screen", () => {
  const viewport = { width: 800, height: 600, center: { x: 1000, y: 2000 }, pixelsPerMillimetre: 0.5 };
  const world = { x: 1200, y: 2300 };
  expect(screenToWorld(worldToScreen(world, viewport), viewport)).toEqual(world);
  expect(worldToScreen(world, viewport)).toEqual({ x: 500, y: 150 });
});
```

- [ ] **Step 2: Run tests and confirm missing-module failures**

```powershell
pnpm.cmd vitest run packages/plan-engine/src/units.test.ts packages/plan-engine/src/coordinates.test.ts packages/plan-engine/src/transforms.test.ts
```

Expected: FAIL because `@aethertwin/plan-engine` files do not exist.

- [ ] **Step 3: Implement explicit expected-operation results and unit parsing**

```ts
export interface PlanIssue { readonly code: string; readonly message: string; readonly entityId?: string }
export type PlanResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issue: PlanIssue };
export type DisplayUnit = "m" | "cm" | "mm";
export function parseLength(text: string, defaultUnit: DisplayUnit): PlanResult<number>;
export function formatLength(millimetres: number, unit: DisplayUnit, maximumFractionDigits?: number): string;
```

Reject empty text, unsupported suffixes, NaN, Infinity, and negative values where a positive length is requested. Parsing uses a full-string regular expression and never `parseFloat` on partial input.

- [ ] **Step 4: Implement viewport and affine functions**

Use a viewport centered in world space with `pixelsPerMillimetre > 0`. Apply transform order as scale, rotation, then translation. `normalizeTransform` reduces rotation to `[-π, π)`, rejects non-positive scale, and snaps values within `1e-9` of zero to zero.

```ts
export interface ViewportTransform {
  readonly width: number; readonly height: number;
  readonly center: Point2; readonly pixelsPerMillimetre: number;
}
export function worldToScreen(point: Point2, viewport: ViewportTransform): Point2;
export function screenToWorld(point: Point2, viewport: ViewportTransform): Point2;
export function applyTransform(point: Point2, transform: Transform2D): Point2;
export function invertTransform(point: Point2, transform: Transform2D): PlanResult<Point2>;
```

- [ ] **Step 5: Run package tests and type checking**

```powershell
pnpm.cmd vitest run packages/plan-engine/src/units.test.ts packages/plan-engine/src/coordinates.test.ts packages/plan-engine/src/transforms.test.ts
pnpm.cmd exec tsc -p packages/plan-engine/tsconfig.json --noEmit
```

Expected: all tests pass; TypeScript exits `0`.

- [ ] **Step 6: Commit Task 3**

```powershell
git add -- aethertwin/packages/plan-engine
git commit -m "feat: add pure plan coordinate kernel"
```

---

### Task 4: Add bounds, hit testing, box selection, and spatial indexing

**Files:**
- Create: `packages/plan-engine/src/bounds.ts`
- Create: `packages/plan-engine/src/spatial-index.ts`
- Create: `packages/plan-engine/src/selection.ts`
- Create: `packages/plan-engine/src/bounds.test.ts`
- Create: `packages/plan-engine/src/spatial-index.test.ts`
- Create: `packages/plan-engine/src/selection.test.ts`
- Modify: `packages/plan-engine/src/index.ts`

**Interfaces:**
- Consumes: Task 3 transforms and schema-v2 `SpatialEntity`.
- Produces: `entityWorldBounds`, `entityWorldVertices`, `SpatialIndex`, `UniformGridSpatialIndex`, `hitTest`, `boxSelect`.

- [ ] **Step 1: Write failing transformed-bounds and deterministic-index tests**

```ts
const floorId = "00000000-0000-4000-8000-000000000001";
const layerId = "00000000-0000-4000-8000-000000000002";
const fixedId = (index: number) => `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
const makeFixture = (id: string, x: number, y: number, width = 100, height = 100): Fixture => ({
  type: "fixture", id, name: `Fixture ${id}`, tags: [], floorId, layerId, locked: false,
  transform: { translation: { x, y }, rotation: 0, scale: { x: 1, y: 1 } },
  kind: "generic", size: { width, height },
});

it("returns the topmost visible unlocked hit using world tolerance", () => {
  const bottomFixture = makeFixture(fixedId(10), 450, 450);
  const topFixture = makeFixture(fixedId(11), 450, 450);
  const result = hitTest({
    point: { x: 500, y: 500 }, tolerance: 5,
    entities: [bottomFixture, topFixture],
    index: UniformGridSpatialIndex.from([bottomFixture, topFixture]),
  });
  expect(result).toEqual({ ok: true, value: topFixture.id });
});

it("queries 2,000 rectangles without returning off-viewport ids", () => {
  const entities = Array.from({ length: 2_000 }, (_, index) => {
    const row = Math.floor(index / 50);
    const column = index % 50;
    return makeFixture(fixedId(index + 100), column * 120, row * 120);
  });
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const viewport = { min: { x: 0, y: 0 }, max: { x: 1000, y: 1000 } };
  const index = UniformGridSpatialIndex.from(entities, 1000);
  const ids = index.query(viewport);
  expect(ids.every((id) => {
    const bounds = entityWorldBounds(byId.get(id)!);
    return bounds.max.x >= viewport.min.x && bounds.min.x <= viewport.max.x
      && bounds.max.y >= viewport.min.y && bounds.min.y <= viewport.max.y;
  })).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);
});
```

- [ ] **Step 2: Run tests and confirm missing APIs**

```powershell
pnpm.cmd vitest run packages/plan-engine/src/bounds.test.ts packages/plan-engine/src/spatial-index.test.ts packages/plan-engine/src/selection.test.ts
```

Expected: FAIL because bounds, index, and selection exports do not exist.

- [ ] **Step 3: Implement world geometry and the replaceable index interface**

```ts
export interface SpatialIndex {
  rebuild(entities: readonly SpatialEntity[]): void;
  query(bounds: Bounds2): readonly string[];
}

export class UniformGridSpatialIndex implements SpatialIndex {
  constructor(readonly cellSizeMillimetres = 1000) {}
  static from(entities: readonly SpatialEntity[], cellSizeMillimetres?: number): UniformGridSpatialIndex;
  rebuild(entities: readonly SpatialEntity[]): void;
  query(bounds: Bounds2): readonly string[];
}
```

Cell keys are integer `x:y`; an ID is inserted into every overlapped cell and query results are de-duplicated and returned in stable entity order. Dimensions participate in viewport culling but not business-object hit order.

- [ ] **Step 4: Implement entity-specific hit and selection rules**

Walls use distance-to-segment plus half thickness; POIs use anchor radius; polygons use point-in-polygon plus edge tolerance; rectangles use inverse-transform local bounds. `boxSelect` accepts `mode: "intersect" | "contain"` and excludes hidden-layer entities supplied through the `selectableIds` set.

- [ ] **Step 5: Run tests and type checking**

```powershell
pnpm.cmd vitest run packages/plan-engine/src/bounds.test.ts packages/plan-engine/src/spatial-index.test.ts packages/plan-engine/src/selection.test.ts
pnpm.cmd exec tsc -p packages/plan-engine/tsconfig.json --noEmit
```

Expected: all tests pass; TypeScript exits `0`.

- [ ] **Step 6: Commit Task 4**

```powershell
git add -- aethertwin/packages/plan-engine/src
git commit -m "feat: add plan selection spatial index"
```

---

### Task 5: Implement snapping, guides, and persistent dimensions

**Files:**
- Create: `packages/plan-engine/src/snapping.ts`
- Create: `packages/plan-engine/src/dimensions.ts`
- Create: `packages/plan-engine/src/snapping.test.ts`
- Create: `packages/plan-engine/src/dimensions.test.ts`
- Modify: `packages/plan-engine/src/index.ts`

**Interfaces:**
- Consumes: Task 4 world vertices/index, Task 3 viewport conversion, core-model dimension records.
- Produces: `SnapMode`, `PointSnapCandidate`, `findSnap`, `findAngleSnap`, `alignmentGuides`, `resolveDimensionAnchors`, `dimensionGeometry`.

- [ ] **Step 1: Write failing priority, zoom, and dimension-anchor tests**

```ts
const floorId = "00000000-0000-4000-8000-000000000001";
const layerId = "00000000-0000-4000-8000-000000000002";
const wall: Wall = {
  type: "wall", id: "00000000-0000-4000-8000-000000000010", name: "Wall", tags: [],
  floorId, layerId, locked: false,
  transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
  centerLine: [{ x: 0, y: 0 }, { x: 1000, y: 0 }], thickness: 100,
};
const attachedDimension: DimensionAnnotation = {
  type: "dimension", id: "00000000-0000-4000-8000-000000000011", name: "Width", tags: [],
  floorId, layerId, locked: false, transform: wall.transform,
  start: { kind: "entity", entityId: wall.id, locator: "origin" },
  end: { kind: "entity", entityId: wall.id, locator: { vertex: 1 } },
  offset: 200,
};

it("prefers endpoint over a closer grid point inside the screen-space threshold", () => {
  const result = findSnap({
    worldPoint: { x: 998, y: 1001 }, pixelsPerMillimetre: 2, tolerancePixels: 8,
    modes: new Set(["endpoint", "grid"]), gridSize: 100,
    candidates: [{ mode: "endpoint", point: { x: 1000, y: 1000 }, entityId: wall.id }],
  });
  expect(result.ok && result.value.candidate?.mode).toBe("endpoint");
});

it("keeps an entity-backed dimension attached after the entity moves", () => {
  const movedWall = { ...wall, transform: { ...wall.transform, translation: { x: 500, y: 0 } } };
  const anchors = resolveDimensionAnchors(attachedDimension, new Map([[wall.id, movedWall]]));
  expect(anchors).toEqual({ ok: true, value: { start: { x: 500, y: 0 }, end: { x: 1500, y: 0 } } });
});

it("snaps rotation to the configured radian increment", () => {
  expect(findAngleSnap(0.51, Math.PI / 12, 0.02)).toEqual({ ok: true, value: Math.PI / 6 });
});
```

Add a table-driven point test covering `endpoint`, `midpoint`, `edge`, `alignment`, and `grid` at `pixelsPerMillimetre` values `0.25`, `1`, and `4`; the same eight-pixel screen tolerance must choose the same world candidate at every zoom. Add an active-floor candidate test proving hidden and other-floor IDs are absent before `findSnap` is called while a locked visible entity remains a valid snap target.

- [ ] **Step 2: Run tests and confirm missing snapping APIs**

```powershell
pnpm.cmd vitest run packages/plan-engine/src/snapping.test.ts packages/plan-engine/src/dimensions.test.ts
```

Expected: FAIL because snapping and dimension functions do not exist.

- [ ] **Step 3: Implement the fixed priority and screen-space comparison**

```ts
export type SnapMode = "endpoint" | "midpoint" | "edge" | "alignment" | "grid" | "angle";
export interface PointSnapCandidate {
  readonly mode: Exclude<SnapMode, "angle">; readonly point: Point2; readonly entityId?: string;
  readonly guide?: { readonly start: Point2; readonly end: Point2 };
}
export interface SnapResult { readonly candidate: PointSnapCandidate | null; readonly delta: Point2 }
export interface FindSnapInput {
  readonly worldPoint: Point2; readonly pixelsPerMillimetre: number; readonly tolerancePixels: number;
  readonly modes: ReadonlySet<Exclude<SnapMode, "angle">>; readonly gridSize: number;
  readonly candidates: readonly PointSnapCandidate[];
}
export function findSnap(input: FindSnapInput): PlanResult<SnapResult>;
export function findAngleSnap(angleRadians: number, incrementRadians: number, toleranceRadians: number): PlanResult<number>;
```

Use point priority `endpoint`, `midpoint`, `edge`, `alignment`, `grid`; choose smallest pixel distance within one priority. `findAngleSnap` is the only angle path and normalizes its result to `[-π, π)`. The caller excludes hidden and other-floor IDs; locked visible entities remain snap targets even though transform/delete operations reject them.

- [ ] **Step 4: Implement persistent free and attached dimension anchors**

`DimensionAnchor` is either `{ kind: "point", point }` or `{ kind: "entity", entityId, locator }`; locators are `origin`, vertex index, segment midpoint, or edge parameter `t` in `[0,1]`. Missing references return `INVALID_DIMENSION_ANCHOR`, never a guessed point.

`dimensionGeometry` returns extension lines, dimension line, label midpoint, and measured millimetres. Formatting delegates to Task 3 units.

- [ ] **Step 5: Run focused tests and type checking**

```powershell
pnpm.cmd vitest run packages/plan-engine/src/snapping.test.ts packages/plan-engine/src/dimensions.test.ts
pnpm.cmd exec tsc -p packages/plan-engine/tsconfig.json --noEmit
```

Expected: all tests pass; TypeScript exits `0`.

- [ ] **Step 6: Commit Task 5**

```powershell
git add -- aethertwin/packages/plan-engine/src
git commit -m "feat: add plan snapping and dimensions"
```

---

### Task 6: Add durable entity patch commands and Rust journal replay

**Files:**
- Create: `packages/plan-engine/src/intents.ts`
- Create: `packages/project-store/src/plan-commands.ts`
- Create: `packages/project-store/src/plan-commands.test.ts`
- Modify: `packages/plan-engine/src/index.ts`
- Modify: `packages/project-store/package.json`
- Modify: `packages/project-store/src/project-store.ts`
- Modify: `packages/project-store/src/project-store.test.ts`
- Modify: `packages/project-store/src/index.ts`
- Modify: `crates/project-io/src/project.rs`
- Modify: `crates/project-io/tests/commit_recovery.rs`
- Modify: `crates/desktop-host/src/dto.rs`
- Modify: `crates/desktop-host/tests/command_contract.rs`

**Interfaces:**
- Consumes: schema-v2 entities, CommandBus, native v2 JSON collections.
- Produces: `PlanEditIntent`, `EntityChange`, `FloorChange`, `patchPlanEntitiesCommand`, `patchFloorCommand`, ProjectStore edit methods, and native patch replay.

- [ ] **Step 1: Write failing create/delete/replace and persistence-failure tests**

```ts
function fixtureFor(snapshot: ProjectSnapshot): Fixture {
  const floor = snapshot.project.floors[0]!;
  return {
    type: "fixture", id: "00000000-0000-4000-8000-000000000010", name: "Fixture", tags: [],
    floorId: floor.id, layerId: floor.layers[0]!.id, locked: false,
    transform: identityTransform2D, kind: "generic", size: { width: 1000, height: 500 },
  };
}

async function openedStore() {
  const backend = new SandboxProjectBackend();
  const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
  await store.create({ name: "Demo", location: "sandbox", profile: "market" });
  return { backend, store, fixture: fixtureFor(store.getState().snapshot!) };
}

it("publishes a multi-entity patch only after one durable commit", async () => {
  const { store, fixture } = await openedStore();
  const intent: PlanEditIntent = {
    reason: "create",
    changes: [{ id: fixture.id, before: null, after: fixture }],
  };
  await store.applyPlanEdit(intent);
  expect(store.getState().snapshot?.project.entities).toContainEqual(fixture);
  await store.undo();
  expect(store.getState().snapshot?.project.entities).toEqual([]);
});

it("does not publish or advance history for a rejected plan patch", async () => {
  const { backend, store, fixture } = await openedStore();
  const beforeSequence = store.getState().snapshot!.sequence;
  backend.failNextCommit = new Error("disk full");
  await expect(store.applyPlanEdit({
    reason: "create", changes: [{ id: fixture.id, before: null, after: fixture }],
  })).rejects.toThrow("disk full");
  expect(store.getState().snapshot?.project.entities).toEqual([]);
  expect(store.getState().snapshot?.sequence).toBe(beforeSequence);
  expect(store.getState().canUndo).toBe(false);
  expect(store.getState().canRedo).toBe(false);
});

it("persists layer visibility as one reversible floor patch", async () => {
  const { store } = await openedStore();
  const before = store.getState().snapshot!.project.floors[0]!;
  const after = { ...before, layers: before.layers.map((layer) => ({ ...layer, visible: false })) };
  await store.applyFloorPatch({ floorId: before.id, before, after });
  expect(store.getState().snapshot!.project.floors[0]!.layers[0]!.visible).toBe(false);
  await store.undo();
  expect(store.getState().snapshot!.project.floors[0]!.layers[0]!.visible).toBe(true);
});
```

Rust tests commit both `plan.entities.patch` and `plan.floor.patch`, checkpoint, reopen, undo, redo, and recover; they also reject a patch whose `before` does not match current JSON.

- [ ] **Step 2: Run focused TypeScript and Rust tests**

```powershell
pnpm.cmd vitest run packages/project-store/src/plan-commands.test.ts packages/project-store/src/project-store.test.ts
cargo test -p project-io --test commit_recovery plan_entity_patch -- --nocapture
cargo test -p desktop-host --test command_contract plan_entity_patch -- --nocapture
```

Expected: FAIL because plan intents and native replay do not exist.

- [ ] **Step 3: Define the single generic durable patch shape**

```ts
export type PlanEditReason = "create" | "delete" | "transform" | "properties" | "duplicate" | "array" | "align" | "distribute";
export interface EntityChange {
  readonly id: string;
  readonly before: SpatialEntity | null;
  readonly after: SpatialEntity | null;
}
export interface PlanEditIntent { readonly reason: PlanEditReason; readonly changes: readonly EntityChange[] }
export interface FloorChange { readonly floorId: string; readonly before: Floor; readonly after: Floor }
```

`patchPlanEntitiesCommand` verifies every current entity equals `before`, applies changes in declared order, validates the complete next snapshot with `parseSnapshot`, and stores the exact reversed changes as inverse payload. It never cascade-deletes references; a delete that would invalidate a dimension or contract record returns `INVALID_REFERENCE` without committing. It uses command type `plan.entities.patch` for every reason. `patchFloorCommand` requires the current floor to equal `before`, replaces exactly that floor with `after`, validates layer IDs and entity-layer references, and uses command type `plan.floor.patch`.

- [ ] **Step 4: Add ProjectStore orchestration**

Add `@aethertwin/plan-engine` as a workspace dependency and expose:

```ts
applyPlanEdit(intent: PlanEditIntent): Promise<void> {
  return this.enqueueMutation(() => this.mutate((bus) => bus.execute(patchPlanEntitiesCommand, intent)));
}

applyFloorPatch(change: FloorChange): Promise<void> {
  return this.enqueueMutation(() => this.mutate((bus) => bus.execute(patchFloorCommand, change)));
}
```

Owned-copy the intent or floor change before queueing so callers cannot mutate pending payloads.

- [ ] **Step 5: Implement strict generic replay in Rust**

Desktop DTO accepts only `{ reason, changes }` for `plan.entities.patch` and `{ floorId, before, after }` for `plan.floor.patch`. Entity changes contain canonical `id`, `before`, and `after`, with at least one side non-null. `project-io::apply_operation` requires exact current JSON before applying either patch, preserves stable order, validates unique IDs and entity floor/layer references, and selects payload versus inverse according to journal action. Geometry remains opaque JSON.

- [ ] **Step 6: Run the full affected verification set**

```powershell
pnpm.cmd vitest run packages/project-store/src/plan-commands.test.ts packages/project-store/src/project-store.test.ts
pnpm.cmd exec tsc -p packages/project-store/tsconfig.json --noEmit
cargo test -p project-io --test commit_recovery
cargo test -p desktop-host --test command_contract
cargo check -p project-io -p desktop-host
```

Expected: all tests pass; type checking and Cargo check exit `0`.

- [ ] **Step 7: Commit Task 6**

```powershell
git add -- aethertwin/packages/plan-engine aethertwin/packages/project-store aethertwin/crates/project-io aethertwin/crates/desktop-host
git commit -m "feat: persist plan entity patch commands"
```

---

### Task 7: Implement transforms, copy/paste, arrays, alignment, and distribution

**Files:**
- Create: `packages/plan-engine/src/operations.ts`
- Create: `packages/plan-engine/src/operations.test.ts`
- Modify: `packages/plan-engine/src/index.ts`
- Modify: `packages/project-store/src/plan-commands.test.ts`

**Interfaces:**
- Consumes: Task 3 transforms, Task 4 bounds, Task 6 `PlanEditIntent`.
- Produces: `translateEntities`, `rotateEntities`, `resizeEntities`, `duplicateEntities`, `linearArray`, `rectangularArray`, `alignEntities`, `distributeEntities`.

- [ ] **Step 1: Write failing deterministic batch-operation tests**

```ts
const floorId = "00000000-0000-4000-8000-000000000001";
const layerId = "00000000-0000-4000-8000-000000000002";
const fixtureAt = (id: string, x: number, width = 100): Fixture => ({
  type: "fixture", id, name: `Fixture ${id}`, tags: [], floorId, layerId, locked: false,
  transform: { translation: { x, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
  kind: "generic", size: { width, height: 100 },
});

it("creates one rectangular-array intent with fresh deterministic UUIDs", () => {
  const fixture = fixtureAt("00000000-0000-4000-8000-000000000010", 0);
  const generatedIds = [11, 12, 13, 14, 15].map(
    (value) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`,
  );
  const queue = [...generatedIds];
  const result = rectangularArray(
    [fixture],
    { rows: 2, columns: 3, rowGap: 200, columnGap: 300 },
    () => queue.shift()!,
  );
  if (!result.ok) throw new Error(result.issue.message);
  expect(result.value.reason).toBe("array");
  expect(result.value.changes).toHaveLength(5);
  expect(result.value.changes.map((change) => change.after?.id)).toEqual(generatedIds);
});

it("distributes three entities by equal edge gap without moving endpoints", () => {
  const left = fixtureAt("00000000-0000-4000-8000-000000000020", 0);
  const middle = fixtureAt("00000000-0000-4000-8000-000000000021", 150);
  const right = fixtureAt("00000000-0000-4000-8000-000000000022", 500);
  const result = distributeEntities([left, middle, right], "horizontal", "gap");
  if (!result.ok) throw new Error(result.issue.message);
  const afterById = new Map(result.value.changes.map((change) => [change.id, change.after!]));
  const after = [left, middle, right].map((entity) => afterById.get(entity.id) ?? entity);
  const bounds = after.map(entityWorldBounds);
  expect(after[0]!.transform).toEqual(left.transform);
  expect(after[2]!.transform).toEqual(right.transform);
  expect(bounds[1]!.min.x - bounds[0]!.max.x).toBe(bounds[2]!.min.x - bounds[1]!.max.x);
});
```

- [ ] **Step 2: Run the focused test and confirm missing operations**

```powershell
pnpm.cmd vitest run packages/plan-engine/src/operations.test.ts
```

Expected: FAIL because operation functions do not exist.

- [ ] **Step 3: Implement normalized transform operations**

Every function returns `PlanResult<PlanEditIntent>`, rejects empty/locked selections, and places exact before/after entities in one intent. Move and rotate update transforms. Resize bakes rectangle dimensions or polygon vertices and normalizes scale. Wall scale must be uniform; non-uniform wall requests return `NON_UNIFORM_WALL_SCALE`.

- [ ] **Step 4: Implement duplication, arrays, alignment, and distribution**

```ts
export function duplicateEntities(entities: readonly SpatialEntity[], offset: Point2, makeId: () => string): PlanResult<PlanEditIntent>;
export function linearArray(entities: readonly SpatialEntity[], input: { count: number; delta: Point2 }, makeId: () => string): PlanResult<PlanEditIntent>;
export function rectangularArray(entities: readonly SpatialEntity[], input: { rows: number; columns: number; rowGap: number; columnGap: number }, makeId: () => string): PlanResult<PlanEditIntent>;
export function alignEntities(entities: readonly SpatialEntity[], axis: "left" | "center-x" | "right" | "top" | "center-y" | "bottom"): PlanResult<PlanEditIntent>;
export function distributeEntities(entities: readonly SpatialEntity[], axis: "horizontal" | "vertical", mode: "centers" | "gap"): PlanResult<PlanEditIntent>;
```

Counts are safe integers; arrays require at least two total instances; generated IDs must be unique and valid; ordering is source-major, then row, then column.

- [ ] **Step 5: Prove each batch is one undo unit through ProjectStore**

Add a ProjectStore command test that applies a six-object array intent, checks one sequence increment, undoes once to the exact original JSON, and redoes once to the exact array JSON.

- [ ] **Step 6: Run tests and type checks**

```powershell
pnpm.cmd vitest run packages/plan-engine/src/operations.test.ts packages/project-store/src/plan-commands.test.ts
pnpm.cmd exec tsc -p packages/plan-engine/tsconfig.json --noEmit
pnpm.cmd exec tsc -p packages/project-store/tsconfig.json --noEmit
```

Expected: all tests pass; both type checks exit `0`.

- [ ] **Step 7: Commit Task 7**

```powershell
git add -- aethertwin/packages/plan-engine/src aethertwin/packages/project-store/src/plan-commands.test.ts
git commit -m "feat: add plan batch editing operations"
```

---

### Task 8: Build the PixiJS v8 rendering package

**Files:**
- Delete: `packages/render-plan-2d/.gitkeep`
- Create: `packages/render-plan-2d/package.json`
- Create: `packages/render-plan-2d/tsconfig.json`
- Create: `packages/render-plan-2d/src/types.ts`
- Create: `packages/render-plan-2d/src/scene-projection.ts`
- Create: `packages/render-plan-2d/src/pixi-plan-renderer.ts`
- Create: `packages/render-plan-2d/src/index.ts`
- Create: `packages/render-plan-2d/src/scene-projection.test.ts`
- Create: `packages/render-plan-2d/src/pixi-plan-renderer.test.ts`
- Modify: `pnpm-lock.yaml`
- Modify: `THIRD_PARTY_NOTICES.md`

**Interfaces:**
- Consumes: core-model snapshot/entities, plan-engine viewport/index/dimension geometry, PixiJS 8.19.0.
- Produces: `PlanRendererInput`, `PlanPointerEvent`, `PlanRendererEventSink`, `PlanRenderer`, `PlanRendererFactory`, testable `PlanRenderPort`, `projectScene`, `PixiPlanRenderer`.

- [ ] **Step 1: Write failing pure scene-projection and fake-renderer tests**

```ts
const ids = [1, 2, 3].map((value) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`);
const base = createInitialSnapshot({ name: "Render", profile: "market", uuid: () => ids.shift()! });
const floorA = base.project.floors[0]!;
const floorB: Floor = {
  id: "00000000-0000-4000-8000-000000000004", name: "Floor B", tags: [],
  layers: [{ id: "00000000-0000-4000-8000-000000000005", name: "Default", tags: [], visible: true, locked: false }],
};
const fixtureAt = (id: string, floor: Floor, x: number): Fixture => ({
  type: "fixture", id, name: id, tags: [], floorId: floor.id, layerId: floor.layers[0]!.id, locked: false,
  transform: { translation: { x, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
  kind: "generic", size: { width: 100, height: 100 },
});
const visibleFixture = fixtureAt("00000000-0000-4000-8000-000000000010", floorA, 0);
const floorBFixture = fixtureAt("00000000-0000-4000-8000-000000000011", floorB, 0);
const snapshot = parseSnapshotV2({
  ...base,
  project: { ...base.project, floors: [floorA, floorB], entities: [visibleFixture, floorBFixture] },
});
const viewport = { width: 800, height: 600, center: { x: 0, y: 0 }, pixelsPerMillimetre: 1 };

it("projects only visible entities from the active floor and viewport", () => {
  const scene = projectScene({ snapshot, activeFloorId: floorA.id, viewport, selectedIds: new Set(), draft: null });
  expect(scene.nodes.map((node) => node.entityId)).toEqual([visibleFixture.id]);
  expect(scene.nodes.some((node) => node.entityId === floorBFixture.id)).toBe(false);
});

class FakePlanRenderPort implements PlanRenderPort {
  readonly removedKeys: string[] = [];
  async init(_host: HTMLElement, _sink: PlanRendererEventSink) {}
  upsert(_node: RenderNode) {}
  remove(key: string) { this.removedKeys.push(key); }
  resize(_width: number, _height: number, _resolution: number) {}
  render() {}
  destroy() {}
}

it("removes stale display objects and destroys their resources", async () => {
  const port = new FakePlanRenderPort();
  const renderer = new PixiPlanRenderer(() => port);
  const inputWithFixture = { snapshot, activeFloorId: floorA.id, viewport, selectedIds: new Set<string>(), draft: null };
  const inputWithoutFixture = {
    ...inputWithFixture,
    snapshot: parseSnapshotV2({ ...snapshot, project: { ...snapshot.project, entities: [floorBFixture] } }),
  };
  await renderer.init({} as HTMLElement, { handle: () => undefined });
  renderer.update(inputWithFixture);
  renderer.update(inputWithoutFixture);
  expect(port.removedKeys).toEqual([visibleFixture.id]);
});
```

- [ ] **Step 2: Run tests and confirm the package is absent**

```powershell
pnpm.cmd vitest run packages/render-plan-2d/src/scene-projection.test.ts packages/render-plan-2d/src/pixi-plan-renderer.test.ts
```

Expected: FAIL because the rendering package does not exist.

- [ ] **Step 3: Add the exact PixiJS dependency**

Run only after network approval if the sandbox requests it:

```powershell
pnpm.cmd add --filter @aethertwin/render-plan-2d --save-exact pixi.js@8.19.0
```

Create a private ESM package depending on `@aethertwin/core-model`, `@aethertwin/plan-engine`, and exact `pixi.js`. Add `pixi.js | 8.19.0 | MIT` to the direct JavaScript runtime notice table.

- [ ] **Step 4: Implement pure projection and renderer contracts**

```ts
export interface PlanRendererInput {
  readonly snapshot: ProjectSnapshot;
  readonly activeFloorId: string;
  readonly viewport: ViewportTransform;
  readonly selectedIds: ReadonlySet<string>;
  readonly draft: readonly SpatialEntity[] | null;
}
export interface PlanPointerEvent {
  readonly type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "wheel";
  readonly pointerId: number; readonly screen: Point2; readonly buttons: number;
  readonly wheelDelta?: Point2; readonly shiftKey: boolean; readonly altKey: boolean;
  readonly ctrlKey: boolean; readonly metaKey: boolean;
}
export interface PlanRendererEventSink { handle(event: PlanPointerEvent): void }
export interface PlanRenderer {
  init(host: HTMLElement, sink: PlanRendererEventSink): Promise<void>;
  update(input: PlanRendererInput): void;
  resize(width: number, height: number, resolution: number): void;
  destroy(): void;
}
export type PlanRendererFactory = () => PlanRenderer;
export type RenderGeometry =
  | { readonly kind: "polygon" | "polyline"; readonly points: readonly Point2[]; readonly closed: boolean }
  | { readonly kind: "circle"; readonly center: Point2; readonly radius: number }
  | { readonly kind: "dimension"; readonly start: Point2; readonly end: Point2; readonly label: Point2; readonly millimetres: number };
export interface RenderNode {
  readonly key: string; readonly entityId: string;
  readonly layer: "content" | "annotation" | "overlay";
  readonly geometry: RenderGeometry; readonly bounds: Bounds2;
  readonly styleToken: string; readonly selected: boolean; readonly locked: boolean;
}
export interface PlanRenderPort {
  init(host: HTMLElement, sink: PlanRendererEventSink): Promise<void>;
  upsert(node: RenderNode): void;
  remove(key: string): void;
  resize(width: number, height: number, resolution: number): void;
  render(): void;
  destroy(): void;
}
export type PlanRenderPortFactory = () => PlanRenderPort;
```

`projectScene` is pure and returns stable render nodes for `grid`, `content`, `annotation`, and `overlay`, after active-floor, visible-layer, and viewport filtering.

- [ ] **Step 5: Implement one Pixi Application and five stable containers**

Use PixiJS v8 `new Application()` followed by `await app.init(...)`. Create `grid`, `content`, `annotation`, `overlay`, and `interaction` containers once. Use `eventMode = "static"` only on the interaction surface and send federated pointer/wheel data to the event sink. Keep business hit testing in plan-engine.

`PixiPlanRenderer` accepts `PlanRenderPortFactory = createPixiRenderPort` in its constructor, so Node tests use the complete fake port above while production constructs the real Pixi adapter. Maintain ID-keyed `Graphics` entries, redraw only changed projections, set `autoStart: false`, and call `app.render()` on dirty updates. Destroy removed graphics and call `app.destroy(true, { children: true, texture: true, textureSource: true })` once.

- [ ] **Step 6: Run renderer tests and type checking**

```powershell
pnpm.cmd vitest run packages/render-plan-2d/src/scene-projection.test.ts packages/render-plan-2d/src/pixi-plan-renderer.test.ts
pnpm.cmd exec tsc -p packages/render-plan-2d/tsconfig.json --noEmit
```

Expected: node-safe projection/fake-port tests pass; TypeScript validates the real PixiJS adapter without launching a browser.

- [ ] **Step 7: Commit Task 8**

```powershell
git add -- aethertwin/packages/render-plan-2d aethertwin/pnpm-lock.yaml aethertwin/THIRD_PARTY_NOTICES.md
git commit -m "feat: add PixiJS plan rendering layer"
```

---

### Task 9: Implement transient editor session and pointer interaction state machine

**Files:**
- Create: `apps/studio/src/features/plan-editor/editor-session.ts`
- Create: `apps/studio/src/features/plan-editor/editor-session.test.ts`
- Create: `apps/studio/src/features/plan-editor/interaction-controller.ts`
- Create: `apps/studio/src/features/plan-editor/interaction-controller.test.ts`
- Create: `apps/studio/src/features/plan-editor/plan-editor.test-support.tsx`
- Modify: `apps/studio/package.json`

**Interfaces:**
- Consumes: plan-engine selection/snapping/operations/intents, ProjectStore `applyPlanEdit`, render event coordinates.
- Produces: `PlanTool`, `PlanDraft`, `PlanEditorState`, transient clipboard, `createPlanEditorStore`, `InteractionController`, `createInteractionController`, and fixed-ID `createPlanEditorTestHarness`/`pointerAt` support.

- [ ] **Step 1: Write failing transient-state and one-gesture/one-commit tests**

`plan-editor.test-support.tsx` defines `createPlanEditorTestHarness()` with fixed UUIDs, a two-floor schema-v2 snapshot, one selected fixture, a vanilla editor store, `vi.fn` durable callbacks, and a controller. It also exports this exact event helper:

```ts
export function createPlanEditorTestHarness() {
  const initialIds = [1, 2, 3].map(
    (value) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`,
  );
  const initial = createInitialSnapshot({ name: "Editor", profile: "market", uuid: () => initialIds.shift()! });
  const floorA = initial.project.floors[0]!;
  const floorB: Floor = {
    id: "00000000-0000-4000-8000-000000000004", name: "Floor B", tags: [],
    layers: [{ id: "00000000-0000-4000-8000-000000000005", name: "Default", tags: [], visible: true, locked: false }],
  };
  const fixture: Fixture = {
    type: "fixture", id: "00000000-0000-4000-8000-000000000010", name: "Fixture", tags: [],
    floorId: floorA.id, layerId: floorA.layers[0]!.id, locked: false,
    transform: { translation: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } },
    kind: "generic", size: { width: 100, height: 100 },
  };
  const snapshot = parseSnapshotV2({
    ...initial,
    project: { ...initial.project, floors: [floorA, floorB], entities: [fixture] },
  });
  const store = createPlanEditorStore({ activeFloorId: floorA.id });
  const applyPlanEdit = vi.fn(async (_intent: PlanEditIntent) => undefined);
  const errors: unknown[] = [];
  let nextId = 20;
  const controller = createInteractionController({
    getSnapshot: () => snapshot,
    store,
    makeId: () => `00000000-0000-4000-8000-${(nextId++).toString().padStart(12, "0")}`,
    applyPlanEdit,
    onError: (error) => errors.push(error),
  });
  return { snapshot, floorA, floorB, fixture, store, controller, applyPlanEdit, errors };
}

export const pointerAt = (
  type: PlanPointerEvent["type"], x: number, y: number, buttons = type === "pointerup" ? 0 : 1,
): PlanPointerEvent => ({
  type, pointerId: 1, screen: { x, y }, buttons,
  shiftKey: false, altKey: false, ctrlKey: false, metaKey: false,
});
```

Use that harness in self-contained tests:

```ts
it("restores a separate viewport for each active floor", () => {
  const { store, floorA, floorB } = createPlanEditorTestHarness();
  const viewA = { width: 800, height: 600, center: { x: 0, y: 0 }, pixelsPerMillimetre: 1 };
  const viewB = { ...viewA, center: { x: 5000, y: 2000 }, pixelsPerMillimetre: 0.25 };
  store.getState().setViewport(viewA);
  expect(store.getState().setActiveFloor(floorB.id)).toBe(true);
  store.getState().setViewport(viewB);
  expect(store.getState().setActiveFloor(floorA.id)).toBe(true);
  expect(store.getState().viewport).toEqual(viewA);
});

it("previews a selected-fixture drag but commits exactly once on pointer up", async () => {
  const { controller, store, fixture, applyPlanEdit } = createPlanEditorTestHarness();
  store.getState().setSelection([fixture.id]);
  await controller.handle(pointerAt("pointerdown", 50, 50));
  await controller.handle(pointerAt("pointermove", 60, 50));
  await controller.handle(pointerAt("pointermove", 70, 50));
  expect(store.getState().draft?.kind).toBe("transform");
  expect(applyPlanEdit).not.toHaveBeenCalled();
  await controller.handle(pointerAt("pointerup", 70, 50, 0));
  expect(applyPlanEdit).toHaveBeenCalledTimes(1);
});
```

Add named tests with the same fixed harness for these exact sequences: three clicks plus Enter create one boundary; two clicks create one wall; three clicks plus Enter create one zone; pointer-down/move/up creates one space unit and one fixture; one click creates one POI; two anchor clicks plus a third offset-placement click create one dimension; click, Shift-click, empty-drag box selection, selected-object drag, pan drag, cursor-centred wheel zoom, enabled snap delta, copy then paste with a 100 mm offset, Escape cancellation, lost-focus cancellation, and rejected-commit rollback. Each completed gesture asserts exactly one `applyPlanEdit`; preview/cancel paths assert zero.

- [ ] **Step 2: Run tests and confirm missing state/controller APIs**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/editor-session.test.ts apps/studio/src/features/plan-editor/interaction-controller.test.ts
```

Expected: FAIL because the plan-editor feature does not exist.

- [ ] **Step 3: Implement the Zustand vanilla session store**

```ts
export type PlanTool = "select" | "boundary" | "wall" | "zone" | "space-unit" | "fixture" | "poi" | "dimension" | "pan";
export type PlanDraft =
  | { readonly kind: "create"; readonly tool: Exclude<PlanTool, "select" | "pan">; readonly points: readonly Point2[]; readonly preview: readonly SpatialEntity[] }
  | { readonly kind: "transform"; readonly origin: Point2; readonly preview: readonly SpatialEntity[] }
  | { readonly kind: "box-select"; readonly start: Point2; readonly current: Point2 };
export interface PlanEditorState {
  readonly activeFloorId: string;
  readonly activeTool: PlanTool;
  readonly selectedIds: ReadonlySet<string>;
  readonly viewport: ViewportTransform;
  readonly snapModes: ReadonlySet<SnapMode>;
  readonly draft: PlanDraft | null;
  readonly gestureActive: boolean;
  readonly clipboard: readonly SpatialEntity[];
  setActiveFloor(id: string): boolean;
  setActiveTool(tool: PlanTool): void;
  setSelection(ids: readonly string[]): void;
  setViewport(viewport: ViewportTransform): void;
  setSnapModes(modes: readonly SnapMode[]): void;
  setClipboard(entities: readonly SpatialEntity[]): void;
  beginGesture(draft: PlanDraft): void;
  updateDraft(draft: PlanDraft): void;
  finishGesture(): void;
  cancelDraft(): void;
}
```

Keep an internal `ReadonlyMap<floorId, ViewportTransform>` and restore it in `setActiveFloor`. Return `false` without changing floor while `gestureActive`; the component announces why. Clipboard objects are deep-owned transient copies and paste generates fresh IDs through Task 7. Store snapshots never contain `ProjectSnapshot` data.

- [ ] **Step 4: Implement the controller as a testable non-React unit**

Define the non-React boundary exactly:

```ts
export interface InteractionControllerDeps {
  readonly getSnapshot: () => ProjectSnapshot;
  readonly store: StoreApi<PlanEditorState>;
  readonly makeId: () => string;
  readonly applyPlanEdit: (intent: PlanEditIntent) => Promise<void>;
  readonly onError: (error: unknown) => void;
}
export interface InteractionController {
  handle(event: PlanPointerEvent): Promise<void>;
  keyDown(key: "Enter" | "Escape" | "Delete", modifiers?: { shiftKey?: boolean }): Promise<void>;
  copy(): void;
  paste(offset?: Point2): Promise<void>;
  cancel(): void;
}
export function createInteractionController(deps: InteractionControllerDeps): InteractionController;
```

Point-by-point boundary/wall/zone tools append snapped world points; Enter finalizes valid geometry. Space-unit/fixture use drag rectangles, POI uses one snapped click, and dimension uses two free/entity anchors followed by an offset-placement click. Select supports replace, Shift-toggle, box selection, and selected-object translation; pan drag and wheel zoom mutate only viewport. `copy()` deep-owns active-floor selected entities in transient clipboard; `paste()` calls `duplicateEntities` with a default `{ x: 100, y: -100 }` mm offset and commits once. Pointer move updates only draft/viewport/selection preview. Pointer up or Enter validates and awaits one edit intent. Escape and lost focus cancel unfinished creation/transform. Commit failure clears preview, preserves selection, and calls `onError`.

- [ ] **Step 5: Run tests and Studio type checking**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/editor-session.test.ts apps/studio/src/features/plan-editor/interaction-controller.test.ts
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
```

Expected: tests pass; TypeScript exits `0`.

- [ ] **Step 6: Commit Task 9**

```powershell
git add -- aethertwin/apps/studio/package.json aethertwin/apps/studio/src/features/plan-editor
git commit -m "feat: add plan editor interaction session"
```

---

### Task 10: Replace the M0 overview with the real plan-editor shell

**Files:**
- Create: `apps/studio/src/features/plan-editor/plan-editor.tsx`
- Create: `apps/studio/src/features/plan-editor/plan-toolbar.tsx`
- Create: `apps/studio/src/features/plan-editor/floor-tree.tsx`
- Create: `apps/studio/src/features/plan-editor/plan-inspector.tsx`
- Create: `apps/studio/src/features/plan-editor/plan-editor.test.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.test-support.tsx`
- Modify: `apps/studio/src/app.tsx`
- Modify: `apps/studio/src/app.css`
- Modify: `packages/editor-shell/src/editor-shell.tsx`
- Modify: `packages/editor-shell/src/editor-shell.test.tsx`
- Modify: `packages/editor-shell/src/editor-shell.css`
- Delete: `apps/studio/src/features/project-overview/project-overview.tsx`
- Delete: `apps/studio/src/features/project-overview/project-overview.test.tsx`
- Delete: `apps/studio/src/features/project-overview/project-tree.tsx`
- Delete: `apps/studio/src/features/project-overview/project-inspector.tsx`

**Interfaces:**
- Consumes: ProjectStore state/actions, Task 9 session store, existing EditorShell and Aether components.
- Produces: `PlanEditor`, profile-aware implemented toolbar, synchronized floor tree, contextual Inspector, real central canvas slot.

- [ ] **Step 1: Write failing Studio layout and no-fake-control tests**

```tsx
async function createShowroomProject(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "新建店铺展厅" }));
  await user.type(screen.getByLabelText("项目名称"), "M1 展厅");
  await user.click(screen.getByRole("button", { name: "创建项目" }));
}

it("opens a created project directly into the real 2D plan editor", async () => {
  const user = userEvent.setup();
  render(<App backend={new SandboxProjectBackend()} />);
  await createShowroomProject(user);
  expect(screen.getByRole("main", { name: "二维平面编辑器" })).toBeInTheDocument();
  expect(screen.getByRole("tree", { name: "楼层和空间" })).toBeInTheDocument();
  expect(screen.getByRole("complementary", { name: "检查器" })).toHaveTextContent("项目位置");
  expect(screen.queryByText("M0 OVERVIEW")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /3D|导出|路线/ })).not.toBeInTheDocument();
});
```

Add a market assertion that visible groups are `选择 / 场地 / 空间单元 / 标记`, while showroom uses `选择 / 建筑 / 展具 / 标记`; both profiles expose the same underlying nine implemented tools, change only grouping labels/default kinds, and every displayed tool button must update `activeTool`. Add tests that layer visibility/lock/name/order each call `applyFloorPatch` once, and that the multi-selection copy, paste, linear array, rectangular array, align, and distribute buttons call the controller or `applyPlanEdit` exactly once.

- [ ] **Step 2: Run the focused UI tests and observe the overview mismatch**

```powershell
pnpm.cmd vitest run packages/editor-shell/src/editor-shell.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx
```

Expected: FAIL because PlanEditor and toolbar slot do not exist.

- [ ] **Step 3: Add a real toolbar slot to EditorShell**

Add required `toolbar: React.ReactNode` to `EditorShellProps` and render it in a second header row with `aria-label="平面工具"`. Preserve back/save/undo/redo/close semantics and all M0 status behavior.

- [ ] **Step 4: Implement profile-aware tools, tree, and Inspector contexts**

Only render implemented tool buttons. Tree rows expose floor, layer, and entity IDs through `data-*` attributes; a layer row exposes visible/locked controls; entity selection synchronizes with session selection. Inspector uses:

```ts
type InspectorContext =
  | { kind: "project" }
  | { kind: "floor"; floorId: string }
  | { kind: "layer"; floorId: string; layerId: string }
  | { kind: "entity"; entityId: string }
  | { kind: "multi"; entityIds: readonly string[] };
```

Project context absorbs M0 name/tags/profile/schema/path/save-state/backend fields. Floor and layer rows support active-floor selection plus layer visible/locked/name/order changes; every durable layer change creates an exact before/after `FloorChange` and awaits `ProjectStore.applyFloorPatch`. Entity context exposes name, read-only type, exact mm/cm/m dimensions and X/Y position, degree input converted to stored radians, layer, lock, and normalized tags; every mutable field delegates one durable `properties` or `transform` intent to `applyPlanEdit`. Multi context exposes copy, paste, linear array, rectangular array, align, and distribute; copy only updates the Task 9 transient clipboard, while every other mutating operation awaits one `applyPlanEdit` intent from Task 7. Disable these controls for hidden/locked invalid selections and show the returned typed issue.

- [ ] **Step 5: Compose PlanEditor and replace ProjectOverview routing**

`App` still uses `view: "center" | "editor"`, but renders `PlanEditor` for the editor branch. On close/back, preserve current flush/save/close and recents behavior. Extend `plan-editor.test-support.tsx` with `renderPlanEditorFixture(options?)`, returning the fixed fixture, store, controller, ProjectStore, renderer override, and Testing Library render result used by Tasks 10–12. Remove the four obsolete project-overview files only after equivalent tests pass.

- [ ] **Step 6: Apply the quiet Aether layout**

Use existing tokens, 1px translucent borders, restrained cyan selection, 120–220ms transitions, no remote font, no broad pure-black surface, and no decorative glass/gradient. Central canvas host must have `min-width: 0`, `min-height: 0`, and a real empty-state instruction tied to working tools. Do not render a bottom panel in M1.

- [ ] **Step 7: Run UI tests and affected type checks**

```powershell
pnpm.cmd vitest run packages/editor-shell/src/editor-shell.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx apps/studio/src/features/project-center/project-center.test.tsx
pnpm.cmd exec tsc -p packages/editor-shell/tsconfig.json --noEmit
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
```

Expected: tests pass; both type checks exit `0`.

- [ ] **Step 8: Commit Task 10**

```powershell
git add -- aethertwin/packages/editor-shell aethertwin/apps/studio/src/app.tsx aethertwin/apps/studio/src/app.css aethertwin/apps/studio/src/features/plan-editor aethertwin/apps/studio/src/features/project-overview
git commit -m "feat: open projects in the 2D plan editor"
```

---

### Task 11: Integrate Pixi canvas, exact editing, culling, and accessibility

**Files:**
- Create: `apps/studio/src/features/plan-editor/plan-canvas.tsx`
- Create: `apps/studio/src/features/plan-editor/plan-canvas.test.tsx`
- Create: `apps/studio/src/features/plan-editor/plan-accessibility.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-inspector.tsx`
- Modify: `apps/studio/src/features/plan-editor/interaction-controller.ts`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.test-support.tsx`
- Modify: `apps/studio/src/app.css`
- Modify: `apps/studio/package.json`
- Modify: `packages/render-plan-2d/src/scene-projection.test.ts`

**Interfaces:**
- Consumes: `PlanRendererFactory`, Task 9 controller/session, Task 10 shell, ProjectStore.
- Produces: `PlanCanvasProps`, lifecycle-safe `PlanCanvas`, synchronized DOM object list, exact transform/dimension submission, keyboard copy/paste, `FakePlanRenderer`, and a 2,000-entity culling fixture.

- [ ] **Step 1: Write failing lifecycle, floor isolation, keyboard, and performance-fixture tests**

Extend `plan-editor.test-support.tsx` with a complete `FakePlanRenderer implements PlanRenderer` that records `initCount`, `updateInputs`, `resizeInputs`, and `destroyCount`, plus a `createPlanCanvasProps(harness, renderer)` factory. Then write:

```tsx
it("initializes once, updates snapshots, and destroys once", async () => {
  const harness = createPlanEditorTestHarness();
  const renderer = new FakePlanRenderer();
  const props = createPlanCanvasProps(harness, renderer);
  const snapshotAfterMove = parseSnapshotV2({
    ...harness.snapshot,
    project: {
      ...harness.snapshot.project,
      entities: harness.snapshot.project.entities.map((entity) => entity.id === harness.fixture.id
        ? { ...entity, transform: { ...entity.transform, translation: { x: 100, y: 0 } } }
        : entity),
    },
  });
  const view = render(<PlanCanvas {...props} />);
  await waitFor(() => expect(renderer.initCount).toBe(1));
  view.rerender(<PlanCanvas {...props} snapshot={snapshotAfterMove} />);
  expect(renderer.updateInputs.at(-1)?.snapshot).toBe(snapshotAfterMove);
  view.unmount();
  expect(renderer.destroyCount).toBe(1);
});

it("keeps canvas and DOM selection synchronized for keyboard users", async () => {
  const user = userEvent.setup();
  const { fixture } = renderPlanEditorFixture();
  await user.click(screen.getByRole("treeitem", { name: fixture.name }));
  expect(screen.getByRole("main", { name: "二维平面编辑器" })).toHaveAttribute("data-selected-count", "1");
  expect(screen.getByLabelText("X 坐标")).toHaveValue("0");
});
```

Add a pure projection test that derives exactly 2,000 fixed fixtures from `createPlanEditorTestHarness().fixture`:

```ts
const entities = Array.from({ length: 2_000 }, (_, index) => ({
  ...harness.fixture,
  id: `00000000-0000-4000-8001-${index.toString().padStart(12, "0")}`,
  transform: {
    ...harness.fixture.transform,
    translation: { x: (index % 50) * 120, y: Math.floor(index / 50) * 120 },
  },
}));
```

Put one extra clone on the other floor and one on a hidden layer, then assert only intersecting active-floor visible IDs become render nodes. Add keyboard tests that Ctrl/Cmd+C calls `controller.copy()` without a durable commit, Ctrl/Cmd+V calls `controller.paste()` once, and text-input focus prevents both canvas shortcuts.

- [ ] **Step 2: Run focused tests and observe missing PlanCanvas**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/plan-canvas.test.tsx packages/render-plan-2d/src/scene-projection.test.ts
```

Expected: FAIL because PlanCanvas and accessibility mirror do not exist.

- [ ] **Step 3: Add Studio package dependencies and lifecycle-safe renderer creation**

Add workspace dependencies on `@aethertwin/plan-engine` and `@aethertwin/render-plan-2d`. Define `PlanCanvasProps` as `{ snapshot: ProjectSnapshot; activeFloorId: string; sessionStore: StoreApi<PlanEditorState>; controller: InteractionController; rendererFactory?: PlanRendererFactory; onError(error: unknown): void }`. `PlanCanvas` creates one renderer per mounted host, uses `ResizeObserver` to send capped resolution `Math.min(devicePixelRatio, 2)`, updates renderer input from immutable state, and destroys on cleanup.

- [ ] **Step 4: Wire pointer, wheel, focus, and keyboard input**

The renderer sink forwards screen coordinates to the interaction controller. The controller performs world conversion and authoritative hit/snap logic. Canvas root uses `tabIndex={0}`; Escape cancels; Delete requests a durable delete; Ctrl/Cmd+C copies to transient clipboard; Ctrl/Cmd+V pastes through one durable intent; arrow keys move by grid step only when focus is on the canvas rather than an input. Ignore these shortcuts when an input, textarea, select, or contenteditable owns focus. No M5 shortcut catalogue is added.

- [ ] **Step 5: Add exact Inspector edits and accessible object parity**

Exact fields parse through plan-engine units, show inline typed issues, preview nothing on invalid input, and submit one `properties` or `transform` intent on commit. `PlanAccessibility` renders a visually compact DOM list of visible active-floor entities with type, name, selection state, and select action; locked entities remain inspectable.

- [ ] **Step 6: Run affected tests and type checks**

```powershell
pnpm.cmd vitest run packages/render-plan-2d/src/scene-projection.test.ts packages/render-plan-2d/src/pixi-plan-renderer.test.ts apps/studio/src/features/plan-editor/editor-session.test.ts apps/studio/src/features/plan-editor/interaction-controller.test.ts apps/studio/src/features/plan-editor/plan-editor.test.tsx apps/studio/src/features/plan-editor/plan-canvas.test.tsx
pnpm.cmd exec tsc -p packages/render-plan-2d/tsconfig.json --noEmit
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
```

Expected: all tests pass; both type checks exit `0`.

- [ ] **Step 7: Commit Task 11**

```powershell
git add -- aethertwin/apps/studio/package.json aethertwin/apps/studio/src/features/plan-editor aethertwin/apps/studio/src/app.css aethertwin/packages/render-plan-2d
git commit -m "feat: integrate accessible Pixi plan canvas"
```

---

### Task 12: Complete save/reopen integration, policy checks, and M1 documentation

**Files:**
- Create: `apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.test-support.tsx`
- Create: `docs/M1_REPORT.md`
- Modify: `packages/project-store/src/project-store.test.ts`
- Modify: `apps/studio/src/backend/tauri-backend.test.ts`
- Modify: `tests/workspace-structure.test.mjs`
- Modify: `tests/visible-actions.test.mjs`
- Modify: `tests/project-format-policy.test.mjs`
- Modify: `tests/offline-source-policy.test.mjs`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/PRODUCT_SPEC.md`
- Modify: `docs/PROJECT_FORMAT.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/DECISIONS.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: all Tasks 1–11.
- Produces: end-to-end sandbox persistence evidence, native contract evidence, honest M1 policy/docs, and final milestone report.

- [ ] **Step 1: Write the failing save/close/reopen integration test**

```tsx
it("reopens the exact edited plan after undo, redo, array, and save", async () => {
  const backend = new SandboxProjectBackend();
  const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
  await store.create({ name: "M1 Demo", location: "sandbox", profile: "market" });
  const initial = store.getState().snapshot!;
  const floor = initial.project.floors[0]!;
  const layer = floor.layers[0]!;
  const boundary: Boundary = {
    type: "boundary", id: "00000000-0000-4000-8000-000000000010", name: "Boundary", tags: [],
    floorId: floor.id, layerId: layer.id, locked: false, transform: identityTransform2D,
    polygon: [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 }],
  };
  const fixture: Fixture = {
    type: "fixture", id: "00000000-0000-4000-8000-000000000011", name: "Fixture", tags: [],
    floorId: floor.id, layerId: layer.id, locked: false,
    transform: { translation: { x: 500, y: 500 }, rotation: 0, scale: { x: 1, y: 1 } },
    kind: "generic", size: { width: 1000, height: 500 },
  };
  await store.applyPlanEdit({
    reason: "create",
    changes: [
      { id: boundary.id, before: null, after: boundary },
      { id: fixture.id, before: null, after: fixture },
    ],
  });
  const generatedIds = [12, 13, 14, 15, 16].map(
    (value) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`,
  );
  const idQueue = [...generatedIds];
  const arrayResult = rectangularArray(
    [fixture],
    { rows: 2, columns: 3, rowGap: 500, columnGap: 500 },
    () => idQueue.shift()!,
  );
  if (!arrayResult.ok) throw new Error(arrayResult.issue.message);
  await store.applyPlanEdit(arrayResult.value);
  await store.undo();
  await store.redo();
  const path = store.getState().projectPath!;
  const expected = store.getState().snapshot!;
  await store.save();
  await store.close();
  await store.open(path);
  expect(store.getState().snapshot).toEqual({ ...expected, checkpointSequence: expected.sequence });
});
```

Studio integration additionally checks direct editor entry, one-floor isolation, tree/canvas/Inspector selection, exact input, save state, and absence of 3D/route/import/export controls.

- [ ] **Step 2: Update policy tests to describe M1 truthfully**

`visible-actions.test.mjs` must require every visible M1 tool to have a handler and continue forbidding deferred labels. `workspace-structure.test.mjs` must require real plan-engine/render packages rather than `.gitkeep` placeholders. `project-format-policy.test.mjs` must assert schema v2 and relative assets. Offline-source policy continues scanning all new runtime files and must still return zero remote URLs.

- [ ] **Step 3: Run the focused integration and policy tests**

```powershell
pnpm.cmd vitest run packages/core-model/src/core-model.test.ts packages/plan-engine/src packages/project-store/src/project-store.test.ts packages/project-store/src/plan-commands.test.ts packages/render-plan-2d/src apps/studio/src/backend/tauri-backend.test.ts apps/studio/src/features/plan-editor
node --test tests/workspace-structure.test.mjs tests/visible-actions.test.mjs tests/project-format-policy.test.mjs tests/offline-source-policy.test.mjs
```

Expected: all selected Vitest files and all four Node policy suites pass.

- [ ] **Step 4: Run complete affected TypeScript and Rust verification**

```powershell
pnpm.cmd exec tsc -p packages/core-model/tsconfig.json --noEmit
pnpm.cmd exec tsc -p packages/plan-engine/tsconfig.json --noEmit
pnpm.cmd exec tsc -p packages/project-store/tsconfig.json --noEmit
pnpm.cmd exec tsc -p packages/render-plan-2d/tsconfig.json --noEmit
pnpm.cmd exec tsc -p packages/editor-shell/tsconfig.json --noEmit
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
cargo test -p project-io
cargo test -p desktop-host
cargo check -p project-io -p desktop-host
```

Expected: all six type checks exit `0`; all Rust unit/integration/doc tests pass; Cargo check exits `0`.

- [ ] **Step 5: Update architecture, format, product, roadmap, decisions, and README**

Document the implemented dependency graph, schema v2 migration, generic entity patch journal, mm/radian coordinate contract, five render layers, one active floor, six editable entities, exact M1 exclusions, PixiJS 8.19.0 notice, and allowed verification boundary. Remove statements that call M1 future work or describe the M0 overview as the current editor.

- [ ] **Step 6: Write the evidence-based M1 report**

`M1_REPORT.md` must list:

- completed capabilities;
- explicitly deferred M2/M3 capabilities;
- every command actually run and its result;
- skipped build/dev/debug/browser/Playwright/package/screenshot validation required by project rules;
- known limitations, including no real-browser/GPU evidence and M5 performance profiling deferral;
- next milestone M2.

- [ ] **Step 7: Check the final diff and commit Task 12**

```powershell
git diff --check
git status --short
git add -- aethertwin/apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx aethertwin/apps/studio/src/features/plan-editor/plan-editor.test-support.tsx aethertwin/packages/project-store/src/project-store.test.ts aethertwin/apps/studio/src/backend/tauri-backend.test.ts aethertwin/tests aethertwin/docs aethertwin/README.md
git commit -m "docs: complete AetherTwin M1 evidence"
```

Expected: diff check prints nothing; status before staging lists only Task 12 paths; commit succeeds.

---

## Plan self-review coverage

- Architecture/package boundaries: Tasks 1–3, 6, 8–11.
- Full schema v2 and contract-only records: Task 1.
- Deterministic v1 migration and native atomic upgrade: Task 2.
- Coordinates, units, transforms, bounds, selection, and index: Tasks 3–4.
- Snapping, guides, dimensions, zoom-invariant tolerance, and offset placement: Tasks 5 and 9.
- All six entity creation gestures, selection/box selection, transforms, copy/paste, and deletion: Tasks 4, 7, 9, and 11.
- Durable create/delete/transform, no-cascade reference rejection, and exact undo/redo: Tasks 6–7.
- Copy, arrays, align, and distribute: Tasks 7, 9, and 10.
- Layer and object fields, lock behavior, and exact unit/angle input: Tasks 6, 10, and 11.
- PixiJS five-layer rendering, culling, and disposal: Tasks 8 and 11.
- Direct Studio editor, active floor, tree, Inspector, and no fake features: Tasks 9–11.
- Failure non-publication and save/reopen equality: Tasks 2, 6, and 12.
- Offline, policy, native, type, and report evidence: Task 12.

The plan intentionally contains no 3D preview, background import, door/window UI, room closure, booth numbering, vendor CSV, routes, search, themes, Player, or export implementation. Those remain owned by later milestone specs.
