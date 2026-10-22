import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createPinnedRs256StaffBearerVerifier} from '../apps/api/src/pinned-rs256-staff-bearer-verifier.mjs';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const other=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey;
const now=1792600000000;
const issuer='https://auth.example.test/auth/v1';
const sub='00000000-0000-4000-8000-000000009001';
const claims={iss:issuer,aud:'authenticated',sub,
 iat:Math.floor(now/1000)-60,exp:Math.floor(now/1000)+300};
const enc=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
function token(payload=claims,header={alg:'RS256',typ:'JWT'},key=privateKey){
 const message=enc(header)+'.'+enc(payload);
 return message+'.'+sign('RSA-SHA256',Buffer.from(message),key).toString('base64url');
}
const verify=createPinnedRs256StaffBearerVerifier({publicKey,issuer,clock:()=>now});
test('valid pinned RS256 JWT yields trusted subject and verified flags',async()=>{
 assert.deepEqual(await verify(token()),{verified:true,subject:sub,
  issuerValid:true,audienceValid:true,notExpired:true});
});
test('rejects tampering, other signing keys and algorithm confusion',async()=>{
 for(const t of [(()=>{const parts=token().split('.');parts[1]=enc({...claims,sub:'00000000-0000-4000-8000-000000009002'});return parts.join('.');})(),token(claims,undefined,other),
  token(claims,{alg:'none',typ:'JWT'}),token().split('.').slice(0,2).join('.')+'.bad']){
  assert.deepEqual(await verify(t),{verified:false});
 }
});
test('rejects invalid issuer, audience, expiry, issued-in-future and old tokens',async()=>{
 for(const patch of [{iss:'https://evil.test'},{aud:'other'},
  {exp:Math.floor(now/1000)-1},{iat:Math.floor(now/1000)+10},
  {iat:Math.floor(now/1000)-5000}]){
  assert.deepEqual(await verify(token({...claims,...patch})),{verified:false});
 }
});
test('rejects invalid verifier configuration',()=>{
 assert.throws(()=>createPinnedRs256StaffBearerVerifier({
  publicKey:'invalid',issuer
 }),/invalid_staff_jwt_configuration/);
});
