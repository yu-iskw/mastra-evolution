import { isPlainObject } from '@mastra-evolution/core';

import type {
  EvolutionScope,
  LearningSignal,
  LearningSignalKind,
  LearningSuggestedAction,
} from '@mastra-evolution/core';

const LEARNING_SIGNAL_KINDS: Record<LearningSignalKind, true> = {
  correction: true,
  failure: true,
  'missing-capability': true,
  preference: true,
  procedure: true,
  success: true,
};

const SCOPE_TYPES: Record<EvolutionScope['type'], true> = {
  agent: true,
  organization: true,
  resource: true,
  team: true,
  thread: true,
};

const SUGGESTED_ACTIONS: Record<LearningSuggestedAction, true> = {
  'create-skill': true,
  'instruction-change': true,
  memory: true,
  none: true,
  retain: true,
  'update-skill': true,
  'workflow-change': true,
};

const LEARNING_SIGNAL_KIND_SET: ReadonlySet<string> = new Set(Object.keys(LEARNING_SIGNAL_KINDS));
const SCOPE_TYPE_SET: ReadonlySet<string> = new Set(Object.keys(SCOPE_TYPES));
const SUGGESTED_ACTION_SET: ReadonlySet<string> = new Set(Object.keys(SUGGESTED_ACTIONS));

export function parseLearningSignal(input: unknown): LearningSignal | undefined {
  if (!isPlainObject(input)) {
    return undefined;
  }
  if (!isLearningSignalKind(input.kind) || typeof input.summary !== 'string') {
    return undefined;
  }

  const signal: LearningSignal = {
    kind: input.kind,
    summary: input.summary,
  };

  if (typeof input.importance === 'number') {
    signal.importance = input.importance;
  }
  if (typeof input.confidence === 'number') {
    signal.confidence = input.confidence;
  }
  if (isScopeType(input.suggestedScope)) {
    signal.suggestedScope = input.suggestedScope;
  }
  if (isSuggestedAction(input.suggestedAction)) {
    signal.suggestedAction = input.suggestedAction;
  }
  if (typeof input.contradictsStatement === 'string') {
    signal.contradictsStatement = input.contradictsStatement;
  }

  return signal;
}

function isLearningSignalKind(value: unknown): value is LearningSignalKind {
  return typeof value === 'string' && LEARNING_SIGNAL_KIND_SET.has(value);
}

function isScopeType(value: unknown): value is EvolutionScope['type'] {
  return typeof value === 'string' && SCOPE_TYPE_SET.has(value);
}

function isSuggestedAction(value: unknown): value is LearningSuggestedAction {
  return typeof value === 'string' && SUGGESTED_ACTION_SET.has(value);
}
