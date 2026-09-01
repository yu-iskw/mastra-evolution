import { MAX_SKILL_DESCRIPTION_LENGTH, slugSkillName } from '../skill-name';

import { validatePracticalSkillArtifact } from './skill-quality';

import type { EvolutionStore, Lesson, LessonKind, SuggestedAction } from '../domain';

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'be',
  'by',
  'do',
  'for',
  'from',
  'in',
  'is',
  'not',
  'of',
  'on',
  'or',
  'the',
  'this',
  'to',
  'use',
  'when',
  'with',
]);

export interface SkillDraft {
  name: string;
  description: string;
  markdown: string;
  valid: boolean;
  errors: string[];
}

export interface SkillAuthorInput {
  lesson: Lesson;
  evidenceSummaries?: string[];
}

export interface SkillAuthor {
  authorFromLesson(input: SkillAuthorInput): SkillDraft | undefined;
}

export function createTemplateSkillAuthor(): SkillAuthor {
  return {
    authorFromLesson(input: SkillAuthorInput): SkillDraft | undefined {
      if (!shouldDraftSkill(input.lesson)) {
        return undefined;
      }
      return authorSkillDraft(input);
    },
  };
}

export function authorSkillDraft(input: SkillAuthorInput): SkillDraft {
  const { lesson } = input;
  const summaries = input.evidenceSummaries ?? [];
  const name = slugSkillName(lesson.statement);
  const description = buildDescription(lesson, summaries);
  const markdown = buildBody(lesson, summaries);
  const errors = validatePracticalSkillArtifact({ name, description, markdown });
  return { name, description, markdown, valid: errors.length === 0, errors };
}

