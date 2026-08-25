import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";
import ts from "typescript";

const SOURCE_ROOTS = ["apps/studio/src", "packages/editor-shell/src"];
const VISIBLE_ATTRIBUTE_NAMES = new Set([
  "aria-label",
  "aria-description",
  "title",
  "placeholder",
  "alt",
  "label",
  "helpText",
  "emptyState",
  "status",
  "button",
  "option",
]);
const EXACT_ALLOWED_LITERALS = new Set(["AetherTwin", "PNG", "UUID", "WebGL", "2D", "3D"]);
const DIMENSION_TOKEN = /^\d{3,5}\s×\s\d{3,5}$/u;
const SHORTCUT_TOKEN = /^(?:Ctrl|Alt|Shift|Cmd|⌘)(?:\s*\+\s*(?:Ctrl|Alt|Shift|Cmd|⌘|[A-Z0-9]))+$/u;

function sourceFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.(?:ts|tsx)$/u.test(entry.name)) return [];
    if (/\.(?:test|spec)\.(?:ts|tsx)$/u.test(entry.name)) return [];
    if (entry.name.includes("test-support")) return [];
    if (path.split(sep).includes("dev") || /(?:^|[-_])(?:dev|gallery)(?:[-_.]|$)/u.test(entry.name)) return [];
    if (path.includes(`${sep}i18n${sep}messages.`)) return [];
    return [path];
  });
}

function isAllowedLiteral(value) {
  return EXACT_ALLOWED_LITERALS.has(value) || DIMENSION_TOKEN.test(value) || SHORTCUT_TOKEN.test(value);
}

function isNonCopyFragment(value) {
  return /^[\s·:：%×]+$/u.test(value) || /^(?:mm\s*[·:]?|m²\s*[·:]?)$/u.test(value);
}

function literalText(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text.trim() : null;
}

function nodeLocation(filePath, sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${relative(".", filePath)}:${line + 1}:${character + 1}`;
}

function visibleTextViolation(violations, filePath, sourceFile, node, value, kind) {
  if (value.length > 0 && !isAllowedLiteral(value) && !isNonCopyFragment(value)) {
    violations.push(`${nodeLocation(filePath, sourceFile, node)} ${kind}: ${JSON.stringify(value)}`);
  }
}

function catalogueMessageIds() {
  const ids = new Set();
  for (const path of ["apps/studio/src/i18n/messages.zh-CN.ts", "apps/studio/src/i18n/messages.en.ts"]) {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/(?:^|,)\s*"([^"]+)"\s*:/gmu)) ids.add(match[1]);
  }
  return ids;
}

function isRenderedErrorValue(node) {
  let current = node;
  while (current.parent !== undefined) {
    const child = current;
    current = current.parent;
    if (ts.isConditionalExpression(current) && current.condition === child) return false;
    if (ts.isCallExpression(current)) return false;
    if (ts.isJsxExpression(current)) {
      if (ts.isJsxAttribute(current.parent)) {
        return VISIBLE_ATTRIBUTE_NAMES.has(current.parent.name.getText());
      }
      return true;
    }
    if (ts.isFunctionLike(current) || ts.isVariableDeclaration(current)) return false;
  }
  return false;
}

function isExplicitDeveloperGalleryNode(filePath, sourceFile, node) {
  if (!filePath.endsWith(`${sep}app.tsx`) || !sourceFile.text.includes("DevSceneGallery")) return false;
  const galleryStart = sourceFile.text.indexOf('pathname === "/dev/scene-gallery"');
  const galleryEnd = sourceFile.text.indexOf("if (backend !== undefined)", galleryStart);
  return galleryStart >= 0 && galleryEnd >= 0 && node.getStart(sourceFile) >= galleryStart && node.getStart(sourceFile) < galleryEnd;
}

export function findLocalizationViolations() {
  const violations = [];
  const messageIds = catalogueMessageIds();
  for (const filePath of SOURCE_ROOTS.flatMap(sourceFiles)) {
    const sourceFile = ts.createSourceFile(filePath, readFileSync(filePath, "utf8"), ts.ScriptTarget.Latest, true);
    const importsModeShowroom = sourceFile.statements.some(
      (statement) => ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text.includes("mode-showroom"),
    );
    const visit = (node, inJsx = false) => {
      if (ts.isJsxText(node)) {
        if (!isExplicitDeveloperGalleryNode(filePath, sourceFile, node)) {
          visibleTextViolation(violations, filePath, sourceFile, node, node.getText(sourceFile).trim(), "visible JSX text");
        }
      }
      if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) && VISIBLE_ATTRIBUTE_NAMES.has(node.name.getText(sourceFile))) {
        const value = node.initializer && ts.isStringLiteral(node.initializer) ? node.initializer.text.trim() : null;
        if (value !== null) visibleTextViolation(violations, filePath, sourceFile, node, value, `visible ${node.name.getText(sourceFile)}`);
      }
      if (inJsx && ts.isStringLiteral(node) && ts.isJsxExpression(node.parent)) {
        visibleTextViolation(violations, filePath, sourceFile, node, node.text.trim(), "visible JSX literal");
      }
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && VISIBLE_ATTRIBUTE_NAMES.has(node.name.text)) {
        const value = literalText(node.initializer);
        if (value !== null && !messageIds.has(value)) {
          visibleTextViolation(violations, filePath, sourceFile, node, value, `visible config ${node.name.text}`);
        }
      }
      if (importsModeShowroom && ts.isPropertyAccessExpression(node) && node.name.text === "label" && ts.isIdentifier(node.expression) && /descriptor/u.test(node.expression.text)) {
        violations.push(`${nodeLocation(filePath, sourceFile, node)} mode-showroom descriptor.label`);
      }
      if (ts.isPropertyAccessExpression(node) && ["message", "code", "details"].includes(node.name.text) && isRenderedErrorValue(node)) {
        violations.push(`${nodeLocation(filePath, sourceFile, node)} raw error ${node.name.text}`);
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.getText(sourceFile) === "JSON.stringify" && node.arguments.some((argument) => /\berror\b/u.test(argument.getText(sourceFile))) && isRenderedErrorValue(node)) {
        violations.push(`${nodeLocation(filePath, sourceFile, node)} JSON.stringify(error)`);
      }
      ts.forEachChild(node, (child) => visit(child, inJsx || ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)));
    };
    visit(sourceFile);
  }
  return violations;
}

test("all production-visible Studio copy is localized and error-safe", () => {
  const violations = findLocalizationViolations();
  assert.deepEqual(violations, [], violations.join("\n"));
});
