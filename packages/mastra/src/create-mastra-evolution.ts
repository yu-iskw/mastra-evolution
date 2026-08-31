import { applyProcessors, mergeCallHooks } from './apply-to-call';
import {
  createAfterToolCall,
  createLearningExtractors,
  resolveAgentId,
  resolveLearning,
} from './learning-bridge';
import { probeCapabilities } from './probe-capabilities';

import type { CreateMastraEvolutionOptions, MastraEvolution } from './types';
import type { EvolutionScope } from '@mastra-evolution/core';

const EVOLUTION_METADATA = Symbol.for('@mastra-evolution/mastra');

/**
 * Attach Evolution fragments to an existing Mastra Agent without subclassing.
 *
 * `register(agent)` returns the same object identity (`Object.is`) and does not wrap
 * or replace `agent.constructor`. `applyToCall` returns a new options object: hooks merge
 * by key (caller first, then evolution); per-call `inputProcessors` replace rather than concat.
 */
export function createMastraEvolution(options: CreateMastraEvolutionOptions): MastraEvolution {
  const capabilities = {
    ...probeCapabilities(options.agent),
    ...options.capabilities,
  };
  const learning = resolveLearning(options.learning);
  const agentId = resolveAgentId(options.agent);
  const scope: EvolutionScope = { type: 'agent', agentId };
  const extractors = createLearningExtractors(learning, agentId, scope);
  const processors: unknown[] = [];
  const afterToolCall = createAfterToolCall(learning, agentId);
  const hooks = { afterToolCall };
  const metadata = {
    capabilities,
    store: options.store,
    improvement: options.improvement,
  };

  return {
    capabilities,
    extractors,
    processors,
    hooks,
    applyToCall<T extends Record<string, unknown>>(callOptions: T): T {
      const next = {
        ...callOptions,
        hooks: mergeCallHooks(callOptions.hooks, hooks),
      } as T;
      return applyProcessors(callOptions, next, processors);
    },
    register<T>(agent: T): T {
      attachMetadata(agent, metadata);
      return agent;
    },
  };
}

function attachMetadata(agent: unknown, metadata: unknown): void {
  if (agent === null || (typeof agent !== 'object' && typeof agent !== 'function')) {
    return;
  }
  try {
    Object.defineProperty(agent, EVOLUTION_METADATA, {
      configurable: true,
      enumerable: false,
      value: metadata,
      writable: false,
    });
  } catch {
    return;
  }
}
