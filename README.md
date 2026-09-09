# Skill Loop for Mastra

Improve agent skills through changes you can inspect, check, and undo. Apache-2.0.

**Skill Loop** turns explicit corrections and observations into proposed `SKILL.md`
updates. Review a candidate, validate its structure, accept or reject it, and restore
the previous content if needed. Mastra continues to own agent execution, workspace
access, and memory.

Previously **Mastra Evolution**. Package names and existing factory imports remain
`@mastra-evolution/*` during this transition; no repository or npm namespace migration
is required. See the [migration notes](docs/skill-loop-migration.md) for behavior changes.

## Try one complete loop

No model API key, database server, or HTTP server is needed:

```bash
pnpm install
pnpm build
pnpm --filter @mastra-evolution/example-local-self-improvement demo propose
```

The demo records a developer-supplied revenue correction, prints the before/after
content, and saves a draft **outside** the active skills directory. It prints a
proposal ID for the next command:

```bash
pnpm --filter @mastra-evolution/example-local-self-improvement demo accept <proposal-id>
pnpm --filter @mastra-evolution/example-local-self-improvement demo revert <proposal-id>
# Or reject a proposal before accepting it:
pnpm --filter @mastra-evolution/example-local-self-improvement demo reject <proposal-id>
```

The demo keeps its state between runs. `accept` is an explicit human decision;
structural validation alone does not establish better agent behavior. To measure
improvement, supply an evaluator that compares candidate and baseline behavior on
representative cases. [Example details](examples/local-self-improvement).

## Small, explicit operations

The existing improvement runtime is the review API:

| User action | API                         | Result                                                                 |
| ----------- | --------------------------- | ---------------------------------------------------------------------- |
| Propose     | `proposeFromLesson(lesson)` | A stored candidate, no active file changes                             |
| Check       | `evaluate(id)`              | Validation/evaluation result; inconclusive changes stay pending        |
| Accept      | `promote(id)`               | Applies policy and reviewer approval, then publishes                   |
| Reject      | `reject(id)`                | Ends a pending change without publication                              |
| Revert      | `rollback(id)`              | Restores the prior active content, or removes a newly introduced skill |

`createImprovement` defaults to reviewed promotion. Supply an `ApprovalProvider`
that represents a real reviewer decision. The demo supplies approval only when its
explicit `accept` command is run. A failed check cannot publish under the built-in
policies. Repeated acceptance of a published proposal does not create another revision.

## Connect an existing Mastra agent

Use `createMastraEvolution({ agent, workspace, learning: true })` to collect lessons.
The app owns the Agent, Workspace, and optional Memory. The adapter captures workspace
tool failures; explicit corrections come through `extractor().onExtracted(...)`.
Successful tool calls are not automatically treated as lessons.

Learning can operate without skill publication. `improvement: true` now selects
reviewed mode; automatic publication requires an explicit policy and a meaningful
external evaluator. See the [adapter guide](packages/adapters/README.md).

**Supported Mastra:** `@mastra/core >=1.63.0 <2` (pinned integration version: `1.63.2`).

## Scope and limits

- One artifact type: agent skills. No automatic code, workflow, or tool-policy rewriting.
- Local, single-writer publication first. One publisher instance serializes its own
  operations; applications must serialize the review workflow and avoid multiple
  processes writing the same directory.
- Drafts and active skills are separate. Publication saves a pending revision before
  atomically replacing the active file. After interruption, retry the same proposal.
  Individual files are atomic; the store and publisher are not one transaction.
- Only the current revision of a skill can be reverted. External edits are preserved
  when rollback detects a mismatch.
- Mastra owns remote filesystem providers. This release's publisher is local;
  PostgreSQL state storage does not make skill publication remote or distributed.

[Product contract and design](docs/adr/0006-reviewed-skill-loop.md).

## Packages and development

| Package                      | Responsibility                                                             |
| ---------------------------- | -------------------------------------------------------------------------- |
| `@mastra-evolution/core`     | Lessons, proposals, review policies, local/PostgreSQL stores, test helpers |
| `@mastra-evolution/adapters` | Mastra integration, structural skill validator, local publisher            |

```bash
pnpm build
pnpm test
pnpm lint
```

Default tests make no paid model calls. The [local example](examples/local-self-improvement)
also contains an optional HTTP integration. [Cloud Run](examples/cloud-run-a2a) is an
advanced deployment example. See [CONTRIBUTING.md](CONTRIBUTING.md).
