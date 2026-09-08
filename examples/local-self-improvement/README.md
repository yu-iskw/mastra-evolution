# Local self-improvement example

Plug Mastra Evolution with **learning and L4 bounded skill improvement** into an existing Mastra `Agent`, then serve it over HTTP with [Hono](https://hono.dev/) and the [`@mastra/hono`](https://mastra.ai/docs/server/server-adapters) adapter.

Uses model `google/gemini-flash-lite-latest` ([Google on Mastra](https://mastra.ai/models/providers/google)). Auth: `GEMINI_API_KEY` (mapped to `GOOGLE_GENERATIVE_AI_API_KEY` / `GOOGLE_API_KEY` at runtime). Do not commit API keys.

Ownership ([ADR-0005](../../docs/adr/0005-evolution-layer-ownership-on-existing-mastra-agents.md)): the app owns `Agent`, `Workspace`, and `Memory`; Evolution owns the sibling `.evolution/` control-plane store and learned skills. At process start the example **deletes** `.evolution/` and `.mastra/` so each run is clean. Curated `workspace/skills/` is not wiped.

| Path                  | Owner        | Contents                                                       |
| --------------------- | ------------ | -------------------------------------------------------------- |
| `{run}/.evolution/`   | Evolution    | `evidence.json`, lessons, proposals, events, learned `skills/` |
| `{run}/.mastra/`      | App (Mastra) | LibSQL `memory.db` for thread-scoped schema working memory     |
| `{workspace}/skills/` | App / git    | Curated Agent Skills                                           |

Successful workspace tool calls are not stored; expect few evidence rows unless you `POST /evolution/extract` procedures/corrections or tools fail.

Put `WORKSPACE_DIR` at `{run}/workspace` so Evolution lessons land in `{run}/.evolution` and Memory in `{run}/.mastra`.

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
  -d '{"messages":"Read metrics.md and quote Q1 booked revenue.","memory":{"thread":"local-self-improvement-demo","resource":"analytics-demo-user"}}'
curl http://localhost:4111/evolution
curl -s http://localhost:4111/evolution/extract \
  -H 'content-type: application/json' \
  -d '{"kind":"procedure","summary":"Use booked revenue excluding cancellations.","suggestedAction":"create-skill"}'
```

Mastra also serves `/api/openapi.json` and A2A routes for the registered agent. Memory-enabled generate calls need `memory.thread` (and `memory.resource`) so thread-scoped schema working memory can persist.

## Run the 101-turn demo

After an accepted procedure lesson, Evolution writes a practical `SKILL.md` under `.evolution/skills` (When to Use / Instructions / Working Memory / Do Not, plus a what+when description)—not a one-line slogan. Later turns must call `search_skills` / `load_skill` so the published skill is used in the same session (`SkillSearchProcessor` with `blockingRefresh: true`). The demo passes a stable `memory.thread` / `memory.resource` so schema working memory carries procedure slots across turns.

```bash
GEMINI_API_KEY=... pnpm --filter @mastra-evolution/example-local-self-improvement demo
```

Without `GEMINI_API_KEY` (or `GOOGLE_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY`), `demo` prints a skip message and exits 0. Do not run `start` and `demo` against the same `WORKSPACE_DIR` at the same time.

## What it wires

- Existing `Agent` + `Workspace`, then `createMastraEvolution({ agent, workspace, learning: true, improvement: { autonomy: 'auto-promote-bounded' } })`
- Thread-scoped **schema** working memory (`revenueDefinition`, `sourceFile`, `lastQuotedFigure`, `lastPeriod`) via `@mastra/memory` + LibSQL under **`.mastra/memory.db`** (app-owned; not under `.evolution/`). Observational Memory is not enabled here; see [control-plane recipes](../../docs/architecture/control-plane.md) to wire `evolution.extractor()`.
- `new Mastra({ agents: { 'analytics-agent': agent }, storage })` so Hono can mount `/api/agents/:agentId/generate`
- Bounded skill evaluator (hobby path when Mastra experiments are not wired)
- Publisher writes practical `SKILL.md` under `.evolution/skills` on promote, then records a revision
- Evolution store: sibling `.evolution/` of the workspace filesystem

## Environment

| Variable                       | Purpose                                          |
| ------------------------------ | ------------------------------------------------ |
| `GEMINI_API_KEY`               | Gemini API key (preferred)                       |
| `GOOGLE_API_KEY`               | Mastra Google router key                         |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Alternate Mastra Google key                      |
| `PORT`                         | HTTP listen port (default `4111`)                |
| `EVOLUTION_TURNS`              | Demo generate turns (default `101`)              |
| `WORKSPACE_DIR`                | Workspace filesystem root (default `.workspace`) |
