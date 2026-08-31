import { describe, expect, it } from 'vitest';

import {
  createEvolutionExtractor,
  EVOLUTION_EXTRACTOR_INSTRUCTIONS,
  EVOLUTION_EXTRACTOR_NAME,
} from './create-evolution-extractor';

describe('createEvolutionExtractor', () => {
  it('returns the documented Extractor shape and forwards onExtracted', async () => {
    const seen: unknown[] = [];
    const extractor = createEvolutionExtractor({
      onExtracted(payload) {
        seen.push(payload);
      },
    });
    expect(extractor.name).toBe(EVOLUTION_EXTRACTOR_NAME);
    expect(extractor.instructions).toBe(EVOLUTION_EXTRACTOR_INSTRUCTIONS);
    await extractor.onExtracted({ kind: 'correction', summary: 'Use booked revenue' });
    expect(seen).toEqual([{ kind: 'correction', summary: 'Use booked revenue' }]);
  });

  it('no-ops when no fragment is provided', async () => {
    const extractor = createEvolutionExtractor();
    await expect(extractor.onExtracted({ kind: 'fact' })).resolves.toBeUndefined();
  });
});
