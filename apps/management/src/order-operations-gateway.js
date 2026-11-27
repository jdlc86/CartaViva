import {normalizeOrderBoard, normalizeOrderHistory, normalizeOrderTransition} from './order-operations-model.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORRELATION = /^[A-Za-z0-9_-]{8,128}$/;
const TARGETS = new Set(['preparing', 'ready', 'picked_up']);
const H6_EVENT=/^sabora\.[a-z0-9_.]{1,120}$/;
const PICKUP_DISPLAY=/^.{2,4}-[0-9A-Z]{3}$/u;
const PICKUP_KEYS=new Set(['version','outcome','reason','orderId','lineId','pickupTaskId','state',
  'taskVersion','claimedDisplayId','claimedAt','updatedAt','repeated']);

export class OrderOperationsGatewayError extends Error {
  constructor(code, details = null) { super(code); this.name = 'OrderOperationsGatewayError'; this.code = code; this.details = details; }
}

function normalizePickupMutation(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||
     typeof value.outcome!=='string'||Reflect.ownKeys(value).some(key=>
       typeof key!=='string'||!PICKUP_KEYS.has(key))||
     (Object.hasOwn(value,'claimedDisplayId')&&value.claimedDisplayId!==null&&
       !PICKUP_DISPLAY.test(value.claimedDisplayId)))throw new OrderOperationsGatewayError('invalid_response');
  const result={};for(const key of PICKUP_KEYS)if(Object.hasOwn(value,key))result[key]=value[key];
  return Object.freeze(result);
}

async function json(response) {
  const contentType = response?.headers?.get?.('content-type');
  if (!response || typeof response.status !== 'number' || typeof contentType !== 'string' ||
      !/^application\/json(?:;|$)/i.test(contentType)) throw new OrderOperationsGatewayError('invalid_response');
  let body;
  try { body = await response.json(); }
  catch { throw new OrderOperationsGatewayError('invalid_response'); }
  if (!response.ok) {
    const known = new Set(['unauthorized', 'forbidden', 'invalid_order_operation',
      'order_operation_not_found', 'order_operation_conflict', 'order_operations_unavailable',
      'invalid_h6_operation','h6_operation_not_found','h6_operation_conflict','h6_operations_unavailable',
      'pickup_claim_conflict']);
    const code = body && typeof body === 'object' && !Array.isArray(body) && known.has(body.error)
      ? body.error : 'invalid_response';
    throw new OrderOperationsGatewayError(code, code === 'pickup_claim_conflict'
      ? normalizePickupMutation(body.pickup) : null);
  }
  return body;
}

async function mutation(send,path,body) {
  const response=await send(path,{method:'POST',cache:'no-store',redirect:'error',credentials:'omit',
    headers:{'Accept':'application/json','Content-Type':'application/json'},body:JSON.stringify(body)});
  const value=await json(response);
  if(!value||typeof value!=='object'||Array.isArray(value))throw new OrderOperationsGatewayError('invalid_response');
  return Object.freeze({...value});
}

async function pickupMutation(send,path,{lineId,expectedVersion,correlationId}={}) {
  if(!UUID.test(lineId)||!Number.isSafeInteger(expectedVersion)||expectedVersion<1||
     !CORRELATION.test(correlationId))throw Error('invalid_pickup_operation');
  return normalizePickupMutation(await mutation(send,
   `/api/v1/operations/order-lines/${lineId}/${path}`,{expectedVersion,correlationId}));
}

