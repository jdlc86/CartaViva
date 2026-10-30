import Fastify from 'fastify';
import {registerVerifiedRestrictedOrderOperationsFromPools} from './order-operations-composition.mjs';

// Candidate-only application factory. Deliberately not imported by server.mjs.
// The caller owns both SQL pools and all signing/authentication dependencies.
// No listener is started and no environment or production resource is read.
export async function createVerifiedOrderOperationsCandidate(options = {}) {
  const app = Fastify({logger: false, trustProxy: false});
  try {
    await registerVerifiedRestrictedOrderOperationsFromPools(app, options);
    await app.ready();
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
