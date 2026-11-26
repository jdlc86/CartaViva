// This adapter only accepts the verified ceremony context provided by
// createStaffPasskeySession, never an actor or credential from browser JSON.
import {generateRootRecoveryCode} from './staff-root-recovery-candidate.mjs';
const HASH=/^[0-9a-f]{64}$/;
const forbidden=()=>Object.assign(Error('root_security_forbidden'),{code:'42501'});
export function createStaffRootSecurityCandidate({kernel,mail,rotationDays=28}={}){
 if(typeof kernel?.command!=='function'||typeof kernel?.hash!=='function'||
   !Number.isSafeInteger(rotationDays)||rotationDays<1||rotationDays>365||
   (mail&&!(typeof mail.stage==='function'&&typeof mail.confirm==='function')))throw Error('invalid_root_security_config');
 function context({identity,credentialHash}={}){
  if(!identity?.userId||!HASH.test(credentialHash??''))throw forbidden();
  return identity.userId;
 }
 const project=result=>({configured:result.outcome==='configured',failures:result.failures,blockedUntil:result.blockedUntil});
 return Object.freeze({
  mailEnabled:Boolean(mail),
  async read(input){
   const result=await kernel.command('security_status',context(input),{a:input.credentialHash});
   if(!['configured','unconfigured'].includes(result.outcome))throw forbidden();
   return {...project(result),...(mail?{mailEnabled:true}:{})};
  },
  async mutate(input){
   const actor=context(input);
   if(!Number.isSafeInteger(input.deadlineMs)||input.deadlineMs<=Date.now())throw forbidden();
   if(input.action==='stage_email'&&mail)return mail.stage({...input,email:input.parameters.email,days:rotationDays});
   if(input.action==='confirm_email'&&mail)return mail.confirm({...input,...input.parameters});
   if(input.action==='reset'){
    const result=await kernel.command('security_reset',actor,{a:input.credentialHash,requestId:input.requestId,deadlineMs:input.deadlineMs});
    if(result.outcome!=='reset')throw forbidden();
    return {configured:true,failures:result.failures,blockedUntil:result.blockedUntil};
   }
   if(input.action==='replace_code'){
    const code=generateRootRecoveryCode();
    const result=await kernel.command('replace_code',actor,{a:input.credentialHash,b:kernel.hash('code',code),requestId:input.requestId,deadlineMs:input.deadlineMs});
    if(result.outcome!=='code_replaced')throw forbidden();
    return {configured:true,failures:result.failures,blockedUntil:result.blockedUntil,code};
   }
   throw forbidden();
  }
 });
}
