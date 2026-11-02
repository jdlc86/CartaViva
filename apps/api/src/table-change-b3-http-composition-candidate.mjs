// Opt-in B3 HTTP composition. This is deliberately not imported by the
// production bootstrap: a caller must supply six isolated SQL pools and
// explicit HTTP authentication/authorization adapters.
import {createVerifiedTableChangeB3CustomerFlowCandidate}
 from './table-change-isolated-sql-composition-candidate.mjs';
import {registerCustomerProductionFlowHttp} from './customer-production-http.mjs';
import {registerTableChangeStaffHttp,registerTableChangeStaffPendingHttp}
 from './table-change-http-candidate.mjs';
import {createVerifiedPendingTableChangeReader}
 from './table-change-pending-reader-candidate.mjs';

export async function mountVerifiedTableChangeB3HttpCandidate(app,{
 cookieAuth,forRoles,...sqlConfiguration
}={}){
 if(!app||typeof app.register!=='function'||typeof app.post!=='function'||
    !cookieAuth||typeof cookieAuth.authenticate!=='function'||
    typeof cookieAuth.requireSameOrigin!=='function'||
    typeof cookieAuth.logout!=='function'||typeof forRoles!=='function')
  throw Error('invalid_b3_http_composition');
 // Six independent SQL login preflights MUST succeed before registering
 // any route. The pending reader has its own one-function capability.
 const {pendingPool,expectedPendingLogin,verifyStaff,...b3Configuration}=sqlConfiguration;
 const candidate=await createVerifiedTableChangeB3CustomerFlowCandidate({
  ...b3Configuration,verifyStaff
 });
 const pendingReader=await createVerifiedPendingTableChangeReader({
  pendingPool,expectedLogin:expectedPendingLogin,verifyStaff
 });
 if(!candidate?.flow||typeof candidate.flow.authorizeVisit!=='function'||
    typeof candidate.flow.quote!=='function'||typeof candidate.flow.confirm!=='function'||
    typeof candidate.tableChange?.request!=='function'||
    typeof candidate.tableChange?.decide!=='function')
  throw Error('invalid_b3_http_composition');
 // Validate the staff guard before registering any route. Never register
 // a customer-only partial surface when the operations guard is invalid.
 const guard=forRoles(['admin','waiter']);
 if(typeof guard!=='function')throw Error('invalid_b3_http_composition');
 registerCustomerProductionFlowHttp(app,{
  cookieAuth,flow:candidate.flow,tableChange:candidate.tableChange
 });
 registerTableChangeStaffHttp(app,{
  service:candidate.tableChange,forRoles:()=>guard
 });
 registerTableChangeStaffPendingHttp(app,{
  service:pendingReader,forRoles:()=>guard
 });
 return Object.freeze({mounted:true});
}
