# Local learning example

Plug Mastra Evolution **learning only** into an existing Mastra `Agent` with a real `Workspace`, then serve it over HTTP with [Hono](https://hono.dev/) and the [`@mastra/hono`](https://mastra.ai/docs/server/server-adapters) adapter.

Uses model `google/gemini-flash-lite-latest` ([Google on Mastra](https://mastra.ai/models/providers/google)). Auth: `GEMINI_API_KEY` (mapped to `GOOGLE_GENERATIVE_AI_API_KEY` / `GOOGLE_API_KEY` at runtime). Do not commit API keys.

The example **deletes** the sibling `.evolution/` directory at process start (store + any learned skills). Curated `workspace/skills/` is not wiped.

Put `WORKSPACE_DIR` at `{run}/workspace` so lessons land in `{run}/.evolution` (not `/tmp/.evolution`).

## Skill roots

| Path                       | Role                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `{workspace}/skills/`      | Git-managed / curated Agent Skills (discover only in this example)                               |
| `{run}/.evolution/skills/` | Dynamically learned skills (publish target when improvement is on; gitignored via `.evolution/`) |

Workspace config uses both paths (`resolveEvolutionWorkspaceLayout`) so agents can discover curated and learned skills. `LocalFilesystem.allowedPaths` includes the learned root because it sits outside `basePath`.

## Layout

| File                           | Role                                               |
| ------------------------------ | -------------------------------------------------- |
| `src/create-local-learning.ts` | Workspace, Agent, Evolution, and `Mastra` instance |
| `src/index.ts`                 | Hono + `MastraServer` HTTP entry (`pnpm start`)    |
| `src/demo.ts`                  | In-process 101-turn validation loop (`pnpm demo`)  |

Server adapters do not discover files. The stack registers the agent on `new Mastra({ agents })` in code.

## Run the HTTP server

From the repository root:

```bash
pnpm install
pnpm build
GEMINI_API_KEY=... pnpm --filter @mastra-evolution/example-local-learning start
```

Without a model key, the process still listens. Generate calls fail until a key is set. Default port is `4111` (`PORT` overrides).

```bash
curl http://localhost:4111/health
curl http://localhost:4111/api/agents
curl -sS -X POST http://localhost:4111/api/agents/analytics-agent/generate \
  -H 'content-type: application/json' \
  -d '{"messages":"What is booked revenue? Use workspace files."}'
curl http://localhost:4111/evolution
```

Mastra also serves `/api/openapi.json` for the registered agent.

## Run the 101-turn demo

```bash
GEMINI_API_KEY=... pnpm --filter @mastra-evolution/example-local-learning demo
```

Without `GEMINI_API_KEY` (or `GOOGLE_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY`), `demo` prints a skip message and exits 0. Do not run `start` and `demo` against the same `WORKSPACE_DIR` at the same time.

## What it wires

- `new Workspace({ filesystem: new LocalFilesystem(...), skills: ['skills', '../.evolution/skills'] })` then `new Agent({ workspace, model: 'google/gemini-flash-lite-latest' })`
- `createMastraEvolution({ agent, workspace, learning: true })` — Mastra `Agent` does not expose a sync `workspace` field, so the factory also takes the Workspace instance
- `new Mastra({ agents: { 'analytics-agent': agent } })` so Hono can mount `/api/agents/:agentId/generate`
- Local store at sibling `.evolution/` of the workspace directory

## Environment

| Variable                       | Purpose                                          |
| ------------------------------ | ------------------------------------------------ |
| `GEMINI_API_KEY`               | Gemini API key (preferred)                       |
| `GOOGLE_API_KEY`               | Mastra Google router key                         |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Alternate Mastra Google key                      |
| `PORT`                         | HTTP listen port (default `4111`)                |
| `EVOLUTION_TURNS`              | Demo generate turns (default `101`)              |
| `WORKSPACE_DIR`                | Workspace filesystem root (default `.workspace`) |
