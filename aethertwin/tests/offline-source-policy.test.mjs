import { globSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const runtimeFiles = globSync(
  ["apps/**/*.{ts,tsx,css,html}", "packages/**/*.{ts,tsx,css,html}"],
  {
    exclude: [
      "**/*.test.*",
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

const urlPattern = /(?:https?|wss?):\/\/[^\s"'`)}]+|(?<![:\w])\/\/[^\s"'`)}]+/gi;
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const acceptanceSpec = readFileSync("apps/studio/e2e/m0.spec.ts", "utf8");

function remoteUrls(source) {
  return [...source.matchAll(urlPattern)].filter(([candidate]) => {
    const url = new URL(candidate.startsWith("//") ? `http:${candidate}` : candidate);
    return !localHosts.has(url.hostname);
  });
}

test("runtime source contains no remote URL or remote CSS import", () => {
  for (const file of runtimeFiles) {
    const source = readFileSync(file, "utf8");
    const remotes = remoteUrls(source).map(([url]) => url);
    assert.deepEqual(remotes, [], `remote runtime URL in ${file}: ${remotes.join(", ")}`);
  }
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
    remoteUrls('@import "https://fonts.example/theme.css";').map(([url]) => url),
    ["https://fonts.example/theme.css"],
  );
});

test("Playwright blocks remote HTTP and WebSocket connections", () => {
  assert.match(acceptanceSpec, /await page\.route\(/);
  assert.match(
    acceptanceSpec,
    /await page\.routeWebSocket\(\s*\(url\) => !localHosts\.has\(url\.hostname\),\s*\(ws\) => ws\.close\(\{ code: 1008, reason: "blockedbyclient" \}\),\s*\);/s,
  );
});
