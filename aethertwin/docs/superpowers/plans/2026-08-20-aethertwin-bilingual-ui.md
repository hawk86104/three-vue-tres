# AetherTwin Bilingual Studio UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Simplified Chinese the default language for every production interactive Studio page, keep idiomatic English as an explicit user-selectable alternative, persist the choice only in normal desktop Studio, and preserve a memory-only Chinese-default locale in Web Demo and the portable preview.

**Architecture:** Add a small, dependency-free, typed Studio message catalogue and locale provider. Production UI stores stable message descriptors or error codes rather than rendered strings, so switching languages updates already-visible validation, status, and error text. Studio owns localization; workspace packages receive translated presentation props and stable domain packages keep their IDs, records, defaults, file formats, and native error contracts unchanged.

**Tech Stack:** React 19, TypeScript strict mode, Vitest, Testing Library, Zustand, Node test runner, the existing Studio and workspace package APIs, and browser Storage only behind an injected locale-preference adapter.

**Approved design:** docs/superpowers/specs/2026-08-20-aethertwin-bilingual-ui-design.md

## Global Constraints

- Default locale is Simplified Chinese with the exact locale ID zh-CN. The optional English locale ID is en.
- Normal desktop Studio remembers the locale under the versioned key aethertwin.studio.locale.v1. Storage read/write failures fall back safely and never block rendering.
- Web Demo and the Windows portable preview use a memory-only locale preference. A refresh or process restart returns to Simplified Chinese and localization never reads or writes localStorage, sessionStorage, cookies, IndexedDB, Cache Storage, or service workers.
- Locale changes update document.documentElement.lang and all visible copy without reopening the current project, recreating ProjectStore, resetting selection, or restarting a render/export operation.
- Translate presentation copy only. Do not translate or mutate project names, floor names, layer names, user-entered entity names, UUIDs, schema/profile/backend values in persisted records, Showroom action IDs, fixture kinds, command names, file names, route identities, manifest content, or project-format data.
- Built-in profile, tool, entity-kind, fixture-kind, route-kind, preset, status, and canonical Web Demo names are mapped at render time from stable IDs. SHOWROOM_FIXTURE_CATALOGUE.defaultName and the canonical snapshot remain durable source data and are never changed when the locale changes.
- Do not modify packages/mode-showroom/src/index.ts. It is an unrelated protected dirty file in this worktree.
- Do not modify crates/asset-io/Cargo.toml or crates/desktop-host/Cargo.toml. They are unrelated protected dirty files in this worktree.
- Do not add an internationalization dependency and do not change package manifests or pnpm-lock.yaml.
- Do not alter Studio, Tauri, ProjectStore, exporter, renderer, Rust error, project-format, or native command contracts.
- Never display raw backend Error.message, native error messages, stable error codes, stack traces, paths, or arbitrary details to end users. Map known stable codes to localized safe copy and use a localized generic fallback for unknown codes. A safe logRef may be shown with a localized diagnostic-reference label.
- Developer-only galleries, test fixtures, test descriptions, internal logs, portable-host console text, source comments, architecture documents, and generated artifacts are outside the production UI translation scope.
- AetherTwin, PNG, UUID, WebGL, 2D, 3D, dimensions, shortcuts, and user data may remain literal only through a narrow audited allowlist.
- Use apply_patch for edits. Preserve unrelated worktree changes. Stage explicit paths only; never use git add -A.
- Follow strict TDD for every behavior change: write the focused test, run it and observe the intended failure, implement the minimum change, rerun the focused test, then run the task-level type/diff checks.
- The repository rule forbids automatic build, dev, preview, local-server, browser, screenshot, and WebGL commands. The final real-browser acceptance task is an explicit approval checkpoint and must not run without fresh user authorization.

## Locked Product Language

The catalogues must use natural product terminology rather than word-for-word translation.

| Stable concept | Simplified Chinese | English |
|---|---|---|
| Showroom profile | 展厅 | Showroom |
| Market profile | 市集 | Market |
| Sandbox | 演示沙盒 | Demo sandbox |
| Project | 项目 | Project |
| Floor | 楼层 | Floor |
| Layer | 图层 | Layer |
| Fixture, furnishing context | 陈设 | Fixture |
| Fixture catalogue | 陈设库 | Fixture catalogue |
| Reference image | 参考图 | Reference image |
| Calibration | 比例校准 | Scale calibration |
| Point of interest | 兴趣点 | Point of interest |
| Product hotspot | 互动热点 | Product hotspot |
| Guided route | 导览路线 | Guided route |
| Route node | 路线节点 | Route node |
| Route edge | 路线段 | Route segment |
| Export | 导出 PNG | Export PNG |
| Full HD | 全高清（1920 × 1080） | Full HD (1920 × 1080) |
| Ultra HD | 超高清（3840 × 2160） | Ultra HD (3840 × 2160) |
| Retry | 重试 | Retry |
| Cancel | 取消 | Cancel |
| Close project | 关闭项目 | Close project |

Write complete, conversational Chinese sentences. Prefer phrases such as “正在准备贴图…” and “无法导出：当前设备不支持 4K 分辨率。” over compressed labels or literal translations. English must remain concise and idiomatic.

## Production Surface Inventory

Every production source below is in scope. A task may discover an additional visible string in an imported production component; if so, add that exact source and its nearest existing test to the same task before implementation.

- Root and project entry: apps/studio/src/studio-root.tsx, app.tsx, web-demo/web-demo-app.tsx, features/project-center/project-center.tsx, and features/project-center/create-project-dialog.tsx.
- Shared editor shell: packages/editor-shell/src/editor-shell.tsx.
- Editor navigation and actions: plan-editor.tsx, plan-toolbar.tsx, floor-tree.tsx, and plan-accessibility.tsx.
- Core inspection: plan-inspector.tsx.
- Asset workflows: asset-library.tsx, reference-inspector.tsx, and calibration-panel.tsx.
- Spatial workflows: fixture-catalogue.tsx, room-recognition-panel.tsx, opening-inspector.tsx, material-inspector.tsx, and environment-inspector.tsx.
- Content and route workflows: content-inspector.tsx, route-inspector.tsx, and route-panel.tsx.
- Canvas and export workflows: plan-canvas.tsx, scene-canvas.tsx, and export-panel.tsx.

## Foundation Interfaces

The implementation must use these names and ownership boundaries consistently.

~~~ts
// apps/studio/src/i18n/messages.zh-CN.ts
export const zhCNMessages = {
  "locale.controlLabel": () => "界面语言",
  "locale.zh-CN": () => "简体中文",
  "locale.en": () => "English",
  "projectCenter.reopenProject": ({ name }: { readonly name: string }) =>
    "重新打开“" + name + "”",
} as const;
~~~

~~~ts
// apps/studio/src/i18n/message-schema.ts
import { zhCNMessages } from "./messages.zh-CN";

export type StudioLocale = "zh-CN" | "en";
export type StudioMessageCatalogue = {
  readonly [K in keyof typeof zhCNMessages]:
    (...args: Parameters<(typeof zhCNMessages)[K]>) => string;
};
export type StudioMessageId = keyof StudioMessageCatalogue;
export type StudioMessageArgs<K extends StudioMessageId> =
  Parameters<StudioMessageCatalogue[K]>;
