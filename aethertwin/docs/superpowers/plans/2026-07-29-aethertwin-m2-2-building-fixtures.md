# AetherTwin M2.2 Building and Fixtures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver durable wall-bound doors and windows, deterministic closed-room recognition with explicit confirmation, and a seven-kind showroom fixture catalogue while preserving schema-v3 and legacy fixture compatibility.

**Architecture:** `core-model` remains the schema and durable-geometry authority; a shared JSON vector suite keeps TypeScript and Rust opening validation identical; `project-store` and `project-io` add one atomic `building.structure.patch` journal operation for wall/opening repairs; `plan-engine` owns projections, hit tests, topology normalization, face extraction, fingerprints, and room intents; `mode-showroom` owns immutable catalogue and tool policy; `render-plan-2d` owns visual projections only; Studio owns transient tools, previews, candidates, selection, confirmation, and accessible controls.

**Tech Stack:** Node.js 24, pnpm 11, React 19, TypeScript 6, Vitest 4, Testing Library, Zustand 5, PixiJS 8.19.0, Tauri 2.11, Rust 1.94, serde, and the existing Aether design system.

## Global Constraints

- Implement the approved specification `docs/superpowers/specs/2026-07-22-aethertwin-m2-2-building-fixtures-design.md`; do not expand into M2.3 content/tour work, M2.4 3D projection, export, or publishing.
- Keep `CURRENT_SCHEMA_VERSION` exactly `3`. Add no migration and do not rewrite a project merely because an old fixture lacks `spatial3D`.
- Continue accepting missing `spatial3D` on every legacy fixture kind. Every newly catalogue-created standard fixture must persist a finite positive vertical height.
- Keep profiles exactly `'showroom' | 'market'`. The showroom catalogue exposes seven standard kinds; Market retains the existing `generic` drag-rectangle workflow.
- Millimetres are the durable plan unit, angles are radians, room footprints are world-space counter-clockwise rings, and confirmed rooms use identity transforms.
- Opening geometry uses transformed wall centre-lines, `GEOMETRY_EPSILON_MM = 1e-7`, endpoint clearance `max(1 mm, effectiveThickness / 2)`, a minimum same-wall opening gap of `1 mm`, and the approved effective-thickness formula.
- Default door is `900 × 2100 mm`, sill `0`; default window is `1200 × 1200 mm`, sill `900`.
- Room recognition is deterministic, uses the user tolerance in `[0.1, 100] mm` with default `5`, rejects positive collinear overlap, discards faces smaller than `250_000 mm²`, and fails without partial results after `2_000_000` candidate-pair comparisons.
- `building.structure.patch` contains exactly `reason`, `wallChanges`, and `openingChanges`; it validates only the final snapshot, reverses exact before/index state, and does not add a Tauri invoke command.
- The native invoke allowlist remains exactly eight commands.
- Work from `E:\数字孪生\.worktrees\aethertwin-m2\aethertwin`; run Git commands from `E:\数字孪生\.worktrees\aethertwin-m2`.
- Preserve the pre-existing EOL-only modifications in `crates/asset-io/Cargo.toml` and `crates/desktop-host/Cargo.toml`. Never edit, restore, stage, or commit them.
- Every test, lint, TypeScript check, Rust test, or `cargo check` below is an execution-time approval gate. Run it only after the user explicitly approves that command class.
- Do not run build, dev, debug, browser, Playwright, packaged-runtime, or screenshot commands unless separately authorized.
- Each task stages only the files listed for that task and ends with one focused commit after approved checks pass.
- At every task boundary run the read-only checks `git diff --check`, `git status --short`, and inspect the staged diff before committing.

---

## File and responsibility map

### Durable contracts and validation

- `fixtures/contracts/opening-geometry.v1.json` — language-neutral valid/invalid opening vectors.
- `packages/core-model/src/opening-geometry.ts` — transformed wall metrics, effective thickness, opening location, deterministic geometry issues.
- `packages/core-model/src/validation.ts` — final snapshot validation that invokes opening geometry validation.
- `crates/project-io/src/model.rs` — Rust schema-v3 parsing and matching opening geometry validation.
- `packages/project-store/src/building-structure-command.ts` — typed compound wall/opening patch and inverse.
- `crates/project-io/src/project.rs` — native replay, inverse verification, commit, and recovery for the compound command.
- `crates/desktop-host/src/dto.rs` — exact camel-case DTO shape whitelist at the native boundary.

### Pure plan and mode logic

- `packages/plan-engine/src/openings.ts` — opening placement, projection, and hit testing.
- `packages/plan-engine/src/room-topology.ts` — segment splitting, crossings, T-junctions, clustering, overlap rejection, and complexity cap.
- `packages/plan-engine/src/rooms.ts` — half-edge faces, canonical rings, deterministic candidates, fingerprints, and room intents.
- `packages/mode-showroom/src/catalogue.ts` — seven deeply frozen fixture descriptors and normalized primitive parts.
- `packages/mode-showroom/src/tool-policy.ts` — stable showroom action IDs and ordered groups.

### Rendering and Studio

- `packages/render-plan-2d/src/scene-projection.ts` and `pixi-plan-renderer.ts` — door/window symbols, room candidate overlays, fixture-kind style tokens.
- `apps/studio/src/features/plan-editor/editor-session.ts` — transient opening preview, room results/fingerprint, and selected fixture kind.
- `apps/studio/src/features/plan-editor/interaction-controller.ts` — pointer/keyboard state machines and last-moment snapshot rereads.
- `apps/studio/src/features/plan-editor/plan-toolbar.tsx` — mapping from showroom policy action IDs to Studio actions.
- `apps/studio/src/features/plan-editor/opening-inspector.tsx` — atomic opening editing and delete.
- `apps/studio/src/features/plan-editor/room-recognition-panel.tsx` — tolerance, diagnostics, confirm one/all, and explicit replacement.
- `apps/studio/src/features/plan-editor/fixture-catalogue.tsx` — seven accessible catalogue choices and dimensions.
- `apps/studio/src/features/plan-editor/plan-inspector.tsx` — fixture width/depth/vertical-height compatibility behavior.
- `apps/studio/src/features/plan-editor/plan-accessibility.tsx` — equivalent opening, candidate, and fixture operations for keyboard/screen-reader users.

---

### Task 1: Establish the TypeScript opening-geometry contract

**Files:**
- Create: `fixtures/contracts/opening-geometry.v1.json`
- Create: `packages/core-model/src/opening-geometry.ts`
- Create: `packages/core-model/src/opening-geometry.test.ts`
- Modify: `packages/core-model/src/validation.ts`
- Modify: `packages/core-model/src/index.ts`
- Modify: `packages/core-model/src/core-model.test.ts`

**Interfaces:**

```ts
export const GEOMETRY_EPSILON_MM = 1e-7;

export interface WallMetricSegment {
  readonly segmentIndex: number;
  readonly start: Point2;
  readonly end: Point2;
  readonly length: number;
  readonly cumulativeStart: number;
  readonly cumulativeEnd: number;
}

export type OpeningGeometryIssueCode =
  | "OPENING_WALL_NOT_FOUND"
  | "OPENING_WALL_GEOMETRY_INVALID"
  | "OPENING_SPAN_CROSSES_JOINT"
  | "OPENING_ENDPOINT_CLEARANCE"
  | "OPENING_OVERLAP"
  | "OPENING_HEIGHT_EXCEEDED"
  | "OPENING_DOOR_SILL_NONZERO"
  | "OPENING_TARGET_LOCKED";

export function wallMetricSegments(wall: Wall): readonly WallMetricSegment[];
export function effectiveWallThickness(wall: Wall): number;
export function locateOpening(wall: Wall, opening: Opening): OpeningProjection | undefined;
export function validateOpeningGeometry(
  walls: readonly Wall[],
  openings: readonly Opening[],
): readonly OpeningGeometryIssue[];
```

