export interface SqlExecutor {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  execute(sql: string, params?: readonly unknown[]): Promise<void>;
}

/**
 * Named PostgreSQL statements emitted by {@link PostgresEvolutionStore}.
 * `createMemorySqlExecutor` matches these exact strings.
 */
export const SQL = {
  createEvidenceTable: `CREATE TABLE IF NOT EXISTS evolution_evidence (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  source_identity TEXT,
  payload TEXT NOT NULL
)`,

  createEvidenceSourceIndex: `CREATE UNIQUE INDEX IF NOT EXISTS evolution_evidence_agent_source_idx
  ON evolution_evidence (agent_id, source_identity)
  WHERE source_identity IS NOT NULL`,

  createLessonsTable: `CREATE TABLE IF NOT EXISTS evolution_lessons (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL
)`,

  createProposalsTable: `CREATE TABLE IF NOT EXISTS evolution_proposals (
  id TEXT PRIMARY KEY,
  version INT NOT NULL,
  status TEXT NOT NULL,
  payload TEXT NOT NULL
)`,

  createEventsTable: `CREATE TABLE IF NOT EXISTS evolution_events (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  payload TEXT NOT NULL
)`,

  upsertEvidenceBySource: `INSERT INTO evolution_evidence (id, agent_id, source_identity, payload)
VALUES ($1, $2, $3, $4)
ON CONFLICT (agent_id, source_identity) WHERE source_identity IS NOT NULL
DO UPDATE SET id = EXCLUDED.id, payload = EXCLUDED.payload`,

  upsertEvidenceById: `INSERT INTO evolution_evidence (id, agent_id, source_identity, payload)
VALUES ($1, $2, $3, $4)
ON CONFLICT (id) DO UPDATE SET
  agent_id = EXCLUDED.agent_id,
  source_identity = EXCLUDED.source_identity,
  payload = EXCLUDED.payload`,

  selectEvidence: `SELECT payload FROM evolution_evidence`,

  upsertLesson: `INSERT INTO evolution_lessons (id, payload)
VALUES ($1, $2)
ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload`,

  selectLessonById: `SELECT payload FROM evolution_lessons WHERE id = $1`,

  selectLessons: `SELECT payload FROM evolution_lessons`,

  upsertProposal: `INSERT INTO evolution_proposals (id, version, status, payload)
VALUES ($1, $2, $3, $4)
ON CONFLICT (id) DO UPDATE SET
  version = EXCLUDED.version,
  status = EXCLUDED.status,
  payload = EXCLUDED.payload
WHERE evolution_proposals.version <= EXCLUDED.version
  AND NOT (
    evolution_proposals.status = 'published'
    AND EXCLUDED.status = 'published'
    AND evolution_proposals.version = EXCLUDED.version
  )
RETURNING id`,

  selectProposalById: `SELECT payload FROM evolution_proposals WHERE id = $1`,

  insertEvent: `INSERT INTO evolution_events (id, agent_id, payload)
VALUES ($1, $2, $3)`,

  selectEventsByAgent: `SELECT payload FROM evolution_events WHERE agent_id = $1`,
} as const;
