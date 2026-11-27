import {EnrollmentError} from './staff-enrollment-gateway';
const PATH='/api/v1/staff/recovery-admin';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type RecoveryClassification={outcome:'not_recoverable'}|{outcome:'recoverable';enrollmentId:string;state:'active'|'suspended'};
export function createStaffRecoveryAdminGateway(send:typeof fetch){
 if(typeof send!=='function')throw new EnrollmentError(503);
 async function request(body:unknown){
  const result=await send(PATH,{method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',
   referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!result.ok)throw new EnrollmentError(result.status);
  return result.json();
 }
 return Object.freeze({
  async classify(email:string):Promise<RecoveryClassification>{
   const result=await request({action:'classify',email});
   if(result?.outcome==='not_recoverable')return {outcome:'not_recoverable'};
   if(result?.outcome!=='recoverable'||!UUID.test(result.enrollmentId??'')||!['active','suspended'].includes(result.state))
    throw new EnrollmentError(503);
   return {outcome:'recoverable',enrollmentId:result.enrollmentId,state:result.state};
  },
  async authorize(email:string,enrollmentId:string,requestId:string){
   if(!UUID.test(enrollmentId)||!UUID.test(requestId))throw new EnrollmentError(400);
   const result=await request({action:'authorize',email,enrollmentId,requestId});
   if(result?.outcome!=='queued'||result.enrollmentId!==enrollmentId||result.requestId!==requestId||
    typeof result.repeated!=='boolean'||!Number.isSafeInteger(result.version)||result.version<1||
    !Number.isFinite(Date.parse(result.expiresAt??'')))throw new EnrollmentError(503);
   return {outcome:'queued' as const,expiresAt:result.expiresAt as string};
  }
 });
}
export type StaffRecoveryAdminGateway=ReturnType<typeof createStaffRecoveryAdminGateway>;
