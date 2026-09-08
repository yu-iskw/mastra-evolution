import type {
  ApprovalProvider,
  AutonomyLevel,
  AutonomyName,
  Evidence,
  EvolutionStore,
  EvolutionTelemetry,
  ImprovementEvaluator,
  Lesson,
  PromotionPolicy,
  Redactor,
} from '@mastra-evolution/core';
import type { IngestResult, SignalContext } from '@mastra-evolution/core/learning';

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
  ingest(evidence: Evidence): Promise<IngestResult | undefined>;
  ingestSignal?(input: unknown, context: SignalContext): Promise<IngestResult | undefined>;
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
   * Used for agent id and capability probe only — never mutated, never given Memory.
   * Real Mastra Agents keep workspace private — pass `workspace` as well.
   * Duck-typed `agent.workspace` is still read when `workspace` is omitted.
   */
  agent?: unknown;
  /**
   * Workspace to bind hooks and hobby store/skills paths.
   * Required for a real Mastra Agent. Wins over duck-typed `agent.workspace`.
   * Evolution may merge `tools.hooks.afterToolCall` (failures only); it does not
   * replace the Workspace or touch Memory.
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
  /**
   * Duck-typed Mastra capability probe. `feedback` is informational only until a
   * Feedback→ingest adapter ships; Evolution does not auto-bridge observability.
   */
  capabilities: MastraCapabilities;
  /**
   * Learning extractor fragments (primary procedure/correction ingress when wired
   * by the app into Observational Memory or called via `onExtracted`).
   */
  extractors: MastraExtractorFragment[];
  /** Reserved processor list; unused in the default attach path. */
  processors: unknown[];
  /**
   * Workspace/call hooks Evolution may merge. Default `afterToolCall` journals
   * tool **failures** only (not successful tool results).
   */
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
   * Compatibility stub: returns the same agent identity (`Object.is`). Does not
   * wrap, subclass, or mutate Memory. Prefer `createMastraEvolution({ agent, workspace })`,
   * which already plugs workspace hooks.
   */
  register<T>(agent: T): T;
  /**
   * Observational Memory extractor fragment for apps that still construct `Memory`.
   * Pass into `observationalMemory.observation.extract` (or call `onExtracted` from
   * HTTP `/evolution/extract`). Evolution never auto-attaches this to `agent.memory`.
   */
  extractor(): MastraExtractorFragment & { name: string; instructions: string };
}
