/* eslint-disable security/detect-non-literal-fs-filename -- directory is a constructor option */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { VersionConflictError, scopesEqual } from '@mastra-evolution/core';

import { readJsonFile, writeJsonAtomic } from './atomic-json';

import type {
  Evidence,
  EvidenceQuery,
  EvolutionEvent,
  EvolutionStore,
  ImprovementProposal,
  Lesson,
  LessonQuery,
  LessonValidity,
} from '@mastra-evolution/core';

const FILES = {
  evidence: 'evidence.json',
  lessons: 'lessons.json',
  proposals: 'proposals.json',
  events: 'events.json',
} as const;

export interface LocalEvolutionStoreOptions {
  readonly directory: string;
}

export class LocalEvolutionStore implements EvolutionStore {
  private readonly directory: string;
  private readonly evidence = new Map<string, Evidence>();
  private readonly lessons = new Map<string, Lesson>();
  private readonly proposals = new Map<string, ImprovementProposal>();
  private readonly events: EvolutionEvent[] = [];
  private opened = false;
  private queue: Promise<void> = Promise.resolve();

  constructor(options: LocalEvolutionStoreOptions) {
    this.directory = path.resolve(options.directory);
  }

  async open(): Promise<void> {
    await this.runExclusive(async () => {
      await this.loadFromDisk();
    });
  }

  async close(): Promise<void> {
    await this.runExclusive(async () => {
      if (!this.opened) {
        return;
      }
      await this.persistAll();
      this.clearMemory();
      this.opened = false;
    });
  }

  async putEvidence(evidence: Evidence): Promise<void> {
    await this.runExclusive(async () => {
      await this.ensureOpenUnlocked();
      const identity = evidence.provenance.sourceIdentity;
      if (identity) {
        for (const [id, existing] of this.evidence.entries()) {
          if (
            existing.provenance.sourceIdentity === identity &&
            existing.agentId === evidence.agentId
          ) {
            this.evidence.delete(id);
          }
        }
      }
      this.evidence.set(evidence.id, cloneEvidence(evidence));
      await this.persistEvidence();
    });
  }

  async findEvidence(query: EvidenceQuery): Promise<Evidence[]> {
    return this.runExclusive(async () => {
      await this.ensureOpenUnlocked();
      return [...this.evidence.values()]
        .filter((item) => matchesEvidence(item, query))
        .map((item) => cloneEvidence(item));
    });
  }

  async putLesson(lesson: Lesson): Promise<void> {
    await this.runExclusive(async () => {
      await this.ensureOpenUnlocked();
      this.lessons.set(lesson.id, cloneLesson(lesson));
      await this.persistLessons();
    });
  }

  async getLesson(id: string): Promise<Lesson | undefined> {
    return this.runExclusive(async () => {
      await this.ensureOpenUnlocked();
      const lesson = this.lessons.get(id);
      return lesson ? cloneLesson(lesson) : undefined;
    });
  }

  async findLessons(query: LessonQuery): Promise<Lesson[]> {
    return this.runExclusive(async () => {
      await this.ensureOpenUnlocked();
      return [...this.lessons.values()]
        .filter((item) => matchesLesson(item, query))
        .map((item) => cloneLesson(item));
    });
  }

  async putProposal(proposal: ImprovementProposal): Promise<void> {
    await this.runExclusive(async () => {
      await this.ensureOpenUnlocked();
      const existing = this.proposals.get(proposal.id);
      if (existing && proposal.version < existing.version) {
        throw new VersionConflictError();
      }
      if (
        existing &&
        existing.status === 'published' &&
        proposal.status === 'published' &&
        proposal.version === existing.version
      ) {
        throw new VersionConflictError();
      }
      this.proposals.set(proposal.id, cloneProposal(proposal));
      await this.persistProposals();
    });
  }

  async getProposal(id: string): Promise<ImprovementProposal | undefined> {
    return this.runExclusive(async () => {
      await this.ensureOpenUnlocked();
      const proposal = this.proposals.get(id);
      return proposal ? cloneProposal(proposal) : undefined;
    });
  }

  async appendEvent(event: EvolutionEvent): Promise<void> {
    await this.runExclusive(async () => {
      await this.ensureOpenUnlocked();
      this.events.push(cloneEvent(event));
      await this.persistEvents();
    });
  }

  async findEvents(agentId: string): Promise<EvolutionEvent[]> {
    return this.runExclusive(async () => {
      await this.ensureOpenUnlocked();
      return this.events
        .filter((event) => event.agentId === agentId)
        .map((event) => cloneEvent(event));
    });
  }

  private async runExclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async ensureOpenUnlocked(): Promise<void> {
    if (!this.opened) {
      await this.loadFromDisk();
    }
  }

