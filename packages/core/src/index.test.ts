/* eslint-disable security/detect-non-literal-fs-filename -- package.json path is resolved from __dirname */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { scopeKey, scopesEqual } from './scope';

import type { Lesson } from './lesson';
import type { EvolutionStore } from './ports';

describe('core contracts', () => {
  it('requires every lesson to carry a scope', () => {
    expectTypeOf<Lesson>().toHaveProperty('scope');
    expectTypeOf<Lesson['scope']>().toMatchTypeOf<
      | { type: 'thread'; threadId: string }
      | { type: 'resource'; resourceId: string }
      | { type: 'team'; teamId: string }
      | { type: 'agent'; agentId: string }
      | { type: 'organization'; organizationId: string }
    >();
  });

  it('accepts a resource-scoped lesson on the store port', async () => {
    const lesson: Lesson = {
      id: 'lesson-1',
      agentId: 'analytics-agent',
      scope: { type: 'resource', resourceId: 'alice' },
      kind: 'correction',
      statement: 'Revenue means booked revenue excluding cancellations.',
      evidenceIds: ['ev-1'],
      confidence: 0.4,
      occurrenceCount: 1,
      firstObservedAt: new Date('2026-08-31T00:00:00.000Z'),
      lastObservedAt: new Date('2026-08-31T00:00:00.000Z'),
      status: 'candidate',
    };

    const store: EvolutionStore = {
      putEvidence() {
        return Promise.resolve();
      },
      findEvidence() {
        return Promise.resolve([]);
      },
      putLesson(next) {
        expect(next.scope).toEqual({ type: 'resource', resourceId: 'alice' });
        return Promise.resolve();
      },
      getLesson() {
        return Promise.resolve(undefined);
      },
      findLessons() {
        return Promise.resolve([]);
      },
      putProposal() {
        return Promise.resolve();
      },
      getProposal() {
        return Promise.resolve(undefined);
      },
      appendEvent() {
        return Promise.resolve();
      },
    };

    await store.putLesson(lesson);
  });

  it('does not depend on Mastra packages', () => {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const names = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.peerDependencies ?? {}),
    ];
    expect(names.some((name) => name.startsWith('@mastra/'))).toBe(false);
  });

  it('keys scopes without colliding across types', () => {
    expect(
      scopesEqual({ type: 'agent', agentId: 'a' }, { type: 'agent', agentId: 'a' }),
    ).toBe(true);
    expect(scopeKey({ type: 'thread', threadId: 't' })).toBe('thread:t');
    expect(scopeKey({ type: 'organization', organizationId: 'o' })).toBe(
      'organization:o',
    );
  });
});
