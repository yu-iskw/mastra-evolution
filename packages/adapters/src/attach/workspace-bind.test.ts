import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  attachWorkspaceHooks,
  inspectWorkspace,
  resolveAttachedWorkspace,
  resolveEvolutionWorkspaceLayout,
  skillPublisherDirectory,
  workspaceCanLoadLearnedSkills,
} from './workspace-bind';

describe('resolveAttachedWorkspace', () => {
  it('prefers options.workspace over agent.workspace', () => {
    const override = { id: 'override' };
    expect(
      resolveAttachedWorkspace({
        agent: { workspace: { id: 'from-agent' } },
        workspace: override,
      }),
    ).toBe(override);
  });

  it('reads workspace from the agent when options.workspace is omitted', () => {
    const workspace = { id: 'from-agent' };
    expect(resolveAttachedWorkspace({ agent: { workspace } })).toBe(workspace);
  });
});

describe('resolveEvolutionWorkspaceLayout', () => {
  it('places learned skills under sibling .evolution/skills', () => {
    const layout = resolveEvolutionWorkspaceLayout('/tmp/proj/workspace');
    expect(layout.storeDirectory).toBe(path.join('/tmp/proj', '.evolution'));
    expect(layout.curatedSkillsDirectory).toBe(path.join('/tmp/proj/workspace', 'skills'));
    expect(layout.learnedSkillsDirectory).toBe(path.join('/tmp/proj', '.evolution', 'skills'));
    expect(layout.skills).toEqual(['skills', '../.evolution/skills']);
    expect(layout.allowedPaths).toEqual([layout.learnedSkillsDirectory]);
  });
});

describe('workspaceCanLoadLearnedSkills', () => {
  it('is true for resolveEvolutionWorkspaceLayout wiring', () => {
    const layout = resolveEvolutionWorkspaceLayout('/tmp/proj/workspace');
    expect(
      workspaceCanLoadLearnedSkills(
        {
          filesystem: {
            basePath: layout.basePath,
            allowedPaths: [...layout.allowedPaths],
          },
          skills: [...layout.skills],
        },
        layout.learnedSkillsDirectory,
      ),
    ).toBe(true);
  });

  it('is false when skills only lists the curated root', () => {
    const layout = resolveEvolutionWorkspaceLayout('/tmp/proj/workspace');
    expect(
      workspaceCanLoadLearnedSkills(
        {
          filesystem: { basePath: layout.basePath },
          skills: ['skills'],
        },
        layout.learnedSkillsDirectory,
      ),
    ).toBe(false);
  });

  it('is false when the learned root is listed without allowedPaths', () => {
    const layout = resolveEvolutionWorkspaceLayout('/tmp/proj/workspace');
    expect(
      workspaceCanLoadLearnedSkills(
        {
          filesystem: { basePath: layout.basePath },
          skills: [...layout.skills],
        },
        layout.learnedSkillsDirectory,
      ),
    ).toBe(false);
  });
});

describe('inspectWorkspace', () => {
  it('infers sibling .evolution store, curated skills, and learned publish dir', () => {
    const bind = inspectWorkspace({
      filesystem: { basePath: '/tmp/proj/workspace' },
      skills: ['skills', '../.evolution/skills'],
    });
    expect(bind.storeDirectory).toBe(path.join('/tmp/proj', '.evolution'));
    expect(bind.curatedSkillsDirectory).toBe(path.join('/tmp/proj/workspace', 'skills'));
    expect(bind.learnedSkillsDirectory).toBe(path.join('/tmp/proj', '.evolution', 'skills'));
    expect(bind.readOnly).toBe(false);
    expect(skillPublisherDirectory(bind)).toBe(bind.learnedSkillsDirectory);
  });

  it('reads LocalFilesystem-style prototype getters for basePath', () => {
    class FilesystemLike {
      constructor(private readonly storedPath: string) {}
      get basePath(): string {
        return this.storedPath;
      }
    }
    const bind = inspectWorkspace({
      filesystem: new FilesystemLike('/tmp/proj/workspace'),
      skills: ['skills'],
    });
    expect(bind.storeDirectory).toBe(path.join('/tmp/proj', '.evolution'));
    expect(bind.curatedSkillsDirectory).toBe(path.join('/tmp/proj/workspace', 'skills'));
    expect(bind.learnedSkillsDirectory).toBe(path.join('/tmp/proj', '.evolution', 'skills'));
  });

  it('reads skill paths from Workspace-style _config.skills, not the skills getter object', () => {
    const bind = inspectWorkspace({
      filesystem: { basePath: '/ws' },
      skills: { list: () => undefined },
      _config: { skills: ['agent-skills'] },
    });
    expect(bind.curatedSkillsDirectory).toBe(path.join('/ws', 'agent-skills'));
  });

  it('strips a leading slash on the skills path', () => {
    const bind = inspectWorkspace({
      filesystem: { basePath: '/ws' },
      skills: ['/skills'],
    });
    expect(bind.curatedSkillsDirectory).toBe(path.join('/ws', 'skills'));
  });

  it('does not invent a store directory without basePath', () => {
    const bind = inspectWorkspace({ skills: ['skills'] });
    expect(bind.storeDirectory).toBeUndefined();
    expect(bind.curatedSkillsDirectory).toBeUndefined();
    expect(bind.learnedSkillsDirectory).toBeUndefined();
  });

  it('treats LocalFilesystem.readOnly as skip-publish', () => {
    const bind = inspectWorkspace({
      filesystem: { basePath: '/ws', readOnly: true },
      skills: ['skills'],
    });
    expect(bind.readOnly).toBe(true);
    expect(skillPublisherDirectory(bind)).toBeUndefined();
  });

  it('publishes under .evolution/skills for a writable filesystem', () => {
    const bind = inspectWorkspace({
      filesystem: { basePath: '/ws' },
      skills: ['skills'],
    });
    expect(skillPublisherDirectory(bind)).toBe(
      path.join(path.dirname('/ws'), '.evolution', 'skills'),
    );
  });
});

describe('attachWorkspaceHooks', () => {
  it('composes afterToolCall and keeps requireApproval', async () => {
    const order: string[] = [];
    const workspace = {
      toolsConfig: {
        requireApproval: true,
        hooks: {
          afterToolCall: () => {
            order.push('existing');
          },
        },
      } as Record<string, unknown> | undefined,
      getToolsConfig() {
        return this.toolsConfig;
      },
      setToolsConfig(config?: unknown) {
        this.toolsConfig = config as Record<string, unknown>;
      },
    };
    expect(
      attachWorkspaceHooks(workspace, () => {
        order.push('evolution');
      }),
    ).toBe(true);
    expect(workspace.toolsConfig?.requireApproval).toBe(true);
    const hooks = workspace.toolsConfig?.hooks as { afterToolCall: () => Promise<void> };
    await hooks.afterToolCall();
    expect(order).toEqual(['existing', 'evolution']);
  });

  it('returns false when setToolsConfig is missing', () => {
    expect(attachWorkspaceHooks({}, () => undefined)).toBe(false);
  });
});