export type StudioTranslator = <K extends StudioMessageId>(
  id: K,
  ...args: StudioMessageArgs<K>
) => string;
export interface StudioMessageDescriptorFor<K extends StudioMessageId> {
  readonly id: K;
  readonly args: StudioMessageArgs<K>;
}
export type StudioMessageDescriptor = {
  readonly [K in StudioMessageId]: StudioMessageDescriptorFor<K>;
}[StudioMessageId];

export function message<K extends StudioMessageId>(
  id: K,
  ...args: StudioMessageArgs<K>
): StudioMessageDescriptorFor<K> {
  return Object.freeze({ id, args });
}
~~~

~~~ts
// apps/studio/src/i18n/messages.en.ts
import type { StudioMessageCatalogue } from "./message-schema";

export const enMessages = {
  "locale.controlLabel": () => "Language",
  "locale.zh-CN": () => "简体中文",
  "locale.en": () => "English",
  "projectCenter.reopenProject": ({ name }: { readonly name: string }) =>
    "Reopen " + name,
} satisfies StudioMessageCatalogue;
~~~

English must satisfy the Chinese-derived key and parameter schema. The formatter may use one narrow never[] cast at the dynamic call boundary; any and broad unknown casts are forbidden.

~~~ts
// apps/studio/src/i18n/locale-preference.ts
export interface LocalePreference {
  read(): StudioLocale | null;
  write(locale: StudioLocale): void;
}

export function createBrowserLocalePreference(
  storage: Pick<Storage, "getItem" | "setItem">,
): LocalePreference;

export function createMemoryLocalePreference(
  initial?: StudioLocale,
): LocalePreference;
~~~

~~~tsx
// apps/studio/src/i18n/locale-provider.tsx
export interface LocaleContextValue {
  readonly locale: StudioLocale;
  readonly setLocale: (locale: StudioLocale) => void;
  readonly t: StudioTranslator;
  readonly format: (value: StudioMessageDescriptor) => string;
}

export function LocaleProvider(props: {
  readonly preference: LocalePreference;
  readonly children: React.ReactNode;
}): React.JSX.Element;

export function useI18n(): LocaleContextValue;
~~~

useI18n has a Chinese, no-op-setter fallback for isolated legacy component tests. Production StudioRoot always installs LocaleProvider.

display-name-provider.tsx owns a presentation-only resolver:

~~~ts
export type DisplayNameSubjectKind =
  | "project"
  | "floor"
  | "layer"
  | "plan-reference"
  | "entity"
  | "vendor"
  | "product-content"
  | "media-asset"
  | "route-network"
  | "guided-route"
  | "material"
  | "camera-shot"
  | "story-sequence";

export interface DisplayNameSubject {
  readonly kind: DisplayNameSubjectKind;
  readonly id: string;
  readonly authoredName: string;
}

export type StudioDisplayNameResolver = (
  subject: DisplayNameSubject,
) => StudioMessageDescriptor | null;
~~~

The default resolver always returns null, so normal Studio displays authoredName exactly. Web Demo may install a resolver keyed by the canonical fixture's stable kind/id pair. Components call useDisplayName(subject); a localized result is presentation-only and is never written to ProjectStore or sent in a command.

## Stable Display Mapping

Create apps/studio/src/i18n/display-message-ids.ts. Use exhaustive satisfies Record mappings keyed by imported stable unions, and use stable IDs as React keys.

- ProjectProfile: showroom and market.
- ShowroomToolGroupId: select, building, fixtures, content, tour, preview.
- ShowroomToolActionId: select, pan, boundary, wall, door, window, zone, room, recognize-rooms, fixture-catalogue, poi, dimension, product-hotspot, attach-product-media, route-node, route-edge, edit-route-stops, preview-guided-route, view-2d, view-3d, view-split, frame-selection, frame-route, export.
- ShowroomFixtureKind: display-case, display-table, shelf, checkout, screen, partition, signage.
- SpaceUnitKind: room, shop, booth, exhibition, service, restricted.
- FixtureKind includes all Showroom fixture kinds plus generic.
- PointOfInterestKind: entrance, exit, service-desk, restroom, accessible-restroom, stage, food, rest-area, medical, fire-safety, parking, charging, storage, nursery, water, atm, closed-area, custom, product-hotspot.
- Opening kind: door and window.
- MediaAssetKind: image and video.
- RouteNodeKind: junction, entrance, showroom-stop.
- Export preset and all renderer/export phase/status unions.

Do not consume descriptor.label from SHOWROOM_TOOL_GROUPS or SHOWROOM_FIXTURE_CATALOGUE for visible copy. Consume only the stable id/kind and look up the message ID. Do not change descriptor.defaultName or any saved entity name.

## Stable Error Mapping

Create apps/studio/src/i18n/localized-error.ts and cover these stable code families with safe catalogue messages:

- Desktop host/session: IPC_INVALID_REQUEST, EXPORT_ALREADY_ACTIVE, EXPORT_NOT_FOUND, EXPORT_SESSION_MISMATCH, SESSION_NOT_FOUND, HOST_STATE_UNAVAILABLE, SESSION_STATE_UNAVAILABLE, SESSION_RECOVERY_REQUIRED, PROJECT_CREATED_SESSION_UNAVAILABLE.
- Project I/O: INVALID_PROJECT_NAME, PROJECT_ALREADY_EXISTS, PROJECT_NOT_FOUND, INVALID_PROJECT_STRUCTURE, UNSUPPORTED_SCHEMA_VERSION, MANIFEST_DATABASE_MISMATCH, DATABASE_ERROR, PROJECT_LOCKED, STALE_PROJECT_LOCK, INVALID_RESOURCE_PATH, RECOVERY_FAILED, FILESYSTEM_ERROR.
- Asset operation: ASSET_IMPORT_OPERATION_EXISTS, ASSET_IMPORT_OPERATION_NOT_FOUND, ASSET_PROGRESS_OPERATION_MISMATCH, ASSET_PROGRESS_NOT_MONOTONIC, ASSET_PROGRESS_DELIVERY_FAILED.
- Asset validation/resolution: INVALID_ASSET_IMPORT_REQUEST, UNSUPPORTED_ASSET_TYPE, ASSET_EXTENSION_SIGNATURE_MISMATCH, ASSET_ROLE_MEDIA_MISMATCH, ASSET_TOO_LARGE, INVALID_ASSET_IMAGE_DIMENSIONS, UNSAFE_SVG, ASSET_SOURCE_CHANGED, ASSET_SOURCE_NOT_REGULAR_FILE, ASSET_IMPORT_CANCELLED, ASSET_COLLISION, ASSET_IO_FAILED, ASSET_NOT_FOUND, ASSET_MISSING, ASSET_NOT_REGULAR_FILE, ASSET_SIZE_MISMATCH, ASSET_DIGEST_MISMATCH, ASSET_UNAVAILABLE.
- Native export: EXPORT_CHUNK_OUT_OF_ORDER, EXPORT_CHUNK_TOO_LARGE, EXPORT_BYTE_COUNT_MISMATCH, EXPORT_ENCODE_FAILED, EXPORT_VALIDATION_FAILED, EXPORT_PUBLISH_FAILED.
- Renderer/export coordinator: EXPORT_RENDERER_NOT_READY, EXPORT_CAPTURE_EXPIRED, EXPORT_TEXTURE_UNAVAILABLE, EXPORT_RESOLUTION_UNSUPPORTED, EXPORT_FRAME_INVALID, EXPORT_CANCELLED.
- Adapter/bootstrap boundary: NATIVE_INVOCATION_FAILED, TAURI_RUNTIME_REQUIRED, WEB_SANDBOX_DISABLED, and unknown codes.

