import { InMemoryEvolutionStore } from '@mastra-evolution/core/testing';
import { describe, expect, it } from 'vitest';

import { promoteAcceptedLesson } from './promote-accepted-lesson';

import type { ImprovementProposal, Lesson } from '@mastra-evolution/core';
import type { ImprovementRuntime } from '@mastra-evolution/core/improvement';

const NOW = new Date('2026-08-31T00:00:00.000Z');

describe('promoteAcceptedLesson', () => {
  it('retries promote when a generate event exists after a failed publish', async () => {
    const store = new InMemoryEvolutionStore();
    const lesson = sampleLesson();
    let promoteCalls = 0;
    const improvement = fakeImprovement(store, () => {
      promoteCalls += 1;
      if (promoteCalls === 1) {
        throw new Error('disk full');
      }
    });
    await expect(promoteAcceptedLesson({ lesson, improvement, store })).rejects.toThrow(
      'disk full',
    );
    await promoteAcceptedLesson({ lesson, improvement, store });
    expect(promoteCalls).toBe(2);
    const events = await store.findEvents(lesson.agentId);
    expect(events.filter((event) => event.type === 'evolution.proposal.generate')).toHaveLength(1);
  });
});

function fakeImprovement(store: InMemoryEvolutionStore, onPromote: () => void): ImprovementRuntime {
  return {
    autonomy: 4,
    proposeFromLesson(lesson) {
      const proposal = draftProposal(lesson);
      return store.putProposal(proposal).then(async () => {
        await store.appendEvent({
          id: 'evt-generate',
          type: 'evolution.proposal.generate',
          agentId: lesson.agentId,
          at: NOW,
          payload: { proposalId: proposal.id, lessonId: lesson.id },
        });
        return proposal;
      });
    },
    evaluate() {
      return Promise.reject(new Error('unused'));
    },
    promote(proposalId) {
      onPromote();
      return store.getProposal(proposalId).then((proposal) => {
        if (proposal === undefined) {
          throw new Error('missing proposal');
        }
        return { ...proposal, status: 'published' };
      });
    },
    rollback() {
      return Promise.reject(new Error('unused'));
    },
  };
}

function sampleLesson(): Lesson {
  return {
    id: 'lesson-1',
    agentId: 'analytics-agent',
    scope: { type: 'agent', agentId: 'analytics-agent' },
    kind: 'procedure',
    statement: 'Use booked revenue excluding cancellations.',
    evidenceIds: ['ev-1'],
    confidence: 0.8,
    occurrenceCount: 3,
    firstObservedAt: NOW,
    lastObservedAt: NOW,
    status: 'accepted',
    suggestedAction: 'create-skill',
  };
}

function draftProposal(lesson: Lesson): ImprovementProposal {
  return {
    id: 'imp_1',
    agentId: lesson.agentId,
    scope: lesson.scope,
    reason: lesson.statement,
    lessonIds: [lesson.id],
    evidenceIds: [...lesson.evidenceIds],
    target: { type: 'skill' },
    candidateArtifact: { markdown: lesson.statement },
    status: 'draft',
    version: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}
