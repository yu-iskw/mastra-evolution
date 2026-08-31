import { createImprovement } from '@mastra-evolution/improvement';
import { createLearning } from '@mastra-evolution/learning';
import { createMastraEvaluator } from '@mastra-evolution/mastra';
import { CLOUD_STORAGE_FUSE_WARNING, createMastraEvolution } from '@mastra-evolution/presets';
import { PostgresEvolutionStore } from '@mastra-evolution/storage-postgres';

import type { EvolutionStore } from '@mastra-evolution/core';
import type { MastraEvolution } from '@mastra-evolution/mastra';
import type { SqlExecutor } from '@mastra-evolution/storage-postgres';

/**
 * Cloud Run + A2A wiring (typecheck only).
 *
 * A2A is Mastra's transport. Evolution is transport-agnostic: consume
 * thread/resource/trace context from the agent request, not A2A frames.
 * Multiple Cloud Run instances share PostgreSQL for Evolution state and an
 * object bucket for skill artifacts. Optimistic concurrency on proposal
 * version (`VersionConflictError`) serializes skill publication.
 *
 * Do not use Cloud Storage FUSE as a SQLite/LibSQL database.
 */
async function main(): Promise<void> {
  const agent = { name: 'analytics-agent' };
  const sql = createSqlExecutorStub();
  const store: EvolutionStore = new PostgresEvolutionStore({ sql });
  const learning = createLearning({
    store,
    agentId: agent.name,
    autonomy: 'learn',
  });
  const evaluator = createMastraEvaluator({ experimentsAvailable: false });
  const improvement = createImprovement({
    store,
    evaluator,
    autonomy: 'validate',
    experimentsAvailable: false,
  });
  const evolution: MastraEvolution = createMastraEvolution({
    agent,
    learning,
    improvement,
    store,
  });
  const registered = evolution.register(agent);
  // register(agent) returns the same instance (Object.is); it does not wrap or subclass.
  if (!Object.is(registered, agent)) {
    throw new Error('register(agent) must return the same agent reference');
  }

  if (!readEnv('DATABASE_URL')) {
    console.log('skip: DATABASE_URL is not set; not connecting to PostgreSQL');
    console.log(CLOUD_STORAGE_FUSE_WARNING);
    return;
  }

  // A real SqlExecutor would wrap `pg` (or compatible) using DATABASE_URL.
  // ARTIFACT_BUCKET holds skill blobs only — never Evolution transactional state.
  console.log(
    `Evolution Cloud Run wiring ready for ${agent.name}. Artifact bucket: ${readEnv('ARTIFACT_BUCKET') ?? '(unset)'}`,
  );
}

/** In-memory no-op executor so this example typechecks without a database driver. */
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

function readEnv(name: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name];
}

void main().catch((error: unknown) => {
  console.error(error);
  const proc = (globalThis as { process?: { exitCode?: number } }).process;
  if (proc) {
    proc.exitCode = 1;
  }
});
