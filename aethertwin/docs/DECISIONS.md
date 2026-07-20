# Decisions

## Isolated workspace

AetherTwin is implemented in the isolated `aethertwin/` workspace because the parent repository contains unrelated applications and uncommitted work. The active M0 workspace contains two apps (`studio`, `player`), five TypeScript packages, and two Rust crates (`project-io`, `desktop-host`).

## Two fixed profiles

M0 accepts only `showroom` and `market`. Profile is validated in both TypeScript and Rust contracts and cannot be changed after creation. Conversion is future migration work, not an M0 action.

## Local-first, desktop-first persistence

Project creation/opening, SQLite, locks, recovery, and filesystem paths stay inside `project-io` behind typed Tauri commands. Studio's native adapter validates all returned DTOs and never exposes raw native errors. Recents are application-local preferences; they are not project data.

The web sandbox is deliberately in-memory and Vite-development-only. Production web without Tauri fails closed rather than suggesting a persistent browser implementation.

## Recovery is explicit and non-destructive

The lock marks dirty sessions; a clean close writes `cleanShutdown=true`, checkpoints/WAL-truncates, closes SQLite, and removes the lock. Stale/crash state requires explicit confirmation. Recovery uses verified copies and detects post-publish replacement mismatch. The Task 6 Linux/Android cleanup edge case can still restore a substituted payload under a completed-looking name; hardening that outcome is pending rather than claimed complete.

## Honest M0 UI boundary

M0 shows project center and overview fields that actually work (name, tags, profile/schema/location/save status, save/undo/redo/close). It does not display deferred authoring, BIM, IoT, point-cloud, 3DGS, export, publish, route, or theme controls. M1–M5 remain roadmap work.
