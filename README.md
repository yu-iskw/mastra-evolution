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

Public attach API — existing Agent, then one factory call. Workspace appears once, on the Agent:

```ts
const layout = resolveEvolutionWorkspaceLayout(directory);

const workspace = new Workspace({
  id: 'analytics-workspace',
  filesystem: new LocalFilesystem({
    basePath: layout.basePath,
    allowedPaths: [...layout.allowedPaths],
  }),
  // curated (git) first, learned (`.evolution/skills`) second
  skills: [...layout.skills],
});

const agent = new Agent({
  id: 'analytics-agent',
  model: 'openai/gpt-5.6-sol',
  workspace,
  memory, // whatever the app already uses
});

const evolution = createMastraEvolution({
  agent,
  workspace,
  learning: true,
});

await agent.generate('What is booked revenue?');
```

The factory binds the Workspace you pass (Mastra Agent keeps workspace private). It merges `afterToolCall` into workspace `tools.hooks` when `setToolsConfig` exists, and infers a local store beside the workspace filesystem. There is no `forAgent()` spread and no `SelfImprovingAgent`.

Self-improvement: pass `improvement: { autonomy: 'auto-promote-bounded' }` (skills write under sibling `.evolution/skills`, not git-managed `workspace/skills/`). `createLearning` / `createImprovement` remain advanced exports. `applyToCall` is an escape hatch for assigned/non-workspace tools. `register(agent)` is identity-only.

**Supported Mastra:** `@mastra/core` `>=1.63.0 <2` (verified `1.63.2`).

## Quickstart (local learning)

No PostgreSQL, queue, or live model is required to compile or to skip-run the example.

```bash
pnpm install
pnpm build
pnpm --filter @mastra-evolution/example-local-learning start
```

That example is a Hono HTTP server (`createLocalLearning()` plus `@mastra/hono`). Without a model API key it still listens and logs a warning; generate calls need `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY`. Default `pnpm test` does not call a paid API. For L4 skill improvement, see [`examples/local-self-improvement`](examples/local-self-improvement). For Cloud Run + PostgreSQL + artifact bucket, see [`examples/cloud-run-a2a`](examples/cloud-run-a2a).

## Documentation

- [`examples/local-learning`](examples/local-learning) — learning-only attach
- [`examples/local-self-improvement`](examples/local-self-improvement) — learning plus skill promotion
- [`examples/cloud-run-a2a`](examples/cloud-run-a2a) — multi-instance Cloud Run + PostgreSQL

Working on this repository? See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
