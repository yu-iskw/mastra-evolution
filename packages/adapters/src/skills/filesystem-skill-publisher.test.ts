/* eslint-disable security/detect-non-literal-fs-filename -- isolated temporary directories */
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createImprovement } from '@mastra-evolution/core/improvement';
import { LocalEvolutionStore } from '@mastra-evolution/core/storage-local';
import { ScriptedEvaluator } from '@mastra-evolution/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FilesystemSkillPublisher } from './filesystem-skill-publisher';

import type { ApprovedImprovementProposal, ImprovementProposal } from '@mastra-evolution/core';
import type * as fsPromises from 'node:fs/promises';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fsPromises>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

const directories: string[] = [];
afterEach(async () => {
  vi.mocked(rename).mockRestore();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 'skill-loop-'));
  directories.push(root);
  const directory = path.join(root, 'skills');
  return {
    directory,
    publisher: new FilesystemSkillPublisher({ directory }),
    skillPath: path.join(directory, 'booked-revenue', 'SKILL.md'),
  };
}

function approvedProposal(
  overrides: Partial<ApprovedImprovementProposal> = {},
): ApprovedImprovementProposal {
  return {
    id: 'prop-1',
    agentId: 'analytics-agent',
    scope: { type: 'agent', agentId: 'analytics-agent' },
    reason: 'Accepted procedure',
    lessonIds: ['les-1'],
    evidenceIds: ['ev-1'],
    target: { type: 'skill', skillId: 'booked-revenue' },
    candidateArtifact: {
      name: 'booked-revenue',
      description: 'Define booked revenue',
      markdown: 'Use booked revenue excluding cancellations.',
    },
    status: 'approved',
    version: 1,
    createdAt: new Date('2026-08-31T00:00:00.000Z'),
    updatedAt: new Date('2026-08-31T00:00:00.000Z'),
    ...overrides,
  };
}

function draftProposal(overrides: Partial<ImprovementProposal> = {}): ImprovementProposal {
  const approved = approvedProposal();
  return { ...approved, status: 'draft', ...overrides };
}

