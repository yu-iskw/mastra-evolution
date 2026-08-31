/* eslint-disable security/detect-non-literal-fs-filename -- workspace paths come from WORKSPACE_DIR */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Agent } from '@mastra/core/agent';
import { LocalFilesystem, Workspace } from '@mastra/core/workspace';
import { createMastraEvolution } from '@mastra-evolution/mastra';

import type { MastraEvolution } from '@mastra-evolution/mastra';

const MODEL = 'google/gemini-flash-lite-latest';
const AGENT_ID = 'analytics-agent';
const BOOKED_REVENUE_LESSON = 'Use booked revenue excluding cancellations.';
const DEFAULT_TURNS = 101;

/**
 * Real Mastra Agent + Workspace, then plug Evolution learning-only.
 * Resets sibling `.evolution/` and `skills/` before the run.
 */
async function main(): Promise<void> {
  applyGeminiApiKey();
  if (!hasModelApiKey()) {
    console.log(
      'skip: set GEMINI_API_KEY (or GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY) to run',
    );
    return;
  }

  const workspaceDir = path.resolve(readEnv('WORKSPACE_DIR') ?? '.workspace');
  await resetPriorState(workspaceDir);
  await seedWorkspace(workspaceDir);
  const workspace = new Workspace({
    id: 'analytics-workspace',
    filesystem: new LocalFilesystem({ basePath: workspaceDir }),
    skills: ['skills'],
    tools: { requireApproval: false },
  });
  const agent = new Agent({
    id: AGENT_ID,
    name: AGENT_ID,
    instructions: [
      'You are an analytics assistant.',
      'Prefer workspace files (glossary.md, metrics.md) over guessing.',
      'Keep answers to a few sentences.',
    ].join(' '),
    model: MODEL,
    workspace,
  });
  const evolution = createMastraEvolution({
    agent,
    workspace,
    learning: true,
  });

  const turns = turnCount();
  const storeDir = path.join(path.dirname(workspaceDir), '.evolution');
  console.log(
    `local-learning: ${turns} turns with ${MODEL} workspace=${workspaceDir} store=${storeDir}`,
  );
  await runTurns(agent, evolution, turns);
  await printLearningSummary(evolution, storeDir);
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

async function printLearningSummary(evolution: MastraEvolution, storeDir: string): Promise<void> {
  const lessons = (await evolution.store?.findLessons({ agentId: AGENT_ID })) ?? [];
  const evidence = (await evolution.store?.findEvidence({ agentId: AGENT_ID })) ?? [];
  const accepted = lessons.filter((lesson) => lesson.status === 'accepted');
  console.log(
    JSON.stringify(
      {
        storeDir,
        evidence: evidence.length,
        lessons: lessons.length,
        acceptedLessons: accepted.length,
        acceptedStatements: accepted.map((lesson) => lesson.statement),
      },
      null,
      2,
    ),
  );
  if (evidence.length === 0) {
    throw new Error('local-learning: expected evidence after 100+ turns');
  }
  if (accepted.length === 0) {
    throw new Error('local-learning: expected at least one accepted lesson');
  }
}

async function resetPriorState(workspaceDir: string): Promise<void> {
  const storeDir = path.join(path.dirname(workspaceDir), '.evolution');
  await rm(storeDir, { recursive: true, force: true });
  await rm(path.join(workspaceDir, 'skills'), { recursive: true, force: true });
}

async function seedWorkspace(workspaceDir: string): Promise<void> {
  await mkdir(path.join(workspaceDir, 'skills'), { recursive: true });
  await writeFile(
    path.join(workspaceDir, 'glossary.md'),
    [
      '# Glossary',
      '',
      'Booked revenue is recognized sales after cancellations are excluded.',
      'Billed revenue is invoiced amount and must not be used for the booked metric.',
      '',
    ].join('\n'),
    'utf8',
  );
  await writeFile(
    path.join(workspaceDir, 'metrics.md'),
    ['# Metrics', '', 'Q1 booked revenue: 4.2M', 'Q1 cancellations: 0.3M', ''].join('\n'),
    'utf8',
  );
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

function applyGeminiApiKey(): void {
  const gemini = readEnv('GEMINI_API_KEY');
  if (gemini === undefined) {
    return;
  }
  const proc = processEnv();
  if (proc === undefined) {
    return;
  }
  proc.GOOGLE_GENERATIVE_AI_API_KEY ??= gemini;
  proc.GOOGLE_API_KEY ??= gemini;
}

function hasModelApiKey(): boolean {
  return Boolean(
    readEnv('GEMINI_API_KEY') ??
    readEnv('GOOGLE_API_KEY') ??
    readEnv('GOOGLE_GENERATIVE_AI_API_KEY') ??
    readEnv('OPENAI_API_KEY'),
  );
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
    const text = (result as { text?: unknown }).text;
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

function readEnv(name: string): string | undefined {
  return processEnv()?.[name];
}

function processEnv(): Record<string, string | undefined> | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
}

void main().catch((error: unknown) => {
  console.error(error);
  const proc = (globalThis as { process?: { exitCode?: number } }).process;
  if (proc) {
    proc.exitCode = 1;
  }
});
