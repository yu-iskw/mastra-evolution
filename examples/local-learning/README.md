# Local learning example

Plug Mastra Evolution **learning only** into an existing Mastra `Agent` with a real `Workspace`. No skill is published.

Uses model `google/gemini-flash-lite-latest` ([Google on Mastra](https://mastra.ai/models/providers/google)). Auth: `GEMINI_API_KEY` (mapped to `GOOGLE_GENERATIVE_AI_API_KEY` / `GOOGLE_API_KEY` at runtime). Do not commit API keys.

Default run is **101 turns**. Set `EVOLUTION_TURNS` to change that. The example **deletes** the sibling `.evolution/` store and `skills/` directory at start so each run is a fresh learning session.

Put `WORKSPACE_DIR` at `{run}/workspace` so lessons land in `{run}/.evolution` (not `/tmp/.evolution`).

## Run

From the repository root:

```bash
pnpm install
pnpm build
GEMINI_API_KEY=... pnpm --filter @mastra-evolution/example-local-learning start
```

Without `GEMINI_API_KEY` (or `GOOGLE_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` / `OPENAI_API_KEY`), `main()` prints a skip message and exits 0.

## What it wires

- `new Workspace({ filesystem: new LocalFilesystem(...) })` then `new Agent({ workspace, model: 'google/gemini-flash-lite-latest' })`
- `createMastraEvolution({ agent, workspace, learning: true })` — Mastra `Agent` does not expose a sync `workspace` field, so the factory also takes the Workspace instance
- 101 `agent.generate` turns plus procedure extractors so a booked-revenue lesson is accepted
- Local store at sibling `.evolution/` of the workspace directory

## Environment

| Variable                       | Purpose                                          |
| ------------------------------ | ------------------------------------------------ |
| `GEMINI_API_KEY`               | Gemini API key (preferred)                       |
| `GOOGLE_API_KEY`               | Mastra Google router key                         |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Alternate Mastra Google key                      |
| `EVOLUTION_TURNS`              | Generate turns (default `101`)                   |
| `WORKSPACE_DIR`                | Workspace filesystem root (default `.workspace`) |
