import {
  CapabilityError,
  isPlainObject as isRecord,
  parseAutonomy,
  stringField,
} from '@mastra-evolution/core';
import { createImprovement } from '@mastra-evolution/improvement';
import { createLearning, type IngestResult } from '@mastra-evolution/learning';
import { LocalEvolutionStore } from '@mastra-evolution/storage-local';

import { applyProcessors, mergeCallHooks } from './attach/apply-to-call';
import {
  attachWorkspaceHooks,
  inspectWorkspace,
  LEARNED_SKILLS_DISCOVERY_HINT,
  learnedSkillsUnderStore,
  MISSING_WORKSPACE_ERROR,
  resolveAttachedWorkspace,
  skillPublisherDirectory,
  workspaceCanLoadLearnedSkills,
} from './attach/workspace-bind';
import { probeCapabilities } from './capabilities/probe-capabilities';
import { createBoundedSkillEvaluator } from './evaluate/create-bounded-skill-evaluator';
import { createMastraEvaluator } from './evaluate/create-mastra-evaluator';
import { createEvolutionExtractor } from './learning/create-evolution-extractor';
import {
  createAfterToolCall,
  createLearningExtractors,
  isLearningRuntime,
  resolveAgentId,
  resolveLearning,
} from './learning/learning-bridge';
import { FilesystemSkillPublisher } from './skills/filesystem-skill-publisher';
import { promoteAcceptedLesson } from './skills/promote-accepted-lesson';

import type {
  CreateMastraEvolutionOptions,
  ImprovementConfig,
  LearningConfig,
  LearningLike,
  MastraEvolution,
} from './types';
import type { EvolutionStore, EvolutionScope, Lesson } from '@mastra-evolution/core';
import type { ImprovementRuntime } from '@mastra-evolution/improvement';

const LEARN_AUTONOMY = 'learn' as const;
const HOBBY_IMPROVEMENT_AUTONOMY = 'auto-promote-bounded' as const;

/**
 * Plug Evolution into an existing Mastra Agent without subclassing.
 *
 * Pass `workspace` for a real Mastra Agent (`#workspace` is private; `getWorkspace()`
 * is async). Duck-typed `agent.workspace` still works. Merges `afterToolCall` into
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
  const improvement = materializeImprovement(options.improvement, store, bind, workspace);
  const learningInput = attachImprovementLoop(
    rawLearning,
    shouldAutoPromoteOnIngest(options.improvement) ? improvement : undefined,
    store,
  );
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
    learning: isLearningRuntime(learningInput) ? learningInput : undefined,
    improvement,
    applyToCall<T extends Record<string, unknown> = Record<string, unknown>>(callOptions?: T): T {
      const source = callOptions ?? ({} as T);
      return applyProcessors(
        source,
        {
          ...source,
          hooks: mergeCallHooks('hooks' in source ? source.hooks : undefined, hooks),
        },
        processors,
      );
    },
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
  if (!(willConstructLearning(options.learning) || willConstructImprovement(options.improvement))) {
    return undefined;
  }
  if (bind.storeDirectory === undefined) {
    throw new CapabilityError(MISSING_WORKSPACE_ERROR);
  }
  return new LocalEvolutionStore({ directory: bind.storeDirectory });
}

function willConstructLearning(learning: unknown): boolean {
  if (learning === true) {
    return true;
  }
  if (learning === false || learning === undefined) {
    return false;
  }
  if (isLearningRuntime(learning)) {
    return false;
  }
  return isRecord(learning) && learning.enabled !== false;
}

function willConstructImprovement(
  improvement: CreateMastraEvolutionOptions['improvement'],
): improvement is true | ImprovementConfig {
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
  if (isLearningRuntime(learning)) {
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
  workspace: unknown,
): ImprovementRuntime | undefined {
  if (isImprovementRuntime(improvement)) {
    return improvement;
  }
  if (!willConstructImprovement(improvement)) {
    return undefined;
  }
  if (store === undefined) {
    throw new CapabilityError(MISSING_WORKSPACE_ERROR);
  }
  const config: ImprovementConfig =
    improvement === true ? { enabled: true, autonomy: HOBBY_IMPROVEMENT_AUTONOMY } : improvement;
  const autonomy = config.autonomy ?? HOBBY_IMPROVEMENT_AUTONOMY;
  const level = parseAutonomy(autonomy);
  const publisherDirectory = resolvePublisherDirectory(bind, store);
  if (
    publisherDirectory !== undefined &&
    !workspaceCanLoadLearnedSkills(workspace, publisherDirectory)
  ) {
    console.warn(`[mastra-evolution] ${LEARNED_SKILLS_DISCOVERY_HINT}`);
  }
  const publisher =
    publisherDirectory === undefined
      ? undefined
      : new FilesystemSkillPublisher({ directory: publisherDirectory });
  return createImprovement({
    store,
    evaluator:
      config.evaluator ??
      (level >= 4
        ? createBoundedSkillEvaluator()
        : createMastraEvaluator({
            experimentsAvailable: config.experimentsAvailable ?? false,
          })),
    publisher,
    approval: config.approval,
    policy: config.promotionPolicy,
    autonomy,
    experimentsAvailable: config.experimentsAvailable ?? level >= 4,
  });
}

function resolvePublisherDirectory(
  bind: ReturnType<typeof inspectWorkspace>,
  store: EvolutionStore,
): string | undefined {
  if (bind.readOnly) {
    return undefined;
  }
  const storeDirectory = isRecord(store) ? stringField(store, 'directory') : undefined;
  if (storeDirectory !== undefined) {
    return learnedSkillsUnderStore(storeDirectory);
  }
  return skillPublisherDirectory(bind);
}

function shouldAutoPromoteOnIngest(
  improvement: CreateMastraEvolutionOptions['improvement'],
): boolean {
  if (improvement === true) {
    return true;
  }
  if (improvement === false || improvement === undefined || isImprovementRuntime(improvement)) {
    return false;
  }
  if (!willConstructImprovement(improvement)) {
    return false;
  }
  return parseAutonomy(improvement.autonomy ?? HOBBY_IMPROVEMENT_AUTONOMY) >= 4;
}

function attachImprovementLoop(
  learning: LearningLike | { enabled: boolean } | undefined,
  improvement: ImprovementRuntime | undefined,
  store: EvolutionStore | undefined,
): LearningLike | { enabled: boolean } | undefined {
  if (!isLearningRuntime(learning) || improvement === undefined || store === undefined) {
    return learning;
  }
  return {
    ...learning,
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
  } catch (error: unknown) {
    // Ingest already succeeded; do not fail the agent tool hook on promote/publish errors.
    console.error('[mastra-evolution] skill promote failed after ingest', error);
  }
}

function lessonFromIngestResult(result: unknown): Lesson | undefined {
  if (!isIngestResult(result) || result.lesson === undefined) {
    return undefined;
  }
  return result.lesson;
}

function isIngestResult(value: unknown): value is IngestResult {
  if (
    !isRecord(value) ||
    typeof value.stored !== 'boolean' ||
    typeof value.duplicate !== 'boolean'
  ) {
    return false;
  }
  return value.lesson === undefined || isLesson(value.lesson);
}

function isLesson(value: unknown): value is Lesson {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    typeof value.agentId === 'string' &&
    typeof value.statement === 'string' &&
    typeof value.status === 'string' &&
    Array.isArray(value.evidenceIds)
  );
}

function isImprovementRuntime(value: unknown): value is ImprovementRuntime {
  return (
    isRecord(value) &&
    typeof value.proposeFromLesson === 'function' &&
    typeof value.promote === 'function'
  );
}
