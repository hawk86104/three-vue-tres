# AetherTwin Studio M0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the isolated AetherTwin M0 monorepo with a real two-profile project center, versioned local project storage, transactional CommandBus, autosave/recovery, Aether editor shell, and offline acceptance evidence.

**Architecture:** Create `E:\数字孪生\aethertwin` as an independent pnpm and Cargo workspace. React consumes immutable core-model snapshots through Project Store and CommandBus; desktop persistence crosses typed Tauri commands into Rust `project-io`, while web development uses an explicitly labeled in-memory sandbox.

**Tech Stack:** Node.js 24, pnpm 11, React, TypeScript, Vite, Vitest, Testing Library, Zustand, Radix Primitives, Lucide, Tauri 2, Rust 1.94, rusqlite, serde, UUID, SHA-256, Playwright.

## Global Constraints

- Product profiles are exactly `"showroom" | "market"`; profile is immutable after creation.
- Runtime must work with every non-localhost request blocked; no CDN, remote font, telemetry, remote map, or business API.
- SQLite is persistent authority; Zustand stores transient UI state only.
- Every project mutation goes through CommandBus and a persistence transaction.
- Project resources use SHA-256 and project-relative paths; never persist drive letters, UNC paths, parent traversal, or large media BLOBs.
- The editor is 2D-first; M0 presents a real project overview and does not expose unfinished M1-M5 controls.
- Editor appearance uses the fixed Aether system; visitor themes remain separate.
- External npm dependencies are installed with `--save-exact` and the lockfile is committed; Tauri packages must resolve major version 2.
- Rust dependencies are workspace-managed and `Cargo.lock` is committed.
- Run install, lint, typecheck, test, build, Cargo, and Playwright commands from `E:\数字孪生\aethertwin`; run every shown `git add`/`git commit` block from `E:\数字孪生` because its paths are parent-relative.
- Follow `E:\数字孪生\AGENTS.md`: do not start dev/preview servers, browser debugging, or screenshots outside the explicitly required milestone checks.
- Preserve all unrelated dirty files in the parent repository; stage and commit only `aethertwin/**` paths for this work.

Every library `tsconfig.json` created in Tasks 2, 3, 4, 8, and 9 uses:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

Every app `tsconfig.json` created in Tasks 10 and 12 uses:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["vite/client"] },
  "include": ["src", "vite.config.ts"]
}
```

---

## File and responsibility map

### Workspace and policy

- `aethertwin/package.json` — root scripts and pinned tool dependencies.
- `aethertwin/pnpm-workspace.yaml` — JavaScript workspace membership.
- `aethertwin/tsconfig.base.json` — strict shared TypeScript settings.
- `aethertwin/eslint.config.mjs` — lint rules and browser/Node globals.
- `aethertwin/vitest.config.ts` — shared package test discovery.
- `aethertwin/Cargo.toml` — Rust workspace and shared dependency ranges.
- `aethertwin/.gitignore` — generated outputs only.
- `aethertwin/tests/workspace-structure.test.mjs` — required directory and policy contract.
- `aethertwin/AGENTS.md`, `README.md`, `THIRD_PARTY_NOTICES.md` — local operating rules and notices.
- `aethertwin/docs/*.md` — architecture, product, format, design, roadmap, decisions, and license policy.

### TypeScript domain packages

- `packages/core-model/src/model.ts` — profile, manifest, project, floor, snapshot, and asset record types.
- `packages/core-model/src/validation.ts` — runtime parsing and invariant checks.
- `packages/core-model/src/migrations.ts` — schema migration registry.
- `packages/command-bus/src/types.ts` — commands, batches, journals, and persistence port.
- `packages/command-bus/src/command-bus.ts` — execute, transaction, undo, redo, and durable ordering.
- `packages/project-store/src/backend.ts` — native-agnostic `ProjectBackend` contract.
- `packages/project-store/src/project-store.ts` — snapshot/save-state orchestration and autosave.
- `packages/project-store/src/sandbox-backend.ts` — labeled nonpersistent web backend.

### Rust native packages

- `crates/project-io/src/model.rs` — serde-compatible manifest and request/response contracts.
- `crates/project-io/src/schema.rs` — SQLite schema and migrations.
- `crates/project-io/src/paths.rs` — project and resource path validation.
- `crates/project-io/src/project.rs` — create, open, commit, checkpoint, close, and recover.
- `crates/project-io/src/lock.rs` — concurrent-writer protection.
- `crates/project-io/src/error.rs` — stable safe error codes.
- `crates/desktop-host/src/commands.rs` — typed Tauri command surface.
- `crates/desktop-host/src/state.rs` — open-session registry.
- `crates/desktop-host/src/main.rs` — Tauri bootstrap and least-privilege plugins.

### UI packages and apps

- `packages/design-system/src/tokens.css` — Aether color, spacing, type, radius, and motion tokens.
- `packages/design-system/src/components/*` — accessible Button, Field, Dialog, Badge, Panel, and StatusNotice.
- `packages/editor-shell/src/editor-shell.tsx` — header, project tree, workspace, inspector, hidden lower dock.
- `apps/studio/src/backend/tauri-backend.ts` — `ProjectBackend` Tauri adapter.
- `apps/studio/src/backend/select-backend.ts` — production versus sandbox selection.
- `apps/studio/src/features/project-center/*` — recent, create, and open flows.
- `apps/studio/src/features/project-overview/*` — real M0 workspace and CommandBus actions.
- `apps/studio/src/dev/ui-gallery.tsx` — implemented design-system states.
- `apps/studio/src/app.tsx` — application state and top-level error/recovery routing.
- `apps/player/*` — independent build boundary with no Studio navigation.
- `apps/studio/e2e/m0.spec.ts` — two-profile, no-fake-action, save-state, and offline web-sandbox checks.

---

### Task 1: Establish the isolated workspace and documented boundaries

**Files:**
- Create: `aethertwin/tests/workspace-structure.test.mjs`
- Create: `aethertwin/package.json`
- Create: `aethertwin/pnpm-workspace.yaml`
- Create: `aethertwin/pnpm-lock.yaml` in Step 4
- Create: `aethertwin/tsconfig.base.json`
- Create: `aethertwin/eslint.config.mjs`
- Create: `aethertwin/vitest.config.ts`
- Create: `aethertwin/Cargo.toml`
- Create: `aethertwin/.gitignore`
- Create: `aethertwin/AGENTS.md`
- Create: `aethertwin/README.md`
- Create: `aethertwin/THIRD_PARTY_NOTICES.md`
- Create: `aethertwin/apps/studio/package.json`
- Create: `aethertwin/apps/player/package.json`
- Create: `aethertwin/packages/core-model/package.json`
- Create: `aethertwin/packages/command-bus/package.json`
- Create: `aethertwin/packages/project-store/package.json`
- Create: `aethertwin/packages/design-system/package.json`
- Create: `aethertwin/packages/editor-shell/package.json`
- Create: `aethertwin/docs/ARCHITECTURE.md`
- Create: `aethertwin/docs/PRODUCT_SPEC.md`
- Create: `aethertwin/docs/PROJECT_FORMAT.md`
- Create: `aethertwin/docs/DESIGN_SYSTEM.md`
- Create: `aethertwin/docs/ROADMAP.md`
- Create: `aethertwin/docs/DECISIONS.md`
- Create: `aethertwin/docs/LICENSE_POLICY.md`
- Create: required deferred package/crate `.gitkeep` files listed in Step 3.

**Interfaces:**
- Consumes: approved design `docs/superpowers/specs/2026-07-17-aethertwin-m0-foundation-design.md`.
- Produces: workspace scripts `lint`, `typecheck`, `test`, and `build`; required package and crate paths; policy documents used by every later task.

- [ ] **Step 1: Write the failing workspace structure contract**

```js
// tests/workspace-structure.test.mjs
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("..", import.meta.url));
const required = [
  "apps/studio",
  "apps/player",
  "packages/core-model",
  "packages/command-bus",
  "packages/project-store",
  "packages/asset-pipeline",
  "packages/design-system",
  "packages/editor-shell",
  "packages/plan-engine",
  "packages/render-plan-2d",
  "packages/render-scene-3d",
  "packages/route-engine",
  "packages/label-engine",
  "packages/mode-showroom",
  "packages/mode-market",
  "packages/theme-engine",
  "packages/story-engine",
  "packages/data-importer",
  "packages/exporter",
  "packages/plugin-sdk",
  "crates/desktop-host",
  "crates/project-io",
  "crates/asset-io",
  "crates/media-export",
  "docs/ARCHITECTURE.md",
  "docs/PRODUCT_SPEC.md",
  "docs/PROJECT_FORMAT.md",
  "docs/DESIGN_SYSTEM.md",
  "docs/ROADMAP.md",
  "docs/DECISIONS.md",
  "docs/LICENSE_POLICY.md",
  "AGENTS.md",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
];

test("required M0 workspace boundaries exist", () => {
  for (const relative of required) {
    assert.ok(existsSync(join(root, relative)), `missing ${relative}`);
  }
});

test("workspace exposes only the two product profiles", () => {
  const spec = readFileSync(join(root, "docs/PRODUCT_SPEC.md"), "utf8");
  assert.match(spec, /showroom/);
  assert.match(spec, /market/);
  assert.doesNotMatch(spec, /third profile/i);
});
```

- [ ] **Step 2: Run the contract to prove the workspace is absent**

Run: `node --test tests/workspace-structure.test.mjs`
Expected: FAIL with at least `missing apps/studio`.

- [ ] **Step 3: Create the exact workspace skeleton**

Create tracked empty boundary files at:

```text
apps/studio/.gitkeep
apps/player/.gitkeep
packages/core-model/.gitkeep
packages/command-bus/.gitkeep
packages/project-store/.gitkeep
packages/design-system/.gitkeep
packages/editor-shell/.gitkeep
packages/asset-pipeline/.gitkeep
packages/plan-engine/.gitkeep
packages/render-plan-2d/.gitkeep
packages/render-scene-3d/.gitkeep
packages/route-engine/.gitkeep
packages/label-engine/.gitkeep
packages/mode-showroom/.gitkeep
packages/mode-market/.gitkeep
packages/theme-engine/.gitkeep
packages/story-engine/.gitkeep
packages/data-importer/.gitkeep
packages/exporter/.gitkeep
packages/plugin-sdk/.gitkeep
crates/asset-io/.gitkeep
crates/media-export/.gitkeep
crates/desktop-host/.gitkeep
crates/project-io/.gitkeep
```

Use these root manifests:

```json
{
  "name": "aethertwin",
  "private": true,
  "packageManager": "pnpm@11.9.0",
  "engines": { "node": ">=24.0.0", "pnpm": ">=11.0.0" },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "pnpm -r --if-present typecheck",
    "test": "node --test tests/*.test.mjs && vitest run",
    "build": "pnpm -r --if-present build"
  }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - apps/*
  - packages/*
```

```toml
# Cargo.toml
[workspace]
resolver = "2"
members = ["crates/project-io"]

[workspace.package]
edition = "2024"
rust-version = "1.94"
license = "Apache-2.0"

[workspace.dependencies]
chrono = { version = "0.4", features = ["serde"] }
fs2 = "0.4"
rusqlite = { version = "0.40", features = ["bundled", "serde_json"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sha2 = "0.10"
tauri = "2"
tauri-build = "2"
tauri-plugin-dialog = "2"
tauri-plugin-single-instance = "2"
tempfile = "3"
thiserror = "2"
uuid = { version = "1", features = ["v4", "serde"] }
```

Use this generated-output-only ignore file; do not ignore either lockfile:

```gitignore
# .gitignore
node_modules/
dist/
target/
coverage/
test-results/
playwright-report/
*.log
.DS_Store
```

Use this shared Vitest configuration:

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.{ts,tsx}", "apps/**/*.test.{ts,tsx}"],
  },
});
```

Use these shared TypeScript and ESLint configurations:

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useDefineForClassFields": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

```js
// eslint.config.mjs
import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/target/**", "**/coverage/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error"
    }
  }
);
```

Create the five library manifests with exactly these bodies (only `name` differs):

`packages/core-model/package.json`:

```json
{
  "name": "@aethertwin/core-model",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run --root .",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "build": "tsc -p tsconfig.json --noEmit"
  }
}
```

`packages/command-bus/package.json`:

```json
{
  "name": "@aethertwin/command-bus",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run --root .",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "build": "tsc -p tsconfig.json --noEmit"
  }
}
```

`packages/project-store/package.json`:

```json
{
  "name": "@aethertwin/project-store",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run --root .",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "build": "tsc -p tsconfig.json --noEmit"
  }
}
```

`packages/design-system/package.json`:

```json
{
  "name": "@aethertwin/design-system",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run --root .",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "build": "tsc -p tsconfig.json --noEmit"
  }
}
```

`packages/editor-shell/package.json`:

```json
{
  "name": "@aethertwin/editor-shell",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run --root .",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "build": "tsc -p tsconfig.json --noEmit"
  }
}
```

Create the app manifests with these exact bodies:

`apps/studio/package.json`:

```json
{
  "name": "@aethertwin/studio",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run --root .",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "build": "vite build"
  }
}
```

`apps/player/package.json`:

```json
{
  "name": "@aethertwin/player",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run --root .",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "build": "vite build"
  }
}
```

- [ ] **Step 4: Install and pin root JavaScript tooling**

Run:

```powershell
pnpm.cmd add -Dw -E typescript@latest vite@latest vitest@latest eslint@latest '@eslint/js'@latest typescript-eslint@latest globals@latest '@types/node'@latest
```

Expected: `package.json` contains exact versions and `pnpm-lock.yaml` is created without modifying the parent repository lockfiles.

- [ ] **Step 5: Write concise policy documents**

`docs/ARCHITECTURE.md` must include the dependency direction from the approved design. `docs/PRODUCT_SPEC.md` must state the exact two profiles and M0 exclusions. `docs/PROJECT_FORMAT.md` must state the directory format and relative-path rule. `docs/DESIGN_SYSTEM.md` must state Aether visual constraints. `docs/ROADMAP.md` must list M0-M5 without making later milestones optional. `docs/DECISIONS.md` must record the isolated-workspace decision. `docs/LICENSE_POLICY.md` and `THIRD_PARTY_NOTICES.md` must require license review before adding shipped dependencies.

- [ ] **Step 6: Run the structure contract**

Run: `node --test tests/workspace-structure.test.mjs`
Expected: PASS, 2 tests.

- [ ] **Step 7: Commit the workspace boundary**

```powershell
git add -- aethertwin/package.json aethertwin/pnpm-workspace.yaml aethertwin/pnpm-lock.yaml aethertwin/tsconfig.base.json aethertwin/eslint.config.mjs aethertwin/vitest.config.ts aethertwin/Cargo.toml aethertwin/.gitignore aethertwin/AGENTS.md aethertwin/README.md aethertwin/THIRD_PARTY_NOTICES.md aethertwin/docs aethertwin/tests aethertwin/apps aethertwin/packages aethertwin/crates
git commit -m "chore: establish AetherTwin workspace"
```

---

### Task 2: Implement the versioned core model

**Files:**
- Modify: `aethertwin/packages/core-model/package.json`
- Create: `aethertwin/packages/core-model/tsconfig.json`
- Create: `aethertwin/packages/core-model/src/model.ts`
- Create: `aethertwin/packages/core-model/src/validation.ts`
- Create: `aethertwin/packages/core-model/src/migrations.ts`
- Create: `aethertwin/packages/core-model/src/index.ts`
- Create: `aethertwin/packages/core-model/src/core-model.test.ts`
- Create: `aethertwin/fixtures/contracts/manifest.v1.json`

**Interfaces:**
- Consumes: UUID, timestamp, profile, and schema constraints from Task 1 documents.
- Produces: `ProjectProfile`, `ProjectManifest`, `SpatialProject`, `Floor`, `ProjectSnapshot`, `AssetRecord`, `createInitialSnapshot`, `parseManifest`, `parseSnapshot`, and `migrateSnapshot`.

- [ ] **Step 1: Write failing core-model tests**

```ts
// packages/core-model/src/core-model.test.ts
import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  createManifest,
  createInitialSnapshot,
  parseManifest,
  parseSnapshot,
} from "./index";

