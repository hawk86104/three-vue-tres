# AetherTwin Studio M0 Foundation Design

**Date:** 2026-07-17

**Status:** Approved

**Product:** AetherTwin Studio / 灵境孪生

**Milestone:** M0 — local-first foundation

## 1. Context and decision

The repository already contains a large Vue/FES/TresJS application and a separate OpenRemote-based `shop-digital-twin` project. Both have substantial uncommitted work. AetherTwin requires a different product boundary and stack: React, TypeScript, Vite, pnpm workspaces, Tauri 2, Rust, PixiJS, Three.js/React Three Fiber, and SQLite.

M0 will therefore be built as an isolated monorepo at `E:\数字孪生\aethertwin`. Existing Vue, Electron, Longfu Market, and OpenRemote code may be consulted for ideas but will not be a runtime or build dependency. This protects existing work and prevents incompatible package managers, application shells, and data models from being mixed.

The product has exactly two profiles:

```ts
type ProjectProfile = "showroom" | "market";
```

No third default profile, generic IoT dashboard, BIM portal, point-cloud portal, 3DGS portal, or node-graph portal will be introduced.

The selected profile is immutable after project creation in M0. Any future cross-profile conversion must be an explicit migration workflow, never an implicit third mode or a mutable dropdown.

## 2. Product principles

M0 establishes the constraints that every later milestone must preserve:

1. **Local First:** projects, assets, databases, recovery data, and exports operate without internet access.
2. **2D First:** later authoring work is centered on the plan editor; 3D is a synchronized reader and preview.
3. **One Model, Two Modes:** showroom and market share the same spatial model and persistence layer.
4. **Fast Authoring:** interaction and data structures optimize common authoring operations rather than construction-grade CAD precision.
5. **Progressive Disclosure:** only working, context-relevant tools are shown.
6. **Beautiful but Quiet:** the Aether editor is visually refined without pervasive glass, glow, gradients, or animation.
7. **No Fake Features:** disabled placeholders, empty workspaces presented as features, and nonfunctional actions are not exposed.

## 3. Program decomposition

The full product is too large for one implementation plan. Each milestone receives its own approved design, implementation plan, and completion evidence while preserving the full product objective.

- **M0 — Foundation:** isolated monorepo, Tauri/Web shells, project center, profiles, Aether design system, SQLite, CommandBus, saving, autosave, and crash recovery.
- **M1 — Unified authoring core:** complete core model, plan-engine, PixiJS rendering, transforms, snapping, dimensions, arrays, spatial indexing, and undo/redo authoring commands.
- **M2 — Showroom workflow:** base plans, walls, openings, rooms, fixtures, content, routes, synchronized 3D preview, materials, lights, and screenshots.
- **M3 — Market workflow:** regions, programmatic booths, numbering, vendor CSV, POIs, route graph, search, accessible routing, and guide-map export.
- **M4 — Player and media:** independent offline Player, visitor themes, kiosk behavior, deterministic PNG frames, and optional FFmpeg MP4 encoding.
- **M5 — Hardening:** label avoidance, large-booth performance, project validation, templates, shortcuts, and interaction polish.

This document specifies M0 only. It does not redefine later milestones as optional.

## 4. M0 scope

### 4.1 In scope

- pnpm and Cargo workspaces.
- Tauri 2 desktop host and a browser-compatible Studio frontend boundary.
- Required repository directory structure and architecture documentation.
- A functional project center.
- Creation and opening of showroom and market projects.
- A real project overview workspace, not a fake plan editor.
- Aether design tokens and core UI primitives.
- Versioned project manifests and SQLite schema.
- Project-relative resource paths and SHA-256 asset identity contracts.
- CommandBus transactions, undo, redo, durable command history, autosave checkpoints, and crash recovery.
- Save, close, reopen, locking, migration, and recovery flows.
- Offline enforcement and M0 acceptance tests.

### 4.2 Not in M0

- PixiJS plan editing, geometry manipulation, snapping, dimensions, or spatial indexing.
- Three.js/R3F project preview.
- Showroom authoring tools.
- Market booth authoring, CSV import, search, or routing.
- Visitor themes, kiosk mode, screenshots, PNG-frame export, or MP4 encoding.
- `.twinpack` sharing packages beyond defining the future contract.

Deferred capabilities are not shown in the M0 product interface.

## 5. Repository structure

The isolated workspace uses the required final shape from the beginning:

