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
      if (isNewError || (ts.isIdentifier(node.initializer) && aliases.has(node.initializer.text))) aliases.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return aliases;
}

function collectSimpleInitializers(sourceFile) {
  const initializers = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
      initializers.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return initializers;
}

function bindPattern(scope, name, initializer) {
  if (ts.isIdentifier(name)) {
    scope.bindings.set(name.text, initializer === undefined ? null : { declaration: name.parent, initializer });
    return;
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) bindPattern(scope, element.name);
  }
}

function nearestFunctionScope(scope) {
  let candidate = scope;
  while (candidate.kind !== "function" && candidate.kind !== "root") candidate = candidate.parent;
  return candidate;
}

function isLexicalScope(node) {
  return ts.isBlock(node)
    || ts.isCaseBlock(node)
    || ts.isCatchClause(node)
    || ts.isForStatement(node)
    || ts.isForInStatement(node)
    || ts.isForOfStatement(node);
}

function createConstInitializerResolver(sourceFile) {
  const nodeScopes = new WeakMap();
  const rootScope = { kind: "root", parent: null, bindings: new Map() };
  const createScope = (parent, kind) => ({ kind, parent, bindings: new Map() });
  const visit = (node, parentScope) => {
    let scope = parentScope;
    if (ts.isFunctionDeclaration(node) && node.name !== undefined) bindPattern(parentScope, node.name);
    if ((ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)) && node.name !== undefined) bindPattern(parentScope, node.name);
    if (ts.isImportClause(node) && node.name !== undefined) bindPattern(parentScope, node.name);
    if (ts.isImportSpecifier(node) || ts.isNamespaceImport(node)) bindPattern(parentScope, node.name);
    if (node !== sourceFile && ts.isFunctionLike(node)) {
      scope = createScope(parentScope, "function");
      for (const parameter of node.parameters) bindPattern(scope, parameter.name);
      if (ts.isFunctionExpression(node) && node.name !== undefined) bindPattern(scope, node.name);
    } else if (node !== sourceFile && isLexicalScope(node)) {
      scope = createScope(parentScope, "block");
      if (ts.isCatchClause(node) && node.variableDeclaration !== undefined) {
        bindPattern(scope, node.variableDeclaration.name);
      }
    }
    nodeScopes.set(node, scope);
    if (ts.isVariableDeclaration(node) && ts.isVariableDeclarationList(node.parent)) {
      const isConst = (node.parent.flags & ts.NodeFlags.Const) !== 0;
      const targetScope = isConst || (node.parent.flags & ts.NodeFlags.Let) !== 0
        ? scope
        : nearestFunctionScope(scope);
      bindPattern(targetScope, node.name, isConst && ts.isIdentifier(node.name) ? node.initializer : undefined);
    }
    ts.forEachChild(node, (child) => visit(child, scope));
  };
  visit(sourceFile, rootScope);
  return (identifier) => {
    let scope = nodeScopes.get(identifier) ?? rootScope;
    while (scope !== null) {
      if (scope.bindings.has(identifier.text)) return scope.bindings.get(identifier.text);
      scope = scope.parent;
    }
    return null;
  };
}

function staticTemplateValues(node, resolveConstInitializer, visited) {
  let values = [node.head.text];
  for (const span of node.templateSpans) {
    const substitutions = staticVisibleStrings(span.expression, resolveConstInitializer, visited);
    if (substitutions.length === 0) return [];
    values = values.flatMap((prefix) => substitutions.map((value) => `${prefix}${value}${span.literal.text}`));
  }
  return values;
}

