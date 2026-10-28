const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DISPLAY=/^.{2,4}-[0-9A-Z]{3}$/u;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES=new Set(['admin','waiter','kitchen']);
const STATES=new Set(['invited','accepted','registered','active','suspended','revoked']);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&
 keys.every(key=>Object.hasOwn(value,key));
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;

export class StaffDirectoryGatewayError extends Error{
 constructor(code){super(code);this.name='StaffDirectoryGatewayError';this.code=code;}
}
async function json(response){
 if(!response||typeof response.status!=='number'||
    !String(response.headers?.get?.('content-type')??'').toLowerCase().startsWith('application/json'))
  throw new StaffDirectoryGatewayError('invalid_response');
 let value;try{value=await response.json();}catch{throw new StaffDirectoryGatewayError('invalid_response');}
 if(!response.ok){const code=value?.error==='forbidden'?'forbidden':
  value?.error==='staff_member_not_found'?'not_found':'unavailable';throw new StaffDirectoryGatewayError(code);}
 return value;
}
function member(value){
 const keys=['enrollmentId','givenName','familyName','email','operationalDisplayId','role','state','createdAt','updatedAt'];
 if(!exact(value,keys)||!UUID.test(value.enrollmentId)||typeof value.givenName!=='string'||
    typeof value.familyName!=='string'||!EMAIL.test(value.email??'')||value.email!==value.email.toLowerCase()||
    !(DISPLAY.test(value.operationalDisplayId??'')||
      (value.state==='revoked'&&value.operationalDisplayId===null))||
    !ROLES.has(value.role)||!STATES.has(value.state)||
    !iso(value.createdAt)||!iso(value.updatedAt))throw new StaffDirectoryGatewayError('invalid_response');
 return Object.freeze({...value});
}

export function createStaffDirectoryGateway({send=globalThis.fetch}={}){
 if(typeof send!=='function')throw Error('invalid_staff_directory_gateway');
 return Object.freeze({
  async list({search=null,cursor=0,limit=20}={}){
   if((search!==null&&(typeof search!=='string'||search.trim().length>80))||
      !Number.isSafeInteger(cursor)||cursor<0||!Number.isSafeInteger(limit)||limit<1||limit>50)
    throw Error('invalid_staff_directory_page');
   const parameters=new URLSearchParams({cursor:String(cursor),limit:String(limit)});
   if(search?.trim())parameters.set('search',search.trim());
   const value=await json(await send(`/api/v1/staff/directory?${parameters}`,{
    method:'GET',cache:'no-store',redirect:'error',credentials:'omit',headers:{Accept:'application/json'}}));
   if(!exact(value,['version','items','nextCursor'])||value.version!==1||!Array.isArray(value.items)||
      value.items.length>limit||(value.nextCursor!==null&&(!Number.isSafeInteger(value.nextCursor)||
       value.nextCursor<=cursor)))throw new StaffDirectoryGatewayError('invalid_response');
   return Object.freeze({version:1,items:Object.freeze(value.items.map(member)),nextCursor:value.nextCursor});
  },
  async detail(enrollmentId){
   if(!UUID.test(enrollmentId??''))throw Error('invalid_staff_directory_member');
   const value=await json(await send(`/api/v1/staff/directory/${enrollmentId}`,{
    method:'GET',cache:'no-store',redirect:'error',credentials:'omit',headers:{Accept:'application/json'}}));
   if(!exact(value,['version','member'])||value.version!==1)throw new StaffDirectoryGatewayError('invalid_response');
   return Object.freeze({version:1,member:member(value.member)});
  },
  async self(){
   const value=await json(await send('/api/v1/staff/me',{
    method:'GET',cache:'no-store',redirect:'error',credentials:'omit',headers:{Accept:'application/json'}}));
   if(!exact(value,['version','profile'])||value.version!==1||
      !exact(value.profile,['givenName','familyName','email','role','operationalDisplayId'])||
      typeof value.profile.givenName!=='string'||typeof value.profile.familyName!=='string'||
      !EMAIL.test(value.profile.email??'')||!ROLES.has(value.profile.role)||
      !DISPLAY.test(value.profile.operationalDisplayId??''))
    throw new StaffDirectoryGatewayError('invalid_response');
   return Object.freeze({version:1,profile:Object.freeze({...value.profile})});
  },
 });
}
