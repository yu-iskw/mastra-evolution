import { CapabilityError, isPlainObject as isRecord } from '@mastra-evolution/core';
import { createImprovement } from '@mastra-evolution/improvement';
import { createLearning } from '@mastra-evolution/learning';
import { LocalEvolutionStore } from '@mastra-evolution/storage-local';

import { applyProcessors, mergeCallHooks } from './apply-to-call';
import { createBoundedSkillEvaluator } from './create-bounded-skill-evaluator';
import { createEvolutionExtractor } from './create-evolution-extractor';
import { createMastraEvaluator } from './create-mastra-evaluator';
import { FilesystemSkillPublisher } from './filesystem-skill-publisher';
import {
  createAfterToolCall,
  createLearningExtractors,
  resolveAgentId,
  resolveLearning,
} from './learning-bridge';
import { probeCapabilities } from './probe-capabilities';
import { promoteAcceptedLesson } from './promote-accepted-lesson';
import {
  attachWorkspaceHooks,
  inspectWorkspace,
  MISSING_WORKSPACE_ERROR,
  resolveAttachedWorkspace,
  skillPublisherDirectory,
} from './workspace-bind';

import type {
  CreateMastraEvolutionOptions,
  ImprovementConfig,
  LearningConfig,
  LearningLike,
  MastraEvolution,
} from './types';
import type {
  EvolutionStore,
  EvolutionScope,
  ImprovementEvaluator,
  Lesson,
} from '@mastra-evolution/core';
import type { ImprovementRuntime } from '@mastra-evolution/improvement';

const LEARN_AUTONOMY = 'learn' as const;
const HOBBY_IMPROVEMENT_AUTONOMY = 'auto-promote-bounded' as const;

/**
 * Plug Evolution into an existing Mastra Agent without subclassing.
 *
 * Infers `agent.workspace` (or `options.workspace`), merges `afterToolCall` into
 * workspace `tools.hooks` when `setToolsConfig` exists, and infers a local store
 * beside the workspace filesystem when `learning: true`.
 *
 * `register(agent)` returns the same object identity (`Object.is`) and does not wrap
 * `agent.constructor`. `applyToCall` is an escape hatch for assigned tools.
 */
export function createMastraEvolution(options: CreateMastraEvolutionOptions): MastraEvolution {
  const workspace = resolveAttachedWorkspace(options);
  const bind = inspectWorkspace(workspace);
  const agentId = resolveAgentId(options.agent);
  const store = resolveStore(options, bind);
  const rawLearning = materializeLearning(options.learning, store, agentId);
  const improvement = materializeImprovement(options.improvement, store, bind);
  const learningInput = attachImprovementLoop(rawLearning, improvement, store);
  const learning = resolveLearning(learningInput);
  const capabilities = {
    ...probeCapabilities(options.agent),
    ...options.capabilities,
  };
  const scope: EvolutionScope = { type: 'agent', agentId };
  const extractors = createLearningExtractors(learning, agentId, scope);
  const processors: unknown[] = [];
  const afterToolCall = createAfterToolCall(learning, agentId);
  const hooks = { afterToolCall };
  if (learning.enabled) {
    attachWorkspaceHooks(workspace, afterToolCall);
  }

  return {
    capabilities,
    extractors,
    processors,
    hooks,
    store,
    learning: hasLearningRuntime(learningInput) ? learningInput : undefined,
    improvement,
    applyToCall<T extends Record<string, unknown> = Record<string, unknown>>(callOptions?: T): T {
      const source = (callOptions ?? {}) as T;
      const next = {
        ...source,
        hooks: mergeCallHooks((source as { hooks?: unknown }).hooks, hooks),
      } as T;
      return applyProcessors(source, next, processors);
    },
    /**
     * Identity only. The factory already plugs workspace hooks when possible.
     */
    register<T>(agent: T): T {
      return agent;
    },
    extractor() {
      return createEvolutionExtractor(extractors[0]);
    },
  };
}

function resolveStore(
  options: CreateMastraEvolutionOptions,
  bind: ReturnType<typeof inspectWorkspace>,
): EvolutionStore | undefined {
  if (options.store) {
    return options.store;
  }
  if (!needsConstructedStore(options.learning, options.improvement)) {
    return undefined;
  }
  if (bind.storeDirectory === undefined) {
    throw new CapabilityError(MISSING_WORKSPACE_ERROR);
  }
  return new LocalEvolutionStore({ directory: bind.storeDirectory });
}

function needsConstructedStore(learning: unknown, improvement: unknown): boolean {
  return willConstructLearning(learning) || willConstructImprovement(improvement);
}

function willConstructLearning(learning: unknown): boolean {
  if (learning === true) {
    return true;
  }
  if (learning === false || learning === undefined) {
    return false;
  }
  if (hasLearningRuntime(learning)) {
    return false;
  }
  return isRecord(learning) && learning.enabled !== false;
}

function willConstructImprovement(improvement: unknown): boolean {
  if (improvement === true) {
    return true;
  }
  if (improvement === false || improvement === undefined) {
    return false;
  }
  if (isImprovementRuntime(improvement)) {
    return false;
  }
  if (!isRecord(improvement)) {
    return false;
  }
  if (improvement.enabled === false) {
    return false;
  }
  return improvement.enabled === true || improvement.autonomy !== undefined;
}

