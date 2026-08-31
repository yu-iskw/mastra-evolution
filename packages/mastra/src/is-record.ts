import { isPlainObject, ownValue, stringField } from '@mastra-evolution/core';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}

export { ownValue, stringField };
