import type { EvolutionScope } from './scope';

export type LessonKind =
  | 'fact'
  | 'preference'
  | 'procedure'
  | 'correction'
  | 'failure-pattern'
  | 'success-pattern'
  | 'missing-capability';

export type LessonStatus = 'candidate' | 'accepted' | 'rejected' | 'superseded';

export type SuggestedAction =
  'memory' | 'create-skill' | 'update-skill' | 'instruction-change' | 'workflow-change' | 'none';

export interface LessonValidity {
  validFrom?: Date;
  validUntil?: Date;
  revalidateAfter?: Date;
}

export interface Lesson {
  id: string;
  agentId: string;
  scope: EvolutionScope;
  kind: LessonKind;
  statement: string;
  evidenceIds: string[];
  confidence: number;
  occurrenceCount: number;
  firstObservedAt: Date;
  lastObservedAt: Date;
  status: LessonStatus;
  suggestedAction?: SuggestedAction;
  supersedesLessonId?: string;
  validity?: LessonValidity;
}

export interface LessonQuery {
  agentId?: string;
  scope?: EvolutionScope;
  status?: LessonStatus;
  kind?: LessonKind;
  statement?: string;
}
