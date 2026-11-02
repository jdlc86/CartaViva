// Opt-in B3 HTTP composition. This is deliberately not imported by the
// production bootstrap: a caller must supply five isolated SQL pools and
// explicit HTTP authentication/authorization adapters.
import {createVerifiedTableChangeB3CustomerFlowCandidate}
 from './table-change-isolated-sql-composition-candidate.mjs';
import {registerCustomerProductionFlowHttp} from './customer-production-http.mjs';
import {registerTableChangeStaffHttp} from './table-change-http-candidate.mjs';

export async function mountVerifiedTableChangeB3HttpCandidate(app,{
 cookieAuth,forRoles,...sqlConfiguration
}={}){
 if(!app||typeof app.register!=='function'||typeof app.post!=='function'||
    !cookieAuth||typeof cookieAuth.authenticate!=='function'||
    typeof cookieAuth.requireSameOrigin!=='function'||
    typeof cookieAuth.logout!=='function'||typeof forRoles!=='function')
  throw Error('invalid_b3_http_composition');
 // All five live SQL capability checks must succeed before registering
 // either customer or staff routes. Never mount a partial B3 surface.
 const candidate=await createVerifiedTableChangeB3CustomerFlowCandidate(sqlConfiguration);
 if(!candidate?.flow||typeof candidate.flow.authorizeVisit!=='function'||
    typeof candidate.flow.quote!=='function'||typeof candidate.flow.confirm!=='function'||
    typeof candidate.tableChange?.request!=='function'||
    typeof candidate.tableChange?.decide!=='function')
  throw Error('invalid_b3_http_composition');
 const guard=forRoles(['admin','waiter']);
 if(typeof guard!=='function')throw Error('invalid_b3_http_composition');
 // Pass a stable, prevalidated guard; the staff route remains independently
 // protected by its own role check and request validation.
 registerCustomerProductionFlowHttp(app,{
  cookieAuth,flow:candidate.flow,tableChange:candidate.tableChange
 });
 registerTableChangeStaffHttp(app,{
  service:candidate.tableChange,forRoles:()=>guard
 });
 return Object.freeze({mounted:true});
}
