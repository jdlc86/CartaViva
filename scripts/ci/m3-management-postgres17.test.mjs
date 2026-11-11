import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {createM3ManagementCapabilityIssuer} from '../../apps/api/src/m3-management-capability.mjs';
import {createM3TablesRepository,createM3CatalogRepository,MANAGE_M3_TABLE_SQL,READ_M3_TABLES_SQL,READ_M3_CATALOG_SQL,MANAGE_M3_CATALOG_SQL} from
 '../../apps/api/src/m3-management-repository.mjs';
import {createRoleScopedPostgresTransaction} from '../../apps/api/src/role-scoped-postgres.mjs';

const url=process.env.SABORA_CI_PG_URL;
const modulePath=process.env.SABORA_CI_PG_MODULE;
if(!url||!modulePath)throw Error('disposable_pg17_harness_required');
const parsed=new URL(url);
if(process.env.GITHUB_ACTIONS!=='true'||!isDisposablePgModulePath(modulePath)||
   parsed.protocol!=='postgresql:'||parsed.hostname!=='127.0.0.1'||
   parsed.username!=='postgres'||parsed.password!=='sabora_ci_ephemeral_only'||
   parsed.pathname!=='/postgres'||parsed.port===''||!/^[0-9]+$/.test(parsed.port)||
   parsed.search!==''||parsed.hash!=='')throw Error('unsafe_pg17_harness_target');
const require=createRequire(import.meta.url);
const {Pool}=require(modulePath);
const admin=new Pool({connectionString:url,max:3,connectionTimeoutMillis:3000,
 options:'-c statement_timeout=5000'});

