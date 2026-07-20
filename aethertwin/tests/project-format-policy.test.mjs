import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const projectIo = readFileSync("crates/project-io/src/project.rs", "utf8");
const schema = readFileSync("crates/project-io/src/schema.rs", "utf8");
const model = readFileSync("packages/core-model/src/model.ts", "utf8");

test("project format is relative-path metadata, never embedded media", () => {
  for (const directory of ["assets", "thumbnails", "derived", "exports"]) {
    assert.match(projectIo, new RegExp(`\\b${directory}\\b`));
  }
  assert.match(projectIo, /manifest\.json/);
  assert.match(projectIo, /project\.db/);
  assert.doesNotMatch(schema, /\bBLOB\b/i);
  assert.match(schema, /relative_path/);
  assert.match(schema, /sha256/);
  assert.doesNotMatch(`${projectIo}\n${schema}`, /[A-Z]:\\\\|file:\/\//);
});

test("core model keeps exactly two profiles", () => {
  assert.match(model, /export type ProjectProfile = "showroom" \| "market";/);
  assert.doesNotMatch(model, /export type ProjectProfile =[^;]+\|[^;]+\|/);
});
