import { createLocalLearning, evolutionSnapshot } from './create-local-learning';
import { applyGeminiApiKey, hasModelApiKey, readEnv } from './env';

import type { LocalLearningStack } from './create-local-learning';
import type { Agent } from '@mastra/core/agent';
import type { MastraEvolution } from '@mastra-evolution/mastra';

const BOOKED_REVENUE_LESSON = 'Use booked revenue excluding cancellations.';
const DEFAULT_TURNS = 101;

/**
 * In-process 101-turn loop against the same stack the Hono server uses.
 */
async function main(): Promise<void> {
  applyGeminiApiKey();
  if (!hasModelApiKey()) {
    console.log(
      'skip: set GEMINI_API_KEY (or GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY) to run',
    );
    return;
  }

  const stack = await createLocalLearning();
  const turns = turnCount();
  console.log(
    `local-learning demo: ${turns} turns with ${stack.model} workspace=${stack.workspaceDir} store=${stack.storeDir}`,
  );
  await runTurns(stack.agent, stack.evolution, turns);
  await printLearningSummary(stack);
}

async function runTurns(agent: Agent, evolution: MastraEvolution, turns: number): Promise<void> {
  for (let index = 1; index <= turns; index += 1) {
    if (index % 3 === 0) {
      await evolution.extractor().onExtracted({
        kind: 'procedure',
        summary: BOOKED_REVENUE_LESSON,
        suggestedAction: 'create-skill',
      });
    }
    const text = await generateWithRetry(agent, turnPrompt(index), index);
    console.log(`turn ${index}/${turns}: ${oneLine(text)}`);
  }
}

async function generateWithRetry(agent: Agent, prompt: string, turn: number): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const result: unknown = await agent.generate(prompt, { maxSteps: 8 });
      return textFromGenerate(result);
    } catch (error: unknown) {
      lastError = error;
      const delayMs = backoffMs(attempt);
      console.error(`turn ${turn} attempt ${attempt} failed; retry in ${delayMs}ms`);
      await sleep(delayMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function printLearningSummary(stack: LocalLearningStack): Promise<void> {
  const snapshot = await evolutionSnapshot(stack);
  console.log(JSON.stringify(snapshot, null, 2));
  if (snapshot.evidence === 0) {
    throw new Error('local-learning: expected evidence after 100+ turns');
  }
  if (snapshot.acceptedLessons === 0) {
    throw new Error('local-learning: expected at least one accepted lesson');
  }
}

function turnPrompt(index: number): string {
  switch (index % 10) {
    case 0: {
      return 'Correction: never report billed revenue. Use booked revenue excluding cancellations. Confirm, then read glossary.md.';
    }
    case 1: {
      return 'What is booked revenue? Use workspace files.';
    }
    case 2: {
      return 'Read metrics.md and quote Q1 booked revenue.';
    }
    case 3: {
      return 'If someone says billed revenue, what should I use instead? Read glossary.md.';
    }
    case 4: {
      return 'List the files in the workspace root.';
    }
    case 5: {
      return 'Summarize glossary.md in one sentence.';
    }
    case 6: {
      return 'What is the cancellation amount in metrics.md?';
    }
    case 7: {
      return 'Repeat the booked-revenue definition from glossary.md.';
    }
    case 8: {
      return 'Do not use billed revenue. How do you compute booked revenue?';
    }
    default: {
      return 'Read glossary.md and metrics.md, then answer: what is Q1 booked revenue?';
    }
  }
}

function turnCount(): number {
  const raw = readEnv('EVOLUTION_TURNS');
  const parsed = raw === undefined ? DEFAULT_TURNS : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TURNS;
}

function textFromGenerate(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }
  if (result !== null && typeof result === 'object' && 'text' in result) {
    const text = Reflect.get(result, 'text');
    if (typeof text === 'string') {
      return text;
    }
  }
  return JSON.stringify(result);
}

function oneLine(text: string): string {
  const line = text.replace(/\s+/gu, ' ').trim();
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}

function backoffMs(attempt: number): number {
  return Math.min(30_000, 500 * 2 ** (attempt - 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

void main().catch((error: unknown) => {
  console.error(error);
  const proc = (globalThis as { process?: { exitCode?: number } }).process;
  if (proc) {
    proc.exitCode = 1;
  }
});
