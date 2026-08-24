# Task 5 — Studio asset and calibration workflow localization

## Scope

- Added typed English and Simplified Chinese catalogue entries for the asset library and calibration panel.
- Localized every visible asset-library string, progress/ARIA label, asset state, import stage, retry action, issue state, and media label.
- Used the display-name provider for plan-reference presentation, preserving authored names for normal projects and allowing Web Demo canonical names from stable kind/id resolution.
- Localized calibration labels, instructions, validation, preview values, actions, and ARIA label.
- Stored reference-inspector and calibration failures as `StudioMessageDescriptor` values, rendering with the current locale instead of persisting translated strings.
- Mapped calibration confirmation failures through `localizedErrorDescriptor`, avoiding backend error message/path disclosure.
- Review correction: real plan-reference import and cancellation failures now retain a typed safe descriptor and diagnostic reference in `PlanEditor` state. `ErrorNotice` formats that descriptor and its diagnostic label at render time, so an in-place locale change updates existing failure UI without exposing a backend path.

## TDD evidence

1. Added locale-switch and safe-error regression tests.
2. Ran the required targeted test command before implementation. It failed in the three new tests because the components still rendered Chinese literals / preserved a translated validation string.
3. Implemented the minimal typed-catalogue and component changes.
4. Re-ran the same targeted command successfully: 3 files, 50 tests passed.
5. Added real import and cancellation integration failures using secret-bearing `ProjectBackendError` values. The two new tests first failed because `PlanEditor` stored a Chinese preformatted `Error`, then passed after the descriptor-state correction.

## Verification

- `pnpm.cmd vitest run apps/studio/src/features/plan-editor/asset-library.test.tsx apps/studio/src/features/plan-editor/reference-inspector.test.tsx apps/studio/src/features/plan-editor/calibration-panel.test.tsx` — passed (50 tests).
- `git diff --check` — passed; Git emitted only pre-existing line-ending conversion warnings.
- `pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit` — not run. The project execution guard rejected it because AGENTS.md requires explicit user authorization for build/debug-class verification commands; this task did not have such authorization at execution time.
- No build, dev, preview, browser, debug, or WebGL command was run, per project rules.

### Review correction verification

- `pnpm.cmd vitest run apps/studio/src/features/plan-editor/asset-library.test.tsx apps/studio/src/features/plan-editor/reference-inspector.test.tsx apps/studio/src/features/plan-editor/calibration-panel.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx` — passed (4 files, 166 tests).
- `pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit` — attempted again and blocked by the AGENTS.md authorization gate; not bypassed.
- `git diff --check` — passed; Git emitted only line-ending conversion warnings.

### Second review correction verification

- TDD: changed the real import and cancel `ProjectBackendError` integration paths to carry `log-secret=E:\\private\\plans\\sensitive-floor.png`. The focused asset-library run failed first (2 failures) because the raw diagnostic reference was rendered.
- `PlanEditor` now accepts diagnostic references only when they match the same stable identifier allow-list. Backend failures use only `localizedErrorLogRef`; no raw fallback remains. The integration assertions confirm the secret-bearing log reference, its path, and its secret are absent before and after an in-place English locale switch, while the English descriptor is presented.
- `pnpm.cmd vitest run apps/studio/src/features/plan-editor/asset-library.test.tsx apps/studio/src/features/plan-editor/reference-inspector.test.tsx apps/studio/src/features/plan-editor/calibration-panel.test.tsx apps/studio/src/features/plan-editor/plan-editor.test.tsx` — passed (4 files, 166 tests).
- `pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit` — attempted at the reviewer's request but rejected by the AGENTS.md authorization gate; not bypassed.
- `git diff --check` — passed; Git emitted only line-ending conversion warnings.

## Notes

The worktree contained unrelated pre-existing changes in Rust/package files and `.superpowers` artifacts. The second review correction stages only the plan editor, asset-library test, and this report.
