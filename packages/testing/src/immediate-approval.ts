import type {
  ApprovalDecision,
  ApprovalProvider,
  ImprovementProposal,
} from '@mastra-evolution/core';

export class ImmediateApprovalProvider implements ApprovalProvider {
  constructor(private readonly decision: ApprovalDecision = { decision: 'approved' }) {}

  requestApproval(_proposal: ImprovementProposal): Promise<ApprovalDecision> {
    return Promise.resolve(this.decision);
  }
}