```text
aethertwin/
  apps/
    studio/
    player/
  packages/
    core-model/
    command-bus/
    project-store/
    asset-pipeline/
    design-system/
    editor-shell/
    plan-engine/
    render-plan-2d/
    render-scene-3d/
    route-engine/
    label-engine/
    mode-showroom/
    mode-market/
    theme-engine/
    story-engine/
    data-importer/
    exporter/
    plugin-sdk/
  crates/
    desktop-host/
    project-io/
    asset-io/
    media-export/
  docs/
    ARCHITECTURE.md
    PRODUCT_SPEC.md
    PROJECT_FORMAT.md
    DESIGN_SYSTEM.md
    ROADMAP.md
    DECISIONS.md
    LICENSE_POLICY.md
    superpowers/
      specs/
      plans/
  AGENTS.md
  README.md
  THIRD_PARTY_NOTICES.md
```

Only M0 modules export runtime implementation in M0. Deferred packages and crates define their scope and dependency boundary but are not imported by Studio and are not exposed in the UI.

## 6. Architecture and component boundaries

### 6.1 `apps/studio`

Studio owns composition and routing, not domain data. It provides:

- project center;
- create/open/recent-project flows;
- profile-aware editor shell;
- project overview;
- save, undo, redo, close, and recovery affordances;
- `/dev/ui-gallery` for implemented design-system states.

Studio talks to the domain through `project-store` and to native capabilities through typed Tauri adapters. React components do not issue raw SQL or manipulate project files.

The frontend depends on a `ProjectBackend` interface. The production adapter invokes typed Tauri commands. Web development uses an explicitly labeled sandbox adapter with deterministic in-memory projects so project-center and shell UI can be developed without pretending to open real `.twinproj` directories. Persistent project creation, opening, migration, locking, and recovery remain desktop-only in M0. The sandbox adapter is excluded from production bundles.

### 6.2 `apps/player`

M0 creates the independent application boundary and build configuration only. It is not linked from Studio and does not claim visitor functionality. Player implementation begins in M4.

### 6.3 `packages/core-model`

M0 defines the versioned foundation needed to create and reopen a project:

- `ProjectProfile`;
- `ProjectManifest`;
- minimal `SpatialProject` identity and metadata;
- minimal `Floor` identity for the initial project tree;
- `ProjectSnapshot`;
- common UUID, tag, timestamp, serialization, and migration contracts.

M1 expands this package to the complete named spatial model. Rendering-library objects never become authoritative model state.

### 6.4 `packages/command-bus`

CommandBus is the only mutation path for project data. It owns:

- typed command registration;
- pure preparation of next-state deltas and inverse operations;
- single-command and multi-command transactions;
- undo and redo stacks;
- history truncation after a new command follows undo;
- durable journal records;
- transaction identifiers and monotonic sequence numbers.

UI stores may request commands but cannot directly mutate the project snapshot.

### 6.5 `packages/project-store`

Project Store coordinates:

- current immutable snapshot;
- CommandBus execution;
- native persistence adapter;
- dirty/saving/saved/error/recovered state;
- recent projects;
- checkpoint scheduling;
- close and crash-recovery behavior.

Zustand stores transient UI state only, such as selected panel, dialog state, and current selection.

### 6.6 `packages/design-system` and `packages/editor-shell`

The design system contains Aether tokens and accessible primitives. The shell composes project navigation, header, left project tree, central workspace, inspector, and hidden lower dock. Neither package imports native persistence or domain implementation.

### 6.7 `crates/desktop-host`

The desktop host owns the Tauri application, capabilities, window lifecycle, file-dialog integration, single-instance coordination, typed IPC commands, and safe error conversion. It delegates project work to `project-io`.

### 6.8 `crates/project-io`

Project I/O owns directory validation, manifests, SQLite connections, migrations, locking, checkpoints, recovery copies, relative-path validation, and transactional persistence. It never trusts a UI-provided path without canonicalization and scope validation.

## 7. Dependency direction

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

Future 2D, 3D, Player, route, label, theme, story, importer, and exporter modules consume `core-model` snapshots. They do not write around CommandBus or maintain incompatible copies.

## 8. Project format

Every editable project is a directory:

```text
ProjectName.twinproj/
  manifest.json
  project.db
  assets/
  thumbnails/
  derived/
  exports/
```

M0 creates every directory so later milestones do not change the outer format. Temporary lock state may use `.aethertwin.lock`; it is excluded from sharing packages and removed on clean close.

`manifest.json` contains lightweight identity and compatibility metadata:

