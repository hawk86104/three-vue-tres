# Decisions

## Isolated workspace

AetherTwin is implemented in the isolated `aethertwin/` workspace because the parent repository contains unrelated applications and uncommitted work. The active M0 workspace contains two apps (`studio`, `player`), five TypeScript packages, and two Rust crates (`project-io`, `desktop-host`).

## Two fixed profiles

M0 accepts only `showroom` and `market`. Profile is validated in both TypeScript and Rust contracts and cannot be changed after creation. Conversion is future migration work, not an M0 action.

## Local-first, desktop-first persistence

Project creation/opening, SQLite, locks, recovery, and filesystem paths stay inside `project-io` behind typed Tauri commands. Studio's native adapter validates all returned DTOs and never exposes raw native errors. Recents are application-local preferences; they are not project data.

The web sandbox is deliberately in-memory and Vite-development-only. Production web without Tauri fails closed rather than suggesting a persistent browser implementation.

## Recovery is explicit and non-destructive

The lock marks dirty sessions; a clean close writes `cleanShutdown=true`, checkpoints/WAL-truncates, closes SQLite, and removes the lock. Stale/crash state requires a structured native `STALE_PROJECT_LOCK` response and explicit UI confirmation; sandbox and unstructured errors never expose recovery. If confirmed recovery fails, the new error is requalified before the action is shown again, so `PROJECT_LOCKED` and every other ineligible result clear the stale recovery path. Recovery uses verified copies and detects post-publish replacement mismatch. On Linux/Android an unverified replacement stays under a hidden quarantine leaf, so cleanup cannot make it look like a completed recovery artifact.

## Checkpoint acknowledgement and shutdown

Native checkpoint returns one authoritative manifest/snapshot envelope. ProjectStore rejects an incoherent envelope, then CommandBus rebases the current state and every undo/redo endpoint with the durable checkpoint metadata while preserving sequence and history. The Rust session does not publish its new in-memory manifest/snapshot until the database checkpoint and manifest rewrite have both succeeded.

Desktop window close and process exit both attempt `close_all`. Create/open/recover hold a shared lifecycle lease through session publication; `close_all` takes the exclusive lease, waits for those producers, drains the registry, and verifies it is empty before returning success. It records successful shutdown while still exclusive, causing waiting and later producers to fail instead of publishing after the drain. A failed shutdown does not set that closed state and releases the lease for normal production and retry. Each native session is closed without holding the registry lock; successful entries are removed, failures remain retryable, and any failure prevents the requested close/exit while exposing only a sanitized message and log reference.

## Honest M0 UI boundary

M0 shows project center and overview fields that actually work (name, tags, profile/schema/location/save status, save/undo/redo/close). It does not display deferred authoring, BIM, IoT, point-cloud, 3DGS, export, publish, route, or theme controls. M1–M5 remain roadmap work.
