import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { parseAutonomy } from '@mastra-evolution/core';
import { FilesystemSkillPublisher } from '@mastra-evolution/mastra';
import { LocalEvolutionStore } from '@mastra-evolution/storage-local';
import { PostgresEvolutionStore } from '@mastra-evolution/storage-postgres';
import { ScriptedEvaluator } from '@mastra-evolution/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { localEvolutionPreset } from './local-evolution-preset';

const AGENT_ID = 'analytics-agent';
const directories: string[] = [];

async function uniqueTempDir(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'presets-evo-'));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  const pending = directories.splice(0);
  await Promise.all(pending.map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('localEvolutionPreset', () => {
  it('uses storage-local, not postgres, and constructs a filesystem publisher', async () => {
    const directory = await uniqueTempDir();
    const preset = localEvolutionPreset({ directory, agentId: AGENT_ID });
    expect(preset.store).toBeInstanceOf(LocalEvolutionStore);
    expect(preset.store.constructor.name).toBe('LocalEvolutionStore');
    expect(preset.store).not.toBeInstanceOf(PostgresEvolutionStore);
    expect(preset.publisher).toBeInstanceOf(FilesystemSkillPublisher);
    expect(preset.publisher).toBeDefined();
    expect(parseAutonomy(preset.autonomy)).toBe(4);
    expect(typeof preset.improvement.proposeFromLesson).toBe('function');
  });

  it('honors a caller-supplied evaluator instead of creating a Mastra evaluator', async () => {
    const evaluator = new ScriptedEvaluator([
      { verdict: 'pass', regressions: [], candidateScore: 1, baselineScore: 0 },
    ]);
    const preset = localEvolutionPreset({
      directory: await uniqueTempDir(),
      agentId: AGENT_ID,
      evaluator,
      skillsDirectory: path.join(await uniqueTempDir(), 'custom-skills'),
    });
    expect(preset.store).toBeInstanceOf(LocalEvolutionStore);
    expect(preset.publisher).toBeInstanceOf(FilesystemSkillPublisher);
  });
});
