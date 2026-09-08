import { describe, expect, it } from 'vitest';

import { buildEvidence } from './evidence-builder';
import { InMemoryEvolutionStore } from './in-memory-store';
import { RecordingPublisher } from './recording-publisher';
import { ScriptedEvaluator } from './scripted-evaluator';
import { runEvolutionStoreContract } from './store-contract';

import type { ApprovedImprovementProposal } from '../domain';

describe('testing harness', () => {
  it('upserts evidence with the same source identity', async () => {
    const store = new InMemoryEvolutionStore();
    await store.putEvidence(
      buildEvidence({
        id: 'a',
        agentId: 'agent',
        provenance: { sourceIdentity: 'same' },
      }),
    );
    await store.putEvidence(
      buildEvidence({
        id: 'b',
        agentId: 'agent',
        summary: 'second',
        provenance: { sourceIdentity: 'same' },
      }),
    );
    const found = await store.findEvidence({ agentId: 'agent', sourceIdentity: 'same' });
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe('b');
  });

  it('returns scripted evaluator results in order', async () => {
    const evaluator = new ScriptedEvaluator([
      { verdict: 'pass', regressions: [] },
      { verdict: 'fail', regressions: ['case-1'] },
    ]);
    const proposal = {
      id: 'p',
      agentId: 'agent',
      scope: { type: 'agent' as const, agentId: 'agent' },
      reason: 'test',
      lessonIds: [],
      evidenceIds: [],
      target: { type: 'skill' as const },
      candidateArtifact: {},
      status: 'draft' as const,
      version: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await expect(evaluator.evaluate(proposal, {})).resolves.toMatchObject({ verdict: 'pass' });
    await expect(evaluator.evaluate(proposal, {})).resolves.toMatchObject({ verdict: 'fail' });
  });

  it('records publishes in order', async () => {
    const publisher = new RecordingPublisher();
    const approved = {
      id: 'p1',
      agentId: 'agent',
      scope: { type: 'agent' as const, agentId: 'agent' },
      reason: 'ok',
      lessonIds: [],
      evidenceIds: [],
      target: { type: 'skill' as const },
      candidateArtifact: { name: 'one' },
      status: 'approved' as const,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies ApprovedImprovementProposal;
    await publisher.publish(approved);
    await publisher.publish({ ...approved, id: 'p2' });
    expect(publisher.published.map((item) => item.id)).toEqual(['p1', 'p2']);
  });

  it('satisfies the store contract', async () => {
    await expect(
      runEvolutionStoreContract(() => new InMemoryEvolutionStore()),
    ).resolves.toBeUndefined();
  });
});
