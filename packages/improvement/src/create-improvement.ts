import { parseAutonomy, slugSkillName } from '@mastra-evolution/core';

import {
  defaultEnterprisePromotionPolicy,
  defaultHobbyPromotionPolicy,
  LEARNING_ONLY_REASON,
  NON_SKILL_TARGET_REASON,
  RECOMMEND_ONLY_REASON,
} from './policies';

import type {
  ApprovalProvider,
  ApprovedImprovementProposal,
  AutonomyLevel,
  AutonomyName,
  EvaluationContext,
  EvolutionEventType,
  EvolutionPublisher,
  EvolutionStore,
  EvolutionTelemetry,
  ImprovementEvaluation,
  ImprovementEvaluator,
  ImprovementProposal,
  Lesson,
  PromotionDecision,
  PromotionPolicy,
  ProposalStatus,
} from '@mastra-evolution/core';

const MISSING_EXPERIMENTS_ERROR =
  'Experiments are unavailable. Configure Mastra experiments or an external ImprovementEvaluator before publishing.';
const MISSING_EVALUATOR_ERROR =
  'No ImprovementEvaluator is configured. Pass evaluator to createImprovement before publishing.';
const MISSING_PROPOSAL_ERROR = 'Improvement proposal was not found';
const SKILL_TARGET_TYPE = 'skill' as const;
const EVENT_PROMOTE: EvolutionEventType = 'evolution.promote';

export interface CreateImprovementOptions {
  store: EvolutionStore;
  evaluator?: ImprovementEvaluator;
  publisher?: EvolutionPublisher;
  approval?: ApprovalProvider;
  policy?: PromotionPolicy;
  autonomy?: AutonomyLevel | AutonomyName;
  experimentsAvailable?: boolean;
  telemetry?: EvolutionTelemetry;
  now?: () => Date;
  id?: () => string;
}

export interface ImprovementRuntime {
  proposeFromLesson(lesson: Lesson, artifact?: unknown): Promise<ImprovementProposal>;
  evaluate(proposalId: string, context?: EvaluationContext): Promise<ImprovementProposal>;
  promote(proposalId: string): Promise<ImprovementProposal>;
  rollback(proposalId: string): Promise<ImprovementProposal>;
}

type EvaluatedProposal = ImprovementProposal & { evaluation: ImprovementEvaluation };

interface RuntimeDeps {
  store: EvolutionStore;
  evaluator?: ImprovementEvaluator;
  publisher?: EvolutionPublisher;
  approval?: ApprovalProvider;
  policy: PromotionPolicy;
  autonomy: AutonomyLevel;
  experimentsAvailable: boolean;
  telemetry?: EvolutionTelemetry;
  now: () => Date;
  id: () => string;
}

export function createImprovement(options: CreateImprovementOptions): ImprovementRuntime {
  const autonomy = parseAutonomy(options.autonomy ?? 'validate');
  const deps: RuntimeDeps = {
    store: options.store,
    evaluator: options.evaluator,
    publisher: options.publisher,
    approval: options.approval,
    policy: options.policy ?? defaultPolicyFor(autonomy),
    autonomy,
    experimentsAvailable: options.experimentsAvailable ?? true,
    telemetry: options.telemetry,
    now: options.now ?? (() => new Date()),
    id: options.id ?? nextProposalId,
  };

  return {
    proposeFromLesson: (lesson, artifact) =>
      runSpanned(deps, 'evolution.proposal.generate', () =>
        proposeFromLesson(deps, lesson, artifact),
      ),
    evaluate: (proposalId, context) =>
      runSpanned(deps, 'evolution.evaluate', () =>
        evaluateProposal(deps, proposalId, context ?? {}),
      ),
    promote: (proposalId) =>
      runSpanned(deps, EVENT_PROMOTE, () => promoteProposal(deps, proposalId)),
    rollback: (proposalId) =>
      runSpanned(deps, 'evolution.rollback', () => rollbackProposal(deps, proposalId)),
  };
}

function nextProposalId(): string {
  return `imp_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 10)}`;
}

function defaultPolicyFor(autonomy: AutonomyLevel): PromotionPolicy {
  return autonomy >= 4 ? defaultHobbyPromotionPolicy() : defaultEnterprisePromotionPolicy();
}

async function runSpanned<T>(deps: RuntimeDeps, name: string, run: () => Promise<T>): Promise<T> {
  if (deps.telemetry) {
    return deps.telemetry.span(name, run);
  }
  return run();
}

