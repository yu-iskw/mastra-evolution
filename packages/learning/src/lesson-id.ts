import { scopeKey } from '@mastra-evolution/core';

import type { EvolutionScope } from '@mastra-evolution/core';

export function normalizeStatement(statement: string): string {
  return statement.trim().toLowerCase();
}

export function hashLessonId(agentId: string, scope: EvolutionScope, statement: string): string {
  const material = `${agentId}\0${scopeKey(scope)}\0${normalizeStatement(statement)}`;
  return `les_${fnv1a(material)}`;
}

function fnv1a(value: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code << 1;
    h2 = Math.imul(h2, 0x811c9dc5);
  }
  return toHex(h1 >>> 0) + toHex(h2 >>> 0);
}

function toHex(value: number): string {
  const hex = value.toString(16);
  return hex.length >= 8 ? hex : `00000000${hex}`.slice(-8);
}
