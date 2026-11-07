// One integrated business scenario, executed INSIDE the existing disposable
// H6 PG17/Fastify/JWT/HMAC/Chromium gate. No additional database or mock server.
import assert from 'node:assert/strict';

export async function runCashTipsIntegralScenario({payerRepo,tpA,tpB,b,bLater,
 tableId,payerUrl,customerPost,staffPost,admin,customerPool,operationsPool}){
 const options=await payerRepo.debts({customerSessionToken:tpB.token,
  tableId,visitId:b.v.visitId});
 assert.ok(options.items.some(x=>x.roundId===bLater.order.roundId),
  'payer must be able to select OWN pay-at-end consumption');
 const request={tableId,visitId:b.v.visitId,consent:true,tipOption:'percent5',
  rounds:[{roundId:bLater.order.roundId,amountCents:2400}],
  requestKey:'m4_cash_tip_integral_0001'};
 const invalid=await customerPost(tpB.token,payerUrl+'/intents',
  {...request,tipOption:'percent25',requestKey:'m4_invalid_tip_choice_0001'});
 assert.equal(invalid.statusCode,400,invalid.body);
 const created=await customerPost(tpB.token,payerUrl+'/intents',request);
 assert.equal(created.statusCode,201,created.body);
 const intent=created.json();
 assert.equal(intent.consumptionCents,2400);
 assert.equal(intent.tipCents,120,'5% of 24.00 EUR = 1.20 EUR');
 assert.equal(intent.totalCents,2520);
 const replay=await customerPost(tpB.token,payerUrl+'/intents',request);
 assert.equal(replay.statusCode,200,replay.body);
 assert.equal(replay.json().intentId,intent.intentId);
 const switched=await customerPost(tpB.token,payerUrl+'/intents',
  {...request,tipOption:'fixed500'});
 assert.equal(switched.statusCode,409,'one idempotent request cannot change choice');
 const payRoute='/api/v1/operations/third-party/cash/'+intent.intentId+'/settle';
 const received=await Promise.all([
  staffPost(payRoute,{correlationId:'m4_tip_cash_confirm_once_0001',received:true}),
  staffPost(payRoute,{correlationId:'m4_tip_cash_confirm_once_0001',received:true})
 ]);
 assert.deepEqual(received.map(x=>x.statusCode),[201,201]);
 assert.deepEqual(received.map(x=>x.json().repeated).sort(),[false,true]);
 assert.ok(received.every(x=>x.json().tipCents===120&&
  x.json().consumptionCents===2400&&x.json().totalCents===2520));
 const collection=(await admin.query('SELECT id,payer_customer_id,tip_cents,consumption_cents '+
  'FROM sabora.cash_tip_collections_candidate WHERE intent_id=$1',[intent.intentId])).rows;
 assert.equal(collection.length,1);
 assert.equal(collection[0].payer_customer_id,tpB.profile.id);
 assert.equal(collection[0].tip_cents,'120');
 assert.equal(collection[0].consumption_cents,'2400');
 const id=collection[0].id;
 assert.equal((await admin.query('SELECT count(*)::integer AS n '+
  'FROM sabora.cash_tip_refunds_candidate WHERE collection_id=$1',[id])).rows[0].n,0,
  'consumption cancellation must NEVER refund voluntary tips automatically');
 assert.equal((await admin.query('SELECT outstanding_cents '+
  'FROM sabora.customer_accounts WHERE id=$1',[b.order.accountId]))
  .rows[0].outstanding_cents,'0',
  'tip is NOT added to beneficiary consumption debt');
 assert.ok(!(await payerRepo.tips({customerSessionToken:tpA.token})).items
  .some(x=>x.collectionId===id),
  'another diner cannot view the original payer gratuity');
 await assert.rejects(payerRepo.tipRefundProof({customerSessionToken:tpA.token,
  collectionId:id}),/tip_payer_forbidden/,
  'another diner cannot issue refund proof for tip owner');
 const owned=await payerRepo.tips({customerSessionToken:tpB.token});
 assert.ok(owned.items.some(x=>x.collectionId===id&&x.tipCents===120));
 const proofResponse=await customerPost(tpB.token,payerUrl+'/tips/'+id+'/proof',{});
 assert.equal(proofResponse.statusCode,201,proofResponse.body);
 const proof=proofResponse.json();
 assert.equal(proof.tipCents,120);
 assert.equal(proof.collectionId,id);
 const refundPath='/api/v1/operations/tips/'+id+'/refund';
 const invalidProof=await staffPost(refundPath,{claimId:proof.claimId,
  proof:'0'.repeat(64),correlationId:'m4_tip_invalid_proof_0001',handedOver:true});
 assert.equal(invalidProof.statusCode,403,invalidProof.body);
 const authorized={claimId:proof.claimId,proof:proof.proof,
  correlationId:'m4_admin_tip_refund_once_0001',handedOver:true};
 const refunds=await Promise.all([
  staffPost(refundPath,authorized),staffPost(refundPath,authorized)]);
 assert.deepEqual(refunds.map(x=>x.statusCode),[201,201]);
 assert.deepEqual(refunds.map(x=>x.json().repeated).sort(),[false,true]);
 assert.ok(refunds.every(x=>x.json().state==='refunded'&&x.json().tipCents===120));
 const ledger=(await admin.query('SELECT original_payer_customer_id,amount_cents '+
  'FROM sabora.cash_tip_refunds_candidate WHERE collection_id=$1',[id])).rows;
 assert.equal(ledger.length,1);
 assert.equal(ledger[0].original_payer_customer_id,tpB.profile.id);
 assert.equal(ledger[0].amount_cents,'120');
 assert.ok(!(await payerRepo.tips({customerSessionToken:tpB.token})).items
  .some(x=>x.collectionId===id));
 assert.equal((await admin.query('SELECT outstanding_cents '+
  'FROM sabora.customer_accounts WHERE id=$1',[b.order.accountId]))
  .rows[0].outstanding_cents,'0',
  'tip refund never changes balance of consumption');
 await assert.rejects(customerPool.query('SELECT * FROM sabora.cash_tip_collections_candidate'),
  /permission denied/);
 await assert.rejects(operationsPool.query('SELECT * FROM sabora.cash_tip_refunds_candidate'),
  /permission denied/);
}