Return a stable descriptor plus an optional safe logRef. Never store a translated string in long-lived React state. Local validation and business failures use stable StudioMessageDescriptor values as well.

---

## Task 1: Typed Catalogue, Preference Adapters, Provider, and Root Wiring

**Files:**

- Create: apps/studio/src/i18n/messages.zh-CN.ts
- Create: apps/studio/src/i18n/messages.en.ts
- Create: apps/studio/src/i18n/message-schema.ts
- Create: apps/studio/src/i18n/format-message.ts
- Create: apps/studio/src/i18n/locale-preference.ts
- Create: apps/studio/src/i18n/locale-provider.tsx
- Create: apps/studio/src/i18n/language-switcher.tsx
- Create: apps/studio/src/i18n/display-name-provider.tsx
- Create: apps/studio/src/i18n/test-support.tsx
- Create: apps/studio/src/i18n/format-message.test.ts
- Create: apps/studio/src/i18n/locale-preference.test.ts
- Create: apps/studio/src/i18n/locale-provider.test.tsx
- Create: apps/studio/src/i18n/display-name-provider.test.tsx
- Modify: apps/studio/src/studio-root.tsx
- Modify: apps/studio/src/studio-root.test.tsx

- [ ] **Step 1: Write the catalogue and formatting RED tests**

Test exact Chinese and English output, every parameter tuple shape, language-specific quantity grammar, descriptor reformatting after a locale change, and catalogue key parity. Include a compile-time fixture proving an English entry with a wrong parameter tuple is rejected with ts-expect-error. Use a deliberately invalid runtime key cast to prove the defensive production path falls back to the matching Chinese catalogue entry or the Chinese generic message; it must never render the missing ID or throw into the UI.

~~~ts
expect(createTranslator("zh-CN")("locale.controlLabel")).toBe("界面语言");
expect(createTranslator("en")("locale.controlLabel")).toBe("Language");

const descriptor = message("projectCenter.reopenProject", { name: "中庭方案" });
expect(formatMessage("zh-CN", descriptor)).toBe("重新打开“中庭方案”");
expect(formatMessage("en", descriptor)).toBe("Reopen 中庭方案");
~~~

- [ ] **Step 2: Write preference and provider RED tests**

Cover invalid/missing stored values, caught getItem/setItem exceptions, normal persistence, in-document memory fallback after a storage write failure, memory-only behavior, Chinese default, language switch, document lang, focus preservation, and unmount cleanup. Assert the Web Demo StudioRoot path neither reads nor writes the injected browser storage and remounts in Chinese. In display-name-provider.test.tsx, prove the default resolver returns authored names, a scoped canonical resolver updates on locale change, and neither path mutates the subject object.

~~~tsx
const storage = {
  getItem: vi.fn(() => "en"),
  setItem: vi.fn(),
};
const preference = createBrowserLocalePreference(storage);
expect(preference.read()).toBe("en");
preference.write("zh-CN");
expect(storage.setItem).toHaveBeenCalledWith(
  "aethertwin.studio.locale.v1",
  "zh-CN",
);
~~~

- [ ] **Step 3: Run the focused RED**

Run:

    pnpm.cmd vitest run apps/studio/src/i18n/format-message.test.ts apps/studio/src/i18n/locale-preference.test.ts apps/studio/src/i18n/locale-provider.test.tsx apps/studio/src/i18n/display-name-provider.test.tsx apps/studio/src/studio-root.test.tsx

Expected: FAIL because the i18n modules, provider behavior, and StudioRoot locale composition do not exist. Reject fixture/import errors unrelated to the missing behavior.

- [ ] **Step 4: Implement the typed catalogues and formatter**

Implement the Foundation Interfaces exactly. Freeze catalogue containers and descriptors. Use exhaustive catalogue lookup by StudioLocale. Keep the only dynamic call cast local:

~~~ts
return (catalogue[descriptor.id] as (...args: never[]) => string)(
  ...descriptor.args,
);
~~~

- [ ] **Step 5: Implement preference adapters and provider**

createBrowserLocalePreference accepts storage explicitly so importing the module never touches window.localStorage. StudioRoot chooses the adapter lazily:

~~~tsx
const localePreference = React.useMemo(
  () =>
    webDemo
      ? createMemoryLocalePreference()
      : createBrowserLocalePreference(window.localStorage),
  [webDemo],
);

return (
  <LocaleProvider preference={localePreference}>
    {webDemo ? <WebDemoApp /> : <App />}
  </LocaleProvider>
);
~~~

LanguageSwitcher renders a visible localized label and a native select with exact options 简体中文 and English. It uses locale IDs as values and never stores labels.

- [ ] **Step 6: Run focused GREEN and typecheck**

Run:

    pnpm.cmd vitest run apps/studio/src/i18n/format-message.test.ts apps/studio/src/i18n/locale-preference.test.ts apps/studio/src/i18n/locale-provider.test.tsx apps/studio/src/i18n/display-name-provider.test.tsx apps/studio/src/studio-root.test.tsx
    pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
    git diff --check

Expected: all focused tests pass, TypeScript exits 0, and diff check has no whitespace errors.

- [ ] **Step 7: Commit Task 1**

Stage only the Task 1 files and commit:

    git commit -m "feat(studio): add typed bilingual locale foundation"

## Task 2: Safe Error Descriptors, App Root, Web Demo, and Project Entry

**Files:**

- Create: apps/studio/src/i18n/localized-error.ts
- Create: apps/studio/src/i18n/localized-error.test.ts
- Create: apps/studio/src/web-demo/web-demo-display-name-ids.ts
- Create: apps/studio/src/web-demo/web-demo-display-name-ids.test.ts
- Modify: apps/studio/src/i18n/messages.zh-CN.ts
- Modify: apps/studio/src/i18n/messages.en.ts
- Modify: apps/studio/src/app.tsx
- Modify: apps/studio/src/app.test.tsx
- Modify: apps/studio/src/web-demo/web-demo-app.tsx
- Modify: apps/studio/src/web-demo/web-demo-app.test.tsx
- Modify: apps/studio/src/features/project-center/project-center.tsx
- Modify: apps/studio/src/features/project-center/project-center.test.tsx
- Modify: apps/studio/src/features/project-center/create-project-dialog.tsx
- Modify: apps/studio/src/features/project-center/create-project-dialog.test.tsx

