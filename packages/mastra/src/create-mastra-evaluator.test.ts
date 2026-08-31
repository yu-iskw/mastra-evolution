import { describe, expect, it } from 'vitest';

import { createMastraEvaluator, EXPERIMENTS_UNAVAILABLE_ERROR } from './create-mastra-evaluator';
import { createMastraEvolution } from './create-mastra-evolution';

import type { ImprovementProposal } from '@mastra-evolution/core';

const proposal: ImprovementProposal = {
  id: 'prop-eval',
  agentId: 'analytics-agent',
  scope: { type: 'agent', agentId: 'analytics-agent' },
  reason: 'Evaluate skill candidate',
  lessonIds: [],
  evidenceIds: [],
  target: { type: 'skill' },
  candidateArtifact: { name: 'booked-revenue' },
  status: 'evaluating',
  version: 1,
  createdAt: new Date('2026-08-31T00:00:00.000Z'),
  updatedAt: new Date('2026-08-31T00:00:00.000Z'),
};

describe('createMastraEvaluator', () => {
  it('cannot auto-pass when experiments are missing; evaluate sets error and does not throw', async () => {
    const evolution = createMastraEvolution({ agent: {} });
    expect(evolution.capabilities.experiments).toBe(false);
    const evaluator = createMastraEvaluator({
      experimentsAvailable: evolution.capabilities.experiments,
    });
    await expect(evaluator.evaluate(proposal, {})).resolves.toEqual({
      verdict: 'inconclusive',
      regressions: [],
      error: EXPERIMENTS_UNAVAILABLE_ERROR,
    });
  });

  it('delegates to run when an external evaluator is provided', async () => {
    const evaluator = createMastraEvaluator({
      experimentsAvailable: false,
      run: () => Promise.resolve({ verdict: 'pass' as const, regressions: [] }),
    });
    await expect(evaluator.evaluate(proposal, { datasetId: 'ds-1' })).resolves.toEqual({
      verdict: 'pass',
      regressions: [],
    });
  });

  it('documents that memory-enabled agents need an inline experiment task with threadId and resourceId (KTD5)', async () => {
    // Memory-enabled agents need an inline experiment task with `{ threadId, resourceId }`
    // and pre-created threads (KTD5). createMastraEvaluator does not synthesize those ids.
    const evaluator = createMastraEvaluator({ experimentsAvailable: true });
    const result = await evaluator.evaluate(proposal, {});
    expect(result.verdict).toBe('inconclusive');
    expect(result.error).toMatch(/threadId, resourceId/);
    expect(result.error).toMatch(/KTD5/);
  });
});
