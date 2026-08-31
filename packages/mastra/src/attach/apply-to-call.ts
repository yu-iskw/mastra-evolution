import { isPlainObject as isRecord, ownValue } from '@mastra-evolution/core';

/**
 * Merge generate/stream `hooks` by key.
 * When both caller and evolution provide a function for the same key, the **caller runs first**,
 * then evolution (so Evolution still observes the tool result unless the caller throws).
 */
export function mergeCallHooks(
  callerHooks: unknown,
  evolutionHooks: Record<string, unknown>,
): Record<string, unknown> {
  const caller = isRecord(callerHooks) ? callerHooks : {};
  const keys = new Set([...Object.keys(caller), ...Object.keys(evolutionHooks)]);
  const merged: Record<string, unknown> = { ...caller, ...evolutionHooks };
  for (const key of keys) {
    const callerHook = ownValue(caller, key);
    const evolutionHook = ownValue(evolutionHooks, key);
    if (isHook(callerHook) && isHook(evolutionHook)) {
      Object.defineProperty(merged, key, {
        configurable: true,
        enumerable: true,
        value: composeHooks(callerHook, evolutionHook),
        writable: true,
      });
    }
  }
  return merged;
}

function isHook(value: unknown): value is (context: unknown) => unknown {
  return typeof value === 'function';
}

function composeHooks(
  callerHook: (context: unknown) => unknown,
  evolutionHook: (context: unknown) => unknown,
): (context: unknown) => Promise<void> {
  return async (context: unknown) => {
    await callerHook(context);
    await evolutionHook(context);
  };
}

/**
 * Per-call `inputProcessors` / `outputProcessors` **replace** Agent defaults (Mastra semantics).
 * Evolution sets `inputProcessors` from `processors` only when the caller omitted `inputProcessors`.
 */
export function applyProcessors<T extends Record<string, unknown>>(
  callOptions: T,
  next: T,
  processors: unknown[],
): T {
  if (
    Object.prototype.hasOwnProperty.call(callOptions, 'inputProcessors') ||
    processors.length === 0
  ) {
    return next;
  }
  return { ...next, inputProcessors: [...processors] };
}
