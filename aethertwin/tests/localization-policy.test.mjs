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
const TECHNICAL_TOKENS = new Set([
  "AetherTwin", "PNG", "UUID", "WebGL", "2D", "3D",
  "mm", "cm", "m", "m²", "mm ·", "m² ·",
  "1920 × 1080", "3840 × 2160",
  "Ctrl + Z", "Ctrl + Y", "Ctrl + Shift + Z",
]);

function sourceFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.(?:ts|tsx)$/u.test(entry.name)) return [];
    if (/\.(?:test|spec)\.(?:ts|tsx)$/u.test(entry.name)) return [];
    if (entry.name.includes("test-support")) return [];
    if (path.split(sep).includes("dev")) return [];
    if (path.includes(`${sep}i18n${sep}messages.`)) return [];
    return [path];
  });
}

function isTechnicalToken(value) {
  return TECHNICAL_TOKENS.has(value);
}

function literalText(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text.trim() : null;
}

function nodeLocation(filePath, sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${relative(".", filePath)}:${line + 1}:${character + 1}`;
}

function visibleTextViolation(violations, filePath, sourceFile, node, value, kind) {
  if (/[\p{L}\p{N}]/u.test(value) && !isTechnicalToken(value)) {
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

function isExplicitDeveloperGalleryNode(filePath, sourceFile, node) {
  if (!filePath.endsWith(`${sep}app.tsx`) || !sourceFile.text.includes("DevSceneGallery")) return false;
  const galleryStart = sourceFile.text.indexOf('pathname === "/dev/scene-gallery"');
  const galleryEnd = sourceFile.text.indexOf("if (backend !== undefined)", galleryStart);
  return galleryStart >= 0 && galleryEnd >= 0 && node.getStart(sourceFile) >= galleryStart && node.getStart(sourceFile) < galleryEnd;
}

function isErrorProperty(node, aliases) {
  return ts.isPropertyAccessExpression(node)
    && ["message", "code", "details"].includes(node.name.text)
    && ts.isIdentifier(node.expression)
    && (aliases?.has(node.expression.text) === true || /(?:error|failure|exception)/iu.test(node.expression.text));
}

function collectRawErrorAliases(sourceFile) {
  const aliases = new Set();
  const visit = (node) => {
    if (ts.isCatchClause(node) && node.variableDeclaration !== undefined && ts.isIdentifier(node.variableDeclaration.name)) {
      aliases.add(node.variableDeclaration.name.text);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
      const isNewError = ts.isNewExpression(node.initializer) && ts.isIdentifier(node.initializer.expression) && node.initializer.expression.text === "Error";
      if (isNewError || isErrorProperty(node.initializer, aliases) || (ts.isIdentifier(node.initializer) && aliases.has(node.initializer.text))) aliases.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return aliases;
}

function collectShowroomDescriptorParameters(sourceFile) {
  const collections = new Set();
  const parameters = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || !statement.moduleSpecifier.text.includes("mode-showroom")) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings !== undefined && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) collections.add(element.name.text);
    }
  }
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined && ts.isIdentifier(node.initializer) && collections.has(node.initializer.text)) {
      collections.add(node.name.text);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "map" && ts.isIdentifier(node.expression.expression) && collections.has(node.expression.expression.text)) {
      const callback = node.arguments[0];
      if (callback !== undefined && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
        const parameter = callback.parameters[0];
        if (parameter !== undefined && ts.isIdentifier(parameter.name)) parameters.add(parameter.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return parameters;
}

function isRawErrorExpression(node, aliases) {
  if (isErrorProperty(node, aliases)) return node.name.text;
  if (ts.isIdentifier(node) && aliases.has(node.text)) return "object";
  if (ts.isCallExpression(node)) {
    if (ts.isIdentifier(node.expression) && node.expression.text === "format" && node.arguments.length === 1) {
      const [descriptor] = node.arguments;
      if (ts.isCallExpression(descriptor) && ts.isIdentifier(descriptor.expression) && descriptor.expression.text === "localizedErrorDescriptor") return null;
    }
    const rawArgument = node.arguments.map((argument) => isRawErrorExpression(argument, aliases)).find(Boolean) ?? null;
    if (rawArgument === null) return null;
    return ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText() === "JSON" && node.expression.name.text === "stringify"
      ? "JSON.stringify(error)"
      : rawArgument;
  }
  return null;
}

function isRawErrorPropExpression(node, aliases) {
  return isRawErrorExpression(node, aliases)
    ?? (ts.isIdentifier(node) && aliases.has(node.text) ? "object" : null);
}

function scanVisibleExpression(violations, filePath, sourceFile, expression, rawErrorAliases, showroomParameters) {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    visibleTextViolation(violations, filePath, sourceFile, expression, expression.text.trim(), "visible JSX literal");
  }
  if (ts.isTemplateExpression(expression)) {
    visibleTextViolation(violations, filePath, sourceFile, expression, expression.getText(sourceFile).replaceAll("`", "").trim(), "visible JSX template");
  }
  const rawError = isRawErrorExpression(expression, rawErrorAliases);
  if (rawError !== null) violations.push(`${nodeLocation(filePath, sourceFile, expression)} ${rawError === "JSON.stringify(error)" ? rawError : `raw error ${rawError}`}`);
  if (ts.isPropertyAccessExpression(expression) && expression.name.text === "label" && ts.isIdentifier(expression.expression) && showroomParameters.has(expression.expression.text)) {
    violations.push(`${nodeLocation(filePath, sourceFile, expression)} mode-showroom descriptor.label`);
  }
}

