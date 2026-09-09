/* eslint-disable security/detect-non-literal-fs-filename -- paths are constrained to the publisher directory */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isNodeErrorCode, isPlainObject as isRecord, stringField } from '@mastra-evolution/core';
import { renderSkillMarkdown } from '@mastra-evolution/core/learning';

import type {
  ApprovedImprovementProposal,
  EvolutionPublisher,
  ImprovementProposal,
  PublishedRevision,
} from '@mastra-evolution/core';

const VERSIONS_FILE = '.evolution-versions.json';

interface VersionRecord {
  id: string;
  proposalId: string;
  skillName: string;
  previousRevision?: string;
  previousMarkdown: string | null;
  markdown: string;
  rolledBack?: boolean;
}

interface VersionManifest {
  format: 2;
  revisions: VersionRecord[];
  pending?: VersionRecord;
}

/**
 * Local, single-writer skill publication. Drafts live outside the skill discovery root.
 * A pending revision is saved before replacing SKILL.md so the same proposal can be
 * retried after interruption, including with a new publisher instance.
 * Atomic rename protects individual files; this is not a multi-file transaction.
 */
export class FilesystemSkillPublisher implements EvolutionPublisher {
  private readonly directory: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(options: { directory: string }) {
    this.directory = path.resolve(options.directory);
  }

  async writeDraft(proposal: ImprovementProposal): Promise<{ path: string }> {
    const draftPath = path.join(
      this.directory,
      '..',
      'drafts',
      safeSegment(proposal.id),
      `${safeSegment(skillNameFrom(proposal))}.md`,
    );
    await writeAtomic(draftPath, markdownFromArtifact(proposal.candidateArtifact));
    return { path: draftPath };
  }

  publish(proposal: ApprovedImprovementProposal): Promise<PublishedRevision> {
    return this.exclusive(() => this.publishUnlocked(proposal));
  }

  /** @deprecated Use publish; publication now also activates SKILL.md. */
  publishVersion(proposal: ApprovedImprovementProposal): Promise<PublishedRevision> {
    return this.publish(proposal);
  }

  rollback(proposal: ImprovementProposal): Promise<PublishedRevision> {
    return this.exclusive(async () => {
      const manifest = await readManifest(this.directory);
      if (manifest.pending) {
        throw new Error(`Retry pending proposal ${manifest.pending.proposalId} before rollback`);
      }
      const record = manifest.revisions.find((item) => item.proposalId === proposal.id);
      if (!record) {
        throw new Error('No restorable revision for this proposal');
      }
      if (record.rolledBack) {
        return { revision: record.previousRevision ?? 'rev-0', previousRevision: record.id };
      }
      if (currentRevision(manifest, record.skillName)?.id !== record.id) {
        throw new Error('Only the current revision of a skill can be reverted');
      }
      const skillPath = this.skillPath(record.skillName);
      const active = await readOptional(skillPath);
      if (active !== record.markdown && active !== record.previousMarkdown) {
        throw new Error('Skill changed outside the publisher; review it before reverting');
      }
      if (record.previousMarkdown === null) {
        await rm(skillPath, { force: true });
      } else {
        await writeAtomic(skillPath, record.previousMarkdown);
      }
      record.rolledBack = true;
      await writeManifest(this.directory, manifest);
      return { revision: record.previousRevision ?? 'rev-0', previousRevision: record.id };
    });
  }

