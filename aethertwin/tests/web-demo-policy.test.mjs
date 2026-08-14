import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, globSync, readFileSync } from "node:fs";
import test from "node:test";

const studioPackage = JSON.parse(readFileSync("apps/studio/package.json", "utf8"));
const viteSource = readFileSync("apps/studio/vite.config.ts", "utf8");
const selectBackendSource = readFileSync(
  "apps/studio/src/backend/select-backend.ts",
  "utf8",
);
const failClosedTestSource = readFileSync(
  "apps/studio/src/backend/tauri-backend.test.ts",
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

test("the Web Demo has exactly two dedicated scripts", () => {
  const scripts = Object.entries(studioPackage.scripts).filter(
    ([name, command]) => name.includes("web-demo") || command.includes("web-demo"),
  );

  assert.deepEqual(scripts, [
    ["web-demo", "vite --mode web-demo --host 127.0.0.1 --port 4173"],
    ["build:web-demo", "vite build --mode web-demo"],
  ]);
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
  assert.doesNotMatch(webDemoRuntimeSource, /localStorage|indexedDB/iu);
  assert.doesNotMatch(webDemoRuntimeSource, /serviceWorker|navigator\.serviceWorker/iu);
  assert.doesNotMatch(
    webDemoRuntimeSource,
    /ProjectExportBackend|TauriProjectBackend|begin_project_export|write_project_export_chunk/u,
  );
  assert.doesNotMatch(webDemoRuntimeSource, /\binvoke\s*\(/u);
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
