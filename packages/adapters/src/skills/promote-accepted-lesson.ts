import { isPlainObject as isRecord, stringField } from '@mastra-evolution/core';
import { draftSkillFromLesson, loadEvidenceSummaries } from '@mastra-evolution/core/learning';

import type { EvolutionStore, ImprovementProposal, Lesson } from '@mastra-evolution/core';
import type { ImprovementRuntime } from '@mastra-evolution/core/improvement';

const publishedLessonIds = new WeakMap<EvolutionStore, Set<string>>();

const SETTLED_STATUSES = new Set(['published', 'rejected', 'awaiting-approval', 'rolled-back']);

/**
 * Propose and promote a skill from an accepted, draftable lesson.
 * Retries `promote` when a draft proposal already exists; skips settled proposals.
 */
export async function promoteAcceptedLesson(input: {
  lesson: Lesson;
  improvement: ImprovementRuntime;
  store: EvolutionStore;
}): Promise<void> {
  const { lesson, improvement, store } = input;
  const evidenceSummaries = await loadEvidenceSummaries(store, lesson);
  const draft = draftSkillFromLesson(lesson, { evidenceSummaries });
  if (draft === undefined || !draft.valid) {
    return;
  }
  if (remembered(store, lesson.id)) {
    return;
  }
  const existing = await proposalForLesson(store, lesson);
  if (existing !== undefined && SETTLED_STATUSES.has(existing.status)) {
    rememberPublished(store, lesson.id);
    return;
  }
  const proposalId =
    existing === undefined
      ? (
          await improvement.proposeFromLesson(lesson, {
            name: draft.name,
            description: draft.description,
            markdown: draft.markdown,
          })
        ).id
      : existing.id;
  await improvement.promote(proposalId);
  rememberPublished(store, lesson.id);
}

async function proposalForLesson(
  store: EvolutionStore,
  lesson: Lesson,
): Promise<ImprovementProposal | undefined> {
  const events = await store.findEvents(lesson.agentId);
  for (const event of events) {
    if (event.type !== 'evolution.proposal.generate' || !isRecord(event.payload)) {
      continue;
    }
    if (stringField(event.payload, 'lessonId') !== lesson.id) {
      continue;
    }
    const proposalId = stringField(event.payload, 'proposalId');
    if (proposalId === undefined) {
      continue;
    }
    return store.getProposal(proposalId);
  }
  return undefined;
}

function remembered(store: EvolutionStore, lessonId: string): boolean {
  return publishedLessonIds.get(store)?.has(lessonId) === true;
}

function rememberPublished(store: EvolutionStore, lessonId: string): void {
  const ids = publishedLessonIds.get(store);
  if (ids === undefined) {
    publishedLessonIds.set(store, new Set([lessonId]));
    return;
  }
  ids.add(lessonId);
}