**Implementation rules:**

```ts
const tangentScale = Math.hypot(dx * sx, dy * sy) / sourceLength;
const normalScale = (sx * sy) / tangentScale;
const effectiveThickness = wall.thickness * normalScale;
```

- Apply scale, then rotation, then translation to centre-line points.
- Ignore zero-length transformed segments when building cumulative distance.
- An opening interval must fit one nonzero segment; it cannot bridge a vertex.
- Door sill must equal zero. Window top is `sillHeight + height`.
- Use explicit wall height when present, otherwise `3000`.
- Sort returned issues by opening ID then code; no validation depends on collection order.
- Do not require `spatial3D` for any fixture kind.

- [ ] **Step 1: Add failing vectors and TypeScript tests**

The JSON vectors must cover identity, rotation/translation, uniform and non-uniform scale, multi-segment walls, vertex crossing, zero-length segments, endpoint clearance, exact `1 mm` gap, overlap, default/explicit wall height, door sill, window top, missing wall, and epsilon boundaries. Each case contains a complete wall/opening input and either a projection or exact ordered issue codes.

- [ ] **Step 2: With approval, run RED**

```powershell
pnpm.cmd vitest run packages/core-model/src/opening-geometry.test.ts packages/core-model/src/core-model.test.ts
```

Expected: new tests fail because the exports and final geometry validation do not exist; existing schema-v3 tests still pass.

- [ ] **Step 3: Implement pure metrics and final snapshot validation**

Keep vector parsing in the test, not production. Add a single call from schema-v3 snapshot validation after references/types are parsed so geometry sees the complete final wall/opening sets.

- [ ] **Step 4: With approval, run GREEN and typecheck**

```powershell
pnpm.cmd vitest run packages/core-model/src/opening-geometry.test.ts packages/core-model/src/core-model.test.ts
pnpm.cmd exec tsc -p packages/core-model/tsconfig.json --noEmit
```

Expected: all focused tests and the core-model typecheck pass; the legacy v2 display-case fixture without `spatial3D` remains accepted and byte-equivalent after v2→v3 migration.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/fixtures/contracts/opening-geometry.v1.json aethertwin/packages/core-model/src/opening-geometry.ts aethertwin/packages/core-model/src/opening-geometry.test.ts aethertwin/packages/core-model/src/validation.ts aethertwin/packages/core-model/src/index.ts aethertwin/packages/core-model/src/core-model.test.ts
git commit -m "feat: validate wall-bound opening geometry"
```

**Acceptance:** Identical inputs always return identical projections/issues; all approved geometry invariants are enforced during `parseSnapshot`; legacy fixture height compatibility is unchanged.

**Failure inspection:** `packages/core-model/src/geometry.ts` transform order, `spatial-entities.ts` wall types, and numeric/path helpers in `validation-primitives.ts`.

**Risk and rollback:** The risk is rejecting existing coherent v3 files through overly strict epsilon handling. Revert this task's commit; do not loosen schema-v3 fixture compatibility or change schema version.

---

### Task 2: Match opening validation in Rust

**Files:**
- Modify: `crates/project-io/src/model.rs`
- Create: `crates/project-io/tests/opening_geometry.rs`
- Modify: `crates/project-io/tests/contract_fixture.rs`

**Interfaces:**

```rust
const GEOMETRY_EPSILON_MM: f64 = 1e-7;

fn validate_opening_geometry(
    walls: &[Wall],
    openings: &[Opening],
) -> Result<(), ModelError>;
```

- [ ] **Step 1: Add a Rust harness for the shared JSON vectors**

Load `../../../fixtures/contracts/opening-geometry.v1.json`; deserialize with strict test-only vector structs. Assert the same projection values within `1e-7` and exact issue-code ordering.

- [ ] **Step 2: With approval, run RED**

```powershell
cargo test -p project-io --test opening_geometry
```

Expected: compilation or assertions fail because Rust does not implement the shared geometry contract.

- [ ] **Step 3: Implement parity in the real schema-v3 parser**

Mirror the TypeScript transform order, cumulative nonzero segment handling, effective-thickness formula, finite-number guards, wall-height fallback, gap/clearance rules, and issue ordering. Convert any issue into the existing invalid-project error category without exposing filesystem details.

- [ ] **Step 4: With approval, run focused Rust verification**

```powershell
cargo test -p project-io --test opening_geometry
cargo test -p project-io --test contract_fixture
cargo check -p project-io
```

Expected: shared vectors, contract fixture, and crate check pass; the existing legacy missing-height fixture is accepted.

- [ ] **Step 5: Inspect and commit**

```powershell
cargo fmt --all -- --check
git diff --check
git add -- aethertwin/crates/project-io/src/model.rs aethertwin/crates/project-io/tests/opening_geometry.rs aethertwin/crates/project-io/tests/contract_fixture.rs
git commit -m "feat: enforce opening geometry in project io"
```

**Acceptance:** TypeScript and Rust consume one vector file and agree on all valid projections and invalid codes.

**Failure inspection:** serde field names for `Wall`, `Opening`, `Transform2D`; model validation ordering; floating-point comparison helpers.

**Risk and rollback:** Cross-language floating-point drift near thresholds. Roll back the Rust commit and correct vectors/algorithms together; never introduce Rust-only tolerances.

---

### Task 3: Add the TypeScript compound building command

**Files:**
- Create: `packages/project-store/src/building-structure-command.ts`
- Create: `packages/project-store/src/building-structure-command.test.ts`
- Modify: `packages/project-store/src/project-store.ts`
- Modify: `packages/project-store/src/project-store.test.ts`
- Modify: `packages/project-store/src/index.ts`

**Interfaces:**

```ts
export interface BuildingWallChange {
  readonly id: string;
  readonly before: Wall | null;
  readonly after: Wall | null;
  readonly index?: number;
}

export interface BuildingStructurePatch {
  readonly reason: PlanEditReason;
  readonly wallChanges: readonly BuildingWallChange[];
  readonly openingChanges: readonly SnapshotRecordChange<Opening>[];
}

export function patchBuildingStructureCommand(
  patch: BuildingStructurePatch,
): ProjectCommand;

class ProjectStore {
  applyBuildingStructurePatch(patch: BuildingStructurePatch): Promise<void>;
}
```

- [ ] **Step 1: Add RED tests for exact atomic behavior**

Test add/update/remove, normalized insertion indices, duplicate IDs, wrong entity/record types, exact before mismatch, malformed extra fields, empty change sets, final-state-only validation, inverse construction, undo/redo, backend failure, and queue serialization. Prove that deleting a wall and its openings succeeds as one patch although applying the wall removal alone would fail.

- [ ] **Step 2: With approval, run RED**

```powershell
pnpm.cmd vitest run packages/project-store/src/building-structure-command.test.ts packages/project-store/src/project-store.test.ts
```

Expected: failures are limited to missing command/API behavior.

- [ ] **Step 3: Implement the command**

Build candidate arrays without parsing intermediate snapshots. Apply all wall changes and opening changes to one immutable candidate, call `parseSnapshot` exactly once on the final state, compute an exact reverse patch from captured before records/indices, and publish the parsed snapshot only after backend commit succeeds.

- [ ] **Step 4: With approval, run GREEN and typecheck**

```powershell
pnpm.cmd vitest run packages/project-store/src/building-structure-command.test.ts packages/project-store/src/project-store.test.ts
pnpm.cmd exec tsc -p packages/project-store/tsconfig.json --noEmit
```

Expected: focused tests and typecheck pass; a failed patch leaves snapshot, history, dirty state, and sequence unchanged.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/packages/project-store/src/building-structure-command.ts aethertwin/packages/project-store/src/building-structure-command.test.ts aethertwin/packages/project-store/src/project-store.ts aethertwin/packages/project-store/src/project-store.test.ts aethertwin/packages/project-store/src/index.ts
git commit -m "feat: patch building structure atomically"
```

