import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  attachWorkspaceHooks,
  inspectWorkspace,
  resolveAttachedWorkspace,
  skillPublisherDirectory,
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

describe('inspectWorkspace', () => {
  it('infers sibling .evolution store and skills dir from LocalFilesystem-like basePath', () => {
    const bind = inspectWorkspace({
      filesystem: { basePath: '/tmp/proj/workspace' },
      skills: ['skills'],
    });
    expect(bind.storeDirectory).toBe(path.join('/tmp/proj', '.evolution'));
    expect(bind.skillsDirectory).toBe(path.join('/tmp/proj/workspace', 'skills'));
    expect(bind.readOnly).toBe(false);
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
    expect(bind.skillsDirectory).toBe(path.join('/tmp/proj/workspace', 'skills'));
  });

  it('strips a leading slash on the skills path', () => {
    const bind = inspectWorkspace({
      filesystem: { basePath: '/ws' },
      skills: ['/skills'],
    });
    expect(bind.skillsDirectory).toBe(path.join('/ws', 'skills'));
  });

  it('does not invent a store directory without basePath', () => {
    const bind = inspectWorkspace({ skills: ['skills'] });
    expect(bind.storeDirectory).toBeUndefined();
    expect(bind.skillsDirectory).toBeUndefined();
  });

  it('treats LocalFilesystem.readOnly as skip-publish', () => {
    const bind = inspectWorkspace({
      filesystem: { basePath: '/ws', readOnly: true },
      skills: ['skills'],
    });
    expect(bind.readOnly).toBe(true);
    expect(skillPublisherDirectory(bind)).toBeUndefined();
  });

  it('returns the skills directory for a writable filesystem', () => {
    const bind = inspectWorkspace({
      filesystem: { basePath: '/ws' },
      skills: ['skills'],
    });
    expect(skillPublisherDirectory(bind)).toBe(path.join('/ws', 'skills'));
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