test('PG17 M3 tables preserve least privilege, rollback, replay and pagination',async()=>{
 const suffix=process.pid.toString(36);
 const login=`sabora_m3_table_test_${suffix}`;
 const password=`sabora_m3_table_password_${suffix}`;
 const keyId=`m3_pg17_${suffix}_key`;
 const actorId='d1a00000-0000-4000-8000-000000000001';
 const otherAdminId='d1a00000-0000-4000-8000-000000000011';
 const requestId='d1a00000-0000-4000-8000-000000000002';
 const secret=Buffer.alloc(32,7);
 const loginUrl=new URL(url);loginUrl.username=login;loginUrl.password=password;
 let runtime;
 try{
  await admin.query(`CREATE ROLE ${login} LOGIN NOINHERIT PASSWORD '${password}'`);
  await admin.query(`GRANT sabora_m3_tables_runtime TO ${login} WITH SET TRUE, INHERIT FALSE`);
  await admin.query(`INSERT INTO sabora.order_operation_signing_keys(
    key_id,hmac_key,not_before,expires_at) VALUES($1,$2,clock_timestamp()-interval '1 minute',
    clock_timestamp()+interval '1 hour')`,[keyId,secret]);
  await admin.query(`INSERT INTO sabora.staff_members(user_id,role,state)
    VALUES($1,'admin','active'),($2,'admin','active')`,[actorId,otherAdminId]);
  await admin.query('UPDATE sabora.admin_write_ownership SET owner_user_id=$1 WHERE singleton',[actorId]);
  const objectIds=(await admin.query(`SELECT
   'sabora.manage_table_m3_candidate(jsonb,text,text)'::regprocedure::oid AS function_oid,
   'sabora.dining_tables'::regclass::oid AS table_oid`)).rows[0];
  const ownerSurface=(await admin.query(`SELECT
   has_table_privilege('sabora_m3_management_fn_owner',
    'sabora.management_mutation_receipts_m3','SELECT') AS receipt_select,
   has_table_privilege('sabora_m3_management_fn_owner',
    'sabora.management_mutation_receipts_m3','INSERT') AS receipt_insert,
   has_table_privilege('sabora_m3_management_fn_owner',
    'sabora.management_mutation_receipts_m3','UPDATE') AS receipt_update,
   has_table_privilege('sabora_m3_management_fn_owner',
    'sabora.management_mutation_receipts_m3','DELETE') AS receipt_delete`)).rows[0];
  assert.deepEqual(ownerSurface,{receipt_select:true,receipt_insert:true,
   receipt_update:false,receipt_delete:false});
  runtime=new Pool({connectionString:loginUrl.toString(),max:2,connectionTimeoutMillis:3000,
   options:'-c statement_timeout=5000'});
  const client=await runtime.connect();
  try{
   const identity=(await client.query('SELECT current_user,session_user')).rows[0];
   assert.deepEqual(identity,{current_user:login,session_user:login});
   const surface=(await client.query(`SELECT
    has_function_privilege(current_user,$1::oid,'EXECUTE') AS direct_execute,
    has_table_privilege(current_user,$2::oid,'SELECT') AS direct_table`,
    [objectIds.function_oid,objectIds.table_oid])).rows[0];
   assert.deepEqual(surface,{direct_execute:false,direct_table:false});
   const body=JSON.stringify({number:9913,capacity:4,description:'Mesa M3 PG17',
    qrToken:Buffer.alloc(32,1).toString('base64url')});
   const issue=createM3ManagementCapabilityIssuer({keyId,secret,databaseRole:login});
   const capability=issue({actorId,staffRole:'admin',action:'table.create',requestId,body});
   const readCapability=issue({actorId,staffRole:'admin',action:'tables.read',
    requestId:'d1a00000-0000-4000-8000-000000000003',body:'900:20'});
   await client.query('BEGIN');
   await client.query('SET LOCAL ROLE sabora_m3_tables_runtime');
   const result=await client.query(MANAGE_M3_TABLE_SQL,
    [JSON.stringify(capability),'create',body]);
   assert.equal(result.rows.length,1);
   assert.equal(result.rows[0].result.number,9913);
   assert.equal(result.rows[0].result.readinessState,'EN_PREPARACION');
   assert.equal(result.rows[0].result.orderingState,'closed');
   assert.equal(result.rows[0].result.replayed,false);
   const projection=await client.query(READ_M3_TABLES_SQL,
    [JSON.stringify(readCapability),900,20]);
   assert.equal(projection.rows[0].result.version,2);
   assert.ok(projection.rows[0].result.items.some(item=>item.tableId===result.rows[0].result.tableId));
   await client.query('ROLLBACK');
   const restored=(await client.query('SELECT current_user,session_user')).rows[0];
   assert.deepEqual(restored,{current_user:login,session_user:login});
   await client.query('BEGIN');
   await client.query('SET LOCAL ROLE sabora_m3_tables_runtime');
   await assert.rejects(client.query(MANAGE_M3_TABLE_SQL,[JSON.stringify(capability),'create',
    body.replace('Mesa M3 PG17','Mesa manipulada')]),error=>error?.code==='42501');
   await client.query('ROLLBACK');
   await assert.rejects(client.query('SELECT * FROM sabora.dining_tables'),
    error=>error?.code==='42501');

   const withTransaction=createRoleScopedPostgresTransaction({pool:runtime,
    role:'sabora_m3_tables_runtime',allowedSql:new Set([READ_M3_TABLES_SQL,MANAGE_M3_TABLE_SQL])});
   const repository=createM3TablesRepository({withTransaction,issueCapability:issue,
    newId:()=>'d1a00000-0000-4000-8000-000000000006'});
   const verified={verifiedIdentity:{userId:actorId},verifiedStaff:{userId:actorId,role:'admin'}};
   const committedInput={requestId:'d1a00000-0000-4000-8000-000000000004',operation:'create',
    payload:{number:9913,capacity:4,description:'Mesa M3 confirmada',
     qrToken:Buffer.alloc(32,2).toString('base64url')}};
   const committed=await repository.manage(verified,committedInput);
   assert.equal(committed.replayed,false);
   const initialPermissions=await repository.read(verified,{afterNumber:0,limit:1});
   assert.deepEqual(initialPermissions.permissions,{configure:true,qr:true,
    readiness:true,occupancy:true});
   const otherVerified={verifiedIdentity:{userId:otherAdminId},
    verifiedStaff:{userId:otherAdminId,role:'admin'}};
   const otherPayload={...committedInput.payload,number:9915};
   const otherRequestId='d1a00000-0000-4000-8000-000000000012';
   const otherCapability=issue({actorId:otherAdminId,staffRole:'admin',
    action:'table.create',requestId:otherRequestId,body:JSON.stringify(otherPayload)});
   await assert.rejects(repository.manage(otherVerified,{requestId:otherRequestId,
    operation:'create',payload:otherPayload}),
    error=>error?.code==='42501'&&/m3_management_forbidden/.test(error.message));
   await assert.rejects(withTransaction(query=>query(MANAGE_M3_TABLE_SQL,
    [JSON.stringify(otherCapability),'create',JSON.stringify(otherPayload)])),
    error=>error?.code==='42501'&&/m3_management_forbidden/.test(error.message));
   assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.dining_tables WHERE number=9915')).rows[0].n,0);
   // Transfer changes authority, including replay, immediately.
   const otherRead=await repository.read(otherVerified,{afterNumber:0,limit:1});
   assert.deepEqual(otherRead.permissions,{configure:false,qr:false,
    readiness:false,occupancy:false});
   await admin.query('UPDATE sabora.admin_write_ownership SET owner_user_id=$1 WHERE singleton',[otherAdminId]);
   const revokedProjection=await repository.read(verified,{afterNumber:0,limit:1});
   const nextProjection=await repository.read(otherVerified,{afterNumber:0,limit:1});
   assert.deepEqual(revokedProjection.permissions,{configure:false,qr:false,
    readiness:false,occupancy:false});
   assert.deepEqual(nextProjection.permissions,{configure:true,qr:true,
    readiness:true,occupancy:true});
   await assert.rejects(repository.manage(verified,committedInput),
    error=>error?.code==='42501'&&/m3_management_forbidden/.test(error.message));
   await admin.query('UPDATE sabora.admin_write_ownership SET owner_user_id=$1 WHERE singleton',[actorId]);
   assert.equal((await repository.manage(verified,committedInput)).replayed,true);
   await assert.rejects(repository.manage(verified,{...committedInput,
    payload:{...committedInput.payload,number:9914}}),
   /management_idempotency_conflict/);
   await admin.query(`INSERT INTO sabora.dining_tables
    (number,capacity,description,qr_token_hash,readiness_state,ordering_state)
    SELECT n,4,'Paginación M3',extensions.digest('m3-page-'||n::text,'sha256'),
     'EN_PREPARACION','closed' FROM generate_series(9920,9940) n`);
   try{
    const committedProjection=await repository.read(verified,{afterNumber:900,limit:20});
    assert.ok(committedProjection.items.some(item=>item.tableId===committed.tableId));
    assert.equal(typeof committedProjection.nextAfterNumber,'number');
   }finally{
    await admin.query('DELETE FROM sabora.dining_tables WHERE number BETWEEN 9913 AND 9940');
   }
  }finally{client.release();}
  assert.deepEqual((await admin.query(`SELECT
    (SELECT count(*)::integer FROM sabora.dining_tables WHERE number=9913) AS tables,
    (SELECT count(*)::integer FROM sabora.management_mutation_receipts_m3
      WHERE request_id=$1) AS receipts,
    (SELECT count(*)::integer FROM sabora.management_audit_m3
      WHERE request_id=$1) AS audit`,[requestId])).rows,
   [{tables:0,receipts:0,audit:0}]);
 }finally{
  if(runtime)await runtime.end();
  await admin.query('UPDATE sabora.admin_write_ownership SET owner_user_id=NULL WHERE owner_user_id=$1',[actorId]).catch(()=>{});
  await admin.query('DELETE FROM sabora.staff_members WHERE user_id=ANY($1::uuid[])',[[actorId,otherAdminId]]).catch(()=>{});
  await admin.query('DELETE FROM sabora.order_operation_signing_keys WHERE key_id=$1',[keyId]).catch(()=>{});
  await admin.query(`DROP OWNED BY ${login}`).catch(()=>{});
  await admin.query(`DROP ROLE IF EXISTS ${login}`).catch(()=>{});
 }
});