export async function loadEvidenceSummaries(
  store: Pick<EvolutionStore, 'findEvidence'>,
  lesson: Lesson,
): Promise<string[]> {
  if (lesson.evidenceIds.length === 0) {
    return [];
  }
  const evidence = await store.findEvidence({ agentId: lesson.agentId });
  const wanted = new Set(lesson.evidenceIds);
  return evidence.filter((item) => wanted.has(item.id)).map((item) => item.summary);
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

function buildDescription(lesson: Lesson, summaries: string[]): string {
  const what = punctuate(oneLine(lesson.statement));
  const when = formatUseWhen(collectTriggers(lesson, summaries));
  return `${what} ${when}`.slice(0, MAX_SKILL_DESCRIPTION_LENGTH);
}

function buildBody(lesson: Lesson, summaries: string[]): string {
  const title = headingTitle(lesson.statement);
  const triggers = collectTriggers(lesson, summaries);
  const files = unique(summaries.flatMap(extractFilenames));
  const tools = unique(summaries.flatMap(extractToolNames));
  const sections = [
    `# ${title}`,
    '',
    '## When to Use',
    ...triggerBullets(triggers),
    '',
    '## Instructions',
    ...instructionSteps(lesson, files),
    '',
    '## Working Memory',
    ...workingMemoryBullets(lesson, files),
    '',
    '## Do Not',
    ...doNotBullets(lesson),
  ];
  if (files.length > 0 || tools.length > 0) {
    sections.push('', '## Workspace and Tools', ...workspaceBullets(files, tools));
  }
  sections.push('', `<!-- evolution-lesson-ids: ${lesson.id} -->`, '');
  return sections.join('\n');
}

function collectTriggers(lesson: Lesson, summaries: string[]): string[] {
  const triggers: string[] = [];
  const keywords = extractKeywords(lesson.statement);
  if (keywords.includes('revenue')) {
    triggers.push('reporting revenue');
  }
  if (keywords.includes('cancellations') || keywords.includes('cancellation')) {
    triggers.push('handling cancellations');
  }
  const spoken = spokenPhrase(lesson.statement);
  if (spoken.length > 0) {
    triggers.push(`the user says ${spoken}`);
  }
  for (const filename of unique(summaries.flatMap(extractFilenames))) {
    triggers.push(`reading ${filename}`);
  }
  for (const tool of unique(summaries.flatMap(extractToolNames))) {
    triggers.push(`using ${tool}`);
  }
  if (triggers.length < 2) {
    triggers.push(kindTrigger(lesson.kind));
  }
  if (isSkillAction(lesson.suggestedAction) && triggers.length < 3) {
    triggers.push('the user asks for this workflow');
  }
  return unique(triggers).slice(0, 4);
}

function triggerBullets(triggers: string[]): string[] {
  if (triggers.length === 0) {
    return ['- This procedure applies'];
  }
  return triggers.map((trigger) => `- ${capitalize(trigger)}`);
}

function instructionSteps(lesson: Lesson, files: string[]): string[] {
  const procedure = punctuate(oneLine(lesson.statement));
  const fileHint = files.length > 0 ? ` (e.g. ${files.slice(0, 3).join(', ')})` : '';
  return [
    `1. ${procedure}`,
    `2. When facts or numbers are needed, read them from workspace files${fileHint} instead of guessing.`,
    '3. State the relevant definition in one sentence before quoting figures or giving the answer.',
  ];
}

function workingMemoryBullets(lesson: Lesson, files: string[]): string[] {
  const bullets = [`- Active procedure: ${punctuate(oneLine(lesson.statement))}`];
  if (files.length > 0) {
    bullets.push(`- Source files in play: ${files.slice(0, 3).join(', ')}.`);
  } else {
    bullets.push('- Source files in play: workspace files used for this procedure.');
  }
  if (isMetricShaped(lesson.statement)) {
    bullets.push('- Last quoted figure and period when a number is reported.');
  }
  bullets.push(
    '- Project facts into these slots (or the app working-memory schema). Do not store tool transcripts.',
  );
  return bullets;
}

function isMetricShaped(statement: string): boolean {
  return /\b(revenue|metric|figure|amount|total|count|rate|percent)\b/i.test(statement);
}

function doNotBullets(lesson: Lesson): string[] {
  const bullets = [
    '- Do not skip this procedure when the When to Use conditions apply.',
    '- Do not invent numbers or files that are not present in the workspace.',
  ];
  const excludedTerm = omittedTermFrom(lesson.statement);
  if (excludedTerm !== undefined) {
    bullets.push(`- Do not treat ${excludedTerm} as part of the primary result.`);
  }
  return bullets;
}

function omittedTermFrom(statement: string): string | undefined {
  const match = statement.match(/excluding\s+([a-z][a-z\s-]*[a-z])/i);
  const term = match?.[1]?.trim();
  return term === undefined || term.length === 0 ? undefined : term;
}

function workspaceBullets(files: string[], tools: string[]): string[] {
  const bullets = [
    '- Prefer skill tools after search/load; use workspace read tools for listed files.',
  ];
  for (const tool of tools) {
    bullets.push(`- Tool: ${tool}`);
  }
  for (const filename of files) {
    bullets.push(`- File: ${filename}`);
  }
  return bullets;
}

function formatUseWhen(triggers: string[]): string {
  if (triggers.length === 0) {
    return 'Use when this lesson applies.';
  }
  if (triggers.length === 1) {
    return `Use when ${triggers[0]}.`;
  }
  const last = triggers.at(-1) ?? '';
  const head = triggers.slice(0, -1).map((item, index) => (index === 0 ? item : `when ${item}`));
  return `Use when ${head.join(', ')}, or when ${last}.`;
}

function kindTrigger(kind: LessonKind): string {
  switch (kind) {
    case 'procedure':
      return 'following this procedure';
    case 'correction':
      return 'correcting a similar mistake';
    case 'preference':
      return 'honoring this preference';
    case 'fact':
      return 'this fact is needed';
    case 'failure-pattern':
      return 'avoiding this failure';
    case 'success-pattern':
      return 'repeating this successful approach';
    case 'missing-capability':
      return 'this capability is requested';
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

function extractFilenames(text: string): string[] {
  const names: string[] = [];
  for (const token of text.split(/\s+/)) {
    const cleaned = token.replace(/[^A-Za-z0-9./_-]/g, '').toLowerCase();
    if (/\.(md|txt|json|csv|ya?ml)$/.test(cleaned)) {
      names.push(cleaned);
    }
  }
  return names;
}

function extractToolNames(text: string): string[] {
  const names: string[] = [];
  for (const token of text.toLowerCase().split(/[^a-z0-9_]+/)) {
    if (isToolName(token)) {
      names.push(token);
    }
  }
  return names;
}

function isToolName(token: string): boolean {
  const parts = token.split('_');
  if (parts.length < 2) {
    return false;
  }
  return parts.every((part) => /^[a-z][a-z0-9]*$/.test(part));
}

function spokenPhrase(statement: string): string {
  return stripTrailingPeriods(oneLine(statement))
    .replace(/^(use|prefer|apply|always)\s+/iu, '')
    .trim()
    .toLowerCase();
}

function headingTitle(statement: string): string {
  const title = stripTrailingPeriods(oneLine(statement));
  return title.length > 0 ? title : 'Skill';
}

function stripTrailingPeriods(text: string): string {
  let end = text.length;
  while (end > 0 && text.charAt(end - 1) === '.') {
    end -= 1;
  }
  return text.slice(0, end);
}

function punctuate(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return '';
  }
  return /[.!?]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}

function oneLine(text: string): string {
  return text.split(/\r?\n/u, 1)[0]?.trim() ?? '';
}

function capitalize(text: string): string {
  if (text.length === 0) {
    return text;
  }
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