describe('FilesystemSkillPublisher', () => {
  it('retries a proposal-store failure after activation without publishing a second revision', async () => {
    const { publisher, directory, skillPath } = await setup();
    const store = new LocalEvolutionStore({ directory: path.join(directory, '..', 'state') });
    await store.putProposal(draftProposal());
    const runtime = createImprovement({
      store,
      publisher,
      autonomy: 4,
      evaluator: new ScriptedEvaluator([{ verdict: 'pass', kind: 'behavioral', regressions: [] }]),
    });
    await runtime.evaluate('prop-1');
    const actual = await vi.importActual<typeof fsPromises>('node:fs/promises');
    vi.mocked(rename).mockImplementation(async (from, to) => {
      if (String(to).endsWith('proposals.json')) {
        throw new Error('proposal store unavailable');
      }
      await actual.rename(from, to);
    });
    await expect(runtime.promote('prop-1')).rejects.toThrow('proposal store unavailable');
    expect(await readFile(skillPath, 'utf8')).toContain('excluding cancellations');
    expect((await store.getProposal('prop-1'))?.status).toBe('evaluating');
    vi.mocked(rename).mockImplementation(actual.rename);
    const retried = await runtime.promote('prop-1');
    expect(retried.status).toBe('published');
    expect(retried.candidateRevision).toBe('rev-1');
    expect(await runtime.promote('prop-1')).toEqual(retried);
    await runtime.rollback('prop-1');
    await expect(readFile(skillPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await store.close();
  });

  it('stages a draft outside active skill discovery without changing the active document', async () => {
    const { publisher, skillPath, directory } = await setup();
    await mkdir(path.dirname(skillPath), { recursive: true });
    await writeFile(skillPath, 'baseline');
    const result = await publisher.writeDraft(draftProposal());
    expect(result.path.startsWith(`${directory}${path.sep}`)).toBe(false);
    expect(await readFile(result.path, 'utf8')).toContain('excluding cancellations');
    expect(await readFile(skillPath, 'utf8')).toBe('baseline');
  });

  it('publishes the document and repeated acceptance reuses the revision across restart', async () => {
    const { publisher, directory, skillPath } = await setup();
    const first = await publisher.publish(approvedProposal());
    const repeated = await new FilesystemSkillPublisher({ directory }).publish(approvedProposal());
    expect(repeated).toEqual(first);
    expect(first.revision).toBe('rev-1');
    expect(await readFile(skillPath, 'utf8')).toContain('excluding cancellations');
  });

  it('restores the exact pre-existing content and repeat rollback is harmless', async () => {
    const { publisher, skillPath } = await setup();
    await mkdir(path.dirname(skillPath), { recursive: true });
    await writeFile(skillPath, 'original skill\n');
    await publisher.publish(approvedProposal());
    const first = await publisher.rollback(draftProposal());
    expect(await readFile(skillPath, 'utf8')).toBe('original skill\n');
    expect(await publisher.rollback(draftProposal())).toEqual(first);
    await expect(publisher.publish(approvedProposal())).rejects.toThrow('reverted');
  });

  it('removes the active document when reverting the first publication of a new skill', async () => {
    const { publisher, skillPath } = await setup();
    await publisher.publish(approvedProposal());
    await publisher.rollback(draftProposal());
    await expect(readFile(skillPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('tracks baselines per skill and refuses to revert an older revision', async () => {
    const { publisher, skillPath } = await setup();
    const first = await publisher.publish(approvedProposal({ candidateArtifact: 'first' }));
    const other = await publisher.publish(
      approvedProposal({
        id: 'other',
        target: { type: 'skill', skillId: 'other' },
        candidateArtifact: 'other skill',
      }),
    );
    expect(other.previousRevision).toBeUndefined();
    const second = await publisher.publish(
      approvedProposal({ id: 'second', candidateArtifact: 'second' }),
    );
    expect(second.previousRevision).toBe(first.revision);
    await expect(publisher.rollback(draftProposal())).rejects.toThrow('current revision');
    await publisher.rollback(draftProposal({ id: 'second' }));
    expect(await readFile(skillPath, 'utf8')).toBe('first');
  });

  it.each([1, 2])(
    'recovers after interruption at manifest write %i without another revision',
    async (failAt) => {
      const { publisher, directory, skillPath } = await setup();
      await mkdir(path.dirname(skillPath), { recursive: true });
      await writeFile(skillPath, 'baseline');
      const actual = await vi.importActual<typeof fsPromises>('node:fs/promises');
      let manifestWrites = 0;
      vi.mocked(rename).mockImplementation(async (from, to) => {
        if (String(to).endsWith('.evolution-versions.json') && ++manifestWrites === failAt) {
          throw new Error('simulated interruption');
        }
        await actual.rename(from, to);
      });
      await expect(publisher.publish(approvedProposal())).rejects.toThrow('simulated interruption');
      if (failAt === 1) {
        expect(await readFile(skillPath, 'utf8')).toBe('baseline');
      } else {
        expect(await readFile(skillPath, 'utf8')).toContain('excluding cancellations');
      }
      vi.mocked(rename).mockImplementation(actual.rename);
      const retry = new FilesystemSkillPublisher({ directory });
      const result = await retry.publish(approvedProposal());
      expect(result.revision).toBe('rev-1');
      expect(await readFile(skillPath, 'utf8')).toContain('excluding cancellations');
      await retry.rollback(draftProposal());
      expect(await readFile(skillPath, 'utf8')).toBe('baseline');
    },
  );

  it('keeps active content intact on a failed skill write and blocks unrelated publication until retry', async () => {
    const { publisher, directory, skillPath } = await setup();
    await mkdir(path.dirname(skillPath), { recursive: true });
    await writeFile(skillPath, 'baseline');
    const actual = await vi.importActual<typeof fsPromises>('node:fs/promises');
    vi.mocked(rename).mockImplementation(async (from, to) => {
      if (to === skillPath) {
        throw new Error('skill write failed');
      }
      await actual.rename(from, to);
    });
    await expect(publisher.publish(approvedProposal())).rejects.toThrow('skill write failed');
    expect(await readFile(skillPath, 'utf8')).toBe('baseline');
    const restarted = new FilesystemSkillPublisher({ directory });
    await expect(restarted.publish(approvedProposal({ id: 'another' }))).rejects.toThrow(
      'pending proposal',
    );
    vi.mocked(rename).mockImplementation(actual.rename);
    expect((await restarted.publish(approvedProposal())).revision).toBe('rev-1');
  });

  it('retries interrupted rollback after restoring the active file', async () => {
    const { publisher, directory, skillPath } = await setup();
    await mkdir(path.dirname(skillPath), { recursive: true });
    await writeFile(skillPath, 'baseline');
    await publisher.publish(approvedProposal());
    const actual = await vi.importActual<typeof fsPromises>('node:fs/promises');
    vi.mocked(rename).mockImplementation(async (from, to) => {
      if (String(to).endsWith('.evolution-versions.json')) {
        throw new Error('interrupted rollback');
      }
      await actual.rename(from, to);
    });
    await expect(publisher.rollback(draftProposal())).rejects.toThrow('interrupted rollback');
    expect(await readFile(skillPath, 'utf8')).toBe('baseline');
    vi.mocked(rename).mockImplementation(actual.rename);
    await new FilesystemSkillPublisher({ directory }).rollback(draftProposal());
    expect(await readFile(skillPath, 'utf8')).toBe('baseline');
  });

  it('preserves external edits and rejects changed proposal content', async () => {
    const { publisher, skillPath } = await setup();
    await publisher.publish(approvedProposal());
    await expect(
      publisher.publish(approvedProposal({ candidateArtifact: 'changed' })),
    ).rejects.toThrow('content changed');
    await writeFile(skillPath, 'human edit');
    await expect(publisher.rollback(draftProposal())).rejects.toThrow('changed outside');
    expect(await readFile(skillPath, 'utf8')).toBe('human edit');
  });

  it('rejects legacy history without modifying active content', async () => {
    const { publisher, directory, skillPath } = await setup();
    await mkdir(path.dirname(skillPath), { recursive: true });
    await writeFile(skillPath, 'legacy');
    await writeFile(
      path.join(directory, '.evolution-versions.json'),
      JSON.stringify({ current: 'rev-1', revisions: [] }),
    );
    await expect(publisher.publish(approvedProposal())).rejects.toThrow('Back up');
    expect(await readFile(skillPath, 'utf8')).toBe('legacy');
  });

  it('rejects unsafe path segments rather than silently aliasing skill names', async () => {
    const { publisher } = await setup();
    await expect(
      publisher.publish(approvedProposal({ target: { type: 'skill', skillId: '../escape' } })),
    ).rejects.toThrow('safe path');
  });
});
