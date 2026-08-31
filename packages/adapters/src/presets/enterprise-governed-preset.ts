import {
  defaultEnterprisePromotionPolicy,
  independentUsersScopePromotionPolicy,
  type ImprovementRuntime,
} from '@mastra-evolution/core/improvement';
import { PostgresEvolutionStore, type SqlExecutor } from '@mastra-evolution/core/storage-postgres';

import { ENTERPRISE_SKILL_AUTONOMY } from '../autonomy-defaults';

import { createPresetEvolution, createPresetImprovement } from './shared/create-preset-evolution';
import { createPresetLearning } from './shared/create-preset-learning';

import type { MastraEvolution } from '../types';
import type { SharedImprovementPresetOptions } from './shared/types';
import type {
  ApprovalProvider,
  AutonomyLevel,
  AutonomyName,
  EvolutionPublisher,
  PromotionPolicy,
  ScopePromotionPolicy,
} from '@mastra-evolution/core';
import type { LearningRuntime } from '@mastra-evolution/core/learning';

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
  const { evolution, learning: boundLearning } = createPresetEvolution({
    agent: options.agent,
    workspace: options.workspace,
    store,
    learning,
    improvement,
    capabilities: options.capabilities,
  });
  return {
    store,
    learning: boundLearning,
    improvement,
    publisher: options.publisher,
    evolution,
    autonomy,
    policy,
    scopePromotion,
  };
}
