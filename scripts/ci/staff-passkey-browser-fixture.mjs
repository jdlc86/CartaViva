import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,randomBytes,randomUUID,sign,verify} from 'node:crypto';

// Isolated Auth boundary. Chromium signs a real assertion using a disposable
// virtual authenticator. No vendor endpoint or durable identity is contacted.
export function createStaffPasskeyBrowserFixture({issuer,origin,kid,userIds}){
 const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const jwk={...publicKey.export({format:'jwk'}),alg:'RS256',use:'sig',kid};
 const rpId=new URL(origin).hostname;
 const rpHash=createHash('sha256').update(rpId).digest();
 const credentials=new Map(),challenges=new Map(),sessions=new Map();
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const token=(userId,sessionId)=>{
  const now=Math.floor(Date.now()/1000);
  const signed=encode({typ:'JWT',alg:'RS256',kid})+'.'+encode({
   iss:issuer,aud:'authenticated',sub:userId,role:'authenticated',iat:now,exp:now+3600,
   ...(sessionId?{is_anonymous:false,session_id:sessionId,amr:[{method:'passkey',timestamp:now}]}:{})
  });
  return signed+'.'+sign('RSA-SHA256',Buffer.from(signed),privateKey).toString('base64url');
 };
 const provider={
  async options(){
   const id=randomUUID(),challenge=randomBytes(32).toString('base64url');
   const expiresAt=Math.floor(Date.now()/1000)+60;
   challenges.set(id,{challenge,expiresAt});
   return {challenge_id:id,expires_at:expiresAt,options:{challenge,rpId,timeout:60000}};
  },
  async verify(id,credential){
   const expected=challenges.get(id),account=credentials.get(credential.id);
   challenges.delete(id);
   if(!account||!expected||expected.expiresAt<=Date.now()/1000)return null;
   const response=credential.response;
   const clientData=Buffer.from(response.clientDataJSON,'base64url');
   const client=JSON.parse(clientData);
   const data=Buffer.from(response.authenticatorData,'base64url');
   if(client.challenge!==expected.challenge||client.origin!==origin||
      Buffer.from(response.userHandle,'base64url').toString()!==account.userId||
      !data.subarray(0,32).equals(rpHash))return null;
   const signed=Buffer.concat([data,createHash('sha256').update(clientData).digest()]);
   if(!verify('sha256',signed,account.publicKey,Buffer.from(response.signature,'base64url')))return null;
   const access=token(account.userId,randomUUID());
   sessions.set(access,account.userId);
   return {access_token:access};
  },
  async user(access){return sessions.has(access)?{id:sessions.get(access)}:null;},
  async logout(access){return sessions.delete(access)||null;}
 };
 async function registerDevice(context,page,userId){
  assert(userIds.includes(userId));
  const cdp=await context.newCDPSession(page);
  const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const credentialId=randomBytes(32);
  credentials.set(credentialId.toString('base64url'),{userId,publicKey:keys.publicKey});
  await cdp.send('WebAuthn.enable');
  const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{
   options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,
    hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}
  });
  await cdp.send('WebAuthn.addCredential',{authenticatorId,credential:{
   credentialId:credentialId.toString('base64'),
   privateKey:keys.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),
   rpId,isResidentCredential:true,signCount:0,userHandle:Buffer.from(userId).toString('base64')
  }});
 }
 return {getTrustedKeys:async()=>[jwk],provider,registerDevice,token};
}
