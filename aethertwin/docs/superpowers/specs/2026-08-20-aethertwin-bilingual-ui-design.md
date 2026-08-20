# AetherTwin Bilingual Product UI Design

**Date:** 2026-08-20
**Status:** Approved design; implementation not started

## Goal

Make Simplified Chinese the default language for every production, interactive
AetherTwin page while keeping polished English as an explicit user-selectable
alternative.

This is a product-language capability, not a bulk string replacement. Chinese
copy must read naturally in a Chinese product context, use one controlled
terminology set, and explain actions and failures in user language rather than
exposing internal implementation vocabulary. English copy receives the same
product-quality treatment.

Changing language must never mutate project data, command history, renderer
state, selection, undo/redo state, or durable project files.

## Approved decisions

The following decisions were confirmed with the user before this document was
written:

- The only supported locales in this phase are `zh-CN` and `en`.
- `zh-CN` is always the default. The application does not infer a locale from
  the browser, operating system, or environment.
- Normal Studio remembers a valid language selection between launches.
- Web Demo and the Windows portable preview keep the selection in memory only.
  Refresh or restart returns them to Chinese and preserves their accepted empty
  browser-storage boundary.
- Every formally reachable, interactive product page is in scope.
- Developer galleries, test fixtures, internal logs, the portable console, and
  distribution documentation are outside the first localization pass.
- Built-in tools, examples, catalogue entries, and fixture names may display a
  localized name, but the mapping is presentation-only.
- Project records, stable IDs, error codes, file data, and user-entered names
  are never translated or rewritten.
- The implementation uses an internal typed catalogue and adds no third-party
  localization runtime.

## Current product boundary

The existing Studio is partially Chinese and partially English. Visible copy
is distributed through React components, UI configuration arrays, accessibility
attributes, error mappings, status labels, select options, and a small number of
workspace UI packages. There is no current locale state or message-catalogue
contract.

The Web Demo has a separately accepted contract: it starts from the canonical
Showroom, keeps all project state in memory, writes no browser storage, and
resets on refresh, Back, or restart. Localization must not weaken that contract.

## Scope

The first localization pass includes all production surfaces a user can reach
or operate:

1. Project centre
   - create, open, recover, and recent-project flows;
   - loading, empty, unavailable, and failure states;
   - project-profile labels and project actions.
2. Editor shell
   - global status, save state, navigation, toolbars, shortcuts, and menus;
   - floor tree, selection status, canvas accessibility controls, and focus
     guidance.
3. Authoring panels
   - asset library, calibration, reference image, fixtures, room recognition,
     openings, materials, environment, content, routes, hotspots, and related
     inspectors and dialogs.
4. Scene and export
   - 2D/3D status, renderer fallback, split-view controls, input locks;
   - export presets, disabled reasons, validation issues, progress, completion,
     cancellation, and safe errors.
5. Web Demo and portable-preview product surface
   - loading, failure, retry, Back, and the complete editor reached after load.
6. Accessibility and secondary copy
   - `aria-label`, `aria-description`, titles, tooltips, placeholders, option
     labels, empty states, validation help, and disabled reasons.
7. Built-in presentation data
   - canonical example, built-in catalogue, action, tool, material, and fixture
     display names when those names are derived from stable product IDs.

The first pass excludes developer-only gallery routes, unit-test fixtures,
internal diagnostic logs, raw console text, README/package documentation, and
generated artefacts. An excluded surface must not be reachable in the normal
Studio or Web Demo product flow.

## Locale contract

```ts
type StudioLocale = "zh-CN" | "en";
```

The locale contract has these invariants:

- Missing, malformed, or unsupported persisted values resolve to `zh-CN`.
- Locale switching is immediate and does not reload the document.
- The current route, open project, selection, editor mode, viewport, panels,
  transient operation state, and undo/redo stack remain unchanged.
- The document language is updated to `<html lang="zh-CN">` or
  `<html lang="en">` with the same state transition.
- Locale catalogues are bundled with Studio. Runtime translation never performs
  a network request or reads a remote fallback.
- If durable preference storage is unavailable, normal Studio continues with
  an in-memory selection rather than blocking the product.

## Persistence policy

Normal Studio may store only the valid locale token in a namespaced application
preference entry. The recommended key is `aethertwin.studio.locale.v1`.
Reading and writing the preference is isolated behind a small locale-preference
adapter so the React provider does not directly own storage policy.

Web Demo and portable preview receive a memory-only adapter. They must not read
or write local storage, session storage, cookies, IndexedDB, Cache Storage, or a
service worker for localization. Selecting English in those modes lasts only
for the current document lifetime.

Locale state is presentation state. It is forbidden from ProjectStore,
CommandBus, snapshots, journal entries, project manifests, undo/redo records,
native DTOs, and `.twinproj` files.

## Architecture

The Studio owns the product catalogue and language state. A proposed internal
layout is:

```text
apps/studio/src/i18n/
  message-schema.ts
  messages.zh-CN.ts
  messages.en.ts
  format-message.ts
  locale-preference.ts
  locale-provider.tsx
  language-switcher.tsx
  glossary.md
```

