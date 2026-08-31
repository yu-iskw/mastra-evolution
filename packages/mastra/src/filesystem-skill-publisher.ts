/* eslint-disable security/detect-non-literal-fs-filename -- paths are constrained to the publisher directory */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isRecord, stringField } from './is-record';

import type {
  ApprovedImprovementProposal,
  EvolutionPublisher,
  ImprovementProposal,
  PublishedRevision,
} from '@mastra-evolution/core';

const VERSIONS_FILE = '.evolution-versions.json';
const DRAFTS_FILE = '.evolution-drafts.json';
const VERSIONS_DIR = '.versions';
const SKILL_MARKDOWN = 'SKILL.md';

interface VersionRecord {
  id: string;
  proposalId: string;
  previousRevision?: string;
  at: string;
}

interface VersionManifest {
  current?: string;
  revisions: VersionRecord[];
}

interface DraftRecord {
  path: string;
  proposalId: string;
}

/**
 * Hobby publisher: `writeDraft` writes Agent Skills `SKILL.md` on disk.
 * `publish` / `publishVersion` record a stored revision (and a blob under `.versions/`)
 * without implying a `SKILL.md` write — those are distinct operations.
 */
export class FilesystemSkillPublisher implements EvolutionPublisher {
  private readonly directory: string;

  constructor(options: { directory: string }) {
    this.directory = path.resolve(options.directory);
  }

  async writeDraft(proposal: ImprovementProposal): Promise<{ path: string }> {
    const skillName = safeSegment(skillNameFrom(proposal));
    const skillDir = resolveUnderRoot(this.directory, skillName);
    await mkdir(skillDir, { recursive: true });
    const skillPath = path.join(skillDir, SKILL_MARKDOWN);
    await writeFile(skillPath, renderSkillMarkdown(proposal.candidateArtifact), 'utf8');
    await appendDraft(this.directory, { path: skillPath, proposalId: proposal.id });
    return { path: skillPath };
  }

  async publish(proposal: ApprovedImprovementProposal): Promise<PublishedRevision> {
    const manifest = await readManifest(this.directory);
    const previousRevision = manifest.current;
    const revision = `rev-${manifest.revisions.length + 1}`;
    manifest.revisions.push({
      id: revision,
      proposalId: proposal.id,
      previousRevision,
      at: new Date().toISOString(),
    });
    manifest.current = revision;
    await mkdir(this.directory, { recursive: true });
    await writeFile(
      path.join(this.directory, VERSIONS_FILE),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );
    await writeVersionBlob(this.directory, revision, proposal.candidateArtifact);
    return { revision, previousRevision };
  }

  /** Alias of {@link publish}. Does not write `SKILL.md`. */
  async publishVersion(proposal: ApprovedImprovementProposal): Promise<PublishedRevision> {
    return this.publish(proposal);
  }

  async rollback(proposal: ImprovementProposal): Promise<PublishedRevision> {
    const manifest = await readManifest(this.directory);
    const previousRevision = manifest.current;
    const revision = proposal.baselineRevision ?? previousRevision ?? 'rev-0';
    manifest.current = revision;
    await mkdir(this.directory, { recursive: true });
    await writeFile(
      path.join(this.directory, VERSIONS_FILE),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );
    return { revision, previousRevision };
  }
}

async function readManifest(directory: string): Promise<VersionManifest> {
  try {
    const raw = await readFile(path.join(directory, VERSIONS_FILE), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !Array.isArray(parsed.revisions)) {
      return { revisions: [] };
    }
    return {
      current: typeof parsed.current === 'string' ? parsed.current : undefined,
      revisions: parsed.revisions.filter(isVersionRecord),
    };
  } catch {
    return { revisions: [] };
  }
}

function isVersionRecord(value: unknown): value is VersionRecord {
  return isRecord(value) && typeof value.id === 'string' && typeof value.proposalId === 'string';
}

async function writeVersionBlob(
  directory: string,
  revision: string,
  artifact: unknown,
): Promise<void> {
  const versionsDir = resolveUnderRoot(directory, VERSIONS_DIR);
  await mkdir(versionsDir, { recursive: true });
  const blobPath = resolveUnderRoot(directory, VERSIONS_DIR, `${safeSegment(revision)}.md`);
  await writeFile(blobPath, renderSkillMarkdown(artifact), 'utf8');
}

async function appendDraft(directory: string, draft: DraftRecord): Promise<void> {
  const drafts = await readDrafts(directory);
  drafts.push(draft);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, DRAFTS_FILE),
    `${JSON.stringify(drafts, null, 2)}\n`,
    'utf8',
  );
}

async function readDrafts(directory: string): Promise<DraftRecord[]> {
  try {
    const raw = await readFile(path.join(directory, DRAFTS_FILE), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is DraftRecord => {
      return isRecord(item) && typeof item.path === 'string' && typeof item.proposalId === 'string';
    });
  } catch {
    return [];
  }
}

function skillNameFrom(proposal: ImprovementProposal): string {
  const artifact = proposal.candidateArtifact;
  if (isRecord(artifact)) {
    const name = stringField(artifact, 'name');
    if (name) {
      return name;
    }
  }
  if (proposal.target.type === 'skill' && proposal.target.skillId) {
    return proposal.target.skillId;
  }
  return proposal.id;
}

function renderSkillMarkdown(artifact: unknown): string {
  if (typeof artifact === 'string') {
    return artifact;
  }
  if (!isRecord(artifact)) {
    return '---\nname: untitled-skill\ndescription: ""\n---\n';
  }
  const name = stringField(artifact, 'name') ?? 'untitled-skill';
  const description = stringField(artifact, 'description') ?? '';
  const body = stringField(artifact, 'markdown') ?? stringField(artifact, 'instructions') ?? '';
  return `---\nname: ${JSON.stringify(name)}\ndescription: ${JSON.stringify(description)}\n---\n\n${body}\n`;
}

function safeSegment(value: string): string {
  const cleaned = value
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^\.+/g, '')
    .replace(/\.+$/g, '');
  return cleaned.length > 0 ? cleaned : 'skill';
}

function resolveUnderRoot(root: string, ...segments: string[]): string {
  const resolved = path.resolve(root, ...segments);
  const rootResolved = path.resolve(root);
  if (resolved !== rootResolved && !resolved.startsWith(`${rootResolved}${path.sep}`)) {
    throw new Error('Path escapes publisher directory');
  }
  return resolved;
}
