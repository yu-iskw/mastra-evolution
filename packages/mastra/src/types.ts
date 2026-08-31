import type {
  ApprovalProvider,
  AutonomyLevel,
  AutonomyName,
  Evidence,
  EvolutionScope,
  EvolutionStore,
  EvolutionTelemetry,
  ImprovementEvaluator,
  Lesson,
  PromotionPolicy,
  Redactor,
} from '@mastra-evolution/core';

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
  proposeFromLesson(lesson: Lesson, artifact?: unknown): Promise<unknown>;
  promote(proposalId: string): Promise<unknown>;
}

export interface LearningConfig {
  enabled?: boolean;
  autonomy?: AutonomyLevel | AutonomyName;
  acceptThreshold?: number;
  sync?: boolean;
  redactor?: Redactor;
  telemetry?: EvolutionTelemetry;
}

export interface ImprovementConfig {
  enabled?: boolean;
  autonomy?: AutonomyLevel | AutonomyName;
  evaluator?: ImprovementEvaluator;
  experimentsAvailable?: boolean;
  approval?: ApprovalProvider;
  promotionPolicy?: PromotionPolicy;
}

export interface CreateMastraEvolutionOptions {
  /**
   * Existing Mastra Agent (or duck-type with `id`/`name` and optional `workspace`).
   * Real Mastra Agents keep workspace private — pass `workspace` as well.
   * Duck-typed `agent.workspace` is still read when `workspace` is omitted.
   */
  agent?: unknown;
  /**
   * Workspace to bind hooks and hobby store/skills paths.
   * Required for a real Mastra Agent. Wins over duck-typed `agent.workspace`.
   */
  workspace?: unknown;
  learning?: boolean | LearningLike | LearningConfig;
  improvement?: boolean | ImprovementLike | ImprovementConfig;
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
  store?: EvolutionStore;
  learning?: LearningLike;
  improvement?: ImprovementLike;
  /**
   * Escape hatch for assigned/non-workspace tools at `generate`/`stream`.
   * The factory already merges workspace `tools.hooks` when `setToolsConfig` exists.
   */
  applyToCall<T extends Record<string, unknown> = Record<string, unknown>>(callOptions?: T): T;
  /**
   * Returns the same agent identity (`Object.is`). Does not wrap or subclass.
   * Prefer `createMastraEvolution({ agent, workspace })`, which plugs workspace hooks.
   */
  register<T>(agent: T): T;
  /**
   * Observational Memory extractor fragment for apps that still construct `Memory`.
   * Not required to plug an existing agent.
   */
  extractor(): MastraExtractorFragment & { name: string; instructions: string };
}
