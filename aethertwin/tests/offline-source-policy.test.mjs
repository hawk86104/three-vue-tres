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

const urlPattern = /https?:\/\/[^\s"'`)}\]]+|(?<![:\w])\/\/[^\s"'`)}\]]+/gi;
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

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