function createEventSubscription(send,{onEvent,onResync,onUnavailable,onReconnected},reconnectDelayMs) {
  if(typeof onEvent!=='function'||typeof onResync!=='function'||typeof onUnavailable!=='function')
    throw Error('invalid_order_event_subscription');
  const abort=new AbortController();let cursor=0,timer=null,activeReader=null,reconnecting=false;
  const run=async()=>{
    try{
      const response=await send('/api/v1/operations/events',{method:'GET',cache:'no-store',redirect:'error',
       credentials:'omit',signal:abort.signal,headers:{Accept:'text/event-stream',...(cursor?{'Last-Event-ID':String(cursor)}:{})}});
      if(!response.ok||!String(response.headers.get('content-type')??'').toLowerCase().startsWith('text/event-stream')||!response.body)
       throw Error('invalid_event_stream');
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',pendingCR=false;
      activeReader=reader;
      if(abort.signal.aborted){void reader.cancel().catch(()=>{});return;}
      if(reconnecting){reconnecting=false;onReconnected?.();}
      while(!abort.signal.aborted){
       const part=await reader.read();if(part.done)break;const chunk=decoder.decode(part.value,{stream:true});
       // Normalize CRLF even when the CR and LF arrive in separate chunks.
       // Preserve the pending CR until the next read rather than retaining it
       // as a stray line terminator in the frame.
       const normalized=(pendingCR?'\r':'')+chunk;
       pendingCR=normalized.endsWith('\r');
       buffer+=normalized.slice(0,pendingCR?-1:undefined).replaceAll('\r\n','\n');
       // A stalled or malicious stream must not grow browser memory without bound.
       // Treat oversized frames as a transport failure and resynchronize on reconnect.
       let boundary;
       while((boundary=buffer.indexOf('\n\n'))>=0){
        if(boundary>65536)throw Error('order_event_frame_too_large');
        const block=buffer.slice(0,boundary).replaceAll('\r','');buffer=buffer.slice(boundary+2);
        if(!block||block.startsWith(':'))continue;
        let eventType='message',eventId='',data='';
        for(const line of block.split('\n')){
         if(line.startsWith('event:'))eventType=line.slice(6).trim();
         else if(line.startsWith('id:'))eventId=line.slice(3).trim();
         else if(line.startsWith('data:'))data+=line.slice(5).trim();
        }
        if(eventType==='resync-required'){onResync();continue;}
        if(eventType==='access-revoked'){onUnavailable('access-revoked');abort.abort();return;}
        const id=Number(eventId);let value;
        try{value=JSON.parse(data);}catch{continue;}
        if(!Number.isSafeInteger(id)||id<=cursor||!H6_EVENT.test(eventType)||!value||
           typeof value!=='object'||Array.isArray(value)||!value.payload||typeof value.payload!=='object'||
           Array.isArray(value.payload)||typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt)))continue;
        cursor=id;onEvent(Object.freeze({id,type:eventType,payload:Object.freeze({...value.payload}),createdAt:value.createdAt}));
       }
       // Enforce the limit on the unframed remainder, not on a batch of
       // individually valid events delivered in a single network read.
       if(buffer.length>65536)throw Error('order_event_frame_too_large');
      }
      if(!abort.signal.aborted)throw Error('event_stream_ended');
    }catch{
      if(abort.signal.aborted)return;reconnecting=true;onUnavailable('transport');timer=setTimeout(run,reconnectDelayMs);
    }finally{
      if(activeReader){const reader=activeReader;activeReader=null;
        void reader.cancel().catch(()=>{});}
    }
  };
  void run();
  return()=>{abort.abort();if(timer!==null)clearTimeout(timer);
    if(activeReader){const reader=activeReader;activeReader=null;
      void reader.cancel().catch(()=>{});}
  };
}

