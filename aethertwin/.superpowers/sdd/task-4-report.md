# Task 4 evidence

## RED

Command:

`pnpm.cmd vitest run apps/studio/src/features/plan-editor/plan-inspector.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx`

The newly added English inspector test failed before implementation because the project heading remained Chinese. The initial run also exposed the test environment declaration that was then added before the behavior assertion could run.

## Implementation

- Added typed inspector catalogue entries in both locales.
- Made profile, entity type, space-unit, fixture, POI, opening, media, and route-node maps exhaustive stable-value maps.
- Localized PlanInspector render-boundary headings, labels, actions, metadata, statuses, safe notices, and validation messages.
- Applied `useDisplayName` only at floor, layer, entity, and layer-option presentation boundaries; authored input values and option values remain unchanged.

## GREEN / verification

- `pnpm.cmd vitest run apps/studio/src/features/plan-editor/plan-inspector.test.tsx` passed: 1 test passed. The runner emitted the existing jsdom canvas/Three warnings.
- The required combined Vitest command was invoked after implementation, but the harness returned only its startup/canvas-warning output before its 30-second command window closed; no complete final suite result was captured.
- `pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit` exited successfully with no output.
- `git diff --check` exited successfully; Git emitted only LF-to-CRLF working-copy warnings, including pre-existing modified protected files.
- No build, dev server, preview, browser, debug, or WebGL validation was run, as required by the project rules.

## Follow-up verification

- The earlier incomplete combined-command capture was diagnosed with a hidden process and temporary log. It was a real two-assertion failure in `plan-editor.test.tsx`, not an output limit: old assertions expected the raw `showroom` and `display-case` values after Task 4 deliberately localized those presentation values.
- Updated only those Task 4 integration assertions and added bilingual direct-inspector coverage for project, floor, layer, entity, multi/empty, and stale plan-reference/opening/entity contexts, plus the Web Demo presentation resolver/authored input boundary.
- Final exact combined command, captured to the temporary log, passed: `2` test files, `132` tests, exit `0`, duration `29.50s`.
- Final `pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit` exited `0`.
- Final `git diff --check` exited `0`; only LF-to-CRLF warnings were emitted.

## Review fixes

- Localized the valid Reference image and Opening selected inspectors, preserving authored editable values, option values, IDs, and mutation records.
- Opening-kind option labels consume `OPENING_KIND_MESSAGE_IDS`; their `door`/`window` values remain stable.
- Removed the definition-only media-kind map because no Task 4 inspector surface displays media kind; its later owner is the product-content/media workflow.
- Replaced the raw unavailable-reference-mutation throw with a locale-safe error reported through the existing error boundary.

## Final verification

- The exact combined Task 4 Vitest command passed: 2 test files and 132 tests, exit 0 (28.26s). Existing jsdom canvas/Three warnings remained non-fatal.
- `pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit` completed with exit 0.
- `git diff --check` completed with exit 0; only line-ending warnings were emitted.

## Closure fixes

- Added typed `inspector.referenceX` and `inspector.referenceY` labels and consumed them at the reference inspector accessibility boundary.
- Added direct PlanInspector valid reference-image/opening tests in both locales. Final exact combined gate: 2 files, 136 tests passed, exit 0 (28.63s).

## Test-only closure

- Added PlanInspector-level in-place locale-switch tests for valid reference-image and opening selections. They retain the same context IDs and unsaved form state while asserting raw callback IDs, `door` kind, and numeric values. Focused test: 24 passed.

## Post-closure gates

- Exact Task 4 combined Vitest: 2 files, 138 tests passed, exit 0 (33.02s).
- Studio `tsc --noEmit`: exit 0.
- `git diff --check`: exit 0.