- [ ] **Step 1: Write error-mapping RED tests**

Table-drive every code in Stable Error Mapping. Assert Chinese and English messages are safe, unknown codes use the generic fallback, raw message/path/details never appear, and logRef is returned separately. Assert exporter codes share the same presentation path.

~~~ts
const error = new ProjectBackendError(
  "PROJECT_LOCKED",
  "C:\\secret\\customer\\project is locked",
  { path: "C:\\secret\\customer" },
  "LOG-42",
);
const view = localizeStudioError(error);
expect(formatMessage("zh-CN", view.message)).toBe(
  "该项目正在其他窗口中使用，请关闭后重试。",
);
expect(formatMessage("en", view.message)).toBe(
  "This project is open in another window. Close it and try again.",
);
expect(JSON.stringify(view)).not.toContain("C:\\secret");
expect(view.logRef).toBe("LOG-42");
~~~

- [ ] **Step 2: Write root/project-entry RED tests**

Render each surface in Chinese and English. Cover:

- project list headings, empty state, reopen/remove actions, profile and backend badges;
- create/open/close/recover flows and validation;
- dialog labels, profile choices, buttons, busy state, and safe failures;
- Web Demo loading, retry, fixed notice, initialization failure, and successful editor entry;
- a visible, keyboard-operable LanguageSwitcher in the project-centre header and Web Demo loading/error states, with focus retained after selection;
- a currently displayed failure re-renders in the new language without repeating the failed operation;
- user project names and file paths passed to backend calls remain byte-for-byte unchanged.

Import the canonical Web Demo snapshot in web-demo-display-name-ids.test.ts. Enumerate every named built-in record that can appear in the editor and require one stable kind/id mapping. Assert Chinese and English display names differ where translation is required, the original snapshot remains deeply equal to its pre-render clone, and an unknown or same-shaped user record falls back to authoredName.

Change create-project validation assertions from rendered return strings to stable validation reason IDs plus localized rendering.

- [ ] **Step 3: Run focused RED**

Run:

    pnpm.cmd vitest run apps/studio/src/i18n/localized-error.test.ts apps/studio/src/web-demo/web-demo-display-name-ids.test.ts apps/studio/src/features/project-center/project-center.test.tsx apps/studio/src/features/project-center/create-project-dialog.test.tsx apps/studio/src/web-demo/web-demo-app.test.tsx apps/studio/src/app.test.tsx

Expected: FAIL on hard-coded strings, raw error propagation, missing English render, and string-valued validation state.

- [ ] **Step 4: Implement stable error and validation descriptors**

Use an exhaustive readonly map for all known codes. Unknown values map to error.unknown. Add the canonical Web Demo kind/id-to-message map and install it with DisplayNameProvider only around the ready Web Demo editor; loading, error, and normal Studio use the authored-name fallback. Convert create-project validation to stable reasons:

~~~ts
export type ProjectNameValidationReason =
  | "empty"
  | "dot-path"
  | "separator"
  | "reserved-name"
  | "trailing-dot-or-space"
  | "too-long";

export function validateProjectName(
  name: string,
): ProjectNameValidationReason | null;
~~~

The dialog maps each reason to a message ID at render time. Do not put translated strings into state.

- [ ] **Step 5: Migrate App, WebDemoApp, ProjectCenter, and CreateProjectDialog**

Replace every production-visible literal and aria/title/placeholder string with t or format. Render LanguageSwitcher in the project-centre header and in Web Demo loading/error layouts; the ready editor gets the top-bar control in Task 3. Replace raw profile/backend badge text with exhaustive display mappings. Preserve AetherTwin and user-supplied values. WebDemoApp stores WebDemoErrorCode, not the mapped sentence, so switching locale updates an existing retry screen.

- [ ] **Step 6: Run focused GREEN and typecheck**

Run:

    pnpm.cmd vitest run apps/studio/src/i18n/localized-error.test.ts apps/studio/src/web-demo/web-demo-display-name-ids.test.ts apps/studio/src/features/project-center/project-center.test.tsx apps/studio/src/features/project-center/create-project-dialog.test.tsx apps/studio/src/web-demo/web-demo-app.test.tsx apps/studio/src/app.test.tsx
    pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
    git diff --check

Expected: all focused tests and typecheck pass; raw error text is absent from user-visible assertions.

- [ ] **Step 7: Commit Task 2**

    git commit -m "feat(studio): localize project entry and safe errors"

## Task 3: Editor Shell, Language Control, Toolbar, Floor Tree, and Accessibility

**Files:**

- Modify: packages/editor-shell/src/editor-shell.tsx
- Modify: packages/editor-shell/src/editor-shell.test.tsx
- Modify: packages/editor-shell/src/index.ts
- Modify: apps/studio/src/i18n/messages.zh-CN.ts
- Modify: apps/studio/src/i18n/messages.en.ts
- Create: apps/studio/src/i18n/display-message-ids.ts
- Create: apps/studio/src/i18n/display-message-ids.test.ts
- Modify: apps/studio/src/features/plan-editor/plan-editor.tsx
- Modify: apps/studio/src/features/plan-editor/plan-editor.test.tsx
- Modify: apps/studio/src/features/plan-editor/plan-toolbar.tsx
- Modify: apps/studio/src/features/plan-editor/plan-toolbar.test.tsx
- Modify: apps/studio/src/features/plan-editor/floor-tree.tsx
- Create: apps/studio/src/features/plan-editor/floor-tree.test.tsx
- Modify: apps/studio/src/features/plan-editor/plan-accessibility.tsx
- Create: apps/studio/src/features/plan-editor/plan-accessibility.test.tsx
- Modify: tests/visible-actions.test.mjs

- [ ] **Step 1: Write EditorShell contract RED tests**

Replace hard-coded label expectations with explicit message props and verify the package renders exactly what the caller provides. Add the required API:

~~~ts
export interface EditorShellMessages {
  readonly back: string;
  readonly undo: string;
  readonly redo: string;
  readonly saveStates: Readonly<Record<EditorSaveState, string>>;
  readonly leftPanelLabel: string;
  readonly canvasLabel: string;
  readonly rightPanelLabel: string;
}

export interface EditorShellProps {
  readonly profileLabel: string;
  readonly messages: EditorShellMessages;
  readonly headerAccessory?: React.ReactNode;
}
~~~

Assert headerAccessory renders inside the existing header actions group. The package must not import Studio i18n.

- [ ] **Step 2: Write toolbar, tree, and accessibility RED tests**

Cover Chinese/English tool group and action labels, stable action IDs/order, enabled/active/focus behavior, floor/layer controls, screen-reader instructions, keyboard-help copy, and live switching. Assert user floor/layer names remain unchanged.

Add exhaustive compile/runtime tests for display-message-ids.ts. Every stable union member listed in Stable Display Mapping must resolve to a valid StudioMessageId.

- [ ] **Step 3: Rewrite visible action policy RED**

The policy must no longer require Chinese source literals. Verify stable data-action values, production handler wiring, approved action set/order, and the absence of dormant callbacks. Localized labels are verified in component tests.

