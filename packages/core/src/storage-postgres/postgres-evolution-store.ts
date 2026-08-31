import { VersionConflictError, matchesEvidence, matchesLesson } from '../domain';

import {
  deserializeEvent,
  deserializeEvidence,
  deserializeLesson,
  deserializeProposal,
  serialize,
} from './serialize';
import { SQL } from './sql';

import type { SqlExecutor } from './sql';
import type {
  Evidence,
  EvidenceQuery,
  EvolutionEvent,
  EvolutionStore,
  ImprovementProposal,
  Lesson,
  LessonQuery,
} from '../domain';

interface PayloadRow {
  payload: string;
}

interface IdRow {
  id: string;
}

export class PostgresEvolutionStore implements EvolutionStore {
  private readonly sql: SqlExecutor;

  constructor(options: { sql: SqlExecutor }) {
    this.sql = options.sql;
  }

  /** CREATE TABLE IF NOT EXISTS for evidence, lessons, proposals, and events. */
  async initialize(): Promise<void> {
    await this.sql.execute(SQL.createEvidenceTable);
    await this.sql.execute(SQL.createEvidenceSourceIndex);
    await this.sql.execute(SQL.createLessonsTable);
    await this.sql.execute(SQL.createProposalsTable);
    await this.sql.execute(SQL.createEventsTable);
  }

  async putEvidence(evidence: Evidence): Promise<void> {
    const sourceIdentity = evidence.provenance.sourceIdentity;
    const params = [evidence.id, evidence.agentId, sourceIdentity ?? null, serialize(evidence)];
    if (sourceIdentity) {
      await this.sql.execute(SQL.upsertEvidenceBySource, params);
      return;
    }
    await this.sql.execute(SQL.upsertEvidenceById, params);
  }

  async findEvidence(query: EvidenceQuery): Promise<Evidence[]> {
    const rows = await this.sql.query<PayloadRow>(SQL.selectEvidence);
    return rows
      .map((row) => deserializeEvidence(row.payload))
      .filter((item) => matchesEvidence(item, query));
  }

  async putLesson(lesson: Lesson): Promise<void> {
    await this.sql.execute(SQL.upsertLesson, [lesson.id, serialize(lesson)]);
  }

  async getLesson(id: string): Promise<Lesson | undefined> {
    return this.readOne(SQL.selectLessonById, id, deserializeLesson);
  }

  async findLessons(query: LessonQuery): Promise<Lesson[]> {
    const rows = await this.sql.query<PayloadRow>(SQL.selectLessons);
    return rows
      .map((row) => deserializeLesson(row.payload))
      .filter((item) => matchesLesson(item, query));
  }

  async putProposal(proposal: ImprovementProposal): Promise<void> {
    const rows = await this.sql.query<IdRow>(SQL.upsertProposal, [
      proposal.id,
      proposal.version,
      proposal.status,
      serialize(proposal),
    ]);
    if (rows.length === 0) {
      throw new VersionConflictError();
    }
  }

  async getProposal(id: string): Promise<ImprovementProposal | undefined> {
    return this.readOne(SQL.selectProposalById, id, deserializeProposal);
  }

  async appendEvent(event: EvolutionEvent): Promise<void> {
    await this.sql.execute(SQL.insertEvent, [event.id, event.agentId, serialize(event)]);
  }

  async findEvents(agentId: string): Promise<EvolutionEvent[]> {
    const rows = await this.sql.query<PayloadRow>(SQL.selectEventsByAgent, [agentId]);
    return rows.map((row) => deserializeEvent(row.payload));
  }

  private async readOne<T>(
    statement: string,
    id: string,
    revive: (payload: string) => T,
  ): Promise<T | undefined> {
    const rows = await this.sql.query<PayloadRow>(statement, [id]);
    if (rows.length === 0) {
      return undefined;
    }
    return revive(rows[0].payload);
  }
}
