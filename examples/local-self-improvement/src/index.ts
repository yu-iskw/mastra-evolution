import { createImprovement } from '@mastra-evolution/improvement';
import { createLearning } from '@mastra-evolution/learning';
import { createMastraEvaluator, FilesystemSkillPublisher } from '@mastra-evolution/mastra';
import { createMastraEvolution } from '@mastra-evolution/presets';
import { LocalEvolutionStore } from '@mastra-evolution/storage-local';

import type { EvolutionStore } from '@mastra-evolution/core';
import type { MastraEvolution } from '@mastra-evolution/mastra';

/**
 * Hobby self-improvement: existing Agent stand-in, learning, and L4 skill publish.
 * `createMastraEvolution` is imported from `@mastra-evolution/presets`.
 */
async function main(): Promise<void> {
  const agent = { name: 'analytics-agent' };
  const directory = readEnv('EVOLUTION_DIR') ?? '.evolution';
  const store: EvolutionStore = new LocalEvolutionStore({ directory });
  const publisher = new FilesystemSkillPublisher({ directory: `${directory}/skills` });
  // Stub evaluator: typechecks without Mastra experiments. For a small-model eval,
  // pass createMastraEvaluator({ experimentsAvailable: true, run }) that runs
  // baseline vs candidate on a pinned dataset (see MASTRA_CAPABILITIES.md).
  const evaluator = createMastraEvaluator({ experimentsAvailable: false });
  const learning = createLearning({
    store,
    agentId: agent.name,
    autonomy: 'learn',
  });
  const improvement = createImprovement({
    store,
    evaluator,
    publisher,
    autonomy: 'auto-promote-bounded',
    experimentsAvailable: false,
  });
  const evolution: MastraEvolution = createMastraEvolution({
    agent,
    learning,
    improvement,
    store,
  });
  const registered = evolution.register(agent);
  // register(agent) returns the same instance (Object.is); it does not wrap or subclass.
  if (!Object.is(registered, agent)) {
    throw new Error('register(agent) must return the same agent reference');
  }

  if (!hasModelApiKey()) {
    console.log(
      'skip: no model API key (set OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY to run)',
    );
    return;
  }

  console.log(
    `Evolution attached to ${agent.name} (learning + L4 skill improvement, stub evaluator). Store: ${directory}`,
  );
}

function hasModelApiKey(): boolean {
  return Boolean(readEnv('OPENAI_API_KEY') ?? readEnv('GOOGLE_GENERATIVE_AI_API_KEY'));
}

function readEnv(name: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.[name];
}

void main().catch((error: unknown) => {
  console.error(error);
  const proc = (globalThis as { process?: { exitCode?: number } }).process;
  if (proc) {
    proc.exitCode = 1;
  }
});
