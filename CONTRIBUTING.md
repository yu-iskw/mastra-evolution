# Contributing

Guide for developers working on Mastra Evolution itself. Library consumers should start with [`README.md`](README.md).

## Prerequisites

- [pnpm](https://pnpm.io/) **11.x** (see `packageManager` in `package.json`; use [Corepack](https://nodejs.org/api/corepack.html): `corepack enable`)
- Node.js **22+** (see `engines` in `package.json`; `.node-version` pins the version used for local dev and CI)

Dependency installs follow pnpm 11 supply-chain settings in [`pnpm-workspace.yaml`](pnpm-workspace.yaml): **minimum release age** (this library uses a **7-day** quarantine, stricter than pnpm’s built-in 24-hour default), **blocking exotic transitive dependencies**, and an **`allowBuilds`** allowlist for packages that run install scripts. See [pnpm 11 release notes](https://pnpm.io/blog/releases/11.0) and [Supply-chain defaults (Socket)](https://socket.dev/blog/pnpm-11-adds-new-supply-chain-protection-defaults).

Linting and formatting use [Trunk](https://trunk.io/) (ESLint, Prettier, and more). The Trunk **launcher** is installed with project dependencies—you do not need a separate Trunk install for the default workflow.

## Installation

```bash
pnpm install
```

Optional: prefetch Trunk’s hermetic tools (helpful for offline work or CI images):

```bash
pnpm exec trunk install
```

If you prefer a global `trunk` on your PATH, see the [Trunk installation guide](https://docs.trunk.io/references/cli/getting-started/install) (e.g. `brew install trunk-io` on macOS).

## Supply-chain protections

This library uses **pnpm 11** with settings in [`pnpm-workspace.yaml`](pnpm-workspace.yaml): a **7-day** [`minimumReleaseAge`](https://pnpm.io/settings#minimumreleaseage) (10080 minutes, stricter than pnpm’s default 1 day), [`blockExoticSubdeps`](https://pnpm.io/settings#blockexoticsubdeps) enabled, and an [`allowBuilds`](https://pnpm.io/settings#allowbuilds) map for dependencies that must run install scripts (pnpm 11 requires this for native toolchain packages such as esbuild). See the [pnpm 11 release notes](https://pnpm.io/blog/releases/11.0).

The 7-day gate can delay installing a brand-new `@mastra/core`. Optional Mastra peers are not auto-installed (`autoInstallPeers: false` in [`pnpm-workspace.yaml`](pnpm-workspace.yaml)). Compatibility CI skips when Mastra is not installable rather than failing the default pipeline.

CI: pull requests and `main` run `pnpm lint:security` then generate/scan an SPDX SBOM (`.github/workflows/sbom.yml`). Publish re-checks `pnpm lint:security` before npm publish.

## Build

```bash
pnpm build
pnpm build:examples
```

## Test

```bash
pnpm test
```

## Linting and formatting

```bash
pnpm lint
pnpm format
```

## Project structure

- `packages/` — library packages listed in [`README.md`](README.md)
- `examples/` — `local-learning`, `local-self-improvement`, `cloud-run-a2a`
- `docs/architecture/` — control-plane and Cloud Run notes
- `docs/adr/` — architecture decisions

## Architecture and decisions

- [`docs/adr/0001-agent-first-workspace-attach.md`](docs/adr/0001-agent-first-workspace-attach.md) — agent-first workspace attach
- [`docs/architecture/control-plane.md`](docs/architecture/control-plane.md) — Evolution vs Mastra runtime
- [`docs/architecture/cloud-run.md`](docs/architecture/cloud-run.md) — Postgres vs FUSE, multi-instance concurrency
