# Migrating to Skill Loop

Skill Loop is the new product name for Mastra Evolution. Keep existing package names,
imports, stores, and the two-package layout. This change does not rename the GitHub
repository or publish new npm packages.

## Behavior changes

| Previous behavior                                        | New behavior                                                        | Action                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `improvement: true` selected bounded automatic promotion | Selects reviewed mode (`validate`)                                  | Configure evaluator and reviewer explicitly                                                                   |
| Bounded validator returned fabricated scores `0` and `1` | `createSkillValidator()` reports structural validity without scores | Use a behavioral evaluator to make improvement claims                                                         |
| Structural pass could automatically publish              | Built-in automatic policy asks for approval                         | Supply a real approval decision or behavioral evaluator                                                       |
| Inconclusive checks could reject a proposal              | Remain pending                                                      | Call `evaluate(id)` again when evaluation is available                                                        |
| `writeDraft` wrote active `SKILL.md`                     | Writes a sibling `drafts/<proposal-id>/<skill>.md`                  | Treat returned file as a review export; use `publish` to activate                                             |
| `publish` / `publishVersion` only recorded metadata      | Activates the skill and saves recovery history                      | Custom publishers must own activation in `publish`; the runtime no longer calls `writeDraft` during promotion |
| Rollback changed metadata only                           | Restores actual content                                             | Revert only the current skill revision                                                                        |
| Repeated promotion could publish again                   | Completed proposals are terminal/idempotent                         | Create a new proposal to change completed content                                                             |

`createBoundedSkillEvaluator`, `publishVersion`, and the attach handle's identity-only
`register(agent)` remain available but are deprecated. Prefer `createSkillValidator`,
`publish`, and the original agent. Implementers of `ImprovementRuntime` must add the
explicit `reject(id)` operation.

## Existing local skill history

The old `.evolution-versions.json` did not record per-skill baselines or the original
active content. It cannot support reliable rollback. The new publisher refuses old
or malformed history rather than silently discarding it.

Back up the entire existing publication directory. Use a new publication directory,
copy the active skill folders you want to retain into it, and configure the publisher
and Workspace skill roots to use that directory. Do not copy the old manifest into
the new directory. The first new publication snapshots the copied baseline. Keep the
old directory for historical reference; old proposal IDs cannot be reverted in the new
history. Evidence and lesson stores can be retained.

Custom publishers need idempotent `publish` behavior to recover from a proposal-store
failure after activation. The runtime cannot make an arbitrary store and publisher
one transaction. Local deployment uses a single writer; PostgreSQL does not change
that constraint for a local publisher.

## Local demo

`demo` now runs the short reviewed workflow and requires no API key. The old 101-turn
model loop was removed. `start` remains the optional HTTP agent example, with reviewed
improvement enabled and no automatic skill publication. Its disposable state is
separate from the persistent `.skill-loop-demo` review directory.
