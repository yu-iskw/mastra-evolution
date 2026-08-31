import type {
  EvaluationContext,
  ImprovementEvaluation,
  ImprovementEvaluator,
  ImprovementProposal,
} from '@mastra-evolution/core';

export const EXPERIMENTS_UNAVAILABLE_ERROR =
  'Mastra experiments are unavailable; provide an external evaluator or leave the proposal unpublished.';

const EXPERIMENTS_RUNNER_REQUIRED_ERROR =
  'Mastra experiments are present but no runner was provided; pass `run` with an inline task `{ threadId, resourceId }` (KTD5) or leave the proposal unpublished.';

export interface CreateMastraEvaluatorOptions {
  experimentsAvailable?: boolean;
  run?: (
    proposal: ImprovementProposal,
    context: EvaluationContext,
  ) => Promise<ImprovementEvaluation>;
}

/**
 * Adapter around Mastra datasets/experiments.
 *
 * Memory-enabled agents need an inline experiment `task` that passes `{ threadId, resourceId }`
 * and pre-created threads (KTD5). This factory does not synthesize those ids; supply them via `run`.
 *
 * When `experimentsAvailable` is false and no `run` is provided, `evaluate` returns
 * `inconclusive` with an actionable error and does not throw.
 */
export function createMastraEvaluator(
  options?: CreateMastraEvaluatorOptions,
): ImprovementEvaluator {
  const experimentsAvailable = options?.experimentsAvailable ?? false;
  const run = options?.run;
  return {
    async evaluate(
      proposal: ImprovementProposal,
      context: EvaluationContext,
    ): Promise<ImprovementEvaluation> {
      if (run) {
        return run(proposal, context);
      }
      return {
        verdict: 'inconclusive',
        regressions: [],
        error: experimentsAvailable
          ? EXPERIMENTS_RUNNER_REQUIRED_ERROR
          : EXPERIMENTS_UNAVAILABLE_ERROR,
      };
    },
  };
}
