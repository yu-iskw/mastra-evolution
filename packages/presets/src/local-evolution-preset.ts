import path from 'node:path';

import { FilesystemSkillPublisher } from '@mastra-evolution/mastra';
import { LocalEvolutionStore } from '@mastra-evolution/storage-local';

import { HOBBY_SKILL_AUTONOMY } from './autonomy-defaults';
import { createPresetEvolution, createPresetImprovement } from './create-preset-evolution';
import { createPresetLearning } from './create-preset-learning';

import type { SharedImprovementPresetOptions } from './types';
import type { AutonomyLevel, AutonomyName } from '@mastra-evolution/core';
import type { ImprovementRuntime } from '@mastra-evolution/improvement';
import type { LearningRuntime } from '@mastra-evolution/learning';
import type { MastraEvolution } from '@mastra-evolution/mastra';

const DEFAULT_SKILLS_DIR = 'skills';

export interface LocalEvolutionPresetOptions extends SharedImprovementPresetOptions {
  directory: string;
  skillsDirectory?: string;
}

export interface LocalEvolutionPreset {
  store: LocalEvolutionStore;
  learning: LearningRuntime;
  improvement: ImprovementRuntime;
  publisher: FilesystemSkillPublisher;
  evolution: MastraEvolution;
  autonomy: AutonomyLevel | AutonomyName;
}

export function localEvolutionPreset(options: LocalEvolutionPresetOptions): LocalEvolutionPreset {
  const store = new LocalEvolutionStore({ directory: options.directory });
  const learning = createPresetLearning(store, options);
  const publisher = new FilesystemSkillPublisher({
    directory: options.skillsDirectory ?? path.join(options.directory, DEFAULT_SKILLS_DIR),
  });
  const autonomy = options.autonomy ?? HOBBY_SKILL_AUTONOMY;
  const improvement = createPresetImprovement(store, options, {
    autonomy,
    publisher,
    approval: options.approval,
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
