// Operator-only, no CI or automatic execution. Uses real hosted Auth,
// a new disposable nonstaff identity, and an isolated Chromium authenticator.
// No deployment, SQL, actual email delivery or Sabora role assignment.
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {verifySupabaseAccessToken} from '../../apps/api/src/auth.mjs';
import {isolatedBrowserEnvironment,findDisposableIdentity,isDisposableIdentity} from './sabora-hosted-auth-exercise-safety.mjs';
const issuer='https://byhvmumqivmunkmomhup.supabase.co/auth/v1';
const origin='https://gestion-sabora.allaiso.com:8443',rpId=new URL(origin).hostname;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const check=(value,code)=>{if(!value)throw Error(code);};
if(process.argv.slice(2).join(' ')!=='--confirm-provider-only'||process.env.CI==='true'||process.stdin.isTTY)
 throw Error('operator_only_read_keys_from_private_stdin');
let input='';
for await(const chunk of process.stdin){input+=chunk;check(input.length<1024,'invalid_key_input');}
const [pub,secret,...extra]=input.trimEnd().split('\n');input='';
check(extra.length===0&&/^sb_publishable_[A-Za-z0-9_-]{20,150}$/.test(pub??'')&&
 /^sb_secret_[A-Za-z0-9_-]{20,150}$/.test(secret??''),'invalid_key_input');
