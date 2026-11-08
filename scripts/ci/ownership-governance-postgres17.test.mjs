// Integrated governance gate, backed only by the PG17 container removed by CI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,randomBytes,generateKeyPairSync,sign} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';
import {createRoleScopedPostgresTransaction} from '../../apps/api/src/role-scoped-postgres.mjs';
import {createStaffProtectedHooksFromPool} from '../../apps/api/src/staff-protected-hooks-from-pool.mjs';
import {OWNERSHIP_ROLE,OWNERSHIP_SQL,createOwnershipCapabilityIssuer,
 assertOwnershipRuntimeIdentity,createOwnershipGovernanceRepository,
 registerOwnershipGovernanceHttp} from '../../apps/api/src/ownership-governance-candidate.mjs';

const target=process.env.SABORA_CI_PG_URL,mod=process.env.SABORA_CI_PG_MODULE;
if(process.env.GITHUB_ACTIONS!=='true'||!target||!mod||!isDisposablePgModulePath(mod))
 throw Error('disposable_ownership_harness_required');
const uri=new URL(target);
if(uri.protocol!=='postgresql:'||uri.hostname!=='127.0.0.1'||uri.username!=='postgres'||
 uri.password!=='sabora_ci_ephemeral_only'||uri.pathname!=='/postgres'||!uri.port||uri.search||uri.hash)
 throw Error('unsafe_ownership_harness_target');
const {Pool}=createRequire(import.meta.url)(mod);
const Fastify=createRequire(new URL('../../apps/api/package.json',import.meta.url))('fastify');

