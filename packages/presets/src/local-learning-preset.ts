import path from 'node:path';

import { LocalEvolutionStore } from '@mastra-evolution/storage-local';

import { LEARN_AUTONOMY } from './autonomy-defaults';
import { createPresetEvolution } from './create-preset-evolution';
import { createPresetLearning } from './create-preset-learning';

import type { SharedPresetOptions } from './types';
import type { LearningRuntime } from '@mastra-evolution/learning';
import type { MastraEvolution } from '@mastra-evolution/mastra';

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
  return {
    store,
    learning,
    improvement: undefined,
    publisher: undefined,
    evolution: createPresetEvolution({
      agent: options.agent,
      store,
      learning,
      improvement: { enabled: false },
      capabilities: options.capabilities,
    }),
    autonomy: LEARN_AUTONOMY,
  };
}

function resolveLocalLearningDirectory(directory: string): string {
  return path.basename(directory) === EVOLUTION_DIR
    ? directory
    : path.join(directory, EVOLUTION_DIR);
}
