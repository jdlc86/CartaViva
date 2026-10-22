// Candidate composition only: no pool, grants, HTTP routes or production writer.
// The caller must provide a transaction-scoped durable persistence adapter.
import {createCatalogVisitContextRepository} from './catalog-visit-context-repository.mjs';
import {createCatalogConfirmationReadRepository} from './catalog-confirmation-read-repository.mjs';

export function createCatalogConfirmationRepository({persist}={}){
 if(typeof persist!=='function')throw Error('invalid_catalog_confirmation_writer');
 const visit=createCatalogVisitContextRepository();
 const reads=createCatalogConfirmationReadRepository();
 return Object.freeze({
  lockContext:visit.lockContext,
  lookupIdempotency:reads.lookupIdempotency,
  lockCatalog:reads.lockCatalog,
  loadPreviousQuote:reads.loadPreviousQuote,
  async persist(query,args){
   if(typeof query!=='function'||!args||typeof args!=='object'||
      !args.context||args.context.authorized!==true||args.context.canOrder!==true)
    throw Error('invalid_catalog_confirmation_writer_scope');
   return persist(query,args);
  }
 });
}