const validManifest = {
  schemaVersion: 1,
  projectId: "00000000-0000-4000-8000-000000000001",
  name: "Demo",
  profile: "showroom",
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z",
  appVersion: "0.1.0",
  minCompatibleAppVersion: "0.1.0",
};

describe("core model", () => {
  it.each(["showroom", "market"] as const)("creates a %s project", (profile) => {
    const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];
    const snapshot = createInitialSnapshot({
      name: "Demo",
      profile,
      uuid: () => ids.shift()!,
    });
    expect(snapshot.project.profile).toBe(profile);
    expect(snapshot.project.floors).toHaveLength(1);
    expect(snapshot.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(parseSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
    expect(createManifest(snapshot, {
      now: () => "2026-07-17T00:00:00.000Z",
      appVersion: "0.1.0",
    }).profile).toBe(profile);
  });

  it("rejects a third profile", () => {
    expect(() => parseManifest({ ...validManifest, profile: "iot" })).toThrow(/profile/i);
  });

  it("rejects absolute asset paths", () => {
    const snapshot = createInitialSnapshot({ name: "Demo", profile: "market" });
    expect(() => parseSnapshot({
      ...snapshot,
      assets: [{ id: crypto.randomUUID(), sha256: "a".repeat(64), relativePath: "C:\\media\\x.png", mediaType: "image/png", size: 1 }],
    })).toThrow(/relativePath/);
  });
});
```

- [ ] **Step 2: Run the package test and confirm failure**

Run: `pnpm.cmd --filter @aethertwin/core-model test`
Expected: FAIL because `./index` does not exist.

- [ ] **Step 3: Implement exact M0 model contracts**

```ts
// packages/core-model/src/model.ts
export const CURRENT_SCHEMA_VERSION = 1 as const;
export type ProjectProfile = "showroom" | "market";
export type SaveState = "dirty" | "saving" | "saved" | "error" | "recovered";

export interface ProjectManifest {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  projectId: string;
  name: string;
  profile: ProjectProfile;
  createdAt: string;
  updatedAt: string;
  appVersion: string;
  minCompatibleAppVersion: string;
}

export interface Floor {
  id: string;
  name: string;
  tags: string[];
}

export interface SpatialProject {
  id: string;
  name: string;
  tags: string[];
  profile: ProjectProfile;
  floors: Floor[];
}

export interface AssetRecord {
  id: string;
  sha256: string;
  relativePath: string;
  mediaType: string;
  size: number;
}

export interface ProjectSnapshot {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  sequence: number;
  checkpointSequence: number;
  project: SpatialProject;
  assets: AssetRecord[];
}

export interface InitialProjectInput {
  name: string;
  profile: ProjectProfile;
  uuid?: () => string;
}

export function createInitialSnapshot(input: InitialProjectInput): ProjectSnapshot {
  const makeId = input.uuid ?? (() => crypto.randomUUID());
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sequence: 0,
    checkpointSequence: 0,
    project: {
      id: makeId(),
      name: input.name.trim(),
      tags: [],
      profile: input.profile,
      floors: [{ id: makeId(), name: "一层", tags: [] }],
    },
    assets: [],
  };
}

export function createManifest(
  snapshot: ProjectSnapshot,
  options: { now?: () => string; appVersion: string },
): ProjectManifest {
  const timestamp = (options.now ?? (() => new Date().toISOString()))();
  return {
    schemaVersion: snapshot.schemaVersion,
    projectId: snapshot.project.id,
    name: snapshot.project.name,
    profile: snapshot.project.profile,
    createdAt: timestamp,
    updatedAt: timestamp,
    appVersion: options.appVersion,
    minCompatibleAppVersion: options.appVersion,
  };
}
```

Implement `validation.ts` with explicit object checks, ISO timestamp checks, UUID checks, 64-character lowercase hex SHA-256 checks, and `relativePath` rejection for `/`, `\\`, drive prefixes, UNC prefixes, and `..` segments. `migrations.ts` must export a registry keyed by source schema version and throw `UNSUPPORTED_SCHEMA_VERSION` for versions newer than 1.

- [ ] **Step 4: Add the shared manifest fixture**

```json
{
  "schemaVersion": 1,
  "projectId": "00000000-0000-4000-8000-000000000001",
  "name": "Showroom Demo",
  "profile": "showroom",
  "createdAt": "2026-07-17T00:00:00.000Z",
  "updatedAt": "2026-07-17T00:00:00.000Z",
  "appVersion": "0.1.0",
  "minCompatibleAppVersion": "0.1.0"
}
```

- [ ] **Step 5: Run model tests**

Run: `pnpm.cmd --filter @aethertwin/core-model test`
Expected: PASS with both profiles, third-profile rejection, round-trip serialization, and path validation covered.

- [ ] **Step 6: Commit the core model**

```powershell
git add -- aethertwin/packages/core-model aethertwin/fixtures/contracts/manifest.v1.json
git commit -m "feat: add versioned AetherTwin core model"
```

---

### Task 3: Implement transactional CommandBus

**Files:**
- Modify: `aethertwin/packages/command-bus/package.json`
- Create: `aethertwin/packages/command-bus/tsconfig.json`
- Create: `aethertwin/packages/command-bus/src/types.ts`
- Create: `aethertwin/packages/command-bus/src/command-bus.ts`
- Create: `aethertwin/packages/command-bus/src/index.ts`
- Create: `aethertwin/packages/command-bus/src/command-bus.test.ts`

**Interfaces:**
- Consumes: immutable state type `S` and a `PersistencePort<S>`.
- Produces: `CommandDefinition<S, P>`, `CommandIntent<S>`, `CommitBatch<S>`, `JournalOperation`, and `CommandBus<S>` with `execute`, `transaction`, `undo`, `redo`, and `getSnapshot`.

- [ ] **Step 1: Write failing transaction and rollback tests**

```ts
// packages/command-bus/src/command-bus.test.ts
import { describe, expect, it, vi } from "vitest";
import { CommandBus, commandIntent, type CommandDefinition } from "./index";