`message-schema.ts` defines the complete set of message IDs and the typed
parameters accepted by each message. Both catalogues implement exactly that
schema. Static messages accept no parameters; dynamic messages use named,
typed values such as dimensions, counts, file names, or shortcuts. Catalogue
parity is therefore a type-check and test invariant rather than a runtime hope.

Message IDs are grouped by product domain, for example:

```text
projectCenter.createShowroom
projectCenter.recoveryRequired
plan.toolbar.select
plan.floor.empty
scene.status.loading
export.preset.fullHd
export.reason.rendererNotReady
error.projectOpenFailed
```

The formatter returns text only. It does not accept translated HTML and it does
not use `dangerouslySetInnerHTML`. Components retain ownership of markup,
links, emphasis, and focus behavior. This keeps interpolation escaped by React
and keeps accessible copy inspectable.

`LocaleProvider` exposes the current locale, a setter, and the typed translation
function. `StudioRoot` supplies either the persistent or memory-only preference
adapter. A shared `LanguageSwitcher` renders the explicit choices
“简体中文” and “English”.

UI packages below Studio do not import the Studio catalogue. A reusable package
component receives localized labels through typed props, or it exposes stable
state/reason IDs that Studio translates. Pure domain packages remain free of
React and locale state.

## UI integration

The language switch is visible and keyboard-operable in:

- the project-centre header;
- the editor top bar;
- Web Demo loading and error states.

It uses text, not a flag icon or an icon-only control. The control announces its
purpose and selected value in the current language. Switching language
preserves focus where possible and never closes a dialog or restarts an active
operation.

Components render translated copy at the presentation edge. They do not cache
already translated strings in business state. This ensures a live switch also
updates existing errors, disabled reasons, select options, and progress labels.

## Stable data and display-name mapping

Built-in names are localized by stable ID:

```text
stable tool/catalogue/example ID -> message ID -> current-locale display text
```

The stable ID remains the value used for commands, policy checks, persistence,
selection, and tests. Select option values and command payloads remain
language-neutral. Only the rendered label changes.

User-entered project names, floor names, route names, content names, and other
authored data are displayed exactly as entered. Localization must not guess
that an English-looking user value is built-in content.

## Errors, statuses, and disabled reasons

Native and domain layers continue returning stable safe codes and structured
details. The view maps those values to localized message IDs. Raw operating
system errors, paths, SQL, stack traces, source filenames, and native error
strings remain prohibited.

Unknown safe failures use a locale-specific generic message. A missing message
ID is a development/test failure; a production defensive fallback uses the
Chinese catalogue rather than displaying an ID or an exception.

Messages explain the user-relevant outcome and next action. Internal terms such
as “renderer generation”, “operation registry”, or “snapshot sequence” are not
shown when natural product language is available. For example, the product
should say “三维视图尚未准备好，请稍后重试” rather than translating an internal
renderer-state sentence word for word.

## Chinese copy standard

Chinese copy follows a controlled product glossary and these editorial rules:

- Prefer short action verbs: “新建展厅项目”, “打开项目”, “重试”, “取消导出”.
- State the outcome before technical context: “无法打开项目，请重试”.
- Use Chinese punctuation and natural sentence order.
- Avoid unnecessary subject pronouns, passive constructions, title case, and
  mechanical English noun stacking.
- Keep recognised technical tokens such as PNG, UUID, WebGL, dimensions, and
  keyboard shortcuts where they help the user.
- Avoid mixed Chinese/English labels when an established Chinese product term
  exists.
- Use one term consistently in navigation, labels, help text, errors, and
  accessibility copy.

Initial terminology decisions include:

| Product concept | Simplified Chinese rule |
| --- | --- |
| Showroom | 展厅 |
| Market | 市集 |
| Floor | 楼层 |
| Asset | 素材 |
| Reference image | 参考图 |
| Fixture, furnishing context | 陈设 |
| Fixture, structural context | 建筑构件 or the specific object name |
| Opening | 门窗洞口 when structural; otherwise the specific 门/窗 label |
| Route | 导览路线 in the feature name; 路线 in compact controls |
| Hotspot | 互动热点 in explanatory copy; 热点 in compact controls |
| Export | 导出 |
| Full HD | 全高清（1920 × 1080） |
| Ultra HD | 超高清（3840 × 2160） |
| Retry | 重试 |

The implementation may extend this glossary, but it may not introduce a second
translation for an established concept without a documented contextual reason.

## English copy standard

English is a first-class alternative, not a diagnostic fallback. It uses normal
product capitalization and sentence structure, preserves the same safe-error
boundary, and avoids exposing message IDs or implementation terms. English
labels may be longer than Chinese labels; layouts must accommodate both rather
than abbreviating them into unclear text.

## Migration sequence

Implementation should proceed in reviewable batches:

1. Add the message schema, both catalogues, formatter, locale provider,
   preference adapters, language switcher, and their RED/GREEN tests.
