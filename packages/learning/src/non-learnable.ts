import { isNonLearnableText } from '@mastra-evolution/core';

import type { Evidence } from '@mastra-evolution/core';

export function isNonLearnable(evidence: Evidence): boolean {
  return evidence.kind === 'policy-signal' || isNonLearnableText(evidence.summary);
}
