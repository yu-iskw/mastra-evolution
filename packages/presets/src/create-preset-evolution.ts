import { createImprovement } from '@mastra-evolution/improvement';
import { createMastraEvaluator, createMastraEvolution } from '@mastra-evolution/mastra';

import type { SharedImprovementPresetOptions, SharedPresetOptions } from './types';
import type {
  ApprovalProvider,
  AutonomyLevel,
  AutonomyName,
  EvolutionPublisher,
  EvolutionStore,
  ImprovementEvaluator,
  PromotionPolicy,
} from '@mastra-evolution/core';
import type { ImprovementRuntime } from '@mastra-evolution/improvement';
import type { LearningRuntime } from '@mastra-evolution/learning';
import type { MastraEvolution } from '@mastra-evolution/mastra';

function resolvePresetEvaluator(
  options: Pick<SharedImprovementPresetOptions, 'evaluator' | 'experimentsAvailable'>,
): ImprovementEvaluator {
  return (
    options.evaluator ??
    createMastraEvaluator({
      experimentsAvailable: options.experimentsAvailable ?? false,
    })
  );
}

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
  return createImprovement({
    store,
    evaluator: resolvePresetEvaluator(options),
    publisher: extras.publisher,
    approval: extras.approval ?? options.approval,
    policy: extras.policy,
    autonomy: extras.autonomy,
    experimentsAvailable: options.experimentsAvailable,
    telemetry: options.telemetry,
    now: options.now,
    id: options.id,
  });
}

export function createPresetEvolution(options: {
  agent?: unknown;
  store: EvolutionStore;
  learning: LearningRuntime;
  improvement: ImprovementRuntime | { enabled: boolean };
  capabilities?: SharedPresetOptions['capabilities'];
}): MastraEvolution {
  return createMastraEvolution({
    agent: options.agent,
    store: options.store,
    learning: options.learning,
    improvement: options.improvement,
    capabilities: options.capabilities,
  });
}
