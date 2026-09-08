const SHARED_NEEDLES = [
  'password',
  'secret',
  'credential',
  'authorization',
  'authz',
  'api key',
] as const;

const LEARNING_NEEDLES = [...SHARED_NEEDLES, 'ignore previous', 'jailbreak'] as const;

export function containsSensitiveText(text: string): boolean {
  return matchesNeedles(text, SHARED_NEEDLES);
}

export function isNonLearnableText(text: string): boolean {
  return matchesNeedles(text, LEARNING_NEEDLES);
}

function matchesNeedles(text: string, needles: readonly string[]): boolean {
  const haystack = text.toLowerCase();
  return needles.some((needle) => haystack.includes(needle));
}
