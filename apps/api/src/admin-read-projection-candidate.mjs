import {ADMIN_TABLES_SQL} from './admin-tables-reader-query.mjs';
// Candidate administrative read boundary. No HTTP routes, runtime connection or grants.
// Staff identity and membership must be checked by the existing protected-route hooks.
const roles=new Set(['admin','waiter','kitchen']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function plain(v){
 if(v===null||typeof v!=='object'||Array.isArray(v))return false;
 const proto=Object.getPrototypeOf(v);
 return (proto===Object.prototype||proto===null)&&
  Reflect.ownKeys(v).length<=20&&Reflect.ownKeys(v).every(k=>{
   if(typeof k!=='string'||['__proto__','constructor','prototype'].includes(k))return false;
   const d=Object.getOwnPropertyDescriptor(v,k);
   return !!d&&d.enumerable&&Object.hasOwn(d,'value');
  });
}
function assertRows(result){
 if(!result||typeof result!=='object'||!Object.hasOwn(result,'rows')||
    !Array.isArray(result.rows)||result.rows.length>101||
    result.rows.some(row=>!plain(row)))throw Error('invalid_admin_projection_response');
 return result.rows;
}
export function createAdminReadProjectionCandidate({query}={}){
 if(typeof query!=='function')throw Error('invalid_admin_projection_query');
 const requireRole=(role,allowed)=>{
  if(!roles.has(role)||!allowed.includes(role))throw Error('admin_projection_forbidden');
 };
 return Object.freeze({
  async listTables({role,limit=50,afterNumber=0}={}){
   requireRole(role,['admin','waiter']);
   if(!Number.isSafeInteger(limit)||limit<1||limit>100||
      !Number.isSafeInteger(afterNumber)||afterNumber<0)
    throw Error('invalid_admin_projection_page');
   const rows=assertRows(await query(
    ADMIN_TABLES_SQL,[afterNumber,limit+1]));
   if(rows.length>limit+1)throw Error('invalid_admin_projection_response');
   const validated=rows.map(row=>{
    if(!uuid.test(row.id)||!Number.isSafeInteger(row.number)||row.number<=afterNumber||
       !Number.isSafeInteger(row.capacity)||row.capacity<1||
       (row.description!==null&&typeof row.description!=='string')||
       !['open','paused','closed'].includes(row.ordering_state))
      throw Error('invalid_admin_projection_response');
    return Object.freeze({id:row.id,number:row.number,capacity:row.capacity,
     description:row.description,orderingState:row.ordering_state});
   });
   if(validated.some((item,i)=>i>0&&item.number<=validated[i-1].number))
    throw Error('invalid_admin_projection_response');
   const items=validated.slice(0,limit);
   return Object.freeze({version:1,items:Object.freeze(items),
    nextAfterNumber:rows.length>limit?items.at(-1).number:null});
  }
 });
}
