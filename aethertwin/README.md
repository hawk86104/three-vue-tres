# AetherTwin Studio

AetherTwin M0 is a local-first project foundation with exactly two immutable profiles: `showroom` and `market`. M0 provides the Studio project center, project overview, persistence contracts, recovery/locking, an Aether component system, and an intentionally noninteractive Player boundary. It does **not** complete the wider product plan.

The implementation is an isolated pnpm/Cargo workspace. Studio is the M0 application boundary; Player contains only an M4 availability message and no loading, visitor, kiosk, media, or export feature.

## Actual M0 dependency direction

```text
Studio React application
  -> core-model + design-system + editor-shell + project-store
  -> editor-shell -> core-model + design-system
  -> project-store -> command-bus + core-model

Desktop backend
  -> TauriProjectBackend -> desktop-host -> project-io -> SQLite/filesystem

Studio web development sandbox
  -> SandboxProjectBackend (in-memory only; no native filesystem or SQLite)
```

`project-store` is the UI persistence coordinator; CommandBus serializes mutations and publishes only after its persistence operation commits. Native `desktop-host` owns the typed Tauri command boundary; `project-io` owns `.twinproj`, SQLite, locking, and recovery.

## Local entry points and current verification status

From this workspace root, the manifests declare `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd test`, and `pnpm.cmd build`; Cargo declares `cargo check --workspace`; Studio and Player each declare a Vite `build` script. Tauri points production assets at `apps/studio/dist` and declares `http://localhost:5173` only as its development URL.

These are entry points, not fresh success claims. For this M0 documentation task, build, runtime, server, browser, and Playwright commands were not authorized or run. In a non-Tauri production web context, Studio deliberately fails closed; the in-memory sandbox is selected only in Vite development mode. See [docs/M0_REPORT.md](docs/M0_REPORT.md) for the evidence boundary.
