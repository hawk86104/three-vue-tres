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

Studio owns composition and routing, while `project-store` coordinates immutable snapshots and persistence. CommandBus is the only mutation path. A command's entity delta and durable journal record persist in the same SQLite transaction; Project Store publishes its next immutable snapshot only after that transaction commits. `desktop-host` owns typed Tauri IPC and delegates project files and SQLite to `project-io`. Zustand stores transient UI state only, including selected panels, dialog state, and the current selection.

Future 2D, 3D, Player, route, label, theme, story, importer, and exporter modules consume `core-model` snapshots and neither bypass CommandBus nor maintain incompatible model copies.
