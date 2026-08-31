import path from 'node:path';

import { isPlainObject as isRecord } from '@mastra-evolution/core';

import { mergeCallHooks } from './apply-to-call';

/** Directory name for both curated (`{basePath}/skills`) and learned (`{.evolution}/skills`) roots. */
const SKILLS_SEGMENT = 'skills';
const EVOLUTION_DIR = '.evolution';

export const MISSING_WORKSPACE_ERROR =
  'Evolution needs a Workspace to bind skills and hooks. Pass workspace (Mastra Agent keeps workspace private; hasOwnWorkspace() is not a sync field), or a duck-typed agent.workspace.';

export interface WorkspaceBind {
  readonly basePath: string | undefined;
  readonly storeDirectory: string | undefined;
  /** First configured discover path under the workspace (typically git-managed `skills/`). */
  readonly curatedSkillsDirectory: string | undefined;
  /** Hobby publish target: `{storeDirectory}/skills`. Prefer this for Evolution writes. */
  readonly learnedSkillsDirectory: string | undefined;
  readonly readOnly: boolean;
}

/** Layout for dual skill roots: curated under the workspace, learned under `.evolution/skills`. */
export interface EvolutionWorkspaceLayout {
  readonly basePath: string;
  readonly storeDirectory: string;
  readonly curatedSkillsDirectory: string;
  readonly learnedSkillsDirectory: string;
  /** Paths for `Workspace({ skills })` — curated first, then learned (relative to basePath). */
  readonly skills: readonly [string, string];
  /** Pass to `LocalFilesystem({ allowedPaths })` so skill tools can reach learned skills outside `basePath` (read and write). */
  readonly allowedPaths: readonly string[];
}

export function resolveAttachedWorkspace(options: {
  agent?: unknown;
  workspace?: unknown;
}): unknown {
  if (options.workspace !== undefined) {
    return options.workspace;
  }
  const fromAgent = property(options.agent, 'workspace');
  if (fromAgent !== undefined) {
    return fromAgent;
  }
  return undefined;
}

/** Skills dir to publish into, or `undefined` when the filesystem is read-only. */
export function skillPublisherDirectory(bind: WorkspaceBind): string | undefined {
  if (bind.readOnly) {
    return undefined;
  }
  return bind.learnedSkillsDirectory;
}

/**
 * True when Workspace `skills` lists `learnedSkillsDirectory` and containment allows it
 * (`basePath` or `allowedPaths`). Without this, Evolution can write SKILL.md that agents never load.
 */
export function workspaceCanLoadLearnedSkills(
  workspace: unknown,
  learnedSkillsDirectory: string,
): boolean {
  const filesystem = property(workspace, 'filesystem');
  const basePath = stringFrom(filesystem, 'basePath');
  if (basePath === undefined) {
    return false;
  }
  const resolvedBase = path.resolve(basePath);
  const resolvedLearned = path.resolve(learnedSkillsDirectory);
  if (!skillsPathsInclude(workspace, resolvedBase, resolvedLearned)) {
    return false;
  }
  if (isPathInside(resolvedBase, resolvedLearned)) {
    return true;
  }
  return allowedPathsInclude(filesystem, resolvedBase, resolvedLearned);
}

export const LEARNED_SKILLS_DISCOVERY_HINT =
  'Evolution publishes learned skills under .evolution/skills. Configure Workspace with resolveEvolutionWorkspaceLayout (skills + LocalFilesystem.allowedPaths) or agents cannot load promoted SKILL.md files.';

/**
 * Standard hobby layout: `{parent}/workspace` + `{parent}/.evolution` (+ `/skills` for learned).
 * Use `skills` and `allowedPaths` when constructing Workspace / LocalFilesystem.
 * Prefer `WORKSPACE_DIR` as `{run}/workspace` (not `.`) so `.evolution` stays beside the run root.
 */
