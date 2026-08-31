import { randomUUID } from 'node:crypto';

import { isRecord, stringField } from './is-record';

import type { LearningLike, MastraExtractorFragment } from './types';
import type { Evidence, EvidenceKind, EvolutionScope } from '@mastra-evolution/core';

const EVIDENCE_KINDS: readonly EvidenceKind[] = [
  'correction',
  'success',
  'failure',
  'preference',
  'fact',
  'procedure',
  'missing-capability',
  'policy-signal',
];

const SOURCE_MEMORY_EXTRACTOR = 'memory-extractor';
const SOURCE_TOOL_RESULT = 'tool-result';

interface ResolvedLearning {
  enabled: boolean;
  runtime?: {
    ingest?: LearningLike['ingest'];
    ingestSignal?: LearningLike['ingestSignal'];
  };
}

export function resolveLearning(
  learning: LearningLike | { enabled: boolean } | undefined,
): ResolvedLearning {
  if (learning === undefined) {
    return { enabled: false };
  }
  if (isLearningRuntime(learning)) {
    return { enabled: true, runtime: learning };
  }
  return { enabled: learning.enabled };
}

export function resolveAgentId(agent: unknown): string {
  if (!isRecord(agent)) {
    return 'unknown-agent';
  }
  return (
    stringField(agent, 'id') ??
    stringField(agent, 'agentId') ??
    stringField(agent, 'name') ??
    'unknown-agent'
  );
}

export function createLearningExtractors(
  learning: ResolvedLearning,
  agentId: string,
  scope: EvolutionScope,
): MastraExtractorFragment[] {
  if (!learning.enabled) {
    return [];
  }
  return [
    {
      onExtracted: async (payload: unknown, ctx?: unknown) => {
        await invokeSafely(() => ingestExtracted(learning, payload, ctx, agentId, scope));
      },
    },
  ];
}

export function createAfterToolCall(
  learning: ResolvedLearning,
  agentId: string,
): (context: unknown) => Promise<void> {
  return async (context: unknown) => {
    if (!learning.enabled) {
      return;
    }
    await invokeSafely(() => ingestToolResult(learning, context, agentId));
  };
}

async function ingestExtracted(
  learning: ResolvedLearning,
  payload: unknown,
  ctx: unknown,
  agentId: string,
  scope: EvolutionScope,
): Promise<void> {
  const runtime = learning.runtime;
  if (!runtime) {
    return;
  }
  const provenance = provenanceFrom(ctx, payload);
  if (runtime.ingestSignal) {
    await runtime.ingestSignal(payload, {
      agentId,
      scope,
      source: SOURCE_MEMORY_EXTRACTOR,
      provenance,
    });
    return;
  }
  if (runtime.ingest) {
    await runtime.ingest(toEvidence(payload, ctx, agentId, SOURCE_MEMORY_EXTRACTOR, scope));
  }
}

async function ingestToolResult(
  learning: ResolvedLearning,
  context: unknown,
  agentId: string,
): Promise<void> {
  const runtime = learning.runtime;
  if (!runtime?.ingest) {
    return;
  }
  await runtime.ingest(toolResultToEvidence(context, agentId));
}

function toEvidence(
  payload: unknown,
  ctx: unknown,
  agentId: string,
  source: Evidence['source'],
  scope: EvolutionScope,
): Evidence {
  const record = isRecord(payload) ? payload : {};
  const summary =
    stringField(record, 'summary') ??
    (typeof payload === 'string' ? payload : JSON.stringify(payload ?? {}));
  return {
    id: randomUUID(),
    agentId,
    scope,
    source,
    kind: asKind(record.kind),
    summary,
    provenance: provenanceFrom(ctx, payload),
    observedAt: new Date(),
  };
}

function toolResultToEvidence(context: unknown, fallbackAgentId: string): Evidence {
  const record = isRecord(context) ? context : {};
  const nested = nestedRecord(record);
  const agentId = stringField(record, 'agentId') ?? fallbackAgentId;
  const failed = isToolFailure(record);
  const summary = toolSummary(record, failed);
  const scope = scopeFromContext(record, nested, agentId);
  return {
    id: randomUUID(),
    agentId,
    scope,
    source: SOURCE_TOOL_RESULT,
    kind: failed ? 'failure' : 'success',
    summary,
    provenance: provenanceFrom(context, undefined),
    observedAt: new Date(),
  };
}

function isToolFailure(record: Record<string, unknown>): boolean {
  if (record.error !== undefined && record.error !== null && record.error !== false) {
    return true;
  }
  if (record.success === false || record.ok === false || record.status === 'error') {
    return true;
  }
  const result = record.result;
  if (isRecord(result) && (result.success === false || result.ok === false)) {
    return true;
  }
  return false;
}

function toolSummary(record: Record<string, unknown>, failed: boolean): string {
  const toolName = stringField(record, 'toolName') ?? 'tool';
  if (failed) {
    const error = record.error;
    if (error instanceof Error) {
      return `${toolName} failed: ${error.message}`;
    }
    if (typeof error === 'string' && error.length > 0) {
      return `${toolName} failed: ${error}`;
    }
    return `${toolName} failed`;
  }
  return stringField(record, 'summary') ?? `${toolName} succeeded`;
}

function scopeFromContext(
  record: Record<string, unknown>,
  nested: Record<string, unknown>,
  agentId: string,
): EvolutionScope {
  const threadId = stringField(record, 'threadId') ?? stringField(nested, 'threadId');
  if (threadId) {
    return { type: 'thread', threadId };
  }
  const resourceId = stringField(record, 'resourceId') ?? stringField(nested, 'resourceId');
  if (resourceId) {
    return { type: 'resource', resourceId };
  }
  return { type: 'agent', agentId };
}

function provenanceFrom(ctx: unknown, payload: unknown): Evidence['provenance'] {
  const record = { ...asRecord(payload), ...asRecord(ctx), ...nestedRecord(asRecord(ctx)) };
  return {
    threadId: stringField(record, 'threadId'),
    resourceId: stringField(record, 'resourceId'),
    traceId: stringField(record, 'traceId'),
    spanId: stringField(record, 'spanId'),
    runId: stringField(record, 'runId'),
    sourceIdentity: stringField(record, 'sourceIdentity') ?? stringField(record, 'toolCallId'),
  };
}

function asKind(value: unknown): EvidenceKind {
  if (typeof value === 'string' && (EVIDENCE_KINDS as readonly string[]).includes(value)) {
    return value as EvidenceKind;
  }
  return 'fact';
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function nestedRecord(record: Record<string, unknown>): Record<string, unknown> {
  const memory = record.memory;
  if (isRecord(memory)) {
    return memory;
  }
  const agent = record.agent;
  if (isRecord(agent)) {
    return agent;
  }
  return {};
}

function isLearningRuntime(
  value: unknown,
): value is { ingest?: LearningLike['ingest']; ingestSignal?: LearningLike['ingestSignal'] } {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.ingest === 'function' || typeof value.ingestSignal === 'function';
}

async function invokeSafely(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error: unknown) {
    void error;
  }
}
