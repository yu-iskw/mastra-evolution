# Local self-improvement example

Plug Mastra Evolution with **learning and L4 bounded skill improvement** into an existing Mastra `Agent`, then serve it over HTTP with [Hono](https://hono.dev/) and the [`@mastra/hono`](https://mastra.ai/docs/server/server-adapters) adapter.

Uses model `google/gemini-flash-lite-latest` ([Google on Mastra](https://mastra.ai/models/providers/google)). Auth: `GEMINI_API_KEY` (mapped to `GOOGLE_GENERATIVE_AI_API_KEY` / `GOOGLE_API_KEY` at runtime). Do not commit API keys.

The example **deletes** the sibling `.evolution/` directory at process start (store + learned skills). Curated `workspace/skills/` is not wiped.

Put `WORKSPACE_DIR` at `{run}/workspace` so lessons land in `{run}/.evolution`.

## Skill roots

| Path                       | Role                                                              |
| -------------------------- | ----------------------------------------------------------------- |
| `{workspace}/skills/`      | Git-managed / curated Agent Skills                                |
| `{run}/.evolution/skills/` | Evolution-promoted skills (`SKILL.md` publish target; gitignored) |

Both roots are listed on `Workspace({ skills })` so `SkillSearchProcessor` can find curated and learned skills. Learned skills sit outside `basePath`, so `LocalFilesystem` gets `allowedPaths` for `.evolution/skills`.

## Layout

| File                            | Role                                               |
| ------------------------------- | -------------------------------------------------- |
| `src/create-analytics-stack.ts` | Workspace, Agent, Evolution, and `Mastra` instance |
| `src/index.ts`                  | Hono + `MastraServer` HTTP entry (`pnpm start`)    |
| `src/demo.ts`                   | In-process 101-turn validation loop (`pnpm demo`)  |

Server adapters do not discover files. The stack registers the agent on `new Mastra({ agents })` in code.

## Run the HTTP server

From the repository root:

```bash
pnpm install
pnpm build
GEMINI_API_KEY=... pnpm --filter @mastra-evolution/example-local-self-improvement start
```

Without a model key, the process still listens. Generate calls fail until a key is set. Default port is `4111` (`PORT` overrides).

```bash
curl http://localhost:4111/health
curl http://localhost:4111/api/agents
curl -s http://localhost:4111/api/agents/analytics-agent/generate \
  -H 'content-type: application/json' \
  -d '{"messages":"Read metrics.md and quote Q1 booked revenue."}'
curl http://localhost:4111/evolution
curl -s http://localhost:4111/evolution/extract \
  -H 'content-type: application/json' \
  -d '{"kind":"procedure","summary":"Use booked revenue excluding cancellations.","suggestedAction":"create-skill"}'
```

Mastra also serves `/api/openapi.json` and A2A routes for the registered agent.

## Run the 101-turn demo

After an accepted procedure lesson, Evolution writes `SKILL.md` under `.evolution/skills`. Later turns must call `search_skills` / `load_skill` so the published skill is used in the same session (`SkillSearchProcessor` with `blockingRefresh: true`).

```bash
GEMINI_API_KEY=... pnpm --filter @mastra-evolution/example-local-self-improvement demo
```

Without `GEMINI_API_KEY` (or `GOOGLE_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY`), `demo` prints a skip message and exits 0. Do not run `start` and `demo` against the same `WORKSPACE_DIR` at the same time.

## What it wires

- Existing `Agent` + `Workspace`, then `createMastraEvolution({ agent, workspace, learning: true, improvement: { autonomy: 'auto-promote-bounded' } })`
- `new Mastra({ agents: { 'analytics-agent': agent } })` so Hono can mount `/api/agents/:agentId/generate`
- Bounded skill evaluator (hobby path when Mastra experiments are not wired)
- Publisher writes `SKILL.md` under `.evolution/skills` on promote, then records a revision
- Store: sibling `.evolution/` of the workspace filesystem

## Environment

| Variable                       | Purpose                                          |
| ------------------------------ | ------------------------------------------------ |
| `GEMINI_API_KEY`               | Gemini API key (preferred)                       |
| `GOOGLE_API_KEY`               | Mastra Google router key                         |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Alternate Mastra Google key                      |
| `PORT`                         | HTTP listen port (default `4111`)                |
| `EVOLUTION_TURNS`              | Demo generate turns (default `101`)              |
| `WORKSPACE_DIR`                | Workspace filesystem root (default `.workspace`) |
