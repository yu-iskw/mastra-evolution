# Local self-improvement example

Attach Mastra Evolution with **learning and L4 bounded skill improvement** to an existing agent.

The agent is a plain object `{ name: 'analytics-agent' }` — not a `SelfImprovingAgent` subclass.

## Run

From the repository root:

```bash
pnpm install
pnpm build
pnpm --filter @mastra-evolution/example-local-self-improvement start
```

Without `OPENAI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY`, `main()` prints a skip message and exits 0. It never calls a paid model API.

## Evaluation: stub vs small model

This example uses `createMastraEvaluator({ experimentsAvailable: false })` so it **typechecks without Mastra experiments**. The stub returns an inconclusive verdict and does not publish based on a real score.

To evaluate with a small/cheap model:

1. Enable Mastra datasets and experiments on the agent.
2. Pass `createMastraEvaluator({ experimentsAvailable: true, run })` where `run` executes baseline vs candidate on a pinned dataset version (`MASTRA_CAPABILITIES.md`, KTD5).
3. Keep `FilesystemSkillPublisher` for hobby `SKILL.md` writes under the local workspace.

Do not treat the stub evaluator as a production gate.

## What it wires

- `LocalEvolutionStore` under `EVOLUTION_DIR` (default `.evolution`)
- `FilesystemSkillPublisher` under `$EVOLUTION_DIR/skills`
- `createLearning` with autonomy `learn`
- `createImprovement` with autonomy L4 (`auto-promote-bounded`)
- `createMastraEvolution` + `register(agent)` (same object identity)

## Environment

| Variable                       | Purpose                                                      |
| ------------------------------ | ------------------------------------------------------------ |
| `EVOLUTION_DIR`                | Local Evolution state directory (default `.evolution`)       |
| `OPENAI_API_KEY`               | Optional; without this or the Google key, the example no-ops |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Optional; without this or the OpenAI key, the example no-ops |
