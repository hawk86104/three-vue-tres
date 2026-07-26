# H03 implementer report

## Scope
- Updated only the approved TypeScript and Rust scene defaults plus the v3 fixture.
- Added exact approved-environment assertions for TypeScript new-project, v2 migration, fixture parity, Rust serialization, v1/v2 migration, new-project, and public recovery.

## TDD evidence
- RED command: `pnpm.cmd vitest run packages/core-model/src/core-model.test.ts`
- RED result: 4 failed / 89 passed because the old default was `#10151c`, `#ffffff`, `0.6`, `1`, and `[-0.5, -1, -0.5]` rather than the approved values.
- RED command: `cargo test -p project-io --test contract_fixture; cargo test -p project-io --test commit_recovery`
- RED result: contract fixture failed 1/6 and recovery failed 4/39; each failure compared the old provisional environment to the approved exact values.

## GREEN verification
1. `pnpm.cmd vitest run packages/core-model/src/core-model.test.ts` ? 93 passed.
2. `pnpm.cmd exec tsc -p packages/core-model/tsconfig.json --noEmit` ? exit 0.
3. `cargo test -p project-io --test contract_fixture` ? 6 passed.
4. `cargo test -p project-io --test commit_recovery` ? 39 passed.
5. `cargo check -p project-io` ? exit 0.
- `git diff --check` ? exit 0.

## Self-review
- Changed neither schema version, validation ranges, persisted names, sequences/checkpoints, nor v1/v2 fixtures.
- The only production behavior is the default used for new and v1/v2-migrated v3 snapshots; v3 parsing/migration behavior is unchanged.
- Existing validation remains untouched, so arbitrary valid user-edited environment values remain accepted.

## Skipped verification
- Per workspace rules, no build, dev, debug, browser, Playwright, packaging, runtime, or screenshot command was run.
