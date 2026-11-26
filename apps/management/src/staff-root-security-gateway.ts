import {StaffAuthenticationError} from './staff-passkey';

const PATH='/api/v1/staff/auth/root-security';
export type RootSecuritySnapshot={configured:boolean;failures:string;blockedUntil:string|null;mailEnabled?:boolean;backupEnabled?:boolean;backupConfigured?:boolean};
type Action='reset'|'replace_code';
type Result=RootSecuritySnapshot & {code?:string};
export type RootSecurityGateway={
 hasEmailProof:boolean;
 read():Promise<RootSecuritySnapshot>;
 mutate(action:Action):Promise<Result>;
 stageEmail(email:string):Promise<void>;
 confirmEmail(initial:boolean):Promise<string|null>;
 registerBackup():Promise<void>;
};
const CODE=/^[A-Z2-7]{25}[AEIMQUY4]$/;
export function readRootEmailVerification(){
 const [route,query]=window.location.hash.split('?');
 if(route!=='#recuperacion-root'||!query)return null;
 const params=new URLSearchParams(query);
 if(params.get('purpose')!=='verify')return null;
 window.history.replaceState(null,'','#configuracion');
 const token=params.get('token');
 return params.size===2&&token&&/^[A-Za-z0-9_-]{43}$/.test(token)?token:null;
}
export function createRootSecurityGateway({send,emailProof=null}:{send:typeof fetch;emailProof?:string|null}):RootSecurityGateway{
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
    (allowCode?typeof row.code!=='string'||!CODE.test(row.code):row.code!==undefined))
   throw new StaffAuthenticationError(503);
  return {configured:row.configured,failures:row.failures,blockedUntil:row.blockedUntil,
   ...(row.mailEnabled===true?{mailEnabled:true}:{}),
   ...(row.backupEnabled===true&&typeof row.backupConfigured==='boolean'?{backupEnabled:true,backupConfigured:row.backupConfigured}:{}),...(allowCode?{code:row.code as string}:{})};
 }
 async function verify(action:Action|'stage_email'|'confirm_email'|'add_backup',parameters?:object){
  const input={action,...(parameters?{parameters}:{})};
  const {options}=await request('/options',input);
  if(options?.rpId!==window.location.hostname)throw new StaffAuthenticationError(503);
  const publicKey=PublicKeyCredential.parseRequestOptionsFromJSON(options);
  const credential=await navigator.credentials.get({publicKey:{...publicKey,userVerification:'required'}});
  if(!(credential instanceof PublicKeyCredential))throw new StaffAuthenticationError(401);
  return request('/verify',{...input,credential:credential.toJSON()});
 }
 return Object.freeze({
  hasEmailProof:Boolean(emailProof),
  async read(){return snapshot(await request(''));},
  async mutate(action:Action){
   return snapshot(await verify(action),action==='replace_code');
  },
  async stageEmail(email:string){
   if((await verify('stage_email',{email}))?.outcome!=='verification_queued')throw new StaffAuthenticationError(503);
  },
  async registerBackup(){
   const result=await verify('add_backup');
   if(result?.options?.rp?.id!==window.location.hostname||result.options.authenticatorSelection?.userVerification!=='required')throw new StaffAuthenticationError(503);
   const publicKey=PublicKeyCredential.parseCreationOptionsFromJSON(result.options);
   const credential=await navigator.credentials.create({publicKey});
   if(!(credential instanceof PublicKeyCredential))throw new StaffAuthenticationError(401);
   if((await request('/backup/verify',{credential:credential.toJSON()}))?.outcome!=='backup_added')throw new StaffAuthenticationError(503);
  },
  async confirmEmail(initial:boolean){
   if(!emailProof)throw new StaffAuthenticationError(400);
   const result=await verify('confirm_email',{proof:emailProof,initial});
   if(result?.outcome!==(initial?'configured':'email_changed')||
     (initial?(typeof result.code!=='string'||!CODE.test(result.code)):result.code!==undefined))
    throw new StaffAuthenticationError(503);
   emailProof=null;
   return initial?result.code:null;
  }
 });
}
