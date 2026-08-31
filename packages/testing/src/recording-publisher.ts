import type {
  ApprovedImprovementProposal,
  EvolutionPublisher,
  ImprovementProposal,
  PublishedRevision,
} from '@mastra-evolution/core';

export class RecordingPublisher implements EvolutionPublisher {
  readonly drafts: ImprovementProposal[] = [];
  readonly published: ApprovedImprovementProposal[] = [];
  readonly rolledBack: ImprovementProposal[] = [];

  writeDraft(proposal: ImprovementProposal): Promise<{ path: string }> {
    this.drafts.push(proposal);
    return Promise.resolve({ path: `drafts/${proposal.id}.md` });
  }

  publish(proposal: ApprovedImprovementProposal): Promise<PublishedRevision> {
    this.published.push(proposal);
    const revision = `rev-${this.published.length}`;
    return Promise.resolve({ revision, previousRevision: proposal.baselineRevision });
  }

  rollback(proposal: ImprovementProposal): Promise<PublishedRevision> {
    this.rolledBack.push(proposal);
    return Promise.resolve({ revision: proposal.baselineRevision ?? 'rev-0' });
  }
}
