import { globSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const projectCenter = readFileSync(
  "apps/studio/src/features/project-center/project-center.tsx",
  "utf8",
);
const editorShell = readFileSync("packages/editor-shell/src/editor-shell.tsx", "utf8");
const editorSession = readFileSync(
  "apps/studio/src/features/plan-editor/editor-session.ts",
  "utf8",
);
const planEditor = readFileSync(
  "apps/studio/src/features/plan-editor/plan-editor.tsx",
  "utf8",
);
const planToolbar = readFileSync(
  "apps/studio/src/features/plan-editor/plan-toolbar.tsx",
  "utf8",
);
const showroomToolPolicy = readFileSync(
  "packages/mode-showroom/src/tool-policy.ts",
  "utf8",
);
const showroomCatalogue = readFileSync(
  "packages/mode-showroom/src/catalogue.ts",
  "utf8",
);
const fixtureCatalogue = readFileSync(
  "apps/studio/src/features/plan-editor/fixture-catalogue.tsx",
  "utf8",
);
const roomRecognitionPanel = readFileSync(
  "apps/studio/src/features/plan-editor/room-recognition-panel.tsx",
  "utf8",
);
const m23PlanTools = [
  "select", "pan", "boundary", "wall", "door", "window", "zone", "space-unit", "fixture", "poi", "dimension", "product-hotspot", "route-node", "route-edge",
];
const runtimeFiles = globSync(["apps/studio/src/**/*.{ts,tsx}"], {
  exclude: ["**/*.test.*", "**/dev/**", "**/e2e/**"],
});
const runtime = runtimeFiles.map((file) => readFileSync(file, "utf8")).join("\n");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertWiredButton(source, label, handler) {
  const button = new RegExp(
    `<Button\\b(?:(?!<\\/Button>)[\\s\\S])*?onClick=\\{${escapeRegExp(handler)}\\}`
      + `(?:(?!<\\/Button>)[\\s\\S])*?>\\s*${label}\\s*<\\/Button>`,
  );
  assert.match(source, button, `${label} must be a Button wired to ${handler}`);
}

test("foundational project and editor actions remain wired", () => {
  assertWiredButton(projectCenter, "新建店铺展厅", '() => onStartCreate("showroom")');
  assertWiredButton(projectCenter, "新建市集导览", '() => onStartCreate("market")');
  assertWiredButton(projectCenter, "打开本地项目", "onOpenExisting");
  assert.match(
    projectCenter,
    /<Button\b(?:(?!<\/Button>)[\s\S])*?onClick=\{\(\) => \{[\s\S]*?onOpen\(newestProject\.path\);[\s\S]*?\}\}(?:(?!<\/Button>)[\s\S])*?>\s*打开沙盒项目\s*<\/Button>/,
    "打开沙盒项目 must be wired to reopen the newest sandbox project",
  );

  assertWiredButton(editorShell, "保存", "onSave");
  assertWiredButton(editorShell, "撤销", "onUndo");
  assertWiredButton(editorShell, "重做", "onRedo");
  assertWiredButton(editorShell, "关闭", "onClose");
});

test("M2.3 exposes exactly fourteen authoring tools through the live session handler", () => {
  const planToolUnion = editorSession.match(/export type PlanTool\s*=([\s\S]*?);/)?.[1];
  assert.ok(planToolUnion, "PlanTool union must exist");
  const declaredTools = [...planToolUnion.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual([...declaredTools].sort(), [...m23PlanTools].sort());

  const definitionsBlock = planToolbar.match(
    /const toolById:[\s\S]*?=\s*\{([\s\S]*?)\n\};/,
  )?.[1];
  assert.ok(definitionsBlock, "toolById must exist");
  const wiredDefinitions = [...definitionsBlock.matchAll(
    /^\s*(?:"([^"]+)"|([a-z-]+)):\s*\{\s*tool:\s*"([^"]+)"/gm,
  )].map((match) => ({ key: match[1] ?? match[2], tool: match[3] }));
  const wiredByKey = new Map(
    wiredDefinitions.map(({ key, tool }) => [key, tool]),
  );
  assert.equal(wiredDefinitions.length, m23PlanTools.length);
  assert.equal(wiredByKey.size, m23PlanTools.length, "toolById keys must be unique");
  for (const [key, tool] of wiredByKey) {
    assert.equal(tool, key, `${key} must wire its own tool id`);
  }
  assert.deepEqual(
    [...wiredByKey.keys()].sort(),
    [...m23PlanTools].sort(),
  );

  assert.match(
    planToolbar,
    /<Button\b(?:(?!<\/Button>)[\s\S])*?data-tool=\{tool\}(?:(?!<\/Button>)[\s\S])*?onClick=\{\(event\) => onToolChange\(tool, event\.currentTarget\)\}(?:(?!<\/Button>)[\s\S])*?<\/Button>/,
    "each rendered M2.3 tool must invoke onToolChange with its exact id and initiator",
  );
  assert.match(
    planEditor,
    /function selectTool\(tool: PlanTool, initiator: HTMLButtonElement\): void \{[\s\S]*?sessionStore\.getState\(\)\.setActiveTool\(tool\);/,
    "selectTool must terminate at the live editor session store",
  );
  assert.match(
    planEditor,
    /<PlanToolbar\b[\s\S]*?onToolChange=\{selectTool\}[\s\S]*?\/>/,
    "PlanToolbar must route through the focus-aware live handler",
  );
});

test("runtime source contains no deferred platform or export claims", () => {
  for (const label of [
    "BIM",
    "IoT",
    "点云",
    "3DGS",
    "添加展具",
    "添加摊位",
    "添加路线",
    "发布",
    "导出",
  ]) {
    assert.doesNotMatch(runtime, new RegExp(label), `forbidden deferred action: ${label}`);
  }
});
test("M2.1 exposes wired Import and Calibrate actions without later-M2 controls", () => {
  assert.match(planToolbar, /readonly onImportFloorPlan\?:/);
  assert.match(planToolbar, /onClick=\{\(event\) => onImportFloorPlan\(event\.currentTarget\)\}/);
  assert.match(planToolbar, /readonly onCalibrate\?:/);
  assert.match(planToolbar, /onClick=\{\(event\) => onCalibrate\(event\.currentTarget\)\}/);
  assert.match(planEditor, /onImportFloorPlan:\s*\(initiator: HTMLButtonElement\) =>/);
  assert.match(planEditor, /onCalibrate:\s*\(initiator: HTMLButtonElement\) =>/);

  const m21ActionSurface = `${planToolbar}\n${planEditor}`;
  for (const deferredHandler of [
    "onAddOpening",
    "onAddContent",
    "onAddRoute",
    "onOpen3D",
    "onExport",
    "onPublish",
  ]) {
    assert.doesNotMatch(
      m21ActionSurface,
      new RegExp(`\\b${deferredHandler}\\b`),
      `forbidden later-M2 action: ${deferredHandler}`,
    );
  }
});

test("M2.3 exposes only implemented building, content, tour, and showroom-catalogue actions", () => {
  const actionIds = [...showroomToolPolicy.matchAll(/action\("([^"]+)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(actionIds, [
    "select",
    "pan",
    "boundary",
    "wall",
    "door",
    "window",
    "zone",
    "room",
    "recognize-rooms",
    "fixture-catalogue",
    "poi",
    "dimension",
    "product-hotspot",
    "attach-product-media",
    "route-node",
    "route-edge",
    "edit-route-stops",
    "preview-guided-route",
  ]);
  assert.match(planToolbar, /id === "door" \|\| id === "window"/);
  assert.match(planToolbar, /onClick=\{\(event\) => onRecognizeRooms\(event\.currentTarget\)\}/);
  assert.match(fixtureCatalogue, /SHOWROOM_FIXTURE_CATALOGUE\.map/);
  assert.match(fixtureCatalogue, /data-fixture-kind=\{descriptor\.kind\}/);
  assert.match(fixtureCatalogue, /onClick=\{\(\) => onSelect\(descriptor\.kind\)\}/);
  assert.doesNotMatch(showroomCatalogue, /fixture\("generic"/);
  assert.match(roomRecognitionPanel, /onClick=\{onConfirmOne\}/);
  assert.match(roomRecognitionPanel, /onClick=\{onConfirmAll\}/);
  assert.match(roomRecognitionPanel, /onClick=\{onReplaceSelectedRoom\}/);

  const m23ActionSurface = [
    planToolbar,
    planEditor,
    fixtureCatalogue,
    roomRecognitionPanel,
  ].join("\n");
  for (const forbiddenHandler of [
    "onOpen3D",
    "onEditMaterials",
    "onEditLighting",
    "onExport",
    "onPublish",
  ]) {
    assert.doesNotMatch(
      m23ActionSurface,
      new RegExp(`\\b${forbiddenHandler}\\b`),
      `forbidden post-M2.3 action: ${forbiddenHandler}`,
    );
  }
});

test("M2.3 toolbar renders exactly the three contextual content and route actions", () => {
  const contextualDefinitions = [
    ...planToolbar.matchAll(
      /\{ id: "([^"]+)", label:/g,
    ),
  ].map((match) => match[1]);
  assert.deepEqual(contextualDefinitions, [
    "attach-product-media",
    "edit-route-stops",
    "preview-guided-route",
  ]);
  assert.match(
    planToolbar,
    /const onClick = id === "attach-product-media"\s*\?\s*onAttachProductMedia\s*:\s*id === "edit-route-stops"\s*\?\s*onEditRouteStops\s*:\s*id === "preview-guided-route"\s*\?\s*onPreviewGuidedRoute\s*:\s*undefined;/,
  );
  assert.match(planToolbar, /data-action=\{id\}/);
  assert.match(planEditor, /onEditRouteStops: openGuidedRoutePanel/);
  assert.match(planEditor, /onPreviewGuidedRoute: openGuidedRoutePanel/);
  for (const forbiddenAction of [
    "open-3d",
    "edit-materials",
    "edit-lighting",
    "export",
    "publish",
  ]) {
    assert.doesNotMatch(
      planToolbar,
      new RegExp(`data-action=[^\\n]*${forbiddenAction}`),
      `forbidden post-M2.3 toolbar action: ${forbiddenAction}`,
    );
  }
});