**Acceptance:** One command can transition between two valid snapshots even when neither wall nor opening subset can be committed independently.

**Failure inspection:** `snapshot-records-command.ts`, `plan-commands.ts`, CommandBus transaction ordering, and ProjectStore backend rollback tests.

**Risk and rollback:** An inverse/index bug could corrupt undo order. Revert this task; do not compose the two existing commands as a substitute.

---

### Task 4: Replay and recover compound building patches natively

**Files:**
- Modify: `crates/project-io/src/project.rs`
- Modify: `crates/project-io/src/model.rs`
- Modify: `crates/project-io/tests/commit_recovery.rs`
- Modify: `crates/project-io/tests/schema_v3_recovery.rs`
- Modify: `crates/desktop-host/src/dto.rs`
- Modify: `crates/desktop-host/tests/command_contract.rs`

**Interfaces:**

```rust
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BuildingStructurePatch {
    reason: PlanEditReason,
    wall_changes: Vec<BuildingWallChange>,
    opening_changes: Vec<OpeningRecordChange>,
}
```

- [ ] **Step 1: Add native RED tests**

Cover strict payload/inverse shape, allowed reasons, wrong wall/opening types, duplicate target IDs, bad indices, before mismatch, partial repair rejection, malicious extra fields, forward/inverse disagreement, replay, checkpoint recovery, truncation recovery, and exact reverse order. Extend the command contract assertion to prove the invoke surface remains eight.

- [ ] **Step 2: With approval, run RED**

```powershell
cargo test -p project-io --test commit_recovery
cargo test -p project-io --test schema_v3_recovery
cargo test -p desktop-host --test command_contract
```

Expected: only new `building.structure.patch` cases fail.

- [ ] **Step 3: Implement strict native parsing and final-state replay**

Parse command and inverse into typed DTOs. Apply both collections to a candidate in memory, validate once with the real v3 model, verify inverse is the exact reversal, then publish. Use the existing atomic checkpoint and recovery path; add no side channel and no native invoke.

- [ ] **Step 4: With approval, run GREEN and checks**

```powershell
cargo test -p project-io --test commit_recovery
cargo test -p project-io --test schema_v3_recovery
cargo test -p desktop-host --test command_contract
cargo check -p project-io
cargo check -p desktop-host
```

Expected: all focused tests/checks pass and `command_contract` reports exactly eight commands.

- [ ] **Step 5: Inspect and commit**

```powershell
cargo fmt --all -- --check
git diff --check
git add -- aethertwin/crates/project-io/src/project.rs aethertwin/crates/project-io/src/model.rs aethertwin/crates/project-io/tests/commit_recovery.rs aethertwin/crates/project-io/tests/schema_v3_recovery.rs aethertwin/crates/desktop-host/src/dto.rs aethertwin/crates/desktop-host/tests/command_contract.rs
git commit -m "feat: recover compound building patches"
```

**Acceptance:** Native replay and recovery accept the same valid final transition as TypeScript, reject partial/malicious patches, and keep the public invoke surface unchanged.

**Failure inspection:** `apply_operation`, `entity_patch`, `exact_entity_inverse`, snapshot-record patch parsing, and DTO exact-shape helpers.

**Risk and rollback:** Recovery compatibility is highest risk. Revert this commit together with Task 3 if already used in persisted journals; never silently skip an unknown operation.

---

### Task 5: Create the pure showroom catalogue and tool policy

**Files:**
- Delete if present: `packages/mode-showroom/.gitkeep`
- Create: `packages/mode-showroom/package.json`
- Create: `packages/mode-showroom/tsconfig.json`
- Create: `packages/mode-showroom/src/catalogue.ts`
- Create: `packages/mode-showroom/src/tool-policy.ts`
- Create: `packages/mode-showroom/src/index.ts`
- Create: `packages/mode-showroom/src/catalogue.test.ts`
- Create: `packages/mode-showroom/src/tool-policy.test.ts`

**Interfaces:**

```ts
export type ShowroomFixtureKind = Exclude<FixtureKind, "generic">;
export interface FixturePrimitivePart { /* exact approved box contract */ }
export interface ShowroomFixtureDescriptor { /* exact approved descriptor contract */ }
export const SHOWROOM_FIXTURE_CATALOGUE: readonly ShowroomFixtureDescriptor[];
export function showroomFixture(kind: ShowroomFixtureKind): ShowroomFixtureDescriptor;
export const SHOWROOM_TOOL_GROUPS: readonly ToolGroupDescriptor[];
```

**Exact catalogue order and defaults:**

| Kind | Label/defaultName | Width | Depth | Height |
| --- | --- | ---: | ---: | ---: |
| `display-case` | 展示柜 | 1200 | 600 | 1200 |
| `display-table` | 展示桌 | 1500 | 750 | 900 |
| `shelf` | 货架 | 1000 | 400 | 2000 |
| `checkout` | 收银台 | 1600 | 700 | 1000 |
| `screen` | 屏幕 | 1200 | 100 | 1800 |
| `partition` | 隔断 | 1200 | 100 | 2400 |
| `signage` | 标牌 | 600 | 100 | 1800 |

**Exact normalized parts:**

```ts
{
  "display-case": [
    ["base", [.5,.5,.05], [1,1,.1]],
    ["case", [.5,.5,.5], [.9,.9,.8]],
    ["top", [.5,.5,.95], [1,1,.1]],
  ],
  "display-table": [
    ["top", [.5,.5,.9], [1,1,.2]],
    ["leg-fl", [.08,.08,.4], [.08,.08,.8]],
    ["leg-fr", [.92,.08,.4], [.08,.08,.8]],
    ["leg-rl", [.08,.92,.4], [.08,.08,.8]],
    ["leg-rr", [.92,.92,.4], [.08,.08,.8]],
  ],
  "shelf": [
    ["back", [.5,.95,.5], [1,.1,1]],
    ["side-left", [.025,.5,.5], [.05,.9,1]],
    ["side-right", [.975,.5,.5], [.05,.9,1]],
    ["shelf-0", [.5,.5,.025], [.9,.9,.05]],
    ["shelf-1", [.5,.5,.35], [.9,.9,.05]],
    ["shelf-2", [.5,.5,.65], [.9,.9,.05]],
    ["shelf-3", [.5,.5,.975], [.9,.9,.05]],
  ],
  "checkout": [
    ["body", [.5,.5,.45], [1,1,.9]],
    ["top", [.5,.5,.95], [1,1,.1]],
  ],
  "screen": [
    ["base", [.5,.5,.03], [.6,1,.06]],
    ["post", [.5,.5,.33], [.08,.3,.6]],
    ["display", [.5,.5,.8], [1,.2,.4]],
  ],
  "partition": [["panel", [.5,.5,.5], [1,1,1]]],
  "signage": [
    ["base", [.5,.5,.03], [.7,1,.06]],
    ["post", [.5,.5,.35], [.08,.3,.64]],
    ["board", [.5,.5,.82], [1,.2,.36]],
  ],
}
```

