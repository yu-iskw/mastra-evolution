import type { Evidence } from '@mastra-evolution/core';

const POLICY_NEEDLES = [
  'password',
  'secret',
  'credential',
  'authorization',
  'authz',
  'api key',
  'ignore previous',
  'jailbreak',
] as const;

export function isNonLearnable(evidence: Evidence): boolean {
  if (evidence.kind === 'policy-signal') {
    return true;
  }
  const summary = evidence.summary.toLowerCase();
  return POLICY_NEEDLES.some((needle) => summary.includes(needle));
}
