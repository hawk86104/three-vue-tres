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
const snapshotV2 = JSON.parse(
  readFileSync("fixtures/contracts/snapshot.v2.json", "utf8"),
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

  const relativePathParser = validation.match(
    /function parseRelativePath\(value: unknown, path: string\): string \{[\s\S]*?^\}/m,
  )?.[0];
  assert.ok(relativePathParser, "production parseRelativePath must exist");
  assert.ok(
    validation.includes(
      'relativePath: parseRelativePath(source.relativePath, `${path}.relativePath`)',
    ),
    "parseAsset must route persisted paths through parseRelativePath",
  );
  for (const constraint of [
    "const candidate = nonEmpty(value, path);",
    'candidate.startsWith("/")',
    'candidate.startsWith("\\\\")',
    'candidate.includes("\\\\")',
    "/^[a-zA-Z]:/.test(candidate)",
    'segment === "" || segment === "." || segment === ".."',
    'fail("INVALID_RELATIVE_PATH", path',
  ]) {
    assert.ok(relativePathParser.includes(constraint), `missing path constraint: ${constraint}`);
  }

  const completeV2Fixture = coreModelTests.match(
    /function completeSnapshotInput\(\): any \{[\s\S]*?^\}/m,
  )?.[0];
  assert.ok(completeV2Fixture, "non-empty schema-v2 fixture must exist");
  assert.match(completeV2Fixture, /snapshot\.assets = \[\{[\s\S]*?relativePath: "assets\/display\.png"[\s\S]*?size: 42,[\s\S]*?\}\];/);
  assert.match(coreModelTests, /const input = completeSnapshotInput\(\);\s*const parsed = parseSnapshotV2\(input\);\s*expect\(parsed\)\.toEqual\(input\);/);
  assert.match(coreModelTests, /"rejects unsafe asset path %s"[\s\S]*?parseSnapshot\([\s\S]*?relativePath,[\s\S]*?toThrow\(\/relativePath\/i\)/);

  assert.match(projectFormat, /project-relative path/i);
  assert.doesNotMatch(`${projectIo}\n${schema}`, /[A-Z]:\\\\|file:\/\//);
});

test("TypeScript, Rust, fixture, and documentation agree on schema v2", () => {
  assert.match(model, /export const CURRENT_SCHEMA_VERSION = 2 as const;/);
  assert.match(rustModel, /pub const CURRENT_SCHEMA_VERSION: u32 = 2;/);
  assert.equal(snapshotV2.schemaVersion, 2);
  assert.equal(snapshotV2.project.floors.length, 1);
  assert.equal(snapshotV2.project.floors[0].layers.length, 1);
  assert.match(projectFormat, /current schema version is 2/i);
  assert.match(projectFormat, /v1[^\n]*v2|schema v1[\s\S]*schema v2/i);
  assert.doesNotMatch(projectFormat, /current schema version is 1/i);
});

test("core model keeps exactly two profiles", () => {
  assert.match(model, /export type ProjectProfile = "showroom" \| "market";/);
  assert.doesNotMatch(model, /export type ProjectProfile =[^;]+\|[^;]+\|/);
});
