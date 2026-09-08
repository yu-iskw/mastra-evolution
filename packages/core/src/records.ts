export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function ownValue(target: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (!descriptor) {
    return undefined;
  }
  if (typeof descriptor.get === 'function') {
    return descriptor.get.call(target);
  }
  return descriptor.value;
}

export function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = ownValue(record, key);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function isNodeErrorCode(error: unknown, code: string): boolean {
  return isPlainObject(error) && error.code === code;
}