test('PG17 M3 dynamic category authorizes, publishes, hides and restores real public snapshot',async()=>{
 const suffix=process.pid.toString(36);
 const login=`sabora_m3_catalog_test_${suffix}`;
 const password=`sabora_m3_catalog_password_${suffix}`;
 const keyId=`m3_catalog_${suffix}_key`;
 const adminId='d1c00000-0000-4000-8000-000000000001';
 const otherAdminId='d1c00000-0000-4000-8000-000000000002';
 const waiterId='d1c00000-0000-4000-8000-000000000003';
 const categoryId='d1c00000-0000-4000-8000-000000000004';
 const itemId='d1c00000-0000-4000-8000-000000000005';
 const ids=['d1c00000-0000-4000-8000-000000000006',
  'd1c00000-0000-4000-8000-000000000007',
  'd1c00000-0000-4000-8000-000000000008',
  'd1c00000-0000-4000-8000-000000000009',
  'd1c00000-0000-4000-8000-00000000000a',
  'd1c00000-0000-4000-8000-00000000000b'];
 const secret=Buffer.alloc(32,11);
 const loginUrl=new URL(url);loginUrl.username=login;loginUrl.password=password;
 let runtime;
 try{
  await admin.query(`CREATE ROLE ${login} LOGIN NOINHERIT PASSWORD '${password}'`);
  await admin.query(`GRANT sabora_m3_catalog_runtime TO ${login} WITH SET TRUE, INHERIT FALSE`);
  await admin.query(`INSERT INTO sabora.order_operation_signing_keys
   (key_id,hmac_key,not_before,expires_at)
   VALUES($1,$2,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour')`,
   [keyId,secret]);
  await admin.query(`INSERT INTO sabora.staff_members(user_id,role,state)
   VALUES($1,'admin','active'),($2,'admin','active'),($3,'waiter','active')`,
   [adminId,otherAdminId,waiterId]);
  await admin.query('UPDATE sabora.admin_write_ownership SET owner_user_id=$1 WHERE singleton',[adminId]);
  runtime=new Pool({connectionString:loginUrl.toString(),max:2,connectionTimeoutMillis:3000,
   options:'-c statement_timeout=5000'});
  const issuer=createM3ManagementCapabilityIssuer({keyId,secret,databaseRole:login});
  const withTransaction=createRoleScopedPostgresTransaction({pool:runtime,
   role:'sabora_m3_catalog_runtime',
   allowedSql:new Set([READ_M3_CATALOG_SQL,MANAGE_M3_CATALOG_SQL])});
  const repo=createM3CatalogRepository({withTransaction,issueCapability:issuer,
   newId:()=>ids[0]});
  const verified={verifiedIdentity:{userId:adminId},
   verifiedStaff:{userId:adminId,role:'admin'}};
  const asOther={verifiedIdentity:{userId:otherAdminId},
   verifiedStaff:{userId:otherAdminId,role:'admin'}};
  const asWaiter={verifiedIdentity:{userId:waiterId},
   verifiedStaff:{userId:waiterId,role:'waiter'}};
  const initial=await repo.read(verified);
  assert.deepEqual(initial.permissions,{manage:true},
   'current writer can edit catalog independently of tables runtime');
  assert.deepEqual((await repo.read(asOther)).permissions,{manage:false},
   'other ADMIN has read-only catalog even with valid role');
  assert.deepEqual(initial.categories.filter(c=>c.mandatory).map(c=>c.name),
   ['ENTRANTE','PRIMERO','SEGUNDO','POSTRE','BEBIDA']);
  const create={requestId:ids[0],operation:'category_create',
   payload:{categoryId,name:'ESPECIALES',sortOrder:600}};
  const category=await repo.manage(verified,create);
  assert.equal(category.name,'ESPECIALES');
  assert.equal(category.replayed,false);
  assert.equal((await repo.manage(verified,create)).replayed,true);
  await assert.rejects(repo.manage(verified,{...create,
   payload:{...create.payload,name:'Cambiado'}}),/management_idempotency_conflict/);
  assert.throws(()=>repo.manage(asWaiter,{requestId:ids[1],
   operation:'category_create',payload:{categoryId:'d1c00000-0000-4000-8000-00000000000c',
    name:'NO PERMITIDA',sortOrder:700}}),/invalid_m3_catalog_request|m3_management_forbidden/);
  await assert.rejects(repo.manage(asOther,{requestId:ids[1],
   operation:'category_create',payload:{categoryId:'d1c00000-0000-4000-8000-00000000000c',
    name:'NO PERMITIDA',sortOrder:700}}),
    error=>error?.code==='42501'&&/m3_management_forbidden/.test(error.message));
  assert.ok((await repo.read(verified)).categories.some(c=>c.id===categoryId&&c.name==='ESPECIALES'));
  const draft={name:'Plato de temporada',description:'Categoría configurable',
   imageUrl:null,priceCents:0,allergenIds:[],allergenStatus:'VERIFICADA',
   options:[],extras:[],discount:null};
  const saved=await repo.manage(verified,{requestId:ids[1],operation:'item_save',
   payload:{itemId,categoryId,expectedRevision:0,draft}});
  assert.equal(saved.categoryId,categoryId);
  assert.equal(saved.draft.category,'ESPECIALES');
  const published=await repo.manage(verified,{requestId:ids[2],operation:'item_publish',
   payload:{itemId,expectedRevision:saved.draftRevision}});
  assert.equal(published.publishedSnapshot.category,'ESPECIALES');
  const publicRead=()=>admin.query(
   'SELECT id,published_snapshot FROM sabora.read_published_catalog() WHERE id=$1',[itemId]);
  assert.equal((await publicRead()).rows[0].published_snapshot.categoryId,categoryId);
  const hide=await repo.manage(verified,{requestId:ids[3],operation:'category_visibility',
   payload:{categoryId,expectedRevision:category.revision,hidden:true}});
  assert.equal(hide.hidden,true);
  assert.equal((await publicRead()).rows.length,0,
   'hidden category must not leak published products into public catalog');
  const restore=await repo.manage(verified,{requestId:ids[4],operation:'category_visibility',
   payload:{categoryId,expectedRevision:hide.revision,hidden:false}});
  assert.equal(restore.hidden,false);
  assert.equal((await publicRead()).rows.length,1);
  const ordering=await repo.manage(verified,{requestId:ids[5],operation:'category_reorder',
   payload:{categoryId,expectedRevision:restore.revision,sortOrder:150}});
  assert.equal(ordering.sortOrder,150);
  assert.ok((await repo.read(verified)).categories.some(c=>c.id===categoryId&&c.sortOrder===150));
  await admin.query('UPDATE sabora.admin_write_ownership SET owner_user_id=$1 WHERE singleton',[otherAdminId]);
  assert.deepEqual((await repo.read(verified)).permissions,{manage:false},
   'old ADMIN loses signed catalog writer permission after transfer');
  assert.deepEqual((await repo.read(asOther)).permissions,{manage:true},
   'new ADMIN gains signed catalog writer permission without tables gateway');
  await assert.rejects(repo.manage(verified,{requestId:ids[1],operation:'category_create',
   payload:{categoryId:'d1c00000-0000-4000-8000-00000000000c',
    name:'NO PERMITIDA',sortOrder:700}}),error=>error?.code==='42501');
  const restricted=await runtime.connect();
  try{
   await assert.rejects(restricted.query('SELECT * FROM sabora.catalog_categories_m3'),
    error=>error?.code==='42501');
  }finally{restricted.release();}
  const audits=(await admin.query(`SELECT count(*)::integer AS n
   FROM sabora.management_audit_m3 WHERE request_id=ANY($1::uuid[])`,[ids])).rows[0].n;
  assert.equal(audits,6,'all six lifecycle changes must have durable audit records');
 }finally{
  if(runtime)await runtime.end();
  await admin.query('DELETE FROM sabora.catalog_items WHERE id=$1',[itemId]).catch(()=>{});
  await admin.query('DELETE FROM sabora.catalog_categories_m3 WHERE id=$1',[categoryId]).catch(()=>{});
  await admin.query('DELETE FROM sabora.management_audit_m3 WHERE request_id=ANY($1::uuid[])',[ids]).catch(()=>{});
  await admin.query('DELETE FROM sabora.management_mutation_receipts_m3 WHERE request_id=ANY($1::uuid[])',[ids]).catch(()=>{});
  await admin.query('UPDATE sabora.admin_write_ownership SET owner_user_id=NULL WHERE owner_user_id=ANY($1::uuid[])',[[adminId,otherAdminId]]).catch(()=>{});
  await admin.query('DELETE FROM sabora.staff_members WHERE user_id=ANY($1::uuid[])',
   [[adminId,otherAdminId,waiterId]]).catch(()=>{});
  await admin.query('DELETE FROM sabora.order_operation_signing_keys WHERE key_id=$1',[keyId]).catch(()=>{});
  await admin.query(`DROP OWNED BY ${login}`).catch(()=>{});
  await admin.query(`DROP ROLE IF EXISTS ${login}`).catch(()=>{});
 }
});

test.after(async()=>{await admin.end();});
