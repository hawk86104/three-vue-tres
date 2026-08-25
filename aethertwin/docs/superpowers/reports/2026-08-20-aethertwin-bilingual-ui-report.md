# AetherTwin bilingual Studio UI — source closure report

Date: 2026-08-25

## Delivered behavior

- Simplified Chinese is the default. English is available from the visible
  project-centre, Web Demo loading/error, and editor-header selectors.
- Normal Studio persists the selection with
  `aethertwin.studio.locale.v1`; a missing, malformed, unreadable value, or a
  storage read exception starts in Simplified Chinese. If a write fails, the
  current document keeps the selected locale; a later refresh reads the stored
  value if available, otherwise it uses the Simplified-Chinese default.
- Web Demo and portable preview use memory-only locale state. They neither read
  nor write browser persistence and reset to Simplified Chinese on refresh or a
  new session.
- Localized copy is presentation-only. Authored names, stable IDs, paths,
  command payloads, persisted records, and operation lifecycle state are not
  translated or mutated.
- Known stable errors use safe bilingual descriptors. Unknown errors use the
  generic fallback. Raw error messages, code details, paths, stacks, and
  untrusted diagnostic references are not rendered.
- Developer galleries, test fixtures, internal logs, and the portable-host
  console are excluded from the product-copy migration.

## Final non-build source gate

All commands ran from `aethertwin/` in this exact order and exited 0:

1. `node --test tests/localization-policy.test.mjs tests/visible-actions.test.mjs tests/web-demo-policy.test.mjs tests/offline-source-policy.test.mjs` — 37/37 passed.
2. The Task 10 focused `pnpm.cmd vitest run` command over 32 specified files — 32/32 files and 586/586 tests passed.
3. `pnpm.cmd exec tsc -p packages/editor-shell/tsconfig.json --noEmit` — passed.
4. `pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit` — passed.
5. `pnpm.cmd lint` — passed.
6. `git diff --check` — passed.

Recorded non-failing warnings: JSDOM reports that `HTMLCanvasElement.getContext`
is not implemented without the optional canvas package; the asset-library test
reports multiple Three.js instances; and Git reports existing LF-to-CRLF working
copy notices. These are source-test/environment notices, not browser, GPU, or
visual evidence.

## Review-fix closure

Independent review found that project-name and project-tag save notices still
kept raw backend messages and accepted any non-empty diagnostic reference.
Their local state now retains only a localized descriptor and the existing
validated `ProjectBackendError` reference. Secret-bearing, distinct
`COMMIT_FAILED` name/tag failures prove that each field retains its own
`aria-invalid`, description, action count, save state, and trusted reference
without rendering message, details, or path content.

The localization policy now traces visible error sources through simple
initializers, parenthesized expressions, conditional branches, and binary
concatenation. Adversarial fixtures cover each route. Review also strengthened
room diagnostics so both list items must stay generic and code-free, corrected
the locale read/write distinction above, and restored the README heading's
section ownership.

The final Important follow-up found that visible static copy could bypass the
scanner through a `const` alias. A RED fixture proves the exact
`const copy = "Untranslated"; <button>{copy}</button>` escape, plus static
parenthesized, conditional, and concatenated branches. A final scope review
then found the first resolver used a file-global name map, which could confuse
same-name declarations. Static visible JSX now resolves the nearest lexical
binding only: const literal/template provenance is followed through those
static expression shapes, while every other lexical value binding is a
non-followable shadow barrier. This includes parameters, `let`, `var`,
function, class/enum, catch, and import bindings, plus arbitrary dynamic or
user-data identifiers. RED fixtures cover parameter, `let`, `var`, function,
class, import, and sibling/nested dynamic/static shadows. The raw error-flow
scanner remains separate. The complete source gate below was rerun after this
repair.

During final-gate closure, stale test contracts that expected raw internal
errors/codes were migrated to assert the approved safe fallback while retaining
their action-count, callback, state, ID, and payload assertions. The synthetic
`COMMIT_FAILED` test code is absent from the stable backend-code inventory and
is explicitly covered as an unknown error using the generic safe fallback.

## Scope checks

Before staging this report and the closure documentation, protected files,
manifests, and lockfile were inspected with:

```text
git diff -- packages/mode-showroom/src/index.ts crates/asset-io/Cargo.toml crates/desktop-host/Cargo.toml package.json pnpm-lock.yaml
git diff --cached --name-only
```

The pre-existing protected working-tree markers remain excluded. No dependency,
manifest, lockfile, build artifact, or browser-cache change is part of this
rollout; the index was empty before staging Task 10 files.

## Explicitly not run

Under the repository rule, this closure did **not** run a build, dev server,
preview/localhost server, browser automation, Playwright, screenshot, WebGL,
portable-package build, or packaged-runtime acceptance. Source gates are not
visual or browser proof. A future acceptance operator needs fresh explicit
approval naming the intended browser or portable environment before executing
that work.
