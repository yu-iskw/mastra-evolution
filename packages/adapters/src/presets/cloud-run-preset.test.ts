import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { parseAutonomy } from '@mastra-evolution/core';
import { LocalEvolutionStore } from '@mastra-evolution/core/storage-local';
import {
  createMemorySqlExecutor,
  PostgresEvolutionStore,
} from '@mastra-evolution/core/storage-postgres';
import { afterEach, describe, expect, it } from 'vitest';

import { FilesystemSkillPublisher } from '../skills/filesystem-skill-publisher';

import { CLOUD_STORAGE_FUSE_WARNING, cloudRunPreset } from './cloud-run-preset';

const AGENT_ID = 'analytics-agent';
const directories: string[] = [];

async function uniqueTempDir(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'presets-cloud-'));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  const pending = directories.splice(0);
  await Promise.all(pending.map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('cloudRunPreset', () => {
  it('exports a FUSE warning constant and uses Postgres, not local storage', () => {
    expect(CLOUD_STORAGE_FUSE_WARNING).toContain('FUSE');
    const preset = cloudRunPreset({
      sql: createMemorySqlExecutor(),
      agentId: AGENT_ID,
    });
    expect(preset.store).toBeInstanceOf(PostgresEvolutionStore);
    expect(preset.store).not.toBeInstanceOf(LocalEvolutionStore);
    expect(preset.publisher).toBeUndefined();
    expect(parseAutonomy(preset.autonomy)).toBe(4);
  });

  it('constructs a publisher only when artifactDirectory is provided', async () => {
    const artifactDirectory = await uniqueTempDir();
    const preset = cloudRunPreset({
      sql: createMemorySqlExecutor(),
      agentId: AGENT_ID,
      artifactDirectory,
      autonomy: 4,
    });
    expect(preset.publisher).toBeInstanceOf(FilesystemSkillPublisher);
  });
});
