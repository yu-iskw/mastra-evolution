/* eslint-disable security/detect-non-literal-fs-filename -- package.json path is resolved from __dirname */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { proposalUpsertConflicts } from './proposal-write';
import { matchesEvidence, matchesLesson } from './query-match';
import { isOrganizationScope, scopeKey, scopesEqual } from './scope';
import { MAX_SKILL_NAME_LENGTH, slugSkillName } from './skill-name';

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
      findEvents() {
        return Promise.resolve([]);
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
    expect(scopesEqual({ type: 'agent', agentId: 'a' }, { type: 'agent', agentId: 'a' })).toBe(
      true,
    );
    expect(scopeKey({ type: 'thread', threadId: 't' })).toBe('thread:t');
    expect(scopeKey({ type: 'organization', organizationId: 'o' })).toBe('organization:o');
    expect(isOrganizationScope({ type: 'organization', organizationId: 'o' })).toBe(true);
    expect(isOrganizationScope({ type: 'agent', agentId: 'a' })).toBe(false);
  });

  it('matches evidence and lessons by query fields', () => {
    const evidence = {
      id: 'ev-1',
      agentId: 'analytics-agent',
      scope: { type: 'resource' as const, resourceId: 'alice' },
      source: 'interaction' as const,
      kind: 'correction' as const,
      summary: 'booked revenue',
      provenance: { sourceIdentity: 'src-1' },
      observedAt: new Date('2026-08-31T00:00:00.000Z'),
    };
    expect(matchesEvidence(evidence, { agentId: 'analytics-agent', sourceIdentity: 'src-1' })).toBe(
      true,
    );
    expect(matchesEvidence(evidence, { agentId: 'other' })).toBe(false);
    const lesson: Lesson = {
      id: 'lesson-1',
      agentId: 'analytics-agent',
      scope: { type: 'resource', resourceId: 'alice' },
      kind: 'correction',
      statement: 'booked revenue',
      evidenceIds: ['ev-1'],
      confidence: 0.4,
      occurrenceCount: 1,
      firstObservedAt: evidence.observedAt,
      lastObservedAt: evidence.observedAt,
      status: 'candidate',
    };
    expect(matchesLesson(lesson, { status: 'candidate', kind: 'correction' })).toBe(true);
    expect(matchesLesson(lesson, { status: 'accepted' })).toBe(false);
  });

  it('detects conflicting published proposal writes', () => {
    expect(
      proposalUpsertConflicts(
        { version: 1, status: 'published' },
        { version: 1, status: 'published' },
      ),
    ).toBe(true);
    expect(
      proposalUpsertConflicts({ version: 1, status: 'draft' }, { version: 1, status: 'draft' }),
    ).toBe(false);
  });

  it('slugs skill names from the first words of a statement', () => {
    expect(slugSkillName('Use booked revenue excluding cancellations.')).toBe(
      'use-booked-revenue-excluding-cancellations',
    );
    expect(slugSkillName('???', 'skill-fallback')).toBe('skill-fallback');
    expect(slugSkillName('???')).toBe('');
    expect(MAX_SKILL_NAME_LENGTH).toBe(64);
  });
});
