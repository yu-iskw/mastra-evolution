import { autonomyLevel, parseAutonomy } from '@mastra-evolution/core';
import { LocalEvolutionStore } from '@mastra-evolution/storage-local';
import {
  createMemorySqlExecutor,
  PostgresEvolutionStore,
} from '@mastra-evolution/storage-postgres';
import { ImmediateApprovalProvider } from '@mastra-evolution/testing';
import { describe, expect, it } from 'vitest';

import { enterpriseGovernedPreset } from './enterprise-governed-preset';

const AGENT_ID = 'analytics-agent';

describe('enterpriseGovernedPreset', () => {
  it('defaults skill autonomy to validate/L3 and uses Postgres', () => {
    const preset = enterpriseGovernedPreset({
      sql: createMemorySqlExecutor(),
      agentId: AGENT_ID,
      approval: new ImmediateApprovalProvider(),
    });
    expect(parseAutonomy(preset.autonomy)).toBe(3);
    expect(parseAutonomy(preset.autonomy)).toBe(autonomyLevel('validate'));
    expect(preset.autonomy === 'validate' || preset.autonomy === 3).toBe(true);
    expect(preset.store).toBeInstanceOf(PostgresEvolutionStore);
    expect(preset.store).not.toBeInstanceOf(LocalEvolutionStore);
    expect(
      preset.scopePromotion.canPromoteToOrganization({
        agentId: AGENT_ID,
        independentSourceCount: 2,
      }),
    ).toBe(true);
    expect(
      preset.scopePromotion.canPromoteToOrganization({
        agentId: AGENT_ID,
        independentSourceCount: 1,
      }),
    ).toBe(false);
    expect(preset.publisher).toBeUndefined();
  });
});
