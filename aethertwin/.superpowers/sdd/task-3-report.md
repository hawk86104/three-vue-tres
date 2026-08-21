# Task 3 report

## RED proof

- `pnpm.cmd vitest run packages/editor-shell/src/editor-shell.test.tsx apps/studio/src/i18n/display-message-ids.test.ts apps/studio/src/features/plan-editor/plan-toolbar.test.tsx apps/studio/src/features/plan-editor/floor-tree.test.tsx apps/studio/src/features/plan-editor/plan-accessibility.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx` failed as intended: the display-ID module was absent and English caller/catalogue assertions rendered the previous Chinese literals.
- `node --test tests/visible-actions.test.mjs` failed as intended: the legacy policy depended on Chinese source literals instead of stable action IDs and handlers.

## Scope and design

- EditorShell receives caller-owned profile, region, status, action strings and renders the language selector header accessory without Studio i18n ownership.
- Stable profile, Showroom group/action, and Task-3-surface kind maps use exhaustive `satisfies Record<union, StudioMessageId>` coverage. Project/floor/layer names remain authored data.
- Toolbar, tree, accessibility text, ARIA labels, and status text read the Task 1 translator. Stable IDs remain action lookups and React keys. The locale switch only re-renders presentation; it does not recreate store/session or reset selection.
- The visible-actions policy now checks approved stable IDs/order and live callback wiring, not localized source literals.

## Final verification

- Exact Vitest command: PASS — 6 files, 146 tests, 29.97s. The desktop command-output window is limited to 30 seconds, so the exact command was run hidden from the declared worktree with output captured only in temporary files.
- `node --test tests/visible-actions.test.mjs`: PASS — 2 tests, 0 failures.
- `pnpm.cmd exec tsc -p packages/editor-shell/tsconfig.json --noEmit`: PASS — exit 0.
- `pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit`: PASS — exit 0.
- `git diff --check`: PASS — exit 0; only CRLF conversion warnings.

## Self-review and protected state

- Reviewed the scoped diff for typed message lookups, unchanged stable IDs and authored names, and no descriptor/default-name presentation use in Task 3 surfaces.
- Protected pre-existing dirty files `crates/asset-io/Cargo.toml`, `crates/desktop-host/Cargo.toml`, and `packages/mode-showroom/src/index.ts` were not modified or staged. Manifests, lockfiles, and Cargo protected files were untouched.
- Build/dev/preview/browser/debug/WebGL verification was skipped, as required by the project rules.

## Controller review fix (Task 3)

### RED and scope

- Focused RED covered every runtime kind-map key, Showroom `room`/`recognize-rooms` action IDs, English fixture/POI accessibility output, and the omitted reference-handler branch. It failed before the new entity/opening maps and rendered toolbar IDs existed.
- The fix localizes Task-3-owned accessibility fixture details, room candidates, entity/POI/fixture semantics, route nodes, plan references, and openings; authored names and reference IDs, measurements, and numeric values remain data.
- FloorTree now translates reference/entity/route semantics and ARIA labels with typed maps. Reference and route-node controls are omitted when their live callbacks are absent; no silent no-op target remains.
- PlanEditor localizes only its sidebar tabs/ARIA. Verified exclusions: Task 8 export disabled/reason/canvas/renderer copy; Task 6 opening-preview/spatial workflow; Task 7 route/content workflow; Task 5 asset workflow; and Task 4 Inspector UI were not changed.
- Showroom tool callbacks still receive their original `PlanTool` (including internal `space-unit`); only the presentation `data-action` maps it to canonical `room`. The special recognizer is `recognize-rooms`. The policy now checks declared/rendered IDs and real callback paths without translated literals.

### Review-fix verification and self-review

- Focused added-test command: PASS — 4 files, 18 tests, 1.60s.
- Focused live switch command: PASS — 1 test (113 skipped), 2.69s. It verifies English-to-Chinese in-place switching with authored floor/layer identity, the ongoing wall tool, and LanguageSwitcher focus retained.
- Exact required Vitest command: PASS — 6 files, 149 tests, 29.66s, exit 0 (temporary-only output capture used for the desktop 30-second output limit).
- `node --test tests/visible-actions.test.mjs`: PASS — 2 tests, 0 failures, exit 0.
- Both required TypeScript commands: PASS — exit 0. `git diff --check`: PASS — exit 0; only CRLF conversion warnings.
- Self-review confirmed only Task 3 files and this requested report are staged; protected dirty Cargo files, mode-showroom source, manifests, and lockfiles remain unstaged. Build/dev/preview/browser/debug/WebGL gates remain skipped by project rule.

## Final controller verification fix

### RED and implementation

- Focused RED failed at both FloorTree and PlanAccessibility display boundaries because `space-unit` resolved through the generic entity type map rather than `SPACE_UNIT_KIND_MESSAGE_IDS`. The restored policy RED also caught overly narrow source parsing before its semantic assertions were made declaration-aware.
- Both boundaries now narrow `space-unit` before generic entity lookup and render its stable kind through `SPACE_UNIT_KIND_MESSAGE_IDS`. Tests exercise all six keys in both English and Chinese, preserve authored names, and resolve every map value through both runtime catalogues.
- `EditorShellMessages.save` and `.close` are required caller-owned values. Their former save-state/back fallbacks are removed; Chinese defaults and independently supplied English caller strings are exercised.
- The stable action policy retains Task 3 action-ID/order/data-action assertions and restores semantic callback/boundary guards: foundational actions, PlanTool-to-session path, Player/Market exclusions, import/calibration/deferred exclusions, fixture and recognition callbacks, contextual/Preview routes, and forbidden later handlers. It does not rely on localized source literals.

### Final verification

- Focused added coverage: PASS — 4 files, 28 tests, 1.23s; policy: PASS — 8 tests, 0 failures.
- Exact required Vitest command: PASS — 6 files, 154 tests, 30.17s, exit 0 (temporary-only output capture due the desktop output limit).
- Both required TypeScript commands: PASS — exit 0. `git diff --check`: PASS — exit 0 with only CRLF conversion warnings.
- Task 5–8-owned surfaces, renderer-status colon text, protected files/manifests/lockfiles, and cached/untracked review state were not changed. Build/dev/preview/browser/debug/WebGL remain skipped by project rule.
