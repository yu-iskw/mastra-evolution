import { createImprovement } from '@mastra-evolution/improvement';
import { FilesystemSkillPublisher } from '@mastra-evolution/mastra';
import { PostgresEvolutionStore } from '@mastra-evolution/storage-postgres';

import { HOBBY_SKILL_AUTONOMY } from './autonomy-defaults';
import { createPresetEvolution, resolvePresetEvaluator } from './create-preset-evolution';
import { createPresetLearning } from './create-preset-learning';

import type { SharedImprovementPresetOptions } from './types';
import type { AutonomyLevel, AutonomyName, EvolutionPublisher } from '@mastra-evolution/core';
import type { ImprovementRuntime } from '@mastra-evolution/improvement';
import type { LearningRuntime } from '@mastra-evolution/learning';
import type { MastraEvolution } from '@mastra-evolution/mastra';
import type { SqlExecutor } from '@mastra-evolution/storage-postgres';

/**
 * CLOUD_STORAGE_FUSE_WARNING
 *
 * Never put SQLite/LibSQL Evolution state on Cloud Storage FUSE.
 * Artifacts may use object storage; transactional Evolution state is Postgres.
 */
export const CLOUD_STORAGE_FUSE_WARNING =
  'Never put SQLite/LibSQL Evolution state on Cloud Storage FUSE; artifacts may use object storage; transactional state is Postgres.';

export interface CloudRunPresetOptions extends SharedImprovementPresetOptions {
  sql: SqlExecutor;
  artifactDirectory?: string;
}

export interface CloudRunPreset {
  store: PostgresEvolutionStore;
  learning: LearningRuntime;
  improvement: ImprovementRuntime;
  publisher: EvolutionPublisher | undefined;
  evolution: MastraEvolution;
  autonomy: AutonomyLevel | AutonomyName;
}

/**
 * Multi-instance Cloud Run preset.
 *
 * Never put SQLite/LibSQL Evolution state on Cloud Storage FUSE; artifacts may
 * use object storage; transactional state is Postgres.
 *
 * @see CLOUD_STORAGE_FUSE_WARNING
 */
export function cloudRunPreset(options: CloudRunPresetOptions): CloudRunPreset {
  const store = new PostgresEvolutionStore({ sql: options.sql });
  const learning = createPresetLearning(store, options);
  const publisher = options.artifactDirectory
    ? new FilesystemSkillPublisher({ directory: options.artifactDirectory })
    : undefined;
  const autonomy = options.autonomy ?? HOBBY_SKILL_AUTONOMY;
  const improvement = createImprovement({
    store,
    evaluator: resolvePresetEvaluator(options),
    publisher,
    approval: options.approval,
    autonomy,
    experimentsAvailable: options.experimentsAvailable,
    telemetry: options.telemetry,
    now: options.now,
    id: options.id,
  });
  return {
    store,
    learning,
    improvement,
    publisher,
    evolution: createPresetEvolution({
      agent: options.agent,
      store,
      learning,
      improvement,
      capabilities: options.capabilities,
    }),
    autonomy,
  };
}
