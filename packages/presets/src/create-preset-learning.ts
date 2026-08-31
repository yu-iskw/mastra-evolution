import { createLearning } from '@mastra-evolution/learning';

import { LEARN_AUTONOMY } from './autonomy-defaults';

import type { SharedPresetOptions } from './types';
import type { EvolutionStore } from '@mastra-evolution/core';
import type { LearningRuntime } from '@mastra-evolution/learning';

export function createPresetLearning(
  store: EvolutionStore,
  options: SharedPresetOptions,
): LearningRuntime {
  return createLearning({
    store,
    agentId: options.agentId,
    autonomy: LEARN_AUTONOMY,
    acceptThreshold: options.acceptThreshold,
    sync: options.sync,
    redactor: options.redactor,
    telemetry: options.telemetry,
    now: options.now,
    id: options.id,
  });
}
