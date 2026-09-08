import type { EvidenceKind } from './evidence';
import type { SuggestedAction } from './lesson';
import type { EvolutionScope } from './scope';

export type LearningSignalKind = Exclude<EvidenceKind, 'fact' | 'policy-signal'> | 'procedure';

export type LearningSuggestedAction = SuggestedAction | 'retain';

export interface LearningSignal {
  kind: LearningSignalKind;
  summary: string;
  importance?: number;
  confidence?: number;
  suggestedScope?: EvolutionScope['type'];
  suggestedAction?: LearningSuggestedAction;
  contradictsStatement?: string;
}
