import type { EvidenceKind, LearningSuggestedAction, LessonKind, SuggestedAction } from '../domain';

export function lessonKindFromEvidence(kind: EvidenceKind): LessonKind {
  switch (kind) {
    case 'correction': {
      return 'correction';
    }
    case 'success': {
      return 'success-pattern';
    }
    case 'failure': {
      return 'failure-pattern';
    }
    case 'preference': {
      return 'preference';
    }
    case 'fact': {
      return 'fact';
    }
    case 'procedure': {
      return 'procedure';
    }
    case 'missing-capability': {
      return 'missing-capability';
    }
    case 'policy-signal': {
      return 'fact';
    }
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function toSuggestedAction(
  value: LearningSuggestedAction | undefined,
): SuggestedAction | undefined {
  if (value === undefined || value === 'retain') {
    return undefined;
  }
  return value;
}