test('PG17 JWT/HMAC Fastify and management Chromium: ownership requests, transfer, ROOT force and stale writer denial',
 {timeout:180_000},async()=>{
 const suffix=process.pid.toString(36),login='sabora_owner_sql_'+suffix,
  staffLogin='sabora_owner_staff_'+suffix,keyId='ownership_ci_'+suffix;
 const password='sabora_governance_ci_'+randomBytes(16).toString('hex');
 const admin=new Pool({connectionString:target,max:3});
 const [a,b,c]=[randomUUID(),randomUUID(),randomUUID()];
 const secret=randomBytes(32),pools=[];
 let api,vite,browser,originalOwner=null;
 try{
  originalOwner=(await admin.query('SELECT owner_user_id FROM sabora.admin_write_ownership WHERE singleton')).rows[0].owner_user_id;
  let root=(await admin.query("SELECT user_id FROM sabora.staff_members WHERE role='root' AND state='active'")).rows[0]?.user_id;
  if(!root){root=randomUUID();await admin.query("INSERT INTO sabora.staff_members(user_id,role,state) VALUES($1,'root','active')",[root]);}
  await admin.query("INSERT INTO sabora.staff_members(user_id,role,state) VALUES($1,'admin','active'),($2,'admin','active'),($3,'admin','active')",[a,b,c]);
  await admin.query('UPDATE sabora.admin_write_ownership SET owner_user_id=$1 WHERE singleton',[a]);
  await admin.query("INSERT INTO sabora.order_operation_signing_keys(key_id,hmac_key,not_before,expires_at) VALUES($1,$2,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour')",[keyId,secret]);
  for(const name of [login,staffLogin])
   await admin.query('CREATE ROLE '+name+" LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+password+"'");
  await admin.query('GRANT '+OWNERSHIP_ROLE+' TO '+login+' WITH SET TRUE, INHERIT FALSE');
  await admin.query('GRANT USAGE ON SCHEMA sabora TO '+staffLogin);
  await admin.query('GRANT SELECT(user_id,role,state) ON sabora.staff_members TO '+staffLogin);
  await admin.query('CREATE POLICY ci_owner_staff_'+suffix+' ON sabora.staff_members FOR SELECT TO '+staffLogin+' USING(true)');
  for(const name of [login,staffLogin]){
   const url=new URL(target);url.username=name;url.password=password;
   pools.push(new Pool({connectionString:url.toString(),max:3,connectionTimeoutMillis:3000,
    options:'-c statement_timeout=15000'}));
  }
  await assertOwnershipRuntimeIdentity({pool:pools[0],expectedLogin:login});
  await assert.rejects(pools[0].query('UPDATE sabora.admin_write_ownership SET owner_user_id=$1 WHERE singleton',[b]),
   /permission denied/);
  await assert.rejects(pools[0].query(OWNERSHIP_SQL,['{}','force','{}']),/permission denied/);
  const withTransaction=createRoleScopedPostgresTransaction({pool:pools[0],role:OWNERSHIP_ROLE,
   allowedSql:new Set([OWNERSHIP_SQL])});
  const issueCapability=createOwnershipCapabilityIssuer({keyId,secret,databaseRole:login});
  const repo=createOwnershipGovernanceRepository({withTransaction,issueCapability});
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const issuer='https://sabora-ci-ownership.test/auth/v1';
  const jwk={...publicKey.export({format:'jwk'}),alg:'RS256',kid:'ownership-ci-'+suffix,use:'sig'};
  const jwt=user=>{
   const now=Math.floor(Date.now()/1000);
   const h=Buffer.from(JSON.stringify({typ:'JWT',alg:'RS256',kid:jwk.kid})).toString('base64url');
   const p=Buffer.from(JSON.stringify({iss:issuer,aud:'authenticated',sub:user,role:'authenticated',iat:now,exp:now+3600})).toString('base64url');
   return h+'.'+p+'.'+sign('RSA-SHA256',Buffer.from(h+'.'+p),privateKey).toString('base64url');
  };
  api=Fastify({logger:false,trustProxy:false});
  const staffRoles=createStaffProtectedHooksFromPool({pool:pools[1],issuer,getTrustedKeys:async()=>[jwk]});
  const forRoles=roles=>async(request,reply)=>{
   for(const hook of staffRoles(roles)){await hook(request,reply);if(reply.sent)return;}
  };
  registerOwnershipGovernanceHttp(api,{forRoles,repository:repo});await api.ready();
  // This is not an isolated substitute test: it pinpoints whether a failed
  // full-stack HTTP authorization came from DB/HMAC or verified membership.
  const membership=(await pools[1].query(
   'select role, state from sabora.staff_members where user_id = $1',[b])).rows[0];
  assert.deepEqual(membership,{role:'admin',state:'active'},
   'independent staff reader must see durable membership');
  // Critical integration diagnostic: check exact signer and RLS preconditions
  // without exposing a key, token or signature in logs or HTTP responses.
  const signedProbe=issueCapability({actorId:b,staffRole:'admin',
   action:'ownership.read',requestId:randomUUID(),body:'ownership.read'});
  const probe=(await admin.query(\`WITH cap AS (SELECT $1::jsonb AS c)
   SELECT
    (c->>'databaseRole'=$2) AS audience,
    (c->>'staffRole'='admin') AS staff_role,
    (c->>'action'='ownership.read') AS action,
    (c->>'bodyHashHex'=encode(extensions.digest(
     convert_to('ownership.read','UTF8'),'sha256'),'hex')) AS body_hash,
    (SELECT encode(extensions.hmac(convert_to(
      'sabora-ownership-v1'||chr(10)||(c->>'databaseRole')||chr(10)||
      (c->>'actorId')||chr(10)||(c->>'staffRole')||chr(10)||
      (c->>'action')||chr(10)||(c->>'requestId')||chr(10)||
      (c->>'bodyHashHex')||chr(10)||(c->>'issuedAtMs')||chr(10)||
      (c->>'expiresAtMs'),'UTF8'),hmac_key,'sha256'),'hex')
     FROM sabora.order_operation_signing_keys WHERE key_id=$3)
     =c->>'signatureHex' AS signature,
    (c->>'issuedAtMs')::bigint >=
     floor(extract(epoch FROM clock_timestamp())*1000)::bigint-60000 AS issued_fresh,
    (c->>'expiresAtMs')::bigint >
     floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS unexpired
   FROM cap\`,[JSON.stringify(signedProbe),login,keyId])).rows[0];
  assert(Object.values(probe).every(v=>v===true),
   'signed governance input invalid: '+
   Object.keys(probe).filter(k=>probe[k]!==true).join(','));
  const sealed=await admin.connect();
  try{
   await sealed.query('BEGIN');
   await sealed.query('SET LOCAL ROLE sabora_ownership_fn_owner');
   const rows=(await sealed.query(\`SELECT
    (SELECT count(*)::integer FROM sabora.admin_write_ownership WHERE singleton) AS ownership,
    (SELECT count(*)::integer FROM sabora.staff_members WHERE user_id=$1
      AND role='admin' AND state='active') AS staff,
    (SELECT count(*)::integer FROM sabora.order_operation_signing_keys
      WHERE key_id=$2 AND disabled_at IS NULL
       AND not_before<=clock_timestamp() AND expires_at>clock_timestamp()) AS keyring\`,
    [b,keyId])).rows[0];
   assert.deepEqual(rows,{ownership:1,staff:1,keyring:1},
    'sealed governance principal must see active staff, keyring and owner under FORCE RLS');
  }finally{await sealed.query('ROLLBACK').catch(()=>{});sealed.release();}
  let signedRead;
  try{
   signedRead=await repo.read({
    verifiedIdentity:{userId:b},verifiedStaff:{userId:b,role:'admin'}});
  }catch(cause){
   throw new Error('signed_ownership_rpc_preflight:'+String(cause?.code??'none')+
    ':'+String(cause?.message??'unknown'),{cause});
  }
  assert.equal(signedRead.ownerUserId,a,'signed SQL self-projection must precede HTTP');
  const read=id=>api.inject({method:'GET',url:'/api/v1/admin/ownership',
   headers:{authorization:'Bearer '+jwt(id)}});
  const post=(id,action,props={})=>api.inject({method:'POST',
   url:'/api/v1/admin/ownership/actions',headers:{authorization:'Bearer '+jwt(id)},
   payload:{requestId:props.requestId??randomUUID(),action,
    proposalId:props.proposalId??null,targetUserId:props.targetUserId??null,
    reason:props.reason??null}});
  assert.equal((await api.inject('/api/v1/admin/ownership')).statusCode,401);
  const original=await read(b);assert.equal(original.statusCode,200,original.body);
  assert.equal(original.json().ownerUserId,a);
  assert.equal(original.json().actorUserId,b);
  const correlation=randomUUID(),req=await post(b,'request',{requestId:correlation});
  assert.equal(req.statusCode,200,req.body);
  const proposalId=req.json().proposalId;assert(proposalId);
  assert.equal((await post(b,'request',{requestId:correlation})).json().replayed,true);
  assert((await read(a)).json().proposals.some(p=>p.id===proposalId));
  assert.equal((await post(b,'accept',{proposalId})).statusCode,403);
  assert.equal((await post(a,'reject',{proposalId})).statusCode,200);
  assert.equal((await read(a)).json().ownerUserId,a);
  const cancelledRequest=await post(b,'request');
  assert.equal(cancelledRequest.statusCode,200,cancelledRequest.body);
  assert.equal((await post(c,'cancel',{proposalId:cancelledRequest.json().proposalId})).statusCode,403,
   'unrelated ADMIN cannot cancel another actor request');
  assert.equal((await post(b,'cancel',{proposalId:cancelledRequest.json().proposalId})).statusCode,200);
  assert.equal((await read(a)).json().ownerUserId,a,
   'cancellation does not transfer ownership');
  const again=await post(b,'request');
  assert.equal((await post(a,'accept',{proposalId:again.json().proposalId})).statusCode,200);
  assert.equal((await read(b)).json().ownerUserId,b);
  assert.equal((await post(a,'offer',{targetUserId:c})).statusCode,403,
   'old ADMIN cannot continue writing with its existing JWT');
  const offer=await post(b,'offer',{targetUserId:c});
  assert.equal((await post(c,'reject',{proposalId:offer.json().proposalId})).statusCode,200);
  const cancelledOffer=await post(b,'offer',{targetUserId:c});
  assert.equal(cancelledOffer.statusCode,200,cancelledOffer.body);
  assert.equal((await post(b,'cancel',{proposalId:cancelledOffer.json().proposalId})).statusCode,200);
  assert.equal((await read(b)).json().ownerUserId,b,
   'offer cancellation does not transfer ownership');
  const offer2=await post(b,'offer',{targetUserId:c});
  assert.equal((await post(c,'accept',{proposalId:offer2.json().proposalId})).statusCode,200);
  assert.equal((await read(c)).json().ownerUserId,c);
  assert.equal((await post(root,'offer',{targetUserId:b})).statusCode,403);
  assert.equal((await post(root,'force',{targetUserId:a,reason:''})).statusCode,400);
  const forced=await post(root,'force',{targetUserId:a,reason:'Recuperación integral aislada'});
  assert.equal(forced.statusCode,200,forced.body);
  assert.equal((await read(a)).json().ownerUserId,a);
  assert((await read(c)).json().notifications.some(n=>n.action==='force_transfer'));
  const audit=(await admin.query("SELECT reason FROM sabora.admin_ownership_audit WHERE actor_user_id=$1 AND action='force_transfer' ORDER BY id DESC LIMIT 1",[root])).rows[0];
  assert.equal(audit.reason,'Recuperación integral aislada');
  const offerB=await post(a,'offer',{targetUserId:b});
  const offerC=await post(a,'offer',{targetUserId:c});
  const competing=await Promise.all([
   post(b,'accept',{proposalId:offerB.json().proposalId}),
   post(c,'accept',{proposalId:offerC.json().proposalId})
  ]);
  assert.deepEqual(competing.map(r=>r.statusCode).sort(),[200,409]);
  const owner=(await read(root)).json().ownerUserId;
  assert([b,c].includes(owner));
  assert.equal((await admin.query('SELECT count(*)::integer AS n FROM sabora.admin_write_ownership WHERE singleton')).rows[0].n,1);

  // REAL PWA Chromium with Vite -> Fastify authenticated proxy -> PG17.
  const apiUrl=await api.listen({host:'127.0.0.1',port:0});
  const managementRequire=createRequire(new URL('../../apps/management/package.json',import.meta.url));
  const {createServer}=await import(pathToFileURL(managementRequire.resolve('vite')).href);
  vite=await createServer({root:fileURLToPath(new URL('../../apps/management/',import.meta.url)),
   mode:'test',logLevel:'error',server:{host:'127.0.0.1',port:0,hmr:false,
    proxy:{'/api':apiUrl}}});
  await vite.listen();
  const {chromium}=await import(pathToFileURL(process.env.SABORA_CI_PLAYWRIGHT_MODULE).href);
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();
  await page.goto(vite.resolvedUrls.local[0]+'#equipo');
  await page.evaluate(async token=>{
   const app=await import('/src/main.tsx');
   window.ownershipClose=app.mountAuthenticatedManagementApp({
    element:document.getElementById('root'),getAccessToken:async()=>token,
    enableOwnershipGovernance:true});
  },jwt(owner));
  await page.getByRole('heading',{name:'Titularidad de escritura'}).waitFor({timeout:20000});
  await page.getByText('Titular: …'+owner.slice(-12)+' (tu cuenta)').waitFor({timeout:20000});
  await page.getByLabel('ADMIN destinatario de cesión').selectOption(a);
  await page.getByRole('button',{name:'Ofrecer cesión'}).click();
  await page.getByText('La decisión se ha registrado con auditoría.').waitFor({timeout:20000});
  assert.equal((await admin.query("SELECT count(*)::integer AS n FROM sabora.admin_ownership_proposals WHERE kind='offer' AND from_owner_id=$1 AND to_owner_id=$2 AND status='pending'",[owner,a])).rows[0].n,1);
 }finally{
  await browser?.close().catch(()=>{});
  await vite?.close().catch(()=>{});
  await api?.close().catch(()=>{});
  for(const pool of pools)await pool.end().catch(()=>{});
  await admin.query('UPDATE sabora.admin_write_ownership SET owner_user_id=$1 WHERE singleton',[originalOwner]).catch(()=>{});
  await admin.end().catch(()=>{});
 }
});
