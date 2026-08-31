# Mastra Evolution

Self-learning and self-improvement **control plane** for [Mastra](https://mastra.ai/) agents. Apache-2.0.

Attach Evolution to an **existing** Mastra `Agent` without subclassing. Mastra runs the agent. Evolution ingests evidence, records scoped lessons, and (when enabled) proposes, evaluates, and promotes skill revisions.

Learning and improvement are independently enableable: you can persist lessons with no skill publication.

## Packages

| Package                              | Role                                                          |
| ------------------------------------ | ------------------------------------------------------------- |
| `@mastra-evolution/core`             | Framework-neutral domain types and ports                      |
| `@mastra-evolution/learning`         | Evidence ingest, aggregation, lessons                         |
| `@mastra-evolution/improvement`      | Proposals, evaluation, promotion policy, rollback             |
| `@mastra-evolution/mastra`           | Adapter: `createMastraEvolution`, evaluators, skill publisher |
| `@mastra-evolution/presets`          | Optional batteries-included wiring                            |
| `@mastra-evolution/storage-local`    | Single-writer local filesystem store                          |
| `@mastra-evolution/storage-postgres` | Multi-instance PostgreSQL store                               |
| `@mastra-evolution/testing`          | Fakes and contract helpers                                    |

Public attach API:

```ts
const evolution = createMastraEvolution({
  agent,
  learning,
  improvement,
  store,
});
const registered = evolution.register(agent); // same instance (Object.is)
```

`createLearning({ store, agentId, autonomy })` and `createImprovement({ store, evaluator, publisher, autonomy })` are optional runtimes you pass in. Hobby publish: `FilesystemSkillPublisher({ directory })` and `LocalEvolutionStore({ directory })`.

**Supported Mastra:** `@mastra/core` `>=1.63.0 <2` (verified `1.63.2`). See [`MASTRA_CAPABILITIES.md`](MASTRA_CAPABILITIES.md).

## Quickstart (local learning)

No PostgreSQL, queue, or live model is required to compile or to skip-run the example.

```bash
pnpm install
pnpm build
pnpm --filter @mastra-evolution/example-local-learning start
```

Without `OPENAI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY`, the example prints `skip` and exits 0. Default `pnpm test` does not call a paid API.

That example enables **learning only** (`improvement: { enabled: false }`). For L4 skill improvement with a stub evaluator, see [`examples/local-self-improvement`](examples/local-self-improvement). For Cloud Run + PostgreSQL + artifact bucket, see [`examples/cloud-run-a2a`](examples/cloud-run-a2a).

## Documentation

- [`RFC.md`](RFC.md) — product origin
- [`MASTRA_CAPABILITIES.md`](MASTRA_CAPABILITIES.md) — verified Mastra surfaces
- [`docs/plans/2026-08-31-001-feat-mastra-evolution-plan.md`](docs/plans/2026-08-31-001-feat-mastra-evolution-plan.md) — implementation plan
- [`docs/architecture/control-plane.md`](docs/architecture/control-plane.md) — Evolution vs Mastra runtime
- [`docs/architecture/cloud-run.md`](docs/architecture/cloud-run.md) — Postgres vs FUSE, multi-instance concurrency

## Getting started

### Prerequisites

- [pnpm](https://pnpm.io/) **11.x** (see `packageManager` in `package.json`; use [Corepack](https://nodejs.org/api/corepack.html): `corepack enable`)
- Node.js **22+** (see `engines` in `package.json`; `.node-version` pins the version used for local dev and CI)

Dependency installs follow pnpm 11 supply-chain settings in [`pnpm-workspace.yaml`](pnpm-workspace.yaml): **minimum release age** (this library uses a **7-day** quarantine, stricter than pnpm’s built-in 24-hour default), **blocking exotic transitive dependencies**, and an **`allowBuilds`** allowlist for packages that run install scripts. See [pnpm 11 release notes](https://pnpm.io/blog/releases/11.0) and [Supply-chain defaults (Socket)](https://socket.dev/blog/pnpm-11-adds-new-supply-chain-protection-defaults).

Linting and formatting use [Trunk](https://trunk.io/) (ESLint, Prettier, and more). The Trunk **launcher** is installed with project dependencies—you do not need a separate Trunk install for the default workflow.

### Installation

```bash
pnpm install
```

Optional: prefetch Trunk’s hermetic tools (helpful for offline work or CI images):

```bash
pnpm exec trunk install
```

If you prefer a global `trunk` on your PATH, see the [Trunk installation guide](https://docs.trunk.io/references/cli/getting-started/install) (e.g. `brew install trunk-io` on macOS).

### Supply-chain protections

This library uses **pnpm 11** with settings in [`pnpm-workspace.yaml`](pnpm-workspace.yaml): a **7-day** [`minimumReleaseAge`](https://pnpm.io/settings#minimumreleaseage) (10080 minutes, stricter than pnpm’s default 1 day), [`blockExoticSubdeps`](https://pnpm.io/settings#blockexoticsubdeps) enabled, and an [`allowBuilds`](https://pnpm.io/settings#allowbuilds) map for dependencies that must run install scripts (pnpm 11 requires this for native toolchain packages such as esbuild). See the [pnpm 11 release notes](https://pnpm.io/blog/releases/11.0).

The 7-day gate can delay installing a brand-new `@mastra/core`. Optional Mastra peers are not auto-installed (`autoInstallPeers: false` in [`pnpm-workspace.yaml`](pnpm-workspace.yaml)). Compatibility CI skips when Mastra is not installable rather than failing the default pipeline.

CI: pull requests and `main` run `pnpm lint:security` then generate/scan an SPDX SBOM (`.github/workflows/sbom.yml`). Publish re-checks `pnpm lint:security` before npm publish.

### Build

```bash
pnpm build
pnpm build:examples
```

### Test

```bash
pnpm test
```

### Linting and formatting

```bash
pnpm lint
pnpm format
```

## Project structure

- `packages/` — library packages listed above
- `examples/` — `local-learning`, `local-self-improvement`, `cloud-run-a2a`
- `docs/architecture/` — control-plane and Cloud Run notes

## License

Apache-2.0. See [LICENSE](LICENSE).
