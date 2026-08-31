/* eslint-disable security/detect-non-literal-fs-filename -- package.json path is resolved from __dirname */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createMastraEvolution } from './create-mastra-evolution';
import { probeCapabilities } from './probe-capabilities';

import type { LearningLike } from './types';
import type { Evidence } from '@mastra-evolution/core';
import type { InMemoryEvolutionStore } from '@mastra-evolution/testing';

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
        return Promise.resolve();
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
        return Promise.resolve();
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
        return Promise.resolve();
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
          return Promise.resolve();
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
    await expect(throwing.hooks.afterToolCall?.({ toolName: 'query' })).resolves.toBeUndefined();
  });
});

describe('@mastra-evolution/mastra package contract', () => {
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
