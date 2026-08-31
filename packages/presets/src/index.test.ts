import { createImprovement } from '@mastra-evolution/improvement';
import { createLearning } from '@mastra-evolution/learning';
import { createMastraEvolution } from '@mastra-evolution/mastra';
import { describe, expect, it } from 'vitest';

import {
  CLOUD_STORAGE_FUSE_WARNING,
  cloudRunPreset,
  createImprovement as createImprovementFromPresets,
  createLearning as createLearningFromPresets,
  createMastraEvolution as createMastraEvolutionFromPresets,
  enterpriseGovernedPreset,
  localEvolutionPreset,
  localLearningPreset,
} from './index';

describe('@mastra-evolution/presets public API', () => {
  it('re-exports learning, improvement, and mastra factories', () => {
    expect(createLearningFromPresets).toBe(createLearning);
    expect(createImprovementFromPresets).toBe(createImprovement);
    expect(createMastraEvolutionFromPresets).toBe(createMastraEvolution);
    expect(typeof localLearningPreset).toBe('function');
    expect(typeof localEvolutionPreset).toBe('function');
    expect(typeof cloudRunPreset).toBe('function');
    expect(typeof enterpriseGovernedPreset).toBe('function');
    expect(CLOUD_STORAGE_FUSE_WARNING).toContain('FUSE');
  });
});
