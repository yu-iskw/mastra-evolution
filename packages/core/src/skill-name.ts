export const MAX_SKILL_NAME_LENGTH = 64;
export const MAX_SKILL_DESCRIPTION_LENGTH = 1024;
const SKILL_WORD_LIMIT = 5;
const SKILL_NAME_PATTERN = /^[a-z0-9-]+$/;

export function slugSkillName(statement: string, fallback?: string): string {
  const fromStatement = trimHyphens(
    sanitizeSkillSlug(
      statement
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .map((word) => word.replace(/[^a-z0-9]+/g, ''))
        .filter((word) => word.length > 0)
        .slice(0, SKILL_WORD_LIMIT)
        .join('-'),
    ).slice(0, MAX_SKILL_NAME_LENGTH),
  );
  if (fromStatement.length > 0) {
    return fromStatement;
  }
  if (fallback === undefined) {
    return '';
  }
  return trimHyphens(sanitizeSkillSlug(fallback).slice(0, MAX_SKILL_NAME_LENGTH));
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
  if (name.startsWith('-') || name.endsWith('-')) {
    errors.push('Skill name must not start or end with a hyphen.');
  }
  if (name.includes('--')) {
    errors.push('Skill name must not contain consecutive hyphens.');
  }
  if (name.length > 0 && !SKILL_NAME_PATTERN.test(name)) {
    errors.push('Skill name must match [a-z0-9-]+.');
  }
  return errors;
}

function sanitizeSkillSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-');
}

function trimHyphens(value: string): string {
  return value.replace(/^-+/, '').replace(/-+$/, '');
}
