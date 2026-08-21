import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const toolbar = readFileSync("apps/studio/src/features/plan-editor/plan-toolbar.tsx", "utf8");
const editorShell = readFileSync("packages/editor-shell/src/editor-shell.tsx", "utf8");
const policy = readFileSync("packages/mode-showroom/src/tool-policy.ts", "utf8");
const displayIds = readFileSync("apps/studio/src/i18n/display-message-ids.ts", "utf8");
const projectCenter = readFileSync("apps/studio/src/features/project-center/project-center.tsx", "utf8");
const editorSession = readFileSync("apps/studio/src/features/plan-editor/editor-session.ts", "utf8");
const planEditor = readFileSync("apps/studio/src/features/plan-editor/plan-editor.tsx", "utf8");
const fixtureCatalogue = readFileSync("apps/studio/src/features/plan-editor/fixture-catalogue.tsx", "utf8");
const roomRecognitionPanel = readFileSync("apps/studio/src/features/plan-editor/room-recognition-panel.tsx", "utf8");
const showroomCatalogue = readFileSync("packages/mode-showroom/src/catalogue.ts", "utf8");
const playerBoundary = readFileSync("apps/player/src/player-boundary.tsx", "utf8");
const expectedPlanTools = [
  "select", "pan", "boundary", "wall", "door", "window", "zone", "space-unit",
  "fixture", "poi", "dimension", "product-hotspot", "route-node", "route-edge",
];

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
  assert.match(toolbar, /const actionId = tool === "space-unit"[\s\S]*?"room"/u);
  assert.match(toolbar, /data-action=\{profile === "showroom" \? actionId : undefined\}/u);
  assert.match(toolbar, /data-action="recognize-rooms"/u);
  assert.match(toolbar, /data-action=\{id\}/u);
  assert.match(toolbar, /SHOWROOM_TOOL_ACTION_MESSAGE_IDS\[id\]/u);
  for (const actionId of expectedActions) {
    assert.match(displayIds, new RegExp(`(?:"${actionId}"|\\b${actionId}:)`, "u"));
  }
});

