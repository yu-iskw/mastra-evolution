import type { MastraExtractorFragment } from './types';

export const EVOLUTION_EXTRACTOR_NAME = 'Evolution learning signal';

export const EVOLUTION_EXTRACTOR_INSTRUCTIONS =
  'Extract durable learning signals from the conversation: corrections, failures, procedures, and preferences. Each extraction must include a kind and a short summary.';

export interface EvolutionExtractor extends MastraExtractorFragment {
  name: string;
  instructions: string;
}

/**
 * Documented Observational Memory Extractor shape (`name`, `instructions`, `onExtracted`).
 * Apps that still construct `Memory` pass this into `observationalMemory.observation.extract`.
 * Does not require `@mastra/memory` (optional peer).
 */
export function createEvolutionExtractor(fragment?: MastraExtractorFragment): EvolutionExtractor {
  return {
    name: EVOLUTION_EXTRACTOR_NAME,
    instructions: EVOLUTION_EXTRACTOR_INSTRUCTIONS,
    onExtracted: fragment?.onExtracted ?? noopExtracted,
  };
}

function noopExtracted(_payload: unknown, _ctx?: unknown): Promise<void> {
  return Promise.resolve();
}
