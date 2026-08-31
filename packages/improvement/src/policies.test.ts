import { describe, expect, it } from 'vitest';

import {
  approvalAutonomyPolicy,
  composePromotionPolicies,
  defaultEnterprisePromotionPolicy,
  defaultHobbyPromotionPolicy,
  evidenceThresholdPolicy,
  independentUsersScopePromotionPolicy,
  regressionPolicy,
  scopePolicy,
  securityPolicy,
} from './policies';

import type {
  ImprovementEvaluation,
  ImprovementProposal,
  PromotionContext,
} from '@mastra-evolution/core';

const PASS: ImprovementEvaluation = {
  verdict: 'pass',
  regressions: [],
  baselineScore: 1,
  candidateScore: 1,
};
const FAIL: ImprovementEvaluation = { verdict: 'fail', regressions: ['r1'] };
const INCONCLUSIVE: ImprovementEvaluation = { verdict: 'inconclusive', regressions: [] };

describe('promotion policies', () => {
  it('independentUsersScopePromotionPolicy allows two users and rejects one', () => {
    const policy = independentUsersScopePromotionPolicy();
    expect(
      policy.canPromoteToOrganization({ agentId: 'analytics-agent', independentSourceCount: 2 }),
    ).toBe(true);
    expect(
      policy.canPromoteToOrganization({ agentId: 'analytics-agent', independentSourceCount: 1 }),
    ).toBe(false);
  });

  it('scopePolicy rejects organization promotion from a single independent source', async () => {
    const proposal = sampleProposal({ scope: { type: 'organization', organizationId: 'acme' } });
    await expect(
      scopePolicy().decide(proposal, PASS, context({ independentSourceCount: 1 })),
    ).resolves.toMatchObject({ decision: 'reject' });
    await expect(
      scopePolicy().decide(proposal, PASS, context({ independentSourceCount: 2 })),
    ).resolves.toMatchObject({ decision: 'publish' });
  });

  it('regressionPolicy rejects fail, regressions, and inconclusive verdicts', async () => {
    const proposal = sampleProposal();
    await expect(regressionPolicy().decide(proposal, FAIL, context())).resolves.toMatchObject({
      decision: 'reject',
    });
    await expect(
      regressionPolicy().decide(
        proposal,
        { verdict: 'pass', regressions: ['still-broken'] },
        context(),
      ),
    ).resolves.toMatchObject({ decision: 'reject' });
    await expect(
      regressionPolicy().decide(proposal, INCONCLUSIVE, context()),
    ).resolves.toMatchObject({ decision: 'reject', reason: 'inconclusive' });
    await expect(regressionPolicy().decide(proposal, PASS, context())).resolves.toMatchObject({
      decision: 'publish',
    });
  });

  it('securityPolicy rejects tool-policy targets and credential-like lesson text', async () => {
    await expect(
      securityPolicy().decide(sampleProposal({ target: { type: 'tool-policy' } }), PASS, context()),
    ).resolves.toMatchObject({ decision: 'reject' });
    await expect(
      securityPolicy().decide(
        sampleProposal({ reason: 'store the password in memory' }),
        PASS,
        context(),
      ),
    ).resolves.toMatchObject({ decision: 'reject' });
    await expect(securityPolicy().decide(sampleProposal(), PASS, context())).resolves.toMatchObject(
      {
        decision: 'publish',
      },
    );
  });

  it('approvalAutonomyPolicy is learning-only at L1 and publishes skills at L4', async () => {
    const proposal = sampleProposal();
    await expect(
      approvalAutonomyPolicy().decide(proposal, PASS, context({ autonomy: 1 })),
    ).resolves.toMatchObject({ decision: 'reject', reason: 'learning-only' });
    await expect(
      approvalAutonomyPolicy().decide(proposal, PASS, context({ autonomy: 3 })),
    ).resolves.toMatchObject({ decision: 'request-approval' });
    await expect(
      approvalAutonomyPolicy().decide(proposal, PASS, context({ autonomy: 4 })),
    ).resolves.toMatchObject({ decision: 'publish' });
  });

  it('evidenceThresholdPolicy is a no-op unless occurrence is present on the artifact', async () => {
    const proposal = sampleProposal();
    await expect(
      evidenceThresholdPolicy(3).decide(proposal, PASS, context()),
    ).resolves.toMatchObject({ decision: 'publish' });
    await expect(
      evidenceThresholdPolicy(3).decide(
        sampleProposal({ candidateArtifact: { occurrenceCount: 1 } }),
        PASS,
        context(),
      ),
    ).resolves.toMatchObject({ decision: 'reject' });
  });

  it('composePromotionPolicies returns the first non-publish decision', async () => {
    const composed = composePromotionPolicies(
      regressionPolicy(),
      securityPolicy(),
      approvalAutonomyPolicy(),
    );
    await expect(
      composed.decide(sampleProposal(), FAIL, context({ autonomy: 4 })),
    ).resolves.toMatchObject({ decision: 'reject' });
    await expect(
      composed.decide(sampleProposal(), PASS, context({ autonomy: 4 })),
    ).resolves.toMatchObject({ decision: 'publish' });
  });

  it('hobby L4 publishes skills while enterprise always requests approval on pass', async () => {
    const proposal = sampleProposal();
    await expect(
      defaultHobbyPromotionPolicy().decide(proposal, PASS, context({ autonomy: 4 })),
    ).resolves.toMatchObject({ decision: 'publish' });
    await expect(
      defaultEnterprisePromotionPolicy().decide(proposal, PASS, context({ autonomy: 4 })),
    ).resolves.toMatchObject({ decision: 'request-approval' });
  });
});

function context(overrides: Partial<PromotionContext> = {}): PromotionContext {
  return { autonomy: 4, independentSourceCount: 2, ...overrides };
}

function sampleProposal(overrides: Partial<ImprovementProposal> = {}): ImprovementProposal {
  const now = new Date('2026-08-31T00:00:00.000Z');
  return {
    id: 'prop-1',
    agentId: 'analytics-agent',
    scope: { type: 'resource', resourceId: 'alice' },
    reason: 'repeat correction',
    lessonIds: ['lesson-1'],
    evidenceIds: ['ev-1'],
    target: { type: 'skill' },
    candidateArtifact: {
      markdown: 'Use booked revenue excluding cancellations.',
      name: 'booked-revenue',
    },
    status: 'evaluating',
    version: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