function materializeLearning(
  learning: CreateMastraEvolutionOptions['learning'],
  store: EvolutionStore | undefined,
  agentId: string,
): LearningLike | { enabled: boolean } | undefined {
  if (learning === undefined || learning === false) {
    return learning === false ? { enabled: false } : undefined;
  }
  if (hasLearningRuntime(learning)) {
    return learning;
  }
  if (learning === true) {
    return requireLearning(store, agentId, { autonomy: LEARN_AUTONOMY });
  }
  if (learning.enabled === false) {
    return { enabled: false };
  }
  return requireLearning(store, agentId, learning);
}

function requireLearning(
  store: EvolutionStore | undefined,
  agentId: string,
  config: LearningConfig,
): LearningLike {
  if (store === undefined) {
    throw new CapabilityError(MISSING_WORKSPACE_ERROR);
  }
  return createLearning({
    store,
    agentId,
    autonomy: config.autonomy ?? LEARN_AUTONOMY,
    acceptThreshold: config.acceptThreshold,
    sync: config.sync,
    redactor: config.redactor,
    telemetry: config.telemetry,
  });
}

function materializeImprovement(
  improvement: CreateMastraEvolutionOptions['improvement'],
  store: EvolutionStore | undefined,
  bind: ReturnType<typeof inspectWorkspace>,
): ImprovementRuntime | undefined {
  if (canAutoPromote(improvement)) {
    return improvement;
  }
  if (!isConstructableImprovement(improvement)) {
    return undefined;
  }
  if (store === undefined) {
    throw new CapabilityError(MISSING_WORKSPACE_ERROR);
  }
  const config = improvementConfig(improvement);
  const publisherDirectory = skillPublisherDirectory(bind);
  const publisher =
    publisherDirectory === undefined
      ? undefined
      : new FilesystemSkillPublisher({ directory: publisherDirectory });
  return createImprovement({
    store,
    evaluator: resolveEvaluator(config),
    publisher,
    approval: config.approval,
    policy: config.promotionPolicy,
    autonomy: config.autonomy ?? HOBBY_IMPROVEMENT_AUTONOMY,
    experimentsAvailable: config.experimentsAvailable ?? true,
  });
}

function isConstructableImprovement(
  improvement: CreateMastraEvolutionOptions['improvement'],
): improvement is true | ImprovementConfig {
  return willConstructImprovement(improvement);
}

function improvementConfig(improvement: true | ImprovementConfig): ImprovementConfig {
  if (improvement === true) {
    return { enabled: true, autonomy: HOBBY_IMPROVEMENT_AUTONOMY };
  }
  return improvement;
}

function resolveEvaluator(config: ImprovementConfig): ImprovementEvaluator {
  if (config.evaluator) {
    return config.evaluator;
  }
  if (config.experimentsAvailable === true) {
    return createMastraEvaluator({ experimentsAvailable: true });
  }
  return createBoundedSkillEvaluator();
}

function attachImprovementLoop(
  learning: LearningLike | { enabled: boolean } | undefined,
  improvement: ImprovementRuntime | undefined,
  store: EvolutionStore | undefined,
): LearningLike | { enabled: boolean } | undefined {
  if (!hasLearningRuntime(learning) || improvement === undefined || store === undefined) {
    return learning;
  }
  return {
    async ingest(evidence) {
      const result = await learning.ingest(evidence);
      await promoteFromIngestResult(result, improvement, store);
      return result;
    },
    async ingestSignal(input, context) {
      if (learning.ingestSignal === undefined) {
        return undefined;
      }
      const result = await learning.ingestSignal(input, context);
      await promoteFromIngestResult(result, improvement, store);
      return result;
    },
  };
}

async function promoteFromIngestResult(
  result: unknown,
  improvement: ImprovementRuntime,
  store: EvolutionStore,
): Promise<void> {
  const lesson = lessonFromIngestResult(result);
  if (lesson === undefined) {
    return;
  }
  try {
    await promoteAcceptedLesson({ lesson, improvement, store });
  } catch {
    return;
  }
}

function lessonFromIngestResult(result: unknown): Lesson | undefined {
  if (!isRecord(result) || !isRecord(result.lesson)) {
    return undefined;
  }
  const lesson = result.lesson as unknown as Lesson;
  return typeof lesson.id === 'string' && typeof lesson.status === 'string' ? lesson : undefined;
}

function hasLearningRuntime(value: unknown): value is LearningLike {
  return (
    isRecord(value) &&
    (typeof value.ingest === 'function' || typeof value.ingestSignal === 'function')
  );
}

function canAutoPromote(value: unknown): value is ImprovementRuntime {
  return (
    isRecord(value) &&
    typeof value.proposeFromLesson === 'function' &&
    typeof value.promote === 'function'
  );
}

function isImprovementRuntime(value: unknown): value is { proposeFromLesson: unknown } {
  return isRecord(value) && typeof value.proposeFromLesson === 'function';
}
