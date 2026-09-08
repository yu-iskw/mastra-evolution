import { proposalUpsertConflicts } from '../domain';

import { SQL } from './sql';

import type { SqlExecutor } from './sql';

interface EvidenceRow {
  id: string;
  agent_id: string;
  source_identity: string | null;
  payload: string;
}

interface PayloadRow {
  id: string;
  payload: string;
}

interface ProposalRow extends PayloadRow {
  version: number;
  status: string;
}

interface EventRow extends PayloadRow {
  agent_id: string;
}

type Handler = (params: readonly unknown[]) => Record<string, unknown>[];

/**
 * In-process executor used by unit tests (unique keys + version column).
 * Tables are implicit; CREATE TABLE / CREATE INDEX are no-ops.
 */
export function createMemorySqlExecutor(): SqlExecutor {
  return new MemorySqlExecutor();
}

class MemorySqlExecutor implements SqlExecutor {
  private readonly evidence = new Map<string, EvidenceRow>();
  private readonly lessons = new Map<string, PayloadRow>();
  private readonly proposals = new Map<string, ProposalRow>();
  private readonly events: EventRow[] = [];
  private readonly handlers: ReadonlyMap<string, Handler>;
  private tail: Promise<unknown> = Promise.resolve();

  constructor() {
    this.handlers = new Map<string, Handler>([
      [SQL.createEvidenceTable, emptyResult],
      [SQL.createEvidenceSourceIndex, emptyResult],
      [SQL.createLessonsTable, emptyResult],
      [SQL.createProposalsTable, emptyResult],
      [SQL.createEventsTable, emptyResult],
      [SQL.upsertEvidenceBySource, (params) => this.upsertEvidenceBySource(params)],
      [SQL.upsertEvidenceById, (params) => this.upsertEvidenceById(params)],
      [SQL.selectEvidence, () => this.selectEvidence()],
      [SQL.upsertLesson, (params) => this.upsertLesson(params)],
      [SQL.selectLessonById, (params) => this.selectById(this.lessons, params)],
      [SQL.selectLessons, () => this.selectAll(this.lessons)],
      [SQL.upsertProposal, (params) => this.upsertProposal(params)],
      [SQL.selectProposalById, (params) => this.selectById(this.proposals, params)],
      [SQL.insertEvent, (params) => this.insertEvent(params)],
      [SQL.selectEventsByAgent, (params) => this.selectEventsByAgent(params)],
    ]);
  }

  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T[]> {
    return this.enqueue(() => this.run(sql, params) as T[]);
  }

  execute(sql: string, params?: readonly unknown[]): Promise<void> {
    return this.enqueue(() => {
      this.run(sql, params);
    });
  }

  private enqueue<T>(work: () => T): Promise<T> {
    const next = this.tail.then(work);
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private run(sql: string, params?: readonly unknown[]): Record<string, unknown>[] {
    const handler = this.handlers.get(sql);
    if (!handler) {
      throw new Error(`Unsupported SQL for memory executor: ${sql}`);
    }
    return handler(params ?? []);
  }

  private upsertEvidenceBySource(params: readonly unknown[]): Record<string, unknown>[] {
    const id = asString(params[0]);
    const agentId = asString(params[1]);
    const sourceIdentity = asString(params[2]);
    const payload = asString(params[3]);
    for (const [existingId, row] of [...this.evidence.entries()]) {
      if (row.agent_id === agentId && row.source_identity === sourceIdentity) {
        this.evidence.delete(existingId);
      }
    }
    this.evidence.set(id, { id, agent_id: agentId, source_identity: sourceIdentity, payload });
    return [];
  }

  private upsertEvidenceById(params: readonly unknown[]): Record<string, unknown>[] {
    const id = asString(params[0]);
    const agentId = asString(params[1]);
    const sourceIdentity = asNullableString(params[2]);
    const payload = asString(params[3]);
    this.evidence.set(id, { id, agent_id: agentId, source_identity: sourceIdentity, payload });
    return [];
  }

  private selectEvidence(): Record<string, unknown>[] {
    return [...this.evidence.values()].map((row) => ({ payload: row.payload }));
  }

  private upsertLesson(params: readonly unknown[]): Record<string, unknown>[] {
    const id = asString(params[0]);
    const payload = asString(params[1]);
    this.lessons.set(id, { id, payload });
    return [];
  }

  private selectById(
    table: ReadonlyMap<string, PayloadRow>,
    params: readonly unknown[],
  ): Record<string, unknown>[] {
    const row = table.get(asString(params[0]));
    return row ? [{ payload: row.payload }] : [];
  }

  private selectAll(table: ReadonlyMap<string, PayloadRow>): Record<string, unknown>[] {
    return [...table.values()].map((row) => ({ payload: row.payload }));
  }

  private upsertProposal(params: readonly unknown[]): Record<string, unknown>[] {
    const id = asString(params[0]);
    const version = asNumber(params[1]);
    const status = asString(params[2]);
    const payload = asString(params[3]);
    const existing = this.proposals.get(id);
    if (proposalUpsertConflicts(existing, { version, status })) {
      return [];
    }
    this.proposals.set(id, { id, version, status, payload });
    return [{ id }];
  }

  private insertEvent(params: readonly unknown[]): Record<string, unknown>[] {
    const id = asString(params[0]);
    const agentId = asString(params[1]);
    const payload = asString(params[2]);
    this.events.push({ id, agent_id: agentId, payload });
    return [];
  }

  private selectEventsByAgent(params: readonly unknown[]): Record<string, unknown>[] {
    const agentId = asString(params[0]);
    return this.events
      .filter((row) => row.agent_id === agentId)
      .map((row) => ({ payload: row.payload }));
  }
}

function emptyResult(): Record<string, unknown>[] {
  return [];
}

function asString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('Expected string SQL parameter');
  }
  return value;
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return asString(value);
}

function asNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('Expected number SQL parameter');
  }
  return value;
}
