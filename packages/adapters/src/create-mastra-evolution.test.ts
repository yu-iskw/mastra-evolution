/* eslint-disable security/detect-non-literal-fs-filename -- package.json and temp store paths */
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { CapabilityError } from '@mastra-evolution/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  inspectWorkspace,
  LEARNED_SKILLS_DISCOVERY_HINT,
  MISSING_WORKSPACE_ERROR,
  resolveEvolutionWorkspaceLayout,
  skillPublisherDirectory,
} from './attach/workspace-bind';
import { probeCapabilities } from './capabilities/probe-capabilities';
import { createMastraEvolution } from './create-mastra-evolution';

import type { LearningLike } from './types';
import type { Evidence } from '@mastra-evolution/core';
import type { InMemoryEvolutionStore } from '@mastra-evolution/core/testing';

const tempDirs: string[] = [];

async function uniqueTempDir(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'mastra-evo-'));
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  const pending = tempDirs.splice(0);
  await Promise.all(pending.map((directory) => rm(directory, { recursive: true, force: true })));
});

function duckWorkspace(basePath: string): {
  filesystem: { basePath: string; allowedPaths: string[]; readOnly?: boolean };
  skills: string[];
  skillSource?: unknown;
  toolsConfig: Record<string, unknown> | undefined;
  getToolsConfig: () => Record<string, unknown> | undefined;
  setToolsConfig: (config?: unknown) => void;
} {
  const layout = resolveEvolutionWorkspaceLayout(basePath);
  return {
    filesystem: {
      basePath: layout.basePath,
      allowedPaths: [...layout.allowedPaths],
    },
    skills: [...layout.skills],
    skillSource: undefined,
    toolsConfig: { requireApproval: true },
    getToolsConfig() {
      return this.toolsConfig;
    },
    setToolsConfig(config?: unknown) {
      this.toolsConfig = config as Record<string, unknown>;
    },
  };
}

