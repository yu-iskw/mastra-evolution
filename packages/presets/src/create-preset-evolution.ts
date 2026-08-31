import { createMastraEvaluator, createMastraEvolution } from '@mastra-evolution/mastra';

import type { SharedImprovementPresetOptions, SharedPresetOptions } from './types';
import type { EvolutionStore, ImprovementEvaluator } from '@mastra-evolution/core';
import type { ImprovementRuntime } from '@mastra-evolution/improvement';
import type { LearningRuntime } from '@mastra-evolution/learning';
import type { MastraEvolution } from '@mastra-evolution/mastra';

export function resolvePresetEvaluator(
  options: Pick<SharedImprovementPresetOptions, 'evaluator' | 'experimentsAvailable'>,
): ImprovementEvaluator {
  return (
    options.evaluator ??
    createMastraEvaluator({
      experimentsAvailable: options.experimentsAvailable ?? false,
    })
  );
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
