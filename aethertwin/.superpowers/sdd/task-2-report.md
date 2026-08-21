# Task 2 report

## RED

Added focused tests for safe localized errors, canonical Web Demo display-name IDs, and stable project-name validation IDs. Ran:

`pnpm.cmd vitest run apps/studio/src/i18n/localized-error.test.ts apps/studio/src/web-demo/web-demo-display-name-ids.test.ts apps/studio/src/features/project-center/project-center.test.tsx apps/studio/src/features/project-center/create-project-dialog.test.tsx apps/studio/src/web-demo/web-demo-app.test.tsx apps/studio/src/app.test.tsx`

RED result: the two new modules were absent (`0 test` suites) and all seven new project-name validation cases failed because the existing function returned localized object results instead of the required stable reason IDs. Existing jsdom canvas warnings were also emitted.

## Implementation

- Added safe code-to-descriptor mapping for every required stable error code. Raw messages, details, paths, and stacks are not rendered; only a conservative diagnostic reference is separately available.
- Added bilingual Project Center, dialog, bootstrap, and Web Demo descriptors. Error state stores descriptors/codes rather than translated sentences.
- Added the ready-editor-only Web Demo display-name provider and stable canonical kind/id map; unknown records return authored fallback.
- Changed project-name validation to `ProjectNameValidationReason | null`, rendering dialog validation descriptors at render time.
- Narrow approved exception: adapted `features/plan-editor/plan-inspector.tsx`, the direct existing consumer of the validation result. Without this change TypeScript failed and valid project-name commits would be rejected at runtime. No unrelated inspector localization was changed.

## Verification

- GREEN command (same exact Vitest command above) was invoked twice after implementation. The desktop harness stops returned output at its 30-second cap and did not return a final exit status; the final invocation emitted only pre-existing jsdom `HTMLCanvasElement.getContext` warnings and no failing test lines before cutoff.
- `pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit`: PASS (exit code 0).
- `git diff --check`: no whitespace errors; Git emitted only CRLF conversion warnings.

## Scope and self-review

- Protected existing changes in `crates/asset-io/Cargo.toml`, `crates/desktop-host/Cargo.toml`, and `packages/mode-showroom/src/index.ts` were not touched or staged.
- No manifests, lockfiles, Rust/native contracts, build, dev, preview, browser, screenshot, WebGL, or debug commands were run.
- Reviewed the staged Task 2 path set only; the only out-of-list source path is the explicitly approved direct validation consumer described above.

## Concern

Initial exact-suite output exceeded the host cap because `project-center.test.tsx` still had legacy localized selectors; each Testing Library mismatch printed a full DOM snapshot. Isolated runs proved all other focused files passed. Migrating those assertions to the approved localized safe-copy contract restored a final exact-suite result: **6 files passed, 216 tests passed, exit code 0, 20.94s**.

During the migration, the existing spoofed-backend-error test exposed a real regression: `localizedErrorLogRef` accepted a structurally spoofed `logRef`. The narrow approved fix now accepts log references only from a `ProjectBackendError` instance; the focused test retains both the safe known-code descriptor assertion and the spoofed-reference redaction assertion.

Final checks: `pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit` passed (exit code 0); `git diff --check` passed with only CRLF warnings.

## Review fixes

- Known stable error codes now always resolve to a non-generic safe descriptor; `error.generic` is reserved for unknown codes. The table test asserts this for every listed code while retaining redaction checks.
- Replaced remaining Project Center presenter literals, count suffix, and persisted profile badges with catalogue-rendered labels. The Web Demo display-name provider remains ready-editor-only; individual editor surface consumption is explicitly deferred to Task 4 and later workflow tasks.

### Final review verification

- Added separate desktop and sandbox card-kicker catalogue entries so the visible state remains semantically correct in both Chinese and English. Project Center regression coverage switches to English with keyboard focus retained and asserts all four catalogue-rendered kickers plus the pluralized count.
- Added Web Demo loading and error regressions: each keeps focus on the language selector after switching, updates the visible localized status/alert, and confirms `loadSeed` is still called once (the failed operation is not repeated without Retry).
- Exact command: `pnpm.cmd vitest run apps/studio/src/i18n/localized-error.test.ts apps/studio/src/web-demo/web-demo-display-name-ids.test.ts apps/studio/src/features/project-center/project-center.test.tsx apps/studio/src/features/project-center/create-project-dialog.test.tsx apps/studio/src/web-demo/web-demo-app.test.tsx apps/studio/src/app.test.tsx` — passed, 6 files / 219 tests, exit 0. The expected jsdom canvas notices were emitted but did not affect results.
- `pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit` — passed, exit 0. `git diff --check` — passed, exit 0 (only repository line-ending warnings).
- Scope/self-review: staged only Task 2 i18n, Project Center/Create Dialog, Web Demo test, approved Plan Inspector compatibility work, and this report; protected manifests, lockfiles, and unrelated worktree changes remain unstaged. Build, dev, preview, browser/debug, and WebGL gates remain explicitly skipped under project rules.

## Re-review fixes

- RED: the exact six-file command failed as intended with three focused gaps: canonical display-map coverage lacked the eight canonical door/window records; their translated descriptors were unavailable; and the Chinese Project Center eyebrow still rendered `灵境孪生` rather than the locked `AetherTwin` brand. The same red coverage also required the disabled sandbox field to use catalogue copy instead of raw `sandbox`.
- Canonical Web Demo coverage now derives its expected kind/id list directly from every supported editor-visible named record collection in the canonical snapshot (project, floors/layers, plan reference, entities including doors/windows, product content, media assets, routes, guided route, and materials). It asserts exact coverage, descriptor translations for a door and material, snapshot deep equality, and null resolution for an unknown same-shaped authored record.
- The approved Plan Inspector compatibility exception now stores `ProjectNameValidationReason | null` and formats its stable descriptor at render. Its nearest regression wraps the Inspector with the normal locale provider, creates a reserved-name validation error, switches locale, and verifies the retained error re-renders in English. The ready Web Demo provider scope remains unchanged; editor-surface consumption remains deferred to Task 4/later workflow work.
- The Chinese eyebrow now preserves `AetherTwin`; the disabled sandbox location presents the localized `演示沙盒`/`Demo sandbox` descriptor while the create call continues to omit a sandbox location. Repeated profile/backend display branches use exhaustive stable-value-to-message-ID records; persisted/action values remain unchanged.
- GREEN: exact six-file command passed, **6 files / 220 tests**, exit 0 (expected jsdom canvas notices only). Nearest Inspector test passed, **1 file / 113 tests**, exit 0. `pnpm.cmd exec tsc -p apps/studio/tsconfig.json --noEmit` and `git diff --check` both passed, exit 0 (only CRLF warnings).
- Protected files, manifests, lockfiles, build/dev/preview/browser/debug/WebGL commands remain untouched/skipped.
