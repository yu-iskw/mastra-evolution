import { parseAutonomy } from '@mastra-evolution/core';

import { draftSkillFromLesson } from './draft-skill';
import { ingestEvidence, ingestSignal } from './ingest';

import type { SkillDraft } from './draft-skill';
import type { IngestOptions, IngestResult, SignalContext } from './ingest';
import type { AutonomyLevel, AutonomyName, Evidence, Lesson } from '@mastra-evolution/core';

export interface CreateLearningOptions extends IngestOptions {
  agentId: string;
  autonomy?: AutonomyLevel | AutonomyName;
}

export interface LearningRuntime {
  ingest(evidence: Evidence): Promise<IngestResult | undefined>;
  ingestSignal(input: unknown, context: SignalContext): Promise<IngestResult | undefined>;
  draftSkill(lesson: Lesson): SkillDraft | undefined;
}

export function createLearning(options: CreateLearningOptions): LearningRuntime {
  const autonomy = parseAutonomy(options.autonomy ?? 'learn');
  const ingestOptions = { ...options, autonomy };
  return {
    ingest(evidence: Evidence): Promise<IngestResult | undefined> {
      return ingestEvidence({ ...evidence, agentId: options.agentId }, ingestOptions);
    },
    ingestSignal(input: unknown, context: SignalContext): Promise<IngestResult | undefined> {
      return ingestSignal(input, { ...context, agentId: options.agentId }, ingestOptions);
    },
    draftSkill(lesson: Lesson): SkillDraft | undefined {
      return draftSkillFromLesson(lesson);
    },
  };
}
