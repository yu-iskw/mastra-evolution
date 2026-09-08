import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runEvolutionStoreContract } from '../testing';

import { LocalEvolutionStore } from './index';

const directories: string[] = [];

async function uniqueTempDir(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'storage-local-'));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  const pending = directories.splice(0);
  await Promise.all(pending.map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('@mastra-evolution/core LocalEvolutionStore', () => {
  it('satisfies the EvolutionStore contract', async () => {
    await expect(
      runEvolutionStoreContract(async () => {
        return new LocalEvolutionStore({ directory: await uniqueTempDir() });
      }),
    ).resolves.toBeUndefined();
  });

  it('re-exports LocalEvolutionStore', () => {
    expect(LocalEvolutionStore.name).toBe('LocalEvolutionStore');
  });
});
