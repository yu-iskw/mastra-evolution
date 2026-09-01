import { describe, expect, it } from 'vitest';

import { createBoundedSkillEvaluator } from './create-bounded-skill-evaluator';

import type { ImprovementProposal } from '@mastra-evolution/core';

const PRACTICAL_BODY = `# Use booked revenue excluding cancellations

## When to Use
- Reporting or explaining revenue figures
- User mentions billed revenue, booked revenue, or cancellations

## Instructions
1. Prefer booked revenue excluding cancellations over billed revenue.
2. When numbers are needed, read workspace metrics and subtract cancellations when both figures exist.
3. State the definition briefly before quoting figures.

## Working Memory
- Active procedure: Prefer booked revenue excluding cancellations.
- Source files in play: workspace metrics files.
- Last quoted figure and period when a number is reported.
- Project facts into these slots. Do not store tool transcripts.

## Do Not
- Do not report billed revenue as the primary booked figure.
- Do not invent numbers not present in workspace files.
`;

describe('createBoundedSkillEvaluator', () => {
  it('passes a practical skill artifact', async () => {
    const evaluation = await createBoundedSkillEvaluator().evaluate(
      skillProposal({
        name: 'use-booked-revenue-excluding-cancellations',
        description:
          'Use booked revenue excluding cancellations. Use when reporting revenue or reading metrics.md.',
        markdown: PRACTICAL_BODY,
      }),
      {},
    );
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

  it('fails thin slogan markdown', async () => {
    const evaluation = await createBoundedSkillEvaluator().evaluate(skillProposal(), {});
    expect(evaluation.verdict).toBe('fail');
    expect(evaluation.regressions).toEqual(
      expect.arrayContaining([
        'thin-skill',
        'missing-when-section',
        'missing-working-memory-section',
        'slogan-description',
      ]),
    );
  });
});

function skillProposal(
  artifact: { name: string; description?: string; markdown: string } = {
    name: 'use-booked-revenue-excluding-cancellations',
    markdown: 'Use booked revenue excluding cancellations.',
  },
): ImprovementProposal {
  const at = new Date('2026-08-31T00:00:00.000Z');
  return {
    id: 'prop-1',
    agentId: 'analytics-agent',
    scope: { type: 'agent', agentId: 'analytics-agent' },
    reason: 'Use booked revenue excluding cancellations.',
    lessonIds: ['les-1'],
    evidenceIds: ['ev-1'],
    target: { type: 'skill' },
    candidateArtifact: artifact,
    status: 'draft',
    version: 0,
    createdAt: at,
    updatedAt: at,
  };
}
