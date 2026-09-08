import { describe, expect, it } from 'vitest';

import { VersionConflictError } from '../domain';
import {
  ImmediateApprovalProvider,
  InMemoryEvolutionStore,
  RecordingPublisher,
  ScriptedEvaluator,
  buildEvidence,
} from '../testing';

import { createImprovement } from './create-improvement';
import { defaultEnterprisePromotionPolicy, defaultHobbyPromotionPolicy } from './policies';

import type { CreateImprovementOptions } from './create-improvement';
import type { ImprovementEvaluation, ImprovementProposal, Lesson } from '../domain';

const AGENT_ID = 'analytics-agent';
const NOW = new Date('2026-08-31T00:00:00.000Z');

const PASS_EVALUATION: ImprovementEvaluation = {
  verdict: 'pass',
  baselineScore: 0.4,
  candidateScore: 0.9,
  regressions: [],
};

const FAIL_EVALUATION: ImprovementEvaluation = {
  verdict: 'fail',
  baselineScore: 0.8,
  candidateScore: 0.2,
  regressions: ['booked-revenue-case'],
};

describe('createImprovement', () => {
  it('AE5: rejects promotion when the evaluator fails and does not publish', async () => {
    const { runtime, publisher, store } = setupRuntime({
      autonomy: 'auto-promote-bounded',
      evaluator: new ScriptedEvaluator([FAIL_EVALUATION]),
    });
    const proposal = await runtime.proposeFromLesson(sampleLesson());
    const promoted = await runtime.promote(proposal.id);

    expect(runtime.autonomy).toBe(4);
    expect(promoted.status).toBe('rejected');
    expect(publisher.published).toHaveLength(0);
    const stored = await store.getProposal(proposal.id);
    expect(stored?.status).toBe('rejected');
  });

  it('publishes a passing skill once under L4 hobby policy and records evolution.promote', async () => {
    const { runtime, publisher, store } = setupRuntime({
      autonomy: 4,
      policy: defaultHobbyPromotionPolicy(),
      evaluator: new ScriptedEvaluator([PASS_EVALUATION]),
    });
    const proposed = await runtime.proposeFromLesson(sampleLesson());
    const evaluated = await runtime.evaluate(proposed.id);

    expect(evaluated.evaluation?.verdict).toBe('pass');
    expect(evaluated.evaluation?.candidateScore).toBeGreaterThanOrEqual(
      evaluated.evaluation?.baselineScore ?? 0,
    );
    expect(evaluated.evaluation?.regressions).toEqual([]);
    expect(evaluated.status).not.toBe('published');

    const promoted = await runtime.promote(proposed.id);
    expect(promoted.status).toBe('published');
    expect(promoted.candidateRevision).toBe('rev-1');
    expect(publisher.drafts).toHaveLength(1);
    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0]?.status).toBe('approved');

    const events = await store.findEvents(AGENT_ID);
    expect(events.some((event) => event.type === 'evolution.promote')).toBe(true);
    expect(events.some((event) => event.type === 'evolution.proposal.generate')).toBe(true);
  });

  it('records an actionable error and does not publish when experiments are unavailable', async () => {
    const { runtime, publisher } = setupRuntime({
      autonomy: 4,
      experimentsAvailable: false,
      evaluator: new ScriptedEvaluator([PASS_EVALUATION]),
    });
    const proposed = await runtime.proposeFromLesson(sampleLesson());
    const evaluated = await runtime.evaluate(proposed.id);

    expect(evaluated.status).not.toBe('published');
    expect(evaluated.evaluation?.verdict).toBe('inconclusive');
    expect(evaluated.evaluation?.error).toMatch(/experiments/i);
    expect(publisher.published).toHaveLength(0);

    const promoted = await runtime.promote(proposed.id);
    expect(promoted.status).not.toBe('published');
    expect(publisher.published).toHaveLength(0);
  });

  it('keeps L3 enterprise promotions awaiting approval when no provider is configured', async () => {
    const { runtime, publisher } = setupRuntime({
      autonomy: 'validate',
      policy: defaultEnterprisePromotionPolicy(),
      evaluator: new ScriptedEvaluator([PASS_EVALUATION]),
    });
    const proposed = await runtime.proposeFromLesson(sampleLesson());
    const promoted = await runtime.promote(proposed.id);

    expect(promoted.status).toBe('awaiting-approval');
    expect(publisher.published).toHaveLength(0);
  });

  it('publishes after ImmediateApprovalProvider approves an L3 pass', async () => {
    const { runtime, publisher } = setupRuntime({
      autonomy: 3,
      approval: new ImmediateApprovalProvider({ decision: 'approved' }),
      evaluator: new ScriptedEvaluator([PASS_EVALUATION]),
    });
    const proposed = await runtime.proposeFromLesson(sampleLesson());
    const promoted = await runtime.promote(proposed.id);

    expect(promoted.status).toBe('published');
    expect(publisher.published).toHaveLength(1);
  });

  it('rejects and does not publish when the approval provider rejects', async () => {
    const { runtime, publisher } = setupRuntime({
      autonomy: 'validate',
      approval: new ImmediateApprovalProvider({ decision: 'rejected', reason: 'not now' }),
      evaluator: new ScriptedEvaluator([PASS_EVALUATION]),
    });
    const proposed = await runtime.proposeFromLesson(sampleLesson());
    const promoted = await runtime.promote(proposed.id);

    expect(promoted.status).toBe('rejected');
    expect(publisher.published).toHaveLength(0);
  });

  it('rejects a tool-policy target and credentials mentioned in the reason', async () => {
    const toolPolicy = setupRuntime({
      autonomy: 4,
      evaluator: new ScriptedEvaluator([PASS_EVALUATION]),
    });
    const toolProposal = await toolPolicy.runtime.proposeFromLesson(sampleLesson());
    await toolPolicy.store.putProposal({
      ...toolProposal,
      target: { type: 'tool-policy', toolId: 'secrets' },
    });
    const toolPromoted = await toolPolicy.runtime.promote(toolProposal.id);
    expect(toolPromoted.status).toBe('rejected');
    expect(toolPolicy.publisher.published).toHaveLength(0);

    const secrets = setupRuntime({
      autonomy: 4,
      evaluator: new ScriptedEvaluator([PASS_EVALUATION]),
    });
    const secretLesson = sampleLesson({
      id: 'lesson-secret',
      statement: 'Persist the api key in the skill markdown.',
    });
    const secretProposal = await secrets.runtime.proposeFromLesson(secretLesson);
    const secretPromoted = await secrets.runtime.promote(secretProposal.id);
    expect(secretPromoted.status).toBe('rejected');
    expect(secrets.publisher.published).toHaveLength(0);
  });

  it('allows one concurrent publish and throws VersionConflictError for the same id and version', async () => {
    const { runtime, store } = setupRuntime({
      autonomy: 4,
      evaluator: new ScriptedEvaluator([PASS_EVALUATION, PASS_EVALUATION]),
    });
    const proposed = await runtime.proposeFromLesson(sampleLesson());
    await runtime.evaluate(proposed.id);

    const [first, second] = await Promise.allSettled([
      runtime.promote(proposed.id),
      runtime.promote(proposed.id),
    ]);
    const outcomes = [first, second];
    const fulfilled = outcomes.filter(
      (item): item is PromiseFulfilledResult<ImprovementProposal> => item.status === 'fulfilled',
    );
    const rejected = outcomes.filter(
      (item): item is PromiseRejectedResult => item.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(VersionConflictError);
    await expect(store.putProposal({ ...fulfilled[0].value })).rejects.toBeInstanceOf(
      VersionConflictError,
    );
  });

  it('rollback restores the previous revision id on the publisher and result', async () => {
    const { runtime, publisher } = setupRuntime({
      autonomy: 4,
      evaluator: new ScriptedEvaluator([PASS_EVALUATION]),
    });
    const proposed = await runtime.proposeFromLesson(sampleLesson(), {
      markdown: 'skill',
      name: 'booked-revenue',
    });
    const published = await runtime.promote(proposed.id);
    expect(published.candidateRevision).toBe('rev-1');

    const rolled = await runtime.rollback(published.id);
    expect(rolled.status).toBe('rolled-back');
    expect(publisher.rolledBack).toHaveLength(1);
    expect(publisher.rolledBack[0]?.id).toBe(published.id);
    expect(rolled.candidateRevision).toBe(published.baselineRevision ?? 'rev-0');
  });

  it('does not publish when autonomy is learning-only L1', async () => {
    const { runtime, publisher } = setupRuntime({
      autonomy: 'learn',
      evaluator: new ScriptedEvaluator([PASS_EVALUATION]),
    });
    const proposed = await runtime.proposeFromLesson(sampleLesson());
    const promoted = await runtime.promote(proposed.id);

    expect(promoted.status).toBe('rejected');
    expect(publisher.published).toHaveLength(0);
  });

  it('honors options.autonomy when no policy is provided', async () => {
    const hobby = setupRuntime({
      autonomy: 'auto-promote-bounded',
      evaluator: new ScriptedEvaluator([PASS_EVALUATION]),
    });
    const hobbyProposal = await hobby.runtime.proposeFromLesson(sampleLesson());
    const hobbyPromoted = await hobby.runtime.promote(hobbyProposal.id);
    expect(hobbyPromoted.status).toBe('published');
    expect(hobby.publisher.published).toHaveLength(1);

    const enterprise = setupRuntime({
      autonomy: 'validate',
      evaluator: new ScriptedEvaluator([PASS_EVALUATION]),
    });
    const enterpriseProposal = await enterprise.runtime.proposeFromLesson(sampleLesson());
    const enterprisePromoted = await enterprise.runtime.promote(enterpriseProposal.id);
    expect(enterprisePromoted.status).toBe('awaiting-approval');
    expect(enterprise.publisher.published).toHaveLength(0);
  });

  it('stores a default skill artifact from the lesson statement', async () => {
    const { store, runtime } = setupRuntime({
      autonomy: 4,
      evaluator: new ScriptedEvaluator([PASS_EVALUATION]),
    });
    await store.putEvidence(
      buildEvidence({
        id: 'ev-1',
        agentId: AGENT_ID,
        summary: 'Use booked revenue excluding cancellations.',
      }),
    );
    const proposed = await runtime.proposeFromLesson(sampleLesson());
    expect(proposed.target).toEqual({ type: 'skill' });
    expect(proposed.status).toBe('draft');
    const artifact = proposed.candidateArtifact as {
      name: string;
      description: string;
      markdown: string;
    };
    expect(artifact.name).toBe('use-booked-revenue-excluding-cancellations');
    expect(artifact.description).toMatch(/Use when/i);
    expect(artifact.markdown).toContain('## When to Use');
    expect(artifact.markdown).toContain('## Instructions');
    expect(artifact.markdown).toContain('## Working Memory');
    expect(artifact.markdown).not.toBe(sampleLesson().statement);
    expect(proposed.lessonIds).toEqual(['lesson-1']);
    expect(proposed.evidenceIds).toEqual(['ev-1']);
  });
});

function setupRuntime(
  overrides: Partial<
    Pick<
      CreateImprovementOptions,
      'autonomy' | 'evaluator' | 'approval' | 'policy' | 'experimentsAvailable'
    >
  > = {},
): {
  runtime: ReturnType<typeof createImprovement>;
  store: InMemoryEvolutionStore;
  publisher: RecordingPublisher;
} {
  const store = new InMemoryEvolutionStore();
  const publisher = new RecordingPublisher();
  const runtime = createImprovement({
    store,
    publisher,
    evaluator: overrides.evaluator,
    approval: overrides.approval,
    policy: overrides.policy,
    autonomy: overrides.autonomy,
    experimentsAvailable: overrides.experimentsAvailable,
    now: () => NOW,
  });
  return { runtime, store, publisher };
}

function sampleLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'lesson-1',
    agentId: AGENT_ID,
    scope: { type: 'resource', resourceId: 'alice' },
    kind: 'procedure',
    statement: 'Use booked revenue excluding cancellations.',
    evidenceIds: ['ev-1'],
    confidence: 0.8,
    occurrenceCount: 3,
    firstObservedAt: NOW,
    lastObservedAt: NOW,
    status: 'accepted',
    ...overrides,
  };
}
