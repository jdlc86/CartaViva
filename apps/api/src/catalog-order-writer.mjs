// Candidate transaction-scoped order writer. Deliberately disconnected from
// HTTP, runtime DB roles and deployment. Requires a locked, authorized context
// and trusted published economic evidence from the coordinator.
import {randomUUID} from 'node:crypto';
import {createCatalogConfirmationAttemptWriter} from './catalog-confirmation-attempt-writer.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const opaque=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const categories=Object.freeze({Bebidas:'drink',Primeros:'starter',
 Segundos:'main',Postres:'dessert'});
const ledger=createCatalogConfirmationAttemptWriter();

export function createCatalogOrderWriter({newOrderId=randomUUID}={}){
 if(typeof newOrderId!=='function')throw Error('invalid_catalog_order_writer');
 return Object.freeze({
  async persist(query,args){
   if(typeof query!=='function'||!plain(args)||!plain(args.context)||
      args.context.authorized!==true||args.context.canOrder!==true||
      !uuid.test(args.context.tableId)||!uuid.test(args.context.sessionId)||
      !opaque(args.context.visitId)||!opaque(args.context.basketId)||
      !opaque(args.context.actorId)||!plain(args.evidence)||
      !Object.hasOwn(categories,args.evidence.category)||
      typeof args.evidence.itemName!=='string'||
      !args.evidence.itemName.trim()||
      !Number.isSafeInteger(args.evidence.quantity)||
      args.evidence.quantity<1||args.evidence.quantity>20||
      !uuid.test(args.quoteId))
    throw Error('invalid_catalog_order_writer_scope');
   const orderId=newOrderId();
   if(!uuid.test(orderId))throw Error('invalid_catalog_order_id');
   const {context,evidence}=args;
   // The legacy kitchen trigger reads orders.items. It must be derived
   // exclusively from the trusted published evidence, not browser JSON.
   const items=[{category:categories[evidence.category],
    name:evidence.itemName,quantity:evidence.quantity}];
   const result=await query(
    `WITH locked_table AS (
       SELECT id,session_id,first_confirmed_at,grouping_window_seconds
         FROM sabora.dining_tables
        WHERE id=$2 AND session_id=$3 AND
          (ordering_state='open' OR
           (ordering_state='paused' AND pause_until IS NOT NULL
             AND pause_until<=clock_timestamp()))
        FOR UPDATE
     ), instant AS (SELECT clock_timestamp() AS at),
     created AS (
       INSERT INTO sabora.orders
         (id,table_id,session_id,company,employee_number,
          customer_alias,customer_identifier,customer_visit_key,
          economic_snapshot,confirmed_at,grouping,items)
       SELECT $1,t.id,t.session_id,NULL,NULL,$4,$5,$6,$7::jsonb,
              instant.at,
              CASE WHEN t.first_confirmed_at IS NULL THEN 'first'
                   WHEN instant.at<t.first_confirmed_at+
                     make_interval(secs=>t.grouping_window_seconds)
                   THEN 'grouped' ELSE 'late' END,
              $8::jsonb
         FROM locked_table t CROSS JOIN instant
       RETURNING id,grouping,confirmed_at
     ), update_table AS (
       UPDATE sabora.dining_tables t SET first_confirmed_at=c.confirmed_at
         FROM created c WHERE t.id=$2 AND c.grouping='first'
       RETURNING t.id
     )
     SELECT id,grouping FROM created`,
    [orderId,context.tableId,context.sessionId,
     context.actorId,context.actorId,context.visitId,
     JSON.stringify(evidence),JSON.stringify(items)]
   );
   if(!result||!Array.isArray(result.rows)||result.rows.length!==1||
      result.rows[0]?.id!==orderId)
    throw Error('catalog_order_context_changed');
   // The coordinator's transaction must rollback the order if this fails.
   await ledger.insertConfirmation(query,{...args,orderId});
   return Object.freeze({orderId});
  }
 });
}
