import type { Evidence, EvolutionScope, EvolutionStore, Lesson } from '@mastra-evolution/core';

export interface MastraCapabilities {
  observationalMemory: boolean;
  memoryExtractors: boolean;
  skills: boolean;
  skillSearch: boolean;
  versionedSkills: boolean;
  feedback: boolean;
  datasets: boolean;
  experiments: boolean;
  toolHooks: boolean;
  dynamicWorkflows: boolean;
  fineGrainedAuthorization: boolean;
}

export interface LearningLike {
  ingest(evidence: Evidence): Promise<unknown>;
  ingestSignal?(
    input: unknown,
    context: {
      agentId: string;
      scope: EvolutionScope;
      source?: Evidence['source'];
      provenance?: Evidence['provenance'];
    },
  ): Promise<unknown>;
}

export interface ImprovementLike {
  proposeFromLesson?(lesson: Lesson, artifact?: unknown): Promise<unknown>;
}

export interface CreateMastraEvolutionOptions {
  agent?: unknown;
  learning?: LearningLike | { enabled: boolean };
  improvement?: ImprovementLike | { enabled: boolean };
  capabilities?: Partial<MastraCapabilities>;
  store?: EvolutionStore;
}

export interface MastraExtractorFragment {
  onExtracted: (payload: unknown, ctx?: unknown) => Promise<void> | void;
}

export interface MastraEvolutionHooks {
  afterToolCall?: (context: unknown) => Promise<void> | void;
}

export interface MastraEvolution {
  capabilities: MastraCapabilities;
  extractors: MastraExtractorFragment[];
  processors: unknown[];
  hooks: MastraEvolutionHooks;
  applyToCall<T extends Record<string, unknown>>(callOptions: T): T;
  register<T>(agent: T): T;
}
