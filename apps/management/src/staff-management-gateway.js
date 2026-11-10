const CORRELATION=/^[A-Za-z0-9_-]{8,128}$/;
const CODE=/^[0-9A-Z]{3}$/;

export class StaffManagementGatewayError extends Error {
  constructor(code,details=null){super(code);this.name='StaffManagementGatewayError';this.code=code;this.details=details;}
}

async function responseJson(response){
  if(!response||typeof response.status!=='number'||
    !String(response.headers?.get?.('content-type')??'').toLowerCase().startsWith('application/json'))
    throw new StaffManagementGatewayError('invalid_response');
  let body;try{body=await response.json();}catch{throw new StaffManagementGatewayError('invalid_response');}
  if(!response.ok){
    const code=body?.error==='staff_employee_codes_exhausted'?'staff_employee_codes_exhausted':
      body?.error==='staff_code_maintenance_idempotency_conflict'?
        'staff_code_maintenance_idempotency_conflict':'staff_management_unavailable';
    throw new StaffManagementGatewayError(code,body);
  }
  return body;
}

const mutation=async(send,path,body)=>responseJson(await send(path,{method:'POST',cache:'no-store',
  redirect:'error',credentials:'omit',headers:{Accept:'application/json','Content-Type':'application/json'},
  body:JSON.stringify(body)}));

function maintenance(value,action){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||value.action!==action||
    typeof value.repeated!=='boolean'||![value.eligibleCount,value.blockedCount,value.releasedCount,
      value.availableCount].every(count=>Number.isSafeInteger(count)&&count>=0))
    throw new StaffManagementGatewayError('invalid_response');
  return Object.freeze({...value});
}

export function createStaffManagementGateway({send=globalThis.fetch}={}){
  if(typeof send!=='function')throw Error('invalid_staff_management_gateway');
  return Object.freeze({
    async invite({email,givenName,familyName,requestedRole,correlationId}={}){
      if(typeof email!=='string'||typeof givenName!=='string'||typeof familyName!=='string'||
        !['admin','waiter','kitchen'].includes(requestedRole)||!CORRELATION.test(correlationId??''))
        throw Error('invalid_staff_invite');
      const value=await mutation(send,'/api/v1/staff/lifecycle',{action:'invite',email,givenName,
        familyName,requestedRole,correlationId});
      if(!value||typeof value!=='object'||!CODE.test(value.employeeCode??'')||
        typeof value.operationalDisplayId!=='string')throw new StaffManagementGatewayError('invalid_response');
      return Object.freeze({...value});
    },
    async previewCodeMaintenance({correlationId}={}){
      if(!CORRELATION.test(correlationId??''))throw Error('invalid_staff_code_maintenance');
      return maintenance(await mutation(send,'/api/v1/staff/code-maintenance',
        {action:'preview',correlationId}),'preview');
    },
    async recoverCodes({reason,confirmed,correlationId}={}){
      if(typeof reason!=='string'||reason.trim().length<1||reason.trim().length>500||
        confirmed!==true||!CORRELATION.test(correlationId??''))throw Error('invalid_staff_code_maintenance');
      return maintenance(await mutation(send,'/api/v1/staff/code-maintenance',
        {action:'recover',reason:reason.trim(),confirmed:true,correlationId}),'recover');
    },
  });
}
