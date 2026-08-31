export class VersionConflictError extends Error {
  readonly name = 'VersionConflictError';

  constructor(message = 'Conflicting evolution revision') {
    super(message);
  }
}

export class CapabilityError extends Error {
  readonly name = 'CapabilityError';

  constructor(message: string) {
    super(message);
  }
}
