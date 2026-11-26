// Explicit provider-only probe: no staff membership, email, registration,
 // service-role secret or deployment. A successful options call creates only
 // an expiring, anonymous WebAuthn challenge; never log its material.
const issuer='https://byhvmumqivmunkmomhup.supabase.co/auth/v1';
const rpId='gestion-sabora.allaiso.com';
const key=process.env.SABORA_PROBE_PUBLISHABLE_KEY;
if(!/^sb_publishable_[A-Za-z0-9_-]{20,150}$/.test(key??''))throw Error('probe_publishable_key_missing');
const request=async(path,options={})=>{
 const response=await fetch(issuer+path,{...options,redirect:'error',signal:AbortSignal.timeout(15000),
  headers:{accept:'application/json',...(options.headers??{})}});
 let body;try{body=await response.json();}catch{throw Error('auth_probe_non_json_'+response.status);}
 if(!response.ok){
  const code=typeof body?.error_code==='string'&&/^[a-z_]{1,80}$/.test(body.error_code)?body.error_code:'unknown';
  throw Error('auth_probe_http_'+response.status+'_'+code);
 }
 return body;
};
const jwks=await request('/.well-known/jwks.json');
if(!Array.isArray(jwks?.keys)||!jwks.keys.some(k=>k?.kty==='RSA'&&k?.alg==='RS256'&&
 typeof k.kid==='string'&&typeof k.n==='string'&&typeof k.e==='string'))
 throw Error('auth_probe_rs256_unavailable');
console.log('AUTH_JWKS_RS256 PASS');
const before=Date.now()/1000;
const result=await request('/passkeys/authentication/options',{method:'POST',
 headers:{apikey:key,'content-type':'application/json'},body:'{}'});
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result?.challenge_id??'')||
 result.options?.rpId!==rpId||typeof result.options?.challenge!=='string'||
 !/^[A-Za-z0-9_-]{16,512}$/.test(result.options.challenge)||
 !Number.isSafeInteger(result.expires_at)||result.expires_at<=before)
 throw Error('auth_probe_invalid_passkey_options');
console.log('AUTH_PASSKEY_OPTIONS PASS; rpId='+rpId);
console.log('Scope: endpoint and options only; origin, registration, recovery, revocation and real device NOT validated.');
