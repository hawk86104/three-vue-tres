import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const projectIo = readFileSync("crates/project-io/src/project.rs", "utf8");
const schema = readFileSync("crates/project-io/src/schema.rs", "utf8");
const rustModel = readFileSync("crates/project-io/src/model.rs", "utf8");
const model = readFileSync("packages/core-model/src/model.ts", "utf8");
const validation = readFileSync("packages/core-model/src/validation.ts", "utf8");
const coreModelTests = readFileSync("packages/core-model/src/core-model.test.ts", "utf8");
const projectFormat = readFileSync("docs/PROJECT_FORMAT.md", "utf8");
const snapshotV1 = JSON.parse(
  readFileSync("fixtures/contracts/snapshot.v1.json", "utf8"),
);
const snapshotV2 = JSON.parse(
  readFileSync("fixtures/contracts/snapshot.v2.json", "utf8"),
);
const snapshotV3 = JSON.parse(
  readFileSync("fixtures/contracts/snapshot.v3.json", "utf8"),
);

test("project format is relative-path metadata, never embedded media", () => {
  for (const directory of ["assets", "thumbnails", "derived", "exports"]) {
    assert.match(projectIo, new RegExp(`\\b${directory}\\b`));
  }
  assert.match(projectIo, /manifest\.json/);
  assert.match(projectIo, /project\.db/);
  assert.doesNotMatch(schema, /\bBLOB\b/i);
  assert.match(schema, /relative_path/);
  assert.match(schema, /sha256/);
  assert.match(model, /readonly relativePath: string;/);

  const parseAssetV3 = validation.match(
    /function parseAssetV3\(value: unknown, path: string, registerId: RegisterId\): AssetRecord \{[\s\S]*?^\}/m,
  )?.[0];
  assert.ok(parseAssetV3, "production parseAssetV3 must exist");
  for (const constraint of [
    "const sha256 = text(source.sha256, `${path}.sha256`);",
    "const mediaType = oneOf(source.mediaType, `${path}.mediaType`, ASSET_MEDIA_TYPES);",
    "const relativePath = nonEmpty(source.relativePath, `${path}.relativePath`);",
    "const expectedPath = `assets/sha256/${sha256.slice(0, 2)}/${sha256}.${ASSET_EXTENSION[mediaType]}`;",
    "if (relativePath !== expectedPath)",
    'fail("INVALID_RELATIVE_PATH", `${path}.relativePath`, `expected ${expectedPath}`);',
  ]) {
    assert.ok(parseAssetV3.includes(constraint), `missing canonical asset constraint: ${constraint}`);
  }

  const canonicalPathTests = coreModelTests.match(
    /it\.each\(\["\/media\/x\.png",[\s\S]*?\]\)\(\s*"rejects unsafe asset path %s",[\s\S]*?toThrow\(\/relativePath\/i\);/m,
  )?.[0];
  assert.ok(canonicalPathTests, "schema-v3 canonical-path tests must exist");
  assert.match(canonicalPathTests, /"\/media\/x\.png"/);
  assert.match(canonicalPathTests, /server/);
  assert.match(canonicalPathTests, /"\\\\media/);
  assert.match(canonicalPathTests, /media\/\.\.\/x\.png/);

  assert.match(projectFormat, /project-relative path/i);
  assert.doesNotMatch(`${projectIo}\n${schema}`, /[A-Z]:\\\\|file:\/\//);
});

test("TypeScript, Rust, fixture, and documentation agree on schema v3", () => {
  assert.match(model, /export const CURRENT_SCHEMA_VERSION = 3 as const;/);
  assert.match(rustModel, /pub const CURRENT_SCHEMA_VERSION: u32 = 3;/);
  assert.equal(snapshotV1.schemaVersion, 1);
  assert.equal(snapshotV2.schemaVersion, 2);
  assert.equal(snapshotV3.schemaVersion, 3);
  assert.equal(snapshotV3.project.floors.length, 1);
  assert.equal(snapshotV3.project.floors[0].layers.length, 1);
  assert.match(coreModelTests, /migrates a v1 snapshot without inventing authoring content/);
  assert.match(coreModelTests, /migrates v2 to v3 by adding only deterministic v3 state/);
  assert.match(projectFormat, /current schema version is 3/i);
  assert.match(projectFormat, /v1[\s\S]*v2[\s\S]*v3/i);
  assert.doesNotMatch(projectFormat, /current schema version is 1/i);
});

test("core model keeps exactly two profiles", () => {
  assert.match(model, /export type ProjectProfile = "showroom" \| "market";/);
  assert.doesNotMatch(model, /export type ProjectProfile =[^;]+\|[^;]+\|/);
});
