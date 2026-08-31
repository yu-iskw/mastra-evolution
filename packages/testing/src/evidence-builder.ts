import type {
  Evidence,
  EvolutionScope,
  EvidenceKind,
  EvidenceSource,
} from '@mastra-evolution/core';

export function buildEvidence(
  overrides: Partial<Evidence> & { id: string; agentId: string },
): Evidence {
  const scope: EvolutionScope = overrides.scope ?? { type: 'resource', resourceId: 'alice' };
  const kind: EvidenceKind = overrides.kind ?? 'correction';
  const source: EvidenceSource = overrides.source ?? 'interaction';
  return {
    source,
    kind,
    scope,
    summary: overrides.summary ?? 'Use booked revenue excluding cancellations.',
    provenance: overrides.provenance ?? { sourceIdentity: overrides.id, resourceId: 'alice' },
    observedAt: overrides.observedAt ?? new Date('2026-08-31T00:00:00.000Z'),
    ...overrides,
  };
}
