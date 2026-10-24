// Offline-only composition: transaction coordinator + locked catalog reads +
// order and economic ledger writer. No pool creation, HTTP, runtime grants or deployment.
import {createCatalogConfirmationCoordinator} from './catalog-confirmation-coordinator.mjs';
import {createCatalogConfirmationRepository} from './catalog-confirmation-repository.mjs';
import {createCatalogOrderWriter} from './catalog-order-writer.mjs';
import {createPostgresTransaction} from './postgres-transaction.mjs';

export function createCatalogOrderConfirmationCandidate({withTransaction,secretKey,clock=Date.now,newOrderId}={}){
 const writer=createCatalogOrderWriter(newOrderId===undefined?{}:{newOrderId});
 const repository=createCatalogConfirmationRepository({
  persist:(query,args)=>writer.persist(query,args)
 });
 return createCatalogConfirmationCoordinator({
  withTransaction,repository,secretKey,clock
 });
}

// An explicit, injected transaction pool boundary for isolated integration
// tests. Never construct or expose a runtime pool from this candidate module.
export function createCatalogOrderConfirmationPoolCandidate({pool,secretKey,clock,newOrderId}={}){
 const withTransaction=createPostgresTransaction({pool});
 return createCatalogOrderConfirmationCandidate({
  withTransaction,secretKey,clock,newOrderId
 });
}
