# License policy

The AetherTwin workspace declares `Apache-2.0` for its Rust packages. Every third-party dependency that can ship in a M0 artifact requires a recorded direct-dependency license, compatible distribution terms, and required notice handling before release.

`package.json` and `Cargo.toml` define direct dependencies; `pnpm-lock.yaml` and `Cargo.lock` pin their resolved versions. The direct M0 runtime and build baseline is recorded in `THIRD_PARTY_NOTICES.md`. Tooling/test-only dependencies (`eslint`, TypeScript, Vite, Vitest, Playwright, test libraries, and Cargo dev dependencies) are not represented there as shipped runtime dependencies.

This is a direct-dependency notice baseline, not a substitute for release-time transitive-license inventory, platform bundle review, source-offer analysis, or legal approval. A release must regenerate and review the full resolved graph for its target platform before distribution.

The Windows portable-preview source copies the committed root
`THIRD_PARTY_NOTICES.md` as its current direct-dependency notice baseline.
Source tests verify that the file is present and byte-identical; they do not
prove target-specific transitive-license completeness or legal approval. Before
any generated ZIP is distributed, the final resolved payload and notices must
be rechecked without weakening the existing release-time inventory requirement.