export function findLocalizationViolations(sources = undefined) {
  const violations = [];
  const messageIds = catalogueMessageIds();
  const scannedSources = sources ?? SOURCE_ROOTS.flatMap(sourceFiles).map((filePath) => ({ filePath, source: readFileSync(filePath, "utf8") }));
  for (const { filePath, source } of scannedSources) {
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
    const rawErrorAliases = collectRawErrorAliases(sourceFile);
    const showroomParameters = collectShowroomDescriptorParameters(sourceFile);
    const visit = (node) => {
      if (ts.isJsxText(node)) {
        if (!isExplicitDeveloperGalleryNode(filePath, sourceFile, node)) {
          visibleTextViolation(violations, filePath, sourceFile, node, node.getText(sourceFile).trim(), "visible JSX text");
        }
      }
      if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) && VISIBLE_ATTRIBUTE_NAMES.has(node.name.getText(sourceFile))) {
        const value = node.initializer && ts.isStringLiteral(node.initializer) ? node.initializer.text.trim() : null;
        if (value !== null) visibleTextViolation(violations, filePath, sourceFile, node, value, `visible ${node.name.getText(sourceFile)}`);
      }
      if (ts.isJsxExpression(node) && node.expression !== undefined) {
        if (!ts.isJsxAttribute(node.parent)) {
          scanVisibleExpression(violations, filePath, sourceFile, node.expression, rawErrorAliases, showroomParameters);
        } else if (VISIBLE_ATTRIBUTE_NAMES.has(node.parent.name.getText(sourceFile))) {
          scanVisibleExpression(violations, filePath, sourceFile, node.expression, rawErrorAliases, showroomParameters);
        }
      }
      if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === "error" && node.initializer !== undefined && ts.isJsxExpression(node.initializer) && node.initializer.expression !== undefined) {
        const rawError = isRawErrorPropExpression(node.initializer.expression, rawErrorAliases);
        if (rawError !== null) violations.push(`${nodeLocation(filePath, sourceFile, node)} raw error prop ${rawError}`);
      }
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && VISIBLE_ATTRIBUTE_NAMES.has(node.name.text)) {
        const value = literalText(node.initializer);
        if (value !== null && !messageIds.has(value)) {
          visibleTextViolation(violations, filePath, sourceFile, node, value, `visible config ${node.name.text}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return violations;
}

test("policy catches indirect visible copy and raw error flows while accepting formatted catalogue output", () => {
  const violations = findLocalizationViolations([{
    filePath: "apps/studio/src/policy-fixture.tsx",
    source: `
      import { SHOWROOM_TOOL_GROUPS } from "@aethertwin/mode-showroom";
      const error = new Error("secret");
      const rawMessage = error.message;
      const groups = SHOWROOM_TOOL_GROUPS;
      export function Fixture({ format, message, t }) {
        return <>
          <p>{\`Untranslated template\`}</p>
          <p>{rawMessage}</p>
          <p>{String(error.message)}</p>
          <p>{format(error.code)}</p>
          <p>{JSON.stringify(error)}</p>
          <p>{present(error.message)}</p>
          <Notice error={error} />
          {groups.map((group) => <p>{group.label}</p>)}
          <p>{format(message("error.generic"))}</p>
          <p>{t("editor.back")}</p>
        </>;
      }
    `,
  }]);

  assert.ok(violations.some((violation) => violation.includes("Untranslated template")));
  assert.ok(violations.some((violation) => violation.includes("raw error message")));
  assert.ok(violations.some((violation) => violation.includes("raw error code")));
  assert.ok(violations.some((violation) => violation.includes("JSON.stringify(error)")));
  assert.ok(violations.some((violation) => violation.includes("raw error prop")));
  assert.ok(violations.some((violation) => violation.includes("mode-showroom descriptor.label")));
  assert.equal(violations.some((violation) => violation.includes("error.generic")), false);
  assert.equal(violations.some((violation) => violation.includes("editor.back")), false);
});

test("policy scans similarly named production sources while excluding only explicit developer galleries", () => {
  const violations = findLocalizationViolations([{
    filePath: "apps/studio/src/gallery-toolbar.tsx",
    source: "export const GalleryToolbar = () => <button>Untranslated production control</button>;",
  }]);
  assert.ok(violations.some((violation) => violation.includes("Untranslated production control")));
});

test("all production-visible Studio copy is localized and error-safe", () => {
  const violations = findLocalizationViolations();
  assert.deepEqual(violations, [], violations.join("\n"));
});