  private async publishUnlocked(proposal: ApprovedImprovementProposal): Promise<PublishedRevision> {
    const manifest = await readManifest(this.directory);
    const skillName = safeSegment(skillNameFrom(proposal));
    const markdown = markdownFromArtifact(proposal.candidateArtifact);
    const existing = manifest.revisions.find((item) => item.proposalId === proposal.id);
    if (existing) {
      assertSameCandidate(existing, skillName, markdown);
      if (existing.rolledBack) {
        throw new Error('This proposal was reverted; create a new proposal');
      }
      return { revision: existing.id, previousRevision: existing.previousRevision };
    }
    let record = manifest.pending;
    if (record) {
      if (record.proposalId !== proposal.id) {
        throw new Error(`Retry pending proposal ${record.proposalId} before publishing another`);
      }
      assertSameCandidate(record, skillName, markdown);
    } else {
      record = {
        id: `rev-${manifest.revisions.length + 1}`,
        proposalId: proposal.id,
        skillName,
        previousRevision: currentRevision(manifest, skillName)?.id,
        previousMarkdown: await readOptional(this.skillPath(skillName)),
        markdown,
      };
      manifest.pending = record;
      await writeManifest(this.directory, manifest);
    }
    const active = await readOptional(this.skillPath(skillName));
    if (active !== record.previousMarkdown && active !== record.markdown) {
      throw new Error('Skill changed during publication; review it before retrying');
    }
    await writeAtomic(this.skillPath(skillName), record.markdown);
    manifest.revisions.push(record);
    delete manifest.pending;
    await writeManifest(this.directory, manifest);
    return { revision: record.id, previousRevision: record.previousRevision };
  }

  private skillPath(name: string): string {
    return path.join(this.directory, safeSegment(name), 'SKILL.md');
  }

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

function currentRevision(manifest: VersionManifest, skillName: string): VersionRecord | undefined {
  return [...manifest.revisions]
    .reverse()
    .find((item) => item.skillName === skillName && !item.rolledBack);
}

function assertSameCandidate(record: VersionRecord, skillName: string, markdown: string): void {
  if (record.skillName !== skillName || record.markdown !== markdown) {
    throw new Error('Proposal content changed; create a new proposal');
  }
}

async function readManifest(directory: string): Promise<VersionManifest> {
  const raw = await readOptional(path.join(directory, VERSIONS_FILE));
  if (raw === null) {
    return { format: 2, revisions: [] };
  }
  const parsed: unknown = JSON.parse(raw);
  if (
    !isRecord(parsed) ||
    parsed.format !== 2 ||
    !Array.isArray(parsed.revisions) ||
    !parsed.revisions.every(isVersionRecord) ||
    (parsed.pending !== undefined && !isVersionRecord(parsed.pending))
  ) {
    throw new Error(
      'Unsupported skill history. Back up the existing directory and use a new publication directory; legacy history cannot restore skill content.',
    );
  }
  return parsed as unknown as VersionManifest;
}

function isVersionRecord(value: unknown): value is VersionRecord {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.proposalId === 'string' &&
    typeof value.skillName === 'string' &&
    typeof value.markdown === 'string' &&
    (value.previousMarkdown === null || typeof value.previousMarkdown === 'string') &&
    (value.previousRevision === undefined || typeof value.previousRevision === 'string') &&
    (value.rolledBack === undefined || typeof value.rolledBack === 'boolean')
  );
}

async function writeManifest(directory: string, manifest: VersionManifest): Promise<void> {
  await writeAtomic(path.join(directory, VERSIONS_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if (isNodeErrorCode(error, 'ENOENT')) {
      return null;
    }
    throw error;
  }
}

async function writeAtomic(filePath: string, text: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, text, 'utf8');
    await rename(tempPath, filePath);
  } finally {
    await rm(tempPath, { force: true });
  }
}

function skillNameFrom(proposal: ImprovementProposal): string {
  if (proposal.target.type !== 'skill') {
    throw new Error('Only skill artifacts can be published');
  }
  if (proposal.target.skillId) {
    return proposal.target.skillId;
  }
  return isRecord(proposal.candidateArtifact)
    ? (stringField(proposal.candidateArtifact, 'name') ?? proposal.id)
    : proposal.id;
}

function markdownFromArtifact(artifact: unknown): string {
  if (typeof artifact === 'string') {
    return artifact;
  }
  if (!isRecord(artifact)) {
    throw new Error('Expected a skill document');
  }
  return renderSkillMarkdown({
    name: stringField(artifact, 'name') ?? 'untitled-skill',
    description: stringField(artifact, 'description') ?? '',
    instructions: stringField(artifact, 'markdown') ?? stringField(artifact, 'instructions') ?? '',
  });
}

function safeSegment(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    throw new Error('Skill names and proposal IDs must be safe path segments');
  }
  return value;
}
