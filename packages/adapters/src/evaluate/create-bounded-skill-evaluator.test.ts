import { describe, expect, it } from 'vitest';

import { createBoundedSkillEvaluator } from './create-bounded-skill-evaluator';

import type { ImprovementProposal } from '@mastra-evolution/core';

describe('createBoundedSkillEvaluator', () => {
  it('passes a skill proposal with markdown', async () => {
    const evaluation = await createBoundedSkillEvaluator().evaluate(skillProposal(), {});
    expect(evaluation.verdict).toBe('pass');
    expect(evaluation.regressions).toEqual([]);
  });

  it('fails a non-skill target', async () => {
    const evaluation = await createBoundedSkillEvaluator().evaluate(
      { ...skillProposal(), target: { type: 'instructions' } },
      {},
    );
    expect(evaluation.verdict).toBe('fail');
    expect(evaluation.regressions).toContain('not-a-skill');
  });

  it('fails when markdown is missing', async () => {
    const evaluation = await createBoundedSkillEvaluator().evaluate(
      { ...skillProposal(), candidateArtifact: { name: 'empty' } },
      {},
    );
    expect(evaluation.verdict).toBe('fail');
    expect(evaluation.regressions).toContain('empty-skill');
  });
});

function skillProposal(): ImprovementProposal {
  const at = new Date('2026-08-31T00:00:00.000Z');
  return {
    id: 'prop-1',
    agentId: 'analytics-agent',
    scope: { type: 'agent', agentId: 'analytics-agent' },
    reason: 'Use booked revenue excluding cancellations.',
    lessonIds: ['les-1'],
    evidenceIds: ['ev-1'],
    target: { type: 'skill' },
    candidateArtifact: {
      name: 'use-booked-revenue-excluding-cancellations',
      markdown: 'Use booked revenue excluding cancellations.',
    },
    status: 'draft',
    version: 0,
    createdAt: at,
    updatedAt: at,
  };
}
