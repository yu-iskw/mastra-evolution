import { scopesEqual, VersionConflictError } from '@mastra-evolution/core';

import type {
  Evidence,
  EvidenceQuery,
  EvolutionEvent,
  EvolutionStore,
  ImprovementProposal,
  Lesson,
  LessonQuery,
} from '@mastra-evolution/core';

function cloneDate(value: Date): Date {
  return new Date(value.getTime());
}

export class InMemoryEvolutionStore implements EvolutionStore {
  private readonly evidence = new Map<string, Evidence>();
  private readonly lessons = new Map<string, Lesson>();
  private readonly proposals = new Map<string, ImprovementProposal>();
  private readonly events: EvolutionEvent[] = [];

  putEvidence(evidence: Evidence): Promise<void> {
    const identity = evidence.provenance.sourceIdentity;
    if (identity) {
      for (const [id, existing] of this.evidence.entries()) {
        if (existing.provenance.sourceIdentity === identity && existing.agentId === evidence.agentId) {
          this.evidence.delete(id);
        }
      }
    }
    this.evidence.set(evidence.id, {
      ...evidence,
      observedAt: cloneDate(evidence.observedAt),
      provenance: { ...evidence.provenance },
    });
    return Promise.resolve();
  }

  findEvidence(query: EvidenceQuery): Promise<Evidence[]> {
    return Promise.resolve(
      [...this.evidence.values()].filter((item) => matchesEvidence(item, query)),
    );
  }

  putLesson(lesson: Lesson): Promise<void> {
    this.lessons.set(lesson.id, {
      ...lesson,
      evidenceIds: [...lesson.evidenceIds],
      firstObservedAt: cloneDate(lesson.firstObservedAt),
      lastObservedAt: cloneDate(lesson.lastObservedAt),
    });
    return Promise.resolve();
  }

  getLesson(id: string): Promise<Lesson | undefined> {
    const lesson = this.lessons.get(id);
    return Promise.resolve(lesson ? { ...lesson, evidenceIds: [...lesson.evidenceIds] } : undefined);
  }

  findLessons(query: LessonQuery): Promise<Lesson[]> {
    return Promise.resolve(
      [...this.lessons.values()].filter((item) => matchesLesson(item, query)),
    );
  }

  putProposal(proposal: ImprovementProposal): Promise<void> {
    const existing = this.proposals.get(proposal.id);
    if (existing && proposal.version < existing.version) {
      return Promise.reject(new VersionConflictError());
    }
    if (
      existing &&
      existing.status === 'published' &&
      proposal.status === 'published' &&
      proposal.version === existing.version
    ) {
      return Promise.reject(new VersionConflictError());
    }
    this.proposals.set(proposal.id, {
      ...proposal,
      lessonIds: [...proposal.lessonIds],
      evidenceIds: [...proposal.evidenceIds],
      createdAt: cloneDate(proposal.createdAt),
      updatedAt: cloneDate(proposal.updatedAt),
    });
    return Promise.resolve();
  }

  getProposal(id: string): Promise<ImprovementProposal | undefined> {
    const proposal = this.proposals.get(id);
    return Promise.resolve(
      proposal
        ? {
            ...proposal,
            lessonIds: [...proposal.lessonIds],
            evidenceIds: [...proposal.evidenceIds],
          }
        : undefined,
    );
  }

  appendEvent(event: EvolutionEvent): Promise<void> {
    this.events.push({ ...event, at: cloneDate(event.at), payload: { ...event.payload } });
    return Promise.resolve();
  }

  findEvents(agentId: string): Promise<EvolutionEvent[]> {
    return Promise.resolve(this.events.filter((event) => event.agentId === agentId));
  }
}

function matchesEvidence(item: Evidence, query: EvidenceQuery): boolean {
  if (query.agentId && item.agentId !== query.agentId) {
    return false;
  }
  if (query.kind && item.kind !== query.kind) {
    return false;
  }
  if (query.sourceIdentity && item.provenance.sourceIdentity !== query.sourceIdentity) {
    return false;
  }
  if (query.scope && !scopesEqual(item.scope, query.scope)) {
    return false;
  }
  return true;
}

function matchesLesson(item: Lesson, query: LessonQuery): boolean {
  if (query.agentId && item.agentId !== query.agentId) {
    return false;
  }
  if (query.status && item.status !== query.status) {
    return false;
  }
  if (query.kind && item.kind !== query.kind) {
    return false;
  }
  if (query.statement && item.statement !== query.statement) {
    return false;
  }
  if (query.scope && !scopesEqual(item.scope, query.scope)) {
    return false;
  }
  return true;
}
