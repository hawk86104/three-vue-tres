# AetherTwin M2.2 Building and Fixtures Design

**Status:** Approved as part of the M2 design on 2026-07-22; revalidated and expanded against the post-M2.1 codebase on 2026-07-29
**Parent:** [`2026-07-22-aethertwin-m2-showroom-workflow-design.md`](./2026-07-22-aethertwin-m2-showroom-workflow-design.md)
**Consumes:** M2.1 schema v3, calibrated plan references, asset resolution, ProjectStore record patches, and the M1 PlanEditor
**Delivers:** Wall-bound openings, deterministic room recognition with explicit confirmation, and a seven-kind showroom fixture catalogue

## 1. Goal and scope

M2.2 completes three vertical showroom-authoring capabilities:

1. doors and windows bound to walls;
2. deterministic closed-room recognition with explicit candidate confirmation;
3. seven durable parametric showroom fixture kinds.

M2.2 does not implement materials, product content, routes, 3D model import, automatic layout, 3D wall cutting, or any M2.3+ workflow.

The chosen delivery organization is dependency-ordered vertical slices:

1. opening geometry and atomic wall/opening mutation;
2. opening projection and Studio editing;
3. room topology, candidate preview, and confirmation;
4. showroom catalogue, placement, and fixture editing;
5. persistence, recovery, policy, and acceptance evidence.

Engine-first horizontal delivery was rejected because it delays Studio and persistence integration feedback. UI-first provisional delivery was rejected because it would expose controls before durable commands and final-state validation exist.

## 2. Compatibility and schema decisions

M2.2 keeps schema v3. It adds no durable fields and performs no schema migration.

The existing `Opening` record remains:

```ts
interface Opening extends ProjectRecordBase {
  readonly wallId: string;
  readonly kind: "door" | "window";
  readonly distanceAlongWall: number;
  readonly width: number;
  readonly height: number;
  readonly sillHeight: number;
}
```

`FixtureKind` remains an eight-value union:

```ts
type FixtureKind =
  | "display-case"
  | "display-table"
  | "shelf"
  | "checkout"
  | "screen"
  | "partition"
  | "signage"
  | "generic";
```

`generic` is retained for legacy compatibility. Existing generic fixtures remain renderable, selectable, editable, copyable, arrayable, saveable, and recoverable. The showroom creation catalogue exposes exactly the other seven kinds. Market mode retains the existing generic drag-rectangle creation behavior.

Before M2.2, the application could not create openings through Studio. M2.2 therefore makes the geometric opening rules below normative for schema v3 without a migration. A hand-authored or corrupted v3 project containing an invalid opening fails explicitly; the application never silently moves, clips, or deletes it.

Schema v3 continues to allow `spatial3D` to be absent on any fixture so the existing v2 `display-case` contract and the already-published lossless v2-to-v3 migration remain valid. Every fixture newly created from the M2.2 showroom catalogue writes a finite positive `spatial3D.height`. M2.4 uses the matching catalogue default when a legacy standard fixture has no stored height. A legacy `generic` fixture may also omit `spatial3D`.

## 3. Coordinate and numeric contract

Stored plan units remain millimetres and stored angles remain radians.

All opening and room calculations use wall centre-lines after applying the entity transform in the existing order:

```text
scale -> rotation -> translation
```

`distanceAlongWall`, opening width, opening height, sill height, room area, and room perimeter are world-millimetre quantities.

The shared geometric comparison constant is:

```text
GEOMETRY_EPSILON_MM = 1e-7
```

The epsilon is used only for geometric comparisons. The implementation must not round or rewrite persisted values to make an invalid value valid.

For a non-zero local wall segment with local delta `(dx, dy)`, local length `L`, and positive entity scale `(sx, sy)`, its effective world thickness is:

```text
tangentScale = hypot(dx * sx, dy * sy) / L
normalScale = (sx * sy) / tangentScale
effectiveWorldThickness = wall.thickness * normalScale
```

This is the same tangent/normal scale relationship already used by wall selection. Rotation and translation do not change the effective thickness. Zero-length segments cannot carry openings.

