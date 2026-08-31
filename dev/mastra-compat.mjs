#!/usr/bin/env node
/**
 * Try to add @mastra/core for compatibility CI. Skip (exit 0) if the 7-day
 * minimumReleaseAge gate, the registry, or the peer range blocks the install.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const spec = process.argv[2];

function packageSpec(value) {
  switch (value) {
    case 'min': {
      return '@mastra/core@1.63.2';
    }
    case 'latest': {
      return '@mastra/core@latest';
    }
    default: {
      return undefined;
    }
  }
}

function run(command, args) {
  return spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit' });
}

function skip(message) {
  console.log(message);
  process.exit(0);
}

const pkg = packageSpec(spec);
if (pkg === undefined) {
  console.error('usage: mastra-compat.mjs min|latest');
  process.exit(1);
}

if (run('pnpm', ['add', '-wD', pkg]).status !== 0) {
  skip(`skip: mastra not installable (${pkg})`);
}

let installed;
try {
  installed = createRequire(path.join(repoRoot, 'package.json'))(
    '@mastra/core/package.json',
  ).version;
} catch {
  skip('skip: @mastra/core did not resolve after install');
}

const [major, minor] = String(installed).split('.').map(Number);
if (major !== 1 || minor < 63) {
  skip(`skip: installed @mastra/core@${installed} is below peer >=1.63.0 <2`);
}

const build = run('pnpm', ['--filter', '@mastra-evolution/mastra...', 'build']);
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}
const test = run('pnpm', ['--filter', '@mastra-evolution/mastra', 'test']);
process.exit(test.status ?? 1);
