import {createHash} from 'node:crypto';
import {verifySupabaseAccessToken} from './auth.mjs';
import {generateRootRecoveryCode} from './staff-root-recovery-candidate.mjs';
import {createStaffRecoveryCeremonyCandidate} from './staff-recovery-registration-candidate.mjs';

const forbidden=()=>Object.assign(Error('root_recovery_public_forbidden'),{code:'42501'});
const sessionHash=(actor,sessionId)=>createHash('sha256')
 .update(JSON.stringify(['sabora.root-recovery-public-session.v1',actor,sessionId])).digest('hex');

export function createPublicRootRecoveryCandidate({kernel,providerForRoot,getRootUserId,issuer,getTrustedKeys,
 origin,ticketSecret,clock=Date.now}={}){
 if(typeof kernel?.command!=='function'||typeof kernel?.hash!=='function'||
  typeof providerForRoot!=='function'||typeof getRootUserId!=='function'||typeof getTrustedKeys!=='function'||
  typeof issuer!=='string'||!(ticketSecret instanceof Uint8Array)||ticketSecret.byteLength!==32)
  throw Error('invalid_root_recovery_public_dependencies');

 async function rootScope(){
  const actor=await getRootUserId();
  if(!actor)throw forbidden();
  const provider=await providerForRoot({subjectId:actor});
  if(!['generateRecoveryProof','exchangeRecoveryProof','user'].every(method=>typeof provider?.[method]==='function'))
   throw Error('invalid_root_recovery_public_provider');
  return {actor,provider};
 }
 async function verifySession(accessToken,actor){
  let identity;
  try{identity=verifySupabaseAccessToken(accessToken,{issuer,keys:await getTrustedKeys(),now:clock,requireEnrollmentSession:true});}
  catch{throw forbidden();}
  if(identity.userId!==actor)throw forbidden();
  return identity;
 }
 async function ceremony(input){
  const {actor,provider}=await rootScope();
  const identity=await verifySession(input.accessToken,actor);
  const claim={a:input.grantHash,b:sessionHash(actor,identity.sessionId),deadlineMs:input.expiresAt};
  if((await kernel.command('check_public_session',actor,claim)).outcome!=='public_session_bound')throw forbidden();
  const registration=async (action,binding)=>{
   if(binding.subjectId!==actor||binding.sessionId!==identity.sessionId)throw forbidden();
   const fields={a:input.grantHash,b:binding.credentialHash,deadlineMs:binding.deadlineMs};
   if(action==='prepare'){
    const result=await kernel.command('prepare_registration',actor,{...fields,c:binding.evidenceHash});
    return {outcome:result.outcome==='registration_prepared'?'prepared':result.outcome};
   }
   if(action==='complete'){
    const recoveryCode=generateRootRecoveryCode();
    const result=await kernel.command('complete',actor,{...fields,c:kernel.hash('code',recoveryCode)});
    return {outcome:result.outcome,...(result.outcome==='completed'?{recoveryCode}:{})};
   }
   if(action==='record_registration'||action==='record_revocation')
    return kernel.command(action,actor,{...fields,c:binding.evidenceHash});
   throw forbidden();
  };
  return createStaffRecoveryCeremonyCandidate({registration,provider,issuer,getTrustedKeys,
   managementOrigin:origin,ticketSecret,sessionDeadlineMs:input.expiresAt,clock});
 }
 return Object.freeze({
  async exchange({token}){
   const {actor,provider}=await rootScope();
   const grantHash=kernel.hash('grant',token);
   if((await kernel.command('claim',actor,{a:grantHash})).outcome!=='claimed')throw forbidden();
   const {authProof}=await provider.generateRecoveryProof();
   const {accessToken}=await provider.exchangeRecoveryProof(authProof);
   const identity=await verifySession(accessToken,actor);
   const expiresAtMs=Math.min(identity.expiresAt*1000,clock()+300000);
   if((await kernel.command('bind_public_session',actor,{a:grantHash,b:sessionHash(actor,identity.sessionId),
    deadlineMs:expiresAtMs})).outcome!=='public_session_bound')throw forbidden();
   return {outcome:'ready',accessToken,expiresAtMs,grantHash};
  },
  async options(input){return (await ceremony(input)).options(input);},
  async register(input){return (await ceremony(input)).register(input);}
 });
}