Normative opening validation lives in `core-model` so every parsed snapshot has one invariant. `plan-engine` consumes the same TypeScript geometry helpers for projection and interaction. Rust mirrors the invariant and reads the same JSON acceptance vectors.

## 4. Opening geometry contract

`distanceAlongWall` locates the opening centre by cumulative world arc length from the wall centre-line's first point. Zero-length segments contribute no length.

The opening interval is:

```text
[distanceAlongWall - width / 2, distanceAlongWall + width / 2]
```

An opening is valid only when all of the following are true:

- `wallId` refers to one existing wall;
- all values and transformed wall coordinates are finite and within existing model bounds;
- the complete opening interval lies on one non-zero centre-line segment;
- the interval does not cross a centre-line joint;
- each interval end remains at least `max(1 mm, effectiveWorldThickness / 2)` from its segment endpoint;
- every pair of openings on the same wall retains a gap of at least `1 mm`;
- a door has `sillHeight === 0`;
- a door satisfies `height <= wallHeight`;
- a window satisfies `sillHeight + height <= wallHeight`.

`wallHeight` is `wall.spatial3D.height` when present and `3000 mm` otherwise.

Boundary comparisons admit `GEOMETRY_EPSILON_MM`, but no coordinate or dimension is rounded. Multiple violations are returned in deterministic opening-ID/code order. Studio displays the first actionable issue for the current preview and may expose the complete list in diagnostics.

The stable opening issue codes are:

- `OPENING_WALL_NOT_FOUND`;
- `OPENING_WALL_GEOMETRY_INVALID`;
- `OPENING_SPAN_CROSSES_JOINT`;
- `OPENING_ENDPOINT_CLEARANCE`;
- `OPENING_OVERLAP`;
- `OPENING_HEIGHT_EXCEEDED`;
- `OPENING_DOOR_SILL_NONZERO`;
- `OPENING_TARGET_LOCKED`.

Issues include relevant opening and wall IDs but never an absolute path, database detail, or raw journal payload.

## 5. Atomic wall/opening mutation

Existing `plan.entities.patch` and `snapshot.records.patch` each parse their intermediate snapshot. Placing the two intents in one current CommandBus transaction is insufficient because the first intent may create an invalid intermediate wall/opening state.

M2.2 adds one journal command type:

```text
building.structure.patch
```

Its JSON payload is exact:

```ts
interface BuildingStructurePatch {
  readonly reason: PlanEditReason;
  readonly wallChanges: readonly EntityChange[];
  readonly openingChanges: readonly RecordChange<Opening>[];
}
```

Every non-null side of `wallChanges` must be a real `type="wall"` entity. Every non-null side of `openingChanges` must be a real `Opening`. Unknown keys, duplicate change IDs, non-canonical IDs, incorrect indices, or a before mismatch are rejected.

Application semantics are:

1. validate exact payload shape and every `before` value against the current snapshot;
2. clone the unparsed snapshot;
3. apply all wall changes and opening changes to that clone;
4. parse and validate the final candidate exactly once;
5. normalize insertion indices;
6. generate an exact reverse-ordered inverse payload;
7. append one journal operation and publish one immutable snapshot.

Undo, redo, native replay, dirty recovery, and sandbox replay use the same final-state semantics.

Creating or editing only an opening continues to use `snapshot.records.patch`. A wall change that deletes, repairs, or invalidates attached openings must use `building.structure.patch`. Translation or rotation that leaves the final snapshot valid may continue through `plan.entities.patch`.

This command is a journal type, not a Tauri application command. The desktop command surface remains exactly eight commands and gains no permission or filesystem capability.

## 6. Door and window Studio interaction

Default creation dimensions are:

| Tool | Width | Height | Sill height |
| --- | ---: | ---: | ---: |
| Door | 900 mm | 2100 mm | 0 mm |
| Window | 1200 mm | 1200 mm | 900 mm |

Door and Window tools consider only walls on the active floor whose layers are visible and unlocked and which are themselves unlocked.

The pointer is projected onto every eligible non-zero world wall segment. A wall is in range when the perpendicular pointer distance is within the existing `8 px` selection tolerance plus effective half-thickness. Candidates sort by:

