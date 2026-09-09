# ADR-0006: Skill Loop and reviewed skill updates

## Status

Accepted. Refines ADR-0003's validation/promotion behavior and ADR-0005's ownership
boundary. Existing package names remain compatible.

## Product promise

Skill Loop helps developers maintaining existing Mastra agents turn explicit
corrections into inspectable, checked, reversible skill updates. The first user is a
developer responsible for one agent, not an operator of a general learning platform.

The first workflow is a revenue-definition correction: record the correction,
inspect the proposed skill, check it, accept or reject it, and revert if necessary.
Accepting a lesson makes it eligible for drafting; it is not approval to publish.

## Decisions

1. Skills are the supported publication target. Mastra owns execution, memory,
   filesystem providers, datasets, and observability. Keep the two-package layout.
2. Explicit review is the default. Keep existing APIs; describe their concrete
   operations rather than requiring new users to learn an autonomy taxonomy.
3. `createSkillValidator` checks structure and returns no invented behavioral scores.
   Its deprecated alias is `createBoundedSkillEvaluator`. Built-in automatic policy
   requests approval for structural passes. An inconclusive evaluation stays pending
   until explicitly evaluated again; a failing evaluation is rejected.
4. `writeDraft` stages a review document outside the active skill root. `publish`
   owns activation. Reverting restores the exact saved previous content, or removes
   the document if the proposal introduced the skill.
5. Local publication supports one writer. A compact manifest stores revision content,
   previous content, and one pending publication. Save pending intent, replace the
   active file with atomic rename, then finalize history. Retry the same immutable
   proposal after interruption. Repeated completed publication returns its revision.
6. State storage and artifact publication are separate durability boundaries. The
   local publisher is idempotent so a failed proposal-store write can be retried.
   Events are diagnostic records, not a transaction log or a source of exactly-once
   guarantees. No queue, distributed lock, or background service is introduced.
7. The introductory demo is deterministic and uses no model. It demonstrates a
   human review workflow; it makes no claim that a structural pass improves behavior.

## Boundaries and trade-offs

The local history format stores full skill snapshots in one JSON manifest. This is
simple and appropriate for a small skill collection; unbounded history and large
artifact stores are outside the initial scope. This does not provide power-loss
fsync guarantees or atomic visibility across multiple files. Readers see a complete
old or new skill document, but metadata can lag until the interrupted operation is
retried. Retry an interrupted rollback before starting another operation.

Draft files are review exports. Editing one does not change the stored candidate;
create a new proposal with the revised artifact and review that proposal.

An interrupted publication blocks other publications until the pending proposal is
retried. If an external writer changed content, inspect and reconcile it before
retrying. Run one review operation at a time, using one process per local directory.
Only the latest active revision of a particular skill can be reverted. Different
skills have independent baselines.

Remote publication is deferred until a concrete user requires it. Implement it
through Mastra's Workspace filesystem, with provider-specific publication semantics
and tests, rather than duplicating GCS/S3/Drive connectors. Mastra's [remote filesystem
announcement](https://mastra.ai/blog/remote-filesystem-support) supplies file access,
not a cross-provider transaction or distributed coordination guarantee.

## Acceptance criteria

- Rejection and drafting leave active skills untouched.
- Repeated acceptance creates one revision.
- Interrupted manifest/skill writes can be retried after publisher restart.
- Revert restores bytes, including a pre-existing unversioned skill.
- First-publication revert removes the introduced skill document.
- Reverting one skill never restores another skill's content.
- Structural validation has no baseline/candidate performance scores.
- Existing build and test gates remain; no live model is required.
