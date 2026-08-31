/* eslint-disable security/detect-non-literal-fs-filename -- workspace paths come from WORKSPACE_DIR */
import { access, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Agent } from '@mastra/core/agent';
import { SkillSearchProcessor } from '@mastra/core/processors';
import { LocalFilesystem, Workspace } from '@mastra/core/workspace';
import { createMastraEvolution } from '@mastra-evolution/mastra';

import type { MastraEvolution } from '@mastra-evolution/mastra';

const MODEL = 'google/gemini-flash-lite-latest';
const AGENT_ID = 'analytics-agent';
const BOOKED_REVENUE_LESSON = 'Use booked revenue excluding cancellations.';
const DEFAULT_TURNS = 101;
const SKILL_DIR_NAME = 'use-booked-revenue-excluding-cancellations';

/**
 * Real Mastra Agent + Workspace, then plug Evolution learning and L4 skill improvement.
 * Resets prior store/skills, then requires search_skills/load_skill after SKILL.md exists.
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
    bm25: true,
    tools: { requireApproval: false },
  });
  const skillSearch = new SkillSearchProcessor({
    workspace,
    blockingRefresh: true,
    search: { topK: 5, minScore: 0 },
  });
  const agent = new Agent({
    id: AGENT_ID,
    name: AGENT_ID,
    instructions: [
      'You are an analytics assistant.',
      'When a relevant Agent Skill exists, call search_skills then load_skill before answering.',
      'Prefer loaded skill instructions over glossary.md once a booked-revenue skill is available.',
      'Keep answers to a few sentences.',
    ].join(' '),
    model: MODEL,
    workspace,
    inputProcessors: [skillSearch],
  });
  const evolution = createMastraEvolution({
    agent,
    workspace,
    learning: true,
    improvement: { autonomy: 'auto-promote-bounded' },
  });

  const turns = turnCount();
  const storeDir = path.join(path.dirname(workspaceDir), '.evolution');
  console.log(
    `local-self-improvement: ${turns} turns with ${MODEL} workspace=${workspaceDir} store=${storeDir}`,
  );
  const skillUse = await runTurns(agent, evolution, workspaceDir, turns);
  await printImprovementSummary(evolution, workspaceDir, storeDir, skillUse);
  skillSearch.dispose();
}

async function runTurns(
  agent: Agent,
  evolution: MastraEvolution,
  workspaceDir: string,
  turns: number,
): Promise<{ skillPresentTurns: number; skillToolTurns: number; skillTools: string[] }> {
  const skillToolsSeen: string[] = [];
  let skillPresentTurns = 0;
  let skillToolTurns = 0;
  for (let index = 1; index <= turns; index += 1) {
    if (index % 3 === 0) {
      await evolution.extractor().onExtracted({
        kind: 'procedure',
        summary: BOOKED_REVENUE_LESSON,
        suggestedAction: 'create-skill',
      });
    }
    const skillReady = await skillMarkdownExists(workspaceDir);
    if (skillReady) {
      skillPresentTurns += 1;
    }
    const prompt = skillReady ? skillUsePrompt(index) : turnPrompt(index);
    const result = await generateWithRetry(agent, prompt, index);
    const tools = collectToolNames(result);
    const usedSkill = tools.some((name) => isSkillTool(name));
    if (usedSkill) {
      skillToolTurns += 1;
      for (const name of tools) {
        if (isSkillTool(name) && !skillToolsSeen.includes(name)) {
          skillToolsSeen.push(name);
        }
      }
    }
    console.log(
      `turn ${index}/${turns}: tools=${tools.join(',') || '(none)'} skillReady=${skillReady} ${oneLine(textFromGenerate(result))}`,
    );
  }
  return { skillPresentTurns, skillToolTurns, skillTools: skillToolsSeen };
}

async function generateWithRetry(agent: Agent, prompt: string, turn: number): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      return await agent.generate(prompt, { maxSteps: 8 });
    } catch (error: unknown) {
      lastError = error;
      const delayMs = backoffMs(attempt);
      console.error(`turn ${turn} attempt ${attempt} failed; retry in ${delayMs}ms`);
      await sleep(delayMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function printImprovementSummary(
  evolution: MastraEvolution,
  workspaceDir: string,
  storeDir: string,
  skillUse: { skillPresentTurns: number; skillToolTurns: number; skillTools: string[] },
): Promise<void> {
  const lessons = (await evolution.store?.findLessons({ agentId: AGENT_ID })) ?? [];
  const evidence = (await evolution.store?.findEvidence({ agentId: AGENT_ID })) ?? [];
  const accepted = lessons.filter((lesson) => lesson.status === 'accepted');
  const skillFiles = await listSkillMarkdown(path.join(workspaceDir, 'skills'));
  const events = (await evolution.store?.findEvents(AGENT_ID)) ?? [];
  const promoted = events.filter((event) => event.type === 'evolution.promote');
  console.log(
    JSON.stringify(
      {
        storeDir,
        evidence: evidence.length,
        lessons: lessons.length,
        acceptedLessons: accepted.length,
        acceptedStatements: accepted.map((lesson) => lesson.statement),
        skillFiles,
        promoteEvents: promoted.length,
        skillPresentTurns: skillUse.skillPresentTurns,
        skillToolTurns: skillUse.skillToolTurns,
        skillTools: skillUse.skillTools,
      },
      null,
      2,
    ),
  );
  if (evidence.length === 0) {
    throw new Error('local-self-improvement: expected evidence after 100+ turns');
  }
  if (accepted.length === 0) {
    throw new Error('local-self-improvement: expected at least one accepted lesson');
  }
  if (skillFiles.length === 0) {
    throw new Error('local-self-improvement: expected a published SKILL.md under workspace/skills');
  }
  if (promoted.length === 0) {
    throw new Error('local-self-improvement: expected evolution.promote events');
  }
  if (skillUse.skillToolTurns === 0) {
    throw new Error(
      'local-self-improvement: published skill was never used (expected search_skills or load_skill)',
    );
  }
}

async function listSkillMarkdown(skillsDir: string): Promise<string[]> {
  const found: string[] = [];
  try {
    const entries = await readdir(skillsDir, { withFileTypes: true, encoding: 'utf8' });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) {
        continue;
      }
      const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
      try {
        await access(skillPath);
        found.push(skillPath);
      } catch {
        continue;
      }
    }
  } catch {
    return found;
  }
  return found;
}

async function skillMarkdownExists(workspaceDir: string): Promise<boolean> {
  try {
    await access(path.join(workspaceDir, 'skills', SKILL_DIR_NAME, 'SKILL.md'));
    return true;
  } catch {
    return false;
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
      'Metrics live in metrics.md. Revenue policy is defined by Agent Skills when present.',
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
      return 'Correction: never report billed revenue. Use booked revenue excluding cancellations. Confirm, then read metrics.md.';
    }
    case 1: {
      return 'What files are in the workspace? List them.';
    }
    case 2: {
      return 'Read metrics.md and quote Q1 booked revenue.';
    }
    case 3: {
      return 'If someone says billed revenue, what should I use instead?';
    }
    case 4: {
      return 'List the files in the workspace root.';
    }
    case 5: {
      return 'Summarize metrics.md in one sentence.';
    }
    case 6: {
      return 'What is the cancellation amount in metrics.md?';
    }
    case 7: {
      return 'Search for any booked-revenue skills, then answer how to treat billed revenue.';
    }
    case 8: {
      return 'Do not use billed revenue. How do you compute booked revenue?';
    }
    default: {
      return 'Read metrics.md, then answer: what is Q1 booked revenue?';
    }
  }
}

function skillUsePrompt(index: number): string {
  if (index % 2 === 0) {
    return 'A booked-revenue skill was published. Call search_skills with "booked revenue", then load_skill, then answer using only that skill: what must we use instead of billed revenue? Do not read glossary.md.';
  }
  return 'Use search_skills and load_skill for the booked-revenue skill, then follow it to explain Q1 booked revenue from metrics.md.';
}

function isSkillTool(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes('search_skills') ||
    lower.includes('load_skill') ||
    lower.includes('skill_read') ||
    lower.includes('skill_search') ||
    lower.includes(SKILL_DIR_NAME)
  );
}

function collectToolNames(value: unknown, into = new Set<string>(), depth = 0): string[] {
  if (depth > 10 || value === null || value === undefined) {
    return [...into];
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectToolNames(item, into, depth + 1);
    }
    return [...into];
  }
  if (typeof value !== 'object') {
    if (typeof value === 'string' && (isSkillTool(value) || value.includes('SKILL.md'))) {
      into.add(value);
    }
    return [...into];
  }
  const record = value as Record<string, unknown>;
  for (const key of ['toolName', 'name', 'workspaceToolName', 'id']) {
    const field = record[key];
    if (typeof field === 'string' && field.length > 0) {
      into.add(field);
    }
  }
  for (const nested of Object.values(record)) {
    collectToolNames(nested, into, depth + 1);
  }
  return [...into];
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