1. perpendicular screen distance;
2. wall ID;
3. segment index.

No in-range wall produces no committable preview. An in-range wall with an invalid default span produces a red preview with its first stable issue and cannot be committed.

Every preview shows Door/Window, width by height, sill height, cumulative along-wall distance, validity, and the first invalid reason. Clicking a valid preview creates one `Opening` through `snapshot.records.patch`. Success leaves the same tool active for repeated placement and selects the new opening. Failure preserves the tool and preview and displays the persistence error. `Escape` clears the preview and returns to Select.

## 7. Opening rendering, selection, and editing

Openings are normalized project records rather than `SpatialEntity` values, but their globally unique UUIDs may use the existing `selectedIds` set.

The 2D renderer projects deterministic symbols above the wall line:

- a door uses its along-wall width line, a leaf line, and a 90-degree swing arc;
- a window uses its along-wall width line and two parallel window lines.

M2.2 does not perform a 2D or 3D wall boolean cut. M2.4 later splits wall prisms using validated opening intervals.

Opening hit-testing takes precedence over the supporting wall. The selected symbol receives a separate overlay and stable render key. Hidden-layer openings are absent; locked wall/layer openings are visible but not editable.

The single-opening Inspector exposes name, kind, width, height, sill height, along-wall distance, read-only supporting wall name/ID, and delete. One form submission creates one complete record patch. Switching to Door does not silently reset sill height; the same submitted record must contain `sillHeight: 0`.

Dragging an opening along its existing wall changes only `distanceAlongWall`, previews validity continuously, and commits on pointer-up. M2.2 does not drag-rebind an opening. Rebinding requires delete and recreate.

Deleting a wall with attached openings uses `building.structure.patch` to remove or explicitly repair openings in the same operation. A wall reshape or resize that leaves an opening invalid is rejected with affected opening IDs.

The accessible mirror exposes opening kind, name, wall, distance, dimensions, sill height, selection, lock/editability state, and selection/delete actions. Keyboard and canvas selection write the same `selectedIds`.

## 8. Closed-room recognition input

Recognition consumes the active floor, walls in visible layers on that floor, locked and unlocked walls alike, and an explicit tolerance. Locked walls remain boundaries because locking controls editing, not topology.

The default tolerance is `5 mm`; Studio accepts `0.1` through `100 mm`.

```ts
recognizeClosedRooms(input): RoomRecognitionResult
```

This pure API does not read React state, generate UUIDs, mutate the project, call persistence, or depend on Pixi, Tauri, or Three.js.

## 9. Deterministic topology algorithm

The algorithm executes in this exact order:

1. transform wall centre-lines to world space and expand them into attributed segments;
2. reject non-finite geometry;
3. remove zero-length segments and emit non-fatal diagnostics;
4. use a deterministic bounding-box ordered broad phase for potential pairs;
5. split non-collinear exact crossings;
6. split a segment where another endpoint lies within tolerance of its interior projection;
7. reject positive-length collinear overlap with `COLLINEAR_OVERLAP`; endpoint contact is allowed;
8. sort endpoints/intersections by `(x, y, wallId, segmentIndex, parameter)`;
9. cluster by a first-representative rule: a point joins the first cluster whose representative is within tolerance;
10. use the sorted first point as cluster coordinate and never average coordinates;
11. discard normalized zero-length edges and merge exact duplicate edges while retaining contributing wall IDs;
12. construct a bidirectional half-edge graph;
13. sort outgoing half-edges by angle, destination coordinate, and wall IDs;
14. walk half-edges to extract face rings;
15. retain positive-orientation bounded simple rings;
16. remove exterior, duplicate, and self-intersecting rings;
17. normalize counter-clockwise rings, remove repeated/collinear vertices, omit a repeated close point, and rotate to the lexicographically smallest first vertex;
18. remove candidates smaller than `250,000 mm²`;
19. sort by area, centroid X, centroid Y, then canonical ring key.

Tolerance connects endpoints to endpoints and endpoints to another segment interior. It does not join two merely close segments when neither contributes an endpoint.

