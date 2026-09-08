import { serve } from '@hono/node-server';
import { HonoBindings, HonoVariables, MastraServer } from '@mastra/hono';
import { CLOUD_STORAGE_FUSE_WARNING } from '@mastra-evolution/adapters/presets';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { AGENT_ID, createCloudRunStack } from './create-cloud-run-stack';
import { a2aBaseUrl, a2aPath, artifactBucket, hasDatabaseUrl, listenPort } from './env';

type AppEnv = { Bindings: HonoBindings; Variables: HonoVariables };

/**
 * Hono HTTP / A2A server. Mastra registers agent cards and `/api/a2a/:agentId`.
 * Evolution stays on the Agent/Workspace, not the transport.
 *
 * Skip listen when DATABASE_URL is unset so default `pnpm start` still exits.
 */
async function main(): Promise<void> {
  const stack = createCloudRunStack();
  if (!hasDatabaseUrl()) {
    console.log('skip: DATABASE_URL is not set; not listening');
    console.log(CLOUD_STORAGE_FUSE_WARNING);
    return;
  }

  const app = new Hono<AppEnv>();
  app.use('*', cors());
  app.get('/health', (context) =>
    context.json({
      status: 'ok',
      agentId: AGENT_ID,
      artifactBucket: artifactBucket(),
      workspaceDir: stack.workspaceDir,
      applyToCall: typeof stack.evolution.applyToCall,
    }),
  );

  const server = new MastraServer({
    app,
    mastra: stack.mastra,
    openapiPath: '/openapi.json',
  });
  await server.init();

  const port = listenPort();
  serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
    const origin = `http://0.0.0.0:${info.port}`;
    console.log(`cloud-run-a2a: ${origin} agent=${AGENT_ID} bucket=${artifactBucket()}`);
    console.log(`health:     GET  ${origin}/health`);
    console.log(`agents:     GET  ${origin}/api/agents`);
    console.log(`generate:   POST ${origin}/api/agents/${AGENT_ID}/generate`);
    console.log(`a2a card:   GET  ${origin}/api/.well-known/${AGENT_ID}/agent-card.json`);
    console.log(`a2a exec:   POST ${origin}/api/a2a/${AGENT_ID}`);
    console.log(`openapi:    GET  ${origin}/openapi.json`);
    console.log(`A2A env:    base=${a2aBaseUrl()} path=${a2aPath()}`);
    console.log(CLOUD_STORAGE_FUSE_WARNING);
  });
}

void main().catch((error: unknown) => {
  console.error(error);
  const proc = (globalThis as { process?: { exitCode?: number } }).process;
  if (proc) {
    proc.exitCode = 1;
  }
});
