import type { EvolutionScope } from './scope';

export type EvidenceSource =
  | 'interaction'
  | 'feedback'
  | 'tool-call'
  | 'tool-result'
  | 'trace'
  | 'memory-extractor'
  | 'evaluation';

export type EvidenceKind =
  | 'correction'
  | 'success'
  | 'failure'
  | 'preference'
  | 'fact'
  | 'procedure'
  | 'missing-capability'
  | 'policy-signal';

export interface EvidenceProvenance {
  threadId?: string;
  resourceId?: string;
  traceId?: string;
  spanId?: string;
  runId?: string;
  sourceIdentity?: string;
}

export interface Evidence {
  id: string;
  agentId: string;
  scope: EvolutionScope;
  source: EvidenceSource;
  kind: EvidenceKind;
  summary: string;
  provenance: EvidenceProvenance;
  observedAt: Date;
}

export interface EvidenceQuery {
  agentId?: string;
  scope?: EvolutionScope;
  sourceIdentity?: string;
  kind?: EvidenceKind;
}
