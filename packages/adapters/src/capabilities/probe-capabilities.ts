import { isPlainObject as isRecord, ownValue } from '@mastra-evolution/core';

import type { MastraCapabilities } from '../types';

const EMPTY_CAPABILITIES: MastraCapabilities = {
  observationalMemory: false,
  memoryExtractors: false,
  skills: false,
  skillSearch: false,
  versionedSkills: false,
  feedback: false,
  datasets: false,
  experiments: false,
  toolHooks: false,
  dynamicWorkflows: false,
  fineGrainedAuthorization: false,
};

const MAX_PROBE_DEPTH = 2;

/**
 * Duck-type a Mastra agent, memory instance, or module namespace.
 * Does not read or encode `@mastra/*` version strings.
 */
export function probeCapabilities(source?: unknown): MastraCapabilities {
  if (source === undefined || source === null) {
    return { ...EMPTY_CAPABILITIES };
  }
  const tokens = new Set<string>();
  collectTokens(source, 0, [], tokens);
  if (tokens.size === 0) {
    return { ...EMPTY_CAPABILITIES };
  }
  return {
    observationalMemory: hasToken(tokens, 'Memory', 'observationalMemory'),
    memoryExtractors: hasToken(tokens, 'Extractor', 'onExtracted', 'observationalMemory.extract'),
    skills: hasToken(tokens, 'createSkill', 'skills'),
    skillSearch: hasToken(tokens, 'SkillSearchProcessor'),
    versionedSkills: hasToken(tokens, 'CompositeVersionedSkillSource', 'VersionedSkillSource'),
    feedback: hasToken(tokens, 'addFeedback', 'feedback'),
    datasets: hasToken(tokens, 'datasets', 'addItem'),
    experiments: hasToken(tokens, 'startExperiment', 'compareExperiments'),
    toolHooks: hasToken(tokens, 'hooks', 'afterToolCall', 'beforeToolCall'),
    dynamicWorkflows: hasToken(
      tokens,
      'addDynamicWorkflow',
      'upsertDynamicWorkflow',
      'dynamicWorkflows',
    ),
    fineGrainedAuthorization: hasToken(tokens, 'fga', 'IFGAProvider', 'fineGrainedAuthorization'),
  };
}

function hasToken(tokens: ReadonlySet<string>, ...names: string[]): boolean {
  return names.some((name) => tokens.has(name));
}

function collectTokens(
  value: unknown,
  depth: number,
  path: readonly string[],
  tokens: Set<string>,
): void {
  if (depth > MAX_PROBE_DEPTH || value === undefined || value === null) {
    return;
  }
  if (typeof value === 'function' && value.name.length > 0) {
    tokens.add(value.name);
  }
  if (!isWalkable(value)) {
    return;
  }
  addConstructorName(value, tokens);
  for (const key of Object.keys(value)) {
    addKeyTokens(key, path, tokens);
    const child = ownValue(value, key);
    if (typeof child === 'function' && child.name.length > 0) {
      tokens.add(child.name);
    }
    addConstructorName(child, tokens);
    if (depth < MAX_PROBE_DEPTH) {
      collectTokens(child, depth + 1, [...path, key], tokens);
    }
  }
}

function addKeyTokens(key: string, path: readonly string[], tokens: Set<string>): void {
  tokens.add(key);
  if (key === 'extract' && path.includes('observationalMemory')) {
    tokens.add('observationalMemory.extract');
  }
}

function addConstructorName(value: unknown, tokens: Set<string>): void {
  if (!isRecord(value) && typeof value !== 'function') {
    return;
  }
  const ctor = (value as { constructor?: { name?: string } }).constructor;
  const name = ctor?.name;
  if (typeof name === 'string' && name.length > 0 && name !== 'Object' && name !== 'Function') {
    tokens.add(name);
  }
}

function isWalkable(value: unknown): value is object {
  if (typeof value === 'function') {
    return true;
  }
  if (!isRecord(value) || Array.isArray(value) || value instanceof Date) {
    return false;
  }
  return true;
}
