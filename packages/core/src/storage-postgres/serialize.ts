import { isPlainObject, ownValue } from '../domain';

import type {
  Evidence,
  EvidenceKind,
  EvidenceProvenance,
  EvidenceSource,
  EvolutionEvent,
  EvolutionEventType,
  EvolutionScope,
  ImprovementProposal,
  Lesson,
  LessonKind,
  LessonStatus,
  LessonValidity,
  ProposalStatus,
  SuggestedAction,
} from '../domain';

export function serialize(value: unknown): string {
  return JSON.stringify(value);
}

export function deserializeEvidence(payload: string): Evidence {
  const record = parseObject(payload);
  return {
    id: requiredString(record, 'id'),
    agentId: requiredString(record, 'agentId'),
    scope: asScope(record.scope),
    source: requiredString(record, 'source') as EvidenceSource,
    kind: requiredString(record, 'kind') as EvidenceKind,
    summary: requiredString(record, 'summary'),
    provenance: asProvenance(record.provenance),
    observedAt: requiredDate(record, 'observedAt'),
  };
}

export function deserializeLesson(payload: string): Lesson {
  const record = parseObject(payload);
  const lesson: Lesson = {
    id: requiredString(record, 'id'),
    agentId: requiredString(record, 'agentId'),
    scope: asScope(record.scope),
    kind: requiredString(record, 'kind') as LessonKind,
    statement: requiredString(record, 'statement'),
    evidenceIds: requiredStringArray(record.evidenceIds),
    confidence: requiredNumber(record, 'confidence'),
    occurrenceCount: requiredNumber(record, 'occurrenceCount'),
    firstObservedAt: requiredDate(record, 'firstObservedAt'),
    lastObservedAt: requiredDate(record, 'lastObservedAt'),
    status: requiredString(record, 'status') as LessonStatus,
  };
  if (typeof record.suggestedAction === 'string') {
    lesson.suggestedAction = record.suggestedAction as SuggestedAction;
  }
  if (typeof record.supersedesLessonId === 'string') {
    lesson.supersedesLessonId = record.supersedesLessonId;
  }
  if (record.validity !== undefined) {
    lesson.validity = asValidity(record.validity);
  }
  return lesson;
}

export function deserializeProposal(payload: string): ImprovementProposal {
  const record = parseObject(payload);
  const proposal: ImprovementProposal = {
    id: requiredString(record, 'id'),
    agentId: requiredString(record, 'agentId'),
    scope: asScope(record.scope),
    reason: requiredString(record, 'reason'),
    lessonIds: requiredStringArray(record.lessonIds),
    evidenceIds: requiredStringArray(record.evidenceIds),
    target: record.target as ImprovementProposal['target'],
    candidateArtifact: record.candidateArtifact,
    status: requiredString(record, 'status') as ProposalStatus,
    version: requiredNumber(record, 'version'),
    createdAt: requiredDate(record, 'createdAt'),
    updatedAt: requiredDate(record, 'updatedAt'),
  };
  if (typeof record.baselineRevision === 'string') {
    proposal.baselineRevision = record.baselineRevision;
  }
  if (typeof record.candidateRevision === 'string') {
    proposal.candidateRevision = record.candidateRevision;
  }
  if (record.evaluation !== undefined) {
    proposal.evaluation = record.evaluation as ImprovementProposal['evaluation'];
  }
  return proposal;
}

export function deserializeEvent(payload: string): EvolutionEvent {
  const record = parseObject(payload);
  return {
    id: requiredString(record, 'id'),
    type: requiredString(record, 'type') as EvolutionEventType,
    agentId: requiredString(record, 'agentId'),
    at: requiredDate(record, 'at'),
    payload: asRecord(record.payload, 'payload'),
  };
}

function parseObject(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text) as unknown;
  return asRecord(value, 'payload');
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new TypeError(`Expected object ${label}`);
  }
  return value;
}

function asProvenance(value: unknown): EvidenceProvenance {
  const record = asRecord(value, 'provenance');
  const provenance: EvidenceProvenance = {};
  assignOptionalString(record, 'threadId', (next) => {
    provenance.threadId = next;
  });
  assignOptionalString(record, 'resourceId', (next) => {
    provenance.resourceId = next;
  });
  assignOptionalString(record, 'traceId', (next) => {
    provenance.traceId = next;
  });
  assignOptionalString(record, 'spanId', (next) => {
    provenance.spanId = next;
  });
  assignOptionalString(record, 'runId', (next) => {
    provenance.runId = next;
  });
  assignOptionalString(record, 'sourceIdentity', (next) => {
    provenance.sourceIdentity = next;
  });
  return provenance;
}

function assignOptionalString(
  record: Record<string, unknown>,
  key: string,
  assign: (value: string) => void,
): void {
  const value = ownValue(record, key);
  if (typeof value === 'string') {
    assign(value);
  }
}

function asScope(value: unknown): EvolutionScope {
  return asRecord(value, 'scope') as unknown as EvolutionScope;
}

function asValidity(value: unknown): LessonValidity {
  const record = asRecord(value, 'validity');
  const validity: LessonValidity = {};
  if (ownValue(record, 'validFrom') !== undefined) {
    validity.validFrom = requiredDate(record, 'validFrom');
  }
  if (ownValue(record, 'validUntil') !== undefined) {
    validity.validUntil = requiredDate(record, 'validUntil');
  }
  if (ownValue(record, 'revalidateAfter') !== undefined) {
    validity.revalidateAfter = requiredDate(record, 'revalidateAfter');
  }
  return validity;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = ownValue(record, key);
  if (typeof value !== 'string') {
    throw new TypeError(`Expected string ${key}`);
  }
  return value;
}

function requiredNumber(record: Record<string, unknown>, key: string): number {
  const value = ownValue(record, key);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`Expected number ${key}`);
  }
  return value;
}

function requiredDate(record: Record<string, unknown>, key: string): Date {
  return new Date(requiredString(record, key));
}

function requiredStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError('Expected string array');
  }
  const items: unknown[] = value;
  const strings = items.filter((item): item is string => typeof item === 'string');
  if (strings.length !== items.length) {
    throw new TypeError('Expected string array');
  }
  return strings;
}