function staticVisibleStrings(node, resolveConstInitializer, visited = new Set()) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isTemplateExpression(node)) return staticTemplateValues(node, resolveConstInitializer, visited);
  if (ts.isParenthesizedExpression(node)) return staticVisibleStrings(node.expression, resolveConstInitializer, visited);
  if (ts.isConditionalExpression(node)) {
    return [
      ...staticVisibleStrings(node.whenTrue, resolveConstInitializer, visited),
      ...staticVisibleStrings(node.whenFalse, resolveConstInitializer, visited),
    ];
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticVisibleStrings(node.left, resolveConstInitializer, visited);
    const right = staticVisibleStrings(node.right, resolveConstInitializer, visited);
    return left.flatMap((prefix) => right.map((suffix) => `${prefix}${suffix}`));
  }
  if (ts.isIdentifier(node)) {
    const binding = resolveConstInitializer(node);
    if (binding !== null && !visited.has(binding.declaration)) {
      const nextVisited = new Set(visited);
      nextVisited.add(binding.declaration);
      return staticVisibleStrings(binding.initializer, resolveConstInitializer, nextVisited);
    }
  }
  return [];
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

function isRawErrorExpression(node, aliases, initializers, visited = new Set()) {
  if (isErrorProperty(node, aliases)) return node.name.text;
  if (ts.isIdentifier(node)) {
    if (aliases.has(node.text)) return "object";
    const initializer = initializers.get(node.text);
    if (initializer !== undefined && !visited.has(node.text)) {
      const nextVisited = new Set(visited);
      nextVisited.add(node.text);
      return isRawErrorExpression(initializer, aliases, initializers, nextVisited);
    }
  }
  if (ts.isParenthesizedExpression(node)) return isRawErrorExpression(node.expression, aliases, initializers, visited);
  if (ts.isConditionalExpression(node)) {
    return isRawErrorExpression(node.whenTrue, aliases, initializers, visited)
      ?? isRawErrorExpression(node.whenFalse, aliases, initializers, visited);
  }
  if (ts.isBinaryExpression(node)) {
    return isRawErrorExpression(node.left, aliases, initializers, visited)
      ?? isRawErrorExpression(node.right, aliases, initializers, visited);
  }
  if (ts.isCallExpression(node)) {
    if (ts.isIdentifier(node.expression) && node.expression.text === "format" && node.arguments.length === 1) {
      const [descriptor] = node.arguments;
      if (ts.isCallExpression(descriptor) && ts.isIdentifier(descriptor.expression) && descriptor.expression.text === "localizedErrorDescriptor") return null;
    }
    const rawArgument = node.arguments.map((argument) => isRawErrorExpression(argument, aliases, initializers, visited)).find(Boolean) ?? null;
    if (rawArgument === null) return null;
    return ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText() === "JSON" && node.expression.name.text === "stringify"
      ? "JSON.stringify(error)"
      : rawArgument;
  }
  return null;
}

function isRawErrorPropExpression(node, aliases, initializers) {
  return isRawErrorExpression(node, aliases, initializers)
    ?? (ts.isIdentifier(node) && aliases.has(node.text) ? "object" : null);
}

