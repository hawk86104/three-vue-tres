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
