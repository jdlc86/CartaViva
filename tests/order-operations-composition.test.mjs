import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const Fastify = createRequire(new URL('../apps/api/package.json', import.meta.url))('fastify');
import {registerVerifiedOrderOperationsFromPools, registerVerifiedOrderTransitionsOnlyFromPools} from '../apps/api/src/order-operations-composition.mjs';

const pool = (user, connectionString) => ({
  options: {user, connectionString},
  query() {},
  connect() {},
});

test('operations composition rejects shared or indistinguishable SQL identities', async () => {
  const staffPool = pool('sabora_staff_reader', 'postgres://staff');
  const operationPool = pool('sabora_operations', 'postgres://operations');
  const app = {get() {}, post() {}};
  const base = {staffPool, operationsPool: operationPool,
    staffRole: 'sabora_staff_reader', operationsRole: 'sabora_operations'};
  await assert.rejects(registerVerifiedOrderOperationsFromPools(app, {...base, operationsPool: staffPool}), /pool_isolation/);
  await assert.rejects(registerVerifiedOrderOperationsFromPools(app, {...base,
    operationsPool: pool('sabora_staff_reader', 'postgres://operations')}), /pool_isolation/);
  await assert.rejects(registerVerifiedOrderOperationsFromPools(app, {...base,
    operationsPool: pool('sabora_operations', 'postgres://staff')}), /pool_isolation/);
  await assert.rejects(registerVerifiedOrderOperationsFromPools(app, {...base,
    operationsPool: {options: {}, connect: null}}), /pool_isolation/);
});

test('pool isolation rejects before inspecting either SQL login or mounting routes', async () => {
  const events = [];
  const shared = {
    options: {user: 'sabora_staff_reader', connectionString: 'postgres://shared'},
    query() { events.push('staff.query'); },
    async connect() { events.push('pool.connect'); throw Error('unexpected_connection'); },
  };
  const app = {
    get() { events.push('app.get'); },
    post() { events.push('app.post'); },
  };
  await assert.rejects(registerVerifiedOrderOperationsFromPools(app, {
    staffPool: shared, operationsPool: shared,
    staffRole: 'sabora_staff_reader', operationsRole: 'sabora_operations',
  }), /pool_isolation/);
  assert.deepEqual(events, []);
});

test('verified composition rejects equal declared SQL roles before querying', async () => {
  const events = [];
  const makePool = (user, connectionString) => ({
    options: {user, connectionString},
    query() { events.push('query'); },
    async connect() { events.push('connect'); throw Error('unexpected_connection'); },
  });
  await assert.rejects(registerVerifiedOrderOperationsFromPools({
    get() { events.push('get'); }, post() { events.push('post'); },
  }, {
    staffPool: makePool('sabora_staff_reader', 'postgres://staff'),
    operationsPool: makePool('sabora_operations', 'postgres://operations'),
    staffRole: 'sabora_staff_reader', operationsRole: 'sabora_staff_reader',
    issueTransitionCapability() {},
  }), /pool_isolation/);
  assert.deepEqual(events, []);
});

test('all malformed pool configurations fail before connections and route registration', async () => {
  const events = [];
  const makePool = (user, connectionString) => ({
    options: {user, connectionString},
    query() { events.push('query'); },
    async connect() { events.push('connect'); throw Error('unexpected_connection'); },
  });
  const staffPool = makePool('sabora_staff_reader', 'postgres://staff');
  const operationsPool = makePool('sabora_operations', 'postgres://operations');
  const app = {
    get() { events.push('get'); },
    post() { events.push('post'); },
  };
  const base = {staffPool, operationsPool,
    staffRole: 'sabora_staff_reader', operationsRole: 'sabora_operations'};
  for (const override of [
    {staffPool: null},
    {operationsPool: null},
    {staffPool: {options: {}, query: null}},
    {operationsPool: {options: {}, connect: null}},
    {operationsPool: makePool('sabora_staff_reader', 'postgres://operations')},
    {operationsPool: makePool('sabora_operations', 'postgres://staff')},
  ]) {
    await assert.rejects(registerVerifiedOrderOperationsFromPools(app, {
      ...base, ...override,
    }), /invalid_order_operations_pool_isolation/);
    assert.deepEqual(events, [], 'a rejected pool must have no SQL or HTTP side effects');
  }
});

