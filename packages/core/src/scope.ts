export type EvolutionScope =
  | { type: 'thread'; threadId: string }
  | { type: 'resource'; resourceId: string }
  | { type: 'team'; teamId: string }
  | { type: 'agent'; agentId: string }
  | { type: 'organization'; organizationId: string };

export function scopeKey(scope: EvolutionScope): string {
  switch (scope.type) {
    case 'thread': {
      return `thread:${scope.threadId}`;
    }
    case 'resource': {
      return `resource:${scope.resourceId}`;
    }
    case 'team': {
      return `team:${scope.teamId}`;
    }
    case 'agent': {
      return `agent:${scope.agentId}`;
    }
    case 'organization': {
      return `organization:${scope.organizationId}`;
    }
    default: {
      const exhaustive: never = scope;
      return exhaustive;
    }
  }
}

export function scopesEqual(left: EvolutionScope, right: EvolutionScope): boolean {
  return scopeKey(left) === scopeKey(right);
}

export function isOrganizationScope(scope: EvolutionScope): boolean {
  return scope.type === 'organization';
}
