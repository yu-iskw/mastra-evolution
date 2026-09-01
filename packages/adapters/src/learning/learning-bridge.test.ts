import { describe, expect, it } from 'vitest';

import { createAfterToolCall, shouldIngestToolResult } from './learning-bridge';

import type { LearningLike } from '../types';
import type { Evidence } from '@mastra-evolution/core';

describe('shouldIngestToolResult', () => {
  it('skips successful tool results', () => {
    expect(shouldIngestToolResult({ toolName: 'search', result: 'ok' })).toBe(false);
    expect(shouldIngestToolResult({ toolName: 'mastra_workspace_read_file' })).toBe(false);
  });

  it('keeps tool failures', () => {
    expect(shouldIngestToolResult({ toolName: 'query', error: new Error('timeout') })).toBe(true);
    expect(shouldIngestToolResult({ toolName: 'query', success: false })).toBe(true);
    expect(shouldIngestToolResult({ toolName: 'query', ok: false })).toBe(true);
    expect(shouldIngestToolResult({ toolName: 'query', status: 'error' })).toBe(true);
    expect(shouldIngestToolResult({ toolName: 'query', result: { success: false } })).toBe(true);
  });
});

describe('createAfterToolCall', () => {
  it('does not ingest successful tool results', async () => {
    const ingested: Evidence[] = [];
    const learning = {
      enabled: true,
      runtime: {
        ingest(evidence: Evidence) {
          ingested.push(evidence);
          return Promise.resolve(undefined);
        },
      } satisfies LearningLike,
    };
    await createAfterToolCall(
      learning,
      'analytics-agent',
    )({
      toolName: 'mastra_workspace_list_files',
      result: 'ok',
    });
    expect(ingested).toHaveLength(0);
  });

  it('ingests tool failures as failure evidence', async () => {
    const ingested: Evidence[] = [];
    const learning = {
      enabled: true,
      runtime: {
        ingest(evidence: Evidence) {
          ingested.push(evidence);
          return Promise.resolve(undefined);
        },
      } satisfies LearningLike,
    };
    await createAfterToolCall(
      learning,
      'analytics-agent',
    )({
      toolName: 'query',
      error: new Error('timeout'),
      threadId: 't1',
    });
    expect(ingested).toHaveLength(1);
    expect(ingested[0]?.kind).toBe('failure');
    expect(ingested[0]?.source).toBe('tool-result');
    expect(ingested[0]?.scope).toEqual({ type: 'thread', threadId: 't1' });
  });
});
