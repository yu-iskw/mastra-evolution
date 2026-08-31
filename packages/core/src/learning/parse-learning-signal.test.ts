import { describe, expect, it } from 'vitest';

import { parseLearningSignal } from './parse-learning-signal';

describe('parseLearningSignal extra cases', () => {
  it('accepts optional contradictsStatement', () => {
    expect(
      parseLearningSignal({
        kind: 'correction',
        summary: 'Dataset X was retired. Use dataset Y.',
        contradictsStatement: 'Use dataset X.',
      }),
    ).toMatchObject({
      kind: 'correction',
      contradictsStatement: 'Use dataset X.',
    });
  });

  it('ignores malformed optional fields', () => {
    expect(
      parseLearningSignal({
        kind: 'procedure',
        summary: 'Follow the export checklist.',
        importance: 'high',
        suggestedScope: 'galaxy',
        suggestedAction: 'explode',
        contradictsStatement: 1,
      }),
    ).toEqual({
      kind: 'procedure',
      summary: 'Follow the export checklist.',
    });
  });
});