describe('createMastraEvolution', () => {
  it('AE1: register(agent) returns the same identity without wrapping SelfImprovingAgent', () => {
    class Agent {
      readonly id = 'analytics-agent';
    }
    const agent = new Agent();
    const constructorBefore = agent.constructor;
    const evolution = createMastraEvolution({ agent });
    const registered = evolution.register(agent);
    expect(Object.is(registered, agent)).toBe(true);
    expect(registered.constructor).toBe(constructorBefore);
    expect(registered.constructor).toBe(Agent);
    expect(registered.constructor.name).not.toBe('SelfImprovingAgent');
    expect(Object.getPrototypeOf(registered)).toBe(Agent.prototype);
  });

  it('succeeds when extractors are missing and still exposes afterToolCall as fallback', () => {
    expect(probeCapabilities({}).memoryExtractors).toBe(false);
    const evolution = createMastraEvolution({ agent: {} });
    expect(evolution.capabilities.memoryExtractors).toBe(false);
    expect(evolution.extractors).toEqual([]);
    expect(typeof evolution.hooks.afterToolCall).toBe('function');
    const agent = { id: 'bare' };
    expect(evolution.register(agent)).toBe(agent);
  });

  it('reports experiments false when the agent has no experiment API', () => {
    const evolution = createMastraEvolution({ agent: {} });
    expect(evolution.capabilities.experiments).toBe(false);
  });

  it('merges options.capabilities over the probed agent', () => {
    const evolution = createMastraEvolution({
      agent: {},
      capabilities: { experiments: true, toolHooks: true },
    });
    expect(evolution.capabilities.experiments).toBe(true);
    expect(evolution.capabilities.toolHooks).toBe(true);
    expect(evolution.capabilities.memoryExtractors).toBe(false);
  });

  it('applyToCall merges hooks by key without mutating the input object', async () => {
    const ingested: Evidence[] = [];
    const learning: LearningLike = {
      ingest(evidence) {
        ingested.push(evidence);
        return Promise.resolve(undefined);
      },
    };
    const store = undefined as InMemoryEvolutionStore | undefined;
    const evolution = createMastraEvolution({
      learning,
      store,
    });
    const order: string[] = [];
    const callerHook = (context: unknown) => {
      order.push('caller');
      expect(context).toMatchObject({ toolName: 'search' });
    };
    const callOptions = {
      temperature: 0,
      hooks: {
        afterToolCall: callerHook,
        beforeToolCall: () => {
          order.push('before');
        },
      },
    };
    const hooksRef = callOptions.hooks;
    const applied = evolution.applyToCall(callOptions);
    expect(applied).not.toBe(callOptions);
    expect(callOptions.hooks).toBe(hooksRef);
    expect(callOptions.hooks.afterToolCall).toBe(callerHook);
    expect(callOptions.temperature).toBe(0);
    await Promise.resolve(applied.hooks.afterToolCall({ toolName: 'search', result: 'ok' }));
    expect(order).toEqual(['caller']);
    expect(ingested).toHaveLength(1);
    expect(ingested[0]?.kind).toBe('success');
    expect(ingested[0]?.source).toBe('tool-result');
    await Promise.resolve(applied.hooks.beforeToolCall());
    expect(order).toEqual(['caller', 'before']);
  });

  it('applyToCall leaves caller inputProcessors in place (replacement, not concat)', () => {
    const evolution = createMastraEvolution({});
    evolution.processors.push({ name: 'evolution-processor' });
    const callerProcessors = [{ name: 'caller-processor' }];
    const withCaller = evolution.applyToCall({ inputProcessors: callerProcessors });
    expect(withCaller.inputProcessors).toEqual(callerProcessors);
    expect(withCaller.inputProcessors).toHaveLength(1);
    const withoutCaller: { temperature: number; inputProcessors?: unknown[] } =
      evolution.applyToCall({ temperature: 1 });
    expect(withoutCaller.inputProcessors).toEqual([{ name: 'evolution-processor' }]);
  });

  it('maps extractor payloads through ingestSignal when present, else ingest', async () => {
    const signals: unknown[] = [];
    const ingested: Evidence[] = [];
    const withSignal: LearningLike = {
      ingest() {
        return Promise.reject(new Error('ingest should not be used when ingestSignal exists'));
      },
      ingestSignal(input, context) {
        signals.push({ input, context });
        return Promise.resolve(undefined);
      },
    };
    const evolution = createMastraEvolution({
      agent: { id: 'analytics-agent', Extractor: class Extractor {} },
      learning: withSignal,
    });
    expect(evolution.capabilities.memoryExtractors).toBe(true);
    await evolution.extractors[0]?.onExtracted({
      kind: 'correction',
      summary: 'Use booked revenue',
    });
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      input: { kind: 'correction', summary: 'Use booked revenue' },
      context: { agentId: 'analytics-agent', source: 'memory-extractor' },
    });

    const ingestOnly: LearningLike = {
      ingest(evidence) {
        ingested.push(evidence);
        return Promise.resolve(undefined);
      },
    };
    const ingestEvolution = createMastraEvolution({ learning: ingestOnly });
    await ingestEvolution.extractors[0]?.onExtracted({
      kind: 'preference',
      summary: 'Prefer tables',
    });
    expect(ingested[0]?.kind).toBe('preference');
    expect(ingested[0]?.source).toBe('memory-extractor');
  });

  it('does not shadow ingest-only learning with a no-op ingestSignal when wrapping L4 improvement', async () => {
    const ingested: Evidence[] = [];
    const root = await uniqueTempDir();
    const workspace = duckWorkspace(path.join(root, 'workspace'));
    const evolution = createMastraEvolution({
      agent: { id: 'analytics-agent', workspace },
      learning: {
        ingest(evidence) {
          ingested.push(evidence);
          return Promise.resolve(undefined);
        },
      },
      improvement: { autonomy: 'auto-promote-bounded' },
    });
    await evolution.extractors[0]?.onExtracted({
      kind: 'preference',
      summary: 'Prefer tables',
    });
    expect(ingested[0]?.kind).toBe('preference');
    expect('ingestSignal' in (evolution.learning ?? {})).toBe(false);
  });

  it('treats missing or disabled learning as no-op extractors', async () => {
    const disabled = createMastraEvolution({ learning: { enabled: false } });
    expect(disabled.extractors).toEqual([]);
    await disabled.hooks.afterToolCall?.({ toolName: 'x', error: new Error('boom') });
    const missing = createMastraEvolution({});
    expect(missing.extractors).toEqual([]);
  });

  it('maps afterToolCall failures into failure evidence and does not throw on ingest errors', async () => {
    const ingested: Evidence[] = [];
    const evolution = createMastraEvolution({
      learning: {
        ingest(evidence) {
          ingested.push(evidence);
          return Promise.resolve(undefined);
        },
      },
    });
    await evolution.hooks.afterToolCall?.({
      toolName: 'query',
      error: new Error('timeout'),
      threadId: 't1',
    });
    expect(ingested[0]?.kind).toBe('failure');
    expect(ingested[0]?.scope).toEqual({ type: 'thread', threadId: 't1' });

    const throwing = createMastraEvolution({
      learning: {
        ingest() {
          return Promise.reject(new Error('store down'));
        },
      },
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(throwing.hooks.afterToolCall?.({ toolName: 'query' })).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledWith(
        '[mastra-evolution] ingest failed',
        expect.objectContaining({ message: 'store down' }),
      );
    } finally {
      error.mockRestore();
    }
  });

  it('does not expose forAgent', () => {
    const evolution = createMastraEvolution({});
    expect('forAgent' in evolution).toBe(false);
    expect(typeof evolution.extractor).toBe('function');
  });

  it('applyToCall() with no args still merges evolution hooks', async () => {
    const ingested: Evidence[] = [];
    const evolution = createMastraEvolution({
      learning: {
        ingest(evidence) {
          ingested.push(evidence);
          return Promise.resolve(undefined);
        },
      },
    });
    const applied = evolution.applyToCall();
    await Promise.resolve(
      (applied.hooks as { afterToolCall: (ctx: unknown) => Promise<void> }).afterToolCall({
        toolName: 'search',
      }),
    );
    expect(ingested).toHaveLength(1);
  });

  it('throws when learning: true has no workspace to infer a store', () => {
    expect(() => createMastraEvolution({ learning: true })).toThrow(CapabilityError);
    expect(() => createMastraEvolution({ learning: true })).toThrow(MISSING_WORKSPACE_ERROR);
  });

  it('throws for a Mastra-like agent with hasOwnWorkspace but no sync workspace field', () => {
    const agent = {
      id: 'analytics-agent',
      hasOwnWorkspace() {
        return true;
      },
    };
    expect(() => createMastraEvolution({ agent, learning: true })).toThrow(MISSING_WORKSPACE_ERROR);
  });

  it('infers sibling .evolution store and plugs workspace hooks for learning: true', async () => {
    const root = await uniqueTempDir();
    const workspaceDir = path.join(root, 'workspace');
    const workspace = duckWorkspace(workspaceDir);
    const agent = { id: 'analytics-agent', workspace };
    const evolution = createMastraEvolution({ agent, learning: true });
    const bind = inspectWorkspace(workspace);
    expect(bind.storeDirectory).toBe(path.join(root, '.evolution'));
    expect(bind.curatedSkillsDirectory).toBe(path.join(workspaceDir, 'skills'));
    expect(workspace.skillSource).toBeUndefined();
    expect(workspace.toolsConfig?.requireApproval).toBe(true);
    const hooks = workspace.toolsConfig?.hooks as {
      afterToolCall: (ctx: unknown) => Promise<void>;
    };
    expect(typeof hooks.afterToolCall).toBe('function');
    await hooks.afterToolCall({ toolName: 'read_file' });
    expect(existsSync(path.join(root, '.evolution', 'evidence.json'))).toBe(true);
    await evolution.extractor().onExtracted({
      kind: 'correction',
      summary: 'Use booked revenue',
    });
  });

  it('keeps an existing workspace afterToolCall and runs it first', async () => {
    const root = await uniqueTempDir();
    const workspace = duckWorkspace(path.join(root, 'workspace'));
    const order: string[] = [];
    workspace.toolsConfig = {
      requireApproval: true,
      hooks: {
        afterToolCall: () => {
          order.push('existing');
        },
      },
    };
    createMastraEvolution({
      agent: { id: 'analytics-agent', workspace },
      learning: {
        ingest() {
          order.push('evolution');
          return Promise.resolve(undefined);
        },
      },
    });
    const hooks = workspace.toolsConfig.hooks as { afterToolCall: () => Promise<void> };
    await hooks.afterToolCall();
    expect(order).toEqual(['existing', 'evolution']);
    expect(workspace.toolsConfig.requireApproval).toBe(true);
  });

  it('degrades when setToolsConfig is missing and still supports applyToCall', async () => {
    const ingested: Evidence[] = [];
    const evolution = createMastraEvolution({
      agent: {
        id: 'analytics-agent',
        workspace: { filesystem: { basePath: path.join(await uniqueTempDir(), 'workspace') } },
      },
      learning: {
        ingest(evidence) {
          ingested.push(evidence);
          return Promise.resolve(undefined);
        },
      },
    });
    const applied = evolution.applyToCall({ temperature: 0 }) as {
      temperature: number;
      hooks: { afterToolCall: (ctx: unknown) => Promise<void> };
    };
    await Promise.resolve(applied.hooks.afterToolCall({ toolName: 'search' }));
    expect(ingested).toHaveLength(1);
  });

  it('lets options.workspace override agent.workspace', () => {
    const override = duckWorkspace('/override/workspace');
    createMastraEvolution({
      agent: { id: 'analytics-agent', workspace: duckWorkspace('/agent/workspace') },
      workspace: override,
      learning: {
        ingest() {
          return Promise.resolve(undefined);
        },
      },
    });
    expect(override.toolsConfig?.hooks).toBeDefined();
  });

  it('constructs improvement against .evolution/skills without setting skillSource', async () => {
    const root = await uniqueTempDir();
    const workspaceDir = path.join(root, 'workspace');
    const workspace = duckWorkspace(workspaceDir);
    expect(() =>
      createMastraEvolution({
        agent: { id: 'analytics-agent', workspace },
        learning: true,
        improvement: { autonomy: 'auto-promote-bounded' },
      }),
    ).not.toThrow();
    const bind = inspectWorkspace(workspace);
    expect(bind.curatedSkillsDirectory).toBe(path.join(workspaceDir, 'skills'));
    expect(bind.learnedSkillsDirectory).toBe(path.join(root, '.evolution', 'skills'));
    expect(workspace.skillSource).toBeUndefined();
  });

  it('warns when improvement publishes but Workspace cannot discover learned skills', async () => {
    const root = await uniqueTempDir();
    const workspaceDir = path.join(root, 'workspace');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      createMastraEvolution({
        agent: {
          id: 'analytics-agent',
          workspace: {
            filesystem: { basePath: workspaceDir },
            skills: ['skills'],
            getToolsConfig: () => ({ requireApproval: true }),
            setToolsConfig: () => undefined,
          },
        },
        learning: true,
        improvement: { autonomy: 'auto-promote-bounded' },
      });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(LEARNED_SKILLS_DISCOVERY_HINT));
    } finally {
      warn.mockRestore();
    }
  });

  it('does not auto-publish when LocalFilesystem is readOnly', async () => {
    const root = await uniqueTempDir();
    const workspace = duckWorkspace(path.join(root, 'workspace'));
    workspace.filesystem.readOnly = true;
    expect(() =>
      createMastraEvolution({
        agent: { id: 'analytics-agent', workspace },
        learning: true,
        improvement: { autonomy: 'auto-promote-bounded' },
      }),
    ).not.toThrow();
    expect(skillPublisherDirectory(inspectWorkspace(workspace))).toBeUndefined();
    expect(workspace.skillSource).toBeUndefined();
    expect(workspace.toolsConfig?.hooks).toBeDefined();
  });

  it('auto-promotes an accepted procedure lesson to SKILL.md', async () => {
    const root = await uniqueTempDir();
    const workspaceDir = path.join(root, 'workspace');
    const workspace = duckWorkspace(workspaceDir);
    const evolution = createMastraEvolution({
      agent: { id: 'analytics-agent', workspace },
      learning: true,
      improvement: { autonomy: 'auto-promote-bounded' },
    });
    expect(typeof (evolution.learning as { draftSkill?: unknown } | undefined)?.draftSkill).toBe(
      'function',
    );
    const signal = {
      kind: 'procedure',
      summary: 'Use booked revenue excluding cancellations.',
      suggestedAction: 'create-skill',
    };
    for (let index = 0; index < 5; index += 1) {
      await evolution.extractor().onExtracted(signal);
    }
    const skillPath = path.join(
      root,
      '.evolution',
      'skills',
      'use-booked-revenue-excluding-cancellations',
      'SKILL.md',
    );
    expect(existsSync(skillPath)).toBe(true);
    expect(readFileSync(skillPath, 'utf8')).toContain('booked revenue');
    expect(readFileSync(skillPath, 'utf8').split('---').length).toBeLessThan(5);
    const lessons = await evolution.store?.findLessons({ agentId: 'analytics-agent' });
    expect(lessons?.some((lesson) => lesson.status === 'accepted')).toBe(true);
    const events = await evolution.store?.findEvents('analytics-agent');
    expect(events?.filter((event) => event.type === 'evolution.promote')).toHaveLength(1);
  });

  it('does not auto-publish skills when improvement autonomy is validate', async () => {
    const root = await uniqueTempDir();
    const workspaceDir = path.join(root, 'workspace');
    const workspace = duckWorkspace(workspaceDir);
    const evolution = createMastraEvolution({
      agent: { id: 'analytics-agent', workspace },
      learning: true,
      improvement: { autonomy: 'validate' },
    });
    const signal = {
      kind: 'procedure',
      summary: 'Use booked revenue excluding cancellations.',
      suggestedAction: 'create-skill',
    };
    for (let index = 0; index < 5; index += 1) {
      await evolution.extractor().onExtracted(signal);
    }
    expect(
      existsSync(
        path.join(
          root,
          '.evolution',
          'skills',
          'use-booked-revenue-excluding-cancellations',
          'SKILL.md',
        ),
      ),
    ).toBe(false);
    const events = await evolution.store?.findEvents('analytics-agent');
    expect(events?.some((event) => event.type === 'evolution.promote')).toBe(false);
  });
});

describe('@mastra-evolution/adapters package contract', () => {
  it('peer-depends on Mastra optionally and does not install @mastra/* as a hard dependency', () => {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
    };
    expect(
      Object.keys(packageJson.dependencies ?? {}).some((name) => name.startsWith('@mastra/')),
    ).toBe(false);
    expect(packageJson.peerDependencies?.['@mastra/core']).toBe('>=1.63.0 <2');
    expect(packageJson.peerDependencies?.['@mastra/memory']).toBe('>=1.0.0 <2');
    expect(packageJson.peerDependenciesMeta?.['@mastra/core']?.optional).toBe(true);
    expect(packageJson.peerDependenciesMeta?.['@mastra/memory']?.optional).toBe(true);
  });
});
