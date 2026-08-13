import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

test("M2.5 closure records ownership, durable decisions, and integration guards", () => {
  const architecture = readFileSync(join(root, "docs/ARCHITECTURE.md"), "utf8");
  const decisions = readFileSync(join(root, "docs/DECISIONS.md"), "utf8");
  const handoff = readFileSync(join(root, "HANDOFF.md"), "utf8");
  const report = readFileSync(join(root, "docs/M2_REPORT.md"), "utf8");

  assert.match(
    architecture,
    /render-scene-3d[\s\S]*exporter[\s\S]*desktop-host[\s\S]*project-io[\s\S]*media-export/iu,
  );
  assert.match(report, /exactly twelve/iu);
  assert.match(report, /exactly two/iu);
  assert.match(report, /real GPU[\s\S]*not verified/iu);

  for (const durableDecision of [
    /content-addressed[\s\S]*undo[\s\S]*not delete/iu,
    /verified[\s\S]*protocol[\s\S]*read/iu,
    /atomic[\s\S]*(?:reference|calibration)/iu,
    /explicit[\s\S]*(?:recovery|shutdown)/iu,
  ]) {
    assert.match(decisions, durableDecision);
  }
  assert.match(handoff, /57\s+2/u);
  assert.match(handoff, /(?:do not|must not)[\s\S]*rebase[\s\S]*merge[\s\S]*reset/iu);
  assert.match(handoff, /crates\/asset-io\/Cargo\.toml/u);
  assert.match(handoff, /crates\/desktop-host\/Cargo\.toml/u);
});

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

