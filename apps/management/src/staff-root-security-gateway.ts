import {StaffAuthenticationError} from './staff-passkey';

const PATH='/api/v1/staff/auth/root-security';
export type RootSecuritySnapshot={configured:boolean;failures:string;blockedUntil:string|null};
type Action='reset'|'replace_code';
type Result=RootSecuritySnapshot & {code?:string};
export type RootSecurityGateway={
 read():Promise<RootSecuritySnapshot>;
 mutate(action:Action):Promise<Result>;
};
export function createRootSecurityGateway({send}:{send:typeof fetch}):RootSecurityGateway{
 async function request(path:string,body?:object){
  const response=await send(PATH+path,{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{method:'GET'})});
  if(!response.ok)throw new StaffAuthenticationError(response.status);
  return response.json();
 }
 function snapshot(value:unknown,allowCode=false):Result{
  if(!value||typeof value!=='object')throw new StaffAuthenticationError(503);
  const row=value as Record<string,unknown>;
  if(typeof row.configured!=='boolean'||typeof row.failures!=='string'||!/^(0|[1-9][0-9]*)$/.test(row.failures)||
    !(row.blockedUntil===null||typeof row.blockedUntil==='string'&&Number.isFinite(Date.parse(row.blockedUntil)))||
    (allowCode?typeof row.code!=='string'||!/^[A-Z2-7]{25}[AEIMQUY4]$/.test(row.code):row.code!==undefined))
   throw new StaffAuthenticationError(503);
  return {configured:row.configured,failures:row.failures,blockedUntil:row.blockedUntil,...(allowCode?{code:row.code as string}:{})};
 }
 return Object.freeze({
  async read(){return snapshot(await request(''));},
  async mutate(action:Action){
   const {options}=await request('/options',{action});
   if(options?.rpId!==window.location.hostname)throw new StaffAuthenticationError(503);
   const publicKey=PublicKeyCredential.parseRequestOptionsFromJSON(options);
   const credential=await navigator.credentials.get({publicKey:{...publicKey,userVerification:'required'}});
   if(!(credential instanceof PublicKeyCredential))throw new StaffAuthenticationError(401);
   return snapshot(await request('/verify',{action,credential:credential.toJSON()}),action==='replace_code');
  }
 });
}
