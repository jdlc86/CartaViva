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

function createEventSubscription(send,{onEvent,onResync,onUnavailable},reconnectDelayMs) {
  if(typeof onEvent!=='function'||typeof onResync!=='function'||typeof onUnavailable!=='function')
    throw Error('invalid_order_event_subscription');
  const abort=new AbortController();let cursor=0,timer=null,activeReader=null;
  const run=async()=>{
    try{
      const response=await send('/api/v1/operations/events',{method:'GET',cache:'no-store',redirect:'error',
       credentials:'omit',signal:abort.signal,headers:{Accept:'text/event-stream',...(cursor?{'Last-Event-ID':String(cursor)}:{})}});
      if(!response.ok||!String(response.headers.get('content-type')??'').toLowerCase().startsWith('text/event-stream')||!response.body)
       throw Error('invalid_event_stream');
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
      activeReader=reader;
      if(abort.signal.aborted){void reader.cancel().catch(()=>{});return;}
      while(!abort.signal.aborted){
       const part=await reader.read();if(part.done)break;buffer+=decoder.decode(part.value,{stream:true});
       // EventSource permits CRLF framing; normalize after each chunk so a CRLF
       // split across transport reads is also recognized as an SSE delimiter.
       buffer=buffer.replaceAll('\r\n','\n');
       let boundary;
       while((boundary=buffer.indexOf('\n\n'))>=0){
        const block=buffer.slice(0,boundary).replaceAll('\r','');buffer=buffer.slice(boundary+2);
        if(!block||block.startsWith(':'))continue;
        let eventType='message',eventId='',data='';
        for(const line of block.split('\n')){
         if(line.startsWith('event:'))eventType=line.slice(6).trim();
         else if(line.startsWith('id:'))eventId=line.slice(3).trim();
         else if(line.startsWith('data:'))data+=line.slice(5).trim();
        }
        if(eventType==='resync-required'){onResync();continue;}
        if(eventType==='access-revoked'){onUnavailable();abort.abort();return;}
        const id=Number(eventId);let value;
        try{value=JSON.parse(data);}catch{continue;}
        if(!Number.isSafeInteger(id)||id<=cursor||!H6_EVENT.test(eventType)||!value||
           typeof value!=='object'||Array.isArray(value)||!value.payload||typeof value.payload!=='object'||
           Array.isArray(value.payload)||typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt)))continue;
        cursor=id;onEvent(Object.freeze({id,type:eventType,payload:Object.freeze({...value.payload}),createdAt:value.createdAt}));
       }
      }
      if(!abort.signal.aborted)throw Error('event_stream_ended');
    }catch{
      if(abort.signal.aborted)return;onUnavailable();timer=setTimeout(run,reconnectDelayMs);
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
    async listBoard({status = null, limit = 100} = {}) {
      const parameters = new URLSearchParams();
      if (status !== null) parameters.set('status', status);
      parameters.set('limit', String(limit));
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
    settleCash({accountId,amountCents,correlationId}={}) {
      if(!UUID.test(accountId)||!Number.isSafeInteger(amountCents)||amountCents<1||
        !CORRELATION.test(correlationId))throw Error('invalid_h6_operation');
      return mutation(send,`/api/v1/operations/accounts/${accountId}/cash-settlements`,
       {amountCents,correlationId});
    },
    refundCash({incidentId,correlationId}={}) {
      if(!UUID.test(incidentId)||!CORRELATION.test(correlationId))throw Error('invalid_h6_operation');
      return mutation(send,`/api/v1/operations/incidents/${incidentId}/cash-refund`,{correlationId});
    },
    claimPickup(input){return pickupMutation(send,'pickup-claim',input);},
    cancelPickup(input){return pickupMutation(send,'pickup-claim/cancel',input);},
    correctReady(input){return pickupMutation(send,'ready-correction',input);},
    subscribeEvents(input){return createEventSubscription(send,input,reconnectDelayMs);},
  });
}
