// Offline-only composition of the existing confirmation coordinator and the
// candidate order+ledger writer. No pool, HTTP route, role grant or deployment.
import {createCatalogConfirmationRepository} from './catalog-confirmation-repository.mjs';
import {createCatalogOrderWriter} from './catalog-order-writer.mjs';

export function createCatalogOrderConfirmationCandidate({withTransaction,secretKey,clock,newOrderId}={}){
 const writer=createCatalogOrderWriter({newOrderId});
 return createCatalogConfirmationRepository({persist:(query,args)=>writer.persist(query,args)});
}