- [ ] **Step 1: Add RED tests for exact data and dependency purity**

Assert exact order/labels/dimensions/parts, unique non-generic kinds, unique part keys, finite positive box sizes, normalized unit-cube bounds, recursive freezing, lookup rejection, and exact tool groups:

- Select: Select, Pan
- Building: Boundary, Wall, Door, Window, Zone, Room, Recognize Rooms
- Fixtures: Fixture Catalogue
- Markers: POI, Dimension

- [ ] **Step 2: With approval, run RED**

```powershell
pnpm.cmd vitest run packages/mode-showroom/src/catalogue.test.ts packages/mode-showroom/src/tool-policy.test.ts
```

Expected: package/exports are missing.

- [ ] **Step 3: Implement the dependency-light package**

Depend only on `@aethertwin/core-model`. Deep-freeze nested centres, sizes, parts, descriptors, catalogue, actions, and groups. Do not import React, Pixi, Tauri, ProjectStore, or Studio.

- [ ] **Step 4: With approval, run GREEN and typecheck**

```powershell
pnpm.cmd vitest run packages/mode-showroom/src/catalogue.test.ts packages/mode-showroom/src/tool-policy.test.ts
pnpm.cmd exec tsc -p packages/mode-showroom/tsconfig.json --noEmit
```

