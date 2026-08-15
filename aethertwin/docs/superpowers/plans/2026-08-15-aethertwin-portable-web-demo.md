# AetherTwin Portable Web Demo Implementation Plan

> **For implementation workers:** Complete the tasks in order. Every source
> behavior change follows RED/GREEN TDD. Do not run any package build, browser,
> packaged-runtime, screenshot, GPU, dev, preview, or cleanup command until
> the current user grants fresh explicit approval.

**Goal:** Package the accepted local AetherTwin Web Demo as an internal Windows
10/11 x64 ZIP that needs no Node.js, pnpm, or installer on the target machine.

**Authority:** `docs/superpowers/specs/2026-08-15-aethertwin-portable-web-demo-design.md`

## Global constraints

- Keep the current in-memory canonical Showroom behavior unchanged: 2D, 3D,
  split, Back, refresh, restart, and desktop-only Export retain their accepted
  behavior and limitations.
- The ZIP is internal and unsigned. Edge and Chrome are the only browser
  baseline; do not claim Firefox, ARM64, macOS, code signing, or
  cross-device performance support.
- The host is a new standard-library-only Rust console executable. It does not
  link Tauri, serves only sibling `app/`, and accepts no arbitrary root or
  listen-address argument.
- The host binds only `127.0.0.1`, prefers `4173`, and falls back to an
  OS-assigned loopback port only when `4173` is occupied.
- Generated material is confined to ignored `artifacts/` and is never
  committed. Never stage or commit
  `crates/asset-io/Cargo.toml`, `crates/desktop-host/Cargo.toml`, or
  `packages/mode-showroom/src/index.ts`.
- The packaging entry point is exactly `pnpm.cmd package:web-demo:win-x64`.
- Each task ends with a focused gate, a scoped commit, and an independent
  review. Stop and repair any Critical or Important finding before the next
  task.

## Task 1 — Rust loopback host

**Create:** `crates/web-demo-host/` with a standard-library-only Cargo package,
host tests, and a workspace registration that introduces no Tauri dependency.

- [x] **RED — write focused host tests.** Cover fixed sibling `app/` discovery;
  binding `127.0.0.1:4173`; fallback to a loopback OS-assigned port after a
  controlled `4173` conflict; generated browser URL; nonfatal browser-open
  failure; GET and HEAD; bounded headers and read timeout; MIME allowlist;
  index no-store and hashed-asset immutable cache policy; all security headers;
  absent-file 404; method rejection; no directory listing or SPA fallback; and
  rejection of percent encoding, backslashes, drive paths, empty/dot/dot-dot
  segments, NUL, non-regular files, and canonical paths outside `app/`.
- [x] **Run RED exactly:**

  ```powershell
  cargo test -p aethertwin-web-demo-host
  ```

  Expected: fail because `aethertwin-web-demo-host` and its strict server contract do not
  yet exist.
- [x] **GREEN — implement the minimum host.** Use `std::net`, `std::fs`,
  `std::io`, `std::process`, and other Rust standard-library modules only.
  Resolve the executable's directory, canonicalize sibling `app/`, bind only
  loopback, try `4173` before port `0`, print the copyable URL, invoke the
  Windows default browser without accepting untrusted command arguments, and
  retain visible-console lifetime semantics. Implement exact static-response
  parsing and the design's headers/cache rules; do not add a generic static
  file server or Tauri linkage.
- [x] **Run GREEN exactly:**

  ```powershell
  cargo test -p aethertwin-web-demo-host
  cargo fmt --all -- --check
  cargo check -p aethertwin-web-demo-host
  ```

- [x] **Commit:** stage only Task 1 files and this plan checkbox update, then
  commit `feat: add the portable Web Demo loopback host`.
- [x] **Independent review:** verify source containment, request parsing,
  canonical-path checks, loopback-only binding, fallback behavior, headers,
  cache directives, visible-console semantics, browser-open failure handling,
  and absence of Tauri or non-standard-library dependencies.

## Task 2 — Node packaging assembler and policy

**Create:** a root package script, a Node-based package assembler under the
repository tooling boundary, and focused Node policy/assembler tests. The
assembler's fixed output contract is one internal ZIP whose root contains only
`AetherTwin-Preview.exe`, `app/index.html` plus relative assets, `README.txt`,
`BUILD_INFO.json`, `SHA256SUMS.txt`, and `THIRD_PARTY_NOTICES.md`.

- [x] **RED — write packaging/policy tests.** Cover the exact root script
  `package:web-demo:win-x64`; fixed payload names and no extra top-level files;
  relative references in `app/index.html`; host and app placement; deterministic
  metadata shape; SHA-256 coverage of every payload file; notices presence;
  rejected absolute/traversal input paths; ignored `artifacts/`; no committed
  package output; no Node/pnpm runtime requirement embedded in the ZIP; and no
  Tauri, remote service, `file://`, single-file HTML, Player, or publish
  surface introduced.
- [x] **Run RED exactly:**

  ```powershell
  node --test tests/portable-web-demo-policy.test.mjs tests/portable-web-demo-package.test.mjs
  ```

  Expected: fail because the assembler, script, and output-contract policy do
  not yet exist.