export function createOrderOperationsGateway({send,reconnectDelayMs=1500} = {}) {
  if (typeof send !== 'function'||!Number.isSafeInteger(reconnectDelayMs)||reconnectDelayMs<100||reconnectDelayMs>30000)
    throw Error('invalid_order_operations_sender');
  return Object.freeze({
    async listWaiterCalls(){
      const response=await send('/api/v1/operations/waiter-calls',{
       method:'GET',cache:'no-store',redirect:'error',credentials:'omit',
       headers:{Accept:'application/json'}});
      const value=await json(response);
      if(value?.version!==1||!Array.isArray(value.items)||value.items.length>100||
       !value.items.every(call=>call&&UUID.test(call.id)&&
        Number.isSafeInteger(call.tableNumber)&&call.tableNumber>0&&
        typeof call.createdAt==='string'&&Number.isFinite(Date.parse(call.createdAt))))
       throw new OrderOperationsGatewayError('invalid_response');
      return Object.freeze(value.items.map(call=>Object.freeze({
       id:call.id,tableNumber:call.tableNumber,createdAt:call.createdAt})));
    },
    attendWaiterCall({callId,requestId}={}){
     if(!UUID.test(callId??'')||!UUID.test(requestId??''))
      throw Error('invalid_waiter_call_operation');
     return mutation(send,`/api/v1/operations/waiter-calls/${callId}/attend`,{requestId});
    },
    async listBoard({status = null, limit = 100, cursor = null} = {}) {
      const parameters = new URLSearchParams();
      if (status !== null) parameters.set('status', status);
      parameters.set('limit', String(limit));
      if (cursor !== null) {
        if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor) ||
          typeof cursor.confirmedAt !== 'string' ||
          !Number.isFinite(Date.parse(cursor.confirmedAt)) ||
          new Date(cursor.confirmedAt).toISOString() !== cursor.confirmedAt ||
          !UUID.test(cursor.orderId) ||
          !Number.isSafeInteger(cursor.lineNumber) || cursor.lineNumber < 1) {
          throw Error('invalid_order_board_cursor');
        }
        parameters.set('afterConfirmedAt', cursor.confirmedAt);
        parameters.set('afterOrderId', cursor.orderId);
        parameters.set('afterLineNumber', String(cursor.lineNumber));
      }
      const response = await send(`/api/v1/operations/order-lines?${parameters}`, {
        method: 'GET', cache: 'no-store', redirect: 'error', credentials: 'omit',
        headers: {'Accept': 'application/json'},
      });
      return normalizeOrderBoard(await json(response));
    },
    async transitionLine({lineId, targetStatus, correlationId} = {}) {
      if (!UUID.test(lineId) || !TARGETS.has(targetStatus) || !CORRELATION.test(correlationId)) {
        throw Error('invalid_order_transition');
      }
      const response = await send(`/api/v1/operations/order-lines/${lineId}/transitions`, {
        method: 'POST', cache: 'no-store', redirect: 'error', credentials: 'omit',
        headers: {'Accept': 'application/json', 'Content-Type': 'application/json'},
        body: JSON.stringify({targetStatus, correlationId}),
      });
      const body = await json(response);
      return normalizeOrderTransition(body);
    },
    async listHistory({orderId, limit = 100} = {}) {
      if (!UUID.test(orderId) || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
        throw Error('invalid_order_history');
      }
      const response = await send(`/api/v1/operations/orders/${orderId}/history?limit=${limit}`, {
        method: 'GET', cache: 'no-store', redirect: 'error', credentials: 'omit',
        headers: {'Accept': 'application/json'},
      });
      return normalizeOrderHistory(await json(response));
    },
    acknowledgeDispatch({dispatchId,correlationId}={}) {
      if(!UUID.test(dispatchId)||!CORRELATION.test(correlationId))throw Error('invalid_h6_operation');
      return mutation(send,`/api/v1/operations/dispatches/${dispatchId}/ack`,{correlationId});
    },
    reportIncident({roundId,lineId=null,origin,reason,affectedCents,correlationId}={}) {
      if(!UUID.test(roundId)||(lineId!==null&&!UUID.test(lineId))||
        !['kitchen','waiter_customer','waiter_restaurant'].includes(origin)||typeof reason!=='string'||
        !reason.trim()||reason.length>500||!Number.isSafeInteger(affectedCents)||affectedCents<0||
        !CORRELATION.test(correlationId))throw Error('invalid_h6_operation');
      return mutation(send,`/api/v1/operations/rounds/${roundId}/incidents`,
       {lineId,origin,reason:reason.trim(),affectedCents,correlationId});
    },
    resolveIncident({incidentId,resolution,reason,correlationId}={}) {
      if(!UUID.test(incidentId)||!['approve','reject'].includes(resolution)||typeof reason!=='string'||
        !reason.trim()||reason.length>500||!CORRELATION.test(correlationId))throw Error('invalid_h6_operation');
      return mutation(send,`/api/v1/operations/incidents/${incidentId}/resolution`,
       {resolution,reason:reason.trim(),correlationId});
    },
    async listEconomicAccounts(){
      const response=await send('/api/v1/operations/economic/accounts',{
       method:'GET',cache:'no-store',redirect:'error',credentials:'omit',headers:{Accept:'application/json'}});
      const data=await json(response);
      if(data?.version!==2||typeof data.notice!=='string'||!Array.isArray(data.items)||data.items.length>250||
       !data.items.every(x=>x&&UUID.test(x.accountId)&&UUID.test(x.tableId)&&UUID.test(x.sessionId)&&
        typeof x.customerCode==='string'&&typeof x.customerAlias==='string'&&
        ['pay_now','pay_at_end',null].includes(x.paymentTiming)&&
        Number.isSafeInteger(x.grossConsumptionCents)&&x.grossConsumptionCents>=0&&
        Number.isSafeInteger(x.cancelledCents)&&x.cancelledCents>=0&&
        Number.isSafeInteger(x.netConsumptionCents)&&x.netConsumptionCents>=0&&
        Number.isSafeInteger(x.stripeCapturedCents)&&x.stripeCapturedCents>=0&&
        Number.isSafeInteger(x.stripeRefundedCents)&&x.stripeRefundedCents>=0&&
        Number.isSafeInteger(x.stripeNetCents)&&x.stripeNetCents>=0&&
        Number.isSafeInteger(x.outstandingCents)&&x.outstandingCents>=0&&
        Array.isArray(x.settlements)&&x.settlements.length<=100&&x.settlements.every(item=>
          item&&UUID.test(item.intentId)&&['stripe','external'].includes(item.channel)&&
          typeof item.state==='string'&&item.state.length>=1&&item.state.length<=64&&
          Number.isSafeInteger(item.allocatedCents)&&item.allocatedCents>=0&&
          typeof item.providerConfirmed==='boolean'&&typeof item.externalVerified==='boolean')&&
         (x.settlementIntentId===null||UUID.test(x.settlementIntentId))&&
        [null,'stripe','external'].includes(x.settlementChannel)&&
        typeof x.providerConfirmed==='boolean'&&typeof x.externalVerified==='boolean'))
       throw new OrderOperationsGatewayError('invalid_response');
      return Object.freeze({version:2,notice:data.notice,
       items:Object.freeze(data.items.map(x=>Object.freeze({...x,
         settlements:Object.freeze(x.settlements.map(item=>Object.freeze({...item})))})))});
    },
    verifyExternalSettlement({intentId,correlationId}={}){
      if(!UUID.test(intentId)||!CORRELATION.test(correlationId))throw Error('invalid_economic_operation');
      return mutation(send,`/api/v1/operations/economic/settlements/${intentId}/external-verification`,
       {correlationId,verifiedOutsideSabora:true});
    },
    closeEconomicTable({tableId,sessionId,correlationId}={}){
      if(!UUID.test(tableId)||!UUID.test(sessionId)||!CORRELATION.test(correlationId))
       throw Error('invalid_economic_operation');
      return mutation(send,`/api/v1/operations/economic/tables/${tableId}/sessions/${sessionId}/close`,
       {correlationId,operationalOnly:true});
    },
    closeOperationalAccount({accountId,correlationId}={}){
     if(!UUID.test(accountId)||!CORRELATION.test(correlationId))throw Error('invalid_h6_operation');
     return mutation(send,`/api/v1/operations/accounts/${accountId}/close`,{correlationId});
    },
    setCatalogSoldOut({itemId,soldOut,correlationId}={}) {
      if(!UUID.test(itemId)||typeof soldOut!=='boolean'||!CORRELATION.test(correlationId))
       throw Error('invalid_catalog_availability_operation');
      return mutation(send,`/api/v1/operations/catalog/items/${itemId}/availability`,
       {soldOut,correlationId});
    },
    claimPickup(input){return pickupMutation(send,'pickup-claim',input);},
    cancelPickup(input){return pickupMutation(send,'pickup-claim/cancel',input);},
    correctReady(input){return pickupMutation(send,'ready-correction',input);},
    subscribeEvents(input){return createEventSubscription(send,input,reconnectDelayMs);},
  });
}
