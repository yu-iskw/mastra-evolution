# Local self-improvement example

Plug Mastra Evolution with **learning and L4 bounded skill improvement** into an existing Mastra `Agent`.

Uses model `google/gemini-flash-lite-latest` ([Google on Mastra](https://mastra.ai/models/providers/google)). Auth: `GEMINI_API_KEY` (mapped to `GOOGLE_GENERATIVE_AI_API_KEY` / `GOOGLE_API_KEY` at runtime). Do not commit API keys.

Default run is **101 turns**. After an accepted procedure lesson, Evolution writes `SKILL.md` under the workspace `skills` path. Later turns must call `search_skills` / `load_skill` so the published skill is used in the same session (`SkillSearchProcessor` with `blockingRefresh: true`).

The example **deletes** the sibling `.evolution/` store and `skills/` directory at start.

Put `WORKSPACE_DIR` at `{run}/workspace` so lessons land in `{run}/.evolution`.

## Run

From the repository root:

```bash
pnpm install
pnpm build
GEMINI_API_KEY=... pnpm --filter @mastra-evolution/example-local-self-improvement start
```

Without `GEMINI_API_KEY` (or `GOOGLE_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` / `OPENAI_API_KEY`), `main()` prints a skip message and exits 0.

## What it wires

- Existing `Agent` + `Workspace`, then `createMastraEvolution({ agent, workspace, learning: true, improvement: { autonomy: 'auto-promote-bounded' } })`
- Bounded skill evaluator (hobby path when Mastra experiments are not wired)
- Publisher writes `SKILL.md` on promote, then records a revision
- Store: sibling `.evolution/` of the workspace filesystem

## Environment

| Variable                       | Purpose                                          |
| ------------------------------ | ------------------------------------------------ |
| `GEMINI_API_KEY`               | Gemini API key (preferred)                       |
| `GOOGLE_API_KEY`               | Mastra Google router key                         |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Alternate Mastra Google key                      |
| `EVOLUTION_TURNS`              | Generate turns (default `101`)                   |
| `WORKSPACE_DIR`                | Workspace filesystem root (default `.workspace`) |
