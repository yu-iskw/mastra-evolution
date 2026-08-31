import { LEARN_AUTONOMY, parseAutonomy } from '../domain';

import { hashLessonId, normalizeStatement } from './lesson-id';
import { lessonKindFromEvidence, toSuggestedAction } from './map-kind';
import { isNonLearnable } from './non-learnable';
import { parseLearningSignal } from './parse-learning-signal';

import type {
  AutonomyLevel,
  AutonomyName,
  Evidence,
  EvidenceProvenance,
  EvidenceSource,
  EvolutionEventType,
  EvolutionScope,
  EvolutionStore,
  EvolutionTelemetry,
  Lesson,
  LessonStatus,
  Redactor,
  SuggestedAction,
} from '../domain';

export const DEFAULT_ACCEPT_THRESHOLD = 3;

const EVENT_INGEST: EvolutionEventType = 'evolution.ingest';
const EVENT_AGGREGATE: EvolutionEventType = 'evolution.lesson.aggregate';
const EVENT_ERROR: EvolutionEventType = 'evolution.error';

export interface IngestOptions {
  store: EvolutionStore;
  acceptThreshold?: number;
  sync?: boolean;
  redactor?: Redactor;
  telemetry?: EvolutionTelemetry;
  now?: () => Date;
  id?: () => string;
}

interface IngestRuntimeOptions extends IngestOptions {
  autonomy?: AutonomyLevel | AutonomyName;
  contradictsStatement?: string;
  suggestedAction?: SuggestedAction;
}

export interface IngestResult {
  stored: boolean;
  duplicate: boolean;
  lesson?: Lesson;
}

export interface SignalContext {
  agentId: string;
  scope: EvolutionScope;
  source?: EvidenceSource;
  provenance?: EvidenceProvenance;
}

export async function ingestEvidence(
  evidence: Evidence,
  options: IngestOptions,
): Promise<IngestResult | undefined> {
  return ingestWithOptions(evidence, options);
}

export async function ingestSignal(
  input: unknown,
  context: SignalContext,
  options: IngestOptions,
): Promise<IngestResult | undefined> {
  const signal = parseLearningSignal(input);
  if (!signal) {
    return undefined;
  }
  const now = resolveNow(options);
  const evidence: Evidence = {
    id: resolveId(options),
    agentId: context.agentId,
    scope: context.scope,
    source: context.source ?? 'interaction',
    kind: signal.kind,
    summary: signal.summary,
    provenance: context.provenance ?? {},
    observedAt: now,
  };
  return ingestWithOptions(evidence, {
    ...options,
    contradictsStatement: signal.contradictsStatement,
    suggestedAction: toSuggestedAction(signal.suggestedAction),
  });
}

async function ingestWithOptions(
  evidence: Evidence,
  options: IngestRuntimeOptions,
): Promise<IngestResult | undefined> {
  const run = (): Promise<IngestResult> => ingestOnce(evidence, options);
  const telemetry = options.telemetry;
  const traced = telemetry ? (): Promise<IngestResult> => telemetry.span(EVENT_INGEST, run) : run;

  if (options.sync === true) {
    return traced();
  }
  try {
    return await traced();
  } catch (error: unknown) {
    await recordIngestFailure(evidence, options, error);
    return undefined;
  }
}

async function ingestOnce(
  evidence: Evidence,
  options: IngestRuntimeOptions,
): Promise<IngestResult> {
  if (await isDuplicate(evidence, options.store)) {
    const duplicate: IngestResult = { stored: false, duplicate: true };
    recordIngestTelemetry(options, duplicate);
    return duplicate;
  }

  const persisted = await persistEvidence(evidence, options);
  await appendTypedEvent(options, EVENT_INGEST, persisted.agentId, {
    evidenceId: persisted.id,
  });

  if (parseAutonomy(options.autonomy ?? LEARN_AUTONOMY) === 0) {
    const observed: IngestResult = { stored: true, duplicate: false };
    recordIngestTelemetry(options, observed);
    return observed;
  }

  const lesson = await aggregateLesson(persisted, options);
  const result: IngestResult = { stored: true, duplicate: false, lesson };
  recordIngestTelemetry(options, result);
  return result;
}

async function isDuplicate(evidence: Evidence, store: EvolutionStore): Promise<boolean> {
  const sourceIdentity = evidence.provenance.sourceIdentity;
  if (!sourceIdentity) {
    return false;
  }
  const existing = await store.findEvidence({
    agentId: evidence.agentId,
    sourceIdentity,
  });
  return existing.length > 0;
}

async function persistEvidence(
  evidence: Evidence,
  options: IngestRuntimeOptions,
): Promise<Evidence> {
  const summary = options.redactor ? options.redactor.redact(evidence.summary) : evidence.summary;
  const persisted: Evidence = summary === evidence.summary ? evidence : { ...evidence, summary };
  await options.store.putEvidence(persisted);
  return persisted;
}

