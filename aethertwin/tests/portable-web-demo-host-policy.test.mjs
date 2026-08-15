import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("the portable Web Demo host is an exact dependency-free workspace member", () => {
  const workspace = readFileSync("Cargo.toml", "utf8");
  assert.match(
    workspace,
    /members\s*=\s*\["crates\/project-io",\s*"crates\/desktop-host",\s*"crates\/asset-io",\s*"crates\/media-export",\s*"crates\/web-demo-host"\]/u,
  );

  for (const relative of [
    "crates/web-demo-host/Cargo.toml",
    "crates/web-demo-host/src/lib.rs",
    "crates/web-demo-host/src/main.rs",
  ]) {
    assert.equal(existsSync(relative), true, `missing ${relative}`);
  }

  const manifest = readFileSync("crates/web-demo-host/Cargo.toml", "utf8");
  assert.match(
    manifest,
    /^\[package\]\r?\nname\s*=\s*"aethertwin-web-demo-host"$/mu,
  );
  assert.match(manifest, /^\[lib\]\r?\npath\s*=\s*"src\/lib\.rs"$/mu);
  assert.match(
    manifest,
    /^\[\[bin\]\]\r?\nname\s*=\s*"aethertwin-web-demo-host"\r?\npath\s*=\s*"src\/main\.rs"$/mu,
  );
  assert.equal(/^\[dependencies\]$/mu.test(manifest), false);
});