test('operations remain opt-in and never import into the production server', () => {
  const source = readFileSync(new URL('../apps/api/src/server.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /order-operations-composition|registerOrderOperationsFromPools|registerOrderOperationsHttp/);
  const composition = readFileSync(new URL('../apps/api/src/order-operations-composition.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(composition, /process\.env|new Pool\(|DATABASE_URL|SUPABASE_URL/);
  assert.doesNotMatch(composition, /export function registerOrderOperationsFromPools/);
});


test('verified composition refuses route registration before SQL identity preflight', async () => {
  const registrations = [];
  const app = {
    get(...args) { registrations.push(['get', ...args]); },
    post(...args) { registrations.push(['post', ...args]); },
  };
  const staffPool = pool('sabora_staff_reader', 'postgres://staff');
  const operationsPool = pool('sabora_operations', 'postgres://operations');
  await assert.rejects(registerVerifiedOrderOperationsFromPools(app, {
    staffPool, operationsPool,
    staffRole: 'sabora_staff_reader', operationsRole: 'sabora_operations',
    issueTransitionCapability() {},
  }), /invalid_order_operations_sql_client/);
  assert.equal(registrations.length, 0);
  await assert.rejects(registerVerifiedOrderOperationsFromPools(app, {
    staffPool, operationsPool, staffRole: 'postgres', operationsRole: 'sabora_operations',
    issueTransitionCapability() {},
  }), /invalid_order_operations_sql_identity/);
  assert.equal(registrations.length, 0);
});

test('verified composition rejects a missing capability issuer before SQL or routes', async () => {
  const events = [];
  const app = {get() { events.push('get'); }, post() { events.push('post'); }};
  await assert.rejects(registerVerifiedOrderOperationsFromPools(app, {
    staffPool: pool('sabora_staff_reader', 'postgres://staff'),
    operationsPool: pool('sabora_operations', 'postgres://operations'),
    staffRole: 'sabora_staff_reader', operationsRole: 'sabora_operations',
  }), /invalid_order_operation_capability_issuer/);
  assert.deepEqual(events, []);
});

test('transition-only composition fails closed before SQL or HTTP for invalid isolation, issuer or route',async()=>{
 const events=[];
 const make=(user,uri)=>({
  options:{user,connectionString:uri},
  query(){events.push('query');},
  async connect(){events.push('connect');throw Error('unexpected_sql');},
 });
 const staffPool=make('sabora_staff_reader','postgres://staff');
 const operationsPool=make('sabora_operations','postgres://operations');
 const app={
  hasRoute(){return false;},
  get(){events.push('get');},
  post(){events.push('post');},
 };
 const base={staffPool,operationsPool,
  staffRole:'sabora_staff_reader',operationsRole:'sabora_operations',
  issueTransitionCapability(){},
  issuer:'https://issuer.example.test',
  getTrustedKeys:async()=>[],
 };
 for(const options of [
  {...base,operationsPool:staffPool},
  {...base,operationsRole:base.staffRole},
  {...base,issueTransitionCapability:null},
 ]) {
  await assert.rejects(registerVerifiedOrderTransitionsOnlyFromPools(app,options),
   /pool_isolation|capability_issuer/);
  assert.deepEqual(events,[]);
 }
 await assert.rejects(registerVerifiedOrderTransitionsOnlyFromPools({
  ...app,hasRoute(){return true;},
 },base),/route_registration/);
 assert.deepEqual(events,[]);
 await assert.rejects(registerVerifiedOrderTransitionsOnlyFromPools(app,base),
  /unexpected_sql/);
 assert.deepEqual(events,['connect']);
});

test('transition-only composition verifies two independent SQL principals before mounting POST',async t=>{
 const seen=[];
 function inspectedPool(role,authorized){
  return {
   options:{user:role,connectionString:'postgres://'+role},
   query(){throw Error('unexpected_staff_query');},
   async connect(){
    seen.push('connect:'+role);
    return {
     async query(sql){
      assert.match(sql,/current_user/);
      seen.push('inspect:'+role);
      return {rows:[{
       current_role:role,session_role:role,
       superuser:false,bypass_rls:false,can_login:true,
       inherits_roles:false,can_create_role:false,can_create_db:false,
       can_replicate:false,has_role_memberships:false,
       connection_limit:-1,password_valid_until:null,
       schema_usage:true,schema_create:false,database_create:false,
       candidate_rpc_execute:false,authorized_rpc_execute:authorized,
       unsafe_actor_rpc_execute:0,accessible_private_tables:0,
       accessible_private_sequences:0,
       accessible_private_definer_routines:authorized?1:0,
       candidate_is_invoker:true,authorized_is_definer:true,
       authorized_owner:'sabora_order_operations_fn_owner',
       authorized_search_path_locked:true,authorized_owner_is_sealed:true,
       authorized_owner_memberships:0,forced_rls_transition_requests:1,
       forced_rls_signing_keys:1,
      }]};
     },
     release(error){assert.equal(error,null);seen.push('release:'+role);},
    };
   },
  };
 }
 const app=Fastify();t.after(()=>app.close());
 await registerVerifiedOrderTransitionsOnlyFromPools(app,{
  staffPool:inspectedPool('sabora_staff_reader',false),
  operationsPool:inspectedPool('sabora_operations',true),
  staffRole:'sabora_staff_reader',operationsRole:'sabora_operations',
  issuer:'https://issuer.example.test',
  getTrustedKeys:async()=>[],
  issueTransitionCapability:()=>({}),
 });
 await app.ready();
 assert.deepEqual(seen,[
  'connect:sabora_staff_reader','inspect:sabora_staff_reader','release:sabora_staff_reader',
  'connect:sabora_operations','inspect:sabora_operations','release:sabora_operations',
 ]);
 assert.equal(app.hasRoute({method:'POST',
  url:'/api/v1/operations/order-lines/:lineId/transitions'}),true);
 assert.equal(app.hasRoute({method:'GET',url:'/api/v1/operations/order-lines'}),false);
 assert.equal(app.hasRoute({method:'GET',url:'/api/v1/operations/orders/:orderId/history'}),false);
 const result=await app.inject({method:'POST',
  url:'/api/v1/operations/order-lines/30000000-0000-4000-8000-000000000003/transitions',
  payload:{targetStatus:'preparing',correlationId:'restricted_route_01'}});
 assert.equal(result.statusCode,401,result.body);
 assert.deepEqual(seen,[
  'connect:sabora_staff_reader','inspect:sabora_staff_reader','release:sabora_staff_reader',
  'connect:sabora_operations','inspect:sabora_operations','release:sabora_operations',
 ]);
});

test('transition-only rejects missing or malformed authentication wiring without SQL or routes',async()=>{
 const seen=[];
 const mkPool=(user)=>({
  options:{user,connectionString:'postgres://'+user},
  query(){seen.push('query');throw Error('unexpected_query');},
  async connect(){seen.push('connect');throw Error('unexpected_connect');},
 });
 const app={
  hasRoute(){return false;},
  get(){seen.push('get');},
  post(){seen.push('post');},
 };
 const base={
  staffPool:mkPool('sabora_staff_reader'),
  operationsPool:mkPool('sabora_operations'),
  staffRole:'sabora_staff_reader',operationsRole:'sabora_operations',
  issueTransitionCapability(){},
  issuer:'https://issuer.example.test',
  getTrustedKeys:async()=>[],
 };
 for(const change of [
  {issuer:undefined},{issuer:''},{issuer:7},
  {getTrustedKeys:null},{getTrustedKeys:'not_a_function'},
  {verify:'not_a_function'},{observe:'not_a_function'},
 ]) {
  await assert.rejects(registerVerifiedOrderTransitionsOnlyFromPools(app,{
   ...base,...change,
  }),/invalid_order_transition_auth_config/);
  assert.deepEqual(seen,[]);
 }
});
