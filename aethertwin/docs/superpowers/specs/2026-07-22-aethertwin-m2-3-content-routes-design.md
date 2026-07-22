# AetherTwin M2.3 Content and Routes Design

**Status:** Approved as part of the M2 design on 2026-07-22
**Parent:** [`2026-07-22-aethertwin-m2-showroom-workflow-design.md`](./2026-07-22-aethertwin-m2-showroom-workflow-design.md)
**Consumes:** M2.1 asset pipeline and M2.2 structural showroom records

## 1. Goal

Deliver real showroom content authoring and a reusable route engine: local media attachments, product hotspots, route graph editing, and one persisted curated guided route.

## 2. Product content

`ProductContent` retains its UUID/name/tags, target entity ID, description, and ordered media-asset IDs. Its target must be an existing fixture or `PointOfInterest(kind="product-hotspot")`. Each product hotspot has exactly one content record; a fixture may have zero or one M2 product-content record.

`MediaAsset` references exactly one `AssetRecord` and records one of `image` or `video` for M2. Images accept PNG/JPEG/sanitized SVG; videos accept MP4/WebM. Media order is durable. Removing content or media references is reversible and does not remove immutable bytes.

A product hotspot is a normal active-floor POI with a user-defined name, tags, optional radius, 2D transform, and optional `Spatial3D`. Its 2D position is authoritative; M2.4 derives a default 3D marker height when none is stored.

## 3. Route graph

M2 activates `RouteNetwork`, `RouteNode`, and `RouteEdge` and adds `GuidedRoute`.

Allowed M2 node kinds are `junction`, `entrance`, and `showroom-stop`. Every node belongs to one floor and has a finite position. Every edge references two distinct nodes on the same floor. Edge distance equals their Euclidean distance in millimetres; width is positive; weight is finite and at least 1; `enabled` defaults true; `bidirectional` defaults true; `accessible` defaults true but has no M2 authoring control.

Segment insertion snaps to nodes, splits intersected edges at deterministic intersection nodes, rejects collinear overlap, and never leaves a visual crossing without graph connectivity. Duplicate nodes/edges and zero-length edges are invalid.

The M2 resolver uses deterministic Dijkstra traversal over enabled edges with cost `distance * weight`. Equal-cost choices break by canonical node/edge UUID order. It returns ordered node IDs, ordered edge IDs, total distance, and turn points. A missing/disconnected stop returns `NO_ROUTE` with the failing stop pair.

`GuidedRoute` contains at least two ordered stop-node IDs in one network and on one floor. Resolution concatenates shortest paths between consecutive stops and removes duplicate boundary nodes. M2 saves the curated stops, not a stale cached path.

## 4. Command and transaction rules

Content attachment after a new import uses one ProjectStore transaction for `AssetRecord`, `MediaAsset`, and `ProductContent`. Hotspot creation plus content creation may also be one transaction. Route segment insertion may patch the network once after the pure engine returns its complete node/edge result. Guided-route edits patch only the ordered stop list.

All referenced IDs are validated against the candidate post-transaction snapshot, allowing related records to be created atomically without accepting broken intermediate state.

## 5. Studio interaction

The Content group provides `Product hotspot` and attachment actions. Selecting a fixture or hotspot opens name, description, tags, ordered media, missing-media repair, and preview controls in the Inspector. Import completion precedes content publication.

The Tour group provides node/edge drawing, stop assignment, route validation, and route preview. The 2D canvas distinguishes the authored network from the resolved guided route. A disconnected segment is visibly diagnosed and cannot become the active guided route. M2 exposes no accessible-route toggle, closure editor, vendor destination, or live indoor position.

Tree, asset library, 2D canvas, content Inspector, and route stop list share selection. All attachment reordering, stop reordering, validation, and repair actions are keyboard operable.

## 6. Errors and recovery

- Broken target/media/network/node/edge/stop references are hard schema errors.
- Unsupported media or codec preview failure never creates fake remote fallbacks.
- A failed multi-record content transaction publishes none of its records.
- Route insertion failure leaves the original network exact.
- `NO_ROUTE` leaves the guided route and selection unchanged.
- Recovery replays content/network/guided-route patches through the same schema-v3 parsers as live commits.

## 7. Verification and acceptance

Required evidence covers content target cardinality, media ordering, import transaction atomicity, hotspot projection/selection, graph insertion/intersection splitting, deterministic Dijkstra/tie-breaking, stop concatenation, `NO_ROUTE`, ProjectStore undo/redo/reopen/recovery, Rust replay, Studio accessibility, and offline media policies.

M2.3 is accepted when the project contains at least ten real product hotspots with local image/video metadata and one connected guided route with at least two stops, all durable across save, close, reopen, and dirty recovery.
