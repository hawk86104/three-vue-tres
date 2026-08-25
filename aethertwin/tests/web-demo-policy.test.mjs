import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, globSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import test from "node:test";

const studioPackage = JSON.parse(readFileSync("apps/studio/package.json", "utf8"));
const studioIndexSource = readFileSync("apps/studio/index.html", "utf8");
const viteSource = readFileSync("apps/studio/vite.config.ts", "utf8");
const selectBackendSource = readFileSync(
  "apps/studio/src/backend/select-backend.ts",
  "utf8",
);
const failClosedTestSource = readFileSync(
  "apps/studio/src/backend/tauri-backend.test.ts",
  "utf8",
);
const webDemoFixturesSource = readFileSync(
  "apps/studio/src/web-demo/web-demo-fixtures.ts",
  "utf8",
);
const pixiPlanRendererSource = readFileSync(
  "packages/render-plan-2d/src/pixi-plan-renderer.ts",
  "utf8",
);
const trackedFiles = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .map((file) => file.replaceAll("\\", "/"));
const webDemoRuntimeFiles = globSync(
  [
    "apps/studio/src/web-demo/**/*.{ts,tsx,css}",
    "apps/studio/src/studio-root.tsx",
    "apps/studio/src/main.tsx",
    "apps/studio/vite.config.ts",
  ],
  { exclude: ["**/*.test.*", "**/node_modules/**", "**/dist/**"] },
).map((file) => file.replaceAll("\\", "/"));
const webDemoRuntimeSource = webDemoRuntimeFiles
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");
const studioRootSource = readFileSync("apps/studio/src/studio-root.tsx", "utf8");
const workspacePackages = new Map(globSync("packages/*/package.json").map((manifestPath) => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return [manifest.name, { root: dirname(manifestPath), exports: manifest.exports }];
}));