2. Migrate Studio root, project centre, and Web Demo loading/error surfaces.
3. Migrate the editor shell, toolbar, floor tree, canvas accessibility controls,
   dialogs, and all authoring panels.
4. Migrate 2D/3D state, export flow, safe errors, disabled reasons, select
   options, and built-in display-name mappings.
5. Complete production-source visible-string auditing, catalogue parity checks,
   terminology review, and dual-language integration coverage.

Each batch keeps stable IDs and component behavior unchanged. A migration is
not complete merely because its primary button is translated; secondary,
disabled, empty, error, loading, and accessibility states are part of the same
surface.

## Automated verification

The source-level test plan includes:

- compile-time and runtime catalogue-key parity;
- formatter tests for every parameter shape and language-specific quantity
  grammar;
- default-Chinese and invalid-preference fallback tests;
- normal-Studio preference restoration tests;
- Web-Demo memory-only tests proving refresh semantics and empty browser
  storage remain unchanged;
- switching tests proving project, selection, editor view, active operation,
  and undo/redo state are not reset;
- primary route and component tests in both locales;
- safe error-code, status-code, and disabled-reason mappings in both locales;
- built-in ID display mapping without durable-data mutation;
- keyboard and accessible-name tests for the switch and affected controls;
- long-English and Chinese wrapping tests at the component-contract level;
- a focused source-policy audit for production JSX text, accessible attributes,
  placeholders, options, titles, and user-facing configuration arrays.

The visible-string audit uses a narrow explicit allowlist for brand names,
formats, identifiers, dimensions, shortcuts, and other intentional technical
tokens. Tests, developer galleries, class names, selectors, internal codes, and
non-user-facing diagnostics are not treated as product copy. The audit may not
be weakened with a broad directory or string-pattern exemption.

Changed-package TypeScript checks, focused Vitest, lint, policy tests, and
`git diff --check` are required source gates. Build, dev server, browser,
Playwright, screenshots, and packaged-runtime checks remain separately gated by
the repository rule and require explicit current-turn approval.

## Browser acceptance

After source gates and independent review, a separately approved browser pass
must traverse every formal production route and interactive dialog in Chinese
and English. It checks:

- Chinese is the initial locale;
- the switch updates current UI without reload or state loss;
- switching back restores Chinese copy;
- normal Studio and Web Demo use their distinct persistence policies;
- no unapproved visible English remains in Chinese mode;
- no missing or placeholder text appears in English mode;
- keyboard focus and screen-reader names remain coherent;
- narrow layouts, long English copy, Chinese wrapping, error states, WebGL
  fallback, and export-disabled states remain usable.

The browser pass is evidence for the tested browser and machine only. It is not
automatically authorized by this design document.

## Risks and controls

- **Scattered raw strings:** controlled by domain migration batches and a
  production visible-string policy test.
- **Data mutation during translation:** controlled by stable-ID display mapping
  and tests asserting snapshots and commands are byte-for-byte unchanged.
- **Web Demo storage regression:** controlled by dependency-injected preference
  adapters and the existing empty-storage acceptance boundary.
- **Inconsistent Chinese terminology:** controlled by the committed glossary
  and a human editorial review, not merely character-presence assertions.
- **Layout regressions:** controlled by long-copy component tests followed by a
  separately approved real-browser pass.
- **App/package dependency inversion:** controlled by passing translated labels
  down or stable reason IDs up; workspace packages never import Studio i18n.

## Non-goals

This phase does not:

- translate user-authored content or project files;
- add machine translation or a remote translation service;
- infer language from the browser or operating system;
- add locales other than Simplified Chinese and English;
- localize developer galleries, test fixtures, internal logs, the portable host
  console, or distribution documents;
- change project schema, native DTOs, command IDs, renderer ownership, export
  capability, or Web Demo persistence;
- claim browser or visual evidence before that work is explicitly approved and
  actually run.

## Definition of done

The bilingual UI phase is complete only when:

1. every in-scope production surface obtains user-facing copy from the typed
   catalogue or a documented stable-ID display mapping;
2. Chinese is the default and reads naturally under the approved glossary;
3. English is complete and can be selected without state loss;
4. normal Studio remembers the selection while Web Demo remains memory-only;
5. project data and durable behavior remain unchanged;
6. catalogue, policy, component, persistence, accessibility, error, and state
   preservation gates pass;
7. an independent specification/code review finds no unresolved Critical or
   Important issue;
8. a separately authorized browser pass covers all formal interactive pages;
9. documentation reports only evidence that was actually run.

## Design exclusions and current worktree

This design does not authorize product implementation, build, dev, browser,
debug, or packaged-runtime execution. Those steps require an approved
implementation plan and the repository's normal current-turn permissions.

The pre-existing protected working-copy changes in
`crates/asset-io/Cargo.toml`, `crates/desktop-host/Cargo.toml`, and
`packages/mode-showroom/src/index.ts` remain outside this work and must not be
staged, restored, modified, or committed by localization tasks.
