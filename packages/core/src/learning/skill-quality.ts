import { MAX_SKILL_DESCRIPTION_LENGTH, validateSkillName } from '../skill-name';

const MIN_PRACTICAL_SKILL_BODY_LENGTH = 120;

interface PracticalSkillArtifact {
  name: string;
  description: string;
  markdown: string;
}

export function validatePracticalSkillArtifact(artifact: PracticalSkillArtifact): string[] {
  const errors = [...validateSkillName(artifact.name)];
  const description = artifact.description.trim();
  const markdown = artifact.markdown.trim();
  if (description.length === 0) {
    errors.push('empty-description');
  }
  if (description.length > MAX_SKILL_DESCRIPTION_LENGTH) {
    errors.push('description-too-long');
  }
  if (!/\buse when\b/i.test(description) || isSloganText(description, markdown)) {
    errors.push('slogan-description');
  }
  if (markdown.length < MIN_PRACTICAL_SKILL_BODY_LENGTH) {
    errors.push('thin-skill');
  }
  if (!/^## When to Use\b/m.test(artifact.markdown)) {
    errors.push('missing-when-section');
  }
  if (!/^## Instructions\b/m.test(artifact.markdown)) {
    errors.push('missing-instructions-section');
  }
  if (!/^## Working Memory\b/m.test(artifact.markdown)) {
    errors.push('missing-working-memory-section');
  }
  return errors;
}

function isSloganText(description: string, markdown: string): boolean {
  const normalizedDescription = normalizeSkillText(description);
  if (normalizedDescription.length === 0) {
    return true;
  }
  const normalizedBody = normalizeSkillText(markdown);
  if (normalizedDescription === normalizedBody) {
    return true;
  }
  const bodyLead = normalizeSkillText(markdown.split(/\n{2,}/, 1)[0] ?? '');
  return bodyLead.length > 0 && normalizedDescription === bodyLead;
}

function normalizeSkillText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
