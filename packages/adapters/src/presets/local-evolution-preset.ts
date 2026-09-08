import { LocalEvolutionStore } from '@mastra-evolution/core/storage-local';

import { learnedSkillsUnderStore } from '../attach/workspace-bind';
import { HOBBY_SKILL_AUTONOMY } from '../autonomy-defaults';
import { FilesystemSkillPublisher } from '../skills/filesystem-skill-publisher';

import { createPresetEvolution, createPresetImprovement } from './shared/create-preset-evolution';
import { createPresetLearning } from './shared/create-preset-learning';

import type { MastraEvolution } from '../types';
import type { SharedImprovementPresetOptions } from './shared/types';
import type { AutonomyLevel, AutonomyName } from '@mastra-evolution/core';
import type { ImprovementRuntime } from '@mastra-evolution/core/improvement';
import type { LearningRuntime } from '@mastra-evolution/core/learning';

export interface LocalEvolutionPresetOptions extends SharedImprovementPresetOptions {
  directory: string;
  /** Override publish directory (defaults to `{directory}/skills`). */
  learnedSkillsDirectory?: string;
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
    directory: options.learnedSkillsDirectory ?? learnedSkillsUnderStore(options.directory),
  });
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