const {chromium}=createRequire(resolve('apps/client/package.json'))('@playwright/test');
const email='sabora-auth-probe-'+randomUUID()+'@example.com';
let browser,subject=null,creationAttempted=false,cleaned=false,keys,stage='preflight';
const sessions=new Set();
async function call(path,{method='GET',admin=false,token,data,deny=[]}={}){
 const response=await fetch(issuer+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),
  headers:{accept:'application/json',apikey:admin?secret:pub,
   ...(token?{Authorization:'Bearer '+token}:{}),...(data===undefined?{}:{'content-type':'application/json'})},
  ...(data===undefined?{}:{body:JSON.stringify(data)})});
 if(deny.includes(response.status)){
  let body=null;try{body=await response.json();}catch{}
  return {denied:true,code:typeof body?.error_code==='string'&&/^[a-z_]{1,80}$/.test(body.error_code)?body.error_code:'unknown'};
 }
 if(!response.ok){
  let body=null;try{body=await response.json();}catch{}
  const code=typeof body?.error_code==='string'&&/^[a-z_]{1,80}$/.test(body.error_code)?body.error_code:'unknown';
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
 sessions.add(token);
 const user=await call('/user',{token});
 check(user?.id===subject&&user.email===email&&user.is_anonymous===false&&
  typeof user.email_confirmed_at==='string','confirmed_email_mismatch');
 return id;
}
async function exchange(type){
 const result=await call('/admin/generate_link',{admin:true,method:'POST',data:{type,email,redirect_to:origin}});
 check(isDisposableIdentity(result,email),'generated_link_identity_mismatch');
 if(type==='invite')subject=result.id;
 check(subject===result.id&&result.verification_type===type&&typeof result.hashed_token==='string','generated_link_purpose_mismatch');
 const verified=await call('/verify',{method:'POST',data:{type,token_hash:result.hashed_token}});
 await verifyUser(verified?.access_token,false);return verified.access_token;
}
async function device(){
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',route=>route.request().url()===origin+'/'?
  route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Sabora isolated Auth exercise</title>'}):route.abort());
 const page=await context.newPage(),cdp=await context.newCDPSession(page);
 await cdp.send('WebAuthn.enable');
 await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',
  hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
 await page.goto(origin+'/');
 check(await page.evaluate(()=>window.isSecureContext&&location.origin==='https://gestion-sabora.allaiso.com:8443'&&
  typeof PublicKeyCredential.parseCreationOptionsFromJSON==='function'),'isolated_origin_unavailable');
 return {context,page};
}
async function register(device,token){
 const response=await call('/passkeys/registration/options',{method:'POST',token,data:{}});
 check(UUID.test(response?.challenge_id??'')&&response.options?.rp?.id===rpId,'registration_options_mismatch');
 const credential=await device.page.evaluate(async options=>{
  const publicKey=PublicKeyCredential.parseCreationOptionsFromJSON(options);
  const result=await navigator.credentials.create({publicKey:{...publicKey,
   authenticatorSelection:{...publicKey.authenticatorSelection,residentKey:'required',userVerification:'required'}}});
  return result.toJSON();
 },response.options);
 const result=await call('/passkeys/registration/verify',{method:'POST',token,
  data:{challenge_id:response.challenge_id,credential}});
 check(UUID.test(result?.id??''),'registration_receipt_invalid');
 return {id:result.id,credentialId:credential.id};
}
async function login(device,expected,negative=false){
 const response=await call('/passkeys/authentication/options',{method:'POST',data:{}});
 check(UUID.test(response?.challenge_id??'')&&response.options?.rpId===rpId,'authentication_options_mismatch');
 const credential=await device.page.evaluate(async ({options,id})=>{
  const parsed=PublicKeyCredential.parseRequestOptionsFromJSON({...options,allowCredentials:[{type:'public-key',id}]});
  return (await navigator.credentials.get({publicKey:{...parsed,userVerification:'required'}})).toJSON();
 },{options:response.options,id:expected.credentialId});
 check(credential.id===expected.credentialId,'assertion_credential_mismatch');
 const result=await call('/passkeys/authentication/verify',{method:'POST',data:{challenge_id:response.challenge_id,credential},
  deny:negative?[400,401,403,422]:[]});
 if(negative){check(result?.denied===true&&result.code==='webauthn_credential_not_found','old_credential_not_proven_revoked');return;}
 await verifyUser(result?.access_token,true);return result.access_token;
}
async function list(){
 const result=await call('/admin/users/'+subject+'/passkeys',{admin:true});
 const items=Array.isArray(result)?result:result?.passkeys;
 check(Array.isArray(items)&&items.every(x=>UUID.test(x?.id??'')),'admin_passkey_list_invalid');
 return items.map(x=>x.id);
}
try{
 keys=(await call('/.well-known/jwks.json')).keys;check(Array.isArray(keys),'jwks_invalid');
 // This temporary exercise is designed for the still-empty Auth project.
 // Do not inspect or mutate existing identities if that assumption changes.
 const initial=await call('/admin/users?page=1&per_page=1',{admin:true});
 check(Array.isArray(initial?.users)&&initial.users.length===0,'auth_project_not_empty');
 browser=await chromium.launch({headless:true,env:isolatedBrowserEnvironment(process.env,[pub,secret])});
 const first=await device(),second=await device();
 console.log('Disposable identity: '+email);
 stage='invite';creationAttempted=true;
 const invited=await exchange('invite');
 check((await list()).length===0,'unexpected_existing_passkeys');
 stage='first_registration';const old=await register(first,invited);
 check((await list()).length===1&&(await list()).includes(old.id),'first_registration_missing');
 const oldSession=await login(first,old);console.log('INVITE_REGISTER_LOGIN PASS');
 stage='recovery_exchange';const recovery=await exchange('recovery');
 stage='replacement_registration';const replacement=await register(second,recovery);
 check(replacement.id!==old.id&&replacement.credentialId!==old.credentialId,'replacement_not_distinct');
 const newSession=await login(second,replacement);
 const ids=await list();check(ids.length===2&&ids.includes(old.id)&&ids.includes(replacement.id),'replacement_list_mismatch');
 console.log('RECOVERY_SAME_UUID_NEW_PASSKEY PASS');
 stage='revocation';
 await call('/admin/users/'+subject+'/passkeys/'+old.id,{admin:true,method:'DELETE'});
 const remaining=await list();check(remaining.length===1&&remaining[0]===replacement.id,'revocation_list_mismatch');
 await login(first,old,true);console.log('OLD_PASSKEY_REJECTED PASS');
 await call('/logout?scope=global',{method:'POST',token:newSession});
 // Global logout is not assumed to invalidate JWTs immediately. The
 // application must prove its own local session/credential fence separately.
 const after=await call('/user',{token:oldSession,deny:[401,403]});
 console.log('OLD_JWT_AFTER_LOGOUT '+(after?.denied?'REJECTED':'STILL_ACCEPTED_OR_UNEXPIRED'));
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
  for(const token of sessions){try{await call('/logout?scope=local',{method:'POST',token,deny:[401,403]});}catch{/* deletion below remains mandatory */}}
  try{
   const current=await call('/admin/users/'+subject,{admin:true,deny:[404]});
   check(current?.denied===true||isDisposableIdentity(current,email,subject),'cleanup_identity_mismatch');
   if(!current?.denied)await call('/admin/users/'+subject,{admin:true,method:'DELETE'});
   cleaned=(await call('/admin/users/'+subject,{admin:true,deny:[404]}))?.denied===true;
  }catch{/* report exact fictitious email for reconciliation; never bulk delete */}
 }
 if(creationAttempted&&!cleaned){console.error('CLEANUP NOT PROVEN; reconcile only disposable identity '+email);process.exitCode=1;}
 else if(cleaned)console.log('DISPOSABLE_AUTH_USER_DELETED PASS');
 await browser?.close();
}
if(stage==='completed'&&cleaned)console.log('HOSTED_AUTH_PROVIDER_EXERCISE PASS; no Sabora membership, PWA deployment, real device or email delivery certified.');