  private async loadFromDisk(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const [evidence, lessons, proposals, events] = await Promise.all([
      readJsonFile<Evidence[]>(this.filePath(FILES.evidence), []),
      readJsonFile<Lesson[]>(this.filePath(FILES.lessons), []),
      readJsonFile<ImprovementProposal[]>(this.filePath(FILES.proposals), []),
      readJsonFile<EvolutionEvent[]>(this.filePath(FILES.events), []),
    ]);
    this.evidence.clear();
    for (const item of evidence) {
      this.evidence.set(item.id, cloneEvidence(item));
    }
    this.lessons.clear();
    for (const item of lessons) {
      this.lessons.set(item.id, cloneLesson(item));
    }
    this.proposals.clear();
    for (const item of proposals) {
      this.proposals.set(item.id, cloneProposal(item));
    }
    this.events.length = 0;
    this.events.push(...events.map((event) => cloneEvent(event)));
    this.opened = true;
  }

  private clearMemory(): void {
    this.evidence.clear();
    this.lessons.clear();
    this.proposals.clear();
    this.events.length = 0;
  }

  private async persistAll(): Promise<void> {
    await Promise.all([
      this.persistEvidence(),
      this.persistLessons(),
      this.persistProposals(),
      this.persistEvents(),
    ]);
  }

  private async persistEvidence(): Promise<void> {
    await writeJsonAtomic(this.filePath(FILES.evidence), [...this.evidence.values()]);
  }

  private async persistLessons(): Promise<void> {
    await writeJsonAtomic(this.filePath(FILES.lessons), [...this.lessons.values()]);
  }

  private async persistProposals(): Promise<void> {
    await writeJsonAtomic(this.filePath(FILES.proposals), [...this.proposals.values()]);
  }

  private async persistEvents(): Promise<void> {
    await writeJsonAtomic(this.filePath(FILES.events), this.events);
  }

  private filePath(fileName: (typeof FILES)[keyof typeof FILES]): string {
    return path.join(this.directory, fileName);
  }
}

function cloneDate(value: Date): Date {
  return new Date(value.getTime());
}

function cloneEvidence(evidence: Evidence): Evidence {
  return {
    ...evidence,
    observedAt: cloneDate(evidence.observedAt),
    provenance: { ...evidence.provenance },
  };
}

function cloneValidity(validity: LessonValidity): LessonValidity {
  return {
    ...validity,
    validFrom: validity.validFrom ? cloneDate(validity.validFrom) : undefined,
    validUntil: validity.validUntil ? cloneDate(validity.validUntil) : undefined,
    revalidateAfter: validity.revalidateAfter ? cloneDate(validity.revalidateAfter) : undefined,
  };
}

function cloneLesson(lesson: Lesson): Lesson {
  const cloned: Lesson = {
    ...lesson,
    evidenceIds: [...lesson.evidenceIds],
    firstObservedAt: cloneDate(lesson.firstObservedAt),
    lastObservedAt: cloneDate(lesson.lastObservedAt),
  };
  if (lesson.validity) {
    cloned.validity = cloneValidity(lesson.validity);
  }
  return cloned;
}

function cloneProposal(proposal: ImprovementProposal): ImprovementProposal {
  const cloned: ImprovementProposal = {
    ...proposal,
    lessonIds: [...proposal.lessonIds],
    evidenceIds: [...proposal.evidenceIds],
    createdAt: cloneDate(proposal.createdAt),
    updatedAt: cloneDate(proposal.updatedAt),
  };
  if (proposal.evaluation) {
    cloned.evaluation = {
      ...proposal.evaluation,
      regressions: [...proposal.evaluation.regressions],
    };
  }
  return cloned;
}

function cloneEvent(event: EvolutionEvent): EvolutionEvent {
  return { ...event, at: cloneDate(event.at), payload: { ...event.payload } };
}

function matchesEvidence(item: Evidence, query: EvidenceQuery): boolean {
  if (query.agentId && item.agentId !== query.agentId) {
    return false;
  }
  if (query.kind && item.kind !== query.kind) {
    return false;
  }
  if (query.sourceIdentity && item.provenance.sourceIdentity !== query.sourceIdentity) {
    return false;
  }
  if (query.scope && !scopesEqual(item.scope, query.scope)) {
    return false;
  }
  return true;
}

function matchesLesson(item: Lesson, query: LessonQuery): boolean {
  if (query.agentId && item.agentId !== query.agentId) {
    return false;
  }
  if (query.status && item.status !== query.status) {
    return false;
  }
  if (query.kind && item.kind !== query.kind) {
    return false;
  }
  if (query.statement && item.statement !== query.statement) {
    return false;
  }
  if (query.scope && !scopesEqual(item.scope, query.scope)) {
    return false;
  }
  return true;
}
