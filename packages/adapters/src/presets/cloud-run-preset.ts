import { PostgresEvolutionStore, type SqlExecutor } from '@mastra-evolution/core/storage-postgres';

import { HOBBY_SKILL_AUTONOMY } from '../autonomy-defaults';
import { FilesystemSkillPublisher } from '../skills/filesystem-skill-publisher';

import { createPresetEvolution, createPresetImprovement } from './shared/create-preset-evolution';
import { createPresetLearning } from './shared/create-preset-learning';

import type { MastraEvolution } from '../types';
import type { SharedImprovementPresetOptions } from './shared/types';
import type { AutonomyLevel, AutonomyName, EvolutionPublisher } from '@mastra-evolution/core';
import type { ImprovementRuntime } from '@mastra-evolution/core/improvement';
import type { LearningRuntime } from '@mastra-evolution/core/learning';

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
  const improvement = createPresetImprovement(store, options, {
    autonomy,
    publisher,
    approval: options.approval,
  });
  const { evolution, learning: boundLearning } = createPresetEvolution({
    agent: options.agent,
    workspace: options.workspace,
    store,
    learning,
    improvement,
    capabilities: options.capabilities,
  });
  return {
    store,
    learning: boundLearning,
    improvement,
    publisher,
    evolution,
    autonomy,
  };
}
