// Candidate-only composition: authorization, publication lock and quote insert
// share the caller's single transaction query capability. No pool or grants.
import {createCatalogVisitContextRepository} from './catalog-visit-context-repository.mjs';
import {createCatalogConfirmationReadRepository} from './catalog-confirmation-read-repository.mjs';
import {createCatalogQuoteInsertRepository} from './catalog-quote-insert-repository.mjs';

export function createCatalogQuoteRepository(){
 const visit=createCatalogVisitContextRepository();
 const reads=createCatalogConfirmationReadRepository();
 const quotes=createCatalogQuoteInsertRepository();
 return Object.freeze({
  lockContext:visit.lockContext,
  lockCatalog:reads.lockCatalog,
  insertDisplayedQuote:quotes.insertDisplayedQuote
 });
}