async function proposeFromLesson(
  deps: RuntimeDeps,
  lesson: Lesson,
  artifact?: unknown,
): Promise<ImprovementProposal> {
  const at = deps.now();
  const proposal: ImprovementProposal = {
    id: deps.id(),
    agentId: lesson.agentId,
    scope: lesson.scope,
    reason: lesson.statement,
    lessonIds: [lesson.id],
    evidenceIds: [...lesson.evidenceIds],
    target: { type: SKILL_TARGET_TYPE },
    candidateArtifact: artifact ?? {
      markdown: lesson.statement,
      name: slugSkillName(lesson.statement, `skill-${lesson.id}`),
    },
    status: 'draft',
    version: 0,
    createdAt: at,
    updatedAt: at,
  };
  await deps.store.putProposal(proposal);
  await appendEvent(deps, 'evolution.proposal.generate', lesson.agentId, {
    proposalId: proposal.id,
    lessonId: lesson.id,
  });
  return proposal;
}

async function evaluateProposal(
  deps: RuntimeDeps,
  proposalId: string,
  context: EvaluationContext,
): Promise<EvaluatedProposal> {
  const proposal = await requireProposal(deps, proposalId);
  if (!deps.experimentsAvailable || !deps.evaluator) {
    return persistEvaluation(deps, proposal, {
      verdict: 'inconclusive',
      regressions: [],
      error: deps.experimentsAvailable ? MISSING_EVALUATOR_ERROR : MISSING_EXPERIMENTS_ERROR,
    });
  }

  const evaluation = await deps.evaluator.evaluate(proposal, context);
  const next = await persistEvaluation(deps, proposal, evaluation);
  await appendEvent(deps, 'evolution.evaluate', proposal.agentId, {
    proposalId: proposal.id,
    verdict: evaluation.verdict,
  });
  return next;
}

async function promoteProposal(
  deps: RuntimeDeps,
  proposalId: string,
): Promise<ImprovementProposal> {
  const proposal = await requireProposal(deps, proposalId);
  const blocked = autonomyBlock(deps.autonomy);
  if (blocked) {
    return applyDecision(deps, proposal, blocked);
  }
  const evaluated: EvaluatedProposal =
    proposal.evaluation === undefined
      ? await evaluateProposal(deps, proposalId, {})
      : { ...proposal, evaluation: proposal.evaluation };
  const { evaluation } = evaluated;
  const independentSourceCount = await countIndependentSources(deps.store, evaluated);
  const decision = await deps.policy.decide(evaluated, evaluation, {
    autonomy: deps.autonomy,
    independentSourceCount,
  });
  return applyDecision(deps, evaluated, decision);
}

async function rollbackProposal(
  deps: RuntimeDeps,
  proposalId: string,
): Promise<ImprovementProposal> {
  const proposal = await requireProposal(deps, proposalId);
  let previousRevision = proposal.baselineRevision;
  if (deps.publisher?.rollback) {
    const rolled = await deps.publisher.rollback(proposal);
    previousRevision = rolled.revision;
  }
  const next: ImprovementProposal = {
    ...proposal,
    status: 'rolled-back',
    candidateRevision: previousRevision,
    updatedAt: deps.now(),
  };
  await deps.store.putProposal(next);
  await appendEvent(deps, 'evolution.rollback', proposal.agentId, {
    proposalId: proposal.id,
    previousRevision,
  });
  return next;
}

async function applyDecision(
  deps: RuntimeDeps,
  proposal: ImprovementProposal,
  decision: PromotionDecision,
): Promise<ImprovementProposal> {
  switch (decision.decision) {
    case 'reject': {
      return persistStatus(deps, proposal, 'rejected', { reason: decision.reason });
    }
    case 'request-approval': {
      return requestApproval(deps, proposal, decision.reason);
    }
    case 'publish': {
      return publishApproved(deps, proposal);
    }
    default: {
      const exhaustive: never = decision;
      return exhaustive;
    }
  }
}

async function requestApproval(
  deps: RuntimeDeps,
  proposal: ImprovementProposal,
  reason: string,
): Promise<ImprovementProposal> {
  const awaiting = await persistStatus(deps, proposal, 'awaiting-approval', { reason });
  if (!deps.approval) {
    return awaiting;
  }
  const result = await deps.approval.requestApproval(awaiting);
  switch (result.decision) {
    case 'rejected': {
      return persistStatus(deps, awaiting, 'rejected', { reason: result.reason });
    }
    case 'approved': {
      return publishApproved(deps, awaiting);
    }
    default: {
      const exhaustive: never = result;
      return exhaustive;
    }
  }
}

