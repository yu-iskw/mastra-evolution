import { VersionConflictError } from './errors';

import type { ImprovementProposal } from './proposal';

export function proposalUpsertConflicts(
  existing: { version: number; status: string } | undefined,
  next: { version: number; status: string },
): boolean {
  if (!existing) {
    return false;
  }
  if (existing.version > next.version) {
    return true;
  }
  return (
    existing.status === 'published' &&
    next.status === 'published' &&
    existing.version === next.version
  );
}

export function assertProposalWriteAllowed(
  existing: ImprovementProposal | undefined,
  next: ImprovementProposal,
): void {
  if (proposalUpsertConflicts(existing, next)) {
    throw new VersionConflictError();
  }
}
