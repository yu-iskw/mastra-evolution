const DEFAULT_PORT = 4111;

export function applyGeminiApiKey(): void {
  const gemini = readEnv('GEMINI_API_KEY');
  if (gemini === undefined) {
    return;
  }
  const proc = processEnv();
  if (proc === undefined) {
    return;
  }
  proc.GOOGLE_GENERATIVE_AI_API_KEY ??= gemini;
  proc.GOOGLE_API_KEY ??= gemini;
}

export function hasModelApiKey(): boolean {
  return Boolean(
    readEnv('GEMINI_API_KEY') ??
    readEnv('GOOGLE_API_KEY') ??
    readEnv('GOOGLE_GENERATIVE_AI_API_KEY'),
  );
}

export function listenPort(): number {
  const raw = readEnv('PORT');
  const parsed = raw === undefined ? DEFAULT_PORT : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

export function readEnv(name: string): string | undefined {
  return processEnv()?.[name];
}

function processEnv(): Record<string, string | undefined> | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
}
