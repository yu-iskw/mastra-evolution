export const MAX_SKILL_NAME_LENGTH = 64;
const SKILL_WORD_LIMIT = 5;

export function slugSkillName(statement: string, fallback?: string): string {
  const words = statement
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]+/g, ''))
    .filter((word) => word.length > 0)
    .slice(0, SKILL_WORD_LIMIT);
  const slug = words.join('-').slice(0, MAX_SKILL_NAME_LENGTH);
  if (slug.length > 0) {
    return slug;
  }
  return fallback ?? '';
}
