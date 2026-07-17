# Product specification

M0 supports exactly two immutable project profiles: `showroom` and `market`. The selected profile cannot change after creation in M0; any future conversion must be an explicit migration workflow.

M0 establishes a 2D-first editor foundation: later authoring centers on the plan editor, while 3D is a synchronized reader and preview. Until M1 plan editing exists, M0 provides a real project overview where users can edit the project name and tags and inspect its profile, schema version, location, and save state; it does not present a fake editor.

M0 excludes plan editing, geometry tools, 3D/R3F preview, showroom authoring, market booth authoring, CSV import, search, routing, visitor themes, kiosk mode, screenshots, PNG or MP4 export, and `.twinpack` sharing beyond its future contract. Deferred capabilities are not exposed in the M0 interface.
