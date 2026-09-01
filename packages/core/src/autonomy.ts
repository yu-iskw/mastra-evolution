export type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type AutonomyName =
  'observe' | 'learn' | 'recommend' | 'validate' | 'auto-promote-bounded' | 'autonomous';

export const LEARN_AUTONOMY = 'learn' as const satisfies AutonomyName;
export const ENTERPRISE_SKILL_AUTONOMY = 'validate' as const satisfies AutonomyName;
export const HOBBY_SKILL_AUTONOMY = 'auto-promote-bounded' as const satisfies AutonomyName;

export function autonomyLevel(name: AutonomyName): AutonomyLevel {
  switch (name) {
    case 'observe': {
      return 0;
    }
    case 'learn': {
      return 1;
    }
    case 'recommend': {
      return 2;
    }
    case 'validate': {
      return 3;
    }
    case 'auto-promote-bounded': {
      return 4;
    }
    case 'autonomous': {
      return 5;
    }
    default: {
      const exhaustive: never = name;
      return exhaustive;
    }
  }
}

export function parseAutonomy(value: AutonomyName | AutonomyLevel): AutonomyLevel {
  return typeof value === 'number' ? value : autonomyLevel(value);
}
