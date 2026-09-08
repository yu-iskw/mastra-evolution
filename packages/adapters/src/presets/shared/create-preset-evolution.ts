import { createMastraEvolution } from '../../create-mastra-evolution';
import { constructImprovement } from '../../evaluate/construct-improvement';

import type { SharedImprovementPresetOptions, SharedPresetOptions } from './types';
import type { MastraEvolution } from '../../types';
import type {
  ApprovalProvider,
  AutonomyLevel,
  AutonomyName,
  EvolutionPublisher,
  EvolutionStore,
  PromotionPolicy,
} from '@mastra-evolution/core';
import type { ImprovementRuntime } from '@mastra-evolution/core/improvement';
import type { LearningRuntime } from '@mastra-evolution/core/learning';

export function createPresetImprovement(
  store: EvolutionStore,
  options: SharedImprovementPresetOptions,
  extras: {
    autonomy: AutonomyLevel | AutonomyName;
    publisher?: EvolutionPublisher;
    approval?: ApprovalProvider;
    policy?: PromotionPolicy;
  },
): ImprovementRuntime {
  return constructImprovement({
    store,
    autonomy: extras.autonomy,
    evaluator: options.evaluator,
    experimentsAvailable: options.experimentsAvailable,
    publisher: extras.publisher,
    approval: extras.approval ?? options.approval,
    policy: extras.policy,
    telemetry: options.telemetry,
    now: options.now,
    id: options.id,
  });
}

export function createPresetEvolution(options: {
  agent?: unknown;
  workspace?: unknown;
  store: EvolutionStore;
  learning: LearningRuntime;
  improvement: ImprovementRuntime | { enabled: boolean };
  capabilities?: SharedPresetOptions['capabilities'];
}): { evolution: MastraEvolution; learning: LearningRuntime } {
  const evolution = createMastraEvolution({
    agent: options.agent,
    workspace: options.workspace,
    store: options.store,
    learning: options.learning,
    improvement: options.improvement,
    capabilities: options.capabilities,
  });
  const learning = evolution.learning;
  if (!isBoundLearningRuntime(learning)) {
    throw new Error('createPresetEvolution expected a learning runtime on MastraEvolution');
  }
  return { evolution, learning };
}

function isBoundLearningRuntime(value: MastraEvolution['learning']): value is LearningRuntime {
  return value !== undefined && 'draftSkill' in value && typeof value.draftSkill === 'function';
}
