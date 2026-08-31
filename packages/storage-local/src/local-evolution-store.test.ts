import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { VersionConflictError } from '@mastra-evolution/core';
import { buildEvidence } from '@mastra-evolution/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { LocalEvolutionStore } from './local-evolution-store';

import type { ImprovementProposal, Lesson } from '@mastra-evolution/core';

const directories: string[] = [];

async function uniqueTempDir(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'storage-local-'));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  const pending = directories.splice(0);
  await Promise.all(pending.map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('LocalEvolutionStore', () => {
  it('persists evidence and finds it by agentId and scope (AE2)', async () => {
    const store = new LocalEvolutionStore({ directory: await uniqueTempDir() });
    const summary = 'Use booked revenue excluding cancellations.';
    await store.putEvidence(
      buildEvidence({
        id: 'ev-ae2',
        agentId: 'analytics-agent',
        summary,
        scope: { type: 'resource', resourceId: 'alice' },
      }),
    );
    const found = await store.findEvidence({
      agentId: 'analytics-agent',
      scope: { type: 'resource', resourceId: 'alice' },
    });
    expect(found).toHaveLength(1);
    expect(found[0]?.summary).toBe(summary);
  });

  it('reads a lesson from a second store on the same directory after restart', async () => {
    const directory = await uniqueTempDir();
    const lesson = sampleLesson('lesson-restart');
    const a = new LocalEvolutionStore({ directory });
    await a.putLesson(lesson);
    const b = new LocalEvolutionStore({ directory });
    expect(await b.getLesson(lesson.id)).toMatchObject({
      id: lesson.id,
      statement: lesson.statement,
      agentId: lesson.agentId,
    });
  });

  it('throws VersionConflictError when republishing the same proposal version', async () => {
    const store = new LocalEvolutionStore({ directory: await uniqueTempDir() });
    const published = sampleProposal('prop-published', 1, 'published');
    await store.putProposal(published);
    await expect(store.putProposal({ ...published })).rejects.toBeInstanceOf(VersionConflictError);
  });

  it('does not share data across directories', async () => {
    const lesson = sampleLesson('lesson-isolated');
    const a = new LocalEvolutionStore({ directory: await uniqueTempDir() });
    const b = new LocalEvolutionStore({ directory: await uniqueTempDir() });
    await a.putLesson(lesson);
    expect(await b.getLesson(lesson.id)).toBeUndefined();
    expect(await a.getLesson(lesson.id)).toMatchObject({ id: lesson.id });
  });

  it('clones dates and arrays so callers cannot mutate store internals', async () => {
    const store = new LocalEvolutionStore({ directory: await uniqueTempDir() });
    const lesson = sampleLesson('lesson-clone');
    await store.putLesson(lesson);
    const first = await store.getLesson(lesson.id);
    first?.evidenceIds.push('mutated');
    first?.firstObservedAt.setTime(0);
    const second = await store.getLesson(lesson.id);
    expect(second?.evidenceIds).toEqual(['ev-1']);
    expect(second?.firstObservedAt.toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });

  it('filters lessons and returns events for an agent', async () => {
    const store = new LocalEvolutionStore({ directory: await uniqueTempDir() });
    const lesson = sampleLesson('lesson-query');
    await store.putLesson(lesson);
    await store.appendEvent({
      id: 'evt-1',
      type: 'evolution.ingest',
      agentId: 'analytics-agent',
      at: new Date('2026-08-31T00:00:00.000Z'),
      payload: { evidenceId: 'ev-1' },
    });
    await store.appendEvent({
      id: 'evt-2',
      type: 'evolution.ingest',
      agentId: 'other-agent',
      at: new Date('2026-08-31T00:00:00.000Z'),
      payload: {},
    });
    const found = await store.findLessons({
      agentId: 'analytics-agent',
      status: 'candidate',
      kind: 'correction',
      statement: lesson.statement,
      scope: { type: 'resource', resourceId: 'alice' },
    });
    expect(found).toHaveLength(1);
    expect(await store.findEvents('analytics-agent')).toEqual([
      expect.objectContaining({ id: 'evt-1', agentId: 'analytics-agent' }),
    ]);
    expect(await store.getProposal('missing')).toBeUndefined();
  });

  it('reloads after close and is safe to open twice', async () => {
    const directory = await uniqueTempDir();
    const store = new LocalEvolutionStore({ directory });
    await store.putProposal(sampleProposal('prop-1', 0, 'draft'));
    await store.open();
    await store.open();
    await store.close();
    await store.close();
    const loaded = await store.getProposal('prop-1');
    expect(loaded).toMatchObject({ id: 'prop-1', version: 0, status: 'draft' });
  });
});

function sampleLesson(id: string): Lesson {
  const now = new Date('2026-08-31T00:00:00.000Z');
  return {
    id,
    agentId: 'analytics-agent',
    scope: { type: 'resource', resourceId: 'alice' },
    kind: 'correction',
    statement: 'Use booked revenue excluding cancellations.',
    evidenceIds: ['ev-1'],
    confidence: 0.3,
    occurrenceCount: 1,
    firstObservedAt: now,
    lastObservedAt: now,
    status: 'candidate',
  };
}

function sampleProposal(
  id: string,
  version: number,
  status: ImprovementProposal['status'],
): ImprovementProposal {
  const now = new Date('2026-08-31T00:00:00.000Z');
  return {
    id,
    agentId: 'analytics-agent',
    scope: { type: 'resource', resourceId: 'alice' },
    reason: 'repeat correction',
    lessonIds: ['lesson-1'],
    evidenceIds: ['ev-1'],
    target: { type: 'skill', skillId: 'booked-revenue' },
    candidateArtifact: { markdown: '# skill' },
    status,
    version,
    createdAt: now,
    updatedAt: now,
  };
}
