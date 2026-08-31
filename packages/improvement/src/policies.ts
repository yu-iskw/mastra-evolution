import type {
  ImprovementEvaluation,
  ImprovementProposal,
  PromotionContext,
  PromotionDecision,
  PromotionPolicy,
  ScopePromotionPolicy,
} from '@mastra-evolution/core';

export const LEARNING_ONLY_REASON = 'learning-only';
export const RECOMMEND_ONLY_REASON = 'recommend-only';
export const NON_SKILL_TARGET_REASON = 'only skills may be auto-promoted';

const INCONCLUSIVE_REASON = 'inconclusive';
const ORG_SCOPE_REASON = 'one user cannot org-promote';
const ENTERPRISE_APPROVAL_REASON = 'enterprise autonomy requires approval';
const VALIDATE_APPROVAL_REASON = 'autonomy validate requires approval';
const SENSITIVE_CONTENT_REASON = 'credentials/security content';
const UNSAFE_TARGET_REASON = 'target is not auto-mutable';
const EVALUATION_FAILED_REASON = 'evaluation failed';
const PUBLISH_DECISION: PromotionDecision = { decision: 'publish' };

const SENSITIVE_NEEDLES = [
  'credential',
  'secret',
  'password',
  'authorization',
  'authz',
  'api key',
] as const;

const DEFAULT_INDEPENDENT_SOURCES = 2;
const DEFAULT_INDEPENDENT_USERS = 2;

export function composePromotionPolicies(...policies: PromotionPolicy[]): PromotionPolicy {
  return {
    async decide(proposal, evaluation, context) {
      for (const policy of policies) {
        const decision = await policy.decide(proposal, evaluation, context);
        if (decision.decision !== 'publish') {
          return decision;
        }
      }
      return PUBLISH_DECISION;
    },
  };
}

export function evidenceThresholdPolicy(minOccurrence?: number): PromotionPolicy {
  return syncPolicy((proposal) => {
    if (minOccurrence === undefined) {
      return PUBLISH_DECISION;
    }
    const occurrence = occurrenceFromArtifact(proposal.candidateArtifact);
    if (occurrence === undefined || occurrence >= minOccurrence) {
      return PUBLISH_DECISION;
    }
    return { decision: 'reject', reason: `occurrence ${occurrence} < ${minOccurrence}` };
  });
}

export function scopePolicy(minIndependentSources = DEFAULT_INDEPENDENT_SOURCES): PromotionPolicy {
  return syncPolicy((proposal, _evaluation, context) => {
    if (
      proposal.scope.type === 'organization' &&
      (context.independentSourceCount ?? 0) < minIndependentSources
    ) {
      return { decision: 'reject', reason: ORG_SCOPE_REASON };
    }
    return PUBLISH_DECISION;
  });
}

export function regressionPolicy(): PromotionPolicy {
  return syncPolicy((_proposal, evaluation) => {
    if (evaluation.verdict === 'fail' || evaluation.regressions.length > 0) {
      return {
        decision: 'reject',
        reason: evaluation.regressions.join(', ') || EVALUATION_FAILED_REASON,
      };
    }
    if (evaluation.verdict === 'inconclusive') {
      return { decision: 'reject', reason: INCONCLUSIVE_REASON };
    }
    return PUBLISH_DECISION;
  });
}

export function securityPolicy(): PromotionPolicy {
  return syncPolicy((proposal) => {
    switch (proposal.target.type) {
      case 'instructions':
      case 'workflow':
      case 'tool-policy': {
        return { decision: 'reject', reason: UNSAFE_TARGET_REASON };
      }
      case 'skill': {
        break;
      }
      default: {
        const exhaustive: never = proposal.target;
        return exhaustive;
      }
    }
    if (containsSensitiveText(proposal)) {
      return { decision: 'reject', reason: SENSITIVE_CONTENT_REASON };
    }
    return PUBLISH_DECISION;
  });
}

export function approvalAutonomyPolicy(): PromotionPolicy {
  return syncPolicy((proposal, _evaluation, context) => decideByAutonomy(proposal, context));
}

export function defaultHobbyPromotionPolicy(): PromotionPolicy {
  return composePromotionPolicies(
    regressionPolicy(),
    securityPolicy(),
    scopePolicy(),
    approvalAutonomyPolicy(),
  );
}

export function defaultEnterprisePromotionPolicy(): PromotionPolicy {
  return composePromotionPolicies(
    regressionPolicy(),
    securityPolicy(),
    scopePolicy(),
    alwaysRequestApprovalPolicy(),
  );
}

export function independentUsersScopePromotionPolicy(
  minUsers = DEFAULT_INDEPENDENT_USERS,
): ScopePromotionPolicy {
  return {
    canPromoteToOrganization(input) {
      return input.independentSourceCount >= minUsers;
    },
  };
}

function alwaysRequestApprovalPolicy(): PromotionPolicy {
  return syncPolicy(() => ({ decision: 'request-approval', reason: ENTERPRISE_APPROVAL_REASON }));
}

function syncPolicy(
  decide: (
    proposal: ImprovementProposal,
    evaluation: ImprovementEvaluation,
    context: PromotionContext,
  ) => PromotionDecision,
): PromotionPolicy {
  return {
    decide(proposal, evaluation, context) {
      return Promise.resolve(decide(proposal, evaluation, context));
    },
  };
}

function decideByAutonomy(
  proposal: ImprovementProposal,
  context: PromotionContext,
): PromotionDecision {
  switch (context.autonomy) {
    case 0:
    case 1: {
      return { decision: 'reject', reason: LEARNING_ONLY_REASON };
    }
    case 2: {
      return { decision: 'reject', reason: RECOMMEND_ONLY_REASON };
    }
    case 3: {
      return { decision: 'request-approval', reason: VALIDATE_APPROVAL_REASON };
    }
    case 4:
    case 5: {
      if (proposal.target.type !== 'skill') {
        return { decision: 'reject', reason: NON_SKILL_TARGET_REASON };
      }
      return PUBLISH_DECISION;
    }
    default: {
      const exhaustive: never = context.autonomy;
      return exhaustive;
    }
  }
}

function occurrenceFromArtifact(artifact: unknown): number | undefined {
  if (typeof artifact !== 'object' || artifact === null) {
    return undefined;
  }
  const record = artifact as Record<string, unknown>;
  if (typeof record.occurrenceCount === 'number') {
    return record.occurrenceCount;
  }
  if (typeof record.occurrence === 'number') {
    return record.occurrence;
  }
  return undefined;
}

function containsSensitiveText(proposal: ImprovementProposal): boolean {
  const artifactText = textFromArtifact(proposal.candidateArtifact);
  const haystack = `${proposal.reason} ${artifactText}`.toLowerCase();
  return SENSITIVE_NEEDLES.some((needle) => haystack.includes(needle));
}

function textFromArtifact(artifact: unknown): string {
  if (typeof artifact === 'string') {
    return artifact;
  }
  if (typeof artifact !== 'object' || artifact === null) {
    return '';
  }
  const record = artifact as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof record.markdown === 'string') {
    parts.push(record.markdown);
  }
  if (typeof record.name === 'string') {
    parts.push(record.name);
  }
  return parts.join(' ');
}
