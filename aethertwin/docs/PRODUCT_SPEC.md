# Product specification

AetherTwin supports exactly two immutable project profiles: `showroom` and `market`. Profile cannot change after creation; any future conversion requires an explicit migration workflow.

M0, M1, and M2.1 are accepted. The environment-limited Windows reparse test was explicitly waived without being claimed as passing. M2.1 closes the vertical path from safe asset import through durable asset/reference records, 2D rendering, calibration, save/reopen, and recovery.

## Implemented 2D-first editor

Studio opens a project directly in a 2D-first editor. The editor shows one active floor at a time and keeps the floor tree, Pixi canvas, accessible DOM mirror, Asset Library, and Inspector on the same durable snapshot and transient selection.

The nine visible M1 tools remain Select, Pan, Boundary, Wall, Zone, Space unit, Fixture, POI, and Dimension. M1 has six editable business entity kinds: boundary, wall, zone, space unit, fixture, and POI. Dimension is a separate annotation entity. Property edits, transforms, arrays, delete, undo, redo, save, reopen, lock, and recovery are durable.

All stored plan distances are millimetres and rotations are radians. One `PlanReference.transform` maps source-image coordinates into world millimetres.

## Implemented M2.1 asset and plan-reference workflow

- Import accepts PNG, JPEG, sanitized SVG, MP4, and WebM under the documented byte/media limits.
- Floor-plan references accept only PNG, JPEG, and sanitized SVG.
- Native import publishes immutable content-addressed bytes and returns an `AssetRecord`; ProjectStore commits the record and its initial plan reference atomically.
- Asset Library exposes real import progress, cancellation, selection, typed failures, and reimport repair.
- Plan references can be selected, placed, renamed, tagged, transformed, faded, locked, deleted, undone, and redone through the durable record-patch path.
- Two-point calibration is keyboard operable. The user selects two source-image points, enters a measured millimetre distance, confirms once, and receives an exact uniform scale update plus calibration record in the same reversible patch.
- Missing or corrupt bytes are never rendered as trusted content. The editor shows a placeholder, keeps the durable reference, and permits reimport without mutating the old immutable asset record.
- Save, close/reopen, and confirmed recovery preserve canonical relative identity, reference transform, calibration, and lock state.

## Deliberate exclusions

Schema v3 contains contracts for openings, product content, media assets, route networks, guided routes, materials, assignments, and scene environment, but M2.1 exposes no authoring claims for later workflow.

M2.1 does not claim:

- openings/room recognition or a parametric fixture catalogue;
- content placement UI, guided routes, or synchronized 3D preview;
- export, publish, screenshots, PNG/MP4 output, or `.twinpack` sharing;
- a real Player, visitor theme, kiosk mode, or market workflow;
- real-browser, packaged-runtime, GPU, or performance evidence.

Only working Import and Calibrate actions were added to the M1 surface. Deferred controls remain absent.