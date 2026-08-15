import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const studioPackage = JSON.parse(
  readFileSync("apps/studio/package.json", "utf8"),
);

test("the Windows x64 package command is exact and never becomes an ordinary hook", () => {
  assert.equal(
    rootPackage.scripts["package:web-demo:win-x64"],
    "node scripts/portable-web-demo/package-win-x64.mjs",
  );
  assert.deepEqual(
    Object.entries(rootPackage.scripts).filter(
      ([name, command]) =>
        name.includes("package:web-demo") || command.includes("package:web-demo"),
    ),
    [
      [
        "package:web-demo:win-x64",
        "node scripts/portable-web-demo/package-win-x64.mjs",
      ],
    ],
  );
  for (const hook of ["postinstall", "test", "build"]) {
    assert.doesNotMatch(rootPackage.scripts[hook] ?? "", /package:web-demo/iu);
  }
  assert.equal(
    studioPackage.scripts["web-demo"],
    "vite --mode web-demo --host 127.0.0.1 --port 4173 --strictPort",
  );
  assert.equal(
    studioPackage.scripts["build:web-demo"],
    "vite build --mode web-demo",
  );
});

test("portable packaging source is fixed, built-in-only, and dependency-free", () => {
  const sourceFiles = [
    "scripts/portable-web-demo/package-win-x64.mjs",
    "scripts/portable-web-demo/assemble.mjs",
    "scripts/portable-web-demo/zip.mjs",
  ];
  for (const file of sourceFiles) {
    assert.equal(existsSync(file), true, `missing ${file}`);
  }
  const source = sourceFiles
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  for (const specifier of source.matchAll(/from\s+["']([^"']+)["']/gu)) {
    assert.ok(
      specifier[1].startsWith("node:") || specifier[1].startsWith("./"),
      specifier[1],
    );
  }
  for (const expected of [
    "pnpm.cmd",
    "@aethertwin/studio",
    "build:web-demo",
    "x86_64-pc-windows-msvc",
    "aethertwin-web-demo-host",
    "apps/studio/dist",
    "AetherTwin-Preview.exe",
    "artifacts/AetherTwin-Preview-win-x64.zip",
  ]) {
    assert.match(source, new RegExp(expected.replaceAll("/", "\\/"), "u"));
  }
  assert.doesNotMatch(
    source,
    /@tauri-apps|file:\/\/\/|https?:\/\//iu,
  );
  assert.doesNotThrow(() => {
    execFileSync("git", ["diff", "--quiet", "HEAD", "--", "pnpm-lock.yaml"]);
  });
});

test("generated portable output is ignored and never tracked", () => {
  const ignore = readFileSync(".gitignore", "utf8");
  assert.match(ignore, /^artifacts\/$/mu);
  const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .map((path) => path.replaceAll("\\", "/"));
  assert.deepEqual(
    tracked.filter(
      (path) =>
        path.startsWith("artifacts/") ||
        /(?:^|\/)dist(?:\/|$)/u.test(path) ||
        /\.(?:exe|zip)$/iu.test(path) ||
        /(?:^|\/)(?:playwright-report|test-results|browser-cache)(?:\/|$)/u.test(
          path,
        ),
    ),
    [],
  );
});


test("the committed portable README states every runtime limitation", () => {
  const readme = readFileSync("packaging/web-demo/README.txt", "utf8");
  for (const statement of [
    "Windows 10/11 x64",
    "unsigned",
    "does not need Node.js, pnpm, or an installer",
    "127.0.0.1:4173",
    "another free loopback port",
    "Microsoft Edge and Google Chrome",
    "Close the console window",
    "SHA256SUMS.txt",
    "resets the Showroom state",
    "Export remains available only in the desktop product",
    "does not persist edits",
    "file://",
    "single-file HTML",
    "Player",
    "publish content",
  ]) {
    assert.match(readme, new RegExp(statement.replaceAll("/", "\\/"), "u"));
  }
});
