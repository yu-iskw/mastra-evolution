import { MAX_SKILL_NAME_LENGTH, slugSkillName } from '@mastra-evolution/core';

import type { Lesson, SuggestedAction } from '@mastra-evolution/core';

const SKILL_NAME_PATTERN = /^[a-z0-9-]+$/;

export interface SkillDraft {
  name: string;
  description: string;
  markdown: string;
  valid: boolean;
  errors: string[];
}

export function draftSkillFromLesson(lesson: Lesson): SkillDraft | undefined {
  if (!shouldDraftSkill(lesson)) {
    return undefined;
  }
  const name = slugSkillName(lesson.statement);
  const description = oneLine(lesson.statement);
  const errors = validateSkillName(name);
  const markdown = renderSkillMarkdown({
    name,
    description,
    instructions: lesson.statement,
    lessonIds: [lesson.id],
  });
  return {
    name,
    description,
    markdown,
    valid: errors.length === 0,
    errors,
  };
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

export function validateSkillName(name: string): string[] {
  const errors: string[] = [];
  if (name.length === 0) {
    errors.push('Skill name must not be empty.');
  }
  if (name.length > MAX_SKILL_NAME_LENGTH) {
    errors.push('Skill name must be at most 64 characters.');
  }
  if (/\s/.test(name)) {
    errors.push('Skill name must not contain spaces.');
  }
  if (/[A-Z]/.test(name)) {
    errors.push('Skill name must be lowercase.');
  }
  if (name.length > 0 && !SKILL_NAME_PATTERN.test(name)) {
    errors.push('Skill name must match [a-z0-9-]+.');
  }
  return errors;
}

function shouldDraftSkill(lesson: Lesson): boolean {
  if (lesson.status !== 'accepted') {
    return false;
  }
  if (lesson.kind === 'procedure') {
    return true;
  }
  return isSkillAction(lesson.suggestedAction);
}

function isSkillAction(action: SuggestedAction | undefined): boolean {
  return action === 'create-skill' || action === 'update-skill';
}

function oneLine(text: string): string {
  return text.split(/\r?\n/, 1)[0]?.trim() ?? '';
}
