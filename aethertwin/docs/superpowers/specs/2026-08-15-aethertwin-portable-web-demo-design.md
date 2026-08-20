# AetherTwin Portable Web Demo Design

**Date:** 2026-08-15  
**Status:** Implemented; separately approved Windows x64 package/runtime acceptance passed on 2026-08-20

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

The standard-library assembler rejects file and directory links exposed by
Node as symbolic links (including Windows junction fixtures) and rejects every
input or output whose canonical path escapes the repository. Consistent with
the direct user plan, this is an escape-prevention guarantee; it does not claim
portable detection of opaque, non-redirecting Windows reparse classes that the
Node standard library does not expose. Runtime acceptance must use a freshly
extracted ordinary-file tree and recheck its containment.

## Implementation and runtime status

The loopback host source is committed through `74b59244`; assembler and review
hardening through `d37644f6`; source handoff through `fe229e03`; and clean
review-status repair through `a4a2dc92`. Tasks 1 through 3 completed focused
gates and independent review.

Task 4 received fresh explicit approval and ran on 2026-08-20. Runtime findings
were repaired through `4d3e84ff`, `cf1c8bc6`, and `6ec8d499`. The accepted ZIP
was built from `6ec8d499425f7578902fc18799839a00ee9e4bd9` with SHA-256
`AC144D56A47EC23C169B0616E7FF6A7596D2302C3CCADD07A0DE331B657E0F84`.
Its fixed tree, 26 payload hashes, relative references, restricted-PATH host,
preferred and fallback loopback ports, Edge/Chrome application behavior,
network/storage boundary, WebGL2 fallback, shutdown, and cleanup all passed the
bounded acceptance described by the implementation plan.

## Bounded acceptance and exclusions

This design did not itself authorize runtime work; the user separately approved
the package build, browser launches, packaged-runtime checks, and safe cleanup
in the acceptance conversation. Generated artifacts were verified and then
removed, so no EXE, ZIP, `dist/`, or extracted payload is committed or retained
as a working-tree deliverable. The result is internal Windows x64 evidence for
this machine and the installed Edge/Chrome versions only. It does not add a
screenshot, signing, installer, external distribution, Firefox/ARM64/macOS
support, cross-device visual certification, or performance certification.

The protected unrelated working-copy changes in
`crates/asset-io/Cargo.toml`, `crates/desktop-host/Cargo.toml`, and
`packages/mode-showroom/src/index.ts` remain outside this work, unstaged and
uncommitted.
