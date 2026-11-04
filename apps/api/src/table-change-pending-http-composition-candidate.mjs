// Candidate-only F12 pending queue composition. This does not create pools,
// grant logins, mount production routes or reuse decision-only credentials.
import {createVerifiedPendingTableChangeReader}
 from './table-change-pending-reader-candidate.mjs';
import {registerTableChangeStaffPendingHttp}
 from './table-change-http-candidate.mjs';
export async function registerVerifiedPendingTableChangeHttpCandidate({
 app,forRoles,pendingPool,expectedLogin,verifyStaff
}={}){
 if(!app||typeof app.get!=='function'||typeof forRoles!=='function'||
  typeof verifyStaff!=='function')
  throw Error('invalid_pending_http_composition');
 const reader=await createVerifiedPendingTableChangeReader({
  pendingPool,expectedLogin,verifyStaff
 });
 registerTableChangeStaffPendingHttp(app,{forRoles,service:reader});
 return Object.freeze({validated:true,route:'/api/v1/operations/table-change/pending'});
}
