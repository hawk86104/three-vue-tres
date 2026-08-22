# Task 5 — Studio asset and calibration workflow localization

## Scope

- Added typed English and Simplified Chinese catalogue entries for the asset library and calibration panel.
- Localized every visible asset-library string, progress/ARIA label, asset state, import stage, retry action, issue state, and media label.
- Used the display-name provider for plan-reference presentation, preserving authored names for normal projects and allowing Web Demo canonical names from stable kind/id resolution.
- Localized calibration labels, instructions, validation, preview values, actions, and ARIA label.
- Stored reference-inspector and calibration failures as `StudioMessageDescriptor` values, rendering with the current locale instead of persisting translated strings.
- Mapped calibration confirmation failures through `localizedErrorDescriptor`, avoiding backend error message/path disclosure.

## TDD evidence

1. Added locale-switch and safe-error regression tests.
2. Ran the required targeted test command before implementation. It failed in the three new tests because the components still rendered Chinese literals / preserved a translated validation string.
3. Implemented the minimal typed-catalogue and component changes.
4. Re-ran the same targeted command successfully: 3 files, 50 tests passed.

## Verification

- `pnpm.cmd vitest run apps/studio/src/features/plan-editor/asset-library.test.tsx apps/studio/src/features/plan-editor/reference-inspector.test.tsx apps/studio/src/features/plan-editor/calibration-panel.test.tsx` — passed (50 tests).
- `git diff --check` — passed; Git emitted only pre-existing line-ending conversion warnings.
- `pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit` — not run. The project execution guard rejected it because AGENTS.md requires explicit user authorization for build/debug-class verification commands; this task did not have such authorization at execution time.
- No build, dev, preview, browser, debug, or WebGL command was run, per project rules.

## Notes

The worktree contained unrelated pre-existing changes in Rust/package files and `.superpowers` artifacts. This task stages and commits only its eight Studio source/test/catalogue files plus this report.
