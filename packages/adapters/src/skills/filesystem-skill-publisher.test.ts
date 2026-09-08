/* eslint-disable security/detect-non-literal-fs-filename -- temp skill paths are created in this test */
import { access, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FilesystemSkillPublisher } from './filesystem-skill-publisher';

import type { ApprovedImprovementProposal, ImprovementProposal } from '@mastra-evolution/core';

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

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

describe('FilesystemSkillPublisher', () => {
  it('writeDraft writes SKILL.md and does not create a stored skill version', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'evolution-skills-'));
    const publisher = new FilesystemSkillPublisher({ directory });
    const result = await publisher.writeDraft(draftProposal());
    expect(result.path).toBe(path.join(directory, 'booked-revenue', 'SKILL.md'));
    const markdown = await readFile(result.path, 'utf8');
    expect(markdown).toContain('booked-revenue');
    expect(markdown).toContain('Use booked revenue excluding cancellations.');
    expect(await exists(path.join(directory, '.evolution-versions.json'))).toBe(false);
    expect(await exists(path.join(directory, '.versions'))).toBe(false);
  });

  it('writeDraft uses string candidateArtifact as markdown as-is', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'evolution-skills-'));
    const publisher = new FilesystemSkillPublisher({ directory });
    const body = '---\nname: raw\ndescription: from-string\n---\n\n# Raw\n';
    const result = await publisher.writeDraft(
      draftProposal({
        target: { type: 'skill', skillId: 'raw' },
        candidateArtifact: body,
      }),
    );
    expect(await readFile(result.path, 'utf8')).toBe(body);
  });

  it('publishVersion records a revision without writing SKILL.md', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'evolution-skills-'));
    const publisher = new FilesystemSkillPublisher({ directory });
    const published = await publisher.publishVersion(approvedProposal());
    expect(published.revision).toBe('rev-1');
    expect(published.previousRevision).toBeUndefined();
    expect(await exists(path.join(directory, 'booked-revenue', 'SKILL.md'))).toBe(false);
    expect(await exists(path.join(directory, '.evolution-versions.json'))).toBe(true);
    expect(await exists(path.join(directory, '.versions', 'rev-1.md'))).toBe(true);
    const manifest = JSON.parse(
      await readFile(path.join(directory, '.evolution-versions.json'), 'utf8'),
    ) as {
      current: string;
      revisions: unknown[];
    };
    expect(manifest.current).toBe('rev-1');
    expect(manifest.revisions).toHaveLength(1);
  });

  it('publish records a revision and rollback returns previousRevision', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'evolution-skills-'));
    const publisher = new FilesystemSkillPublisher({ directory });
    const first = await publisher.publish(approvedProposal({ id: 'p1' }));
    const second = await publisher.publish(
      approvedProposal({ id: 'p2', baselineRevision: first.revision }),
    );
    expect(second.revision).toBe('rev-2');
    expect(second.previousRevision).toBe('rev-1');
    const rolled = await publisher.rollback(
      draftProposal({ id: 'p2', baselineRevision: first.revision, status: 'published' }),
    );
    expect(rolled.revision).toBe('rev-1');
    expect(rolled.previousRevision).toBe('rev-2');
    const manifest = JSON.parse(
      await readFile(path.join(directory, '.evolution-versions.json'), 'utf8'),
    ) as {
      current: string;
    };
    expect(manifest.current).toBe('rev-1');
  });
});