- `schemaVersion`;
- project UUID;
- name;
- profile;
- created and updated timestamps;
- producing application version;
- minimum compatible application version.

SQLite is the persistent source of truth for editable project state. Large media files are never stored as SQLite BLOBs. Asset records use SHA-256 and normalized project-relative paths. Absolute paths, drive letters, UNC locations, and parent traversal are rejected at the persistence boundary.

Manifest identity, profile, and schema fields must agree with SQLite or opening fails safely. Mutable manifest fields such as name and `updatedAt` are cache copies of database values: after a database commit, `project-io` rewrites `manifest.json` through a temporary file and atomic rename. If an interruption leaves only those cache fields stale, project open repairs them from SQLite after validating immutable identity fields.

Future `.twinpack` files are ZIP snapshots. Editable projects remain directories and are not recompressed on each save.

## 9. SQLite design

M0 uses WAL mode and explicit migrations. The initial schema provides:

- `schema_migrations` — applied migration identifiers and checksums;
- `project_meta` — project identity, profile, version, timestamps, and session markers;
- `entity_records` — UUID, entity type, parent reference, revision, and serialized model payload;
- `command_journal` — sequence, transaction ID, command type, payload, inverse payload, timestamp, and status;
- `snapshots` — checkpoint sequence, serialized project snapshot, checksum, and timestamp;
- `asset_records` — SHA-256, relative path, media type, size, and derivation metadata.

Serialized model payloads are text or SQLite JSON values, not binary media. The schema supports later indexes without forcing rendering concerns into storage.

## 10. Command and persistence flow

A project modification follows one path:

1. The UI submits a typed command intent.
2. CommandBus validates the intent against the current snapshot.
3. The command prepares a next-state delta and inverse operation without mutating shared state.
4. Project Store sends the entity delta and journal record to `project-io`.
5. `project-io` persists the delta and journal entry in one SQLite transaction.
6. Only after the transaction commits does Project Store publish the new immutable snapshot.
7. Subscribers, including future 2D and 3D views, render the published snapshot.

If persistence fails, SQLite rolls back and the proposed snapshot is never published. A transaction groups related commands under one undo step and one database commit.

Undo and redo are recorded as journal operations rather than silently rewriting history. A new command after undo invalidates only the redo branch while preserving the durable audit sequence.

## 11. Autosave, checkpoints, and recovery

Durable command records protect each committed mutation. Autosave creates compact checkpoints after a short idle interval and on important lifecycle events. Manual Save forces an immediate checkpoint and manifest timestamp update.

After a command transaction commits, its entity changes and journal record are already crash-durable. The UI reports the project as dirty while committed journal entries remain newer than the latest compact checkpoint. Autosave or Manual Save advances the checkpoint sequence and changes the state to saved. This distinction makes Save meaningful without risking loss of every command between checkpoints.

On project open:

1. validate the directory, manifest, schema, and database;
2. inspect the clean-shutdown marker and lock state;
3. load the newest valid checkpoint;
4. replay later committed journal entries in sequence;
5. verify the resulting snapshot checksum and invariants;
6. publish either the restored project or a typed recovery error.

Before migration or nontrivial recovery, the application copies `manifest.json` and `project.db` to a timestamped location under `derived/recovery/`. Recovery never overwrites the only known-good source before validation.

## 12. M0 user experience

### 12.1 Project center

The project center shows only:

- AetherTwin Studio identity;
- recent projects that still exist;
- Open Project;
- New Showroom Project;
- New Market Project.

Recent-project locations are stored in application-local preferences, not inside project data or exported packages. This is the only place M0 persists host-absolute project locations.

There are no BIM, IoT, point-cloud, 3DGS, node-graph, or generic engine entry points.

The creation flow collects project name, location, and profile. It validates names, conflicting paths, permissions, and available location before writing. Creation first uses a staging directory and atomically moves the completed structure into place. Existing projects are never overwritten.

### 12.2 Editor shell

M0 does not pretend that the M1 plan editor exists. The central workspace is a functional project overview where users can edit name and tags and inspect profile, schema version, project location, and save state.

The header exposes only working actions: return to project center, Save, Undo, Redo, and Close. The left side shows the real project and initial floor tree. The right Inspector shows fields that can actually be edited. The lower dock remains hidden.

Full showroom and market tool groups appear only when their implementation milestones make the actions real.

### 12.3 Aether visual language

