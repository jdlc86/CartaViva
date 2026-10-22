// Candidate transaction-scoped order writer. Deliberately disconnected from
// HTTP, runtime DB roles and deployment. Requires a locked, authorized context
// and trusted published economic evidence from the coordinator.
import {randomUUID} from 'node:crypto';
import {createCatalogConfirmationAttemptWriter,
 assertCatalogConfirmationAttempt} from './catalog-confirmation-attempt-writer.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const opaque=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const categories=Object.freeze({Bebidas:'drink',Primeros:'starter',
 Segundos:'main',Postres:'dessert'});
const safeRecord=v=>{
 if(!plain(v))return false;
 const keys=Reflect.ownKeys(v);
 if(keys.length>64)return false;
 return keys.every(k=>{
  if(typeof k!=='string'||['__proto__','constructor','prototype'].includes(k))return false;
  const descriptor=Object.getOwnPropertyDescriptor(v,k);
  return !!descriptor&&descriptor.enumerable&&Object.hasOwn(descriptor,'value');
 });
};
const ledger=createCatalogConfirmationAttemptWriter();

export function createCatalogOrderWriter({newOrderId=randomUUID}={}){
 if(typeof newOrderId!=='function')throw Error('invalid_catalog_order_writer');
 return Object.freeze({
  async persist(query,args){
   if(typeof query!=='function'||!safeRecord(args)||!safeRecord(args.context)||
      args.context.authorized!==true||args.context.canOrder!==true||
      !uuid.test(args.context.tableId)||!uuid.test(args.context.sessionId)||
      !opaque(args.context.visitId)||!opaque(args.context.basketId)||
      !opaque(args.context.actorId)||
      typeof args.context.customerAlias!=='string'||
      !args.context.customerAlias.trim()||
      /[\u0000-\u001f\u007f]/u.test(args.context.customerAlias)||
      [...args.context.customerAlias].length>80||
      typeof args.context.customerIdentifier!=='string'||
      !args.context.customerIdentifier.trim()||
      !/^SB-[2-9A-HJ-NP-Y]{12}$/.test(args.context.customerIdentifier)||
      [...args.context.customerIdentifier].length>80||!plain(args.evidence)||
      !Object.hasOwn(categories,args.evidence.category)||
      typeof args.evidence.itemName!=='string'||
      !args.evidence.itemName.trim()||
      !Number.isSafeInteger(args.evidence.quantity)||
      args.evidence.quantity<1||args.evidence.quantity>20||
      !uuid.test(args.quoteId))
    throw Error('invalid_catalog_order_writer_scope');
   const orderId=newOrderId();
   if(!uuid.test(orderId))throw Error('invalid_catalog_order_id');
   // Validate immutable economic evidence and consent before any SQL write.
   // Ledger INSERT repeats the validation inside the same transaction.
   assertCatalogConfirmationAttempt({...args,orderId});
   const {context,evidence}=args;
   // The legacy kitchen trigger reads orders.items. It must be derived
   // exclusively from the trusted published evidence, not browser JSON.
   const items=[{category:categories[evidence.category],
    name:evidence.itemName,quantity:evidence.quantity}];
   // Lock and recheck the current occupancy before any write. The lock is
   // retained by the surrounding transaction through ledger insertion.
   const table=await query(
    `SELECT first_confirmed_at,grouping_window_seconds
       FROM sabora.dining_tables
      WHERE id=$1 AND session_id=$2
        AND (ordering_state='open' OR
             (ordering_state='paused' AND pause_until IS NOT NULL
              AND pause_until<=clock_timestamp()))
      FOR UPDATE`,[context.tableId,context.sessionId]);
   if(!table||!Array.isArray(table.rows)||table.rows.length!==1)
    throw Error('catalog_order_context_changed');
   const occupancy=table.rows[0];
   // Reject malformed driver rows before the INSERT. The table lock must
   // describe a valid grouping window and a trustworthy first-confirmation
   // timestamp; coercion of null/strings is not a safe fallback.
   if(!occupancy||!Number.isSafeInteger(occupancy.grouping_window_seconds)||
      occupancy.grouping_window_seconds<=0||
      occupancy.grouping_window_seconds>2147483647||
      !(occupancy.first_confirmed_at===null||
        (occupancy.first_confirmed_at instanceof Date&&
         Number.isFinite(occupancy.first_confirmed_at.getTime()))))
    throw Error('invalid_catalog_order_table_state');
   const result=await query(
    `WITH instant AS (SELECT clock_timestamp() AS at),
       created AS (
         INSERT INTO sabora.orders
           (id,table_id,session_id,company,employee_number,
            customer_alias,customer_identifier,customer_visit_key,
            economic_snapshot,confirmed_at,grouping,items)
         SELECT $1,$2,$3,NULL,NULL,$4,$5,$6,$7::jsonb,instant.at,
           CASE WHEN $9::timestamptz IS NULL THEN 'first'
                WHEN instant.at<$9::timestamptz+
                     make_interval(secs=>$10::integer)
                THEN 'grouped' ELSE 'late' END,
           $8::jsonb FROM instant
         RETURNING id,grouping,confirmed_at
       ), updated AS (
         UPDATE sabora.dining_tables t
            SET first_confirmed_at=created.confirmed_at
           FROM created
          WHERE t.id=$2 AND created.grouping='first'
         RETURNING t.id
       )
     SELECT created.id,created.grouping,
       (updated.id IS NOT NULL) AS first_timestamp_written FROM created
       LEFT JOIN updated ON true`,
    [orderId,context.tableId,context.sessionId,
     context.customerAlias.trim(),context.customerIdentifier.trim(),context.visitId,
     JSON.stringify(evidence),JSON.stringify(items),
     table.rows[0].first_confirmed_at,table.rows[0].grouping_window_seconds]
   );
   if(!result||!Array.isArray(result.rows)||result.rows.length!==1||
      result.rows[0]?.id!==orderId||
      !['first','grouped','late'].includes(result.rows[0]?.grouping)||
      (occupancy.first_confirmed_at===null)!==(result.rows[0]?.grouping==='first')||
      result.rows[0]?.first_timestamp_written!==(result.rows[0]?.grouping==='first'))
    throw Error('catalog_order_context_changed');
   // The coordinator's transaction must rollback the order if this fails.
   await ledger.insertConfirmation(query,{...args,orderId});
   return Object.freeze({orderId});
  }
 });
}
