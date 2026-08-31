/* eslint-disable security/detect-non-literal-fs-filename -- workspace paths come from WORKSPACE_DIR */
import { access, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { SkillSearchProcessor } from '@mastra/core/processors';
import { LocalFilesystem, Workspace } from '@mastra/core/workspace';
import { slugSkillName } from '@mastra-evolution/core';
import { createMastraEvolution, resolveEvolutionWorkspaceLayout } from '@mastra-evolution/mastra';

import { applyGeminiApiKey, readEnv } from './env';

import type { EvolutionWorkspaceLayout, MastraEvolution } from '@mastra-evolution/mastra';

const MODEL = 'google/gemini-flash-lite-latest';
export const AGENT_ID = 'analytics-agent';
export const BOOKED_REVENUE_LESSON = 'Use booked revenue excluding cancellations.';
export const SKILL_DIR_NAME = slugSkillName(BOOKED_REVENUE_LESSON);

export interface AnalyticsStack {
  readonly agent: Agent;
  readonly evolution: MastraEvolution;
  readonly learnedSkillsDir: string;
  readonly mastra: Mastra;
  readonly model: string;
  readonly storeDir: string;
  readonly workspaceDir: string;
  dispose(): void;
}

export interface EvolutionSnapshot {
  acceptedLessons: number;
  acceptedStatements: string[];
  evidence: number;
  lessons: number;
  promoteEvents: number;
  skillFiles: string[];
  storeDir: string;
}

/**
 * Existing Mastra Agent + Workspace, then Evolution learning and L4 skill
 * improvement. Resets sibling `.evolution/` (store + learned skills) so each
 * process starts clean. Curated `workspace/skills/` is left for git-managed skills.
 * Register the agent on a `Mastra` instance in code — server adapters do not discover files.
 */
export async function createAnalyticsStack(): Promise<AnalyticsStack> {
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
  const mastra = new Mastra({
    agents: { [AGENT_ID]: agent },
    logger: false,
  });
  return {
    agent,
    evolution,
    learnedSkillsDir: layout.learnedSkillsDirectory,
    mastra,
    model: MODEL,
    storeDir: layout.storeDirectory,
    workspaceDir: layout.basePath,
    dispose() {
      skillSearch.dispose();
    },
  };
}

export async function evolutionSnapshot(stack: AnalyticsStack): Promise<EvolutionSnapshot> {
  const lessons = (await stack.evolution.store?.findLessons({ agentId: AGENT_ID })) ?? [];
  const evidence = (await stack.evolution.store?.findEvidence({ agentId: AGENT_ID })) ?? [];
  const accepted = lessons.filter((lesson) => lesson.status === 'accepted');
  const skillFiles = await listSkillMarkdown(stack.learnedSkillsDir);
  const events = (await stack.evolution.store?.findEvents(AGENT_ID)) ?? [];
  const promoted = events.filter((event) => event.type === 'evolution.promote');
  return {
    storeDir: stack.storeDir,
    evidence: evidence.length,
    lessons: lessons.length,
    acceptedLessons: accepted.length,
    acceptedStatements: accepted.map((lesson) => lesson.statement),
    skillFiles,
    promoteEvents: promoted.length,
  };
}

export async function skillMarkdownExists(learnedSkillsDir: string): Promise<boolean> {
  try {
    await access(path.join(learnedSkillsDir, SKILL_DIR_NAME, 'SKILL.md'));
    return true;
  } catch {
    return false;
  }
}

async function listSkillMarkdown(skillsDir: string): Promise<string[]> {
  try {
    const entries = await readdir(skillsDir, { withFileTypes: true, encoding: 'utf8' });
    const skillDirs = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'));
    const checks = await Promise.all(
      skillDirs.map(async (entry) => {
        const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
        try {
          await access(skillPath);
          return skillPath;
        } catch {
          return undefined;
        }
      }),
    );
    return checks.filter((skillPath): skillPath is string => skillPath !== undefined);
  } catch {
    return [];
  }
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
      'Metrics live in metrics.md. Revenue policy is defined by Agent Skills when present.',
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
