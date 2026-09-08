import { expect } from 'vitest';

import { VersionConflictError } from '../domain';

import { buildEvidence } from './evidence-builder';

import type { EvolutionStore, ImprovementProposal } from '../domain';

const CONTRACT_AGENT_ID = 'analytics-agent';

export async function runEvolutionStoreContract(
  createStore: () => Promise<EvolutionStore> | EvolutionStore,
): Promise<void> {
  const store = await createStore();
  const evidence = buildEvidence({
    id: 'ev-1',
    agentId: CONTRACT_AGENT_ID,
    summary: 'Use booked revenue excluding cancellations.',
    provenance: { sourceIdentity: 'src-1', resourceId: 'alice' },
  });
  await store.putEvidence(evidence);
  await store.putEvidence({ ...evidence, summary: 'duplicate ignored identity' });
  const found = await store.findEvidence({
    agentId: CONTRACT_AGENT_ID,
    sourceIdentity: 'src-1',
  });
  expect(found).toHaveLength(1);
  expect(found[0]?.summary).toBe('duplicate ignored identity');

  await store.putLesson({
    id: 'lesson-1',
    agentId: CONTRACT_AGENT_ID,
    scope: { type: 'resource', resourceId: 'alice' },
    kind: 'correction',
    statement: evidence.summary,
    evidenceIds: ['ev-1'],
    confidence: 0.3,
    occurrenceCount: 1,
    firstObservedAt: evidence.observedAt,
    lastObservedAt: evidence.observedAt,
    status: 'candidate',
  });
  const lesson = await store.getLesson('lesson-1');
  expect(lesson?.scope).toEqual({ type: 'resource', resourceId: 'alice' });

  const proposal = sampleProposal('prop-1', 0);
  await store.putProposal(proposal);
  await expect(store.putProposal(sampleProposal('prop-1', -1))).rejects.toBeInstanceOf(
    VersionConflictError,
  );
  await store.appendEvent({
    id: 'evt-1',
    type: 'evolution.ingest',
    agentId: CONTRACT_AGENT_ID,
    at: new Date(),
    payload: { evidenceId: 'ev-1' },
  });
}

function sampleProposal(id: string, version: number): ImprovementProposal {
  const now = new Date('2026-08-31T00:00:00.000Z');
  return {
    id,
    agentId: CONTRACT_AGENT_ID,
    scope: { type: 'resource', resourceId: 'alice' },
    reason: 'repeat correction',
    lessonIds: ['lesson-1'],
    evidenceIds: ['ev-1'],
    target: { type: 'skill', skillId: 'booked-revenue' },
    candidateArtifact: { markdown: '# skill' },
    status: 'draft',
    version,
    createdAt: now,
    updatedAt: now,
  };
}
