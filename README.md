# Mastra Evolution

Self-learning and self-improvement **control plane** for [Mastra](https://mastra.ai/) agents. Apache-2.0.

Attach Evolution to an **existing** Mastra `Agent` without subclassing. Mastra runs the agent. Evolution ingests evidence, records scoped lessons, and (when enabled) proposes, evaluates, and promotes skill revisions.

Learning and improvement are independently enableable: you can persist lessons with no skill publication.

## Packages

| Package                      | Role                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `@mastra-evolution/core`     | Domain types. Subpaths: `./learning`, `./improvement`, `./storage-local`, `./storage-postgres`, `./testing` |
| `@mastra-evolution/adapters` | Mastra adapter (`createMastraEvolution`) and presets (`@mastra-evolution/adapters/presets`)                 |

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
  improvement: { autonomy: 'auto-promote-bounded' },
});

await agent.generate('What is booked revenue?');
```

The factory binds the Workspace you pass (Mastra Agent keeps workspace private). It merges `afterToolCall` into workspace `tools.hooks` when `setToolsConfig` exists, and infers a local store beside the workspace filesystem. There is no `forAgent()` spread and no `SelfImprovingAgent`.

Promoted skills write under sibling `.evolution/skills`, not git-managed `workspace/skills/`. Learning can run without improvement (`learning: true` only) when you want lessons without skill publication. For visibility into agent runs, use [Mastra observability](https://mastra.ai/docs/observability/overview). Advanced factories live on `@mastra-evolution/core/learning` and `@mastra-evolution/core/improvement`. `applyToCall` is an escape hatch for assigned/non-workspace tools. `register(agent)` is identity-only.

**Supported Mastra:** `@mastra/core` `>=1.63.0 <2` (verified `1.63.2`).

## Quickstart (local self-improvement)

No PostgreSQL, queue, or live model is required to compile or to skip-run the example.

```bash
pnpm install
pnpm build
pnpm --filter @mastra-evolution/example-local-self-improvement start
```

That example is a Hono HTTP server (learning plus L4 bounded skill promotion, plus `@mastra/hono`). Without a model API key it still listens and logs a warning; generate calls need `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY`. Default `pnpm test` does not call a paid API. For Cloud Run + PostgreSQL + artifact bucket, see [`examples/cloud-run-a2a`](examples/cloud-run-a2a).

## Documentation

- [`examples/local-self-improvement`](examples/local-self-improvement) — learning plus skill promotion
- [`examples/cloud-run-a2a`](examples/cloud-run-a2a) — multi-instance Cloud Run + PostgreSQL

Working on this repository? See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
