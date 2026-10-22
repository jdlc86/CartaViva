// Candidate composition: deliberately no HTTP route, pool creation or SQL grants.
// The caller supplies a dedicated backend-only PostgreSQL pool and trusted secret.
import {createPostgresTransaction} from './postgres-transaction.mjs';
import {createCatalogConfirmationCoordinator} from './catalog-confirmation-coordinator.mjs';
import {createCatalogConfirmationRepository} from './catalog-confirmation-repository.mjs';
import {createCatalogOrderWriter} from './catalog-order-writer.mjs';

export function createCatalogConfirmationCandidate({pool,secretKey,clock=Date.now,newOrderId}={}){
 const writer=createCatalogOrderWriter(newOrderId===undefined?{}:{newOrderId});
 const repository=createCatalogConfirmationRepository({
  persist:(query,args)=>writer.persist(query,args)
 });
 return createCatalogConfirmationCoordinator({
  withTransaction:createPostgresTransaction({pool}),
  repository,secretKey,clock
 });
}
