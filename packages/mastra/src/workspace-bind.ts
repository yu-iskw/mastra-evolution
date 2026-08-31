import path from 'node:path';

import { isPlainObject as isRecord } from '@mastra-evolution/core';

import { mergeCallHooks } from './apply-to-call';

const DEFAULT_SKILLS_SEGMENT = 'skills';
const EVOLUTION_DIR = '.evolution';

export const MISSING_WORKSPACE_ERROR =
  'Evolution needs a Workspace to bind skills and hooks. Pass an agent with agent.workspace, or workspace.';

export interface WorkspaceBind {
  readonly workspace: unknown;
  readonly basePath: string | undefined;
  readonly storeDirectory: string | undefined;
  readonly skillsDirectory: string | undefined;
  readonly readOnly: boolean;
}

/**
 * `options.workspace` wins over `agent.workspace`.
 */
export function resolveAttachedWorkspace(options: {
  agent?: unknown;
  workspace?: unknown;
}): unknown {
  if (options.workspace !== undefined) {
    return options.workspace;
  }
  return property(options.agent, 'workspace');
}

/** Skills dir to publish into, or `undefined` when the filesystem is read-only. */
export function skillPublisherDirectory(bind: WorkspaceBind): string | undefined {
  if (bind.readOnly) {
    return undefined;
  }
  return bind.skillsDirectory;
}

export function inspectWorkspace(workspace: unknown): WorkspaceBind {
  const filesystem = property(workspace, 'filesystem');
  const basePath = stringFrom(filesystem, 'basePath');
  const readOnly = isRecord(filesystem) ? Reflect.get(filesystem, 'readOnly') === true : false;
  const skillsDirectory =
    basePath === undefined
      ? undefined
      : path.join(path.resolve(basePath), firstSkillsSegment(workspace));
  const storeDirectory =
    basePath === undefined
      ? undefined
      : path.join(path.dirname(path.resolve(basePath)), EVOLUTION_DIR);
  return {
    workspace,
    basePath,
    storeDirectory,
    skillsDirectory,
    readOnly,
  };
}

/**
 * Merge Evolution `afterToolCall` into workspace `tools.hooks` without dropping
 * existing `requireApproval` or per-tool keys. `setToolsConfig` is a full replace.
 * Returns false when the workspace has no setter (capability degrade).
 */
export function attachWorkspaceHooks(
  workspace: unknown,
  afterToolCall: (context: unknown) => Promise<void> | void,
): boolean {
  const setter = method(workspace, 'setToolsConfig');
  if (setter === undefined) {
    return false;
  }
  const getter = method(workspace, 'getToolsConfig');
  const previous = getter === undefined ? undefined : getter();
  const previousRecord = isRecord(previous) ? previous : {};
  setter({
    ...previousRecord,
    hooks: mergeCallHooks(previousRecord.hooks, { afterToolCall }),
  });
  return true;
}

function firstSkillsSegment(workspace: unknown): string {
  const skills = property(workspace, 'skills');
  if (!Array.isArray(skills)) {
    return DEFAULT_SKILLS_SEGMENT;
  }
  for (const entry of skills) {
    if (typeof entry !== 'string' || entry.length === 0) {
      continue;
    }
    const trimmed = entry.replace(/^\/+/u, '').replace(/\/+$/u, '');
    return trimmed.length > 0 ? trimmed : DEFAULT_SKILLS_SEGMENT;
  }
  return DEFAULT_SKILLS_SEGMENT;
}

function stringFrom(target: unknown, key: string): string | undefined {
  const value = property(target, key);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function property(target: unknown, key: string): unknown {
  if (target === undefined || target === null || typeof target !== 'object') {
    return undefined;
  }
  return Reflect.get(target, key);
}

function method(target: unknown, key: string): ((...args: unknown[]) => unknown) | undefined {
  const value = property(target, key);
  return typeof value === 'function'
    ? (value as (...args: unknown[]) => unknown).bind(target)
    : undefined;
}