async function publishApproved(
  deps: RuntimeDeps,
  proposal: ImprovementProposal,
): Promise<ImprovementProposal> {
  if (proposal.target.type !== SKILL_TARGET_TYPE) {
    return persistStatus(deps, proposal, 'rejected', { reason: NON_SKILL_TARGET_REASON });
  }
  const approved: ApprovedImprovementProposal = {
    ...proposal,
    status: 'approved',
    updatedAt: deps.now(),
  };
  if (!deps.publisher) {
    await deps.store.putProposal(approved);
    return approved;
  }

  const publishedRevision = await deps.publisher.publish(approved);
  const published: ImprovementProposal = {
    ...approved,
    status: 'published',
    candidateRevision: publishedRevision.revision,
    baselineRevision: publishedRevision.previousRevision ?? proposal.baselineRevision,
    version: proposal.version + 1,
    updatedAt: deps.now(),
  };
  try {
    await deps.store.putProposal(published);
  } catch (error: unknown) {
    await appendEvent(deps, 'evolution.error', proposal.agentId, {
      proposalId: proposal.id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error instanceof Error ? error : new Error('Failed to persist published proposal');
  }
  await appendEvent(deps, EVENT_PROMOTE, proposal.agentId, {
    proposalId: proposal.id,
    revision: publishedRevision.revision,
    previousRevision: publishedRevision.previousRevision,
  });
  deps.telemetry?.record(EVENT_PROMOTE, { proposalId: proposal.id });
  return published;
}

function autonomyBlock(autonomy: AutonomyLevel): PromotionDecision | undefined {
  switch (autonomy) {
    case 0:
    case 1: {
      return { decision: 'reject', reason: LEARNING_ONLY_REASON };
    }
    case 2: {
      return { decision: 'reject', reason: RECOMMEND_ONLY_REASON };
    }
    case 3:
    case 4:
    case 5: {
      return undefined;
    }
    default: {
      const exhaustive: never = autonomy;
      return exhaustive;
    }
  }
}

async function persistEvaluation(
  deps: RuntimeDeps,
  proposal: ImprovementProposal,
  evaluation: ImprovementEvaluation,
): Promise<EvaluatedProposal> {
  const next: EvaluatedProposal = {
    ...proposal,
    evaluation,
    status: evaluation.error && proposal.status === 'draft' ? 'draft' : 'evaluating',
    updatedAt: deps.now(),
  };
  await deps.store.putProposal(next);
  return next;
}

async function persistStatus(
  deps: RuntimeDeps,
  proposal: ImprovementProposal,
  status: ProposalStatus,
  payload: Record<string, unknown>,
): Promise<ImprovementProposal> {
  const next: ImprovementProposal = {
    ...proposal,
    status,
    updatedAt: deps.now(),
  };
  await deps.store.putProposal(next);
  if (status === 'rejected') {
    await appendEvent(deps, 'evolution.error', proposal.agentId, {
      proposalId: proposal.id,
      ...payload,
    });
  }
  return next;
}

async function requireProposal(
  deps: RuntimeDeps,
  proposalId: string,
): Promise<ImprovementProposal> {
  const proposal = await deps.store.getProposal(proposalId);
  if (!proposal) {
    throw new Error(`${MISSING_PROPOSAL_ERROR}: ${proposalId}`);
  }
  return proposal;
}

async function appendEvent(
  deps: RuntimeDeps,
  type: EvolutionEventType,
  agentId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await deps.store.appendEvent({
    id: deps.id(),
    type,
    agentId,
    at: deps.now(),
    payload,
  });
}

async function countIndependentSources(
  store: EvolutionStore,
  proposal: ImprovementProposal,
): Promise<number> {
  const evidence = await store.findEvidence({ agentId: proposal.agentId });
  const wanted = new Set(proposal.evidenceIds);
  const identities = new Set<string>();
  for (const item of evidence) {
    if (!wanted.has(item.id)) {
      continue;
    }
    const fromScope = item.scope.type === 'resource' ? item.scope.resourceId : undefined;
    const resourceId = item.provenance.resourceId ?? fromScope;
    identities.add(resourceId ?? item.id);
  }
  return identities.size;
}