test("visible controls are wired through live callbacks, not presentation labels", () => {
  assert.match(toolbar, /onClick=\{\(event\) => onToolChange\(tool, event\.currentTarget\)\}/u);
  assert.match(toolbar, /onClick=\{\(event\) => onRecognizeRooms\(event\.currentTarget\)\}/u);
  assert.match(toolbar, /onClick=\{onClick === undefined[\s\S]*?\(event\) => onClick\(event\.currentTarget\)/u);
  for (const callback of ["onSave", "onUndo", "onRedo", "onClose"]) {
    assert.match(editorShell, new RegExp(`onClick=\\{${callback}\\}`, "u"));
  }
  assert.doesNotMatch(toolbar, /ToolGroupDescriptor\.label|ToolActionDescriptor\.label|defaultName/u);
});

test("foundational project and editor callbacks retain live routes", () => {
  assert.match(projectCenter, /onStartCreate\("showroom"\)/u);
  assert.match(projectCenter, /onStartCreate\("market"\)/u);
  assert.match(projectCenter, /onOpenExisting/u);
  assert.match(projectCenter, /onOpen\(newestProject\.path\)/u);
  for (const callback of ["onBack", "onSave", "onUndo", "onRedo", "onClose"]) {
    assert.match(editorShell, new RegExp(`onClick=\\{${callback}\\}`, "u"));
  }
});

test("the complete PlanTool contract reaches the live session", () => {
  const union = editorSession.match(/export type PlanTool\s*=([\s\S]*?);/u)?.[1];
  assert.ok(union);
  const declared = [...union.matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
  assert.deepEqual([...declared].sort(), [...expectedPlanTools].sort());
  const definitions = toolbar.match(/const toolById:[\s\S]*?=\s*\{([\s\S]*?)\n\};/u)?.[1];
  assert.ok(definitions);
  const wired = [...definitions.matchAll(/tool:\s*"([^"]+)"/gu)].map((match) => match[1]);
  assert.deepEqual(wired.sort(), [...expectedPlanTools].sort());
  assert.match(toolbar, /data-tool=\{tool\}[\s\S]*?onClick=\{\(event\) => onToolChange\(tool, event\.currentTarget\)\}/u);
  assert.match(planEditor, /function selectTool\(tool: PlanTool, initiator: HTMLButtonElement\): void \{[\s\S]*?setActiveTool\(tool\)/u);
  assert.match(planEditor, /<PlanToolbar\b[\s\S]*?onToolChange=\{selectTool\}/u);
});

test("Market and Player retain their no-3D and no-export boundaries", () => {
  const market = toolbar.slice(toolbar.indexOf("  market: ["), toolbar.indexOf("  showroom: ["));
  for (const forbidden of ["view-3d", "view-split", "export"]) assert.equal(market.includes(forbidden), false);
  assert.doesNotMatch(playerBoundary, /(?:3D|Export)/u);
});

test("import and calibration callbacks remain live while deferred actions stay absent", () => {
  for (const callback of ["onImportFloorPlan", "onCalibrate"]) {
    assert.match(toolbar, new RegExp(`readonly ${callback}\\?:`, "u"));
    assert.match(toolbar, new RegExp(`${callback}\\(event\\.currentTarget\\)`, "u"));
    assert.match(planEditor, new RegExp(`${callback}:\\s*\\(initiator: HTMLButtonElement\\) =>`, "u"));
  }
  const actionSurface = `${toolbar}\n${planEditor}`;
  for (const forbidden of ["onAddOpening", "onAddContent", "onAddRoute", "onOpen3D", "onPublish"]) {
    assert.doesNotMatch(actionSurface, new RegExp(`\\b${forbidden}\\b`, "u"));
  }
});

test("fixture and room-recognition workflows retain their live callbacks", () => {
  assert.match(fixtureCatalogue, /SHOWROOM_FIXTURE_CATALOGUE\.map/u);
  assert.match(fixtureCatalogue, /data-fixture-kind=\{descriptor\.kind\}/u);
  assert.match(fixtureCatalogue, /onClick=\{\(\) => onSelect\(descriptor\.kind\)\}/u);
  assert.doesNotMatch(showroomCatalogue, /fixture\("generic"/u);
  for (const callback of ["onConfirmOne", "onConfirmAll", "onReplaceSelectedRoom"]) {
    assert.match(roomRecognitionPanel, new RegExp(`onClick=\\{${callback}\\}`, "u"));
  }
  assert.match(toolbar, /onRecognizeRooms\(event\.currentTarget\)/u);
});

test("Showroom contextual and Preview actions keep exact handlers and later handlers stay absent", () => {
  const contextualStart = toolbar.indexOf("const showroomContentActions");
  const contextualEnd = toolbar.indexOf("const showroomPreviewActions");
  const contextual = toolbar.slice(contextualStart, contextualEnd)
    .split('{ id: "').slice(1).map((fragment) => fragment.split('"')[0]);
  assert.deepEqual(contextual, ["attach-product-media", "edit-route-stops", "preview-guided-route"]);
  for (const actionId of ["attach-product-media", "edit-route-stops", "preview-guided-route", "view-2d", "view-3d", "view-split", "frame-selection", "frame-route", "export"]) {
    assert.match(toolbar, new RegExp(`case "${actionId}"`, "u"));
  }
  const market = toolbar.slice(toolbar.indexOf("  market: ["), toolbar.indexOf("  showroom: ["));
  assert.equal(market.includes("showroomPreviewActions"), false);
  assert.equal(market.includes("frame-selection"), false);
  for (const expression of ["onEditRouteStops: openGuidedRoutePanel", "onPreviewGuidedRoute: openGuidedRoutePanel", "onViewModeChange=", 'requestSceneFrame("selection")', 'requestSceneFrame("route")', "onExport="]) {
    assert.equal(planEditor.includes(expression), true, expression);
  }
  const source = [toolbar, planEditor, fixtureCatalogue, roomRecognitionPanel].join("\n");
  for (const forbidden of ["onOpen3D", "onEditMaterials", "onEditLighting", "onPublish"]) {
    assert.doesNotMatch(source, new RegExp(`\\b${forbidden}\\b`, "u"));
  }
  for (const forbiddenAction of ["open-3d", "edit-materials", "edit-lighting", "publish"]) {
    assert.doesNotMatch(policy, new RegExp(`action\\("${forbiddenAction}"`, "u"));
  }
});
