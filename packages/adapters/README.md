# `@mastra-evolution/adapters`

Mastra adapter for the Evolution control plane. Attach learning and optional skill improvement to an **existing** Mastra `Agent` without subclassing or wrapping `generate` / `stream`.

Canonical overview: repository [README](../../README.md). Ownership contract: [ADR-0005](../../docs/adr/0005-evolution-layer-ownership-on-existing-mastra-agents.md). Control-plane vs runtime: [control-plane.md](../../docs/architecture/control-plane.md).

## What this package does

- `createMastraEvolution({ agent, workspace, learning, improvement })` — merges workspace `tools.hooks.afterToolCall` (**failures only**), infers sibling `.evolution/` store when learning/improvement need it, exposes `extractor()` for Observational Memory.
- `register(agent)` — **identity only** (`Object.is`). Compatibility stub; the factory already plugs workspace hooks. Prefer not relying on `register` for new code.
- `applyToCall` — escape hatch for assigned / non-workspace tools.
- Layout helpers (`resolveEvolutionWorkspaceLayout`, …) — curated `skills/` + learned `.evolution/skills`.

## What this package does not do

- Construct or set `agent.memory`
- Auto-wire Observational Memory extractors onto Memory
- Require a learning subagent (`agents:`)
- Bridge Mastra observability Feedback into lessons (capability flag is probe-only)

## Recipes

| Recipe           | Snippet focus                                                                     |
| ---------------- | --------------------------------------------------------------------------------- |
| Minimal learning | `createMastraEvolution({ agent, workspace, learning: true })`                     |
| + Skill promote  | `improvement: { autonomy: 'auto-promote-bounded' }`                               |
| + Schema WM      | App builds `Memory` with thread-scoped schema; persist **outside** `.evolution/`  |
| + OM extractor   | App passes `evolution.extractor()` into `observationalMemory.observation.extract` |
| Cloud            | Explicit `store` (Postgres); see `examples/cloud-run-a2a`                         |

Root README shows the agent-first attach pattern. Local demo: `examples/local-self-improvement` (schema WM under `.mastra/`, Evolution store under `.evolution/`).
