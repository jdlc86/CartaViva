import {randomUUID} from 'node:crypto';

export const READ_M3_TABLES_SQL=
 `SELECT sabora.read_admin_tables_m3_candidate($1::jsonb,$2,$3) AS result`;
export const MANAGE_M3_TABLE_SQL=
 `SELECT sabora.manage_table_m3_candidate($1::jsonb,$2,$3) AS result`;
export const OCCUPANCY_M3_TABLE_SQL=
 `SELECT sabora.transition_table_occupancy_m3_candidate($1::jsonb,$2) AS result`;
export const READ_M3_CATALOG_SQL=
 `SELECT sabora.read_admin_catalog_m3_candidate($1::jsonb) AS result`;
export const READ_M3_FINANCE_SQL=
 `SELECT sabora.read_admin_finance_dashboard_candidate($1::jsonb,$2::text,$3::text,$4::text) AS result`;
export const MANAGE_M3_CATALOG_SQL=
 `SELECT sabora.manage_catalog_m3_candidate($1::jsonb,$2,$3) AS result`;

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const one=result=>{
 if(!result||!Array.isArray(result.rows)||result.rows.length!==1||
    !plain(result.rows[0])||!plain(result.rows[0].result))
  throw Error('invalid_m3_management_result');
 return Object.freeze(result.rows[0].result);
};
const identity=verified=>{
 const actorId=verified?.verifiedIdentity?.userId;
 const staffRole=verified?.verifiedStaff?.role;
 if(typeof actorId!=='string'||!UUID.test(actorId)||verified?.verifiedStaff?.userId!==actorId||
    !['admin','root','waiter'].includes(staffRole))throw Error('m3_management_forbidden');
 return Object.freeze({actorId:actorId.toLowerCase(),staffRole});
};
const signed=(issueCapability,actor,action,requestId,body)=>{
 const value=issueCapability({...actor,action,requestId,body});
 if(!plain(value)||Reflect.ownKeys(value).length!==10||
    !['keyId','databaseRole','actorId','staffRole','action','requestId','bodyHashHex',
      'issuedAtMs','expiresAtMs','signatureHex'].every(key=>Object.hasOwn(value,key))||
    value.actorId!==actor.actorId||value.staffRole!==actor.staffRole||
    value.action!==action||value.requestId!==requestId.toLowerCase()||
    !HASH.test(value.bodyHashHex??'')||!HASH.test(value.signatureHex??'')||
    !Number.isSafeInteger(value.issuedAtMs)||!Number.isSafeInteger(value.expiresAtMs)||
    value.expiresAtMs<=value.issuedAtMs)
  throw Error('invalid_m3_management_capability');
 return JSON.stringify(value);
};

export function createM3TablesRepository({withTransaction,issueCapability,newId=randomUUID}={}){
 if(typeof withTransaction!=='function'||typeof issueCapability!=='function'||typeof newId!=='function')
  throw Error('invalid_m3_tables_repository');
 return Object.freeze({
  read(verified,{afterNumber=0,limit=50}={}){
   const actor=identity(verified);
   if(!Number.isSafeInteger(afterNumber)||afterNumber<0||
      !Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('invalid_m3_table_request');
   const requestId=newId(),body=`${afterNumber}:${limit}`;
   if(!UUID.test(requestId))throw Error('invalid_m3_management_capability');
   const capability=signed(issueCapability,actor,'tables.read',requestId,body);
   return withTransaction(async query=>one(await query(READ_M3_TABLES_SQL,
    [capability,afterNumber,limit])));
  },
  manage(verified,{requestId,operation,payload}={}){
   const actor=identity(verified);
   if(!UUID.test(requestId??'')||!['create','update','readiness','qr_rotate','qr_revoke'].includes(operation)||
      !plain(payload))throw Error('invalid_m3_table_request');
   const body=JSON.stringify(payload),action=`table.${operation}`;
   const capability=signed(issueCapability,actor,action,requestId,body);
   return withTransaction(async query=>one(await query(MANAGE_M3_TABLE_SQL,
    [capability,operation,body])));
  },
  occupancy(verified,{requestId,tableId,target,pauseUntil=null}={}){
   const actor=identity(verified);
   if(!UUID.test(requestId??'')||!UUID.test(tableId??'')||
      !['open','paused','closed'].includes(target)||
      (pauseUntil!==null&&(typeof pauseUntil!=='string'||Number.isNaN(Date.parse(pauseUntil)))))
    throw Error('invalid_m3_table_request');
   const body=JSON.stringify({tableId,target,pauseUntil});
   const capability=signed(issueCapability,actor,'table.occupancy',requestId,body);
   return withTransaction(async query=>one(await query(OCCUPANCY_M3_TABLE_SQL,[capability,body])));
  }
 });
}

export function createM3CatalogRepository({withTransaction,issueCapability,newId=randomUUID}={}){
 if(typeof withTransaction!=='function'||typeof issueCapability!=='function'||typeof newId!=='function')
  throw Error('invalid_m3_catalog_repository');
 return Object.freeze({
  read(verified){
   const actor=identity(verified);
   if(!['admin','root'].includes(actor.staffRole))throw Error('m3_management_forbidden');
   const requestId=newId(),body='catalog.read';
   if(!UUID.test(requestId))throw Error('invalid_m3_management_capability');
   const capability=signed(issueCapability,actor,'catalog.read',requestId,body);
   return withTransaction(async query=>one(await query(READ_M3_CATALOG_SQL,[capability])));
  },
  manage(verified,{requestId,operation,payload}={}){
   const actor=identity(verified);
   if(!['admin','root'].includes(actor.staffRole)||!UUID.test(requestId??'')||
      !['category_create','category_reorder','category_visibility','item_save',
        'item_publish','item_withdraw'].includes(operation)||!plain(payload))
    throw Error('invalid_m3_catalog_request');
   const body=JSON.stringify(payload),action=`catalog.${operation}`;
   const capability=signed(issueCapability,actor,action,requestId,body);
   return withTransaction(async query=>one(await query(MANAGE_M3_CATALOG_SQL,
    [capability,operation,body])));
  }
 });
}

export function createM3FinanceRepository({withTransaction,issueCapability,newId=randomUUID,
 timeZone=null}={}){
 if(typeof withTransaction!=='function'||typeof issueCapability!=='function'||typeof newId!=='function'||
    (timeZone!==null&&(typeof timeZone!=='string'||timeZone.length<1||timeZone.length>80)))
  throw Error('invalid_m3_finance_repository');
 return Object.freeze({
  read(verified,{period='today',month=null}={}){
   const actor=identity(verified);
   if(!['admin','root'].includes(actor.staffRole))throw Error('m3_management_forbidden');
   if(!['today','last7','thisMonth','previousMonth'].includes(period)||
      (month!==null&&(!/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(month)||period!=='thisMonth')))
    throw Error('invalid_m3_finance_period');
   if(timeZone===null)throw Error('m3_finance_timezone_unconfigured');
   const requestId=newId();
   if(!UUID.test(requestId))throw Error('invalid_m3_finance_capability');
   const body=`finance:${period}:${month??''}:${timeZone}`;
   const capability=signed(issueCapability,actor,'finance.read',requestId,body);
   return withTransaction(async query=>one(await query(READ_M3_FINANCE_SQL,
    [capability,period,month,timeZone])));
  }
 });
}
