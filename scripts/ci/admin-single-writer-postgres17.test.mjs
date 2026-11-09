// Critical single-writer authorization gate, on the SAME disposable PG17
// used by the integrated H6/Bootstrap chain. Never query operational Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomBytes,randomUUID} from 'node:crypto';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {createM3ManagementCapabilityIssuer} from '../../apps/api/src/m3-management-capability.mjs';
import {MANAGE_M3_TABLE_SQL,MANAGE_M3_CATALOG_SQL,READ_M3_CATALOG_SQL}
 from '../../apps/api/src/m3-management-repository.mjs';
import {MANAGE_M5_COMMS_SQL,READ_M5_COMMS_ADMIN_SQL}
 from '../../apps/api/src/m5-communications.mjs';

const target=process.env.SABORA_CI_PG_URL,mod=process.env.SABORA_CI_PG_MODULE;
if(!target||!mod||process.env.GITHUB_ACTIONS!=='true'||!isDisposablePgModulePath(mod))
 throw Error('disposable_pg17_harness_required');
const u=new URL(target);
if(u.protocol!=='postgresql:'||u.hostname!=='127.0.0.1'||u.username!=='postgres'||
 u.password!=='sabora_ci_ephemeral_only'||u.pathname!=='/postgres'||
 !u.port||u.search||u.hash)throw Error('unsafe_pg17_harness_target');
const {Pool}=createRequire(import.meta.url)(mod);
const admin=new Pool({connectionString:target,max:2,connectionTimeoutMillis:3000,
 options:'-c statement_timeout=10000'});

