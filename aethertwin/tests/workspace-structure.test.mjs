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
  "crates/project-io/Cargo.toml",
  "crates/project-io/src/lib.rs",
  "crates/asset-io",
  "crates/media-export",
  "Cargo.lock",
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

test("required workspace boundaries exist", () => {
  for (const relative of required) {
    assert.ok(existsSync(join(root, relative)), `missing ${relative}`);
  }
});

test("M1 plan packages have real manifests and production implementations", () => {
  for (const entry of [
    {
      relative: "packages/plan-engine",
      implementation: "src/operations.ts",
    },
    {
      relative: "packages/render-plan-2d",
      implementation: "src/pixi-plan-renderer.ts",
    },
  ]) {
    const manifest = JSON.parse(
      readFileSync(join(root, entry.relative, "package.json"), "utf8"),
    );
    assert.equal(manifest.exports["."], "./src/index.ts");
    assert.ok(existsSync(join(root, entry.relative, "src/index.ts")));
    const implementation = readFileSync(
      join(root, entry.relative, entry.implementation),
      "utf8",
    );
    assert.ok(implementation.trim().length > 0, `${entry.relative} implementation is empty`);
    assert.equal(existsSync(join(root, entry.relative, ".gitkeep")), false);
    assert.equal(existsSync(join(root, entry.relative, "src/.gitkeep")), false);
  }
});

test("workspace exposes only the two product profiles", () => {
  const spec = readFileSync(join(root, "docs/PRODUCT_SPEC.md"), "utf8");
  assert.match(spec, /showroom/);
  assert.match(spec, /market/);
  assert.doesNotMatch(spec, /third profile/i);
});

test("active Rust workspace member is executable and locked", () => {
  const workspace = readFileSync(join(root, "Cargo.toml"), "utf8");
  const projectIo = readFileSync(
    join(root, "crates/project-io/Cargo.toml"),
    "utf8",
  );
  const desktopHost = readFileSync(
    join(root, "crates/desktop-host/Cargo.toml"),
    "utf8",
  );

  assert.match(
    workspace,
    /members\s*=\s*\["crates\/project-io",\s*"crates\/desktop-host"\]/,
  );
  assert.match(projectIo, /name\s*=\s*"project-io"/);
  assert.match(desktopHost, /name\s*=\s*"desktop-host"/);
  assert.match(desktopHost, /name\s*=\s*"aethertwin-studio"/);
});

test("root tooling pins a TypeScript 6.0 stable release", () => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.match(manifest.devDependencies.typescript, /^6\.0\.\d+$/);
});

test("architecture preserves transactional and UI-state boundaries", () => {
  const architecture = readFileSync(join(root, "docs/ARCHITECTURE.md"), "utf8");

  assert.match(architecture, /same SQLite transaction/i);
  assert.match(architecture, /Zustand stores transient UI state only/i);
});

test("product scope describes the implemented M1 2D editor", () => {
  const spec = readFileSync(join(root, "docs/PRODUCT_SPEC.md"), "utf8");

  assert.match(spec, /2D-first editor/i);
  assert.match(spec, /one active floor/i);
  assert.match(spec, /six editable business entity kinds/i);
  assert.doesNotMatch(spec, /Until M1 plan editing exists/i);
});
