import type { AutonomyLevel } from './autonomy';
import type { Evidence, EvidenceQuery } from './evidence';
import type { EvolutionEvent } from './evolution-event';
import type { Lesson, LessonQuery } from './lesson';
import type {
  ApprovedImprovementProposal,
  EvaluationContext,
  ImprovementEvaluation,
  ImprovementProposal,
  PublishedRevision,
} from './proposal';

export interface EvolutionStore {
  putEvidence(evidence: Evidence): Promise<void>;
  findEvidence(query: EvidenceQuery): Promise<Evidence[]>;
  putLesson(lesson: Lesson): Promise<void>;
  getLesson(id: string): Promise<Lesson | undefined>;
  findLessons(query: LessonQuery): Promise<Lesson[]>;
  putProposal(proposal: ImprovementProposal): Promise<void>;
  getProposal(id: string): Promise<ImprovementProposal | undefined>;
  appendEvent(event: EvolutionEvent): Promise<void>;
  findEvents?(agentId: string): Promise<EvolutionEvent[]>;
}

export interface ImprovementEvaluator {
  evaluate(
    proposal: ImprovementProposal,
    context: EvaluationContext,
  ): Promise<ImprovementEvaluation>;
}

export interface EvolutionPublisher {
  writeDraft?(proposal: ImprovementProposal): Promise<{ path: string }>;
  publish(proposal: ApprovedImprovementProposal): Promise<PublishedRevision>;
  rollback?(proposal: ImprovementProposal): Promise<PublishedRevision>;
}

export type ApprovalDecision =
  | { decision: 'approved' }
  | { decision: 'rejected'; reason: string };

export interface ApprovalProvider {
  requestApproval(proposal: ImprovementProposal): Promise<ApprovalDecision>;
}

export interface Redactor {
  redact(text: string): string;
}

export interface PromotionContext {
  autonomy: AutonomyLevel;
  independentSourceCount?: number;
}

export type PromotionDecision =
  | { decision: 'publish' }
  | { decision: 'request-approval'; reason: string }
  | { decision: 'reject'; reason: string };

export interface PromotionPolicy {
  decide(
    proposal: ImprovementProposal,
    evaluation: ImprovementEvaluation,
    context: PromotionContext,
  ): Promise<PromotionDecision>;
}

export interface ScopePromotionPolicy {
  canPromoteToOrganization(input: {
    agentId: string;
    independentSourceCount: number;
  }): boolean;
}

export interface EvolutionTelemetry {
  span<T>(name: string, run: () => Promise<T>): Promise<T>;
  record(name: string, attributes?: Record<string, string | number | boolean>): void;
}
