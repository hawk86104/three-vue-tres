import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const toolbar = readFileSync("apps/studio/src/features/plan-editor/plan-toolbar.tsx", "utf8");
const editorShell = readFileSync("packages/editor-shell/src/editor-shell.tsx", "utf8");
const policy = readFileSync("packages/mode-showroom/src/tool-policy.ts", "utf8");
const displayIds = readFileSync("apps/studio/src/i18n/display-message-ids.ts", "utf8");

const expectedActions = [
  "select", "pan", "boundary", "wall", "door", "window", "zone", "room",
  "recognize-rooms", "fixture-catalogue", "poi", "dimension", "product-hotspot",
  "attach-product-media", "route-node", "route-edge", "edit-route-stops",
  "preview-guided-route", "view-2d", "view-3d", "view-split", "frame-selection",
  "frame-route", "export",
];

test("Showroom visible actions use the approved stable IDs in order", () => {
  const actionIds = policy.split('action("').slice(1).map((part) => part.split('"')[0]);
  assert.deepEqual(actionIds, expectedActions);
  assert.match(toolbar, /data-action=\{id\}/u);
  assert.match(toolbar, /SHOWROOM_TOOL_ACTION_MESSAGE_IDS\[id\]/u);
  for (const actionId of expectedActions) {
    assert.match(displayIds, new RegExp(`(?:"${actionId}"|\\b${actionId}:)`, "u"));
  }
});

test("visible controls are wired through live callbacks, not presentation labels", () => {
  assert.match(toolbar, /onClick=\{\(event\) => onToolChange\(tool, event\.currentTarget\)\}/u);
  assert.match(toolbar, /onClick=\{onClick === undefined[\s\S]*?\(event\) => onClick\(event\.currentTarget\)/u);
  for (const callback of ["onSave", "onUndo", "onRedo", "onClose"]) {
    assert.match(editorShell, new RegExp(`onClick=\\{${callback}\\}`, "u"));
  }
  assert.doesNotMatch(toolbar, /ToolGroupDescriptor\.label|ToolActionDescriptor\.label|defaultName/u);
});
