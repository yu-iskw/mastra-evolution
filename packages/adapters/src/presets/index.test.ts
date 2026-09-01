import { describe, expect, it } from 'vitest';

import {
  CLOUD_STORAGE_FUSE_WARNING,
  cloudRunPreset,
  enterpriseGovernedPreset,
  localEvolutionPreset,
  localLearningPreset,
} from './index';

describe('@mastra-evolution/adapters/presets public API', () => {
  it('exports preset factories and the Cloud Storage FUSE warning', () => {
    expect(typeof localLearningPreset).toBe('function');
    expect(typeof localEvolutionPreset).toBe('function');
    expect(typeof cloudRunPreset).toBe('function');
    expect(typeof enterpriseGovernedPreset).toBe('function');
    expect(CLOUD_STORAGE_FUSE_WARNING).toContain('FUSE');
  });
});
