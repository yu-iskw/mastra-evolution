import {
  evidenceSharesSourceIdentity,
  matchesEvidence,
  matchesLesson,
  proposalUpsertConflicts,
  VersionConflictError,
} from '@mastra-evolution/core';

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
    for (const [id, existing] of this.evidence.entries()) {
      if (evidenceSharesSourceIdentity(existing, evidence)) {
        this.evidence.delete(id);
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
    return Promise.resolve(
      lesson ? { ...lesson, evidenceIds: [...lesson.evidenceIds] } : undefined,
    );
  }

  findLessons(query: LessonQuery): Promise<Lesson[]> {
    return Promise.resolve([...this.lessons.values()].filter((item) => matchesLesson(item, query)));
  }

  putProposal(proposal: ImprovementProposal): Promise<void> {
    if (proposalUpsertConflicts(this.proposals.get(proposal.id), proposal)) {
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
