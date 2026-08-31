import { randomUUID } from 'node:crypto';

import type { EvolutionStore, EvolutionTelemetry } from '@mastra-evolution/core';

export class RecordingTelemetry implements EvolutionTelemetry {
  readonly spans: string[] = [];
  readonly records: Array<{ name: string; attributes?: Record<string, string | number | boolean> }> =
    [];

  async span<T>(name: string, run: () => Promise<T>): Promise<T> {
    this.spans.push(name);
    return run();
  }

  record(name: string, attributes?: Record<string, string | number | boolean>): void {
    this.records.push({ name, attributes });
  }
}

export async function runSignals(
  store: EvolutionStore,
  ingest: (store: EvolutionStore, summary: string) => Promise<void>,
  summaries: string[],
): Promise<void> {
  for (const summary of summaries) {
    await ingest(store, summary);
  }
}

export function nextId(): string {
  return randomUUID();
}