test("active Rust workspace members include the M2.1 asset boundary", () => {
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
    /members\s*=\s*\["crates\/project-io",\s*"crates\/desktop-host",\s*"crates\/asset-io",\s*"crates\/media-export"\]/,
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
test("M2.1 asset boundaries have real manifests and production implementations", () => {
  const manifest = JSON.parse(
    readFileSync(join(root, "packages/asset-pipeline/package.json"), "utf8"),
  );
  const pipelineIndex = readFileSync(
    join(root, "packages/asset-pipeline/src/index.ts"),
    "utf8",
  );
  const mediaPolicy = readFileSync(
    join(root, "packages/asset-pipeline/src/media-policy.ts"),
    "utf8",
  );
  const assetIoManifest = readFileSync(
    join(root, "crates/asset-io/Cargo.toml"),
    "utf8",
  );
  const assetIoLib = readFileSync(join(root, "crates/asset-io/src/lib.rs"), "utf8");
  const assetImport = readFileSync(join(root, "crates/asset-io/src/import.rs"), "utf8");
  const assetResolver = readFileSync(join(root, "crates/asset-io/src/resolver.rs"), "utf8");

  assert.equal(manifest.exports["."], "./src/index.ts");
  assert.match(pipelineIndex, /classifyAssetMedia/);
  assert.match(pipelineIndex, /composeInitialPlanReference/);
  assert.match(mediaPolicy, /export function assertAssetImportRequest/);
  assert.match(assetIoManifest, /name\s*=\s*"asset-io"/);
  assert.match(assetIoLib, /pub use import::[\s\S]*import_project_asset/);
  assert.match(assetImport, /pub fn import_project_asset/);
  assert.match(assetImport, /assets\/sha256/);
  assert.match(assetResolver, /pub struct AssetResolver/);
  assert.match(assetResolver, /fn canonical_path/);
  for (const [name, source] of [
    ["asset-pipeline media policy", mediaPolicy],
    ["asset-io import", assetImport],
    ["asset-io resolver", assetResolver],
  ]) {
    assert.ok(source.trim().length > 0, `${name} implementation is empty`);
  }
  assert.equal(existsSync(join(root, "packages/asset-pipeline/.gitkeep")), false);
  assert.equal(existsSync(join(root, "crates/asset-io/.gitkeep")), false);
});

test("M2.2 package ownership keeps geometry, topology, catalogue, rendering, and persistence acyclic", () => {
  const manifests = Object.fromEntries(
    [
      "core-model",
      "plan-engine",
      "mode-showroom",
      "render-plan-2d",
      "project-store",
    ].map((name) => [
      name,
      JSON.parse(readFileSync(join(root, `packages/${name}/package.json`), "utf8")),
    ]),
  );
  const internalDependencies = (name) => Object.keys(
    manifests[name].dependencies ?? {},
  ).filter((dependency) => dependency.startsWith("@aethertwin/"));

  assert.deepEqual(internalDependencies("core-model"), []);
  assert.deepEqual(internalDependencies("plan-engine"), ["@aethertwin/core-model"]);
  assert.deepEqual(internalDependencies("mode-showroom"), ["@aethertwin/core-model"]);
  assert.deepEqual(
    internalDependencies("render-plan-2d"),
    [
      "@aethertwin/core-model",
      "@aethertwin/plan-engine",
      "@aethertwin/route-engine",
    ],
  );
  assert.deepEqual(
    internalDependencies("project-store"),
    [
      "@aethertwin/asset-pipeline",
      "@aethertwin/command-bus",
      "@aethertwin/core-model",
      "@aethertwin/plan-engine",
    ],
  );
  for (const forbidden of [
    "@aethertwin/mode-showroom",
    "@aethertwin/render-plan-2d",
    "@aethertwin/studio",
  ]) {
    assert.equal(
      internalDependencies("project-store").includes(forbidden),
      false,
      `project-store must not depend on ${forbidden}`,
    );
  }

  for (const relative of [
    "packages/core-model/src/opening-geometry.ts",
    "packages/plan-engine/src/openings.ts",
    "packages/plan-engine/src/room-topology.ts",
    "packages/plan-engine/src/rooms.ts",
    "packages/mode-showroom/src/catalogue.ts",
    "packages/mode-showroom/src/tool-policy.ts",
    "packages/render-plan-2d/src/scene-projection.ts",
    "packages/project-store/src/building-structure-command.ts",
  ]) {
    assert.ok(existsSync(join(root, relative)), `missing M2.2 owner: ${relative}`);
  }
});

test("M2.3 route topology mutation has one pure package owner", () => {
  const packageRoot = join(root, "packages/route-engine");
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  const index = readFileSync(join(packageRoot, "src/index.ts"), "utf8");
  const insertion = readFileSync(join(packageRoot, "src/insertion.ts"), "utf8");
  const internalDependencies = Object.keys(manifest.dependencies ?? {})
    .filter((dependency) => dependency.startsWith("@aethertwin/"));

  assert.equal(manifest.name, "@aethertwin/route-engine");
  assert.equal(manifest.exports["."], "./src/index.ts");
  assert.deepEqual(internalDependencies, ["@aethertwin/core-model"]);
  assert.match(index, /insertRouteSegment/);
  assert.match(insertion, /export function insertRouteSegment/);
  assert.ok(insertion.trim().length > 0, "route insertion implementation is empty");
  assert.equal(existsSync(join(packageRoot, ".gitkeep")), false);
  assert.equal(existsSync(join(packageRoot, "src/.gitkeep")), false);
  for (const forbidden of [
    "@aethertwin/plan-engine",
    "@aethertwin/project-store",
    "@aethertwin/render-plan-2d",
    "@aethertwin/mode-showroom",
    "@aethertwin/studio",
  ]) {
    assert.equal(internalDependencies.includes(forbidden), false);
  }
});

test("M2.3 content, persistence, route resolution, and Studio wiring have explicit owners", () => {
  const owners = [
    ["packages/core-model/src/content-model.ts", "ProductContent"],
    ["packages/plan-engine/src/content.ts", "reorderProductMedia"],
    ["packages/project-store/src/snapshot-records-command.ts", "productContents"],
    ["packages/route-engine/src/resolver.ts", "resolveGuidedRoute"],
    ["apps/studio/src/features/plan-editor/content-inspector.tsx", "ContentInspector"],
    ["apps/studio/src/features/plan-editor/route-panel.tsx", "RoutePanel"],
  ];
  for (const [relative, symbol] of owners) {
    assert.ok(existsSync(join(root, relative)), `missing M2.3 owner: ${relative}`);
    const source = readFileSync(join(root, relative), "utf8");
    assert.ok(source.includes(symbol), `${relative} does not own ${symbol}`);
  }

  const exports = [
    ["packages/core-model/src/index.ts", "content-model"],
    ["packages/plan-engine/src/index.ts", "content"],
    ["packages/project-store/src/index.ts", "snapshot-records-command"],
    ["packages/route-engine/src/index.ts", "resolver"],
  ];
  for (const [relative, owner] of exports) {
    const source = readFileSync(join(root, relative), "utf8");
    assert.ok(source.includes(`from "./${owner}"`), `${relative} does not export ${owner}`);
  }

  const studio = JSON.parse(
    readFileSync(join(root, "apps/studio/package.json"), "utf8"),
  );
  assert.equal(studio.dependencies["@aethertwin/core-model"], "workspace:*");
  assert.equal(studio.dependencies["@aethertwin/project-store"], "workspace:*");
  assert.equal(studio.dependencies["@aethertwin/route-engine"], "workspace:*");
});
test("M2.4 render-scene-3d boundary pins its runtime and workspace dependencies", () => {
  const packageRoot = join(root, "packages/render-scene-3d");
  const workspaceConfig = readFileSync(
    join(root, "pnpm-workspace.yaml"),
    "utf8",
  );
  const manifest = JSON.parse(
    readFileSync(join(packageRoot, "package.json"), "utf8"),
  );
  const studio = JSON.parse(
    readFileSync(join(root, "apps/studio/package.json"), "utf8"),
  );
  const index = readFileSync(join(packageRoot, "src/index.ts"), "utf8");
  const types = readFileSync(join(packageRoot, "src/types.ts"), "utf8");

  assert.equal(manifest.name, "@aethertwin/render-scene-3d");
  assert.equal(manifest.exports["."], "./src/index.ts");
  assert.equal(manifest.scripts.typecheck, "tsc -p tsconfig.json --noEmit");
  assert.match(
    workspaceConfig,
    /(?:^|\r?\n)overrides:\r?\n {2}use-sync-external-store: 1\.6\.0(?:\r?\n|$)/u,
  );
  assert.deepEqual(
    manifest.dependencies,
    {
      "@aethertwin/core-model": "workspace:*",
      "@aethertwin/mode-showroom": "workspace:*",
      "@aethertwin/plan-engine": "workspace:*",
      "@aethertwin/route-engine": "workspace:*",
      "@react-three/drei": "10.7.7",
      "@react-three/fiber": "9.6.1",
      "react": "19.2.7",
      "react-dom": "19.2.7",
      "three": "0.185.1",
    },
  );
  for (const dependency of [
    "@react-three/drei",
    "@react-three/fiber",
    "react",
    "react-dom",
    "three",
  ]) {
    assert.match(
      manifest.dependencies[dependency],
      /^\d+\.\d+\.\d+$/,
      dependency + " must be an exact version",
    );
  }
  assert.equal(studio.dependencies["@aethertwin/render-scene-3d"], "workspace:*");
  for (const symbol of [
    "SceneRendererInput",
    "SceneRecord",
    "SceneProjectionIssue",
    "SceneRenderer",
    "SceneRendererFactory",
    "SceneCameraState",
    "SceneExportPort",
  ]) {
    assert.ok(index.includes(symbol), "render-scene-3d index does not export " + symbol);
    assert.ok(types.includes(symbol), "render-scene-3d types do not define " + symbol);
  }
  assert.equal(existsSync(join(packageRoot, ".gitkeep")), false);
  assert.equal(existsSync(join(packageRoot, "src/.gitkeep")), false);
  assert.doesNotMatch(JSON.stringify(manifest), /(?:https?:|\bcdn\b)/iu);
});

test("M2.5 exporter boundary keeps its pure workspace contract", () => {
  const packageRoot = join(root, "packages/exporter");
  const manifest = JSON.parse(
    readFileSync(join(packageRoot, "package.json"), "utf8"),
  );
  const studio = JSON.parse(
    readFileSync(join(root, "apps/studio/package.json"), "utf8"),
  );

  assert.equal(manifest.name, "@aethertwin/exporter");
  assert.equal(manifest.exports["."], "./src/index.ts");
  assert.deepEqual(manifest.dependencies, {
    "@aethertwin/render-scene-3d": "workspace:*",
  });
  assert.equal(studio.dependencies["@aethertwin/exporter"], "workspace:*");
  assert.equal(existsSync(join(packageRoot, ".gitkeep")), false);
});

test("M2.5 media-export is an exact bounded workspace crate", () => {
  const workspace = readFileSync(join(root, "Cargo.toml"), "utf8");
  const crateRoot = join(root, "crates/media-export");
  const manifest = readFileSync(join(crateRoot, "Cargo.toml"), "utf8");
  const library = readFileSync(join(crateRoot, "src/lib.rs"), "utf8");

  assert.match(workspace, /members\s*=\s*\[[^\]]*"crates\/media-export"[^\]]*\]/u);
  assert.match(workspace, /png\s*=\s*"=0\.18\.1"/u);
  assert.match(manifest, /name\s*=\s*"media-export"/u);
  assert.match(manifest, /edition\.workspace\s*=\s*true/u);
  for (const dependency of ["png", "sha2", "thiserror", "tempfile"]) {
    assert.match(manifest, new RegExp(`^${dependency}\\.workspace\\s*=\\s*true$`, "mu"));
  }
  for (const owner of ["error", "png_stream", "validation"]) {
    assert.ok(existsSync(join(crateRoot, `src/${owner}.rs`)), `missing ${owner}`);
  }
  assert.match(library, /pub use png_stream::/u);
  assert.match(library, /pub use validation::/u);
  assert.equal(existsSync(join(crateRoot, ".gitkeep")), false);
});
