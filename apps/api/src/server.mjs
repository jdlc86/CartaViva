import Fastify from 'fastify';
import { createRestaurantStore } from './domain.mjs';

const app = Fastify({ logger: true, trustProxy: false });
const store = createRestaurantStore();
app.get('/health', async () => ({ status: 'ok', service: 'sabora-api' }));
app.get('/ready', async () => ({ status: 'ready', service: 'sabora-api' }));

// Domain proof-of-concept only: no public table/order endpoints until authentication,
// durable PostgreSQL transactions and restaurant-scoped authorization are in place.
app.decorate('restaurantStore', store);

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4100);
await app.listen({ host, port });
