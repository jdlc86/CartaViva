// Operator-only, no CI or automatic execution. Uses real hosted Auth,
// a new disposable nonstaff identity, and an isolated Chromium authenticator.
// No deployment, SQL, actual email delivery or Sabora role assignment.
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {verifySupabaseAccessToken} from '../../apps/api/src/auth.mjs';
import {isolatedBrowserEnvironment,findDisposableIdentity,isDisposableIdentity,
 verifyExerciseAssertion,isRevokedExerciseCredential,createExerciseDevice,
 authExerciseErrorCode} from './sabora-hosted-auth-exercise-safety.mjs';
const issuer='https://byhvmumqivmunkmomhup.supabase.co/auth/v1';
const origin='https://gestion-sabora.allaiso.com:8443',rpId=new URL(origin).hostname;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const check=(value,code)=>{if(!value)throw Error(code);};
if(process.argv.slice(2).join(' ')!=='--confirm-provider-only'||process.env.CI==='true'||
 process.env.GITHUB_ACTIONS||process.stdin.isTTY||process.env.DEBUG||process.env.NODE_DEBUG||process.env.PWDEBUG)
 throw Error('operator_only_read_keys_from_private_stdin');
let input='';
for await(const chunk of process.stdin){input+=chunk;check(input.length<1024,'invalid_key_input');}
const [pub,secret,...extra]=input.trimEnd().split(/\r?\n/);input='';
check(extra.length===0&&/^sb_publishable_[A-Za-z0-9_-]{20,150}$/.test(pub??'')&&
 /^sb_secret_[A-Za-z0-9_-]{20,150}$/.test(secret??''),'invalid_key_input');
