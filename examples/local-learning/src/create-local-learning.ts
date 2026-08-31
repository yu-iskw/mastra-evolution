/* eslint-disable security/detect-non-literal-fs-filename -- workspace paths come from WORKSPACE_DIR */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { LocalFilesystem, Workspace } from '@mastra/core/workspace';
import { createMastraEvolution, resolveEvolutionWorkspaceLayout } from '@mastra-evolution/mastra';

import { applyGeminiApiKey, readEnv } from './env';

import type { EvolutionWorkspaceLayout, MastraEvolution } from '@mastra-evolution/mastra';

const MODEL = 'google/gemini-flash-lite-latest';
export const AGENT_ID = 'analytics-agent';

export interface LocalLearningStack {
  readonly agent: Agent;
  readonly evolution: MastraEvolution;
  readonly mastra: Mastra;
  readonly model: string;
  readonly storeDir: string;
  readonly workspaceDir: string;
}

export interface EvolutionSnapshot {
  acceptedLessons: number;
  acceptedStatements: string[];
  evidence: number;
  lessons: number;
  storeDir: string;
}

/**
 * Existing Mastra Agent + Workspace, then Evolution learning-only.
 * Resets sibling `.evolution/` (store + learned skills) so each process starts clean.
 * Curated `workspace/skills/` is left alone for git-managed skills.
 * Register the agent on a `Mastra` instance in code — server adapters do not discover files.
 */
export async function createLocalLearning(): Promise<LocalLearningStack> {
  applyGeminiApiKey();
  const workspaceDir = path.resolve(readEnv('WORKSPACE_DIR') ?? '.workspace');
  const layout = resolveEvolutionWorkspaceLayout(workspaceDir);
  await resetPriorState(layout.storeDirectory);
  await seedWorkspace(layout);
  const workspace = new Workspace({
    id: 'analytics-workspace',
    filesystem: new LocalFilesystem({
      basePath: layout.basePath,
      allowedPaths: [...layout.allowedPaths],
    }),
    skills: [...layout.skills],
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
  const mastra = new Mastra({
    agents: { [AGENT_ID]: agent },
    logger: false,
  });
  return {
    agent,
    evolution,
    mastra,
    model: MODEL,
    storeDir: layout.storeDirectory,
    workspaceDir: layout.basePath,
  };
}

export async function evolutionSnapshot(stack: LocalLearningStack): Promise<EvolutionSnapshot> {
  const lessons = (await stack.evolution.store?.findLessons({ agentId: AGENT_ID })) ?? [];
  const evidence = (await stack.evolution.store?.findEvidence({ agentId: AGENT_ID })) ?? [];
  const accepted = lessons.filter((lesson) => lesson.status === 'accepted');
  return {
    storeDir: stack.storeDir,
    evidence: evidence.length,
    lessons: lessons.length,
    acceptedLessons: accepted.length,
    acceptedStatements: accepted.map((lesson) => lesson.statement),
  };
}

async function resetPriorState(storeDirectory: string): Promise<void> {
  await rm(storeDirectory, { recursive: true, force: true });
}

async function seedWorkspace(layout: EvolutionWorkspaceLayout): Promise<void> {
  await mkdir(layout.curatedSkillsDirectory, { recursive: true });
  await writeFile(
    path.join(layout.basePath, 'glossary.md'),
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
    path.join(layout.basePath, 'metrics.md'),
    ['# Metrics', '', 'Q1 booked revenue: 4.2M', 'Q1 cancellations: 0.3M', ''].join('\n'),
    'utf8',
  );
}
