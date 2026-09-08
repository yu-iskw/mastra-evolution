import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { parseAutonomy } from '@mastra-evolution/core';
import { LocalEvolutionStore } from '@mastra-evolution/core/storage-local';
import { afterEach, describe, expect, it } from 'vitest';

import { localLearningPreset } from './local-learning-preset';

const AGENT_ID = 'analytics-agent';
const directories: string[] = [];

async function uniqueTempDir(prefix = 'presets-learn-'): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  const pending = directories.splice(0);
  await Promise.all(pending.map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('localLearningPreset', () => {
  it('never constructs a publisher and omits improvement', async () => {
    const directory = await uniqueTempDir();
    const preset = localLearningPreset({ directory, agentId: AGENT_ID });
    const bag: object = preset;
    const publisher = 'publisher' in bag ? (bag as { publisher?: unknown }).publisher : undefined;
    expect(publisher).toBeUndefined();
    expect(preset.improvement).toBeUndefined();
    expect(!('publisher' in bag) || publisher === undefined).toBe(true);
    const sourcePath = path.join(__dirname, 'local-learning-preset.ts');
    /* eslint-disable-next-line security/detect-non-literal-fs-filename -- fixture path beside this test */
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).not.toContain('FilesystemSkillPublisher');
    expect(parseAutonomy(preset.autonomy)).toBe(1);
  });

  it('AE1: evolution.register(agent) returns the same agent identity', async () => {
    class Agent {
      readonly id = AGENT_ID;
    }
    const agent = new Agent();
    const preset = localLearningPreset({
      directory: await uniqueTempDir(),
      agentId: AGENT_ID,
      agent,
    });
    const registered = preset.evolution.register(agent);
    expect(registered).toBe(agent);
    expect(Object.is(registered, agent)).toBe(true);
    expect(registered.constructor).toBe(Agent);
  });

  it('plugs workspace hooks when the agent already has a workspace', async () => {
    const workspaceDir = path.join(await uniqueTempDir(), 'workspace');
    const workspace = {
      filesystem: { basePath: workspaceDir },
      skills: ['skills'],
      toolsConfig: { requireApproval: true } as Record<string, unknown> | undefined,
      getToolsConfig() {
        return this.toolsConfig;
      },
      setToolsConfig(config?: unknown) {
        this.toolsConfig = config as Record<string, unknown>;
      },
    };
    const agent = { id: AGENT_ID, workspace };
    localLearningPreset({
      directory: await uniqueTempDir(),
      agentId: AGENT_ID,
      agent,
    });
    expect(workspace.toolsConfig?.requireApproval).toBe(true);
    expect(workspace.toolsConfig?.hooks).toBeDefined();
  });

  it('binds hooks from options.workspace when the agent has no workspace field', async () => {
    const workspaceDir = path.join(await uniqueTempDir(), 'workspace');
    const workspace = {
      filesystem: { basePath: workspaceDir },
      skills: ['skills'],
      toolsConfig: { requireApproval: true } as Record<string, unknown> | undefined,
      getToolsConfig() {
        return this.toolsConfig;
      },
      setToolsConfig(config?: unknown) {
        this.toolsConfig = config as Record<string, unknown>;
      },
    };
    localLearningPreset({
      directory: await uniqueTempDir(),
      agentId: AGENT_ID,
      agent: { id: AGENT_ID },
      workspace,
    });
    expect(workspace.toolsConfig?.hooks).toBeDefined();
  });

  it('uses LocalEvolutionStore under directory/evolution when basename is not evolution', async () => {
    const directory = await uniqueTempDir();
    const preset = localLearningPreset({ directory, agentId: AGENT_ID });
    expect(preset.store).toBeInstanceOf(LocalEvolutionStore);
    expect(preset.store.constructor.name).toBe('LocalEvolutionStore');
    expect(typeof preset.learning.ingest).toBe('function');
    expect(typeof preset.evolution.register).toBe('function');
  });

  it('keeps LocalEvolutionStore at options.directory when basename is evolution', async () => {
    const directory = path.join(await uniqueTempDir(), 'evolution');
    const preset = localLearningPreset({ directory, agentId: AGENT_ID });
    expect(preset.store).toBeInstanceOf(LocalEvolutionStore);
    expect(preset.store.constructor.name).toBe('LocalEvolutionStore');
  });
});
