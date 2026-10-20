import Fastify from 'fastify';
const app = Fastify({logger: true, trustProxy: false});
app.get('/health', async () => ({status:'ok',service:'sabora-api'}));
app.get('/ready', async () => ({status:'ready',service:'sabora-api'}));
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4100);
await app.listen({host,port});