async function aggregateLesson(evidence: Evidence, options: IngestRuntimeOptions): Promise<Lesson> {
  const threshold = options.acceptThreshold ?? DEFAULT_ACCEPT_THRESHOLD;
  const previous = await options.store.getLesson(
    hashLessonId(evidence.agentId, evidence.scope, evidence.summary),
  );
  const supersededLessonId = await supersedeContradicted(evidence, options);
  const lesson = mergeLesson(previous, evidence, {
    nonLearnable: isNonLearnable(evidence),
    suggestedAction: options.suggestedAction,
    supersededLessonId,
    threshold,
  });
  await options.store.putLesson(lesson);
  await appendTypedEvent(options, EVENT_AGGREGATE, evidence.agentId, {
    lessonId: lesson.id,
    occurrenceCount: lesson.occurrenceCount,
    status: lesson.status,
  });
  return lesson;
}

async function supersedeContradicted(
  evidence: Evidence,
  options: IngestRuntimeOptions,
): Promise<string | undefined> {
  const target = options.contradictsStatement;
  if (!target) {
    return undefined;
  }
  const matches = await options.store.findLessons({
    agentId: evidence.agentId,
    scope: evidence.scope,
  });
  const normalized = normalizeStatement(target);
  const old = matches.find(
    (lesson) =>
      normalizeStatement(lesson.statement) === normalized && isActiveLesson(lesson.status),
  );
  if (!old || old.id === hashLessonId(evidence.agentId, evidence.scope, evidence.summary)) {
    return undefined;
  }
  await options.store.putLesson({ ...old, status: 'superseded' });
  return old.id;
}

function mergeLesson(
  previous: Lesson | undefined,
  evidence: Evidence,
  input: {
    nonLearnable: boolean;
    suggestedAction: SuggestedAction | undefined;
    supersededLessonId: string | undefined;
    threshold: number;
  },
): Lesson {
  const evidenceIds = uniqueIds([...(previous?.evidenceIds ?? []), evidence.id]);
  const occurrenceCount = (previous?.occurrenceCount ?? 0) + 1;
  const threshold = Math.max(1, input.threshold);
  const status = nextLessonStatus({
    nonLearnable: input.nonLearnable,
    occurrenceCount,
    previousStatus: previous?.status,
    threshold,
  });
  const lesson: Lesson = {
    id: hashLessonId(evidence.agentId, evidence.scope, evidence.summary),
    agentId: evidence.agentId,
    scope: evidence.scope,
    kind: previous?.kind ?? lessonKindFromEvidence(evidence.kind),
    statement: previous?.statement ?? evidence.summary,
    evidenceIds,
    confidence: Math.min(1, occurrenceCount / threshold),
    occurrenceCount,
    firstObservedAt: previous?.firstObservedAt ?? evidence.observedAt,
    lastObservedAt: evidence.observedAt,
    status,
  };
  const suggestedAction = input.suggestedAction ?? previous?.suggestedAction;
  if (suggestedAction) {
    lesson.suggestedAction = suggestedAction;
  }
  const supersedesLessonId = input.supersededLessonId ?? previous?.supersedesLessonId;
  if (supersedesLessonId) {
    lesson.supersedesLessonId = supersedesLessonId;
  }
  if (previous?.validity) {
    lesson.validity = previous.validity;
  }
  return lesson;
}

function nextLessonStatus(input: {
  nonLearnable: boolean;
  occurrenceCount: number;
  previousStatus: LessonStatus | undefined;
  threshold: number;
}): LessonStatus {
  if (input.nonLearnable) {
    return 'rejected';
  }
  if (input.previousStatus === 'superseded') {
    return 'superseded';
  }
  return input.occurrenceCount >= input.threshold ? 'accepted' : 'candidate';
}

function isActiveLesson(status: LessonStatus): boolean {
  return status === 'candidate' || status === 'accepted';
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function recordIngestTelemetry(options: IngestRuntimeOptions, result: IngestResult): void {
  options.telemetry?.record(EVENT_INGEST, {
    stored: result.stored,
    duplicate: result.duplicate,
  });
}

async function recordIngestFailure(
  evidence: Evidence,
  options: IngestRuntimeOptions,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  options.telemetry?.record(EVENT_ERROR, { message });
  try {
    await appendTypedEvent(options, EVENT_ERROR, evidence.agentId, {
      evidenceId: evidence.id,
      message,
    });
  } catch {
    return;
  }
}

async function appendTypedEvent(
  options: IngestRuntimeOptions,
  type: EvolutionEventType,
  agentId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await options.store.appendEvent({
    id: resolveId(options),
    type,
    agentId,
    at: resolveNow(options),
    payload,
  });
}

function resolveNow(options: IngestOptions): Date {
  return (options.now ?? defaultNow)();
}

function resolveId(options: IngestOptions): string {
  return (options.id ?? defaultId)();
}

function defaultId(): string {
  return `id-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function defaultNow(): Date {
  return new Date();
}
