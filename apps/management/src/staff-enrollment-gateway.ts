// This transport is injected only at the enrollment entry point. It never
// uses a staff operational bearer or accepts an arbitrary path or origin.
const ROOT='/api/v1/staff/enrollment';
type Action='accept'|'options'|'register'|'cancel';
export class EnrollmentError extends Error{
  constructor(readonly status:number){super('staff_enrollment_failed');}
}
export function createStaffEnrollmentGateway(fetchImpl:typeof fetch){
  if(typeof fetchImpl!=='function')throw new EnrollmentError(503);
  return Object.freeze({
    async request(action:Action,body:unknown){
      if(!['accept','options','register','cancel'].includes(action))throw new EnrollmentError(400);
      const response=await fetchImpl(ROOT+'/'+action,{method:'POST',credentials:'same-origin',
        cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',
        headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(!response.ok)throw new EnrollmentError(response.status);
      return response.status===204?null:response.json();
    }
  });
}
export type StaffEnrollmentGateway=ReturnType<typeof createStaffEnrollmentGateway>;

const RECOVERY='/api/v1/staff/recovery';
export function createStaffRecoveryGateway(fetchImpl:typeof fetch){
  if(typeof fetchImpl!=='function')throw new EnrollmentError(503);
  return Object.freeze({
    async request(action:Action,body:unknown){
      if(!['accept','options','register','cancel'].includes(action))throw new EnrollmentError(400);
      const response=await fetchImpl(RECOVERY+'/'+action,{method:'POST',credentials:'same-origin',
        cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',
        headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(!response.ok)throw new EnrollmentError(response.status);
      return response.status===204?null:response.json();
    }
  });
}
export type StaffRecoveryGateway=ReturnType<typeof createStaffRecoveryGateway>;
