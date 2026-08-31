import type {
  EvaluationContext,
  ImprovementEvaluation,
  ImprovementEvaluator,
  ImprovementProposal,
} from '@mastra-evolution/core';

export class ScriptedEvaluator implements ImprovementEvaluator {
  private readonly queue: ImprovementEvaluation[];

  constructor(results: ImprovementEvaluation[]) {
    this.queue = [...results];
  }

  evaluate(
    _proposal: ImprovementProposal,
    _context: EvaluationContext,
  ): Promise<ImprovementEvaluation> {
    const next = this.queue.shift();
    if (!next) {
      return Promise.resolve({
        verdict: 'inconclusive',
        regressions: [],
        error: 'no scripted result',
      });
    }
    return Promise.resolve(next);
  }
}
