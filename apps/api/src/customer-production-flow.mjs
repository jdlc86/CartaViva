import {createHash,randomUUID} from 'node:crypto';
import {hashCustomerSessionToken} from './customer-session.mjs';
import {buildCatalogLineEvidence} from './catalog-line-evidence.mjs';
import {assertDisplayedQuoteMatchesConfirmation} from './catalog-displayed-quote-binding.mjs';
import {issueCustomerBasketAcceptance,verifyCustomerBasketAcceptance} from './customer-basket-acceptance.mjs';

export const AUTHORIZE_VISIT_SQL=`SELECT table_id,session_id,visit_key,basket_id,expires_at
 FROM sabora.authorize_customer_visit_candidate($1::bytea,$2::uuid,$3::text,$4::text,$5::text,$6::timestamptz)`;
export const PREPARE_QUOTE_SQL=`SELECT customer_id,actor_id,session_id,customer_alias,customer_identifier,
 published_revision,published_snapshot,available
 FROM sabora.prepare_customer_quote_candidate($1::bytea,$2::uuid,$3::text,$4::text,$5::text,$6::uuid)`;
export const INSERT_QUOTE_SQL=`SELECT sabora.insert_customer_quote_candidate(
 $1::bytea,$2::uuid,$3::text,$4::text,$5::text,$6::uuid,$7::uuid,$8::bigint,$9::jsonb,$10::timestamptz
 ) AS quote_id`;
export const LOOKUP_ATTEMPT_SQL=`SELECT customer_id,actor_id,session_id,customer_alias,customer_identifier,
 request_fingerprint,order_id,"grouping"
 FROM sabora.lookup_customer_order_attempt_candidate($1::bytea,$2::uuid,$3::text,$4::text,$5::text,$6::text)`;
export const PREPARE_CONFIRMATION_SQL=`SELECT published_revision,published_snapshot,available,quote_evidence,quote_expires_at
 FROM sabora.prepare_customer_confirmation_line_candidate($1::bytea,$2::uuid,$3::text,$4::text,$5::text,$6::uuid,$7::uuid)`;
export const PERSIST_ORDER_SQL=`SELECT persisted_order_id,persisted_grouping,repeated
 FROM sabora.persist_customer_order_candidate(
 $1::bytea,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::bytea,$8::uuid,$9::uuid,$10::jsonb,$11::boolean
 )`;
export const READ_H6_PAYMENT_POLICY_SQL=`SELECT require_pay_as_ordered,payment_policy_version
 FROM sabora.read_customer_payment_policy_h6_candidate($1::bytea,$2::uuid,$3::text)`;
export const READ_H6_ROUND_SQL=`SELECT account_id,round_id,amount_cents,effective_payment_mode,
 round_state,payment_attempt_id,authorization_key
 FROM sabora.read_customer_round_h6_candidate($1::bytea,$2::uuid,$3::text,$4::uuid)`;
