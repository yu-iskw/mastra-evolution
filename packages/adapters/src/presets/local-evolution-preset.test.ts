/* eslint-disable security/detect-non-literal-fs-filename -- temp store and published SKILL.md paths */
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { parseAutonomy } from '@mastra-evolution/core';
import { LocalEvolutionStore } from '@mastra-evolution/core/storage-local';
import { PostgresEvolutionStore } from '@mastra-evolution/core/storage-postgres';
import { ScriptedEvaluator } from '@mastra-evolution/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { FilesystemSkillPublisher } from '../skills/filesystem-skill-publisher';

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
    expect(preset.improvement.autonomy).toBe(4);
    expect(preset.learning).toBe(preset.evolution.learning);
  });

  it('honors a caller-supplied evaluator instead of creating a Mastra evaluator', async () => {
    const evaluator = new ScriptedEvaluator([
      { verdict: 'pass', regressions: [], candidateScore: 1, baselineScore: 0 },
    ]);
    const preset = localEvolutionPreset({
      directory: await uniqueTempDir(),
      agentId: AGENT_ID,
      evaluator,
      learnedSkillsDirectory: path.join(await uniqueTempDir(), 'custom-skills'),
    });
    expect(preset.store).toBeInstanceOf(LocalEvolutionStore);
    expect(preset.publisher).toBeInstanceOf(FilesystemSkillPublisher);
  });

  it('auto-promotes an accepted procedure lesson to SKILL.md through preset.learning', async () => {
    const directory = await uniqueTempDir();
    const preset = localEvolutionPreset({ directory, agentId: AGENT_ID });
    const signal = {
      kind: 'procedure',
      summary: 'Use booked revenue excluding cancellations.',
      suggestedAction: 'create-skill',
    };
    for (let index = 0; index < 5; index += 1) {
      await preset.evolution.extractor().onExtracted(signal);
    }
    const skillPath = path.join(
      directory,
      'skills',
      'use-booked-revenue-excluding-cancellations',
      'SKILL.md',
    );
    expect(existsSync(skillPath)).toBe(true);
    const markdown = readFileSync(skillPath, 'utf8');
    expect(markdown).toContain('booked revenue');
    expect(markdown).toContain('## When to Use');
    expect(markdown).toContain('## Instructions');
    expect(markdown).toContain('## Working Memory');
    expect(markdown).toMatch(/Use when/i);
    expect(markdown).not.toBe('Use booked revenue excluding cancellations.');
    const events = await preset.store.findEvents(AGENT_ID);
    expect(events.filter((event) => event.type === 'evolution.promote')).toHaveLength(1);
  });
});