The broad phase stops after `2,000,000` candidate-pair comparisons and returns `TOPOLOGY_COMPLEXITY_LIMIT` without partial candidates.

Fatal issues are `INVALID_ROOM_TOLERANCE`, `NON_FINITE_WALL_GEOMETRY`, `COLLINEAR_OVERLAP`, and `TOPOLOGY_COMPLEXITY_LIMIT`. Zero-length segments, dangling edges, duplicate edges, and filtered small faces are deterministic non-fatal diagnostics.

## 10. Room candidates and lifetime

```ts
interface RoomCandidate {
  readonly key: string;
  readonly footprint: readonly Point2[];
  readonly contributingWallIds: readonly string[];
  readonly areaMm2: number;
  readonly perimeterMm: number;
}
```

The footprint is a normalized counter-clockwise world polygon. Wall IDs are unique and sorted. The key is canonical, unrounded ECMAScript number serialization of the coordinate ring; it is not a UUID and is never persisted.

Studio fingerprints active floor ID, visible-layer state, participating wall IDs/order/centre-lines/transforms/thicknesses, and tolerance. Any relevant wall or visibility change clears the overlay, marks results stale, and disables confirmation. Unrelated fixture or metadata changes do not stale candidates. Confirmation compares the fingerprint again immediately before creating an intent.

`Recognize Rooms` is a one-shot Building action, not a durable `PlanTool`. It opens a compact list and runs once with `5 mm`. The canvas shows transient candidates. The list shows deterministic number, area, perimeter, wall count, and state. Candidate-list selection does not enter `selectedIds`.

## 11. Room confirmation and replacement

Confirmation creates a `SpaceUnit(kind="room")` whose footprint is the candidate world ring, transform is identity, floor is active, layer is the first visible unlocked creation layer, lock is false, and tags are empty. No creation layer produces `NO_EDITABLE_CREATION_LAYER`.

Rooms omit `spatial3D`; M2.4 treats them as floor polygons. UUIDs are generated only on confirmation. Names are `Room 1`, `Room 2`, and so on in candidate order while skipping existing exact names.

Confirm One creates one room. Confirm All creates all unrepresented candidates through one `plan.entities.patch`, one native commit, and one undo entry. Failure leaves candidates visible.

A candidate whose normalized ring exactly matches an existing world `SpaceUnit(kind="room")` ring is marked represented and cannot be duplicated.

Wall changes never update confirmed rooms automatically. `Replace boundary from candidate` requires one selected, unlocked, editable room and a non-stale candidate. It preserves room identity and metadata, replaces footprint with the world candidate, resets transform to identity, and commits one reversible patch.

The showroom rectangle `space-unit` tool remains under the label Room. Market mode continues to create booths.

## 12. Showroom fixture catalogue

M2.2 adds `packages/mode-showroom`. It owns immutable descriptors, defaults, normalized primitive parts, and showroom tool grouping. It owns no project/UI state and depends on none of React, Pixi, Three.js, Tauri, or ProjectStore.

```ts
type ShowroomFixtureKind = Exclude<FixtureKind, "generic">;

interface ShowroomFixtureDescriptor {
  readonly kind: ShowroomFixtureKind;
  readonly label: string;
  readonly defaultName: string;
  readonly defaultSize: {
    readonly width: number;
    readonly depth: number;
    readonly height: number;
  };
  readonly parts: readonly FixturePrimitivePart[];
}

interface FixturePrimitivePart {
  readonly key: string;
  readonly shape: "box";
  readonly center: { readonly x: number; readonly y: number; readonly z: number };
  readonly size: { readonly x: number; readonly y: number; readonly z: number };
}
```

Part X/Y/Z are plan width, plan depth, and vertical height. Every positive-size box lies inside the normalized unit cube and has a unique key.

For all seven descriptors, `defaultName` is exactly the corresponding Chinese `label` in the table below.
| Kind | Label | Width | Depth | Height |
| --- | --- | ---: | ---: | ---: |
| `display-case` | 展示柜 | 1200 | 600 | 1200 |
| `display-table` | 展示桌 | 1500 | 750 | 900 |
| `shelf` | 货架 | 1000 | 400 | 2000 |
| `checkout` | 收银台 | 1600 | 700 | 1000 |
| `screen` | 屏幕 | 1200 | 100 | 1800 |
| `partition` | 隔断 | 1200 | 100 | 2400 |
| `signage` | 标牌 | 600 | 100 | 1800 |