interface State { name: string; tags: string[]; sequence: number }
const rename: CommandDefinition<State, { name: string }> = {
  type: "project.rename",
  prepare: (state, payload) => ({
    next: { ...state, name: payload.name },
    inversePayload: { name: state.name },
  }),
  applyInverse: (state, payload) => ({ ...state, name: (payload as { name: string }).name }),
};

describe("CommandBus", () => {
  it("publishes only after persistence commits", async () => {
    let release!: () => void;
    const commit = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const bus = new CommandBus({ name: "Old", tags: [], sequence: 0 }, { commit });
    const pending = bus.execute(rename, { name: "New" });
    expect(bus.getSnapshot().name).toBe("Old");
    release();
    await pending;
    expect(bus.getSnapshot().name).toBe("New");
  });

  it("keeps state and history unchanged when persistence fails", async () => {
    const bus = new CommandBus({ name: "Old", tags: [], sequence: 0 }, {
      commit: vi.fn().mockRejectedValue(new Error("disk full")),
    });
    await expect(bus.execute(rename, { name: "New" })).rejects.toThrow("disk full");
    expect(bus.getSnapshot().name).toBe("Old");
    expect(bus.canUndo()).toBe(false);
  });

  it("groups a transaction into one commit and one undo step", async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const bus = new CommandBus({ name: "Old", tags: [], sequence: 0 }, { commit });
    await bus.transaction([
      commandIntent(rename, { name: "A" }),
      commandIntent(rename, { name: "B" }),
    ]);
    expect(commit).toHaveBeenCalledTimes(1);
    await bus.undo();
    expect(bus.getSnapshot().name).toBe("Old");
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm.cmd --filter @aethertwin/command-bus test`
Expected: FAIL because `CommandBus` is not exported.

- [ ] **Step 3: Implement the persistence contracts**

```ts
// packages/command-bus/src/types.ts
export interface PreparedMutation<S> {
  next: S;
  inversePayload: unknown;
}

export interface SequencedState {
  sequence: number;
}

export interface CommandDefinition<S extends SequencedState, P> {
  type: string;
  prepare(state: S, payload: P): PreparedMutation<S>;
  applyInverse(state: S, inversePayload: unknown): S;
}

export interface CommandIntent<S extends SequencedState> {
  type: string;
  payload: unknown;
  prepare(state: S): PreparedMutation<S>;
  applyInverse(state: S, inversePayload: unknown): S;
}

export function commandIntent<S extends SequencedState, P>(
  definition: CommandDefinition<S, P>,
  payload: P,
): CommandIntent<S> {
  return {
    type: definition.type,
    payload,
    prepare: (state) => definition.prepare(state, payload),
    applyInverse: (state, inversePayload) => definition.applyInverse(state, inversePayload),
  };
}

export interface JournalOperation {
  sequence: number;
  transactionId: string;
  commandType: string;
  payload: unknown;
  inversePayload: unknown;
  action: "apply" | "undo" | "redo";
  timestamp: string;
}

export interface CommitBatch<S extends SequencedState> {
  before: S;
  after: S;
  journal: JournalOperation[];
}

export interface PersistencePort<S extends SequencedState> {
  commit(batch: CommitBatch<S>): Promise<void>;
}
```

Implement this exact public surface in `command-bus.ts`:

```ts
export class CommandBus<S extends SequencedState> {
  constructor(initial: S, persistence: PersistencePort<S>);
  getSnapshot(): S;
  canUndo(): boolean;
  canRedo(): boolean;
  execute<P>(definition: CommandDefinition<S, P>, payload: P): Promise<S>;
  transaction(intents: readonly CommandIntent<S>[]): Promise<S>;
  undo(): Promise<S>;
  redo(): Promise<S>;
}
```

A candidate state and journal are fully prepared before `PersistencePort.commit`; each prepared state is copied with the next monotonic `sequence` before persistence. Publish state and modify undo/redo stacks only after the promise resolves. `execute` delegates to `transaction([commandIntent(definition, payload)])`. `transaction` uses one `crypto.randomUUID()` value, one commit, one history entry, and consecutive journal sequence values. `undo` persists the transaction's original `before` state copied with a new sequence and `action: "undo"`; `redo` persists its `after` state copied with a new sequence and `action: "redo"`. A new successful execute after undo clears redo history. Export every Task 3 contract and `commandIntent` from `src/index.ts`.

- [ ] **Step 4: Add undo, redo, and branch tests**

Add cases that assert sequence numbers strictly increase across apply/undo/redo, a new command clears redo, and failed undo leaves both state and history unchanged.

- [ ] **Step 5: Run CommandBus tests**

Run: `pnpm.cmd --filter @aethertwin/command-bus test`
Expected: PASS with transaction, rollback, undo, redo, and history branching covered.

- [ ] **Step 6: Commit CommandBus**

```powershell
git add -- aethertwin/packages/command-bus
git commit -m "feat: add transactional command bus"
```

---

### Task 4: Define ProjectBackend and Project Store orchestration

**Files:**
- Modify: `aethertwin/packages/project-store/package.json`
- Modify: `aethertwin/pnpm-lock.yaml`
- Create: `aethertwin/packages/project-store/tsconfig.json`
- Create: `aethertwin/packages/project-store/src/backend.ts`
- Create: `aethertwin/packages/project-store/src/project-commands.ts`
- Create: `aethertwin/packages/project-store/src/project-store.ts`
- Create: `aethertwin/packages/project-store/src/sandbox-backend.ts`
- Create: `aethertwin/packages/project-store/src/recent-projects.ts`
- Create: `aethertwin/packages/project-store/src/index.ts`
- Create: `aethertwin/packages/project-store/src/project-store.test.ts`

**Interfaces:**
- Consumes: `ProjectSnapshot`, `ProjectManifest`, `ProjectProfile`, `CommandBus`, and `CommitBatch<ProjectSnapshot>`.
- Produces: `ProjectBackend`, `OpenedProject`, `ProjectStore`, `SandboxProjectBackend`, `renameProjectCommand`, `setProjectTagsCommand`, and `ProjectStoreState`.

- [ ] **Step 1: Write failing Project Store tests**

Before writing the test, add exact internal dependencies:

```powershell
pnpm.cmd --filter @aethertwin/project-store add '@aethertwin/core-model@workspace:*' '@aethertwin/command-bus@workspace:*'
```

```ts
// packages/project-store/src/project-store.test.ts
import { describe, expect, it, vi } from "vitest";
import { SandboxProjectBackend, ProjectStore } from "./index";

describe("ProjectStore", () => {
  it("creates only showroom or market projects", async () => {
    const store = new ProjectStore(new SandboxProjectBackend());
    await store.create({ name: "Market", location: "sandbox", profile: "market" });
    expect(store.getState().snapshot?.project.profile).toBe("market");
  });

  it("moves from dirty to saved after an autosave checkpoint", async () => {
    vi.useFakeTimers();
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend, { autosaveDelayMs: 500 });
    await store.create({ name: "Demo", location: "sandbox", profile: "showroom" });
    await store.renameProject("Renamed");
    expect(store.getState().saveState).toBe("dirty");
    await vi.advanceTimersByTimeAsync(500);
    expect(store.getState().saveState).toBe("saved");
    expect(backend.checkpointCount).toBe(1);
  });

  it("surfaces persistence failure without publishing the rename", async () => {
    const backend = new SandboxProjectBackend();
    const store = new ProjectStore(backend);
    await store.create({ name: "Old", location: "sandbox", profile: "market" });
    backend.failNextCommit = new Error("disk full");
    await expect(store.renameProject("New")).rejects.toThrow("disk full");
    expect(store.getState().snapshot?.project.name).toBe("Old");
    expect(store.getState().saveState).toBe("error");
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm.cmd --filter @aethertwin/project-store test`
Expected: FAIL because the backend and store are not implemented.

- [ ] **Step 3: Define the exact backend contract**

```ts
// packages/project-store/src/backend.ts
import type { CommitBatch } from "@aethertwin/command-bus";
import type { ProjectManifest, ProjectProfile, ProjectSnapshot } from "@aethertwin/core-model";

export interface CreateProjectRequest {
  name: string;
  location: string;
  profile: ProjectProfile;
}

export interface OpenedProject {
  projectPath: string;
  manifest: ProjectManifest;
  snapshot: ProjectSnapshot;
  recovered: boolean;
}

export interface ProjectBackend {
  readonly mode: "desktop" | "sandbox";
  createProject(request: CreateProjectRequest): Promise<OpenedProject>;
  openProject(projectPath: string): Promise<OpenedProject>;
  commit(projectPath: string, batch: CommitBatch<ProjectSnapshot>): Promise<void>;
  checkpoint(projectPath: string, snapshot: ProjectSnapshot): Promise<ProjectManifest>;
  closeProject(projectPath: string): Promise<void>;
}
```

- [ ] **Step 4: Implement commands and store state machine**

`renameProjectCommand` trims and validates a nonempty name and returns the previous name as inverse payload. `setProjectTagsCommand` normalizes unique trimmed tags and returns the previous tags. `ProjectStore` owns one `CommandBus<ProjectSnapshot>`, exposes immutable state through `getState`/`subscribe`, schedules one injected timeout after committed mutations, sets `saving` during checkpoint, sets `saved` only after checkpoint returns, and sets `error` without discarding the durable current snapshot when checkpoint fails.

- [ ] **Step 5: Implement the deterministic sandbox backend**

The sandbox backend must use `createInitialSnapshot`, keep projects in a `Map<string, OpenedProject>`, use paths formatted `sandbox://<project-id>`, clone all values on read/write, expose `checkpointCount` for tests, and reject any profile value outside the compile-time union through runtime core-model parsing. It must never call filesystem, IndexedDB, network, or Tauri APIs.

- [ ] **Step 6: Implement recent-project preferences**

Store `{ path, name, profile, openedAt }` in application-local storage through an injected `KeyValueStorage` interface. Never serialize recent paths into `ProjectSnapshot`, manifest fixtures, or export data.

- [ ] **Step 7: Run Project Store tests**

Run: `pnpm.cmd --filter @aethertwin/project-store test`
Expected: PASS for creation, durable publish ordering, autosave, checkpoint errors, undo/redo delegation, close, and recent-project isolation.

- [ ] **Step 8: Commit Project Store**

```powershell
git add -- aethertwin/packages/project-store aethertwin/pnpm-lock.yaml
git commit -m "feat: add project store and sandbox backend"
```

---

### Task 5: Create the Rust project format and SQLite schema

**Files:**
- Create: `aethertwin/Cargo.lock` when the first Cargo test runs
- Create: `aethertwin/crates/project-io/Cargo.toml`
- Create: `aethertwin/crates/project-io/src/lib.rs`
- Create: `aethertwin/crates/project-io/src/model.rs`
- Create: `aethertwin/crates/project-io/src/error.rs`
- Create: `aethertwin/crates/project-io/src/paths.rs`
- Create: `aethertwin/crates/project-io/src/schema.rs`
- Create: `aethertwin/crates/project-io/src/project.rs`
- Create: `aethertwin/crates/project-io/tests/create_open.rs`
- Create: `aethertwin/crates/project-io/tests/contract_fixture.rs`

**Interfaces:**
- Consumes: `fixtures/contracts/manifest.v1.json` and the project format contract.
- Produces: `CreateProjectRequest`, `ProjectManifest`, `ProjectSnapshot`, `OpenedProject`, `ProjectIoError`, `create_project`, and `open_project`.

- [ ] **Step 1: Write failing Rust creation tests**

Create the crate manifest first so Cargo can compile the test target:

```toml
# crates/project-io/Cargo.toml
[package]
name = "project-io"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
license.workspace = true

[dependencies]
chrono.workspace = true
fs2.workspace = true
rusqlite.workspace = true
serde.workspace = true
serde_json.workspace = true
sha2.workspace = true
thiserror.workspace = true
uuid.workspace = true

[dev-dependencies]
tempfile.workspace = true
```

```rust
// crates/project-io/tests/create_open.rs
use project_io::{create_project, open_project, CreateProjectRequest, ProjectProfile};
use tempfile::tempdir;

#[test]
fn creates_and_reopens_both_profiles() {
    for profile in [ProjectProfile::Showroom, ProjectProfile::Market] {
        let root = tempdir().unwrap();
        let opened = create_project(CreateProjectRequest {
            parent: root.path().to_path_buf(),
            name: "Demo".into(),
            profile,
        }).unwrap();
        assert!(opened.project_path.ends_with("Demo.twinproj"));
        for entry in ["manifest.json", "project.db", "assets", "thumbnails", "derived", "exports"] {
            assert!(opened.project_path.join(entry).exists(), "missing {entry}");
        }
        let reopened = open_project(&opened.project_path).unwrap();
        assert_eq!(opened.snapshot, reopened.snapshot);
    }
}

#[test]
fn never_overwrites_an_existing_project() {
    let root = tempdir().unwrap();
    let request = CreateProjectRequest {
        parent: root.path().to_path_buf(),
        name: "Demo".into(),
        profile: ProjectProfile::Market,
    };
    create_project(request.clone()).unwrap();
    let error = create_project(request).unwrap_err();
    assert_eq!(error.code(), "PROJECT_ALREADY_EXISTS");
}
```

- [ ] **Step 2: Run Rust tests and confirm failure**

Run: `cargo test -p project-io --test create_open`
Expected: FAIL because crate `project-io` does not exist.

- [ ] **Step 3: Define serde contracts matching TypeScript**

```rust
// crates/project-io/src/model.rs
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProjectProfile { Showroom, Market }

#[derive(Clone, Debug)]
pub struct CreateProjectRequest {
    pub parent: PathBuf,
    pub name: String,
    pub profile: ProjectProfile,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectManifest {
    pub schema_version: u32,
    pub project_id: Uuid,
    pub name: String,
    pub profile: ProjectProfile,
    pub created_at: String,
    pub updated_at: String,
    pub app_version: String,
    pub min_compatible_app_version: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct OpenedProject {
    pub project_path: PathBuf,
    pub manifest: ProjectManifest,
    pub snapshot: ProjectSnapshot,
    pub recovered: bool,
}
```

Define `Floor`, `SpatialProject`, `AssetRecord`, and `ProjectSnapshot` before `OpenedProject`, with `camelCase` JSON fields matching Task 2 exactly. New and normally opened projects set `recovered: false`. `ProjectIoError` must expose stable codes including `INVALID_PROJECT_NAME`, `PROJECT_ALREADY_EXISTS`, `INVALID_PROJECT_STRUCTURE`, `UNSUPPORTED_SCHEMA_VERSION`, `MANIFEST_DATABASE_MISMATCH`, `DATABASE_ERROR`, `PROJECT_LOCKED`, `STALE_PROJECT_LOCK`, `INVALID_RESOURCE_PATH`, and `RECOVERY_FAILED`.

- [ ] **Step 4: Implement schema migration 1**

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
CREATE TABLE project_meta (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);
CREATE TABLE entity_records (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  parent_id TEXT,
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE TABLE command_journal (
  sequence INTEGER PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  command_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  inverse_payload_json TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('apply','undo','redo')),
  created_at TEXT NOT NULL
);
CREATE TABLE snapshots (
  sequence INTEGER PRIMARY KEY,
  snapshot_json TEXT NOT NULL,
  checksum TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE asset_records (
  id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  media_type TEXT NOT NULL,
  size INTEGER NOT NULL CHECK(size >= 0),
  metadata_json TEXT NOT NULL
);
```

Open SQLite with WAL, foreign keys, and a busy timeout. Store migration checksum and refuse a database whose applied checksum differs from the compiled migration.

- [ ] **Step 5: Implement atomic create and safe open**

Create `<name>.twinproj.staging-<uuid>` under the selected parent, initialize directories, write SQLite and `manifest.json.tmp`, atomically rename the manifest, then atomically rename the staging directory to `<name>.twinproj`. On any error, canonicalize and verify the staging path remains under the selected parent before removing it. `open_project` validates immutable manifest fields against `project_meta`, loads the latest snapshot, and returns a typed error instead of an empty project.

- [ ] **Step 6: Verify the shared JSON fixture**

`contract_fixture.rs` must deserialize `fixtures/contracts/manifest.v1.json`, assert profile `Showroom`, serialize it again, and compare every key/value through `serde_json::Value`. This is the cross-language drift guard.

- [ ] **Step 7: Run project-format tests**

Run: `cargo test -p project-io --test create_open --test contract_fixture`
Expected: PASS for both profiles, directory shape, no overwrite, schema creation, and shared manifest keys.

- [ ] **Step 8: Commit project creation and schema**

```powershell
git add -- aethertwin/crates/project-io aethertwin/Cargo.toml aethertwin/Cargo.lock
git commit -m "feat: add local project format and sqlite schema"
```

---

### Task 6: Add durable commits, locking, checkpoints, and recovery

**Files:**
- Modify: `aethertwin/crates/project-io/src/model.rs`
- Modify: `aethertwin/crates/project-io/src/project.rs`
- Modify: `aethertwin/crates/project-io/src/paths.rs`
- Create: `aethertwin/crates/project-io/src/lock.rs`
- Create: `aethertwin/crates/project-io/tests/commit_recovery.rs`
- Create: `aethertwin/crates/project-io/tests/path_policy.rs`

**Interfaces:**
- Consumes: M0 SQLite tables and shared snapshot model from Task 5.
- Produces: `CommitBatch`, `JournalOperation`, `ProjectSession`, `open_session`, `recover_project`, `commit`, `checkpoint`, `close`, and `validate_relative_resource_path`.

- [ ] **Step 1: Write failing commit and recovery tests**

```rust
// crates/project-io/tests/commit_recovery.rs
use project_io::{
    create_project, open_session, recover_project, CommitBatch, CreateProjectRequest,
    JournalOperation, ProjectProfile, ProjectSnapshot, SaveState,
};
use rusqlite::Connection;
use tempfile::tempdir;

fn renamed(mut snapshot: ProjectSnapshot, name: &str, sequence: u64) -> ProjectSnapshot {
    snapshot.project.name = name.into();
    snapshot.sequence = sequence;
    snapshot
}

fn rename_batch(before: &ProjectSnapshot, after: &ProjectSnapshot) -> CommitBatch {
    CommitBatch {
        before: before.clone(),
        after: after.clone(),
        journal: vec![JournalOperation::rename(
            after.sequence,
            "tx-rename",
            &before.project.name,
            &after.project.name,
        )],
    }
}

#[test]
fn commit_is_atomic_and_recovery_replays_after_checkpoint() {
    let root = tempdir().unwrap();
    let opened = create_project(CreateProjectRequest {
        parent: root.path().to_path_buf(),
        name: "Market Demo".into(),
        profile: ProjectProfile::Market,
    }).unwrap();
    let mut session = open_session(&opened.project_path, false).unwrap();
    let original = session.snapshot().clone();
    let next = renamed(original.clone(), "Recovered Name", 1);
    session.commit(rename_batch(&original, &next)).unwrap();
    assert_eq!(session.save_state(), SaveState::Dirty);
    drop(session); // simulate an unclean process exit

    let recovered = recover_project(&opened.project_path, true).unwrap();
    assert_eq!(recovered.snapshot.project.name, "Recovered Name");
    assert!(recovered.recovered);
}

#[test]
fn failed_batch_changes_neither_entities_nor_journal() {
    let root = tempdir().unwrap();
    let opened = create_project(CreateProjectRequest {
        parent: root.path().to_path_buf(),
        name: "Showroom Demo".into(),
        profile: ProjectProfile::Showroom,
    }).unwrap();
    let mut session = open_session(&opened.project_path, false).unwrap();
    Connection::open(opened.project_path.join("project.db")).unwrap().execute_batch(
        "CREATE TRIGGER fail_journal BEFORE INSERT ON command_journal
         BEGIN SELECT RAISE(ABORT, 'forced journal failure'); END;"
    ).unwrap();
    let original = session.snapshot().clone();
    let next = renamed(original.clone(), "Never Published", 1);
    assert!(session.commit(rename_batch(&original, &next)).is_err());
    drop(session);
    let reopened = recover_project(&opened.project_path, true).unwrap();
    assert_eq!(reopened.snapshot.project.name, "Showroom Demo");
    let connection = Connection::open(opened.project_path.join("project.db")).unwrap();
    let count: i64 = connection.query_row("SELECT COUNT(*) FROM command_journal", [], |row| row.get(0)).unwrap();
    assert_eq!(count, 0);
}
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `cargo test -p project-io --test commit_recovery --test path_policy`
Expected: FAIL because session commit, locking, and recovery are absent.

- [ ] **Step 3: Implement path policy before file operations**

```rust
pub fn validate_relative_resource_path(value: &str) -> Result<(), ProjectIoError> {
    let path = std::path::Path::new(value);
    if value.is_empty()
        || path.is_absolute()
        || value.starts_with("\\\\")
        || value.as_bytes().get(1) == Some(&b':')
        || path.components().any(|part| matches!(part, std::path::Component::ParentDir | std::path::Component::RootDir | std::path::Component::Prefix(_)))
    {
        return Err(ProjectIoError::InvalidResourcePath);
    }
    Ok(())
}
```

`path_policy.rs` must cover Windows drive paths, UNC paths, POSIX roots, `..`, mixed separators, valid nested asset paths, and confirm no absolute path is written to manifest/snapshot fixtures.

- [ ] **Step 4: Implement exclusive project locking**

Open `.aethertwin.lock` with create/read/write, obtain an exclusive `fs2` lock, write `{ pid, sessionId, openedAt }`, and keep the handle in `ProjectSession`. Failure to obtain the lock returns `PROJECT_LOCKED`. An existing metadata file that can be exclusively locked is stale crash residue; return `STALE_PROJECT_LOCK` unless the caller explicitly passes `recoverStaleLock: true`, then truncate and rewrite it while retaining the acquired OS lock.

- [ ] **Step 5: Implement transactional commit and checkpoint**

Use these public commit contracts:

```rust
#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalOperation {
    pub sequence: u64,
    pub transaction_id: String,
    pub command_type: String,
    pub payload: serde_json::Value,
    pub inverse_payload: serde_json::Value,
    pub action: JournalAction,
    pub timestamp: String,
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum JournalAction { Apply, Undo, Redo }

#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SaveState { Dirty, Saving, Saved, Error, Recovered }

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitBatch {
    pub before: ProjectSnapshot,
    pub after: ProjectSnapshot,
    pub journal: Vec<JournalOperation>,
}

impl JournalOperation {
    pub fn rename(sequence: u64, transaction_id: &str, before: &str, after: &str) -> Self {
        Self {
            sequence,
            transaction_id: transaction_id.into(),
            command_type: "project.rename".into(),
            payload: serde_json::json!({ "name": after }),
            inverse_payload: serde_json::json!({ "name": before }),
            action: JournalAction::Apply,
            timestamp: chrono::Utc::now().to_rfc3339(),
        }
    }
}
```

Expose these exact session signatures:

```rust
pub fn open_session(path: &std::path::Path, recover_stale_lock: bool) -> Result<ProjectSession, ProjectIoError>;
pub fn recover_project(path: &std::path::Path, confirm: bool) -> Result<OpenedProject, ProjectIoError>;

impl ProjectSession {
    pub fn snapshot(&self) -> &ProjectSnapshot;
    pub fn save_state(&self) -> SaveState;
    pub fn commit(&mut self, batch: CommitBatch) -> Result<(), ProjectIoError>;
    pub fn checkpoint(&mut self) -> Result<ProjectManifest, ProjectIoError>;
    pub fn close(&mut self) -> Result<(), ProjectIoError>;
}
```

One SQLite transaction must validate increasing sequence numbers, write changed `entity_records`, append every `command_journal` row, update `project_meta.lastCommittedSequence`, and commit. Only after commit may the session snapshot change. `checkpoint` inserts the full snapshot and SHA-256 checksum, updates `lastCheckpointSequence`, atomically rewrites mutable manifest cache fields, sets `save_state()` to `SaveState::Saved`, and returns the updated `ProjectManifest` required by Task 4.

- [ ] **Step 6: Implement recovery copies and replay**

For unclean shutdown, copy `manifest.json` and `project.db` to `derived/recovery/<UTC timestamp>/` before replay. Load the newest checksum-valid snapshot, replay later committed journal entries in order, compare the reconstructed result to current entity records, and return `RECOVERY_FAILED` without modifying source files when invariants differ. Mark clean shutdown only inside `close` after a final successful checkpoint and lock release.

- [ ] **Step 7: Run persistence and recovery tests**

Run: `cargo test -p project-io`
Expected: PASS for atomic commit, rollback, sequence order, locking, stale-lock confirmation, checkpoint checksums, recovery copies, replay, path policy, and save/close/reopen equivalence.

- [ ] **Step 8: Commit native persistence**

```powershell
git add -- aethertwin/crates/project-io
git commit -m "feat: add project transactions and recovery"
```

---

### Task 7: Expose project sessions through a least-privilege Tauri host

**Files:**
- Modify: `aethertwin/package.json`
- Modify: `aethertwin/pnpm-lock.yaml`
- Modify: `aethertwin/Cargo.toml`
- Modify: `aethertwin/Cargo.lock`
- Create: `aethertwin/crates/desktop-host/Cargo.toml`
- Create: `aethertwin/crates/desktop-host/build.rs`
- Create: `aethertwin/crates/desktop-host/tauri.conf.json`
- Create: `aethertwin/crates/desktop-host/capabilities/default.json`
- Create: `aethertwin/crates/desktop-host/src/lib.rs`
- Create: `aethertwin/crates/desktop-host/src/state.rs`
- Create: `aethertwin/crates/desktop-host/src/commands.rs`
- Create: `aethertwin/crates/desktop-host/src/main.rs`
- Create: `aethertwin/crates/desktop-host/tests/command_contract.rs`

**Interfaces:**
- Consumes: `project_io::{CreateProjectRequest, OpenedProject, CommitBatch, ProjectSession}`.
- Produces Tauri commands: `create_project`, `open_project`, `commit_project`, `checkpoint_project`, `close_project`, and `recover_project`; all failures use `{ code, message, details, logRef }`.

- [ ] **Step 1: Write a failing host command-contract test**

Install the exact Tauri CLI used by the workspace:

```powershell
pnpm.cmd add -Dw -E '@tauri-apps/cli'@latest
```

Add `"crates/desktop-host"` to the root Cargo workspace `members` array before running the host test. Do not add `desktop-host` earlier: Cargo rejects workspace members that do not yet have a manifest.

Create the host manifest and build script:

```toml
# crates/desktop-host/Cargo.toml
[package]
name = "desktop-host"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
license.workspace = true

[lib]
name = "desktop_host"
path = "src/lib.rs"

[[bin]]
name = "aethertwin-studio"
path = "src/main.rs"

[build-dependencies]
tauri-build.workspace = true

[dependencies]
project-io = { path = "../project-io" }
serde.workspace = true
serde_json.workspace = true
tauri.workspace = true
tauri-plugin-dialog.workspace = true
tauri-plugin-single-instance.workspace = true
uuid.workspace = true

[dev-dependencies]
tempfile.workspace = true
```

```rust
// crates/desktop-host/build.rs
fn main() {
    tauri_build::build();
}
```

```rust
// crates/desktop-host/tests/command_contract.rs
use desktop_host::{AppService, CreateProjectDto};
use tempfile::tempdir;

#[test]
fn service_creates_and_tracks_one_session() {
    let root = tempdir().unwrap();
    let service = AppService::default();
    let opened = service.create_project(CreateProjectDto {
        parent: root.path().to_string_lossy().into_owned(),
        name: "Demo".into(),
        profile: "showroom".into(),
    }).unwrap();
    assert_eq!(opened.manifest.profile, "showroom");
    assert_eq!(service.session_count(), 1);
    service.close_project(&opened.session_id).unwrap();
    assert_eq!(service.session_count(), 0);
}
```

- [ ] **Step 2: Run the command-contract test and confirm failure**

Run: `cargo test -p desktop-host --test command_contract`
Expected: FAIL because `desktop-host` does not exist.

- [ ] **Step 3: Implement DTOs and session registry**

```rust
// crates/desktop-host/src/state.rs
use project_io::ProjectSession;
use std::{collections::HashMap, sync::Mutex};

#[derive(Default)]
pub struct AppService {
    sessions: Mutex<HashMap<String, ProjectSession>>,
}

impl AppService {
    pub fn session_count(&self) -> usize {
        self.sessions.lock().expect("session mutex poisoned").len()
    }
}
```

`CreateProjectDto` and `OpenProjectDto` accept strings at the IPC edge and convert them immediately to validated native contracts. `OpenedProjectDto` includes `sessionId`, `projectPath`, manifest, snapshot, and `recovered`. `NativeErrorDto` maps every `ProjectIoError::code()` to a safe Chinese summary; it must not serialize underlying absolute paths or raw SQL errors into `message`.

`AppService::create_project` calls `project_io::create_project`, immediately opens the result with `open_session(path, false)`, stores the session under a fresh UUID, and returns that session ID with the opened data. `AppService::open_project` calls `open_session(path, recover_stale_lock)` directly. `close_project` removes the session only after `ProjectSession::close` succeeds.

- [ ] **Step 4: Implement command functions as thin service calls**

```rust
#[tauri::command]
pub fn create_project(
    state: tauri::State<'_, AppService>,
    request: CreateProjectDto,
) -> Result<OpenedProjectDto, NativeErrorDto> {
    state.create_project(request).map_err(NativeErrorDto::from)
}

#[tauri::command]
pub fn close_project(
    state: tauri::State<'_, AppService>,
    session_id: String,
) -> Result<(), NativeErrorDto> {
    state.close_project(&session_id).map_err(NativeErrorDto::from)
}
```

Implement the remaining commands with the same explicit DTO conversion. Session lookup failures return `SESSION_NOT_FOUND`. No command accepts arbitrary SQL, shell commands, or unrestricted filesystem operations.

- [ ] **Step 5: Configure the Tauri 2 application**

`tauri.conf.json` must use product name `AetherTwin Studio`, identifier `cn.aethertwin.studio`, `frontendDist` pointing to `../../apps/studio/dist`, and `devUrl` pointing only to localhost. `capabilities/default.json` grants the core window capability and the dialog selections needed for project folders; it must not grant shell execution or broad filesystem scopes.

`lib.rs` exports `AppService` and DTOs for contract tests. `main.rs` manages `AppService`, registers the six commands, installs `tauri-plugin-dialog` and `tauri-plugin-single-instance`, and exits with a logged error when setup fails. The single-instance callback may focus the existing window but cannot open an arbitrary path from process arguments in M0.

- [ ] **Step 6: Run native host checks**

Run: `cargo test -p desktop-host --test command_contract`
Expected: PASS for create, session registration, profile serialization, close, and safe errors.

Run: `cargo check -p desktop-host`
Expected: PASS with no Tauri major-version mismatch.

- [ ] **Step 7: Commit the desktop host**

```powershell
git add -- aethertwin/crates/desktop-host aethertwin/Cargo.toml aethertwin/Cargo.lock aethertwin/package.json aethertwin/pnpm-lock.yaml
git commit -m "feat: expose project io through Tauri"
```

---

### Task 8: Build the Aether design system and UI gallery

**Files:**
- Modify: `aethertwin/packages/design-system/package.json`
- Modify: `aethertwin/pnpm-lock.yaml`
- Create: `aethertwin/packages/design-system/tsconfig.json`
- Create: `aethertwin/packages/design-system/src/tokens.css`
- Create: `aethertwin/packages/design-system/src/base.css`
- Create: `aethertwin/packages/design-system/src/components/button.tsx`
- Create: `aethertwin/packages/design-system/src/components/field.tsx`
- Create: `aethertwin/packages/design-system/src/components/dialog.tsx`
- Create: `aethertwin/packages/design-system/src/components/badge.tsx`
- Create: `aethertwin/packages/design-system/src/components/panel.tsx`
- Create: `aethertwin/packages/design-system/src/components/status-notice.tsx`
- Create: `aethertwin/packages/design-system/src/index.ts`
- Create: `aethertwin/packages/design-system/src/design-system.test.tsx`

**Interfaces:**
- Consumes: Aether constraints in `docs/DESIGN_SYSTEM.md`.
- Produces: `Button`, `Field`, `Dialog`, `Badge`, `Panel`, `StatusNotice`, and CSS tokens consumed by Editor Shell and Studio.

- [ ] **Step 1: Install exact UI dependencies**

Run:

```powershell
pnpm.cmd --filter @aethertwin/design-system add -E react@latest react-dom@latest '@radix-ui/react-dialog'@latest lucide-react@latest
pnpm.cmd --filter @aethertwin/design-system add -D -E '@types/react'@latest '@types/react-dom'@latest '@testing-library/react'@latest '@testing-library/user-event'@latest '@testing-library/jest-dom'@latest jsdom@latest
```

Expected: only `packages/design-system/package.json` and the AetherTwin lockfile change.

- [ ] **Step 2: Write failing accessibility and state tests**

```tsx
// @vitest-environment jsdom
// packages/design-system/src/design-system.test.tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button, Dialog, Field, StatusNotice } from "./index";

describe("Aether design system", () => {
  it("provides keyboard-visible working controls", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>保存</Button>);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "保存" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("labels fields, dialogs, and save errors", () => {
    render(<><Field label="项目名称" value="Demo" onChange={() => {}} /><Dialog open title="新建项目" onOpenChange={() => {}}>内容</Dialog><StatusNotice tone="error">保存失败</StatusNotice></>);
    expect(screen.getByLabelText("项目名称")).toBeVisible();
    expect(screen.getByRole("dialog", { name: "新建项目" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("保存失败");
  });
});
```

- [ ] **Step 3: Run tests and confirm failure**

Run: `pnpm.cmd --filter @aethertwin/design-system test`
Expected: FAIL because components are absent.

- [ ] **Step 4: Define exact Aether tokens**

```css
/* packages/design-system/src/tokens.css */
:root {
  color-scheme: dark;
  --aether-bg: #0e151d;
  --aether-surface-1: #151f2a;
  --aether-surface-2: #1b2733;
  --aether-border: rgb(191 216 231 / 14%);
  --aether-text: #e5edf3;
  --aether-text-muted: #92a4b3;
  --aether-accent: #58b8c4;
  --aether-accent-soft: rgb(88 184 196 / 16%);
  --aether-danger: #d98484;
  --aether-success: #75b895;
  --aether-radius-sm: 10px;
  --aether-radius-md: 12px;
  --aether-radius-lg: 16px;
  --aether-motion-fast: 120ms;
  --aether-motion-base: 180ms;
  --aether-motion-slow: 220ms;
  --aether-font: "Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif;
}
```

`base.css` must provide a visible `:focus-visible` outline, reduced-motion behavior, neutral scrollbars, and no `backdrop-filter`. Components must forward native attributes, expose disabled and busy states, and avoid glow except selected/success feedback.

- [ ] **Step 5: Implement and test components**

Use Radix Dialog for focus trapping and escape behavior. Use Lucide icons through direct imports only. `StatusNotice` uses `role="alert"` for errors and `role="status"` for saved/recovered states.

Run: `pnpm.cmd --filter @aethertwin/design-system test`
Expected: PASS for keyboard, labels, dialog semantics, disabled state, and status roles.

- [ ] **Step 6: Commit the design system**

```powershell
git add -- aethertwin/packages/design-system aethertwin/pnpm-lock.yaml
git commit -m "feat: add Aether design system"
```

---

### Task 9: Implement the profile-aware editor shell

**Files:**
- Modify: `aethertwin/packages/editor-shell/package.json`
- Modify: `aethertwin/pnpm-lock.yaml`
- Create: `aethertwin/packages/editor-shell/tsconfig.json`
- Create: `aethertwin/packages/editor-shell/src/editor-shell.tsx`
- Create: `aethertwin/packages/editor-shell/src/editor-shell.css`
- Create: `aethertwin/packages/editor-shell/src/index.ts`
- Create: `aethertwin/packages/editor-shell/src/editor-shell.test.tsx`

**Interfaces:**
- Consumes: `ProjectProfile`, `SaveState`, design-system components, and working action callbacks.
- Produces: `EditorShellProps` and `EditorShell` with header, project tree, workspace, inspector, and absent lower dock.

- [ ] **Step 1: Write the failing shell contract test**

First add the exact internal and React dependencies:

```powershell
pnpm.cmd --filter @aethertwin/editor-shell add -E react@latest '@aethertwin/core-model@workspace:*' '@aethertwin/design-system@workspace:*'
pnpm.cmd --filter @aethertwin/editor-shell add -D -E '@types/react'@latest '@testing-library/react'@latest '@testing-library/jest-dom'@latest jsdom@latest
```

```tsx
// @vitest-environment jsdom
// packages/editor-shell/src/editor-shell.test.tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditorShell } from "./index";

it("shows only M0 actions and the selected profile", () => {
  render(<EditorShell
    projectName="Demo"
    profile="market"
    saveState="saved"
    canUndo={false}
    canRedo={false}
    onBack={vi.fn()}
    onSave={vi.fn()}
    onUndo={vi.fn()}
    onRedo={vi.fn()}
    onClose={vi.fn()}
    tree={<div>一层</div>}
    workspace={<div>项目概览</div>}
    inspector={<div>检查器</div>}
  />);
  expect(screen.getByText("market")).toBeVisible();
  expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
  expect(screen.queryByText("摊位")).not.toBeInTheDocument();
  expect(screen.queryByText("展具")).not.toBeInTheDocument();
  expect(screen.queryByTestId("bottom-dock")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the shell test and confirm failure**

Run: `pnpm.cmd --filter @aethertwin/editor-shell test`
Expected: FAIL because `EditorShell` is absent.

- [ ] **Step 3: Implement the exact shell props**

```ts
export interface EditorShellProps {
  projectName: string;
  profile: "showroom" | "market";
  saveState: "dirty" | "saving" | "saved" | "error" | "recovered";
  canUndo: boolean;
  canRedo: boolean;
  onBack(): void;
  onSave(): void;
  onUndo(): void;
  onRedo(): void;
  onClose(): void;
  tree: React.ReactNode;
  workspace: React.ReactNode;
  inspector: React.ReactNode;
}
```

The header renders only Back, Save, Undo, Redo, Close, project name, profile badge, and save status. CSS uses a three-column grid, minimum 1180x720 logical layout, 1 px borders, and fixed editor tokens. Do not render a lower dock element in M0.

- [ ] **Step 4: Run shell tests**

Run: `pnpm.cmd --filter @aethertwin/editor-shell test`
Expected: PASS for both profiles, action enablement, slot placement, save states, and absent deferred controls.

- [ ] **Step 5: Commit the editor shell**

```powershell
git add -- aethertwin/packages/editor-shell aethertwin/pnpm-lock.yaml
git commit -m "feat: add M0 editor shell"
```

---

### Task 10: Build Studio project center and web sandbox flows

**Files:**
- Modify: `aethertwin/apps/studio/package.json`
- Modify: `aethertwin/pnpm-lock.yaml`
- Create: `aethertwin/apps/studio/tsconfig.json`
- Create: `aethertwin/apps/studio/vite.config.ts`
- Create: `aethertwin/apps/studio/index.html`
- Create: `aethertwin/apps/studio/src/main.tsx`
- Create: `aethertwin/apps/studio/src/app.tsx`
- Create: `aethertwin/apps/studio/src/app.css`
- Create: `aethertwin/apps/studio/src/backend/select-backend.ts`
- Create: `aethertwin/apps/studio/src/features/project-center/project-center.tsx`
- Create: `aethertwin/apps/studio/src/features/project-center/create-project-dialog.tsx`
- Create: `aethertwin/apps/studio/src/features/project-center/project-center.test.tsx`
- Create: `aethertwin/apps/studio/src/dev/ui-gallery.tsx`

**Interfaces:**
- Consumes: `ProjectStore`, `SandboxProjectBackend`, Aether design system, and Editor Shell.
- Produces: functioning New Showroom, New Market, Open Project, recent-project UI, `/dev/ui-gallery`, and a visible sandbox-mode badge.

- [ ] **Step 1: Install exact Studio dependencies**

Run:

```powershell
pnpm.cmd --filter @aethertwin/studio add -E react@latest react-dom@latest zustand@latest '@tauri-apps/api'@latest '@tauri-apps/plugin-dialog'@latest '@aethertwin/core-model'@workspace:* '@aethertwin/project-store'@workspace:* '@aethertwin/design-system'@workspace:* '@aethertwin/editor-shell'@workspace:*
pnpm.cmd --filter @aethertwin/studio add -D -E '@vitejs/plugin-react'@latest '@types/react'@latest '@types/react-dom'@latest '@testing-library/react'@latest '@testing-library/user-event'@latest '@testing-library/jest-dom'@latest jsdom@latest
```

Use this exact Studio Vite configuration:

```ts
// apps/studio/vite.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
});
```

- [ ] **Step 2: Write failing project-center tests**

```tsx
// @vitest-environment jsdom
// apps/studio/src/features/project-center/project-center.test.tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../../app";

describe("project center", () => {
  it("shows exactly the two creation modes", async () => {
    render(<App forceBackend="sandbox" />);
    expect(await screen.findByRole("button", { name: /新建店铺展厅/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /新建市集导览/ })).toBeVisible();
    expect(screen.queryByText(/BIM|IoT|3DGS|点云/)).not.toBeInTheDocument();
    expect(screen.getByText(/Web 沙盒/)).toBeVisible();
  });

  it("creates a market project and enters the real overview", async () => {
    render(<App forceBackend="sandbox" />);
    await userEvent.click(screen.getByRole("button", { name: /新建市集导览/ }));
    await userEvent.type(screen.getByLabelText("项目名称"), "夏日市集");
    await userEvent.click(screen.getByRole("button", { name: "创建项目" }));
    expect(await screen.findByText("项目概览")).toBeVisible();
    expect(screen.getByText("market")).toBeVisible();
  });
});
```

- [ ] **Step 3: Run Studio tests and confirm failure**

Run: `pnpm.cmd --filter @aethertwin/studio test`
Expected: FAIL because Studio files are absent.

- [ ] **Step 4: Implement backend selection**

```ts
// apps/studio/src/backend/select-backend.ts
import { SandboxProjectBackend, type ProjectBackend } from "@aethertwin/project-store";

export type ForcedBackend = "sandbox" | undefined;

export function selectBackend(_force?: ForcedBackend): ProjectBackend {
  return new SandboxProjectBackend();
}
```

Task 10 intentionally supports only the web sandbox. Task 11 changes this selector after adding the tested Tauri adapter. The project center must label sandbox as nonpersistent and change Open Project to “打开沙盒项目”; it must never imply filesystem access.

- [ ] **Step 5: Implement create validation and the project center**

Reject empty names, Windows reserved names, trailing dots/spaces, path separators, and names longer than 80 Unicode code points. In sandbox, location is fixed to `sandbox`; in desktop, the location field is populated only by the Tauri folder dialog. Creation buttons pass a fixed profile and never render a mutable profile select.

- [ ] **Step 6: Implement `/dev/ui-gallery`**

Route from `window.location.pathname`. The gallery displays every implemented button state, field state, dialog, panel, empty state, error state, save state, and both profile badges. It does not display 3D scenes in M0.

- [ ] **Step 7: Run Studio unit tests**

Run: `pnpm.cmd --filter @aethertwin/studio test`
Expected: PASS for exact two profiles, validation, sandbox label, create flow, recent projects, UI gallery states, and absence of deferred entries.

- [ ] **Step 8: Commit the Studio project center**

```powershell
git add -- aethertwin/apps/studio aethertwin/pnpm-lock.yaml
git commit -m "feat: add AetherTwin project center"
```

---

### Task 11: Connect desktop persistence and the project overview

**Files:**
- Create: `aethertwin/apps/studio/src/backend/tauri-backend.ts`
- Create: `aethertwin/apps/studio/src/backend/tauri-backend.test.ts`
- Modify: `aethertwin/apps/studio/src/backend/select-backend.ts`
- Create: `aethertwin/apps/studio/src/features/project-overview/project-overview.tsx`
- Create: `aethertwin/apps/studio/src/features/project-overview/project-tree.tsx`
- Create: `aethertwin/apps/studio/src/features/project-overview/project-inspector.tsx`
- Create: `aethertwin/apps/studio/src/features/project-overview/project-overview.test.tsx`
- Modify: `aethertwin/apps/studio/src/app.tsx`

**Interfaces:**
- Consumes: native command names from Task 7 and `ProjectBackend` from Task 4.
- Produces: `TauriProjectBackend`, editable project name/tags, working save/undo/redo/close, and actionable native/recovery errors.

- [ ] **Step 1: Write failing Tauri adapter tests**

```ts
// apps/studio/src/backend/tauri-backend.test.ts
import { expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

it("maps ProjectBackend calls to exact Tauri commands", async () => {
  const { TauriProjectBackend } = await import("./tauri-backend");
  const backend = new TauriProjectBackend();
  invoke.mockResolvedValueOnce({ sessionId: "s1", projectPath: "P", manifest: {}, snapshot: {}, recovered: false });
  await backend.createProject({ name: "Demo", location: "E:\\Projects", profile: "showroom" });
  expect(invoke).toHaveBeenCalledWith("create_project", {
    request: { name: "Demo", parent: "E:\\Projects", profile: "showroom" },
  });
});
```

- [ ] **Step 2: Write failing overview behavior tests**

```tsx
// @vitest-environment jsdom
// apps/studio/src/features/project-overview/project-overview.test.tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectStore, SandboxProjectBackend } from "@aethertwin/project-store";
import { it, expect } from "vitest";
import { ProjectOverview } from "./project-overview";

it("renames through CommandBus and supports save, undo, and redo", async () => {
  const backend = new SandboxProjectBackend();
  const store = new ProjectStore(backend, { autosaveDelayMs: 60_000 });
  await store.create({ name: "Old", location: "sandbox", profile: "showroom" });
  render(<ProjectOverview store={store} />);
  await userEvent.clear(screen.getByLabelText("项目名称"));
  await userEvent.type(screen.getByLabelText("项目名称"), "New");
  await userEvent.click(screen.getByRole("button", { name: "应用名称" }));
  expect(screen.getByText("未保存")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "撤销" }));
  expect(screen.getByDisplayValue("Old")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "重做" }));
  expect(screen.getByDisplayValue("New")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(await screen.findByText("已保存")).toBeVisible();
});
```

- [ ] **Step 3: Run tests and confirm failure**

Run: `pnpm.cmd --filter @aethertwin/studio test`
Expected: FAIL because Tauri adapter and overview components are absent.

- [ ] **Step 4: Implement the Tauri adapter**

Maintain `sessionId` per opened project path inside the adapter. Map `createProject`, `openProject`, `commit`, `checkpoint`, and `closeProject` to the exact Task 7 commands. Convert `{ code, message, details, logRef }` rejections into `ProjectBackendError` without exposing other properties. Reject a returned manifest or snapshot that fails core-model parsing before handing it to Project Store.

Replace the sandbox-only selector with:

```ts
import type { ProjectBackend } from "@aethertwin/project-store";

export type ForcedBackend = "desktop" | "sandbox" | undefined;

export async function selectBackend(force?: ForcedBackend): Promise<ProjectBackend> {
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (force === "desktop" || isTauri) {
    const { TauriProjectBackend } = await import("./tauri-backend");
    return new TauriProjectBackend();
  }
  if (import.meta.env.DEV) {
    const { SandboxProjectBackend } = await import("@aethertwin/project-store");
    return new SandboxProjectBackend();
  }
  throw new Error(force === "sandbox" ? "WEB_SANDBOX_DISABLED" : "TAURI_RUNTIME_REQUIRED");
}
```

Update App bootstrap to await backend selection before rendering project-center actions. The only sandbox import is inside the compile-time `import.meta.env.DEV` branch, so `vite build` eliminates it from the production Studio bundle; `forceBackend="sandbox"` remains a test/development affordance and fails closed in production.

- [ ] **Step 5: Implement the real M0 overview**

`ProjectOverview` subscribes to Project Store. The project tree contains project and first floor. The workspace shows project name, tags, profile, schema version, save state, and backend mode. The Inspector edits only name and tags. Header callbacks call store save/undo/redo/close; buttons reflect `canUndo`, `canRedo`, and saving state. Errors render `StatusNotice` with message and log reference plus a working Back action.

- [ ] **Step 6: Add close and recovered-state tests**

Assert Close releases the backend session and returns to project center. Assert an `OpenedProject` with `recovered: true` displays the recovered success state and never uses an error glow. Assert unsupported schemas and corrupt-project errors do not render the overview.

- [ ] **Step 7: Run integrated unit tests**

Run: `pnpm.cmd --filter @aethertwin/studio test`
Expected: PASS for adapter commands, runtime parsing, overview edits, CommandBus-only mutations, autosave, manual save, undo/redo, close, and recovery/error screens.

- [ ] **Step 8: Commit desktop UI integration**

```powershell
git add -- aethertwin/apps/studio
git commit -m "feat: connect Studio project persistence"
```

---

### Task 12: Establish the independent Player boundary

**Files:**
- Modify: `aethertwin/apps/player/package.json`
- Modify: `aethertwin/pnpm-lock.yaml`
- Create: `aethertwin/apps/player/tsconfig.json`
- Create: `aethertwin/apps/player/vite.config.ts`
- Create: `aethertwin/apps/player/index.html`
- Create: `aethertwin/apps/player/src/main.tsx`
- Create: `aethertwin/apps/player/src/player-boundary.tsx`
- Create: `aethertwin/apps/player/src/player-boundary.test.tsx`

**Interfaces:**
- Consumes: React and Aether base tokens only.
- Produces: a buildable independent app that truthfully identifies Player as unavailable before M4 and is not reachable from Studio.

- [ ] **Step 1: Install exact Player boundary dependencies**

Run:

```powershell
pnpm.cmd --filter @aethertwin/player add -E react@latest react-dom@latest '@aethertwin/design-system@workspace:*'
pnpm.cmd --filter @aethertwin/player add -D -E '@vitejs/plugin-react'@latest '@types/react'@latest '@types/react-dom'@latest '@testing-library/react'@latest '@testing-library/jest-dom'@latest jsdom@latest
```

Use this exact Player Vite configuration:

```ts
// apps/player/vite.config.ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
});
```

- [ ] **Step 2: Write the failing boundary test**

```tsx
// @vitest-environment jsdom
// apps/player/src/player-boundary.test.tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { PlayerBoundary } from "./player-boundary";

it("does not claim M4 visitor capabilities", () => {
  render(<PlayerBoundary />);
  expect(screen.getByRole("heading", { name: "AetherTwin Player" })).toBeVisible();
  expect(screen.getByText("访客播放器将在 M4 启用")).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run the test and confirm failure**

Run: `pnpm.cmd --filter @aethertwin/player test`
Expected: FAIL because Player package is absent.

- [ ] **Step 4: Implement a noninteractive boundary screen**

Render product identity, the exact M4 availability statement, and no controls, themes, project loading, kiosk, export, or media claims. Do not link to Player from Studio. This screen exists only to keep the independent build boundary honest and testable.

- [ ] **Step 5: Run Player tests**

Run: `pnpm.cmd --filter @aethertwin/player test`
Expected: PASS with no interactive actions.

- [ ] **Step 6: Commit Player boundary**

```powershell
git add -- aethertwin/apps/player aethertwin/pnpm-lock.yaml
git commit -m "chore: establish independent Player boundary"
```

---

### Task 13: Add offline, acceptance, and no-fake-action gates

**Files:**
- Create: `aethertwin/playwright.config.ts`
- Create: `aethertwin/apps/studio/e2e/m0.spec.ts`
- Create: `aethertwin/tests/offline-source-policy.test.mjs`
- Create: `aethertwin/tests/project-format-policy.test.mjs`
- Create: `aethertwin/tests/visible-actions.test.mjs`
- Modify: `aethertwin/package.json`
- Modify: `aethertwin/pnpm-lock.yaml`

**Interfaces:**
- Consumes: Studio web sandbox, project format, and root scripts.
- Produces: deterministic M0 acceptance evidence and source-level offline/no-fake gates.

- [ ] **Step 1: Install and pin Playwright**

Run:

```powershell
pnpm.cmd add -Dw -E '@playwright/test'@latest
pnpm.cmd exec playwright install chromium
```

Expected: the root manifest pins `@playwright/test`, the AetherTwin lockfile changes, and Playwright reports that Chromium is installed.

- [ ] **Step 2: Write failing offline source-policy test**

```js
// tests/offline-source-policy.test.mjs
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("runtime source contains no remote URL", () => {
  const files = globSync(["apps/**/*.{ts,tsx,css,html}", "packages/**/*.{ts,tsx,css}"], {
    exclude: ["**/*.test.*"],
  });
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /https?:\/\//, `remote URL in ${file}`);
  }
});
```

If the installed Node version does not expose `globSync` from `node:fs`, use `glob` as an exact dev dependency and import `globSync` from `glob`; do not implement a custom recursive walker.

- [ ] **Step 3: Write project-format and visible-action policies**

Use source-policy tests as a second line of defense behind the Task 5 and Task 6 Rust integration tests:

```js
// tests/project-format-policy.test.mjs
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const projectIo = readFileSync("crates/project-io/src/project.rs", "utf8");
const schema = readFileSync("crates/project-io/src/schema.rs", "utf8");
const model = readFileSync("packages/core-model/src/model.ts", "utf8");

test("project format is relative-path metadata, never embedded media", () => {
  for (const directory of ["assets", "thumbnails", "derived", "exports"]) {
    assert.match(projectIo, new RegExp(`\\b${directory}\\b`));
  }
  assert.match(projectIo, /manifest\.json/);
  assert.match(projectIo, /project\.db/);
  assert.doesNotMatch(schema, /\bBLOB\b/i);
  assert.match(schema, /relative_path/);
  assert.match(schema, /sha256/);
  assert.doesNotMatch(`${projectIo}\n${schema}`, /[A-Z]:\\\\|file:\/\//);
});

test("core model keeps exactly two profiles", () => {
  assert.match(model, /export type ProjectProfile = "showroom" \| "market";/);
  assert.doesNotMatch(model, /export type ProjectProfile =[^;]+\|[^;]+\|/);
});
```

```js
// tests/visible-actions.test.mjs
import { globSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const files = globSync(["apps/studio/src/**/*.{ts,tsx}"], {
  exclude: ["**/*.test.*", "**/dev/**"],
});
const runtime = files.map((file) => readFileSync(file, "utf8")).join("\n");
const required = ["新建店铺展厅", "新建市集导览", "打开项目", "保存", "撤销", "重做", "关闭项目"];
const forbidden = ["BIM", "IoT", "点云", "3DGS", "添加展具", "添加摊位", "添加路线", "发布", "预览", "导出"];

test("M0 exposes real actions and no deferred authoring claims", () => {
  for (const label of required) assert.match(runtime, new RegExp(label));
  for (const label of forbidden) assert.doesNotMatch(runtime, new RegExp(label));
});
```

- [ ] **Step 4: Write Playwright acceptance with network blocking**

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/studio/e2e",
  forbidOnly: true,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    serviceWorkers: "block",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    command: "pnpm.cmd --filter @aethertwin/studio exec vite --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
```

```ts
// apps/studio/e2e/m0.spec.ts
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
});

for (const [button, profile] of [["新建店铺展厅", "showroom"], ["新建市集导览", "market"]] as const) {
  test(`creates ${profile} offline`, async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: button }).click();
    await page.getByLabel("项目名称").fill(`${profile} demo`);
    await page.getByRole("button", { name: "创建项目" }).click();
    await expect(page.getByText("项目概览")).toBeVisible();
    await expect(page.getByText(profile)).toBeVisible();
  });
}
```

The configuration starts only the Studio sandbox on localhost, refuses to reuse an existing server, and disables traces, screenshots, and video.

- [ ] **Step 5: Run source policy tests**

Run: `node --test tests/workspace-structure.test.mjs tests/offline-source-policy.test.mjs tests/project-format-policy.test.mjs tests/visible-actions.test.mjs`
Expected: PASS with all runtime URLs local, project format valid, and exposed actions restricted.

- [ ] **Step 6: Run applicable Playwright acceptance**

Run: `pnpm.cmd exec playwright test apps/studio/e2e/m0.spec.ts`
Expected: PASS for showroom and market in the nonpersistent web sandbox with every non-localhost request blocked.

- [ ] **Step 7: Commit acceptance gates**

```powershell
git add -- aethertwin/playwright.config.ts aethertwin/apps/studio/e2e aethertwin/tests aethertwin/package.json aethertwin/pnpm-lock.yaml
git commit -m "test: add M0 offline acceptance gates"
```

---

### Task 14: Complete documentation, milestone verification, and report

**Files:**
- Modify: `aethertwin/README.md`
- Modify: `aethertwin/docs/ARCHITECTURE.md`
- Modify: `aethertwin/docs/PROJECT_FORMAT.md`
- Modify: `aethertwin/docs/DESIGN_SYSTEM.md`
- Modify: `aethertwin/docs/DECISIONS.md`
- Modify: `aethertwin/docs/LICENSE_POLICY.md`
- Modify: `aethertwin/THIRD_PARTY_NOTICES.md`
- Create: `aethertwin/docs/M0_REPORT.md`

**Interfaces:**
- Consumes: every implemented M0 package, test output, and exact command history.
- Produces: evidence-backed M0 report with completed, incomplete, results, commands, known issues, and M1 next step.

- [ ] **Step 1: Reconcile documents with implemented code**

Document the actual dependency graph, native/web backend difference, exact SQLite schema, error-code table, lock and recovery lifecycle, Aether tokens, local run/build entry points, and shipped dependency licenses. Remove any statement not proven by source or tests.

- [ ] **Step 2: Run static integrity checks**

Run:

```powershell
git diff --check -- aethertwin
rg -n "IMPLEMENTATION_PENDING|FILL_ME_IN|localhost-only-exception" aethertwin
```

Expected: `git diff --check` exits 0. The red-flag scan returns no incomplete work markers; any deliberate localhost wording is written without the scan sentinel.

- [ ] **Step 3: Run the required M0 milestone commands**

Run from `E:\数字孪生\aethertwin`:

```powershell
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd build
cargo check --workspace
pnpm.cmd exec playwright test apps/studio/e2e/m0.spec.ts
```

Expected: every command exits 0. Do not start `pnpm dev`, Vite preview, Tauri dev, browser debugging, or screenshot workflows.

- [ ] **Step 4: Verify completion requirements against authoritative artifacts**

Inspect source, generated manifests, SQLite schema, test-created showroom/market projects, test logs, and `git diff`. For each M0 completion criterion in the design spec, record the exact file, test, or command that proves it. Treat missing or indirect evidence as incomplete.

- [ ] **Step 5: Write the milestone report**

`docs/M0_REPORT.md` must contain these exact headings:

```markdown
# M0 Milestone Report

