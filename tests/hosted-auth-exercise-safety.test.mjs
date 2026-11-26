import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {isolatedBrowserEnvironment,findDisposableIdentity,isDisposableIdentity,
 verifyExerciseAssertion,isRevokedExerciseCredential,authExerciseErrorCode} from '../scripts/ops/sabora-hosted-auth-exercise-safety.mjs';
const email='sabora-auth-probe-323e4567-e89b-42d3-a456-426614174000@example.com';
const subject='123e4567-e89b-42d3-a456-426614174000';
const other='223e4567-e89b-42d3-a456-426614174000';
test('hosted Auth browser inherits only explicit non-sensitive environment variables',()=>{
 const fake='synthetic-private-test-value';
 assert.deepEqual(isolatedBrowserEnvironment({PATH:'/usr/bin',HOME:'/home/test',LANG:'C.UTF-8',TEMP:fake,
  EXTRA_CREDENTIAL:fake,NODE_OPTIONS:'--inspect',OTHER_CONFIG:'unrelated'},[fake]),
 {PATH:'/usr/bin',HOME:'/home/test',LANG:'C.UTF-8'});
});
test('hosted Auth uncertain invitation reconciliation identifies only exact disposable address',()=>{
 const fixture={id:subject,email},unrelated={id:other,email:'another@example.com'};
 assert.equal(findDisposableIdentity([unrelated,fixture],email),subject);
 assert.equal(findDisposableIdentity([unrelated],email),null);
 assert.throws(()=>findDisposableIdentity([fixture,{id:other,email}],email),/ambiguous/);
 assert.throws(()=>findDisposableIdentity([{id:'bad',email}],email),/ambiguous/);
 assert.throws(()=>findDisposableIdentity([unrelated],unrelated.email),/invalid/);
 assert.equal(isDisposableIdentity(fixture,email,subject),true);
 assert.equal(isDisposableIdentity(fixture,email,other),false);
 assert.equal(isDisposableIdentity(unrelated,email),false);
});

test('revocation evidence requires a locally valid assertion and a documented provider rejection',()=>{
 const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const rpId='gestion.example.test',origin='https://'+rpId+':8443',challenge=Buffer.alloc(32,1).toString('base64url');
 const id=Buffer.alloc(32,2).toString('base64url');
 const clientData=Buffer.from(JSON.stringify({type:'webauthn.get',challenge,origin,crossOrigin:false}));
 const authenticator=Buffer.alloc(37);
 createHash('sha256').update(rpId).digest().copy(authenticator);
 authenticator[32]=5;
 const signature=sign('sha256',Buffer.concat([authenticator,createHash('sha256').update(clientData).digest()]),privateKey);
 const credential={type:'public-key',id,rawId:id,response:{clientDataJSON:clientData.toString('base64url'),
  authenticatorData:authenticator.toString('base64url'),signature:signature.toString('base64url')}};
 const expected={id,publicKey:publicKey.export({format:'der',type:'spki'}).toString('base64url'),algorithm:-7,challenge,origin,rpId};
 assert.equal(verifyExerciseAssertion(credential,expected),true);
 assert.equal(verifyExerciseAssertion(credential,{...expected,challenge:Buffer.alloc(32,3).toString('base64url')}),false);
 assert.equal(verifyExerciseAssertion(credential,{...expected,origin:'https://other.example.test:8443'}),false);
 assert.equal(verifyExerciseAssertion(credential,{...expected,rpId:'example.test'}),false);
 assert.equal(verifyExerciseAssertion({...credential,id:'other'},expected),false);
 assert.equal(verifyExerciseAssertion({...credential,response:{...credential.response,
  signature:Buffer.alloc(signature.length,3).toString('base64url')}},expected),false);
 assert.equal(isRevokedExerciseCredential({denied:true,status:400,code:'webauthn_verification_failed'}),true);
 assert.equal(isRevokedExerciseCredential({denied:true,status:404,code:'webauthn_credential_not_found'}),true);
 assert.equal(isRevokedExerciseCredential({denied:true,status:400,code:'webauthn_challenge_expired'}),false);
 assert.equal(isRevokedExerciseCredential({denied:true,status:404,code:'unknown'}),false);
 assert.equal(authExerciseErrorCode({code:400,error_code:'webauthn_verification_failed'}),'webauthn_verification_failed');
 assert.equal(authExerciseErrorCode({code:'user_not_found'}),'user_not_found');
 assert.equal(authExerciseErrorCode({code:'user_not_found',error_code:'webauthn_credential_not_found'}),'unknown');
 assert.equal(authExerciseErrorCode({code:'synthetic_sensitive_value'}),'unknown');
});