export function resolveEvolutionWorkspaceLayout(basePath: string): EvolutionWorkspaceLayout {
  const resolved = path.resolve(basePath);
  const storeDirectory = path.join(path.dirname(resolved), EVOLUTION_DIR);
  const learnedSkillsDirectory = learnedSkillsUnderStore(storeDirectory);
  const learnedRelative = toPosixRelative(resolved, learnedSkillsDirectory);
  return {
    basePath: resolved,
    storeDirectory,
    curatedSkillsDirectory: path.join(resolved, SKILLS_SEGMENT),
    learnedSkillsDirectory,
    skills: [SKILLS_SEGMENT, learnedRelative],
    allowedPaths: [learnedSkillsDirectory],
  };
}

/** `{storeDirectory}/skills` — shared by `inspectWorkspace` and local presets. */
export function learnedSkillsUnderStore(storeDirectory: string): string {
  return path.join(path.resolve(storeDirectory), SKILLS_SEGMENT);
}

export function inspectWorkspace(workspace: unknown): WorkspaceBind {
  const filesystem = property(workspace, 'filesystem');
  const basePath = stringFrom(filesystem, 'basePath');
  const readOnly = isRecord(filesystem) ? Reflect.get(filesystem, 'readOnly') === true : false;
  if (basePath === undefined) {
    return {
      basePath: undefined,
      storeDirectory: undefined,
      curatedSkillsDirectory: undefined,
      learnedSkillsDirectory: undefined,
      readOnly,
    };
  }
  const resolvedBase = path.resolve(basePath);
  const storeDirectory = path.join(path.dirname(resolvedBase), EVOLUTION_DIR);
  return {
    basePath,
    storeDirectory,
    curatedSkillsDirectory: path.join(resolvedBase, firstSkillsSegment(workspace)),
    learnedSkillsDirectory: learnedSkillsUnderStore(storeDirectory),
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
  return firstPathSegment(readWorkspaceSkillEntries(workspace)) ?? SKILLS_SEGMENT;
}

/** First array-of-strings skills config from Workspace (`skills`, `_config`, or `config`). */
function readWorkspaceSkillEntries(workspace: unknown): readonly string[] | undefined {
  for (const candidate of [
    property(workspace, 'skills'),
    property(property(workspace, '_config'), 'skills'),
    property(property(workspace, 'config'), 'skills'),
  ]) {
    if (!Array.isArray(candidate)) {
      continue;
    }
    const entries = candidate.filter(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0,
    );
    if (entries.length > 0) {
      return entries;
    }
  }
  return undefined;
}

function firstPathSegment(skills: readonly string[] | undefined): string | undefined {
  if (skills === undefined) {
    return undefined;
  }
  for (const entry of skills) {
    const trimmed = entry.replace(/^\/+/u, '').replace(/\/+$/u, '');
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
}

function toPosixRelative(from: string, to: string): string {
  const relative = path.relative(from, to);
  return relative.split(path.sep).join('/') || SKILLS_SEGMENT;
}

function skillsPathsInclude(
  workspace: unknown,
  resolvedBase: string,
  resolvedLearned: string,
): boolean {
  const entries = readWorkspaceSkillEntries(workspace);
  if (entries === undefined) {
    return false;
  }
  for (const entry of entries) {
    if (path.resolve(resolvedBase, entry) === resolvedLearned) {
      return true;
    }
  }
  return false;
}

function allowedPathsInclude(
  filesystem: unknown,
  resolvedBase: string,
  resolvedLearned: string,
): boolean {
  const allowed = property(filesystem, 'allowedPaths');
  if (!Array.isArray(allowed)) {
    return false;
  }
  for (const entry of allowed) {
    if (typeof entry !== 'string' || entry.length === 0) {
      continue;
    }
    const resolved = path.isAbsolute(entry)
      ? path.resolve(entry)
      : path.resolve(resolvedBase, entry);
    if (resolved === resolvedLearned || isPathInside(resolved, resolvedLearned)) {
      return true;
    }
  }
  return false;
}

function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
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
