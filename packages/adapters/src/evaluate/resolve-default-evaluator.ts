import { HOBBY_SKILL_AUTONOMY, parseAutonomy } from '@mastra-evolution/core';

import { createBoundedSkillEvaluator } from './create-bounded-skill-evaluator';
import { createMastraEvaluator } from './create-mastra-evaluator';

import type { AutonomyLevel, AutonomyName, ImprovementEvaluator } from '@mastra-evolution/core';

export function resolveDefaultEvaluator(
  autonomy: AutonomyLevel | AutonomyName,
  options: { evaluator?: ImprovementEvaluator; experimentsAvailable?: boolean },
): ImprovementEvaluator {
  if (options.evaluator) {
    return options.evaluator;
  }
  if (parseAutonomy(autonomy) >= parseAutonomy(HOBBY_SKILL_AUTONOMY)) {
    return createBoundedSkillEvaluator();
  }
  return createMastraEvaluator({
    experimentsAvailable: options.experimentsAvailable ?? false,
  });
}