~~~js
assert.deepEqual(
  extractDataActions(toolbarSource),
  expectedStableActionIds,
);
assert.match(toolbarSource, /onAction\(action\.id\)/);
~~~

- [ ] **Step 4: Run focused RED**

Run:

    pnpm.cmd vitest run packages/editor-shell/src/editor-shell.test.tsx apps/studio/src/i18n/display-message-ids.test.ts apps/studio/src/features/plan-editor/plan-toolbar.test.tsx apps/studio/src/features/plan-editor/floor-tree.test.tsx apps/studio/src/features/plan-editor/plan-accessibility.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx
    node --test tests/visible-actions.test.mjs

Expected: FAIL because EditorShell still owns hard-coded copy, display mappings are missing, and toolbar/tree/accessibility copy is not locale-driven.

- [ ] **Step 5: Implement caller-owned EditorShell copy and language control**

EditorShell renders only caller-provided labels. PlanEditor obtains t and passes translated messages plus:

~~~tsx
<LanguageSwitcher />
~~~

as headerAccessory. Profile presentation uses PROFILE_MESSAGE_IDS; the stable project profile remains unchanged.

- [ ] **Step 6: Migrate toolbar, floor tree, and accessibility copy**

Use Showroom group/action IDs as lookup keys and React keys. Do not render ToolGroupDescriptor.label or ToolActionDescriptor.label. Keep current action ordering and policy. Translate all visible labels, tooltips, status, aria-labels, and keyboard instructions.

- [ ] **Step 7: Run focused GREEN and package typechecks**

Run:

    pnpm.cmd vitest run packages/editor-shell/src/editor-shell.test.tsx apps/studio/src/i18n/display-message-ids.test.ts apps/studio/src/features/plan-editor/plan-toolbar.test.tsx apps/studio/src/features/plan-editor/floor-tree.test.tsx apps/studio/src/features/plan-editor/plan-accessibility.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx
    node --test tests/visible-actions.test.mjs
    pnpm.cmd exec tsc -p packages/editor-shell/tsconfig.json --noEmit
    pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
    git diff --check

Expected: all commands exit 0.

- [ ] **Step 8: Commit Task 3**

    git commit -m "feat(studio): localize editor shell and navigation"

## Task 4: Project, Floor, Layer, Reference, Opening, Entity, and Multi-Selection Inspector

**Files:**

- Modify: apps/studio/src/i18n/messages.zh-CN.ts
- Modify: apps/studio/src/i18n/messages.en.ts
- Modify: apps/studio/src/i18n/display-message-ids.ts
- Modify: apps/studio/src/features/plan-editor/plan-inspector.tsx
- Create: apps/studio/src/features/plan-editor/plan-inspector.test.tsx
- Modify: apps/studio/src/features/plan-editor/plan-editor.test.tsx

- [ ] **Step 1: Write inspector RED tests**

Exercise every PlanInspector selection kind: project, floor, layer, plan-reference, opening, entity, multi, empty, and stale selection. Render each in Chinese and English. Cover all headings, field labels, buttons, visibility states, type/kind/status labels, unit labels, accessible names, and safe error notices.

Assert:

- normal-Studio project/floor/layer/entity names and IDs remain unchanged;
- canonical Web Demo records use the stable display-name resolver while the snapshot and command payloads retain their authored names;
- profile, entity type, SpaceUnitKind, FixtureKind, PointOfInterestKind, opening kind, media kind, and route kind are localized from stable values;
- switching locale preserves selected IDs and unsaved form values;
- stable values sent through onCommit/onRename/onVisibilityChange remain unchanged.

- [ ] **Step 2: Run focused RED**

Run:

    pnpm.cmd vitest run apps/studio/src/features/plan-editor/plan-inspector.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx

Expected: FAIL on hard-coded Chinese/English literals and raw stable enum values.

- [ ] **Step 3: Add inspector catalogue entries and exhaustive mappings**

Add exact entries for every visible inspector state. Map stable values:

~~~ts
export const SPACE_UNIT_KIND_MESSAGE_IDS = {
  room: "entity.spaceUnit.room",
  shop: "entity.spaceUnit.shop",
  booth: "entity.spaceUnit.booth",
  exhibition: "entity.spaceUnit.exhibition",
  service: "entity.spaceUnit.service",
  restricted: "entity.spaceUnit.restricted",
} as const satisfies Readonly<Record<SpaceUnitKind, StudioMessageId>>;
~~~

Repeat this exhaustive pattern for FixtureKind, PointOfInterestKind, opening kind, MediaAssetKind, and RouteNodeKind.

- [ ] **Step 4: Migrate PlanInspector**

Use t/format at render time. Keep numeric formatting deterministic and locale-independent where it is edited data; localize only surrounding unit/description copy. Never use a translated label as an option value, React key, selection kind, or mutation payload.

- [ ] **Step 5: Run focused GREEN and typecheck**

Run:

    pnpm.cmd vitest run apps/studio/src/features/plan-editor/plan-inspector.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx
    pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
    git diff --check

- [ ] **Step 6: Commit Task 4**

    git commit -m "feat(studio): localize plan inspector"

## Task 5: Asset Library, Reference Image, and Calibration Workflows

**Files:**

- Modify: apps/studio/src/i18n/messages.zh-CN.ts
- Modify: apps/studio/src/i18n/messages.en.ts
- Modify: apps/studio/src/features/plan-editor/asset-library.tsx
- Modify: apps/studio/src/features/plan-editor/asset-library.test.tsx
- Modify: apps/studio/src/features/plan-editor/reference-inspector.tsx
- Modify: apps/studio/src/features/plan-editor/reference-inspector.test.tsx
- Modify: apps/studio/src/features/plan-editor/calibration-panel.tsx
- Modify: apps/studio/src/features/plan-editor/calibration-panel.test.tsx

- [ ] **Step 1: Write bilingual asset workflow RED tests**

Cover empty/populated/importing/cancelling/failed asset states, import buttons, role/media labels, progress and retry actions, reference transform fields, calibration instructions, invalid distances, apply/cancel actions, and accessible names in both locales.

Assert live switching while an import is in progress does not restart/cancel it and only changes presentation. Inject a ProjectBackendError with a secret path and assert neither locale exposes the path or raw message. Asset file names and normal-Studio user reference labels remain unchanged. Canonical Web Demo reference labels may resolve by stable kind/id only; the source record remains unchanged.

- [ ] **Step 2: Run focused RED**

Run:

    pnpm.cmd vitest run apps/studio/src/features/plan-editor/asset-library.test.tsx apps/studio/src/features/plan-editor/reference-inspector.test.tsx apps/studio/src/features/plan-editor/calibration-panel.test.tsx

Expected: FAIL on hard-coded copy and raw failure rendering.

- [ ] **Step 3: Migrate the three workflows**

Replace visible literals, aria labels, placeholders, title attributes, progress copy, and validation text with t/format. Store stable descriptors for local errors and pass backend failures through localized-error.ts. Do not localize source file names, hashes, roles in persistence, or dimensions.

