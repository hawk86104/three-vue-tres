# AetherTwin M2.1 evidence report

Date: 2026-07-29

## Result

M2.1 and Task 14 are accepted. The user explicitly waived the environment-limited Windows reparse test on 2026-07-29; the test is not claimed as passing. The implemented vertical path is:

```text
native or sandbox import
  -> canonical immutable asset bytes
  -> AssetRecord + initial PlanReference transaction
  -> verified asset source
  -> Pixi reference rendering
  -> selection/placement/edit/lock
  -> two-point calibration
  -> undo/redo
  -> checkpoint + close/reopen + recovery
```

The supported native media set is PNG, JPEG, sanitized SVG, MP4, and WebM. Plan references accept only PNG, JPEG, and sanitized SVG. Persisted asset identity is always `assets/sha256/<first-two-hex>/<sha256>.<canonical-extension>`; source paths, filenames, remote URLs, `file://`, traversal, and backslashes are not persisted.

## Executed final validation

| Command | Actual result |
| --- | --- |
| `pnpm.cmd lint` | pass |
| `pnpm.cmd typecheck` | pass across 10 workspace projects |
| focused M2.1 `pnpm.cmd vitest run ...` | 10 files, 392 tests passed |
| four Node policy tests | 24 passed |
| `cargo fmt --all -- --check` | pass |
| `cargo test -p asset-io` | 42 passed, 1 pre-existing privileged Windows test ignored by default |
| `cargo test -p project-io` | 88 passed |
| `cargo test -p desktop-host` | 50 passed |
| `cargo check -p asset-io -p project-io -p desktop-host` | pass |
| M21-14R1 focused Vitest | 4 files, 207 tests passed |

Task 14 added two Studio cases; the entire modified integration file passed 3/3, including one pre-existing M1 case. The two newly created Rust test files passed their bounded scopes: project-io schema/recovery 3/3 and desktop-host sequential asset lifecycle/policy 2/2. They are not the sole evidence for the full matrix.

The complete Rust crate runs additionally executed the existing focused tests for migration rollback (`automatic_v2_upgrade_database_failure_restores_the_old_coherent_pair`, `public_recovery_upgrade_database_failure_restores_exact_old_pair`, and manifest-sync rollback), active cancellation and cancel/complete races, close waiting/cache invalidation, verified owner-bound resolution, corrupt-byte refusal, GET/HEAD, and single-range/416 behavior. The Task 14 Studio case drives PNG/JPEG/SVG import, project-tree selection, Inspector placement, two-point calibration, locking, undo/redo, checkpoint, and close through the real PlanEditor UI. Reopen and resolution run through the owning ProjectStore/backend boundary, after which a remounted PlanEditor verifies renderer input. Missing/corrupt placeholders, source-failure handling, accessibility, and Asset Library repair remain covered by the full Task 10-13 Studio/Pixi focused suites.

## Failures found and resolved

- Node policy RED exposed three stale M1 assumptions: only two Rust crates, six invokes, and a broad preview-label ban. Tests were updated to the implemented M2.1 contract; final result is 24/24.
- Studio integration RED exposed a test-realm `Blob` mismatch and a `.jpeg` fixture inconsistent with the canonical `.jpg` extension. The fixtures were corrected; no production behavior changed.
- The combined Studio UI test initially kept PlanCanvas mounted during each import, causing repeated renderer lifecycle work in jsdom, and then assumed the project tree remained visible after import. The bounded fixture now uses the real PlanEditor controls with an inert editing workspace, switches back from Asset Library to Project Tree, and mounts PlanCanvas after reopen for renderer verification; no production behavior changed.
- Project recovery RED exposed a missing normalized `index` in the new test inverse patch. The fixture now follows the exact `snapshot.records.patch` journal contract; no production behavior changed.
- Desktop lifecycle RED attempted to serialize an input-only DTO. The test now sends the real camelCase IPC JSON shape; no production behavior changed.
- Initial `cargo fmt --check` reported only the two new Rust test files. `cargo fmt --all` normalized them and the check then passed.
- Initial lint reported 10 committed M2.1 baseline errors. The separate repair commit `2041e8ee` intentionally adds observable `Error.cause` diagnostics while preserving messages/control flow, removes unused test values, and replaces control-character regex ranges with an equivalent code-point check. Lint, typecheck, and 207 related tests passed afterward.

## Environment-limited test

`rejects_reparse_sources_on_privileged_windows_lane` is marked ignored in the normal `asset-io` suite because it requires Windows symlink/reparse privilege. It was explicitly attempted both in the sandbox and outside it; both attempts failed before the product assertion with `privileged Windows reparse fixture unavailable`. The deterministic reparse-bit classification unit test passed. This is an environment limitation, not a claimed passing test. The user explicitly waived this environment-only gate on 2026-07-29, allowing Task 14 acceptance without changing the test result.

## Policy and security boundary

- Native application commands are exactly eight: create, open, commit, checkpoint, close, recover, import asset, and cancel import.
- Asset reads use the `aethertwin-asset` custom protocol and verified handles; there is no read-file invoke.
- The `main` window retains exactly `core:window:default` and `dialog:allow-open`; no broad filesystem, shell, HTTP, or SQL permission was added.
- CSP permits only the local custom asset scheme for image/media sources and retains `object-src 'none'`.
- Native errors keep the safe `{ code, message, details, logRef }` envelope and do not expose native source paths or OS/SQL details.

## Explicitly not run

Per project rules and the user's Task 14 approval boundary, this report does not include build, dev, debug, local server, browser, Playwright, packaging, packaged runtime, screenshot, real GPU, or visual-performance execution. No claim is made for those surfaces.

## Next step

Task 14 is accepted under the explicit Windows privilege-test waiver. M2.2 is next and still requires a higher-reasoning design/plan pass before implementation.
