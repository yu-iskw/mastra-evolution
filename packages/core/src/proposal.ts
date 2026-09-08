import type { EvolutionScope } from './scope';

export type ImprovementTarget =
  | { type: 'skill'; skillId?: string }
  | { type: 'instructions' }
  | { type: 'workflow'; workflowId: string }
  | { type: 'tool-policy'; toolId?: string };

export type EvaluationVerdict = 'pass' | 'fail' | 'inconclusive';

export interface ImprovementEvaluation {
  baselineScore?: number;
  candidateScore?: number;
  regressions: string[];
  verdict: EvaluationVerdict;
  error?: string;
}

export type ProposalStatus =
  | 'draft'
  | 'evaluating'
  | 'awaiting-approval'
  | 'approved'
  | 'rejected'
  | 'published'
  | 'rolled-back';

export interface ImprovementProposal {
  id: string;
  agentId: string;
  scope: EvolutionScope;
  reason: string;
  lessonIds: string[];
  evidenceIds: string[];
  target: ImprovementTarget;
  baselineRevision?: string;
  candidateRevision?: string;
  candidateArtifact: unknown;
  evaluation?: ImprovementEvaluation;
  status: ProposalStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ApprovedImprovementProposal = ImprovementProposal & {
  status: 'approved';
};

export interface PublishedRevision {
  revision: string;
  previousRevision?: string;
}

export interface EvaluationContext {
  datasetId?: string;
  baselineTargetId?: string;
  candidateTargetId?: string;
}
