# Decisions

## Isolated workspace

AetherTwin is implemented in the isolated `aethertwin/` workspace because the parent repository contains unrelated Vue/FES/TresJS and OpenRemote work with substantial uncommitted changes. AetherTwin uses React, TypeScript, Vite, pnpm workspaces, Tauri 2, Rust, PixiJS, Three.js/React Three Fiber, and SQLite without runtime or build coupling to the parent applications.
