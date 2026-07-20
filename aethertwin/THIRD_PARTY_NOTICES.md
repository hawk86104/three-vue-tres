# Third-party notices

## Scope and evidence

This is the M0 direct runtime and build dependency baseline. Package names and pinned versions come from `package.json`/workspace `Cargo.toml`, resolved by `pnpm-lock.yaml` and `Cargo.lock`. JavaScript license identifiers were read from the installed direct package metadata and local LICENSE/COPYING files. Workspace packages are AetherTwin code and are not repeated. Development/test-only tooling is excluded. A distribution release still requires a full target-specific transitive inventory and verification of bundled license texts.

## JavaScript runtime dependencies

| Dependency | Resolved direct version | License |
| --- | ---: | --- |
| `@tauri-apps/api` | 2.11.1 | Apache-2.0 OR MIT |
| `@tauri-apps/plugin-dialog` | 2.7.2 | MIT OR Apache-2.0 |
| `@radix-ui/react-dialog` | 1.1.19 | MIT |
| `lucide-react` | 1.25.0 | ISC |
| `react` | 19.2.7 | MIT |
| `react-dom` | 19.2.7 | MIT |
| `zustand` | 5.0.14 | MIT |

## Rust runtime and build dependencies

The following direct non-development dependencies are declared by `Cargo.toml`, pinned by `Cargo.lock`, and were checked against local Cargo-registry package metadata and license files where present. The workspace Rust package license is `Apache-2.0`.

| Dependency | Resolved direct version | License |
| --- | ---: | --- |
| `chrono` | 0.4.45 | MIT OR Apache-2.0 |
| `fs2` | 0.4.3 | MIT/Apache-2.0 (as declared) |
| `fs_at` | 0.2.1 | Apache-2.0 (registry manifest; no separate local LICENSE file) |
| `remove_dir_all` | 1.0.0 | MIT OR Apache-2.0 |
| `rusqlite` | 0.39.0 | MIT |
| `rustix` | 1.1.4 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| `serde` | 1.0.228 | MIT OR Apache-2.0 |
| `serde_json` | 1.0.150 | MIT OR Apache-2.0 |
| `sha2` | 0.10.9 | MIT OR Apache-2.0 |
| `tauri` | 2.11.5 | Apache-2.0 OR MIT |
| `tauri-build` | 2.6.3 | Apache-2.0 OR MIT |
| `tauri-plugin-dialog` | 2.7.2 | Apache-2.0 OR MIT |
| `tauri-plugin-single-instance` | 2.4.3 | Apache-2.0 OR MIT |
| `thiserror` | 2.0.18 | MIT OR Apache-2.0 |
| `uuid` | 1.24.0 | Apache-2.0 OR MIT |

The native `rusqlite` configuration uses the bundled SQLite feature. A distribution release still requires a full target-specific transitive inventory and review of required notices, bundled SQLite, and platform WebView dependencies.
