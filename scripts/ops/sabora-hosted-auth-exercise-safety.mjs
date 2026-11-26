import {createHash,createPublicKey,verify} from 'node:crypto';

// Safety checks and offline WebAuthn context for the manual Auth exercise.
// Never import or read credentials here.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIXTURE=/^sabora-auth-probe-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}@example\.com$/i;
const BROWSER_ENV=['PATH','HOME','USERPROFILE','SYSTEMROOT','WINDIR','TMP','TEMP','TMPDIR','LANG','LC_ALL','DISPLAY','WAYLAND_DISPLAY','XDG_RUNTIME_DIR','XDG_CACHE_HOME','LD_LIBRARY_PATH'];
export function isolatedBrowserEnvironment(environment,excluded=[]){
 const allowed={};
 for(const name of BROWSER_ENV){
  const value=environment[name];
  if(typeof value==='string'&&!excluded.some(key=>typeof key==='string'&&key.length>0&&value.includes(key)))allowed[name]=value;
 }
 return allowed;
}
export function isDisposableIdentity(user,email,subject){
 return typeof email==='string'&&FIXTURE.test(email)&&user?.email===email&&UUID.test(user?.id??'')&&
  (subject===undefined||user.id===subject);
}
export function findDisposableIdentity(users,email){
 if(!Array.isArray(users)||typeof email!=='string'||!FIXTURE.test(email))throw Error('fixture_reconciliation_invalid');
 const matches=users.filter(user=>user?.email===email);
 if(matches.length>1||matches.some(user=>!isDisposableIdentity(user,email)))throw Error('fixture_reconciliation_ambiguous');
 return matches.length===1?matches[0].id:null;
}

export function verifyExerciseAssertion(credential,{id,publicKey,algorithm,challenge,origin,rpId}){
 const decode=value=>{
  if(typeof value!=='string'||!value.length||value.length>16384||!/^[A-Za-z0-9_-]+$/.test(value))
   throw Error('invalid_assertion_encoding');
  const bytes=Buffer.from(value,'base64url');
  if(bytes.toString('base64url')!==value)throw Error('invalid_assertion_encoding');
  return bytes;
 };
 try{
  if(credential?.type!=='public-key'||credential.id!==id||credential.rawId!==id||![-7,-257].includes(algorithm))
   return false;
  const data=decode(credential.response.clientDataJSON);
  const client=JSON.parse(data.toString('utf8'));
  const authenticator=decode(credential.response.authenticatorData);
  const key=createPublicKey({key:decode(publicKey),format:'der',type:'spki'});
  return client.type==='webauthn.get'&&client.challenge===challenge&&client.origin===origin&&
   (client.crossOrigin===undefined||client.crossOrigin===false)&&authenticator.length>=37&&
   (authenticator[32]&5)===5&&authenticator.subarray(0,32).equals(createHash('sha256').update(rpId).digest())&&
   (algorithm===-7?key.asymmetricKeyType==='ec'&&key.asymmetricKeyDetails.namedCurve==='prime256v1':key.asymmetricKeyType==='rsa')&&
   verify('sha256',Buffer.concat([authenticator,createHash('sha256').update(data).digest()]),key,
    decode(credential.response.signature));
 }catch{return false;}
}

export function isRevokedExerciseCredential(result){
 return result?.denied===true&&(
  (result.status===400&&result.code==='webauthn_verification_failed')||
  ([400,404].includes(result.status)&&result.code==='webauthn_credential_not_found')
 );
}

export async function createExerciseDevice(browser,origin){
 const context=await browser.newContext({serviceWorkers:'block',offline:true});
 await context.route('**/*',route=>route.request().isNavigationRequest()&&route.request().url()===origin+'/'?
  route.fulfill({status:200,contentType:'text/html',headers:{'content-security-policy':"default-src 'none'"},
   body:'<!doctype html><title>Sabora isolated Auth exercise</title>'}):route.abort());
 const page=await context.newPage(),cdp=await context.newCDPSession(page);
 await cdp.send('WebAuthn.enable');
 await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',
  hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
 await page.goto(origin+'/');
 const secure=await page.evaluate(expected=>window.isSecureContext&&location.origin===expected&&
  typeof PublicKeyCredential.parseCreationOptionsFromJSON==='function'&&
  typeof PublicKeyCredential.parseRequestOptionsFromJSON==='function',origin);
 if(!secure)throw Error('isolated_origin_unavailable');
 return {context,page};
}
