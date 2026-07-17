# Architecture

Dependencies point inward toward stable contracts:

```text
React UI
  -> editor-shell / design-system
  -> project-store
  -> command-bus + core-model
  -> typed native adapter
  -> desktop-host
  -> project-io
  -> filesystem + SQLite
```

Studio owns composition and routing, while `project-store` coordinates immutable snapshots and persistence. CommandBus is the only mutation path. `desktop-host` owns typed Tauri IPC and delegates project files and SQLite to `project-io`. Future 2D, 3D, Player, route, label, theme, story, importer, and exporter modules consume `core-model` snapshots and neither bypass CommandBus nor maintain incompatible model copies.
