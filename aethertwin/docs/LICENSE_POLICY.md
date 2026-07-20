# License policy

The AetherTwin workspace declares `Apache-2.0` for its Rust packages. Every third-party dependency that can ship in a M0 artifact requires a recorded direct-dependency license, compatible distribution terms, and required notice handling before release.

`package.json` and `Cargo.toml` define direct dependencies; `pnpm-lock.yaml` and `Cargo.lock` pin their resolved versions. The direct M0 runtime set is recorded in `THIRD_PARTY_NOTICES.md`. Tooling/test-only dependencies (`eslint`, TypeScript, Vite, Vitest, Playwright, test libraries, and Cargo dev dependencies) are not represented there as shipped runtime dependencies.

This is a direct-dependency notice baseline, not a substitute for release-time transitive-license inventory, platform bundle review, source-offer analysis, or legal approval. A release must regenerate and review the full resolved graph for its target platform before distribution.
