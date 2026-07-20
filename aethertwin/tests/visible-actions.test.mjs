import { globSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const projectCenter = readFileSync(
  "apps/studio/src/features/project-center/project-center.tsx",
  "utf8",
);
const editorShell = readFileSync("packages/editor-shell/src/editor-shell.tsx", "utf8");
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

test("M0 exposes only real project and editor actions", () => {
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

test("M0 runtime source contains no deferred authoring claims", () => {
  for (const label of [
    "BIM",
    "IoT",
    "点云",
    "3DGS",
    "添加展具",
    "添加摊位",
    "添加路线",
    "发布",
    "预览",
    "导出",
  ]) {
    assert.doesNotMatch(runtime, new RegExp(label), `forbidden deferred action: ${label}`);
  }
});
