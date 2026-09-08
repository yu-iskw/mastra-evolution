# Local Skill Loop example

Record a correction, inspect the candidate, accept or reject it, and revert it.
The introductory demo runs without a model, HTTP server, or database server.

## Run the reviewed workflow

From the repository root:

```bash
pnpm install
pnpm build
pnpm --filter @mastra-evolution/example-local-self-improvement demo propose
```

This records one deliberate developer correction: “Use booked revenue excluding
cancellations.” The demo uses `acceptThreshold: 1` for this trusted input, drafts a
skill, and validates its structure. It prints the active content, proposed content,
and proposal ID. The active skill is unchanged until you accept.

```bash
pnpm --filter @mastra-evolution/example-local-self-improvement demo accept <proposal-id>
pnpm --filter @mastra-evolution/example-local-self-improvement demo revert <proposal-id>
# Alternative to accept:
pnpm --filter @mastra-evolution/example-local-self-improvement demo reject <proposal-id>
```

Run commands sequentially. A second accept of the same published proposal reuses the
revision. Revert restores the exact baseline; for a new skill it removes `SKILL.md`.
Only the current revision of a skill may be reverted. Editing the exported draft
file does not edit the stored candidate; use `proposeFromLesson(lesson, artifact)` to
create a new proposal containing a revised artifact.

State persists in `.skill-loop-demo` relative to the example's working directory.
Set `SKILL_LOOP_DIR` to an absolute path consistently across commands to choose another
location. The demo does not delete previous state.

| Path below the demo directory                                    | Purpose                                     |
| ---------------------------------------------------------------- | ------------------------------------------- |
| `evidence.json`, `lessons.json`, `proposals.json`, `events.json` | Review state                                |
| `drafts/<id>/<skill>.md`                                         | Review export outside the active skill root |
| `skills/<skill>/SKILL.md`                                        | Accepted skill content                      |
| `skills/.evolution-versions.json`                                | Baseline snapshots and retry history        |

Structural validation checks document quality. It does not compare agent answers or
prove improved accuracy. Supply a behavioral evaluator with representative baseline
and candidate cases before relying on automatic acceptance.

To use the accepted skill in an agent, include the absolute demo `skills` directory
in the app's Mastra Workspace skill roots and configure filesystem access accordingly.
Mastra owns skill loading and refresh; the demo itself makes no agent calls.

## Optional HTTP integration

`src/create-analytics-stack.ts` and `src/index.ts` retain the existing Hono/Mastra
integration. This is separate from the review demo:

```bash
GEMINI_API_KEY=... pnpm --filter @mastra-evolution/example-local-self-improvement start
```

The server listens on port `4111` (`PORT` overrides). Without a key it still listens,
but generation requires credentials. It uses `google/gemini-flash-lite-latest` and
app-owned LibSQL Memory. The server captures lessons with `learning: true` and uses
reviewed `improvement: true`; extraction alone does not publish a skill.

```bash
curl http://localhost:4111/health
curl http://localhost:4111/evolution
curl http://localhost:4111/evolution/extract \
  -H 'content-type: application/json' \
  -d '{"kind":"correction","summary":"Use booked revenue excluding cancellations.","suggestedAction":"create-skill"}'
```

The HTTP example is disposable: it resets sibling `.evolution/` and `.mastra/` on
startup. Use a dedicated `WORKSPACE_DIR` (default `.workspace`); do not point it at
valuable agent state. It does not expose a review API; use the improvement runtime
in your application's authenticated review flow. The CLI demo uses separate state.
