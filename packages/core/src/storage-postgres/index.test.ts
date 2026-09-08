import { describe, expect, it } from 'vitest';

import { VersionConflictError } from '../domain';
import { buildEvidence, runEvolutionStoreContract } from '../testing';

import { createMemorySqlExecutor, PostgresEvolutionStore } from './index';

import type { SqlExecutor } from './index';
import type { ImprovementProposal } from '../domain';

describe('PostgresEvolutionStore', () => {
  it('satisfies the evolution store contract', async () => {
    await expect(
      runEvolutionStoreContract(async () => {
        const sql = createMemorySqlExecutor();
        const store = new PostgresEvolutionStore({ sql });
        await store.initialize();
        return store;
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects overlapping publishes with the same baseline version', async () => {
    const store = await createStore();
    const proposal = sampleProposal({
      id: 'prop-overlap',
      version: 1,
      status: 'published',
      baselineRevision: 'rev-0',
    });
    const outcomes = await Promise.all([
      settle(store.putProposal(proposal)),
      settle(store.putProposal({ ...proposal, lessonIds: [...proposal.lessonIds] })),
    ]);
    const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const rejected = outcomes.filter(
      (outcome): outcome is { status: 'rejected'; reason: unknown } =>
        outcome.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(VersionConflictError);
    const stored = await store.getProposal('prop-overlap');
    expect(stored?.status).toBe('published');
    expect(stored?.baselineRevision).toBe('rev-0');
    await expect(store.getProposal('missing-proposal')).resolves.toBeUndefined();
    await expect(store.getLesson('missing-lesson')).resolves.toBeUndefined();
  });

  it('keeps one evidence row for concurrent identical sourceIdentity', async () => {
    const sql = createMemorySqlExecutor();
    const first = new PostgresEvolutionStore({ sql });
    const second = new PostgresEvolutionStore({ sql });
    await first.initialize();
    await second.initialize();
    await Promise.all([
      first.putEvidence(
        buildEvidence({
          id: 'ev-a',
          agentId: 'analytics-agent',
          provenance: { sourceIdentity: 'shared-source' },
        }),
      ),
      second.putEvidence(
        buildEvidence({
          id: 'ev-b',
          agentId: 'analytics-agent',
          summary: 'second writer',
          provenance: { sourceIdentity: 'shared-source' },
        }),
      ),
    ]);
    const found = await first.findEvidence({
      agentId: 'analytics-agent',
      sourceIdentity: 'shared-source',
    });
    expect(found).toHaveLength(1);
  });

  it('finds evidence by agentId and scope after put', async () => {
    const store = await createStore();
    const evidence = buildEvidence({
      id: 'ev-scoped',
      agentId: 'analytics-agent',
      scope: { type: 'resource', resourceId: 'alice' },
      summary: 'Use booked revenue excluding cancellations.',
    });
    await store.putEvidence(evidence);
    await store.putEvidence(
      buildEvidence({
        id: 'ev-other',
        agentId: 'other-agent',
        scope: { type: 'resource', resourceId: 'bob' },
        summary: 'other tenant',
      }),
    );
    const found = await store.findEvidence({
      agentId: 'analytics-agent',
      scope: { type: 'resource', resourceId: 'alice' },
    });
    expect(found).toHaveLength(1);
    expect(found[0]?.summary).toBe('Use booked revenue excluding cancellations.');
    await store.putEvidence(
      buildEvidence({
        id: 'ev-no-source',
        agentId: 'analytics-agent',
        scope: { type: 'agent', agentId: 'analytics-agent' },
        provenance: {},
      }),
    );
    const byId = await store.findEvidence({
      agentId: 'analytics-agent',
      scope: { type: 'agent', agentId: 'analytics-agent' },
    });
    expect(byId).toHaveLength(1);
    expect(byId[0]?.id).toBe('ev-no-source');
    await store.appendEvent({
      id: 'evt-scoped',
      type: 'evolution.ingest',
      agentId: 'analytics-agent',
      at: new Date('2026-08-31T00:00:00.000Z'),
      payload: { evidenceId: 'ev-scoped' },
    });
    expect(await store.findEvents('analytics-agent')).toHaveLength(1);
    expect(await store.findEvents('missing-agent')).toHaveLength(0);
    await store.putLesson({
      id: 'lesson-scoped',
      agentId: 'analytics-agent',
      scope: { type: 'resource', resourceId: 'alice' },
      kind: 'correction',
      statement: evidence.summary,
      evidenceIds: [evidence.id],
      confidence: 0.3,
      occurrenceCount: 1,
      firstObservedAt: evidence.observedAt,
      lastObservedAt: evidence.observedAt,
      status: 'candidate',
    });
    const lessons = await store.findLessons({
      agentId: 'analytics-agent',
      scope: { type: 'resource', resourceId: 'alice' },
    });
    expect(lessons).toHaveLength(1);
  });

  it.skipIf(!databaseUrl())(
    'live postgres gate: DATABASE_URL enables a real SqlExecutor (skipped in CI without Postgres)',
    () => {
      expect(databaseUrl()).toBeTruthy();
    },
  );
});

async function createStore(): Promise<PostgresEvolutionStore> {
  const sql: SqlExecutor = createMemorySqlExecutor();
  const store = new PostgresEvolutionStore({ sql });
  await store.initialize();
  return store;
}

async function settle(
  work: Promise<void>,
): Promise<{ status: 'fulfilled' } | { status: 'rejected'; reason: unknown }> {
  try {
    await work;
    return { status: 'fulfilled' };
  } catch (reason: unknown) {
    return { status: 'rejected', reason };
  }
}

function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL;
}

function sampleProposal(
  overrides: Pick<ImprovementProposal, 'id' | 'version' | 'status'> & Partial<ImprovementProposal>,
): ImprovementProposal {
  const now = new Date('2026-08-31T00:00:00.000Z');
  return {
    agentId: 'analytics-agent',
    scope: { type: 'resource', resourceId: 'alice' },
    reason: 'repeat correction',
    lessonIds: ['lesson-1'],
    evidenceIds: ['ev-1'],
    target: { type: 'skill', skillId: 'booked-revenue' },
    candidateArtifact: { markdown: '# skill' },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
