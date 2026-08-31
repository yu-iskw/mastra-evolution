import { isPlainObject as isRecord, stringField } from '@mastra-evolution/core';
import { draftSkillFromLesson } from '@mastra-evolution/learning';

import type { EvolutionStore, Lesson } from '@mastra-evolution/core';
import type { ImprovementRuntime } from '@mastra-evolution/improvement';

/**
 * Propose and promote a skill from an accepted, draftable lesson.
 * Skips when a proposal for the same lesson already exists.
 */
export async function promoteAcceptedLesson(input: {
  lesson: Lesson;
  improvement: ImprovementRuntime;
  store: EvolutionStore;
}): Promise<void> {
  const { lesson, improvement, store } = input;
  const draft = draftSkillFromLesson(lesson);
  if (draft === undefined || !draft.valid) {
    return;
  }
  if (await alreadyProposed(store, lesson)) {
    return;
  }
  const proposal = await improvement.proposeFromLesson(lesson, {
    name: draft.name,
    description: draft.description,
    markdown: lesson.statement,
  });
  await improvement.promote(proposal.id);
}

async function alreadyProposed(store: EvolutionStore, lesson: Lesson): Promise<boolean> {
  const events = await store.findEvents(lesson.agentId);
  return events.some(
    (event) =>
      event.type === 'evolution.proposal.generate' &&
      isRecord(event.payload) &&
      stringField(event.payload, 'lessonId') === lesson.id,
  );
}