test('PG17 single ADMIN writer: signed catalog/table/comms, root denied, transfer/replay fence, no side effects',
 {timeout:45_000},async()=>{
 const suffix=process.pid.toString(36),keyId='single_writer_'+suffix+'_key';
 const secret=randomBytes(32),ownerId=randomUUID(),otherId=randomUUID();
 const logins=[
  {role:'sabora_m3_tables_runtime',name:'sabora_sw_tables_'+suffix},
  {role:'sabora_m3_catalog_runtime',name:'sabora_sw_catalog_'+suffix},
  {role:'sabora_m5_comms_admin_runtime',name:'sabora_sw_comms_'+suffix}
 ];
 const pass='sabora_ci_sw_'+randomBytes(18).toString('hex');
 let priorOwner=null,rootId=null;
 const pools=[];
 try{
  priorOwner=(await admin.query('SELECT owner_user_id FROM sabora.admin_write_ownership WHERE singleton')).rows[0]?.owner_user_id??null;
  const root=(await admin.query("SELECT user_id FROM sabora.staff_members WHERE role='root' AND state='active' LIMIT 1")).rows[0];
  if(root)rootId=root.user_id;
  else{
   rootId=randomUUID();
   // ROOT is immutable by contract; this row remains only in the disposable
   // CI database, which the harness destroys immediately after all tests.
   await admin.query("INSERT INTO sabora.staff_members(user_id,role,state) VALUES($1,'root','active')",[rootId]);
  }
  await admin.query("INSERT INTO sabora.staff_members(user_id,role,state) VALUES($1,'admin','active'),($2,'admin','active')",[ownerId,otherId]);
  await admin.query('UPDATE sabora.admin_write_ownership SET owner_user_id=$1 WHERE singleton',[ownerId]);
  await admin.query(`INSERT INTO sabora.order_operation_signing_keys
   (key_id,hmac_key,not_before,expires_at) VALUES($1,$2,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour')`,
   [keyId,secret]);
  for(const item of logins){
   await admin.query('CREATE ROLE '+item.name+" LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+pass+"'");
   await admin.query('GRANT '+item.role+' TO '+item.name+' WITH SET TRUE, INHERIT FALSE');
   const loginUrl=new URL(target);loginUrl.username=item.name;loginUrl.password=pass;
   item.pool=new Pool({connectionString:loginUrl.toString(),max:1,connectionTimeoutMillis:3000,
    options:'-c statement_timeout=10000'});
   pools.push(item.pool);
  }
  const run=async(item,sql,params)=>{
   const c=await item.pool.connect();
   try{
    await c.query('BEGIN');
    await c.query('SET LOCAL ROLE '+item.role);
    return await c.query(sql,params);
   }finally{
    await c.query('ROLLBACK').catch(()=>{});
    c.release();
   }
  };
  const signer=item=>createM3ManagementCapabilityIssuer({
   keyId,secret,databaseRole:item.name});
  const opts={title:'Prueba propietario',body:'Mensaje de autorización aislado',
   emoji:'',image:null,imageLicense:null,priority:'BAJA',schedule:{
    mode:'daily',startDate:'2026-11-08',endDate:null,weekdays:[],
    startTime:'00:00',endTime:'23:59',timeZone:'Europe/Madrid'}};
  const cases=[
   {item:logins[0],action:'table.create',sql:MANAGE_M3_TABLE_SQL,
    op:'create',payload:{number:9876,capacity:4,description:'Writer test',qrToken:Buffer.alloc(32,31).toString('base64url')}},
   {item:logins[1],action:'catalog.category_create',sql:MANAGE_M3_CATALOG_SQL,
    op:'category_create',payload:{categoryId:randomUUID(),name:'OWNER PERMISSION CI',sortOrder:850}},
   {item:logins[2],action:'comms.manage',sql:MANAGE_M5_COMMS_SQL,
    op:'save',payload:{id:null,revision:null,draft:opts}}
  ];
  const invoke=(testCase,actor,role,requestId=randomUUID())=>{
   const body=JSON.stringify(testCase.payload);
   const cap=signer(testCase.item)({actorId:actor,staffRole:role,
    action:testCase.action,requestId,body});
   return run(testCase.item,testCase.sql,[JSON.stringify(cap),testCase.op,body]);
  };
  const counts=async()=> (await admin.query(`SELECT
   (SELECT count(*)::integer FROM sabora.management_mutation_receipts_m3) AS m3_receipts,
   (SELECT count(*)::integer FROM sabora.management_audit_m3) AS m3_audit,
   (SELECT count(*)::integer FROM sabora.comms_receipts_m5) AS m5_receipts,
   (SELECT count(*)::integer FROM sabora.comms_audit_m5) AS m5_audit`)).rows[0];
  const baseline=await counts();
  for(const item of logins){
   const surfaces=(await admin.query(`SELECT
    has_table_privilege($1,'sabora.admin_write_ownership','SELECT') AS owner_read,
    has_table_privilege($1,'sabora.admin_write_ownership','UPDATE') AS owner_write,
    has_function_privilege($1,'sabora.verify_management_capability_m3(jsonb,text)','EXECUTE') AS verifier_call`,[item.name])).rows[0];
   assert.deepEqual(surfaces,{owner_read:false,owner_write:false,verifier_call:false},
    'physical login must not inspect ownership or bypass the sealed signer');
  }
  // Security-critical negative coverage on every administrative writer RPC.
  // A complete valid actor/key/body with a NULL/missing HMAC or NULL signed
  // clock used to pass the original PG17 PL/pgSQL IF NULL predicate.
  for(const c of cases){
   const body=JSON.stringify(c.payload);
   const capability=signer(c.item)({actorId:ownerId,staffRole:'admin',
    action:c.action,requestId:randomUUID(),body});
   const malformed=[
    ['null_signature',{...capability,signatureHex:null}],
    ['missing_signature',Object.fromEntries(Object.entries(capability)
      .filter(([key])=>key!=='signatureHex'))],
    ['null_issued_at',{...capability,issuedAtMs:null}],
    ['null_expiry',{...capability,expiresAtMs:null}],
    ['string_expiry',{...capability,expiresAtMs:String(capability.expiresAtMs)}],
    ['wrong_signature',{...capability,signatureHex:'0'.repeat(64)}]
   ];
   for(const [kind,forged] of malformed){
    await assert.rejects(
     run(c.item,c.sql,[JSON.stringify(forged),c.op,body]),
     error=>error?.code==='42501'&&/invalid_m3_management_capability/.test(error.message),
     'shared M3/M5 verifier must reject '+kind+' for '+c.action);
   }
  }
  assert.deepEqual(await counts(),baseline,
   'tampered HMAC requests must not persist M3/M5 receipts or audit');
  for(const c of cases){
   const positive=await invoke(c,ownerId,'admin');
   assert.equal(positive.rows.length,1,'current ADMIN owner must be able to write');
   for(const [id,role] of [[otherId,'admin'],[rootId,'root']]){
    await assert.rejects(invoke(c,id,role),
     error=>error?.code==='42501'&&/m3_management_forbidden/.test(error?.message??''),
     role+' must be denied the exact signed '+c.action+' RPC');
   }
  }
  assert.deepEqual(await counts(),baseline,'denied writes must not persist receipts/audit');
  // ROOT can still read administrative projections: no overbroad role denial.
  const readCatalogBody='catalog.read';
  const readCatalogCap=signer(logins[1])({
   actorId:rootId,staffRole:'root',action:'catalog.read',requestId:randomUUID(),body:readCatalogBody});
  assert.equal((await run(logins[1],READ_M3_CATALOG_SQL,[JSON.stringify(readCatalogCap)])).rows[0].result.scope,'administrative');
  const readCommsBody='comms.read';
  const readCommsCap=signer(logins[2])({
   actorId:rootId,staffRole:'root',action:'comms.read',requestId:randomUUID(),body:readCommsBody});
  assert(Array.isArray((await run(logins[2],READ_M5_COMMS_ADMIN_SQL,[JSON.stringify(readCommsCap)])).rows[0].result.items));
  // In-flight/replayed capabilities must not remain authorized after transfer.
  const governor=await admin.connect();
  try{
   await governor.query('BEGIN');
   // Hold the owner-transfer row lock while a formerly valid signer starts
   // its mutation. FOR SHARE must wait, then check the NEW committed owner.
   await governor.query('UPDATE sabora.admin_write_ownership SET owner_user_id=$1 WHERE singleton',[otherId]);
   const deniedAfterTransfer=assert.rejects(invoke(cases[0],ownerId,'admin'),
    error=>error?.code==='42501'&&/m3_management_forbidden/.test(error?.message??''),
    'a signed old-owner mutation must not pass through an in-flight transfer');
   await governor.query('COMMIT');
   await deniedAfterTransfer;
  }catch(error){await governor.query('ROLLBACK').catch(()=>{});throw error;}
  finally{governor.release();}
  assert.equal((await invoke(cases[0],otherId,'admin')).rows.length,1,
   'the new singleton ADMIN owner gains access without changing grants');
  await admin.query('UPDATE sabora.admin_write_ownership SET owner_user_id=NULL WHERE singleton');
  for(const c of cases)await assert.rejects(invoke(c,otherId,'admin'),
   error=>error?.code==='42501'&&/m3_management_forbidden/.test(error?.message??''),
   'missing owner must fail closed');
  assert.deepEqual(await counts(),baseline,'no durable effects on any denied writer');
 }finally{
  await admin.query('UPDATE sabora.admin_write_ownership SET owner_user_id=$1 WHERE singleton',[priorOwner]).catch(()=>{});
  for(const pool of pools)await pool.end().catch(()=>{});
  for(const item of logins){
   await admin.query('DROP OWNED BY '+item.name).catch(()=>{});
   await admin.query('DROP ROLE IF EXISTS '+item.name).catch(()=>{});
  }
  await admin.query('DELETE FROM sabora.staff_members WHERE user_id=ANY($1::uuid[])',[[ownerId,otherId]]).catch(()=>{});
  await admin.query('DELETE FROM sabora.order_operation_signing_keys WHERE key_id=$1',[keyId]).catch(()=>{});
 }
});
test.after(async()=>admin.end());
