import {createHmac, timingSafeEqual} from 'node:crypto';
import {verifySupabaseAccessToken} from './auth.mjs';
import {hashRootCredentialId} from './staff-root-credential-id.mjs';

const SESSION = '__Host-sabora-staff';
const CHALLENGE = '__Host-sabora-staff-challenge';
const ROOT_PROOF = '__Host-sabora-root-proof';
const ROOT_SECURITY_CHALLENGE = '__Host-sabora-root-security-challenge';
const PATH = '/api/v1/staff/auth';
const ROLES = ['root', 'admin', 'waiter', 'kitchen'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JWT = /^[\w-]+\.[\w-]+\.[\w-]+$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const CHALLENGE_LIMIT = 300;
const SESSION_HEADER = 'x-sabora-staff-session';

function readCookie(request, name) {
  const matches = (request.headers.cookie ?? '').split(';')
    .map(value => value.trim()).filter(value => value.startsWith(name + '='));
  return matches.length === 1 ? matches[0].slice(name.length + 1) : null;
}

function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`;
}

function verifiedAssertion(credential, origin) {
  if (credential?.type !== 'public-key' || typeof credential.id !== 'string' ||
      credential.id !== credential.rawId || !BASE64URL.test(credential.id)) return false;
  const {clientDataJSON, authenticatorData, signature, userHandle} = credential.response ?? {};
  if (![clientDataJSON, authenticatorData, signature, userHandle]
    .every(value => typeof value === 'string' && BASE64URL.test(value))) return false;
  try {
    const client = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8'));
    const authenticator = Buffer.from(authenticatorData, 'base64url');
    return client.type === 'webauthn.get' && client.origin === origin &&
      (client.crossOrigin === undefined || client.crossOrigin === false) &&
      authenticator.length >= 37 && (authenticator[32] & 0x05) === 0x05;
  } catch {
    return false;
  }
}

export function createStaffPasskeySession({origin, issuer, provider, getTrustedKeys, secret,
  now = Date.now, rootAccess}) {
  if(rootAccess!==undefined&&typeof rootAccess!=='function')throw Error('invalid_root_access_config');
  const {host, hostname} = new URL(origin);
  const clock = () => Math.floor(now() / 1000);
  const allowed = request => request.headers.host === host &&
    (request.method === 'GET' && request.headers.origin === undefined || request.headers.origin === origin);
  const seal = (name, value) => createHmac('sha256', secret)
    .update(`sabora-staff-auth/v1\n${origin}\n${issuer}\n${name}\n${value}`).digest('base64url');
  const signed = (name, value) => value + '.' + seal(name, value);
  const open = (request, name) => {
    const raw = readCookie(request, name);
    if (!raw || raw.length > 3800) return null;
    const separator = raw.lastIndexOf('.');
    if (separator < 1) return null;
    const value = raw.slice(0, separator);
    const signature = Buffer.from(raw.slice(separator + 1));
    const expected = Buffer.from(seal(name, value));
    return signature.length === expected.length && timingSafeEqual(signature, expected) ? value : null;
  };
  const verify = async token => {
    if (typeof token !== 'string' || token.length > 3700 || !JWT.test(token)) return null;
    const keys = await getTrustedKeys();
    try {
      return verifySupabaseAccessToken(token, {issuer, keys, now, requirePasskey: true});
    } catch {
      return null;
    }
  };
  const rootProofHash=(request,identity)=>{
    const [sid,hash,extra]=(open(request,ROOT_PROOF)??'').split('.');
    return sid===identity.sessionId&&/^[0-9a-f]{64}$/.test(hash??'')&&extra===undefined?hash:null;
  };
  const assertIdentity = async request => {
    const token = open(request, SESSION);
    const identity = await verify(token);
    if (!identity) return null;
    const user = await provider.user(token);
    if(user?.id!==identity.userId||identity.expiresAt<=clock())return null;
    if(rootAccess){
      const credentialHash=rootProofHash(request,identity);
      if(await rootAccess(identity.userId,credentialHash)!==true)return null;
    }
    return identity;
  };
  const unavailable = reply => reply.code(503).send({error: 'staff_auth_unavailable'});
  const unauthorized = reply => reply.code(401).send({error: 'unauthorized'});
  const authenticate = async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!allowed(request) || request.headers.authorization !== undefined) return unauthorized(reply);
    try {
      const identity = await assertIdentity(request);
      if (!identity || (request.url !== PATH + '/session' &&
          request.headers[SESSION_HEADER] !== identity.sessionId)) return unauthorized(reply);
      request.verifiedIdentity = identity;
    } catch {
      return unavailable(reply);
    }
  };

  function register(app, {forRoles, features, rootBootstrap,rootSecurity}) {
    if(rootSecurity!==undefined&&(!rootAccess||typeof rootSecurity?.read!=='function'||typeof rootSecurity?.mutate!=='function'))throw Error('invalid_root_security_config');
    if(features?.rootSecurity===true&&!rootSecurity)throw Error('invalid_root_security_feature');
    if(rootBootstrap!==undefined&&typeof rootBootstrap!=='function')throw Error('invalid_root_bootstrap_config');
    const staff = forRoles(ROLES);
    const [, authorizeMembership] = staff;
    const originOnly = async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (!allowed(request)) return unauthorized(reply);
    };
    const describeSession = request => ({
      role: request.verifiedStaff.role,
      sessionId: request.verifiedIdentity.sessionId,
      expiresAt: request.verifiedIdentity.expiresAt,
      features
    });
    app.get(PATH + '/session', {preHandler: staff}, async request => describeSession(request));
    app.post(PATH + '/options', {preHandler: originOnly}, async (_request, reply) => {
      try {
        const result = await provider.options();
        if (!UUID.test(result?.challenge_id ?? '') || result.options?.rpId !== hostname ||
            typeof result.options.challenge !== 'string' || !BASE64URL.test(result.options.challenge) ||
            !Number.isSafeInteger(result.expires_at)) return unavailable(reply);
        const expires = Math.min(result.expires_at, clock() + CHALLENGE_LIMIT);
        if (expires <= clock()) return unavailable(reply);
        reply.header('Set-Cookie', cookie(CHALLENGE,
          signed(CHALLENGE, result.challenge_id + '.' + expires), expires - clock()));
        return {options: {...result.options, userVerification: 'required'}};
      } catch {
        return unavailable(reply);
      }
    });
    const completePasskey = async (request, reply, bootstrap) => {
      const [challenge, expires] = (open(request, CHALLENGE) ?? '').split('.');
      const credential = request.body?.credential;
      reply.header('Set-Cookie', cookie(CHALLENGE, '', 0));
      if (!UUID.test(challenge) || !(Number(expires) > clock()) || !verifiedAssertion(credential, origin))
        return unauthorized(reply);
      if(bootstrap&&(Object.keys(request.body??{}).sort().join(',')!=='authorizationCode,credential,grantId'||
        !UUID.test(request.body.grantId??'')||typeof request.body.authorizationCode!=='string'||
        !/^[A-Za-z0-9_-]{43}$/.test(request.body.authorizationCode)))return unauthorized(reply);
      try {
        const result = await provider.verify(challenge, credential);
        const token = result?.access_token;
        const identity = await verify(token);
        if (!identity) return unauthorized(reply);
        if(bootstrap){
          if((await provider.user(token))?.id!==identity.userId)return unauthorized(reply);
          try{
            if(await rootBootstrap({identity,grantId:request.body.grantId,
              authorizationCode:request.body.authorizationCode,credentialId:credential.id})!==true)return unauthorized(reply);
          }catch(error){
            if(error?.code==='42501'||error?.message==='invalid_root_bootstrap_request')return unauthorized(reply);
            return unavailable(reply);
          }
        }
        request.verifiedIdentity = identity;
        await authorizeMembership(request, reply);
        if (reply.sent) return;
        const credentialHash=rootAccess&&request.verifiedStaff.role==='root'?hashRootCredentialId(credential.id):null;
        if(rootAccess&&await rootAccess(identity.userId,credentialHash)!==true)return unauthorized(reply);
        const maxAge = identity.expiresAt - clock();
        if (maxAge <= 0) return unauthorized(reply);
        reply.header('Set-Cookie', cookie(SESSION, signed(SESSION, token), maxAge));
        if(rootAccess)reply.header('Set-Cookie',cookie(ROOT_PROOF,credentialHash?signed(ROOT_PROOF,identity.sessionId+'.'+credentialHash):'',credentialHash?maxAge:0));
        return describeSession(request);
      } catch {
        return unavailable(reply);
      }
    };
    app.post(PATH + '/verify', {preHandler: originOnly, bodyLimit: 16_384},
      (request,reply)=>completePasskey(request,reply,false));
    // No runtime composition enables this candidate route. Only a dedicated
    // operator-authorized bootstrap installation may supply the callback.
    if(rootBootstrap)app.post(PATH+'/bootstrap/root',{preHandler:originOnly,bodyLimit:16_384},
      (request,reply)=>completePasskey(request,reply,true));

    // Separate, intent-bound, one-use provider challenge. Neither options
    // nor the fresh assertion grants a new operational cookie. The existing
    // ROOT identity and the just-proven credential are checked under SQL lock.
    if(rootSecurity){
      const root=forRoles(['root']),securityPath=PATH+'/root-security';
      const actionAllowed=action=>['reset','replace_code'].includes(action);
      const responseError=(error,reply)=>error?.code==='42501'?reply.code(403).send({error:'forbidden'}):unavailable(reply);
      const safe=async(request,reply)=>{
        reply.header('Cache-Control','no-store');
        reply.header('Referrer-Policy','no-referrer');
        if(request.url.includes('?'))return reply.code(400).send({error:'invalid_request'});
      };
      app.get(securityPath,{preHandler:[safe,...root]},async(request,reply)=>{
        try{return await rootSecurity.read({identity:request.verifiedIdentity,credentialHash:rootProofHash(request,request.verifiedIdentity)});}
        catch(error){return responseError(error,reply);}
      });
      app.post(securityPath+'/options',{preHandler:[safe,...root],bodyLimit:1024},async(request,reply)=>{
        const action=request.body?.action;
        if(Object.keys(request.body??{}).join(',')!=='action'||!actionAllowed(action))return reply.code(400).send({error:'invalid_request'});
        try{
          const result=await provider.options();
          if(!UUID.test(result?.challenge_id??'')||result.options?.rpId!==hostname||
            typeof result.options.challenge!=='string'||!BASE64URL.test(result.options.challenge)||
            !Number.isSafeInteger(result.expires_at))return unavailable(reply);
          const identity=request.verifiedIdentity,expires=Math.min(result.expires_at,identity.expiresAt,clock()+60);
          if(expires<=clock())return unauthorized(reply);
          const value=[result.challenge_id,expires,identity.userId,identity.sessionId,action].join('.');
          reply.header('Set-Cookie',cookie(ROOT_SECURITY_CHALLENGE,signed(ROOT_SECURITY_CHALLENGE,value),expires-clock()));
          return {options:{...result.options,userVerification:'required'}};
        }catch{return unavailable(reply);}
      });
      app.post(securityPath+'/verify',{preHandler:[safe,...root],bodyLimit:16384},async(request,reply)=>{
        const [challenge,expires,actor,sessionId,action,extra]=(open(request,ROOT_SECURITY_CHALLENGE)??'').split('.');
        reply.header('Set-Cookie',cookie(ROOT_SECURITY_CHALLENGE,'',0));
        const identity=request.verifiedIdentity,credential=request.body?.credential;
        if(!UUID.test(challenge??'')||!(Number(expires)>clock())||extra!==undefined||
          actor!==identity.userId||sessionId!==identity.sessionId||!actionAllowed(action)||
          Object.keys(request.body??{}).sort().join(',')!=='action,credential'||request.body.action!==action||
          !verifiedAssertion(credential,origin))return unauthorized(reply);
        try{
          const result=await provider.verify(challenge,credential),token=result?.access_token;
          const fresh=await verify(token);
          if(!fresh)return unauthorized(reply);
          // Always retire the isolated new Auth session; no token reaches UI.
          // Do not sign out the original session on malformed provider output.
          if(fresh.sessionId===identity.sessionId)return unauthorized(reply);
          const user=await provider.user(token);
          const retired=await provider.logout(token);
          if(retired!==true||user?.id!==fresh.userId||fresh.userId!==identity.userId||
            Number(expires)<=clock()||identity.expiresAt<=clock())return unauthorized(reply);
          const credentialHash=hashRootCredentialId(credential.id);
          if(await rootAccess(identity.userId,credentialHash)!==true)return unauthorized(reply);
          return await rootSecurity.mutate({identity,credentialHash,action,requestId:challenge,
            deadlineMs:Math.min(Number(expires),identity.expiresAt,fresh.expiresAt)*1000});
        }catch(error){return responseError(error,reply);}
      });
    }
    app.post(PATH + '/logout', {preHandler: originOnly}, async (request, reply) => {
      try {
        const token = open(request, SESSION);
        const identity = await verify(token);
        if (identity) {
          if (request.headers[SESSION_HEADER] !== identity.sessionId) return reply.code(409).send();
          if (await provider.logout(token) !== true && (await provider.user(token))?.id === identity.userId)
            return unavailable(reply);
        }
        return reply.header('Set-Cookie', [cookie(SESSION, '', 0), cookie(CHALLENGE, '', 0),...(rootAccess?[cookie(ROOT_PROOF,'',0),cookie(ROOT_SECURITY_CHALLENGE,'',0)]:[])])
          .code(204).send();
      } catch {
        return unavailable(reply);
      }
    });
  }

  return Object.freeze({authenticate, assertIdentity, register});
}
