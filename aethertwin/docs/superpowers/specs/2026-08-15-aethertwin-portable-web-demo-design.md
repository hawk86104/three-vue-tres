# AetherTwin Portable Web Demo Design

**Date:** 2026-08-15  
**Status:** Approved implementation design; package build and runtime acceptance require fresh explicit approval

## Goal

Provide an internal Windows portable preview of the already accepted AetherTwin
Web Demo. A recipient on Windows 10 or Windows 11 x64 can unzip one internal
ZIP and start `AetherTwin-Preview.exe`; the target machine needs no Node.js,
pnpm, or installer.

This is a local loopback preview, not a new product surface. The current
in-memory canonical Showroom behavior remains unchanged: it opens in the
existing 2D experience and retains the existing synchronized 3D and fixed
split behaviors. Refresh, Back, and restart reset the canonical Showroom
session. Export remains desktop-only.

## Distribution contract

The internal, unsigned ZIP has exactly this top-level layout:

```text
AetherTwin-Preview.exe
app/
  index.html
  ...relative built assets
README.txt
BUILD_INFO.json
SHA256SUMS.txt
THIRD_PARTY_NOTICES.md
```

`app/index.html` and every emitted runtime asset use relative paths. Generated
ZIPs, staging trees, binaries, checksums, and reports live under ignored
`artifacts/`; generated artifacts are never committed.

The acceptance baseline is Edge and Chrome on internal Windows 10/11 x64
machines. The distribution is intentionally unsigned. It makes no support or
performance claim for Firefox, ARM64, macOS, code-signing, or another machine.

## Console host

`AetherTwin-Preview.exe` is a new standard-library-only Rust console host. It
does not link Tauri and it serves only its sibling `app/` directory. Its CLI
does not accept an arbitrary document-root argument or an arbitrary
listen-address argument.

The host binds only `127.0.0.1`. It attempts port `4173` first; when that port
is occupied, it binds an OS-assigned loopback port. It prints a copyable
`http://127.0.0.1:<port>/` URL, opens that URL in the default browser, and keeps
the console visible. Failure to open the browser is nonfatal: the printed URL
remains available. Closing the console terminates the host and stops the
preview.

The host is a deliberately small static server:

- It accepts only `GET` and `HEAD`.
- It enforces a bounded request-header size and a read timeout before parsing a
  request.
- It serves an explicit, limited MIME allowlist required by the current build;
  unknown extensions are rejected rather than guessed.
- It provides neither directory listings nor a generic SPA fallback.
- It rejects percent-encoded paths, backslashes, drive paths, empty segments,
  `.` segments, `..` segments, NUL, and non-regular files.
- After joining a permitted request path, it canonicalizes the candidate and
  rejects it unless it remains inside the canonical sibling `app/` directory.

## Local security response policy

Every successful response provides the local-security headers required by the
current runtime:

- an explicit Content-Security-Policy limited to the current self/blob/data
  runtime;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: no-referrer`.

`index.html` is served with `Cache-Control: no-store`. Hashed static assets may
be served with immutable caching. No response relies on remote content,
unbounded media-type sniffing, directory behavior, or a browser `file://`
origin.

## Product boundary

The portable preview preserves the existing Web Demo's in-memory boundary. It
does not add browser persistence, `.twinproj` handling, native dialogs, remote
services, `file://` support, a single-file HTML mode, Player, publish, or a
new export surface. It does not change canonical Showroom data, 2D, 3D, split,
Back, refresh, or the desktop-only Export truthfulness.

## Packaging and auditability

The root packaging command is exactly:

```powershell
pnpm.cmd package:web-demo:win-x64
```

It is responsible for producing the fixed ZIP contract from the existing
Web-Demo build and the Rust host, then generating `BUILD_INFO.json`,
`SHA256SUMS.txt`, and `THIRD_PARTY_NOTICES.md`. The assembler validates the
staged tree before zipping: no file may escape the expected roots, no extra
top-level payload may be introduced, and all checksums must describe the
finished payload.

## Explicit exclusions and approval gate

This design does not authorize package builds, browser launches, packaged
runtime tests, screenshots, GPU tests, or cleanup of generated output. Real
build and runtime acceptance are not run before fresh explicit approval in the
current conversation. Source-level test evidence and review do not claim that
the ZIP has run, opened a browser, or rendered correctly on a target machine.

The protected unrelated working-copy changes in
`crates/asset-io/Cargo.toml`, `crates/desktop-host/Cargo.toml`, and
`packages/mode-showroom/src/index.ts` remain outside this work, unstaged and
uncommitted.
