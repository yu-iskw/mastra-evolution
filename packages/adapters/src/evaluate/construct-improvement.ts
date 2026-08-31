import { parseAutonomy } from '@mastra-evolution/core';
import { createImprovement } from '@mastra-evolution/core/improvement';

import { HOBBY_SKILL_AUTONOMY } from '../autonomy-defaults';

import { resolveDefaultEvaluator } from './resolve-default-evaluator';

import type {
  ApprovalProvider,
  AutonomyLevel,
  AutonomyName,
  EvolutionPublisher,
  EvolutionStore,
  EvolutionTelemetry,
  ImprovementEvaluator,
  PromotionPolicy,
} from '@mastra-evolution/core';
import type { ImprovementRuntime } from '@mastra-evolution/core/improvement';

export function constructImprovement(input: {
  store: EvolutionStore;
  autonomy: AutonomyLevel | AutonomyName;
  evaluator?: ImprovementEvaluator;
  experimentsAvailable?: boolean;
  publisher?: EvolutionPublisher;
  approval?: ApprovalProvider;
  policy?: PromotionPolicy;
  telemetry?: EvolutionTelemetry;
  now?: () => Date;
  id?: () => string;
}): ImprovementRuntime {
  const level = parseAutonomy(input.autonomy);
  return createImprovement({
    store: input.store,
    evaluator: resolveDefaultEvaluator(input.autonomy, {
      evaluator: input.evaluator,
      experimentsAvailable: input.experimentsAvailable,
    }),
    publisher: input.publisher,
    approval: input.approval,
    policy: input.policy,
    autonomy: input.autonomy,
    experimentsAvailable:
      input.experimentsAvailable ?? level >= parseAutonomy(HOBBY_SKILL_AUTONOMY),
    telemetry: input.telemetry,
    now: input.now,
    id: input.id,
  });
}
