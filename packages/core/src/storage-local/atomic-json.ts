/* eslint-disable security/detect-non-literal-fs-filename -- paths are constrained to the store directory */
import { readFile, rename, writeFile } from 'node:fs/promises';

const JSON_INDENT = 2;
const UTF8 = 'utf8';

const DATE_KEYS = new Set([
  'observedAt',
  'firstObservedAt',
  'lastObservedAt',
  'validFrom',
  'validUntil',
  'revalidateAfter',
  'createdAt',
  'updatedAt',
  'at',
]);

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, UTF8);
    return JSON.parse(raw, reviveDates) as T;
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return fallback;
    }
    throw error;
  }
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const tempPath = `${filePath}.${String(process.pid)}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, undefined, JSON_INDENT)}\n`, UTF8);
  await rename(tempPath, filePath);
}

function reviveDates(key: string, value: unknown): unknown {
  if (DATE_KEYS.has(key) && typeof value === 'string') {
    return new Date(value);
  }
  return value;
}

function isEnoent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
