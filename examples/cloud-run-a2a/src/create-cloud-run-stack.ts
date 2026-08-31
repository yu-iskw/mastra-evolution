import path from 'node:path';

import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { LocalFilesystem, Workspace } from '@mastra/core/workspace';
import { createMastraEvolution, resolveEvolutionWorkspaceLayout } from '@mastra-evolution/mastra';
import { PostgresEvolutionStore } from '@mastra-evolution/storage-postgres';

import { workspaceDir as defaultWorkspaceDir } from './env';

import type { MastraEvolution } from '@mastra-evolution/mastra';
import type { SqlExecutor } from '@mastra-evolution/storage-postgres';

const MODEL = 'google/gemini-flash-lite-latest';
export const AGENT_ID = 'analytics-agent';

export interface CloudRunStack {
  readonly agent: Agent;
  readonly evolution: MastraEvolution;
  readonly mastra: Mastra;
  readonly store: PostgresEvolutionStore;
  readonly workspace: Workspace;
  readonly workspaceDir: string;
}

export interface CreateCloudRunStackOptions {
  readonly sql?: SqlExecutor;
  readonly workspaceDir?: string;
}

/**
 * Workspace + Agent + Postgres Evolution store + Mastra instance. No HTTP.
 *
 * Pass `sql` in production (a `pg` wrapper). The default stub typechecks
 * without a database driver. Do not put Evolution state on Cloud Storage FUSE.
 *
 * Discovers git-managed `skills/` and learned `.evolution/skills` (hobby disk
 * publish). Cloud artifact bytes should still use an object bucket in production.
 */
export function createCloudRunStack(options: CreateCloudRunStackOptions = {}): CloudRunStack {
  const workspaceDir = path.resolve(options.workspaceDir ?? defaultWorkspaceDir());
  const layout = resolveEvolutionWorkspaceLayout(workspaceDir);
  const workspace = new Workspace({
    id: 'analytics-workspace',
    filesystem: new LocalFilesystem({
      basePath: layout.basePath,
      allowedPaths: [...layout.allowedPaths],
    }),
    skills: [...layout.skills],
    tools: { requireApproval: false },
  });
  const agent = new Agent({
    id: AGENT_ID,
    name: AGENT_ID,
    instructions: [
      'You are an analytics assistant.',
      'Prefer workspace files over guessing.',
      'Keep answers to a few sentences.',
    ].join(' '),
    model: MODEL,
    workspace,
  });
  const store = new PostgresEvolutionStore({
    sql: options.sql ?? createSqlExecutorStub(),
  });
  const evolution = createMastraEvolution({
    agent,
    workspace,
    store,
    learning: true,
    improvement: { autonomy: 'validate', experimentsAvailable: false },
  });
  const mastra = new Mastra({
    agents: { [AGENT_ID]: agent },
    logger: false,
  });
  return { agent, evolution, mastra, store, workspace, workspaceDir: layout.basePath };
}

/** In-memory no-op executor so this example typechecks without a `pg` driver. */
function createSqlExecutorStub(): SqlExecutor {
  return {
    query: async <T = Record<string, unknown>>(
      _sql: string,
      _params?: readonly unknown[],
    ): Promise<T[]> => {
      return [];
    },
    execute: async (_sql: string, _params?: readonly unknown[]): Promise<void> => {
      return;
    },
  };
}