- [ ] **Step 4: Run focused GREEN and typecheck**

Run:

    pnpm.cmd vitest run apps/studio/src/features/plan-editor/asset-library.test.tsx apps/studio/src/features/plan-editor/reference-inspector.test.tsx apps/studio/src/features/plan-editor/calibration-panel.test.tsx
    pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
    git diff --check

- [ ] **Step 5: Commit Task 5**

    git commit -m "feat(studio): localize asset and calibration workflows"

## Task 6: Fixture, Room Recognition, Opening, Material, and Environment Workflows

**Files:**

- Modify: apps/studio/src/i18n/messages.zh-CN.ts
- Modify: apps/studio/src/i18n/messages.en.ts
- Modify: apps/studio/src/i18n/display-message-ids.ts
- Modify: apps/studio/src/features/plan-editor/fixture-catalogue.tsx
- Modify: apps/studio/src/features/plan-editor/fixture-catalogue.test.tsx
- Modify: apps/studio/src/features/plan-editor/room-recognition-panel.tsx
- Modify: apps/studio/src/features/plan-editor/room-recognition-panel.test.tsx
- Modify: apps/studio/src/features/plan-editor/opening-inspector.tsx
- Modify: apps/studio/src/features/plan-editor/opening-inspector.test.tsx
- Modify: apps/studio/src/features/plan-editor/material-inspector.tsx
- Modify: apps/studio/src/features/plan-editor/material-inspector.test.tsx
- Modify: apps/studio/src/features/plan-editor/environment-inspector.tsx
- Modify: apps/studio/src/features/plan-editor/environment-inspector.test.tsx

- [ ] **Step 1: Write bilingual spatial workflow RED tests**

Cover:

- all seven Showroom fixture kinds, selected state, dimensions, and placement actions;
- room-recognition ready/running/empty/result/error/cancel states;
- door/window options and opening geometry validation;
- material target kinds, texture status, clear/apply states, and safe failures;
- environment fields, validation, reset/apply, and numeric units;
- live switching with selected fixture, recognition result, unsaved opening/material/environment input retained.

Assert fixture selection/creation callbacks receive stable kind values. Assert newly created entities still use SHOWROOM_FIXTURE_CATALOGUE.defaultName exactly; changing locale never renames an existing or new record. Existing canonical Web Demo records may receive a translated presentation name only through their stable kind/id mapping.

- [ ] **Step 2: Run focused RED**

Run:

    pnpm.cmd vitest run apps/studio/src/features/plan-editor/fixture-catalogue.test.tsx apps/studio/src/features/plan-editor/room-recognition-panel.test.tsx apps/studio/src/features/plan-editor/opening-inspector.test.tsx apps/studio/src/features/plan-editor/material-inspector.test.tsx apps/studio/src/features/plan-editor/environment-inspector.test.tsx

Expected: FAIL because descriptors and local LABELS/validation strings are rendered directly.

- [ ] **Step 3: Migrate stable display labels and workflow copy**

Map ShowroomFixtureKind through FIXTURE_KIND_MESSAGE_IDS. Leave descriptor.defaultName and sizes untouched. Replace Opening option labels while keeping values door/window. Replace MaterialTargetKind and environment labels through typed catalogue entries. Convert validation state from pre-rendered strings to descriptors.

- [ ] **Step 4: Run focused GREEN and typecheck**

Run:

    pnpm.cmd vitest run apps/studio/src/features/plan-editor/fixture-catalogue.test.tsx apps/studio/src/features/plan-editor/room-recognition-panel.test.tsx apps/studio/src/features/plan-editor/opening-inspector.test.tsx apps/studio/src/features/plan-editor/material-inspector.test.tsx apps/studio/src/features/plan-editor/environment-inspector.test.tsx
    pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
    git diff --check

- [ ] **Step 5: Commit Task 6**

    git commit -m "feat(studio): localize spatial editing workflows"

## Task 7: Content, Hotspot, Media, and Guided Route Workflows

**Files:**

- Modify: apps/studio/src/i18n/messages.zh-CN.ts
- Modify: apps/studio/src/i18n/messages.en.ts
- Modify: apps/studio/src/i18n/display-message-ids.ts
- Modify: apps/studio/src/features/plan-editor/content-inspector.tsx
- Modify: apps/studio/src/features/plan-editor/content-inspector.test.tsx
- Modify: apps/studio/src/features/plan-editor/route-inspector.tsx
- Modify: apps/studio/src/features/plan-editor/route-inspector.test.tsx
- Modify: apps/studio/src/features/plan-editor/route-panel.tsx
- Modify: apps/studio/src/features/plan-editor/route-panel.test.tsx
- Modify: apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx

- [ ] **Step 1: Write bilingual content/route RED tests**

Cover every content selection and action: POI kinds, product hotspot fields, attach/remove media, image/video labels, missing/unavailable assets, route node kinds, node/edge creation, stop editing, route framing, guided preview, empty route, invalid route, and cancellation.

Render Chinese and English. Assert:

- stored names, URLs, asset IDs, route IDs, and normal-Studio user-entered copy remain unchanged;
- canonical Web Demo content/route names localize only through stable kind/id presentation mappings and never enter command payloads;
- kind values sent to commands remain stable;
- route order and selected IDs survive live switching;
- error/status text re-renders from stable descriptors without repeating commands.

- [ ] **Step 2: Run focused RED**

Run:

    pnpm.cmd vitest run apps/studio/src/features/plan-editor/content-inspector.test.tsx apps/studio/src/features/plan-editor/route-inspector.test.tsx apps/studio/src/features/plan-editor/route-panel.test.tsx apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx

Expected: FAIL on current literal and raw enum rendering.

- [ ] **Step 3: Migrate content and route UI**

Use exhaustive display mappings for PointOfInterestKind, MediaAssetKind, and RouteNodeKind. Convert local action/status failures to stable descriptors. Keep editor-session commands and ProjectStore mutations unchanged.

- [ ] **Step 4: Run focused GREEN and typecheck**

Run:

    pnpm.cmd vitest run apps/studio/src/features/plan-editor/content-inspector.test.tsx apps/studio/src/features/plan-editor/route-inspector.test.tsx apps/studio/src/features/plan-editor/route-panel.test.tsx apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx
    pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
    git diff --check

- [ ] **Step 5: Commit Task 7**

    git commit -m "feat(studio): localize content and route workflows"

## Task 8: Plan Canvas, Scene Canvas, Export Panel, and Editor Runtime Status

**Files:**

- Modify: apps/studio/src/i18n/messages.zh-CN.ts
- Modify: apps/studio/src/i18n/messages.en.ts
- Modify: apps/studio/src/i18n/display-message-ids.ts
- Modify: apps/studio/src/features/plan-editor/plan-canvas.tsx
- Modify: apps/studio/src/features/plan-editor/plan-canvas.test.tsx
- Modify: apps/studio/src/features/plan-editor/scene-canvas.tsx
- Modify: apps/studio/src/features/plan-editor/scene-canvas.test.tsx
- Modify: apps/studio/src/features/plan-editor/export-panel.tsx
- Modify: apps/studio/src/features/plan-editor/export-panel.test.tsx
- Modify: apps/studio/src/features/plan-editor/plan-editor.tsx
- Modify: apps/studio/src/features/plan-editor/plan-editor.test.tsx
- Modify: apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx

