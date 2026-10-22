// Offline-only composition: transaction coordinator + locked catalog reads +
// order and economic ledger writer. No pool, HTTP, runtime grant or deployment.
import {createCatalogConfirmationCoordinator} from './catalog-confirmation-coordinator.mjs';
import {createCatalogConfirmationRepository} from './catalog-confirmation-repository.mjs';
import {createCatalogOrderWriter} from './catalog-order-writer.mjs';

export function createCatalogOrderConfirmationCandidate({withTransaction,secretKey,clock,newOrderId}={}){
 const writer=createCatalogOrderWriter({newOrderId});
 const repository=createCatalogConfirmationRepository({
  persist:(query,args)=>writer.persist(query,args)
 });
 return createCatalogConfirmationCoordinator({
  withTransaction,repository,secretKey,clock
 });
}
