import { globSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const runtimePatterns = [
  "apps/**/*.{ts,tsx,css,html}",
  "packages/**/*.{ts,tsx,css,html}",
  "crates/**/src/**/*.rs",
];
const runtimeFiles = globSync(
  runtimePatterns,
  {
    exclude: [
      "**/*.test.*",
      "**/*_tests.rs",
      "**/__tests__/**",
      "**/e2e/**",
      "**/dev/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/generated/**",
      "**/node_modules/**",
    ],
  },
);

const urlPattern =
  /(?:https?|wss?):\/\/[^\s"'`)}]+|(?<![:\w])\/\/(?:[\p{L}\p{N}]|\[)[^\s"'`)}]*/giu;
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const acceptanceSpec = readFileSync("apps/studio/e2e/m0.spec.ts", "utf8");
const tauriConfig = JSON.parse(readFileSync("crates/desktop-host/tauri.conf.json", "utf8"));
const exactProductionCsp =
  "default-src 'self'; connect-src ipc: http://ipc.localhost; img-src 'self' aethertwin-asset: http://aethertwin-asset.localhost blob: data:; media-src 'self' aethertwin-asset: http://aethertwin-asset.localhost blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'";

function remoteUrls(source) {
  return [...source.matchAll(urlPattern)].filter(([candidate]) => {
    try {
      const url = new URL(candidate.startsWith("//") ? `http:${candidate}` : candidate);
      return !localHosts.has(url.hostname);
    } catch {
      return false;
    }
  });
}

test("offline scanning covers every M1 runtime source boundary", () => {
  const normalized = runtimeFiles.map((file) => file.replaceAll("\\", "/"));
  for (const prefix of [
    "apps/studio/src/features/plan-editor/",
    "packages/plan-engine/src/",
    "packages/render-plan-2d/src/",
    "crates/project-io/src/",
    "crates/desktop-host/src/",
  ]) {
    assert.ok(normalized.some((file) => file.startsWith(prefix)), `missing ${prefix}`);
  }
});

test("runtime source contains no remote URL or remote CSS import", () => {
  for (const file of runtimeFiles) {
    const source = readFileSync(file, "utf8");
    const remotes = remoteUrls(source).map(([url]) => url);
    assert.deepEqual(remotes, [], `remote runtime URL in ${file}: ${remotes.join(", ")}`);
  }
});
test("Tauri production CSP is exact, local-only, and does not enable broad asset protocol access", () => {
  const security = tauriConfig.app.security;
  assert.equal(security.csp, exactProductionCsp);
  assert.equal(security.assetProtocol, undefined);
  assert.doesNotMatch(security.csp, /(?:^|\s)\*(?:\s|;|$)/u);
  assert.doesNotMatch(security.csp, /'unsafe-eval'/u);
  assert.deepEqual(
    security.csp.match(/https?:\/\/[^\s;]+/gu),
    ["http://ipc.localhost", "http://aethertwin-asset.localhost", "http://aethertwin-asset.localhost"],
  );
  assert.doesNotMatch(security.csp, /(?:https|wss?):/u);
});

test("remoteUrls blocks remote WebSockets and permits loopback WebSockets", () => {
  assert.deepEqual(
    remoteUrls("ws://remote.example/socket wss://remote.example/socket").map(([url]) => url),
    ["ws://remote.example/socket", "wss://remote.example/socket"],
  );

  for (const host of ["localhost", "127.0.0.1", "[::1]", "::1"]) {
    assert.ok(localHosts.has(host), host + " must be treated as local");
  }
  assert.deepEqual(
    remoteUrls(
      "ws://localhost/socket wss://localhost/socket ws://127.0.0.1/socket wss://127.0.0.1/socket ws://[::1]/socket wss://[::1]/socket",
    ),
    [],
  );
});

test("remoteUrls explicitly blocks protocol-relative URLs and string-form remote CSS imports", () => {
  assert.deepEqual(
    remoteUrls('src="//cdn.example/asset.png" background: url(//tiles.example/map.png)').map(
      ([url]) => url,
    ),
    ["//cdn.example/asset.png", "//tiles.example/map.png"],
  );
  assert.deepEqual(
    remoteUrls(
      'src="//cdn/assets/x.png" src="//192.0.2.1/assets/x.png" src="//[2001:db8::1]/assets/x.png"',
    ).map(([url]) => url),
    ["//cdn/assets/x.png", "//192.0.2.1/assets/x.png", "//[2001:db8::1]/assets/x.png"],
  );
  assert.deepEqual(
    remoteUrls('@import "https://fonts.example/theme.css";').map(([url]) => url),
    ["https://fonts.example/theme.css"],
  );
  assert.deepEqual(remoteUrls("// comment\n//! inner docs\n/// outer docs"), []);
});

test("Playwright blocks remote HTTP and WebSocket connections", () => {
  assert.match(acceptanceSpec, /await page\.route\(/);
  assert.match(
    acceptanceSpec,
    /await page\.routeWebSocket\(\s*\(url\) => !localHosts\.has\(url\.hostname\),\s*\(ws\) => ws\.close\(\{ code: 1008, reason: "blockedbyclient" \}\),\s*\);/s,
  );
});
test("offline scanning includes the M2.1 asset boundaries", () => {
  const normalized = runtimeFiles.map((file) => file.replaceAll("\\", "/"));
  for (const prefix of [
    "packages/asset-pipeline/src/",
    "crates/asset-io/src/",
  ]) {
    assert.ok(normalized.some((file) => file.startsWith(prefix)), `missing ${prefix}`);
  }
});

test("desktop M2.1 keeps exactly eight invokes, a custom protocol, and two permissions", () => {
  const host = readFileSync("crates/desktop-host/src/lib.rs", "utf8");
  const main = readFileSync("crates/desktop-host/src/main.rs", "utf8");
  const capability = JSON.parse(
    readFileSync("crates/desktop-host/capabilities/default.json", "utf8"),
  );
  const handler = host.match(/generate_handler!\[([\s\S]*?)\]/)?.[1];
  assert.ok(handler, "Tauri generate_handler list must exist");
  const commands = [...handler.matchAll(/commands::([a-z_]+)/g)].map((match) => match[1]);
  assert.deepEqual(commands, [
    "create_project",
    "open_project",
    "commit_project",
    "checkpoint_project",
    "close_project",
    "recover_project",
    "import_project_asset",
    "cancel_project_asset_import",
  ]);
  assert.match(host, /pub fn with_asset_protocol/);
  assert.match(main, /with_asset_protocol/);
  assert.deepEqual(capability.windows, ["main"]);
  assert.deepEqual(
    capability.permissions,
    ["core:window:default", "dialog:allow-open"],
  );
  assert.equal(tauriConfig.app.security.assetProtocol, undefined);
});