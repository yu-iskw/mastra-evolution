import { InMemoryEvolutionStore, buildEvidence } from '@mastra-evolution/core/testing';
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

  it('proposes an authored body instead of the lesson statement', async () => {
    const store = new InMemoryEvolutionStore();
    await store.putEvidence(
      buildEvidence({
        id: 'ev-1',
        agentId: 'analytics-agent',
        summary: 'Read metrics.md when quoting revenue.',
      }),
    );
    const lesson = sampleLesson();
    let captured: unknown;
    const improvement = fakeImprovement(
      store,
      () => undefined,
      (artifact) => {
        captured = artifact;
      },
    );
    await promoteAcceptedLesson({ lesson, improvement, store });
    const artifact = captured as { name: string; description: string; markdown: string };
    expect(artifact.name).toBe('use-booked-revenue-excluding-cancellations');
    expect(artifact.description).toMatch(/Use when/i);
    expect(artifact.markdown).toContain('## When to Use');
    expect(artifact.markdown).toContain('## Instructions');
    expect(artifact.markdown).toContain('## Working Memory');
    expect(artifact.markdown).toContain('metrics.md');
    expect(artifact.markdown).not.toBe(lesson.statement);
  });

  it('skips lessons that do not produce a valid practical draft', async () => {
    const store = new InMemoryEvolutionStore();
    let proposed = false;
    const improvement = fakeImprovement(
      store,
      () => undefined,
      () => {
        proposed = true;
      },
    );
    await promoteAcceptedLesson({
      lesson: { ...sampleLesson(), statement: '??? !!!' },
      improvement,
      store,
    });
    expect(proposed).toBe(false);
  });
});

function fakeImprovement(
  store: InMemoryEvolutionStore,
  onPromote: () => void,
  onPropose?: (artifact: unknown) => void,
): ImprovementRuntime {
  return {
    autonomy: 4,
    proposeFromLesson(lesson, artifact) {
      onPropose?.(artifact);
      const proposal = draftProposal(lesson, artifact);
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

function draftProposal(lesson: Lesson, artifact?: unknown): ImprovementProposal {
  return {
    id: 'imp_1',
    agentId: lesson.agentId,
    scope: lesson.scope,
    reason: lesson.statement,
    lessonIds: [lesson.id],
    evidenceIds: [...lesson.evidenceIds],
    target: { type: 'skill' },
    candidateArtifact: artifact ?? { markdown: lesson.statement },
    status: 'draft',
    version: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}