Exact normalized box parts:

| Kind | Part | Center `(x,y,z)` | Size `(x,y,z)` |
| --- | --- | --- | --- |
| display-case | base | `(.5,.5,.05)` | `(1,1,.1)` |
| display-case | case | `(.5,.5,.5)` | `(.9,.9,.8)` |
| display-case | top | `(.5,.5,.95)` | `(1,1,.1)` |
| display-table | top | `(.5,.5,.9)` | `(1,1,.2)` |
| display-table | leg-fl | `(.08,.08,.4)` | `(.08,.08,.8)` |
| display-table | leg-fr | `(.92,.08,.4)` | `(.08,.08,.8)` |
| display-table | leg-rl | `(.08,.92,.4)` | `(.08,.08,.8)` |
| display-table | leg-rr | `(.92,.92,.4)` | `(.08,.08,.8)` |
| shelf | back | `(.5,.95,.5)` | `(1,.1,1)` |
| shelf | side-left | `(.025,.5,.5)` | `(.05,.9,1)` |
| shelf | side-right | `(.975,.5,.5)` | `(.05,.9,1)` |
| shelf | shelf-0 | `(.5,.5,.025)` | `(.9,.9,.05)` |
| shelf | shelf-1 | `(.5,.5,.35)` | `(.9,.9,.05)` |
| shelf | shelf-2 | `(.5,.5,.65)` | `(.9,.9,.05)` |
| shelf | shelf-3 | `(.5,.5,.975)` | `(.9,.9,.05)` |
| checkout | body | `(.5,.5,.45)` | `(1,1,.9)` |
| checkout | top | `(.5,.5,.95)` | `(1,1,.1)` |
| screen | base | `(.5,.5,.03)` | `(.6,1,.06)` |
| screen | post | `(.5,.5,.33)` | `(.08,.3,.6)` |
| screen | display | `(.5,.5,.8)` | `(1,.2,.4)` |
| partition | panel | `(.5,.5,.5)` | `(1,1,1)` |
| signage | base | `(.5,.5,.03)` | `(.7,1,.06)` |
| signage | post | `(.5,.5,.35)` | `(.08,.3,.64)` |
| signage | board | `(.5,.5,.82)` | `(1,.2,.36)` |

The module deep-freezes the catalogue. Tests enforce exact ordering/dimensions, unique non-generic kinds, unique part keys, finite positive boxes, and normalized bounds.

## 13. Fixture persistence and Studio interaction

Catalogue placement creates a normal Fixture:

```ts
{
  type: "fixture",
  kind: descriptor.kind,
  size: {
    width: descriptor.defaultSize.width,
    height: descriptor.defaultSize.depth
  },
  spatial3D: {
    elevation: 0,
    height: descriptor.defaultSize.height
  }
}
```

`Fixture.size.height` is plan depth; `Fixture.spatial3D.height` is vertical height. Descriptors and parts are not persisted.

The showroom Fixtures group opens seven buttons showing label and width/depth/height with `aria-pressed`. Choosing a kind focuses the canvas and sets transient `selectedFixtureKind`.

The preview is a zero-rotation rectangle centred on the snapped point. Stored translation is `center - (width / 2, depth / 2)`. Click creates one fixture through `plan.entities.patch`, selects it, and retains the kind. Failure retains preview/choice. `Escape` clears choice and returns to Select.

The Inspector shows read-only kind, name, X/Y, rotation, layer, lock, tags, width, depth, and vertical height. One submission updates dimensions atomically. A standard fixture with stored `spatial3D` displays that height. A legacy standard fixture without `spatial3D` displays its catalogue default without mutating the snapshot; the first successful Apply materializes `{ elevation: 0, height }`. A generic fixture may leave height blank; entering height adds `{ elevation: 0, height }`, and clearing a legacy generic height removes optional `spatial3D`.

