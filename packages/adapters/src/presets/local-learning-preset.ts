import path from 'node:path';

import { LocalEvolutionStore } from '@mastra-evolution/core/storage-local';

import { LEARN_AUTONOMY } from '../autonomy-defaults';

import { createPresetEvolution } from './shared/create-preset-evolution';
import { createPresetLearning } from './shared/create-preset-learning';

import type { MastraEvolution } from '../types';
import type { SharedPresetOptions } from './shared/types';
import type { LearningRuntime } from '@mastra-evolution/core/learning';

const EVOLUTION_DIR = 'evolution';

export interface LocalLearningPresetOptions extends SharedPresetOptions {
  /**
   * Store root. `LocalEvolutionStore` is created at this path, or at
   * `options.directory/evolution` when `directory` is a project data root
   * whose basename is not already `evolution`.
   */
  directory: string;
}

/**
 * Learning-only hobby preset. Improvement is disabled and no skill publisher
 * is constructed.
 */
export interface LocalLearningPreset {
  store: LocalEvolutionStore;
  learning: LearningRuntime;
  improvement: undefined;
  publisher: undefined;
  evolution: MastraEvolution;
  autonomy: 'learn';
}

export function localLearningPreset(options: LocalLearningPresetOptions): LocalLearningPreset {
  const store = new LocalEvolutionStore({
    directory: resolveLocalLearningDirectory(options.directory),
  });
  const learning = createPresetLearning(store, options);
  const { evolution, learning: boundLearning } = createPresetEvolution({
    agent: options.agent,
    workspace: options.workspace,
    store,
    learning,
    improvement: { enabled: false },
    capabilities: options.capabilities,
  });
  return {
    store,
    learning: boundLearning,
    improvement: undefined,
    publisher: undefined,
    evolution,
    autonomy: LEARN_AUTONOMY,
  };
}

function resolveLocalLearningDirectory(directory: string): string {
  return path.basename(directory) === EVOLUTION_DIR
    ? directory
    : path.join(directory, EVOLUTION_DIR);
}
