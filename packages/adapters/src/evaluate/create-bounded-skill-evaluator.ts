import { isPlainObject as isRecord, stringField } from '@mastra-evolution/core';
import { validatePracticalSkillArtifact } from '@mastra-evolution/core/learning';

import type {
  ImprovementEvaluation,
  ImprovementEvaluator,
  ImprovementProposal,
} from '@mastra-evolution/core';

/**
 * Validate practical Agent Skills structure. A pass is not evidence of improved
 * agent behavior and must not authorize automatic publication.
 */
export function createSkillValidator(): ImprovementEvaluator {
  return {
    evaluate(proposal: ImprovementProposal): Promise<ImprovementEvaluation> {
      if (proposal.target.type !== 'skill') {
        return Promise.resolve(failed(['not-a-skill']));
      }
      const artifact = fieldsFromArtifact(proposal.candidateArtifact);
      if (artifact.markdown.trim().length === 0) {
        return Promise.resolve(failed(['empty-skill']));
      }
      const regressions = validatePracticalSkillArtifact(artifact);
      if (regressions.length > 0) {
        return Promise.resolve(failed(regressions));
      }
      return Promise.resolve({
        verdict: 'pass',
        regressions: [],
        kind: 'structural',
      });
    },
  };
}

function failed(regressions: string[]): ImprovementEvaluation {
  return {
    verdict: 'fail',
    regressions,
    kind: 'structural',
  };
}

function fieldsFromArtifact(artifact: unknown): {
  name: string;
  description: string;
  markdown: string;
} {
  if (typeof artifact === 'string') {
    return { name: '', description: '', markdown: artifact };
  }
  if (!isRecord(artifact)) {
    return { name: '', description: '', markdown: '' };
  }
  return {
    name: stringField(artifact, 'name') ?? '',
    description: stringField(artifact, 'description') ?? '',
    markdown: stringField(artifact, 'markdown') ?? stringField(artifact, 'instructions') ?? '',
  };
}

/** @deprecated Use createSkillValidator; this checks structure, not agent behavior. */
export function createBoundedSkillEvaluator(): ImprovementEvaluator {
  return createSkillValidator();
}
