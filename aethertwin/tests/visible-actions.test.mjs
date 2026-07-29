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
const m1Tools = [
  "select", "pan", "boundary", "wall", "zone", "space-unit", "fixture", "poi", "dimension",
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

test("M1 exposes exactly nine authoring tools through the live session handler", () => {
  const planToolUnion = editorSession.match(/export type PlanTool\s*=([\s\S]*?);/)?.[1];
  assert.ok(planToolUnion, "PlanTool union must exist");
  const declaredTools = [...planToolUnion.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual([...declaredTools].sort(), [...m1Tools].sort());

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
  assert.equal(wiredDefinitions.length, m1Tools.length);
  assert.equal(wiredByKey.size, m1Tools.length, "toolById keys must be unique");
  for (const [key, tool] of wiredByKey) {
    assert.equal(tool, key, `${key} must wire its own tool id`);
  }
  assert.deepEqual(
    [...wiredByKey.keys()].sort(),
    [...m1Tools].sort(),
  );

  assert.match(
    planToolbar,
    /<Button\b(?:(?!<\/Button>)[\s\S])*?data-tool=\{tool\}(?:(?!<\/Button>)[\s\S])*?onClick=\{\(\) => onToolChange\(tool\)\}(?:(?!<\/Button>)[\s\S])*?<\/Button>/,
    "each rendered M1 tool must invoke onToolChange with its exact tool id",
  );
  assert.match(
    planEditor,
    /<PlanToolbar\b[\s\S]*?onToolChange=\{\(tool\) => sessionStore\.getState\(\)\.setActiveTool\(tool\)\}[\s\S]*?\/>/,
    "PlanToolbar must terminate at the live editor session store",
  );
});

test("M2.1 runtime source contains no later authoring claims", () => {
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