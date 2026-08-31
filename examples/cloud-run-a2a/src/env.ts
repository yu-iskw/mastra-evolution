const DEFAULT_PORT = 8080;
const DEFAULT_A2A_PATH = '/a2a';

export function listenPort(): number {
  const raw = readEnv('PORT');
  const parsed = raw === undefined ? DEFAULT_PORT : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

export function hasDatabaseUrl(): boolean {
  return Boolean(readEnv('DATABASE_URL'));
}

export function workspaceDir(): string {
  return readEnv('WORKSPACE_DIR') ?? '.workspace';
}

export function artifactBucket(): string {
  return readEnv('ARTIFACT_BUCKET') ?? '(unset)';
}

export function a2aBaseUrl(): string {
  return readEnv('MASTRA_AGENTS_BASE_URL') ?? '(unset)';
}

export function a2aPath(): string {
  return readEnv('MASTRA_A2A_PATH') ?? DEFAULT_A2A_PATH;
}

function readEnv(name: string): string | undefined {
  return processEnv()?.[name];
}

function processEnv(): Record<string, string | undefined> | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
}
