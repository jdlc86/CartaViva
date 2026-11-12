import Fastify from 'fastify';
import {pathToFileURL} from 'node:url';
import { createRestaurantStore } from './domain.mjs';
import {readApiRuntimeConfig} from './api-runtime-config.mjs';
import {createSaboraObservability} from './operational-observability.mjs';

export function createApiApp({observability = createSaboraObservability()} = {}) {
  // Built-in Fastify request logging includes untrusted URLs and IPs; use an
  // allowlisted diagnostics sink instead. No operational routes are unlocked.
  const app = Fastify({ logger: false, trustProxy: false });
  app.addHook('onRequest', observability.onRequest);
  app.addHook('onResponse', observability.onResponse);
  app.decorate('saboraObservability', observability);
  const store = createRestaurantStore();
  app.get('/health', async () => ({ status: 'ok', service: 'sabora-api' }));
  app.get('/ready', async (_request, reply) => reply.code(503).send({ status: 'unavailable', service: 'sabora-api', mode: 'health-only' }));

  // Domain proof-of-concept only: no public table/order endpoints until authentication,
  // durable PostgreSQL transactions and restaurant-scoped authorization are in place.
  app.decorate('restaurantStore', store);
  return app;
}

export async function startApiServer({env = process.env, observability} = {}) {
  const config = readApiRuntimeConfig(env);
  const app = createApiApp({observability});
  await app.listen({ host: config.host, port: config.port });
  app.saboraObservability.lifecycle('started_health_only');
  return Object.freeze({app, config, close: async () => {
    await app.close();
    app.saboraObservability.lifecycle('stopped_health_only');
  }});
}

const main = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (main) {
  try {
    const runtime = await startApiServer();
    const close = async () => {
      try { await runtime.close(); }
      finally { process.exitCode = 0; }
    };
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
  } catch {
    // Never serialize configuration, environment values or driver errors.
    process.stderr.write('sabora_api_startup_failed\n');
    process.exitCode = 1;
  }
}
