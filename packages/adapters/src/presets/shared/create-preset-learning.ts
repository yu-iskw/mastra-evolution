import { createLearning } from '@mastra-evolution/core/learning';

import { LEARN_AUTONOMY } from '../../autonomy-defaults';

import type { SharedPresetOptions } from './types';
import type { AutonomyLevel, AutonomyName, EvolutionStore } from '@mastra-evolution/core';
import type { LearningRuntime } from '@mastra-evolution/core/learning';

export function createPresetLearning(
  store: EvolutionStore,
  options: SharedPresetOptions & { autonomy?: AutonomyLevel | AutonomyName },
): LearningRuntime {
  return createLearning({
    store,
    agentId: options.agentId,
    autonomy: options.autonomy ?? LEARN_AUTONOMY,
    acceptThreshold: options.acceptThreshold,
    sync: options.sync,
    redactor: options.redactor,
    telemetry: options.telemetry,
    now: options.now,
    id: options.id,
  });
}
