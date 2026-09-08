import { scopesEqual } from './scope';

import type { Evidence, EvidenceQuery } from './evidence';
import type { Lesson, LessonQuery } from './lesson';

export function matchesEvidence(item: Evidence, query: EvidenceQuery): boolean {
  if (query.agentId && item.agentId !== query.agentId) {
    return false;
  }
  if (query.kind && item.kind !== query.kind) {
    return false;
  }
  if (query.sourceIdentity && item.provenance.sourceIdentity !== query.sourceIdentity) {
    return false;
  }
  if (query.scope && !scopesEqual(item.scope, query.scope)) {
    return false;
  }
  return true;
}

export function matchesLesson(item: Lesson, query: LessonQuery): boolean {
  if (query.agentId && item.agentId !== query.agentId) {
    return false;
  }
  if (query.status && item.status !== query.status) {
    return false;
  }
  if (query.kind && item.kind !== query.kind) {
    return false;
  }
  if (query.statement && item.statement !== query.statement) {
    return false;
  }
  if (query.scope && !scopesEqual(item.scope, query.scope)) {
    return false;
  }
  return true;
}

export function evidenceSharesSourceIdentity(existing: Evidence, incoming: Evidence): boolean {
  const identity = incoming.provenance.sourceIdentity;
  return (
    identity !== undefined &&
    existing.provenance.sourceIdentity === identity &&
    existing.agentId === incoming.agentId
  );
}