Existing move, rotate, duplicate, copy/paste, array, align, distribute, lock, delete, undo, and redo remain authoritative. 2D resize changes width/depth, not vertical height. Copy/paste and array preserve kind and `spatial3D`.

The 2D style token includes kind; M2.2 retains plan rectangles rather than rendering 3D parts in Pixi. The accessible mirror exposes kind, name, dimensions, selection, and lock. Generic is explicit and never presented as a catalogue kind.

## 14. Tool policy

`mode-showroom` exports stable action IDs, mapped by Studio:

- Select: Select, Pan;
- Building: Boundary, Wall, Door, Window, Zone, Room, Recognize Rooms;
- Fixtures: Fixture Catalogue;
- Markers: POI, Dimension.

M2.3+ appends Content, Tour, and Preview/Export without reordering these actions. Market grouping and behavior are unchanged.

## 15. Transient-state safety

CommandBus serializes commits and every mutation carries exact before state. A mismatch rejects the operation.

Project/floor replacement, floor switch, or unmount clears opening previews, room candidates/fingerprint, and selected catalogue kind. Fixture placement rereads snapshot/creation layer at pointer-up. Room confirmation rechecks the topology fingerprint. A late completion from a replaced session cannot write into the new session.

## 16. Rust validation and recovery

Rust adds an exact camel-case `BuildingStructurePatch` DTO. Payload/inverse contain only `reason`, `wallChanges`, and `openingChanges`; use an allowlisted reason; contain strict wall/Opening records; reverse exactly; and preserve normalized indices.

Native apply, undo, redo, and recovery apply both arrays to one candidate and validate final state once.

Public mapping remains:

- malformed IPC shape: `IPC_INVALID_REQUEST`;
- invalid persisted snapshot: `INVALID_PROJECT_STRUCTURE`;
- journal before/inverse/replay mismatch: `DATABASE_ERROR`.

M2.2 adds no public host error code, Tauri command, or capability. Existing redaction remains.

## 17. Required verification

Required evidence:

- core-model: opening geometry, deterministic issues, legacy missing-height compatibility, and immutability;
- plan-engine: opening projection/effective thickness, transformed and degenerate walls, room crossings/T-junctions/clustering/overlaps/order/filter/limit, room intents;
- mode-showroom: seven descriptors, dimensions, parts, freezing, tool policy, no generic;
- ProjectStore/CommandBus: building apply/inverse/undo/redo, before/index rejection, failed commit non-publication, save/reopen/recovery, one-command Confirm All;
- Rust/desktop: shared opening vectors, strict DTO, replay/recovery, malicious shape/partial repair/bad index/mismatched inverse rejection, safe mapping, eight-command surface;
- render-plan-2d/Studio: opening symbols/culling/keys/hit/selection, fixture kind styles/generic fallback, tools/previews/catalogue/Inspectors/staleness/confirmation/replacement/keyboard/focus/accessibility, profile isolation;
- policy: workspace registration, visible actions, project format, offline source, and unchanged native permissions/commands.

## 18. Definition of Done

M2.2 is complete only when actual evidence proves:

- a calibrated showroom floor can create/edit valid doors and windows;
- invalid openings cannot commit;
- deleting/reshaping an opening-bearing wall cannot publish partial state;
- compound edits survive undo, redo, save, reopen, and dirty recovery;
- identical room input returns identical candidates/order/diagnostics;
- users can confirm one/all and explicitly replace a room boundary;
- the acceptance project contains at least four confirmed rooms or zones;
- every catalogue kind can be placed and edited;
- at least twenty catalogue fixtures survive save, close, reopen, and dirty recovery;
- a legacy standard fixture without `spatial3D` opens unchanged, uses its catalogue default for display/projection, and materializes height only after explicit Apply;
- legacy generic round-trips and remains editable;
- market generic creation does not regress;
- schema stays v3 and the Tauri application command count stays eight;
- every claimed test, lint, typecheck, Rust test, and `cargo check` was actually run and recorded.

Project rules exclude build, dev, debug, browser, Playwright, packaged-runtime, and screenshot execution unless separately authorized in the current conversation. M2.2 must not claim those runtime or visual forms of evidence when unexecuted.
