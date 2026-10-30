import Fastify from 'fastify';
import {pathToFileURL} from 'node:url';
import { createRestaurantStore } from './domain.mjs';
import {readApiRuntimeConfig} from './api-runtime-config.mjs';

export function createApiApp() {
  const app = Fastify({ logger: true, trustProxy: false });
  const store = createRestaurantStore();
  app.get('/health', async () => ({ status: 'ok', service: 'sabora-api' }));
  app.get('/ready', async () => ({ status: 'ready', service: 'sabora-api', mode: 'health-only' }));

  // Domain proof-of-concept only: no public table/order endpoints until authentication,
  // durable PostgreSQL transactions and restaurant-scoped authorization are in place.
  app.decorate('restaurantStore', store);
  return app;
}

export async function startApiServer({env = process.env} = {}) {
  const config = readApiRuntimeConfig(env);
  const app = createApiApp();
  await app.listen({ host: config.host, port: config.port });
  return Object.freeze({app, config, close: () => app.close()});
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