- [ ] **Step 1: Write bilingual canvas/export RED tests**

Cover both locales for:

- 2D canvas labels, empty/loading/unavailable overlays, zoom/frame hints, selection announcements, and pointer/keyboard accessible names;
- 3D renderer initializing/ready/recovering/failed/unavailable states, WebGL fallback copy, split-view labels, and input lock;
- export panel heading, presets, dimensions, disabled reasons, phases, cancel, success path, result path/hash labels, open-folder/reveal actions, safe failure, and retry;
- PlanEditor save/action/export notices and locale switching during an active export.

Assert locale switching during export:

- does not create a second coordinator operation;
- does not cancel the current operation;
- preserves progress phase and progress counts;
- re-renders phase/disabled/error/success copy;
- does not change preset, renderer capture provenance, export path, checksum, or backend payload.

Assert stable codes are kept in state and internal error codes are absent from visible text. A code may be exposed only as a data-error-code test/debug attribute.

- [ ] **Step 2: Run focused RED**

Run:

    pnpm.cmd vitest run apps/studio/src/features/plan-editor/plan-canvas.test.tsx apps/studio/src/features/plan-editor/scene-canvas.test.tsx apps/studio/src/features/plan-editor/export-panel.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx

Expected: FAIL on English-only export UI, hard-coded renderer states, raw action errors, and string-valued disabled reasons.

- [ ] **Step 3: Define stable export presentation state**

Do not change exporter contracts. Change only Studio presentation state:

~~~ts
export type StudioExportFailure = {
  readonly code: string;
  readonly logRef?: string;
};

export type ExportDisabledReason =
  | "capability-unavailable"
  | "two-dimensional-view"
  | "renderer-not-ready"
  | "capture-stale"
  | "operation-active";
~~~

Map ProjectExportPreset, coordinator phase, renderer status, and disabled reason to message IDs exhaustively.

- [ ] **Step 4: Migrate canvases, ExportPanel, and PlanEditor runtime messages**

Replace visible literals and aria labels with current-locale rendering. Convert actionError and export status state to stable descriptors/codes. Never feed translated messages back into renderer/exporter/backend APIs. Preserve Task 13 action policies and Task 14 current-handle lifecycle.

- [ ] **Step 5: Run focused GREEN and typecheck**

Run:

    pnpm.cmd vitest run apps/studio/src/features/plan-editor/plan-canvas.test.tsx apps/studio/src/features/plan-editor/scene-canvas.test.tsx apps/studio/src/features/plan-editor/export-panel.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx
    pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
    git diff --check

- [ ] **Step 6: Commit Task 8**

    git commit -m "feat(studio): localize canvas and export workflows"

## Task 9: Production String Audit, Dual-Locale Regression Suite, and Copy Glossary

**Files:**

- Create: tests/localization-policy.test.mjs
- Create: apps/studio/src/i18n/glossary.md
- Modify: tests/visible-actions.test.mjs
- Modify: tests/web-demo-policy.test.mjs
- Modify: apps/studio/src/i18n/messages.zh-CN.ts
- Modify: apps/studio/src/i18n/messages.en.ts
- Modify: apps/studio/src/i18n/locale-provider.test.tsx
- Modify: apps/studio/src/app.test.tsx
- Modify: apps/studio/src/web-demo/web-demo-app.test.tsx
- Modify: apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx

- [ ] **Step 1: Write localization policy RED**

Use the existing TypeScript compiler API from the repository dependency graph; do not add a package. Scan production TS/TSX under apps/studio/src and packages/editor-shell/src.

Inspect:

- JSXText with non-whitespace user copy;
- string literals in aria-label, aria-description, title, placeholder, alt, label, helpText, empty-state, error, status, button, and option content;
- production configuration arrays that provide visible labels;
- direct rendering of descriptor.label from mode-showroom;
- direct rendering of Error.message, ProjectBackendError.message, error.code, JSON.stringify(error), or arbitrary error.details.

Exclude:

- all test files and test-support files;
- apps/studio/src/dev and explicitly named developer gallery sources;
- source comments and non-visible data constants;
- i18n catalogue modules themselves.

Use one exact allowlist of AetherTwin, PNG, UUID, WebGL, 2D, 3D, dimension tokens such as 1920 × 1080, and keyboard shortcut tokens. Reject new broad regex exemptions.

~~~js
assert.deepEqual(violations, [], violations.join("\n"));
~~~

- [ ] **Step 2: Strengthen storage and end-to-end locale RED tests**

Add tests proving:

- normal Studio reads a valid remembered en and persists later choices;
- invalid stored values and storage exceptions default to zh-CN;
- Web Demo never reads/writes localStorage/sessionStorage/IndexedDB for locale;
- Web Demo localization never reads/writes cookies, Cache Storage, or service workers;
- Web Demo refresh/remount resets to zh-CN;
- language selection does not reset the current editor/store/session or mutate recent projects;
- a Chinese and English walkthrough covers project center, editor shell, every tool group, one representative inspector from each workflow family, renderer fallback, and export disabled state;
- switching with a visible error and in-progress operation changes only rendered copy.
- long English labels and natural Chinese sentences use wrapping-friendly component contracts: no locale-dependent fixed width, no copy truncation that removes the action meaning, and no nowrap rule on the language control, toolbar groups, notices, inspector labels, or export status.

- [ ] **Step 3: Run policy RED**

Run:

    node --test tests/localization-policy.test.mjs tests/visible-actions.test.mjs tests/web-demo-policy.test.mjs
    pnpm.cmd vitest run apps/studio/src/i18n/locale-provider.test.tsx apps/studio/src/app.test.tsx apps/studio/src/web-demo/web-demo-app.test.tsx apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx

Expected: the new policy identifies any remaining production literals or unsafe error paths. Fix only enumerated violations; do not weaken the scanner.

- [ ] **Step 4: Complete the catalogues and editorial glossary**

glossary.md records:

- locked terms from this plan;
- capitalization and punctuation rules;
- concise button versus sentence-style status guidance;
- unit and dimension formatting;
- how to treat brands, technical tokens, user-entered names, file names, and diagnostic references;
- prohibited literal translations and their preferred natural Chinese alternatives.

Review every zh-CN and en entry side by side for intent, consistent terminology, complete sentences, and parameter parity. Remove duplicate keys that express the same concept.

- [ ] **Step 5: Run policy GREEN and complete source-level gates**

