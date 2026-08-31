# Local learning example

Attach Mastra Evolution **learning only** to an existing agent. No skill is published.

This example constructs a plain object `{ name: 'analytics-agent' }` as a stand-in for a Mastra `Agent`. Evolution does not require a `SelfImprovingAgent` subclass.

## Run

From the repository root:

```bash
pnpm install
pnpm build
pnpm --filter @mastra-evolution/example-local-learning start
```

Or from this directory after a workspace build:

```bash
pnpm start
```

Without `OPENAI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY`, `main()` prints a skip message and exits 0. It never calls a paid model API.

## What it wires

- `LocalEvolutionStore` under `EVOLUTION_DIR` (default `.evolution`)
- `createLearning({ store, agentId, autonomy: 'learn' })`
- `createMastraEvolution({ agent, learning, improvement: { enabled: false }, store })`
- `register(agent)` returns the **same object identity**

Learning records evidence and lessons. Improvement is disabled, so nothing is evaluated or published as a skill.

## Environment

| Variable                       | Purpose                                                      |
| ------------------------------ | ------------------------------------------------------------ |
| `EVOLUTION_DIR`                | Local Evolution state directory (default `.evolution`)       |
| `OPENAI_API_KEY`               | Optional; without this or the Google key, the example no-ops |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Optional; without this or the OpenAI key, the example no-ops |
