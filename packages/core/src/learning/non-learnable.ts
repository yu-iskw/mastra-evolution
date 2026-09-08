import { isNonLearnableText } from '../domain';

import type { Evidence } from '../domain';

export function isNonLearnable(evidence: Evidence): boolean {
  return evidence.kind === 'policy-signal' || isNonLearnableText(evidence.summary);
}