function scanVisibleExpression(violations, filePath, sourceFile, expression, rawErrorAliases, simpleInitializers, resolveConstInitializer, showroomParameters) {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    visibleTextViolation(violations, filePath, sourceFile, expression, expression.text.trim(), "visible JSX literal");
  }
  if (ts.isTemplateExpression(expression)) {
    visibleTextViolation(violations, filePath, sourceFile, expression, expression.getText(sourceFile).replaceAll("`", "").trim(), "visible JSX template");
  }
  if (ts.isIdentifier(expression) || ts.isParenthesizedExpression(expression) || ts.isConditionalExpression(expression) || ts.isBinaryExpression(expression)) {
    for (const value of staticVisibleStrings(expression, resolveConstInitializer)) {
      visibleTextViolation(violations, filePath, sourceFile, expression, value.trim(), "visible JSX static");
    }
  }
  const rawError = isRawErrorExpression(expression, rawErrorAliases, simpleInitializers);
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
    const simpleInitializers = collectSimpleInitializers(sourceFile);
    const resolveConstInitializer = createConstInitializerResolver(sourceFile);
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
          scanVisibleExpression(violations, filePath, sourceFile, node.expression, rawErrorAliases, simpleInitializers, resolveConstInitializer, showroomParameters);
        } else if (VISIBLE_ATTRIBUTE_NAMES.has(node.parent.name.getText(sourceFile))) {
          scanVisibleExpression(violations, filePath, sourceFile, node.expression, rawErrorAliases, simpleInitializers, resolveConstInitializer, showroomParameters);
        }
      }
      if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === "error" && node.initializer !== undefined && ts.isJsxExpression(node.initializer) && node.initializer.expression !== undefined) {
        const rawError = isRawErrorPropExpression(node.initializer.expression, rawErrorAliases, simpleInitializers);
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
      const rawCopy = error.message;
      const conditionalCopy = ready ? error.message : "safe";
      const parenthesizedCopy = (error.message);
      const binaryCopy = "Failure: " + error.message;
      const copy = "Untranslated";
      const staticParenthesized = ("Untranslated parenthesized");
      const staticConditional = ready ? "Untranslated true branch" : "Untranslated false branch";
      const staticBinary = "Untranslated " + "binary";
      const groups = SHOWROOM_TOOL_GROUPS;
      export function Fixture({ format, message, t }) {
        return <>
          <p>{\`Untranslated template\`}</p>
          <p>{rawMessage}</p>
          <p>{rawCopy}</p>
          <p>{conditionalCopy}</p>
          <p>{parenthesizedCopy}</p>
          <p>{binaryCopy}</p>
          <button>{copy}</button>
          <p>{staticParenthesized}</p>
          <p>{staticConditional}</p>
          <p>{staticBinary}</p>
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
  assert.ok(violations.some((violation) => violation.includes('"Untranslated"')));
  assert.ok(violations.some((violation) => violation.includes("Untranslated parenthesized")));
  assert.ok(violations.some((violation) => violation.includes("Untranslated true branch")));
  assert.ok(violations.some((violation) => violation.includes("Untranslated false branch")));
  assert.ok(violations.some((violation) => violation.includes("Untranslated binary")));
  assert.ok(violations.some((violation) => violation.includes("raw error message")));
  assert.ok(violations.filter((violation) => violation.includes("raw error message")).length >= 7);
  assert.ok(violations.some((violation) => violation.includes("raw error code")));
  assert.ok(violations.some((violation) => violation.includes("JSON.stringify(error)")));
  assert.ok(violations.some((violation) => violation.includes("raw error prop")));
  assert.ok(violations.some((violation) => violation.includes("mode-showroom descriptor.label")));
  assert.equal(violations.some((violation) => violation.includes("error.generic")), false);
  assert.equal(violations.some((violation) => violation.includes("editor.back")), false);
});

test("policy resolves static visible aliases by lexical binding instead of file-global names", () => {
  const violations = findLocalizationViolations([{
    filePath: "apps/studio/src/policy-scope-fixture.tsx",
    source: `
      import { copy as importedCopy } from "policy-fixture";
      const copy = "Outer static copy";
      export function Fixture({ dynamicCopy }) {
        function ParameterShadow(copy) {
          return <button>{copy}</button>;
        }
        function StaticSibling() {
          const copy = "Nested static copy";
          return <button>{copy}</button>;
        }
        function DynamicSibling() {
          const copy = dynamicCopy;
          return <button>{copy}</button>;
        }
        function LetShadow() {
          let copy = dynamicCopy;
          return <button>{copy}</button>;
        }
        function VarShadow() {
          var copy = dynamicCopy;
          return <button>{copy}</button>;
        }
        function FunctionShadow() {
          function copy() { return dynamicCopy; }
          return <button>{copy}</button>;
        }
        function ClassShadow() {
          class copy {}
          return <button>{copy}</button>;
        }
        return <>
          <button>{copy}</button>
          <button>{importedCopy}</button>
          <ParameterShadow copy={dynamicCopy} />
          <StaticSibling />
          <DynamicSibling />
          <LetShadow />
          <VarShadow />
          <FunctionShadow />
          <ClassShadow />
        </>;
      }
    `,
  }]);

  assert.ok(violations.some((violation) => violation.includes("Outer static copy")));
  assert.ok(violations.some((violation) => violation.includes("Nested static copy")));
  assert.equal(violations.filter((violation) => violation.includes("Outer static copy")).length, 1);
  assert.equal(violations.some((violation) => violation.includes("dynamicCopy")), false);
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
