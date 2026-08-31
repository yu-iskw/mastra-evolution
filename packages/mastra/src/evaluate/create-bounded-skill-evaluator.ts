import { isPlainObject as isRecord, stringField } from '@mastra-evolution/core';

import type {
  ImprovementEvaluation,
  ImprovementEvaluator,
  ImprovementProposal,
} from '@mastra-evolution/core';

/**
 * External hobby evaluator for L4 skill auto-promote when Mastra experiments
 * are not wired. Passes skill proposals that include markdown; fails otherwise.
 */
export function createBoundedSkillEvaluator(): ImprovementEvaluator {
  return {
    evaluate(proposal: ImprovementProposal): Promise<ImprovementEvaluation> {
      if (proposal.target.type !== 'skill') {
        return Promise.resolve({
          verdict: 'fail',
          regressions: ['not-a-skill'],
          baselineScore: 0,
          candidateScore: 0,
        });
      }
      const markdown = markdownFromArtifact(proposal.candidateArtifact);
      if (markdown === undefined || markdown.trim().length === 0) {
        return Promise.resolve({
          verdict: 'fail',
          regressions: ['empty-skill'],
          baselineScore: 0,
          candidateScore: 0,
        });
      }
      return Promise.resolve({
        verdict: 'pass',
        regressions: [],
        baselineScore: 0,
        candidateScore: 1,
      });
    },
  };
}

function markdownFromArtifact(artifact: unknown): string | undefined {
  if (typeof artifact === 'string') {
    return artifact;
  }
  if (!isRecord(artifact)) {
    return undefined;
  }
  return stringField(artifact, 'markdown');
}
