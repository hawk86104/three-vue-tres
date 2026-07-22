# AetherTwin M2.2 Building and Fixtures Design

**Status:** Approved as part of the M2 design on 2026-07-22
**Parent:** [`2026-07-22-aethertwin-m2-showroom-workflow-design.md`](./2026-07-22-aethertwin-m2-showroom-workflow-design.md)
**Consumes:** M2.1 schema v3, plan references, asset resolution, and record patches

## 1. Goal

Complete showroom structural authoring: doors/windows bound to walls, deterministic closed-room candidates with explicit confirmation, and a useful seven-kind parametric fixture catalogue.

## 2. Opening contract

An opening references exactly one wall. `distanceAlongWall` locates the opening centre by cumulative arc length from the wall centre-line's first point. Width and height are finite positive millimetres; sill height is finite and non-negative. Doors require zero sill height. Windows may use a positive sill.

The opening interval is `[distanceAlongWall - width / 2, distanceAlongWall + width / 2]`. It must lie on one centre-line segment and remain at least `max(1 mm, wall.thickness / 2)` from both segment endpoints. Openings on the same wall must retain at least 1 mm between intervals. When the wall has `spatial3D.height`, window sill plus height and door height must not exceed it. A wall without explicit height uses the showroom default of 3,000 mm for validation and later 3D projection.

Moving or reshaping a wall does not silently relocate an invalid opening. The proposed wall edit is rejected with the affected opening IDs unless the same CommandBus transaction also supplies valid opening updates or removals.

## 3. Closed-room recognition

`plan-engine` receives active-floor wall centre-lines and an explicit tolerance. Studio uses a default of 5 mm and allows a value from 0.1 through 100 mm in the advanced action panel.

The pure algorithm:

1. removes zero-length segments and rejects non-finite geometry;
2. splits centre-lines at non-collinear crossings and endpoint-on-segment T-junctions, while rejecting collinear overlap;
3. clusters endpoints and intersections within tolerance using deterministic coordinate/ID ordering;
4. constructs a planar half-edge graph;
5. extracts bounded simple faces in deterministic area/centroid order;
6. removes the unbounded exterior face, duplicate rings, self-intersecting faces, and areas below 250,000 mm²;
7. returns candidate polygons, contributing wall IDs, area, perimeter, and diagnostics.

Candidates are transient and have deterministic session keys derived from normalized geometry, not durable UUIDs. Studio previews them above plan content. Confirming a candidate creates a `SpaceUnit(kind="room")` with a new UUID through `plan.entities.patch`. Updating an existing room requires an explicit `Replace boundary from candidate` action. Later wall changes never auto-delete or auto-reshape a room.

## 4. Parametric fixture catalogue

`mode-showroom` owns immutable catalogue descriptors. Defaults are millimetres:

| Kind | Width | Depth | Height |
| --- | ---: | ---: | ---: |
| `display-case` | 1200 | 600 | 1200 |
| `display-table` | 1500 | 750 | 900 |
| `shelf` | 1000 | 400 | 2000 |
| `checkout` | 1600 | 700 | 1000 |
| `screen` | 1200 | 100 | 1800 |
| `partition` | 1200 | 100 | 2400 |
| `signage` | 600 | 100 | 1800 |

Placement creates a normal M1 `Fixture` with catalogue kind, 2D size, and `spatial3D.height`. Width, depth, height, translation, rotation, duplication, array, alignment, distribution, lock, delete, undo, and redo continue through existing plan edit intents. The catalogue describes primitive parts for M2.4 but contains no Three.js object and no arbitrary model URI.

## 5. Studio interaction

The Building group contains Wall, Door, Window, Room, and Recognize Rooms. Door/window previews snap to an eligible wall and show along-wall distance plus dimensions before confirmation. Invalid spans remain previews with a reason and cannot be committed.

Recognize Rooms opens no modal workspace: candidates appear on the 2D canvas and in a compact confirmation list. Users may confirm one or all valid candidates. Existing rooms require a separately labelled replacement action.

The Fixtures group opens the seven-item catalogue. A keyboard or pointer action selects a type, then places it through the existing fixture tool. Common size and height fields remain visible in the Inspector; advanced 3D/material controls do not appear until M2.4.

## 6. Errors and recovery

- Broken, cross-floor, out-of-span, overlapping, or height-invalid openings fail snapshot validation.
- Wall edits that would orphan openings fail atomically unless the transaction repairs them.
- Room topology diagnostics never mutate project data.
- Failed candidate confirmation leaves candidates visible and reports the persistence error.
- Fixture catalogue descriptors are compile-time/runtime policy; unknown fixture kinds remain rejected.

## 7. Verification and acceptance

Required evidence covers opening geometry/validation, same-transaction wall repair, topology normalization, intersection splitting, endpoint tolerance, deterministic face order, candidate filtering, explicit confirmation, all fixture defaults and edits, ProjectStore undo/redo/reopen/recovery, Pixi projection, accessible mirror, and Studio focus/selection.

M2.2 is accepted when a calibrated plan can contain editable walls, valid doors/windows, at least four explicitly confirmed rooms/zones, and at least twenty catalogue fixtures that survive save, close, reopen, and dirty recovery.
