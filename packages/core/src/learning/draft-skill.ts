import { createTemplateSkillAuthor } from './skill-author';

import type { SkillDraft } from './skill-author';
import type { Lesson } from '../domain';

export type { SkillDraft } from './skill-author';
export { validateSkillName } from '../skill-name';

export interface DraftSkillOptions {
  evidenceSummaries?: string[];
}

export function draftSkillFromLesson(
  lesson: Lesson,
  options?: DraftSkillOptions,
): SkillDraft | undefined {
  return createTemplateSkillAuthor().authorFromLesson({
    lesson,
    evidenceSummaries: options?.evidenceSummaries,
  });
}

export function renderSkillMarkdown(input: {
  name: string;
  description: string;
  instructions: string;
  lessonIds?: string[];
  proposalId?: string;
}): string {
  const blocks = [
    ['---', `name: ${input.name}`, `description: ${input.description}`, '---'].join('\n'),
    input.instructions,
  ];
  if (input.lessonIds && input.lessonIds.length > 0) {
    blocks.push(`<!-- evolution-lesson-ids: ${input.lessonIds.join(',')} -->`);
  }
  if (input.proposalId) {
    blocks.push(`<!-- evolution-proposal-id: ${input.proposalId} -->`);
  }
  return `${blocks.join('\n\n')}\n`;
}