Expected: exact catalogue/tool tests and package typecheck pass.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/packages/mode-showroom
git commit -m "feat: define showroom fixture catalogue"
```

**Acceptance:** Consumers receive immutable exact descriptors and stable action IDs; `generic` cannot enter the catalogue.

**Failure inspection:** pnpm workspace package discovery and other `packages/*/package.json` conventions.

**Risk and rollback:** Accidental UI dependency would invert architecture. Revert the task and keep the package pure.

---

### Task 6: Implement opening placement and hit testing in plan-engine

**Files:**
- Create: `packages/plan-engine/src/openings.ts`
- Create: `packages/plan-engine/src/openings.test.ts`
- Modify: `packages/plan-engine/src/index.ts`

**Interfaces:**

```ts
export interface OpeningPlacementCandidate {
  readonly wallId: string;
  readonly distanceAlongWall: number;
  readonly worldCenter: Point2;
  readonly tangent: Point2;
  readonly effectiveThickness: number;
  readonly valid: boolean;
  readonly issue?: OpeningGeometryIssue;
}

export function nearestOpeningPlacement(input: {
  point: Point2;
  walls: readonly Wall[];
  width: number;
  height: number;
  sillHeight: number;
  kind: Opening["kind"];
  hitToleranceWorld: number;
}): OpeningPlacementCandidate | undefined;

export function hitTestOpening(
  point: Point2,
  opening: Opening,
  wall: Wall,
  toleranceWorld: number,
): boolean;
```

- [ ] **Step 1: Add RED tests**

Cover eligible transformed segments, 8-pixel-to-world caller tolerance, half-thickness inclusion, invalid preview retention, deterministic ties by distance then wall ID then segment index, opening priority data, degenerate walls, and exact boundary hits.

- [ ] **Step 2: With approval, run RED**

```powershell
pnpm.cmd vitest run packages/plan-engine/src/openings.test.ts
```

Expected: missing exports.

- [ ] **Step 3: Implement using core-model metrics**

Do not duplicate geometry validation. Project pointer to candidate wall segments, derive cumulative distance, build a temporary opening, and ask the core validator for validity/first issue.

- [ ] **Step 4: With approval, run GREEN and typecheck**

```powershell
pnpm.cmd vitest run packages/plan-engine/src/openings.test.ts
pnpm.cmd exec tsc -p packages/plan-engine/tsconfig.json --noEmit
```

Expected: focused tests and typecheck pass.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/packages/plan-engine/src/openings.ts aethertwin/packages/plan-engine/src/openings.test.ts aethertwin/packages/plan-engine/src/index.ts
git commit -m "feat: project openings onto walls"
```

**Acceptance:** Pointer input produces deterministic valid/invalid candidates with cumulative along-wall distance and consistent hit regions.

**Failure inspection:** `coordinates.ts`, `transforms.ts`, `selection.ts`, and core opening metrics.

**Risk and rollback:** Duplicate transform math can drift. Revert and route all calculations through core-model.

---

### Task 7: Render openings, fixture-kind styles, and candidate overlays

**Files:**
- Modify: `packages/render-plan-2d/src/types.ts`
- Modify: `packages/render-plan-2d/src/scene-projection.ts`
- Modify: `packages/render-plan-2d/src/scene-projection.test.ts`
- Modify: `packages/render-plan-2d/src/pixi-plan-renderer.ts`
- Modify: `packages/render-plan-2d/src/pixi-plan-renderer.test.ts`
- Modify: `packages/render-plan-2d/src/index.ts`

**Interfaces:**

```ts
export interface RenderOpeningSymbol {
  readonly key: string;
  readonly openingId: string;
  readonly kind: "door" | "window";
  readonly center: Point2;
  readonly angle: number;
  readonly width: number;
  readonly wallThickness: number;
  readonly selected: boolean;
}

export interface RenderRoomCandidate {
  readonly key: string;
  readonly ring: readonly Point2[];
  readonly represented: boolean;
  readonly selected: boolean;
}
```

- [ ] **Step 1: Add RED projection/renderer tests**

Assert stable keys, culling, selected state, door leaf/swing geometry, window double-line geometry, invalid-reference omission, room overlay ordering, fixture style lookup by all eight kinds including explicit generic fallback, and resource destruction on removal.

- [ ] **Step 2: With approval, run RED**

```powershell
pnpm.cmd vitest run packages/render-plan-2d/src/scene-projection.test.ts packages/render-plan-2d/src/pixi-plan-renderer.test.ts
```

Expected: new projection nodes and renderer layers are absent.

- [ ] **Step 3: Implement visual projections**

Keep openings as symbols over uncut wall lines; do not perform wall booleans. Candidate rooms are transient overlays and never enter snapshot records. Use Pixi primitives only; no catalogue 3D parts.

- [ ] **Step 4: With approval, run GREEN and typecheck**

```powershell
pnpm.cmd vitest run packages/render-plan-2d/src/scene-projection.test.ts packages/render-plan-2d/src/pixi-plan-renderer.test.ts
pnpm.cmd exec tsc -p packages/render-plan-2d/tsconfig.json --noEmit
```

Expected: focused renderer tests and typecheck pass with deterministic layer order.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/packages/render-plan-2d/src/types.ts aethertwin/packages/render-plan-2d/src/scene-projection.ts aethertwin/packages/render-plan-2d/src/scene-projection.test.ts aethertwin/packages/render-plan-2d/src/pixi-plan-renderer.ts aethertwin/packages/render-plan-2d/src/pixi-plan-renderer.test.ts aethertwin/packages/render-plan-2d/src/index.ts
git commit -m "feat: render building openings and room candidates"
```

**Acceptance:** Doors, windows, fixture kinds, and transient room candidates have stable, testable 2D projections without changing durable data.

**Failure inspection:** existing reference/entity layer order, Pixi destroy lifecycle, and scene culling helpers.

**Risk and rollback:** Pixi resource leaks or hit/render disagreement. Revert this presentation-only task without changing durable data.

---

### Task 8: Add Door and Window creation tools in Studio

**Files:**
- Modify: `apps/studio/package.json`
- Modify: `apps/studio/src/features/plan-editor/editor-session.ts`
- Modify: `apps/studio/src/features/plan-editor/editor-session.test.ts`
- Modify: `apps/studio/src/features/plan-editor/interaction-controller.ts`
- Modify: `apps/studio/src/features/plan-editor/interaction-controller.test.ts`
- Modify: `apps/studio/src/features/plan-editor/plan-toolbar.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.test.tsx`

**Transient state:**

```ts
type OpeningCreationTool = "door" | "window";

interface OpeningPreviewState {
  readonly sessionId: string;
  readonly tool: OpeningCreationTool;
  readonly candidate: OpeningPlacementCandidate;
  readonly width: number;
  readonly height: number;
  readonly sillHeight: number;
  readonly persistenceError?: string;
}
```

- [ ] **Step 1: Add RED session/controller/UI tests**

Assert showroom tool mapping, defaults, active-floor visible/unlocked layer and unlocked-wall filtering, 8-pixel tolerance conversion, deterministic preview, full preview text, click persistence through one `snapshot.records.patch`, selection, repeated placement, error retention, Escape to Select, focus return, floor/project/session replacement cleanup, and Market isolation.

- [ ] **Step 2: With approval, run RED**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/editor-session.test.ts apps/studio/src/features/plan-editor/interaction-controller.test.ts apps/studio/src/features/plan-editor/plan-editor.test.tsx
```

Expected: Door/Window actions, preview state, and persistence flow are missing.

- [ ] **Step 3: Implement creation only**

Map `mode-showroom` stable action IDs in Studio. At pointer move calculate preview from the current snapshot. At pointer-up reread snapshot and eligible walls, recalculate, then commit one Opening record. Generate ID/name only after a valid final candidate is known.

- [ ] **Step 4: With approval, run GREEN and Studio typecheck**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/editor-session.test.ts apps/studio/src/features/plan-editor/interaction-controller.test.ts apps/studio/src/features/plan-editor/plan-editor.test.tsx
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
```

Expected: focused tests and typecheck pass; failure never changes tool, selection, or durable snapshot.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/apps/studio/package.json aethertwin/apps/studio/src/features/plan-editor/editor-session.ts aethertwin/apps/studio/src/features/plan-editor/editor-session.test.ts aethertwin/apps/studio/src/features/plan-editor/interaction-controller.ts aethertwin/apps/studio/src/features/plan-editor/interaction-controller.test.ts aethertwin/apps/studio/src/features/plan-editor/plan-toolbar.tsx aethertwin/apps/studio/src/features/plan-editor/plan-editor.tsx aethertwin/apps/studio/src/features/plan-editor/plan-editor.test.tsx
git commit -m "feat: create doors and windows on walls"
```

**Acceptance:** A showroom user can repeatedly create valid doors/windows on eligible walls; all failure and Escape semantics match the specification.

**Failure inspection:** `activeContext` creation-layer selection, session identity guards, pointer coordinate conversion, and snapshot-record patch API.

**Risk and rollback:** Late async completion writing into a replaced project. Revert the task if session-token tests fail; never merely disable the cleanup test.

---

### Task 9: Select, edit, move, and delete openings atomically

**Files:**
- Create: `apps/studio/src/features/plan-editor/opening-inspector.tsx`
- Create: `apps/studio/src/features/plan-editor/opening-inspector.test.tsx`
- Modify: `apps/studio/src/features/plan-editor/interaction-controller.ts`
- Modify: `apps/studio/src/features/plan-editor/interaction-controller.test.ts`
- Modify: `apps/studio/src/features/plan-editor/plan-canvas.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-canvas.test.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-inspector.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-accessibility.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.test.tsx`

- [ ] **Step 1: Add RED interaction and Inspector tests**

Cover opening-before-wall hit priority, shared global `selectedIds`, drag constrained to supporting wall, invalid drag rejection, one-form atomic name/kind/dimension/distance update, Door sill forced to zero in the submitted record, supporting wall read-only display, record delete, wall delete with attached openings through `building.structure.patch`, invalid wall reshape rejection with affected opening IDs, keyboard selection/delete, and accessible fields/actions.

- [ ] **Step 2: With approval, run RED**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/opening-inspector.test.tsx apps/studio/src/features/plan-editor/interaction-controller.test.ts apps/studio/src/features/plan-editor/plan-canvas.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx
```

Expected: opening selection/editor paths are absent.

- [ ] **Step 3: Implement durable edit paths**

Opening-only mutations use one `snapshot.records.patch`. Wall deletion/repair uses one `building.structure.patch`. Translation/rotation that keeps the final snapshot valid may stay on `plan.entities.patch`. Never commit an intermediate invalid snapshot.

- [ ] **Step 4: With approval, run GREEN and typecheck**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/opening-inspector.test.tsx apps/studio/src/features/plan-editor/interaction-controller.test.ts apps/studio/src/features/plan-editor/plan-canvas.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
```

Expected: focused tests/typecheck pass; canvas and accessible mirror update one selection source.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/apps/studio/src/features/plan-editor/opening-inspector.tsx aethertwin/apps/studio/src/features/plan-editor/opening-inspector.test.tsx aethertwin/apps/studio/src/features/plan-editor/interaction-controller.ts aethertwin/apps/studio/src/features/plan-editor/interaction-controller.test.ts aethertwin/apps/studio/src/features/plan-editor/plan-canvas.tsx aethertwin/apps/studio/src/features/plan-editor/plan-canvas.test.tsx aethertwin/apps/studio/src/features/plan-editor/plan-inspector.tsx aethertwin/apps/studio/src/features/plan-editor/plan-accessibility.tsx aethertwin/apps/studio/src/features/plan-editor/plan-editor.test.tsx
git commit -m "feat: edit wall openings in studio"
```

**Acceptance:** Openings are first-class selectable records with reversible edits; attached-opening wall mutations are atomic and invalid reshapes fail with actionable IDs.

**Failure inspection:** selection precedence, ProjectStore mutation routing, lock/editability guards, and accessible roving-tab behavior.

**Risk and rollback:** Wall delete could orphan openings. Revert the Studio commit; keep core/native validation active so corrupt snapshots remain impossible.

---

### Task 10: Normalize wall topology for room recognition

**Files:**
- Create: `packages/plan-engine/src/room-topology.ts`
- Create: `packages/plan-engine/src/room-topology.test.ts`
- Modify: `packages/plan-engine/src/index.ts`

**Interfaces:**

```ts
export type RoomTopologyIssueCode =
  | "COLLINEAR_WALL_OVERLAP"
  | "TOPOLOGY_COMPLEXITY_LIMIT";

export interface NormalizedRoomTopology {
  readonly vertices: readonly Point2[];
  readonly edges: readonly {
    readonly a: number;
    readonly b: number;
    readonly wallIds: readonly string[];
  }[];
  readonly diagnostics: readonly RoomTopologyDiagnostic[];
}

export function normalizeWallTopology(input: {
  walls: readonly Wall[];
  toleranceMm: number;
  maxPairComparisons?: number;
}): Result<NormalizedRoomTopology, RoomTopologyFailure>;
```

- [ ] **Step 1: Add RED topology tests**

Cover transformed polylines, nonzero-segment extraction, deterministic bounding-box broad phase, crossings, endpoint-on-segment T-junctions, multiple intersections on one segment, tolerance clustering independent of input order, representative selection, zero-length removal, exact duplicate-edge merge with sorted contributing wall IDs, positive collinear overlap fatality, allowed shared endpoints, invalid tolerance, and exactly-at/over `2_000_000` comparison behavior.

- [ ] **Step 2: With approval, run RED**

```powershell
pnpm.cmd vitest run packages/plan-engine/src/room-topology.test.ts
```

Expected: topology module is missing.

- [ ] **Step 3: Implement the deterministic normalization pipeline**

Use bounding-box ordered pair candidates, not naive input-order pairs. Collect all split parameters before emitting edges. Cluster points with a deterministic total ordering and emit sorted vertices/edges. On overlap or cap breach return failure with no partial topology.

- [ ] **Step 4: With approval, run GREEN and typecheck**

```powershell
pnpm.cmd vitest run packages/plan-engine/src/room-topology.test.ts
pnpm.cmd exec tsc -p packages/plan-engine/tsconfig.json --noEmit
```

Expected: results are byte-identical under wall and segment permutation; all invalid cases return exact codes.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/packages/plan-engine/src/room-topology.ts aethertwin/packages/plan-engine/src/room-topology.test.ts aethertwin/packages/plan-engine/src/index.ts
git commit -m "feat: normalize wall topology for rooms"
```

**Acceptance:** The same geometric wall set always produces the same normalized graph or the same fatal diagnostic, independent of input order.

**Failure inspection:** transformed centre-line helpers, segment-intersection predicates, clustering representative/key sorting, and broad-phase counter increment.

**Risk and rollback:** This is the highest algorithmic risk. Revert the isolated task if determinism/property cases fail; do not let Studio consume partial topology.

---

### Task 11: Extract deterministic room candidates and intents

**Files:**
- Create: `packages/plan-engine/src/rooms.ts`
- Create: `packages/plan-engine/src/rooms.test.ts`
- Modify: `packages/plan-engine/src/intents.ts`
- Modify: `packages/plan-engine/src/index.ts`

**Interfaces:**

```ts
export interface RoomCandidate {
  readonly key: string;
  readonly footprint: readonly Point2[];
  readonly wallIds: readonly string[];
  readonly area: number;
  readonly perimeter: number;
}

export function recognizeClosedRooms(input: {
  walls: readonly Wall[];
  toleranceMm: number;
}): Result<readonly RoomCandidate[], RoomRecognitionFailure>;

export function roomInputFingerprint(input: RoomFingerprintInput): string;
export function roomCreationIntent(input: RoomCreationInput): PlanEditIntent;
export function roomReplacementIntent(input: RoomReplacementInput): PlanEditIntent;
```

- [ ] **Step 1: Add RED face/candidate/intent tests**

Cover half-edge angular ordering, bounded-face traversal, exterior removal, counter-clockwise normalization, canonical start vertex, unrounded ECMAScript number serialization, sorted unique wall IDs, area/perimeter, `250_000 mm²` cutoff, nested/disconnected rooms, deterministic candidate order, exact existing-room representation, one/all additions in one intent, identity transforms, first visible unlocked creation layer, no-layer error, replace preserving ID/name/tags/layer/lock while replacing footprint and resetting transform, and fingerprint relevant/irrelevant changes.

- [ ] **Step 2: With approval, run RED**

```powershell
pnpm.cmd vitest run packages/plan-engine/src/rooms.test.ts
```

Expected: face/candidate/intent exports are missing.

- [ ] **Step 3: Implement faces and intents**

Canonical ring key is transient and never used as an entity UUID. Confirm All filters represented candidates before constructing one `plan.entities.patch`. Replacement requires an unlocked editable selected room and exactly one candidate.

- [ ] **Step 4: With approval, run GREEN and typecheck**

```powershell
pnpm.cmd vitest run packages/plan-engine/src/room-topology.test.ts packages/plan-engine/src/rooms.test.ts
pnpm.cmd exec tsc -p packages/plan-engine/tsconfig.json --noEmit
```

Expected: topology and room suites/typecheck pass; candidate JSON is identical under input permutations.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/packages/plan-engine/src/rooms.ts aethertwin/packages/plan-engine/src/rooms.test.ts aethertwin/packages/plan-engine/src/intents.ts aethertwin/packages/plan-engine/src/index.ts
git commit -m "feat: recognize deterministic room candidates"
```

**Acceptance:** Valid topology yields deterministic bounded candidates, representation detection, fingerprints, and reversible creation/replacement intents.

**Failure inspection:** half-edge twin/next wiring, signed area, canonical rotation, transformed existing room rings, and creation-layer selection.

**Risk and rollback:** Exterior/nested-face mistakes can create wrong rooms. Revert and keep room recognition unavailable; never auto-confirm candidates.

---

### Task 12: Add Studio room recognition, confirmation, and replacement

**Files:**
- Create: `apps/studio/src/features/plan-editor/room-recognition-panel.tsx`
- Create: `apps/studio/src/features/plan-editor/room-recognition-panel.test.tsx`
- Modify: `apps/studio/src/features/plan-editor/editor-session.ts`
- Modify: `apps/studio/src/features/plan-editor/editor-session.test.ts`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.test.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-canvas.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-accessibility.tsx`

**Transient state:**

```ts
interface RoomRecognitionState {
  readonly toleranceMm: number;
  readonly fingerprint: string;
  readonly candidates: readonly RoomCandidate[];
  readonly selectedCandidateKey?: string;
  readonly diagnostics: readonly RoomTopologyDiagnostic[];
  readonly stale: boolean;
  readonly persistenceError?: string;
}
```

- [ ] **Step 1: Add RED panel/session/integration tests**

Cover default/range validation, active-floor visible-layer walls including locked walls, deterministic diagnostics/order, overlay selection, represented labels, relevant wall/visibility/tolerance staleness, irrelevant fixture/metadata non-staleness, immediate pre-confirm fingerprint recheck, Confirm One, Confirm All as one undo/native commit, no creation layer, failure retaining candidates, explicit replacement prerequisites/metadata preservation, floor/project/unmount cleanup, late completion rejection, keyboard operation, and Market/showroom Room tool label behavior.

- [ ] **Step 2: With approval, run RED**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/room-recognition-panel.test.tsx apps/studio/src/features/plan-editor/editor-session.test.ts apps/studio/src/features/plan-editor/plan-editor.test.tsx
```

Expected: recognition panel/session state is missing.

- [ ] **Step 3: Implement explicit preview then confirmation**

Recognition itself is read-only. Store candidates/fingerprint only in session state. Immediately before mutation reread snapshot and visibility state and recompute fingerprint. Use `applyPlanEdit` once per Confirm One/All/Replace action.

- [ ] **Step 4: With approval, run GREEN and typecheck**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/room-recognition-panel.test.tsx apps/studio/src/features/plan-editor/editor-session.test.ts apps/studio/src/features/plan-editor/plan-editor.test.tsx
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
```

Expected: focused tests/typecheck pass; stale candidates cannot commit and failed persistence keeps the overlay.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/apps/studio/src/features/plan-editor/room-recognition-panel.tsx aethertwin/apps/studio/src/features/plan-editor/room-recognition-panel.test.tsx aethertwin/apps/studio/src/features/plan-editor/editor-session.ts aethertwin/apps/studio/src/features/plan-editor/editor-session.test.ts aethertwin/apps/studio/src/features/plan-editor/plan-editor.tsx aethertwin/apps/studio/src/features/plan-editor/plan-editor.test.tsx aethertwin/apps/studio/src/features/plan-editor/plan-canvas.tsx aethertwin/apps/studio/src/features/plan-editor/plan-accessibility.tsx
git commit -m "feat: confirm recognized showroom rooms"
```

**Acceptance:** Users can inspect deterministic transient candidates, confirm one/all, and explicitly replace one room without stale or implicit writes.

**Failure inspection:** fingerprint inputs, session replacement tokens, creation-layer lookup, candidate-to-render mapping, and selected room editability.

**Risk and rollback:** Stale confirmations can commit unintended footprints. Revert Studio consumption while retaining pure engine tests; never remove the immediate fingerprint check.

---

### Task 13: Add showroom fixture catalogue placement

**Files:**
- Create: `apps/studio/src/features/plan-editor/fixture-catalogue.tsx`
- Create: `apps/studio/src/features/plan-editor/fixture-catalogue.test.tsx`
- Modify: `apps/studio/src/features/plan-editor/editor-session.ts`
- Modify: `apps/studio/src/features/plan-editor/editor-session.test.ts`
- Modify: `apps/studio/src/features/plan-editor/interaction-controller.ts`
- Modify: `apps/studio/src/features/plan-editor/interaction-controller.test.ts`
- Modify: `apps/studio/src/features/plan-editor/plan-toolbar.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.test.tsx`

**Durable creation shape:**

```ts
{
  type: "fixture",
  kind: descriptor.kind,
  size: {
    width: descriptor.defaultSize.width,
    height: descriptor.defaultSize.depth,
  },
  spatial3D: {
    elevation: 0,
    height: descriptor.defaultSize.height,
  },
}
```

- [ ] **Step 1: Add RED catalogue/session/controller tests**

Assert exactly seven buttons, exact labels and W/D/H text, `aria-pressed`, canvas focus, transient `selectedFixtureKind`, snapped zero-rotation preview, stored translation `center - (width/2, depth/2)`, pointer-up snapshot/creation-layer reread, one `plan.entities.patch`, selection, retained kind, error-retained preview/choice, Escape cleanup, project/floor/unmount cleanup, no editable layer behavior, and unchanged Market generic drag workflow.

- [ ] **Step 2: With approval, run RED**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/fixture-catalogue.test.tsx apps/studio/src/features/plan-editor/editor-session.test.ts apps/studio/src/features/plan-editor/interaction-controller.test.ts apps/studio/src/features/plan-editor/plan-editor.test.tsx
```

Expected: catalogue and click-placement behavior are missing.

- [ ] **Step 3: Implement catalogue placement**

Descriptors remain in `mode-showroom`; Studio stores only the selected kind. Re-fetch the descriptor and current creation layer on pointer-up. Persist normal Fixture data only—never descriptor parts.

- [ ] **Step 4: With approval, run GREEN and typecheck**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/fixture-catalogue.test.tsx apps/studio/src/features/plan-editor/editor-session.test.ts apps/studio/src/features/plan-editor/interaction-controller.test.ts apps/studio/src/features/plan-editor/plan-editor.test.tsx
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
```

Expected: focused tests/typecheck pass and the Market generic creation tests remain unchanged.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/apps/studio/src/features/plan-editor/fixture-catalogue.tsx aethertwin/apps/studio/src/features/plan-editor/fixture-catalogue.test.tsx aethertwin/apps/studio/src/features/plan-editor/editor-session.ts aethertwin/apps/studio/src/features/plan-editor/editor-session.test.ts aethertwin/apps/studio/src/features/plan-editor/interaction-controller.ts aethertwin/apps/studio/src/features/plan-editor/interaction-controller.test.ts aethertwin/apps/studio/src/features/plan-editor/plan-toolbar.tsx aethertwin/apps/studio/src/features/plan-editor/plan-editor.tsx aethertwin/apps/studio/src/features/plan-editor/plan-editor.test.tsx
git commit -m "feat: place showroom catalogue fixtures"
```

**Acceptance:** Showroom creates exactly seven standard kinds with explicit vertical height and centred placement; Market behavior is preserved.

**Failure inspection:** profile branching, snap result coordinates, active creation-layer selection, and session-token guards.

**Risk and rollback:** Profile leakage could remove Market's generic tool. Revert the Studio task; keep the pure catalogue package.

---

### Task 14: Complete fixture editing and legacy-height compatibility

**Files:**
- Modify: `apps/studio/src/features/plan-editor/plan-inspector.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.test.tsx`
- Modify: `apps/studio/src/features/plan-editor/plan-accessibility.tsx`
- Modify: `packages/plan-engine/src/operations.test.ts`
- Modify: `packages/project-store/src/plan-commands.test.ts`

- [ ] **Step 1: Add RED compatibility and regression tests**

Cover read-only kind; name/X/Y/rotation/layer/lock/tags; labels `width`, `depth`, `vertical height`; one atomic dimension submit; stored standard height; legacy standard default display without mutation; first Apply materializing `{elevation: 0, height: default}`; generic blank/add/clear semantics; positive finite validation; 2D resize preserving vertical height; duplicate/copy/paste/array preserving kind and `spatial3D`; all eight accessible kind/dimension labels; and generic never shown in showroom catalogue.

- [ ] **Step 2: With approval, run RED**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/plan-editor.test.tsx packages/plan-engine/src/operations.test.ts packages/project-store/src/plan-commands.test.ts
```

Expected: vertical-height UI and one or more preservation assertions fail while legacy parsing still passes.

- [ ] **Step 3: Implement explicit materialization only**

For standard legacy fixtures, derive the displayed height from `showroomFixture(kind)` without changing the snapshot. Only a successful Apply writes `spatial3D`. For generic, blank remains valid and clearing removes optional `spatial3D`. Keep `Fixture.size.height` as plan depth.

- [ ] **Step 4: With approval, run GREEN and typechecks**

```powershell
pnpm.cmd vitest run apps/studio/src/features/plan-editor/plan-editor.test.tsx packages/plan-engine/src/operations.test.ts packages/project-store/src/plan-commands.test.ts
pnpm.cmd exec tsc -p packages/plan-engine/tsconfig.json --noEmit
pnpm.cmd exec tsc -p packages/project-store/tsconfig.json --noEmit
pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
```

Expected: focused suites/typechecks pass; opening a legacy fixture performs no mutation.

- [ ] **Step 5: Inspect and commit**

```powershell
git diff --check
git add -- aethertwin/apps/studio/src/features/plan-editor/plan-inspector.tsx aethertwin/apps/studio/src/features/plan-editor/plan-editor.test.tsx aethertwin/apps/studio/src/features/plan-editor/plan-accessibility.tsx aethertwin/packages/plan-engine/src/operations.test.ts aethertwin/packages/project-store/src/plan-commands.test.ts
git commit -m "feat: edit fixture vertical dimensions"
```

**Acceptance:** Fixture dimensions are unambiguous, standard missing heights are lazily materialized only by explicit Apply, and all existing edit operations preserve kind/height.

**Failure inspection:** generic fixture validation, update intent construction, copy/array clone helpers, and form dirty-state logic.

**Risk and rollback:** Implicit mutation would violate lossless migration. Revert immediately if merely selecting/opening the Inspector changes snapshot or dirty state.

---

### Task 15: Verify cross-layer persistence, recovery, policy, and acceptance

**Files:**
- Modify: `packages/project-store/src/project-store.test.ts`
- Modify: `apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx`
- Modify: `crates/project-io/tests/schema_v3_recovery.rs`
- Modify: `crates/desktop-host/tests/command_contract.rs`
- Modify: `tests/workspace-policy.test.mjs`
- Modify: `tests/visible-copy-policy.test.mjs`
- Modify: `tests/offline-source-policy.test.mjs`
- Modify: `docs/PROJECT_FORMAT.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `../.superpowers/sdd/progress.md`

- [ ] **Step 1: Add final vertical acceptance tests**

The test project must contain at least four confirmed rooms or zones, one valid door, one valid window, all seven catalogue fixture kinds, and one legacy standard fixture without `spatial3D`. Cover create/edit/undo/redo/save/reopen/checkpoint recovery for openings, compound wall deletion, confirmed rooms, catalogue fixtures, and legacy non-mutation. Assert exact eight native commands, no forbidden package dependencies, visible-copy policy, and offline-source policy.

- [ ] **Step 2: With approval, run the focused final regression set**

```powershell
pnpm.cmd vitest run packages/core-model/src/opening-geometry.test.ts packages/project-store/src/building-structure-command.test.ts packages/plan-engine/src/openings.test.ts packages/plan-engine/src/room-topology.test.ts packages/plan-engine/src/rooms.test.ts packages/mode-showroom/src/catalogue.test.ts packages/mode-showroom/src/tool-policy.test.ts packages/render-plan-2d/src/scene-projection.test.ts packages/render-plan-2d/src/pixi-plan-renderer.test.ts apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx
node --test tests/workspace-policy.test.mjs tests/visible-copy-policy.test.mjs tests/offline-source-policy.test.mjs
cargo test -p project-io --test opening_geometry
cargo test -p project-io --test schema_v3_recovery
cargo test -p desktop-host --test command_contract
```

Expected: all M2.2 vertical and policy tests pass; command surface equals eight; no test rewrites the legacy missing-height fixture.

- [ ] **Step 3: Document exact durable semantics**

Update project format with Opening geometry and `building.structure.patch`; update architecture with package ownership, transient room candidates/fingerprints, catalogue boundary, and final-state-only compound validation. Record M2.2 completion/test evidence in the recovery ledger, not `AGENTS.md`.

- [ ] **Step 4: With approval, run full non-build verification**

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

Expected: lint, recursive typecheck, Node/Vitest tests, rustfmt, Rust tests, and checks all pass. This plan does not authorize `pnpm build`, dev/debug, browser, Playwright, packaging, or screenshots.

- [ ] **Step 5: Review the entire M2.2 diff**

```powershell
git diff --check
git diff --stat a62bf34d..HEAD
git status --short
```

Confirm:

- schema remains v3 and no migration was added;
- legacy standard fixtures may omit `spatial3D`;
- new showroom fixtures always contain positive vertical height;
- room candidates/keys/fingerprints/catalogue parts are never persisted;
- `building.structure.patch` validates final state once and reverses exactly;
- Rust and TypeScript share opening vectors;
- invoke command count remains eight;
- protected Cargo files are unstaged and byte-untouched by M2.2;
- no build artifacts, screenshots, credentials, or unrelated files are staged.

- [ ] **Step 6: Commit the closure documentation and ledger**

```powershell
git add -- aethertwin/packages/project-store/src/project-store.test.ts aethertwin/apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx aethertwin/crates/project-io/tests/schema_v3_recovery.rs aethertwin/crates/desktop-host/tests/command_contract.rs aethertwin/tests/workspace-policy.test.mjs aethertwin/tests/visible-copy-policy.test.mjs aethertwin/tests/offline-source-policy.test.mjs aethertwin/docs/PROJECT_FORMAT.md aethertwin/docs/ARCHITECTURE.md .superpowers/sdd/progress.md
git commit -m "test: close AetherTwin M2.2 building workflow"
```

**Acceptance:** M2.2 passes focused and full approved non-build verification, survives save/reopen/recovery, preserves compatibility and profile isolation, and is documented at the durable boundary.

**Failure inspection:** First classify by layer: shared vectors/core parser, project-store inverse, native replay/recovery, engine determinism, Studio session staleness, renderer lifecycle, or policy dependency graph. Do not weaken an invariant to make a downstream test green.

**Risk and rollback:** If final integration exposes data-compatibility or recovery defects, stop integration and revert the smallest task commit that introduced the broken boundary. Never rewrite user projects, bump schema, delete journals, or bypass validation as a rollback.

---

## Dependency and commit sequence

```text
Task 1 TS opening contract
  └─ Task 2 Rust parity
  └─ Task 3 TS compound command
       └─ Task 4 native replay/recovery

Task 5 mode-showroom catalogue/policy

Task 1 ─ Task 6 opening engine ─ Task 7 rendering
                          └───── Task 8 create UI ─ Task 9 edit/delete UI

Task 10 topology ─ Task 11 faces/intents ─ Task 12 Studio recognition

Task 5 ─ Task 13 catalogue placement ─ Task 14 fixture compatibility

Tasks 2, 4, 7, 9, 12, 14 ─ Task 15 vertical closure
```

Tasks 1–4 establish the durable boundary before UI can emit compound edits. Task 5 is independent and may be completed after Task 4, but Tasks 8, 13, and 14 consume it. Tasks 10–12 must remain sequential because each exposes the tested contract consumed by the next task. Task 15 starts only after every preceding task is committed.

## Advanced decisions already resolved

- **No schema v4:** Openings and fixture kinds already exist in v3; M2.2 adds validation and workflows only.
- **Legacy standard height:** Missing `spatial3D` remains valid for every old fixture kind. Catalogue defaults are projection/UI fallbacks and materialize only after explicit Apply.
- **Compound wall/opening edits:** A new journal command is required because existing commands parse invalid intermediate states. It is not a Tauri invoke command.
- **Geometry ownership:** Durable opening validity is core-model/project-io; plan-engine consumes it for interaction rather than maintaining a second policy.
- **Room recognition:** Deterministic planar topology and explicit confirmation are required. No auto-created or auto-updated rooms.
- **Candidate identity:** Canonical ring keys and fingerprints are transient comparison data, never durable IDs.
- **Room replacement:** Explicit only; preserve identity/metadata, replace world footprint, reset transform.
- **Showroom fixtures:** Catalogue descriptors/primitive parts live in a pure package; only normal Fixture fields persist.
- **Market isolation:** Existing generic drag creation remains authoritative and is not reimplemented through the showroom catalogue.
- **Rendering:** 2D symbols/rectangles only; no wall booleans and no M2.4 3D primitive projection.
- **Concurrency:** ProjectStore serialization plus exact before-state checks protect commands; Studio also rereads at pointer-up/confirmation and rejects late completions from replaced sessions.

## Plan self-review checklist

- [ ] Every approved specification section maps to at least one task and acceptance assertion.
- [ ] Every created production module has a named focused test file.
- [ ] TypeScript/Rust field names and command names are exact and camel-case at serialization boundaries.
- [ ] No task leaves a schema, migration, native-command-count, or profile-policy choice to the implementer.
- [ ] No task contains placeholder instructions or delegates architecture decisions.
- [ ] Each task is independently reviewable and ends with one focused commit.
- [ ] All executable verification is explicitly marked as requiring current user approval.
- [ ] Build/dev/debug/browser/Playwright/package/screenshot validation remains excluded.
- [ ] Protected Cargo files are never included in a stage command.