function resolveSourceModule(base) {
  const candidates = extname(base).length > 0
    ? [base]
    : [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")];
  return candidates.find(existsSync) ?? null;
}

function resolveLocalModule(importer, specifier) {
  if (specifier.startsWith(".")) return resolveSourceModule(join(dirname(importer), specifier));
  if (!specifier.startsWith("@aethertwin/")) return null;
  const segments = specifier.split("/");
  const packageName = segments.slice(0, 2).join("/");
  const workspacePackage = workspacePackages.get(packageName);
  if (workspacePackage === undefined) return null;
  const exportKey = segments.length === 2 ? "." : `./${segments.slice(2).join("/")}`;
  const target = workspacePackage.exports[exportKey];
  return typeof target === "string" ? resolveSourceModule(join(workspacePackage.root, target)) : null;
}

function reachableLocalRuntimeFiles(entries) {
  const pending = [...entries];
  const visited = new Set();
  while (pending.length > 0) {
    const file = pending.pop();
    if (file === undefined || visited.has(file)) continue;
    visited.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/(?:from\s*|import\s*\()["'](\.[^"']+|@aethertwin\/[^"']+)["']/gu)) {
      const dependency = resolveLocalModule(file, match[1]);
      if (dependency !== null) pending.push(dependency);
    }
  }
  return [...visited].map((file) => file.replaceAll("\\", "/")).sort();
}

const reachableWebDemoRuntimeFiles = reachableLocalRuntimeFiles([
  "apps/studio/src/studio-root.tsx",
  "apps/studio/src/web-demo/web-demo-app.tsx",
]);

const normalStudioLocaleStorageBranch = /try\s*\{\s*return createBrowserLocalePreference\(window\.localStorage\);\s*\}\s*catch\s*\{\s*return createMemoryLocalePreference\(\);\s*\}/u;
const normalStudioProjectStorageBranch = /try\s*\{\s*return new ProtectedStorage\(window\.localStorage\);\s*\}\s*catch\s*\{\s*return new SessionStorage\(\);\s*\}/u;
const prohibitedPersistenceApi = /localStorage|sessionStorage|indexedDB|document\.cookie|\bcaches\b|serviceWorker|navigator\.serviceWorker/gu;

function reachableWebDemoPersistenceViolations(sourceOverrides = new Map()) {
  return reachableWebDemoRuntimeFiles.flatMap((file) => {
    const source = sourceOverrides.get(file) ?? readFileSync(file, "utf8");
    const webDemoSource = file === "apps/studio/src/studio-root.tsx"
      ? source.replace(normalStudioLocaleStorageBranch, "")
      : file === "apps/studio/src/app.tsx"
        ? source.replace(normalStudioProjectStorageBranch, "")
        : source;
    return [...webDemoSource.matchAll(prohibitedPersistenceApi)].map((match) => `${file}: ${match[0]}`);
  });
}

test("the Web Demo has exactly two dedicated scripts", () => {
  const scripts = Object.entries(studioPackage.scripts).filter(
    ([name, command]) => name.includes("web-demo") || command.includes("web-demo"),
  );

  assert.deepEqual(scripts, [
    ["web-demo", "vite --mode web-demo --host 127.0.0.1 --port 4173 --strictPort"],
    ["build:web-demo", "vite build --mode web-demo"],
  ]);
});

test("the Studio shell provides a packaged local favicon", () => {
  assert.match(studioIndexSource, /<link rel="icon" href="\.\/favicon\.svg" \/>/u);
  assert.doesNotMatch(studioIndexSource, /data:|favicon\.ico|(?:https?|wss?):\/\//iu);
  assert.equal(existsSync("apps/studio/public/favicon.svg"), true);

  const faviconSource = readFileSync("apps/studio/public/favicon.svg", "utf8");
  assert.match(faviconSource, /<svg\b/u);
  assert.doesNotMatch(
    faviconSource,
    /<script\b|\bon[a-z]+\s*=|\b(?:href|src)\s*=\s*["'](?:https?|wss?):\/\//iu,
  );
});

test("the dedicated Vite mode is the only source of the Web Demo flag", () => {
  assert.equal(
    viteSource.match(/VITE_AETHERTWIN_WEB_DEMO/gu)?.length,
    1,
  );
  assert.match(
    viteSource,
    /JSON\.stringify\(\s*mode === "web-demo" \? "1" : "0",?\s*\)/u,
  );
});

test("ordinary production backend selection remains present and fail-closed", () => {
  assert.equal(existsSync("apps/studio/src/app.tsx"), true);
  assert.equal(existsSync("apps/studio/src/backend/select-backend.ts"), true);
  assert.doesNotMatch(selectBackendSource, /VITE_AETHERTWIN_WEB_DEMO/u);
  assert.match(selectBackendSource, /if \(import\.meta\.env\.DEV\)/u);
  assert.match(selectBackendSource, /TAURI_RUNTIME_REQUIRED/u);
  assert.match(selectBackendSource, /WEB_SANDBOX_DISABLED/u);
  assert.match(failClosedTestSource, /rejects\.toThrow\("TAURI_RUNTIME_REQUIRED"\)/u);
  assert.match(failClosedTestSource, /rejects\.toThrow\("WEB_SANDBOX_DISABLED"\)/u);
});

test("Web Demo runtime sources remain local-only and browser-persistence-free", () => {
  assert.ok(webDemoRuntimeFiles.includes("apps/studio/src/web-demo/web-demo-app.tsx"));
  assert.ok(webDemoRuntimeFiles.includes("apps/studio/src/studio-root.tsx"));
  assert.doesNotMatch(webDemoRuntimeSource, /(?:https?|wss?):\/\//iu);
  assert.doesNotMatch(webDemoRuntimeSource, /\bcdn\b|telemetry/iu);
  assert.deepEqual(reachableWebDemoPersistenceViolations(), []);
  assert.match(studioRootSource, /if \(webDemo \|\| typeof window === "undefined"\) \{\s+return createMemoryLocalePreference\(\);/u);
  assert.doesNotMatch(
    webDemoRuntimeSource,
    /ProjectExportBackend|TauriProjectBackend|begin_project_export|write_project_export_chunk/u,
  );
  assert.doesNotMatch(webDemoRuntimeSource, /\binvoke\s*\(/u);
});

test("Web Demo policy traces reachable locale and editor runtime dependencies", () => {
  for (const required of [
    "apps/studio/src/i18n/locale-provider.tsx",
    "apps/studio/src/i18n/locale-preference.ts",
    "apps/studio/src/i18n/language-switcher.tsx",
    "apps/studio/src/features/plan-editor/plan-editor.tsx",
  ]) {
    assert.ok(reachableWebDemoRuntimeFiles.includes(required), `missing reachable ${required}`);
  }
});

test("Web Demo policy traces imported workspace packages but never external dependencies", () => {
  for (const required of [
    "packages/editor-shell/src/index.ts",
    "packages/project-store/src/index.ts",
    "packages/render-plan-2d/src/index.ts",
    "packages/render-scene-3d/src/index.ts",
  ]) {
    assert.ok(reachableWebDemoRuntimeFiles.includes(required), `missing reachable ${required}`);
  }
  assert.deepEqual(
    reachableWebDemoPersistenceViolations(new Map([
      ["packages/editor-shell/src/index.ts", "window.localStorage.getItem(\"locale\");"],
    ])),
    ["packages/editor-shell/src/index.ts: localStorage"],
  );
  assert.ok(reachableWebDemoRuntimeFiles.every((file) => !file.includes("/node_modules/")));
});

test("strict-CSP Web Demo installs Pixi static polyfills before renderer imports", () => {
  const polyfillImport = pixiPlanRendererSource.indexOf(
    'import "pixi.js/unsafe-eval";',
  );
  const rendererImport = pixiPlanRendererSource.indexOf('} from "pixi.js";');

  assert.notEqual(polyfillImport, -1);
  assert.notEqual(rendererImport, -1);
  assert.ok(polyfillImport < rendererImport);
});

test("canonical Web Demo assets bypass Vite byte rewriting", () => {
  const assetImports = webDemoFixturesSource
    .split(/\r?\n/u)
    .filter((line) => line.includes("fixtures/assets/showroom-demo/"));

  assert.deepEqual(assetImports, [
    "import manifest from \"../../../../fixtures/assets/showroom-demo/manifest.json\";",
    "import planReferenceUrl from \"../../../../fixtures/assets/showroom-demo/plan-reference.svg?url&no-inline\";",
    "import floorUrl from \"../../../../fixtures/assets/showroom-demo/floor.png?url&no-inline\";",
    "import wallUrl from \"../../../../fixtures/assets/showroom-demo/wall.jpg?url&no-inline\";",
    "import fixtureUrl from \"../../../../fixtures/assets/showroom-demo/fixture.svg?url&no-inline\";",
  ]);
});

test("the Web Demo adds no dependency or lockfile mutation", () => {
  assert.deepEqual(studioPackage.dependencies, {
    "@aethertwin/core-model": "workspace:*",
    "@aethertwin/design-system": "workspace:*",
    "@aethertwin/editor-shell": "workspace:*",
    "@aethertwin/exporter": "workspace:*",
    "@aethertwin/mode-showroom": "workspace:*",
    "@aethertwin/plan-engine": "workspace:*",
    "@aethertwin/project-store": "workspace:*",
    "@aethertwin/render-plan-2d": "workspace:*",
    "@aethertwin/render-scene-3d": "workspace:*",
    "@aethertwin/route-engine": "workspace:*",
    "@tauri-apps/api": "2.11.1",
    "@tauri-apps/plugin-dialog": "2.7.2",
    react: "19.2.7",
    "react-dom": "19.2.7",
    zustand: "5.0.14",
  });
  assert.deepEqual(studioPackage.devDependencies, {
    "@testing-library/jest-dom": "6.9.1",
    "@testing-library/react": "16.3.2",
    "@testing-library/user-event": "14.6.1",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.3",
    jsdom: "29.1.1",
  });
  assert.doesNotThrow(() => {
    execFileSync("git", ["diff", "--quiet", "HEAD", "--", "pnpm-lock.yaml"]);
  });
});

test("no private environment or generated Web Demo artifacts are committed", () => {
  assert.deepEqual(
    trackedFiles.filter((file) => /(?:^|\/)\.env(?:\.|$)/u.test(file)),
    [],
  );
  assert.deepEqual(
    trackedFiles.filter((file) => /(?:^|\/)dist(?:\/|$)/u.test(file)),
    [],
  );
  assert.deepEqual(trackedFiles.filter((file) => file.endsWith(".twinproj")), []);
  assert.deepEqual(
    trackedFiles.filter((file) => /(?:^|\/)exports\/.*\.png$/iu.test(file)),
    [],
  );
});
