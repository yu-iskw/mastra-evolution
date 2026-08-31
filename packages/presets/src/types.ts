import type {
  ApprovalProvider,
  AutonomyLevel,
  AutonomyName,
  EvolutionTelemetry,
  ImprovementEvaluator,
  Redactor,
} from '@mastra-evolution/core';
import type { MastraCapabilities } from '@mastra-evolution/mastra';

export interface SharedPresetOptions {
  agentId: string;
  agent?: unknown;
  acceptThreshold?: number;
  sync?: boolean;
  redactor?: Redactor;
  telemetry?: EvolutionTelemetry;
  now?: () => Date;
  id?: () => string;
  capabilities?: Partial<MastraCapabilities>;
}

export interface SharedImprovementPresetOptions extends SharedPresetOptions {
  evaluator?: ImprovementEvaluator;
  experimentsAvailable?: boolean;
  approval?: ApprovalProvider;
  autonomy?: AutonomyLevel | AutonomyName;
}