export const PERSIST_H6_ORDER_SQL=`SELECT persisted_order_id,persisted_grouping,repeated,
 account_id,round_id,amount_cents,effective_payment_mode,round_state,payment_attempt_id,authorization_key
 FROM sabora.confirm_customer_round_h6_candidate(
 $1::bytea,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::bytea,$8::uuid,$9::uuid,$10::jsonb,$11::boolean,$12::text
 )`;

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABLE_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY=/^[A-Za-z0-9_-]{16,128}$/;
const QR_TOKEN=/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const revision=value=>{
 const number=typeof value==='string'&&/^[1-9][0-9]*$/.test(value)?Number(value):value;
 return Number.isSafeInteger(number)&&number>0?number:null;
};
const strictObject=(value,allowed)=>plain(value)&&Reflect.ownKeys(value).every(key=>
 typeof key==='string'&&allowed.includes(key)&&Object.getOwnPropertyDescriptor(value,key)?.enumerable&&
 Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const canonical=value=>{
 if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
 if(plain(value))return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
 if(value===null||typeof value==='string'||typeof value==='boolean'||Number.isSafeInteger(value))
  return JSON.stringify(value);
 throw Error('invalid_customer_flow_input');
};
const digest=value=>createHash('sha256').update(canonical(value)).digest();
const equal=(a,b)=>canonical(a)===canonical(b);

function assertScope(input,{request=false,h6=false}={}){
 if(!strictObject(input,request?
  (h6?['tableId','qrToken','visitId','basketId','requestKey','lines','acceptanceToken','paymentMode']:
   ['tableId','qrToken','visitId','basketId','requestKey','lines','acceptanceToken']):
  ['tableId','qrToken','visitId','basketId','lines'])||
    !TABLE_ID.test(input.tableId)||typeof input.qrToken!=='string'||!QR_TOKEN.test(input.qrToken)||
    !KEY.test(input.visitId)||!KEY.test(input.basketId)||
    (request&&!KEY.test(input.requestKey))||
    !Array.isArray(input.lines)||input.lines.length<1||input.lines.length>50)
  throw Error('invalid_customer_flow_input');
 const seen=new Set();
 for(const line of input.lines){
  const allowed=request?['quoteId','itemId','selection','quantity']:['itemId','selection','quantity'];
  if(!strictObject(line,allowed)||!UUID.test(line.itemId)||
     (request&&!UUID.test(line.quoteId))||!plain(line.selection)||
     !Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>20||
     Buffer.byteLength(JSON.stringify(line.selection),'utf8')>8192||seen.has(line.itemId.toLowerCase()))
    throw Error('invalid_customer_flow_input');
  seen.add(line.itemId.toLowerCase());
 }
 if(request&&input.acceptanceToken!==undefined&&
    (typeof input.acceptanceToken!=='string'||input.acceptanceToken.length>256))
  throw Error('invalid_customer_flow_input');
 if(request&&h6&&input.paymentMode!==undefined&&input.paymentMode!==null&&
    !['pay_now','pay_at_end'].includes(input.paymentMode))throw Error('invalid_customer_flow_input');
}

const one=result=>{
 if(!result||!Array.isArray(result.rows)||result.rows.length!==1||!plain(result.rows[0]))
  throw Error('invalid_customer_flow_result');
 return result.rows[0];
};

export function createCustomerProductionFlow({withTransaction,secretKey,clock=Date.now,
 newId=randomUUID,visitTtlSeconds=4*60*60,quoteTtlSeconds=10*60,
 withH6Transaction=null}={}){
 if(typeof withTransaction!=='function'||typeof secretKey!=='string'||
    Buffer.byteLength(secretKey,'utf8')<32||typeof clock!=='function'||typeof newId!=='function'||
    !Number.isSafeInteger(visitTtlSeconds)||visitTtlSeconds<60||visitTtlSeconds>86400||
    !Number.isSafeInteger(quoteTtlSeconds)||quoteTtlSeconds<60||quoteTtlSeconds>1800||
    (withH6Transaction!==null&&typeof withH6Transaction!=='function'))
  throw Error('invalid_customer_production_flow');
 const h6=typeof withH6Transaction==='function';

 const authorizeVisit=async({customerSessionToken,tableId,qrToken}={})=>{
  const sessionHash=hashCustomerSessionToken(customerSessionToken);
  if(!sessionHash||!TABLE_ID.test(tableId??'')||typeof qrToken!=='string'||
     !QR_TOKEN.test(qrToken))throw Error('invalid_customer_visit_input');
  const visitId=newId(),basketId=newId(),now=clock();
  if(!UUID.test(visitId)||!UUID.test(basketId)||!Number.isSafeInteger(now)||now<0)
   throw Error('invalid_customer_production_flow');
  const expiresAt=new Date(now+visitTtlSeconds*1000);
  const row=await withTransaction(async query=>one(await query(AUTHORIZE_VISIT_SQL,
   [sessionHash,tableId,qrToken,visitId,basketId,expiresAt])));
  if(!UUID.test(row.table_id)||row.table_id.toLowerCase()!==tableId.toLowerCase()||
     !UUID.test(row.session_id)||row.visit_key!==visitId||row.basket_id!==basketId)
   throw Error('invalid_customer_flow_result');
  let paymentPolicy=null;
  if(h6){
   const policy=await withH6Transaction(async query=>one(await query(READ_H6_PAYMENT_POLICY_SQL,
    [sessionHash,tableId,visitId])));
   const version=revision(policy.payment_policy_version);
   if(typeof policy.require_pay_as_ordered!=='boolean'||version===null)
    throw Error('invalid_customer_flow_result');
   paymentPolicy=Object.freeze({requirePayAsOrdered:policy.require_pay_as_ordered,version});
  }
  return Object.freeze({tableId:row.table_id,visitId,basketId,expiresAt:expiresAt.toISOString(),
   ...(paymentPolicy?{paymentPolicy}:null)});
 };

 const quote=async({customerSessionToken,...raw}={})=>{
  assertScope(raw);
  const sessionHash=hashCustomerSessionToken(customerSessionToken);
  if(!sessionHash)throw Error('invalid_customer_flow_input');
  const now=clock();
  if(!Number.isSafeInteger(now)||now<0)throw Error('invalid_customer_production_flow');
  return withTransaction(async query=>{
   const quoted=[];
   for(const line of raw.lines){
    const prepared=one(await query(PREPARE_QUOTE_SQL,[sessionHash,raw.tableId,raw.qrToken,
     raw.visitId,raw.basketId,line.itemId]));
    const publishedRevision=revision(prepared.published_revision);
    if(prepared.available!==true||publishedRevision===null||!plain(prepared.published_snapshot))
     throw Error('customer_quote_unavailable');
    const evidence=buildCatalogLineEvidence({itemId:line.itemId,publishedRevision,
     snapshot:prepared.published_snapshot,selection:line.selection,quantity:line.quantity});
    const quoteId=newId(),expiresAt=new Date(now+quoteTtlSeconds*1000);
    if(!UUID.test(quoteId))throw Error('invalid_customer_production_flow');
    const inserted=one(await query(INSERT_QUOTE_SQL,[sessionHash,raw.tableId,raw.qrToken,
     raw.visitId,raw.basketId,quoteId,line.itemId,publishedRevision,evidence,expiresAt]));
    if(inserted.quote_id!==quoteId)throw Error('invalid_customer_flow_result');
    quoted.push(Object.freeze({quoteId,itemId:line.itemId,expiresAt:expiresAt.toISOString(),
     totalCents:evidence.totalCents,publishedRevision}));
   }
   return Object.freeze({lines:Object.freeze(quoted)});
  });
 };

 const confirm=async({customerSessionToken,...raw}={})=>{
  assertScope(raw,{request:true,h6});
  const sessionHash=hashCustomerSessionToken(customerSessionToken);
  if(!sessionHash)throw Error('invalid_customer_flow_input');
  const paymentMode=h6?(raw.paymentMode??null):undefined;
  const fingerprint=digest({schemaVersion:h6?2:1,tableId:raw.tableId,visitId:raw.visitId,
   basketId:raw.basketId,requestKey:raw.requestKey,lines:raw.lines,
   ...(h6?{paymentMode}:null)});
  const now=clock();
  if(!Number.isSafeInteger(now)||now<0)throw Error('invalid_customer_production_flow');
  const prepared=await withTransaction(async query=>{
   const attempt=one(await query(LOOKUP_ATTEMPT_SQL,[sessionHash,raw.tableId,raw.qrToken,
    raw.visitId,raw.basketId,raw.requestKey]));
   if(attempt.order_id!==null&&attempt.order_id!==undefined){
    if(!Buffer.isBuffer(attempt.request_fingerprint)||
       attempt.request_fingerprint.length!==fingerprint.length||
       !attempt.request_fingerprint.equals(fingerprint))throw Error('customer_order_idempotency_conflict');
    if(!UUID.test(attempt.order_id))throw Error('invalid_customer_flow_result');
    if(h6)return Object.freeze({kind:'h6_replay',orderId:attempt.order_id,grouping:attempt.grouping});
    return Object.freeze({kind:'complete',value:Object.freeze({status:'replayed',
     orderId:attempt.order_id,grouping:attempt.grouping})});
   }
   const current=[];
   let repriced=false;
   const changes=[];
   for(const line of raw.lines){
    const prepared=one(await query(PREPARE_CONFIRMATION_SQL,[sessionHash,raw.tableId,raw.qrToken,
     raw.visitId,raw.basketId,line.itemId,line.quoteId]));
    const publishedRevision=revision(prepared.published_revision);
    if(prepared.available!==true||publishedRevision===null||!plain(prepared.published_snapshot)||
       !plain(prepared.quote_evidence))throw Error('customer_order_confirmation_conflict');
    const evidence=buildCatalogLineEvidence({itemId:line.itemId,publishedRevision,
     snapshot:prepared.published_snapshot,selection:line.selection,quantity:line.quantity});
    assertDisplayedQuoteMatchesConfirmation({previous:{
     evidence:prepared.quote_evidence,
     publishedRevision:prepared.quote_evidence.publishedRevision,
     subtotalCents:prepared.quote_evidence.subtotalCents,
     discountCents:prepared.quote_evidence.discountCents,
     totalCents:prepared.quote_evidence.totalCents
    },currentEvidence:evidence});
    const changed=!equal(prepared.quote_evidence,evidence);
    repriced||=changed;
    if(changed)changes.push(Object.freeze({itemId:line.itemId,
     previousTotalCents:prepared.quote_evidence.totalCents,
     currentTotalCents:evidence.totalCents,
     previousPublishedRevision:prepared.quote_evidence.publishedRevision,
     currentPublishedRevision:evidence.publishedRevision}));
    current.push(Object.freeze({quoteId:line.quoteId,itemId:line.itemId,evidence}));
   }
   const acceptanceContext={schemaVersion:h6?2:1,tableId:raw.tableId,visitId:raw.visitId,
    basketId:raw.basketId,requestKey:raw.requestKey,lines:current,
    ...(h6?{paymentMode}:null)};
   if(repriced&&!verifyCustomerBasketAcceptance({token:raw.acceptanceToken,secretKey,
      context:acceptanceContext,nowMs:now})){
    const acceptance=issueCustomerBasketAcceptance({secretKey,context:acceptanceContext,nowMs:now});
    return Object.freeze({kind:'complete',value:Object.freeze({status:'acceptance_required',
     changes:Object.freeze(changes),acceptance})});
   }
   const orderId=newId(),batchId=newId();
   if(!UUID.test(orderId)||!UUID.test(batchId))throw Error('invalid_customer_production_flow');
   if(h6)return Object.freeze({kind:'h6_persist',orderId,batchId,current,repriced});
   const persisted=one(await query(PERSIST_ORDER_SQL,[sessionHash,raw.tableId,raw.qrToken,
    raw.visitId,raw.basketId,raw.requestKey,fingerprint,batchId,orderId,JSON.stringify(current),repriced]));
   if(!UUID.test(persisted.persisted_order_id)||typeof persisted.repeated!=='boolean')
    throw Error('invalid_customer_flow_result');
   return Object.freeze({kind:'complete',value:Object.freeze({status:persisted.repeated?'replayed':'confirmed',
    orderId:persisted.persisted_order_id,grouping:persisted.persisted_grouping})});
  });
  if(prepared.kind==='complete')return prepared.value;
  const h6Row=await withH6Transaction(async query=>one(await query(
   prepared.kind==='h6_replay'?READ_H6_ROUND_SQL:PERSIST_H6_ORDER_SQL,
   prepared.kind==='h6_replay'?
    [sessionHash,raw.tableId,raw.visitId,prepared.orderId]:
    [sessionHash,raw.tableId,raw.qrToken,raw.visitId,raw.basketId,raw.requestKey,
     fingerprint,prepared.batchId,prepared.orderId,JSON.stringify(prepared.current),prepared.repriced,paymentMode]
  )));
  const persistedOrderId=prepared.kind==='h6_replay'?prepared.orderId:h6Row.persisted_order_id;
  const amount=typeof h6Row.amount_cents==='string'&&/^[0-9]+$/.test(h6Row.amount_cents)?
   Number(h6Row.amount_cents):h6Row.amount_cents;
  if(!UUID.test(persistedOrderId)||!UUID.test(h6Row.account_id)||!UUID.test(h6Row.round_id)||
     !Number.isSafeInteger(amount)||amount<0||typeof h6Row.round_state!=='string'||
     (h6Row.payment_attempt_id!==null&&!UUID.test(h6Row.payment_attempt_id))||
     (h6Row.authorization_key!==null&&typeof h6Row.authorization_key!=='string'))
   throw Error('invalid_customer_flow_result');
  return Object.freeze({status:prepared.kind==='h6_replay'||h6Row.repeated?'replayed':'confirmed',
   orderId:persistedOrderId,grouping:prepared.grouping??h6Row.persisted_grouping,
   accountId:h6Row.account_id,roundId:h6Row.round_id,amountCents:amount,
   paymentMode:h6Row.effective_payment_mode,roundState:h6Row.round_state,
   paymentAttemptId:h6Row.payment_attempt_id,authorizationKey:h6Row.authorization_key});
 };

 return Object.freeze({authorizeVisit,quote,confirm});
}
