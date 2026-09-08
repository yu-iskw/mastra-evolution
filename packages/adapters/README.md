# Skill Loop adapters

`@mastra-evolution/adapters` connects Skill Loop to existing Mastra agents and supplies
the local skill publisher. Package names stay compatible during the rebrand.

## Main surfaces

| API                                                           | Purpose                                                                |
| ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `createMastraEvolution({ agent, workspace, learning: true })` | Collect lessons from workspace failures and explicit extractor signals |
| `createSkillValidator()`                                      | Validate skill structure; no behavioral performance scores             |
| `FilesystemSkillPublisher`                                    | Stage drafts, publish accepted content, restore baselines              |
| `resolveEvolutionWorkspaceLayout(directory)`                  | Configure curated and learned skill roots                              |

Use the [reviewed local demo](../../examples/local-self-improvement) first. For an
existing agent, the app owns Agent, Workspace, and Memory; Skill Loop never replaces
`generate`, `stream`, or memory configuration. Explicit corrections enter through
`extractor().onExtracted(signal)`. Successful tool results are not automatically
recorded as lessons.

`improvement: true` defaults to reviewed mode. Configure an evaluator and an
`ApprovalProvider` for publication, or use `createImprovement` directly for explicit
review operations. Default structural validation does not authorize automatic
publication; custom behavioral evaluators remain supported. Learning and publication
are independently enableable.

`applyToCall` remains an escape hatch for assigned/non-workspace tools. `register`
returns the original agent and is deprecated. `createBoundedSkillEvaluator` is a
deprecated alias of `createSkillValidator`.

The local publisher supports one writer. `writeDraft` exports a draft outside the
active skill root; `publish` performs activation and supports retry by proposal ID.
`publishVersion` is a deprecated alias of `publish`. Rollback restores saved content.
Remote providers remain Mastra's responsibility; this publisher is local only.

See [migration notes](../../docs/skill-loop-migration.md), [ownership
ADR](../../docs/adr/0005-evolution-layer-ownership-on-existing-mastra-agents.md), and
[Skill Loop contract](../../docs/adr/0006-reviewed-skill-loop.md).