Run:

    node --test tests/localization-policy.test.mjs tests/visible-actions.test.mjs tests/web-demo-policy.test.mjs tests/offline-source-policy.test.mjs
    pnpm.cmd vitest run apps/studio/src/i18n/format-message.test.ts apps/studio/src/i18n/locale-preference.test.ts apps/studio/src/i18n/locale-provider.test.tsx apps/studio/src/i18n/display-name-provider.test.tsx apps/studio/src/i18n/localized-error.test.ts apps/studio/src/web-demo/web-demo-display-name-ids.test.ts apps/studio/src/app.test.tsx apps/studio/src/web-demo/web-demo-app.test.tsx apps/studio/src/features/project-center/project-center.test.tsx apps/studio/src/features/project-center/create-project-dialog.test.tsx apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx
    pnpm.cmd exec tsc -p packages/editor-shell/tsconfig.json --noEmit
    pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
    pnpm.cmd lint
    git diff --check

Expected: all commands exit 0. The Web Demo policy continues to prove no persistent browser storage and the dependency/lock state is unchanged.

- [ ] **Step 6: Commit Task 9**

    git commit -m "test(studio): enforce bilingual production copy"

## Task 10: Documentation, Full Source Gates, Independent Review, and Browser Approval Checkpoint

**Files:**

- Modify: README.md
- Modify: HANDOFF.md
- Modify: PLANS.md
- Create: docs/superpowers/reports/2026-08-20-aethertwin-bilingual-ui-report.md

- [ ] **Step 1: Update user and maintainer documentation**

Document:

- Chinese default and the visible language selector;
- normal Studio persistence key and failure fallback;
- Web Demo/portable memory-only behavior and Chinese reset after refresh;
- presentation-only localization boundary;
- stable error-code localization and unknown fallback;
- excluded developer/console surfaces;
- exact source-level and separately approved browser acceptance gates.

Do not claim browser acceptance before it has been run.

- [ ] **Step 2: Run the complete non-build source gate**

Run in this order:

    node --test tests/localization-policy.test.mjs tests/visible-actions.test.mjs tests/web-demo-policy.test.mjs tests/offline-source-policy.test.mjs
    pnpm.cmd vitest run packages/editor-shell/src/editor-shell.test.tsx apps/studio/src/i18n/format-message.test.ts apps/studio/src/i18n/locale-preference.test.ts apps/studio/src/i18n/locale-provider.test.tsx apps/studio/src/i18n/display-name-provider.test.tsx apps/studio/src/i18n/localized-error.test.ts apps/studio/src/web-demo/web-demo-display-name-ids.test.ts apps/studio/src/studio-root.test.tsx apps/studio/src/app.test.tsx apps/studio/src/web-demo/web-demo-app.test.tsx apps/studio/src/features/project-center/project-center.test.tsx apps/studio/src/features/project-center/create-project-dialog.test.tsx apps/studio/src/features/plan-editor/plan-toolbar.test.tsx apps/studio/src/features/plan-editor/floor-tree.test.tsx apps/studio/src/features/plan-editor/plan-accessibility.test.tsx apps/studio/src/features/plan-editor/plan-inspector.test.tsx apps/studio/src/features/plan-editor/asset-library.test.tsx apps/studio/src/features/plan-editor/reference-inspector.test.tsx apps/studio/src/features/plan-editor/calibration-panel.test.tsx apps/studio/src/features/plan-editor/fixture-catalogue.test.tsx apps/studio/src/features/plan-editor/room-recognition-panel.test.tsx apps/studio/src/features/plan-editor/opening-inspector.test.tsx apps/studio/src/features/plan-editor/material-inspector.test.tsx apps/studio/src/features/plan-editor/environment-inspector.test.tsx apps/studio/src/features/plan-editor/content-inspector.test.tsx apps/studio/src/features/plan-editor/route-inspector.test.tsx apps/studio/src/features/plan-editor/route-panel.test.tsx apps/studio/src/features/plan-editor/plan-canvas.test.tsx apps/studio/src/features/plan-editor/scene-canvas.test.tsx apps/studio/src/features/plan-editor/export-panel.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx apps/studio/src/features/plan-editor/plan-editor.integration.test.tsx
    pnpm.cmd exec tsc -p packages/editor-shell/tsconfig.json --noEmit
    pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit
    pnpm.cmd lint
    git diff --check

Expected: every command exits 0. Record exact file/test counts, warnings, and skipped prohibited gates in the report.

- [ ] **Step 3: Verify protected and contract scope**

Confirm:

    git diff -- packages/mode-showroom/src/index.ts crates/asset-io/Cargo.toml crates/desktop-host/Cargo.toml package.json pnpm-lock.yaml
    git diff --cached --name-only

Expected before staging documentation: no new content diff in protected files, manifests, or lockfile; cached output empty. Preserve pre-existing worktree markers without staging or restoring them.

- [ ] **Step 4: Request independent specification/code review**

The reviewer must inspect:

- every production surface in the inventory;
- catalogue key/parameter parity;
- normal versus Web Demo preference boundaries;
- live-switch preservation of current state and operations;
- stable ID/data invariants;
- full stable error-code mapping and raw-error redaction;
- localization policy false-negative escape routes;
- Chinese naturalness and English usability;
- protected-file and dependency scope.

Resolve all Critical and Important findings with RED tests and rerun the complete non-build source gate. Record closure evidence in the report.

- [ ] **Step 5: Commit source-gate and documentation closure**

Stage only the Task 10 documentation/report and any reviewed localization fixes:

    git commit -m "docs: close bilingual Studio UI rollout"

- [ ] **Step 6: Stop for explicit browser/build approval**

Do not run build, dev, preview, a localhost server, Playwright, screenshots, WebGL, or portable-package generation under this plan step. Ask the user for a fresh approval that names the intended environment.

After approval, the acceptance operator may run the separately authorized existing Web Demo or portable preview workflow and verify:

1. first launch is Chinese and the text language control is reachable in project centre, Web Demo loading/error, and the editor top bar;
2. normal desktop locale persists across restart;
3. Web Demo/portable refresh returns to Chinese and browser storage remains empty;
4. language switching works on project center and all interactive editor panels;
5. user-entered names, IDs, paths, selection, unsaved input, undo/redo, current project, active renderer, and active export remain unchanged;
6. both languages remain readable at common Windows scaling and narrow/normal viewport sizes;
7. keyboard navigation and screen-reader names change consistently;
8. WebGL fallback and Export-disabled copy are correct in both languages;
9. no remote requests or new browser storage appear.

Record browser/version, OS, URL/mode, screenshots if authorized, observed warnings, and cleanup outcome in the report. Do not represent the source-level gates as visual/browser proof.

## Definition of Done

- Simplified Chinese is the default on every production interactive Studio surface.
- English is selectable from the editor header and all in-scope copy switches without a reload.
- Normal Studio remembers the choice; Web Demo and portable preview never persist it and reset to Chinese after refresh.
- All production visible copy is catalogue-driven or narrowly allowlisted.
- Known backend/export/asset error codes have safe bilingual copy and unknown/raw errors cannot leak.
- Stable IDs, persisted data, default entity names, callbacks, command payloads, project format, native APIs, and operation lifecycles remain unchanged.
- Focused tests, policy tests, Studio/editor-shell typechecks, lint, and diff check are green.
- No dependency, lockfile, protected-file, build artifact, or browser cache change is introduced.
- Independent review has no open Critical or Important findings.
- Build/browser acceptance is either separately approved and recorded, or explicitly marked not run under repository rules.
