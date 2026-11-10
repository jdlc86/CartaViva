import test from 'node:test';
import assert from 'node:assert/strict';
import {assertDisplayedQuoteMatchesConfirmation as check} from '../apps/api/src/catalog-displayed-quote-binding.mjs';
const evidence={schemaVersion:1,itemId:'item-1',publishedRevision:1,quantity:2,
 selected:[{id:'extra-a'},{id:'extra-b'}],
 subtotalCents:1200,discountCents:200,totalCents:1000};
const previous={publishedRevision:1,subtotalCents:1200,discountCents:200,totalCents:1000,evidence};
test('same displayed selections pass even after a new catalog revision',()=>{
 assert.equal(check({previous,currentEvidence:{...evidence,publishedRevision:2,
  subtotalCents:1400,discountCents:0,totalCents:1400,
  selected:[{id:'extra-b'},{id:'extra-a'}]}}),true);
});
test('extra swaps, quantity changes and item changes fail closed',()=>{
 for(const change of [
  {selected:[{id:'extra-c'},{id:'extra-b'}]},
  {quantity:3},
  {itemId:'item-2'}
 ])assert.throws(()=>check({previous,currentEvidence:{...evidence,...change}}),
  /order_selection_changed|order_displayed_quote_invalid/);
});
test('forged previous totals, revision and malformed IDs fail closed',()=>{
 for(const change of [
  {totalCents:1001},{publishedRevision:2},
  {selected:[{id:'extra-a'},{id:'extra-a'}]},
  {selected:[{id:'bad id'}]},
  {quantity:0}
 ])assert.throws(()=>check({previous:{...previous,evidence:{...evidence,...change}},
  currentEvidence:evidence}),/order_displayed_quote_invalid/);
});
test('previous ledger amounts must match evidence exactly',()=>{
 assert.throws(()=>check({previous:{...previous,totalCents:999},
  currentEvidence:evidence}),/order_displayed_quote_invalid/);
});