const {chromium}=createRequire(resolve('apps/client/package.json'))('@playwright/test');
const email='sabora-auth-probe-'+randomUUID()+'@example.com';
let browser,subject=null,creationAttempted=false,cleaned=false,keys,stage='preflight';
const sessions=new Map();
async function call(path,{method='GET',admin=false,token,data,deny=[]}={}){
 const response=await fetch(issuer+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),
  headers:{accept:'application/json',apikey:admin?secret:pub,
   ...(token?{Authorization:'Bearer '+token}:{}),...(data===undefined?{}:{'content-type':'application/json'})},
  ...(data===undefined?{}:{body:JSON.stringify(data)})});
 if(!response.ok){
  let body=null;try{body=await response.json();}catch{}
  const code=authExerciseErrorCode(body);
  if(deny.includes(response.status))return {denied:true,status:response.status,code};
  throw Error('auth_http_'+response.status+'_'+code);
 }
 if(response.status===204)return null;
 const body=await response.text();return body?JSON.parse(body):null;
}
async function verifyUser(token,passkey){
 const id=verifySupabaseAccessToken(token,{issuer,keys,requirePasskey:passkey,requireEnrollmentSession:!passkey});
 check(id.userId===subject,'uuid_mismatch');
 // Track only a cryptographically verified token for this exact subject,
 // even if the subsequent provider user lookup fails.
 check(!sessions.has(id.sessionId),'session_not_fresh');
 sessions.set(id.sessionId,token);
 const user=await call('/user',{token});
 check(user?.id===subject&&user.email===email&&user.is_anonymous===false&&
  typeof user.email_confirmed_at==='string','confirmed_email_mismatch');
 return id;
}
async function exchange(type){
 const result=await call('/admin/generate_link',{admin:true,method:'POST',data:{type,email,redirect_to:origin}});
 check(isDisposableIdentity(result,email),'generated_link_identity_mismatch');
 if(type==='invite')subject=result.id;
 check(subject===result.id&&result.verification_type===type&&typeof result.hashed_token==='string'&&
  [origin,origin+'/'].includes(result.redirect_to),'generated_link_purpose_mismatch');
 const verified=await call('/verify',{method:'POST',data:{type,token_hash:result.hashed_token}});
 await verifyUser(verified?.access_token,false);return verified.access_token;
}
function checkedOptions(response,expectedRp){
 check(UUID.test(response?.challenge_id??'')&&expectedRp===rpId&&
  typeof response.options.challenge==='string'&&/^[A-Za-z0-9_-]{16,512}$/.test(response.options.challenge)&&
  Number.isSafeInteger(response.expires_at)&&response.expires_at>Date.now()/1000,'passkey_options_mismatch');
 return response;
}
async function authenticationOptions(){
 const response=await call('/passkeys/authentication/options',{method:'POST',data:{}});
 checkedOptions(response,response?.options?.rpId);
 check(response.options.allowCredentials===undefined||
  (Array.isArray(response.options.allowCredentials)&&response.options.allowCredentials.length===0),
 'expected_discoverable_passkey_options');
 return response;
}
async function register(device,token){
 const response=await call('/passkeys/registration/options',{method:'POST',token,data:{}});
 checkedOptions(response,response?.options?.rp?.id);
 const credential=await device.page.evaluate(async options=>{
  const publicKey=PublicKeyCredential.parseCreationOptionsFromJSON(options);
  const result=await navigator.credentials.create({publicKey:{...publicKey,
   authenticatorSelection:{...publicKey.authenticatorSelection,residentKey:'required',userVerification:'required'}}});
  return result.toJSON();
 },response.options);
 const result=await call('/passkeys/registration/verify',{method:'POST',token,
  data:{challenge_id:response.challenge_id,credential}});
 const {publicKey,publicKeyAlgorithm:algorithm}=credential.response;
 check(UUID.test(result?.id??'')&&typeof publicKey==='string'&&[-7,-257].includes(algorithm),'registration_receipt_invalid');
 return {id:result.id,credentialId:credential.id,publicKey,algorithm};
}
async function login(device,expected,negative=false){
 const response=await authenticationOptions();
 const credential=await device.page.evaluate(async options=>{
  const parsed=PublicKeyCredential.parseRequestOptionsFromJSON(options);
  return (await navigator.credentials.get({publicKey:{...parsed,userVerification:'required'}})).toJSON();
 },response.options);
 check(verifyExerciseAssertion(credential,{id:expected.credentialId,publicKey:expected.publicKey,
  algorithm:expected.algorithm,challenge:response.options.challenge,origin,rpId}),'local_assertion_verification_failed');
 const result=await call('/passkeys/authentication/verify',{method:'POST',data:{challenge_id:response.challenge_id,credential},
  deny:negative?[400,404]:[]});
 if(negative&&result?.denied){
  check(isRevokedExerciseCredential(result),'old_credential_not_proven_revoked');
  return;
 }
 const identity=await verifyUser(result?.access_token,true);
 check(!negative,'old_credential_still_accepted');
 return {token:result.access_token,expiresAt:identity.expiresAt};
}
async function list(){
 const result=await call('/admin/users/'+subject+'/passkeys',{admin:true});
 const items=Array.isArray(result)?result:result?.passkeys;
 check(Array.isArray(items)&&items.every(x=>UUID.test(x?.id??'')),'admin_passkey_list_invalid');
 return items.map(x=>x.id);
}
async function requireOnlyFixture(){
 const result=await call('/admin/users?page=1&per_page=2',{admin:true});
 check(Array.isArray(result?.users)&&(subject?
  result.users.length===1&&isDisposableIdentity(result.users[0],email,subject):
  result.users.length===0),'auth_project_scope_mismatch');
}
const userAbsent=value=>value?.denied===true&&value.status===404&&value.code==='user_not_found';
try{
 keys=(await call('/.well-known/jwks.json')).keys;
 check(Array.isArray(keys)&&keys.some(k=>k?.kty==='RSA'&&k.alg==='RS256'&&k.use==='sig'),'jwks_invalid');
 await authenticationOptions();
 browser=await chromium.launch({headless:true,env:isolatedBrowserEnvironment(process.env,[pub,secret])});
 const first=await createExerciseDevice(browser,origin);
 const second=await createExerciseDevice(browser,origin);
 await requireOnlyFixture();
 console.log('PREFLIGHT_EXACT_ORIGIN_RP_AND_EMPTY_AUTH PASS');
 console.log('Disposable identity: '+email);
 stage='invite';creationAttempted=true;
 const invited=await exchange('invite');
 await requireOnlyFixture();
 console.log('INVITATION_WITHOUT_DELIVERY_CONFIRMED PASS');
 check((await list()).length===0,'unexpected_existing_passkeys');
 stage='first_registration';const old=await register(first,invited);
 const firstList=await list();
 check(firstList.length===1&&firstList[0]===old.id,'first_registration_missing');
 await login(first,old);console.log('INVITE_REGISTER_LOGIN PASS');
 stage='recovery_exchange';const recovery=await exchange('recovery');
 stage='replacement_registration';const replacement=await register(second,recovery);
 check(replacement.id!==old.id&&replacement.credentialId!==old.credentialId,'replacement_not_distinct');
 const newSession=await login(second,replacement);
 const oldSession=await login(first,old);
 const ids=await list();check(ids.length===2&&ids.includes(old.id)&&ids.includes(replacement.id),'replacement_list_mismatch');
 console.log('RECOVERY_SAME_UUID_NEW_PASSKEY PASS');
 stage='revocation';
 await requireOnlyFixture();
 await call('/admin/users/'+subject+'/passkeys/'+old.id,{admin:true,method:'DELETE'});
 const remaining=await list();check(remaining.length===1&&remaining[0]===replacement.id,'revocation_list_mismatch');
 await login(first,old,true);console.log('OLD_PASSKEY_REJECTED PASS');
 stage='global_logout';
 await call('/logout?scope=global',{method:'POST',token:newSession.token});
 const after=await call('/user',{token:oldSession.token,deny:[401,403]});
 check(oldSession.expiresAt>Date.now()/1000,'old_jwt_expired_before_observation');
 check(after?.denied===true||isDisposableIdentity(after,email,subject),'old_jwt_observation_invalid');
 console.log('OLD_JWT_AFTER_LOGOUT '+(after?.denied?'REJECTED_UNEXPIRED':'ACCEPTED_UNEXPIRED'));
 stage='fresh_passkey_login';
 await login(second,replacement);console.log('NEW_PASSKEY_LOGIN_SAME_UUID PASS');
 stage='completed';
}catch(error){
 console.error('AUTH_EXERCISE FAIL stage='+stage+' code='+(/^[a-z0-9_]+$/.test(error?.message??'')?error.message:'unclassified'));
 process.exitCode=1;
}finally{
 // A lost create response is not proof that nothing was created. Never
 // replay the invitation. Reconcile only the exact random fixture address.
 if(creationAttempted&&!subject){
  try{
   const result=await call('/admin/users?page=1&per_page=100',{admin:true});
   subject=findDisposableIdentity(result?.users,email);
  }catch{/* unresolved: report exact fixture address and fail below */}
 }
 if(subject){
  for(const token of sessions.values()){try{await call('/logout?scope=local',{method:'POST',token,deny:[401,403]});}catch{/* deletion below remains mandatory */}}
  try{
   const path='/admin/users/'+subject;
   const current=await call(path,{admin:true,deny:[404]});
   if(userAbsent(current))cleaned=true;
   else{
    check(isDisposableIdentity(current,email,subject),'cleanup_identity_mismatch');
    try{await call(path,{admin:true,method:'DELETE'});}catch{/* Reconcile a possibly committed deletion without replay. */}
    cleaned=userAbsent(await call(path,{admin:true,deny:[404]}));
   }
  }catch{/* report exact fictitious email for reconciliation; never bulk delete */}
 }
 if(creationAttempted&&!cleaned){console.error('CLEANUP NOT PROVEN; reconcile only disposable identity '+email);process.exitCode=1;}
 else if(cleaned)console.log('DISPOSABLE_AUTH_USER_DELETED PASS');
 await browser?.close();
}
if(stage==='completed'&&cleaned)console.log('HOSTED_AUTH_PROVIDER_EXERCISE PASS; no Sabora membership, PWA deployment, real device or email delivery certified.');
