import {
  defaultEnterprisePromotionPolicy,
  independentUsersScopePromotionPolicy,
} from '@mastra-evolution/improvement';
import { PostgresEvolutionStore } from '@mastra-evolution/storage-postgres';

import { ENTERPRISE_SKILL_AUTONOMY } from './shared/autonomy-defaults';
import { createPresetEvolution, createPresetImprovement } from './shared/create-preset-evolution';
import { createPresetLearning } from './shared/create-preset-learning';

import type { SharedImprovementPresetOptions } from './shared/types';
import type {
  ApprovalProvider,
  AutonomyLevel,
  AutonomyName,
  EvolutionPublisher,
  PromotionPolicy,
  ScopePromotionPolicy,
} from '@mastra-evolution/core';
import type { ImprovementRuntime } from '@mastra-evolution/improvement';
import type { LearningRuntime } from '@mastra-evolution/learning';
import type { MastraEvolution } from '@mastra-evolution/mastra';
import type { SqlExecutor } from '@mastra-evolution/storage-postgres';

const INDEPENDENT_USERS = 2;

export interface EnterpriseGovernedPresetOptions extends SharedImprovementPresetOptions {
  sql: SqlExecutor;
  approval: ApprovalProvider;
  publisher?: EvolutionPublisher;
}

export interface EnterpriseGovernedPreset {
  store: PostgresEvolutionStore;
  learning: LearningRuntime;
  improvement: ImprovementRuntime;
  publisher: EvolutionPublisher | undefined;
  evolution: MastraEvolution;
  autonomy: AutonomyLevel | AutonomyName;
  policy: PromotionPolicy;
  scopePromotion: ScopePromotionPolicy;
}

/**
 * Enterprise preset: Postgres transactional state, skill autonomy validate/L3,
 * `defaultEnterprisePromotionPolicy`, and independent-user scope promotion.
 */
export function enterpriseGovernedPreset(
  options: EnterpriseGovernedPresetOptions,
): EnterpriseGovernedPreset {
  const store = new PostgresEvolutionStore({ sql: options.sql });
  const learning = createPresetLearning(store, options);
  const autonomy = options.autonomy ?? ENTERPRISE_SKILL_AUTONOMY;
  const policy = defaultEnterprisePromotionPolicy();
  const scopePromotion = independentUsersScopePromotionPolicy(INDEPENDENT_USERS);
  const improvement = createPresetImprovement(store, options, {
    autonomy,
    publisher: options.publisher,
    approval: options.approval,
    policy,
  });
  return {
    store,
    learning,
    improvement,
    publisher: options.publisher,
    evolution: createPresetEvolution({
      agent: options.agent,
      store,
      learning,
      improvement,
      capabilities: options.capabilities,
    }),
    autonomy,
    policy,
    scopePromotion,
  };
}
