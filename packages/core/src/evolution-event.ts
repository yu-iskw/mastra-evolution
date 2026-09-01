export type EvolutionEventType =
  | 'evolution.ingest'
  | 'evolution.lesson.mine'
  | 'evolution.lesson.aggregate'
  | 'evolution.proposal.generate'
  | 'evolution.evaluate'
  | 'evolution.promote'
  | 'evolution.rollback'
  | 'evolution.error';

export interface EvolutionEvent {
  id: string;
  type: EvolutionEventType;
  agentId: string;
  at: Date;
  payload: Record<string, unknown>;
}

export interface EvolutionEventQuery {
  agentId?: string;
  type?: EvolutionEventType;
}
