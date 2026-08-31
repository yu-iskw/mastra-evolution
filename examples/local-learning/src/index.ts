import { serve } from '@hono/node-server';
import { HonoBindings, HonoVariables, MastraServer } from '@mastra/hono';
import { Hono } from 'hono';

import { AGENT_ID, createLocalLearning, evolutionSnapshot } from './create-local-learning';
import { hasModelApiKey, listenPort } from './env';

/**
 * Hono HTTP server for the analytics agent. Mastra routes come from `@mastra/hono`
 * (`MastraServer.init()`). Evolution stays on the Agent/Workspace, not the transport.
 *
 * @see https://mastra.ai/docs/server/server-adapters
 */
async function main(): Promise<void> {
  const stack = await createLocalLearning();
  const app = new Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>();
  app.get('/health', (c) => c.json({ status: 'ok', agentId: AGENT_ID }));

  const server = new MastraServer({
    app,
    mastra: stack.mastra,
    openapiPath: '/openapi.json',
  });
  await server.init();

  app.get('/evolution', async (c) => c.json(await evolutionSnapshot(stack)));

  const port = listenPort();
  if (!hasModelApiKey()) {
    console.log(
      'warn: set GEMINI_API_KEY (or GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY) for generate',
    );
  }
  console.log(
    `local-learning: ${stack.model} workspace=${stack.workspaceDir} store=${stack.storeDir}`,
  );
  const httpServer = serve({ fetch: app.fetch, port }, () => {
    console.log(`listening on http://localhost:${port}`);
    console.log('  GET  /health');
    console.log('  GET  /evolution');
    console.log('  GET  /api/openapi.json');
    console.log('  GET  /api/agents');
    console.log(`  POST /api/agents/${AGENT_ID}/generate`);
  });

  const shutdown = (): void => {
    httpServer.close();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main().catch((error: unknown) => {
  console.error(error);
  const proc = (globalThis as { process?: { exitCode?: number } }).process;
  if (proc) {
    proc.exitCode = 1;
  }
});
