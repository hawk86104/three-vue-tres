# Product specification

AetherTwin M1 supports exactly two immutable project profiles: `showroom` and `market`. The selected profile cannot change after creation; any future conversion requires an explicit migration workflow.

## Implemented M1 authoring surface

Studio opens a project directly in a 2D-first editor. The editor shows one active floor at a time and keeps the floor tree, Pixi canvas, accessible DOM mirror, and Inspector on the same selection. Project, floor, layer, single-entity, and multi-selection Inspector contexts use the durable ProjectStore/CommandBus path.

The nine visible M1 tools are:

1. Select
2. Pan
3. Boundary
4. Wall
5. Zone
6. Space unit
7. Fixture
8. POI
9. Dimension

M1 has six editable business entity kinds: boundary, wall, zone, space unit, fixture, and POI. Dimension annotation is implemented as a separate annotation entity. Property edits, transforms, rectangular arrays, delete, undo, redo, save, and reopen are durable. Locked objects remain inspectable but cannot be transformed or deleted until unlocked through an editable layer.

All stored plan distances are millimetres and rotations are radians. Inspector input accepts explicit supported units and converts to the stored contract. Rendering is 2D only and isolates entities to the active floor and visible layers.

## Deliberate M1 exclusions

The schema contains opening, product content, vendor, route network, theme, camera shot, and story sequence contracts, but M1 does not provide authoring UI for those records. Asset-pipeline, 3D scene, route, label, mode, theme, story, import, exporter, and plugin package directories remain contract boundaries or deferred placeholders unless their current source says otherwise.

M1 does not claim:

- a synchronized 3D preview;
- route authoring, accessible routing, search, or vendor/data import;
- export, publish, screenshots, PNG/MP4 output, or `.twinpack` sharing;
- a real Player, media workflow, visitor theme, or kiosk mode;
- real-browser or GPU profiling, or an M5 performance result.

These deferred capabilities are not exposed as working controls in the M1 editor. M2 is the next milestone.