- deep blue-gray editor background;
- soft neutral panels rather than large pure-black surfaces;
- 1 px translucent borders;
- 10–16 px corner radii;
- low-saturation cyan selection and focus;
- glow only for selection, successful save, and successful recovery;
- 120–220 ms restrained transitions;
- local system Chinese font stack;
- local Lucide icons and bundled static assets;
- no pervasive `backdrop-filter`, gradients, or remote fonts.

Editor appearance is fixed. Future visitor themes affect Player output only.

## 13. Error handling

Native errors cross IPC as stable codes, safe Chinese summaries, optional structured details, and a log reference. Raw SQLite messages and sensitive absolute paths are not displayed.

Required M0 failure behavior includes:

- failed creation removes only its verified staging directory;
- unsupported newer schemas are opened neither read-write nor silently downgraded;
- older schemas are backed up before migration;
- failed database transactions do not publish in-memory changes;
- save state distinguishes dirty, saving, saved, error, and recovered;
- concurrent writers are prevented by project locking;
- stale locks require explicit recovery confirmation;
- corrupt projects show an actionable error/recovery screen rather than a blank editor;
- logs identify the operation, safe project identifier, error code, and causal chain.

## 14. Offline and security boundaries

Runtime code may not depend on a CDN, remote font, remote icon, remote map, telemetry endpoint, or business API. An automated offline test rejects every non-localhost request.

Tauri capabilities use least privilege. The frontend does not receive broad filesystem access, arbitrary shell access, or raw SQLite access. FFmpeg is not introduced in M0. Future FFmpeg support is an explicit sidecar capability with a PNG-sequence fallback.

## 15. Verification strategy

### 15.1 Unit tests

- `core-model`: profile restriction, UUIDs, serialization round trips, schema versioning, and migration contracts.
- `command-bus`: commands, transactions, undo, redo, failed validation, persistence failure, and redo truncation.
- `project-store`: state transitions, checkpoint scheduling, close behavior, and replay recovery.
- React: project center, two creation flows, validation messages, profile identity, project overview, and save feedback.

### 15.2 Rust integration tests

- directory creation and staging cleanup;
- manifest validation;
- SQLite initialization, WAL, transactions, and migrations;
- project locking and stale-lock handling;
- relative-path and traversal rejection;
- checkpoint creation and journal replay;
- recovery-copy preservation;
- save, close, and reopen equivalence.

### 15.3 Acceptance scenarios

1. Create one showroom and one market project.
2. Confirm no third profile can be serialized or persisted.
3. Edit project name and tags only through CommandBus.
4. Undo and redo those edits.
5. Save, close, reopen, and compare the restored content.
6. Simulate an interrupted session and verify recovery from checkpoint plus journal.
7. Confirm the project contains no absolute resource paths or large media BLOBs.
8. Block all non-localhost requests and confirm the application remains functional.
9. Confirm every visible action performs a real operation.

At the M0 milestone gate, the required checks are:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `cargo check`
- applicable Playwright tests

These checks are explicitly required by the product brief. No development server, preview server, browser debugging session, or screenshot workflow is started as part of routine verification.

## 16. M0 completion criteria

M0 is complete only when evidence proves all of the following:

- the isolated monorepo and required boundaries exist;
- Studio starts through its supported desktop and web-development entry boundaries;
- project center creates and opens both profiles and no other profile;
- Web development clearly identifies its nonpersistent sandbox, while desktop mode performs real project I/O;
- Aether tokens and implemented component states are visible in `/dev/ui-gallery`;
- `.twinproj` creation is atomic and follows the required directory format;
- SQLite, migrations, locking, CommandBus, undo, redo, transactions, autosave, checkpoints, and crash recovery work;
- save/close/reopen preserves content exactly;
- runtime operation succeeds with all non-localhost access blocked;
- no visible UI action is fake;
- milestone checks pass or any failure is reported honestly.

The milestone report must list completed work, incomplete work, test results, exact commands, known issues, and the next milestone.

## 17. Approved decisions

1. Use `E:\数字孪生\aethertwin` as an isolated product workspace.
2. Keep the full required monorepo shape while importing only implemented M0 modules.
3. Use SQLite as the persistent source of truth and immutable core-model snapshots in memory.
4. Route every project mutation through CommandBus.
5. Durably journal commands and use autosave for compact checkpoints.
6. Show a real project overview in M0 instead of a fake 2D editor.
7. Keep the editor theme fixed and visitor themes independent.
8. Preserve the existing repository applications without runtime coupling.