- [x] **GREEN — implement the assembler.** Add exactly
  `pnpm.cmd package:web-demo:win-x64` at the root. It invokes the approved
  existing Web-Demo build only as part of a separately approved package run,
  copies build output to `artifacts/` staging as sibling `app/`, copies the
  Windows host as `AetherTwin-Preview.exe`, writes the required text, build-info,
  license-notice, and SHA-256 files, validates the staged tree, and emits the
  ZIP. Do not commit any `artifacts/` contents and do not make packaging a
  hidden postinstall or ordinary test action.
- [x] **Run GREEN exactly:**

  ```powershell
  node --test tests/portable-web-demo-policy.test.mjs tests/portable-web-demo-package.test.mjs
  ```

- [ ] **Commit:** stage only Task 2 implementation, tests, and this plan
  checkbox update, then commit `feat: package the portable Web Demo`.
- [ ] **Independent review:** check fixed output shape, safe staging-path
  validation, hash manifest completeness, third-party notice derivation,
  no generated artifacts in Git, and the fact that the source tests do not
  masquerade as a produced or executed ZIP.

## Task 3 — Documentation, handoff, and source gates

**Modify:** `README.md`, `HANDOFF.md`, `PLANS.md`, license-policy material, and
the design/plan status only as supported by actual source evidence.

- [ ] **Document operating truth.** Explain the internal unsigned Windows
  10/11 x64 ZIP, no target-side Node/pnpm/installer, visible-console start,
  loopback URL and preferred/fallback ports, Edge/Chrome scope, close-to-stop
  behavior, browser-open failure handling, checksums, and all excluded
  surfaces. State that runtime acceptance has not run until freshly approved.
- [ ] **Update handoff and planning ledger.** Record the branch/head, exact
  source commands and results, independent-review findings, protected dirty
  files, generated-artifact policy, and the next explicit-approval runtime
  gate. Do not claim browser, package, or cross-device evidence.
- [ ] **Run full non-build source gates exactly:**

  ```powershell
  pnpm.cmd lint
  pnpm.cmd typecheck
  node --test tests/*.test.mjs
  pnpm.cmd vitest run
  cargo fmt --all -- --check
  cargo check -p aethertwin-web-demo-host
  cargo test -p aethertwin-web-demo-host
  git diff --check
  ```

  These gates are source-only and do not replace runtime acceptance. Record all
  exit codes and any warnings truthfully.
- [ ] **Commit:** stage only Task 3 files and this plan checkbox update, then
  commit `docs: hand off the AetherTwin portable Web Demo`.
- [ ] **Independent review:** confirm no unsupported runtime claim, no scope
  drift, all public instructions use the exact root packaging command, and the
  approvals boundary remains explicit.

## Task 4 — separately approved runtime acceptance

This task is prohibited until the user gives fresh, explicit approval for the
package build, ZIP extraction, browser inspection, and runtime interaction in
the current conversation. It must never be inferred from approval for the
source tasks.

- [ ] **Obtain explicit approval** for `pnpm.cmd package:web-demo:win-x64`,
  unzipping the produced ZIP, launching `AetherTwin-Preview.exe`, Edge/Chrome
  inspection, and cleanup of only the verified generated `artifacts/` paths.
- [ ] **Build and verify ZIP placement.** Run the exact root packaging command,
  verify its output lives under ignored `artifacts/`, and unzip to a newly
  created test path containing spaces and Chinese characters. Verify the fixed
  root layout, `app/index.html` relative assets, `BUILD_INFO.json`,
  `SHA256SUMS.txt`, and `THIRD_PARTY_NOTICES.md`.
- [ ] **Run with a restricted PATH.** Launch from the extracted directory with
  Node and pnpm unavailable on PATH. Exercise both the preferred `4173` port
  and a forced occupied-4173 fallback to an OS-assigned loopback port. Confirm
  the visible console prints a copyable URL; a browser-open failure, if
  injected, is nonfatal and leaves that URL usable.
- [ ] **Perform browser acceptance in Edge and Chrome.** Confirm the current
  canonical Showroom opens and its accepted 2D, synchronized 3D, and fixed
  split behaviors remain intact; Back, refresh, and restart reset it; Export
  remains desktop-only; browser storage is empty; requests are loopback or
  Blob-only; and no remote, `file://`, Player, publish, native-dialog, or
  browser-persistence surface appears.
- [ ] **Verify shutdown and integrity.** Close the console and prove the
  preview stops. Verify every entry in `SHA256SUMS.txt` against the extracted
  payload. Record only observed browser/console/network results and retain the
  Edge/Chrome, internal Windows x64 scope.
- [ ] **Clean up safely.** Remove only the explicitly resolved test extraction
  directory and the verified generated `artifacts/` material. Recheck Git to
  ensure generated files are neither tracked nor staged and protected dirty
  files remain untouched.
- [ ] **Commit runtime evidence only if accepted.** If every approved runtime
  criterion passes, update documentation with bounded observed evidence and
  commit `test: accept the AetherTwin portable Web Demo`. If any criterion
  fails, do not make this commit; create a narrowly scoped remediation task
  from the observed failure.

## Dependency order

```text
Task 1 Rust host
  -> Task 2 package assembler and policy
    -> Task 3 documentation and source gates
      -> Task 4 fresh-explicit-approval runtime acceptance
```

## Completion criteria

Source completion requires Tasks 1–3 to pass their recorded focused/full
source gates, preserve the protected dirty files, have scoped commits, and
receive independent review. Runtime completion additionally requires Task 4's
fresh explicit approval and actual evidence from the packaged ZIP; it must not
be claimed from unit, policy, lint, typecheck, or Cargo results.