## Completed
## Incomplete
## Test Results
## Exact Commands
## Known Issues
## Next Milestone
```

Populate every section with observed facts. `Incomplete` uses `None` only if the requirement-by-requirement audit proves no M0 requirement is missing. `Next Milestone` names M1 unified authoring core without claiming it is implemented.

- [ ] **Step 6: Commit M0 documentation and report**

```powershell
git add -- aethertwin/README.md aethertwin/docs aethertwin/THIRD_PARTY_NOTICES.md
git commit -m "docs: complete AetherTwin M0 report"
```

---

## Spec coverage matrix

| Approved M0 requirement | Implementing task | Primary evidence |
| --- | --- | --- |
| Isolated pnpm/Cargo monorepo | Task 1 | `workspace-structure.test.mjs` |
| Tauri 2 and web development boundary | Tasks 7, 10 | host contract tests; sandbox label test |
| Project center and exactly two profiles | Tasks 2, 10 | core-model and project-center tests |
| Immutable profile and cross-language manifest parity | Tasks 2, 5 | rejection tests and shared JSON fixture |
| Recent projects remain app-local preferences | Tasks 4, 10 | recent-project isolation and project-center tests |
| Aether design system | Tasks 8, 10 | design-system tests; `/dev/ui-gallery` |
| SQLite and migrations | Tasks 5, 6 | Rust schema and reopen tests |
| Atomic `.twinproj` creation and no overwrite | Task 5 | `create_open.rs` |
| Manifest/database identity agreement | Tasks 5, 6 | safe-open and recovery tests |
| CommandBus transactions/undo/redo | Task 3 | CommandBus unit tests |
| Save and autosave | Tasks 4, 6, 11 | store state tests; checkpoint tests |
| Crash recovery, clean close, and locking | Task 6 | recovery/lock Rust tests |
| Relative paths and SHA-256 | Tasks 2, 5, 6, 13 | TS/Rust path policies and format gate |
| Typed least-privilege Tauri IPC and safe errors | Task 7 | host command contract and capabilities review |
| Single-instance behavior without argument-based arbitrary opens | Task 7 | host configuration and command review |
| No fake UI features | Tasks 8-13 | component, shell, action-policy, and Playwright tests |
| Independent Player build boundary | Task 12 | Player boundary test and no Studio link |
| Offline operation | Task 13 | source-policy and blocked-network acceptance |
| Required docs and honest report | Tasks 1, 14 | structure contract and `M0_REPORT.md` |

## Execution order and review gates

Execute Tasks 1-14 in order. Each task ends in a focused commit and must be reviewed before the next task begins. Do not combine commits across task boundaries: later tasks depend on the exact public interfaces listed under each task.
