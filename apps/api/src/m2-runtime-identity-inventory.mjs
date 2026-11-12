// Candidate H3-H6/M3 SQL identity contract for explicit dependency injection.
// This module never opens sockets, reads secrets or generates physical LOGINs.
// It is intentionally sourced from the pool/expectedLogin pairs assembled by
// createM2RestaurantCandidate. SQL capability preflights remain mandatory.
const CORE = Object.freeze([
 ['customer.catalogReaderPool','customer.expectedCatalogLogin'],
 ['customer.registrationPool','customer.expectedRegistrationLogin'],
 ['customer.sessionPool','customer.expectedSessionLogin'],
 ['customer.flowPool','customer.expectedFlowLogin'],
 ['tableChange.customerPool','tableChange.expectedCustomerLogin'],
 ['tableChange.operationsPool','tableChange.expectedOperationsLogin'],
 ['tableChange.confirmationPool','tableChange.expectedConfirmationLogin'],
 ['tableChange.h6ReadPool','tableChange.expectedH6ReadLogin'],
 ['tableChange.pendingPool','tableChange.expectedPendingLogin'],
 ['staff.pool','staff.expectedLogin'],
 ['h4.operationsPool','h4.expectedOperationsLogin'],
 ['h6.providerPool','h6.expectedProviderLogin'],
 ['h6.operationsPool','h6.expectedOperationsLogin'],
 ['h6.closePool','h6.expectedCloseLogin'],
 ['h6.eventPool','h6.expectedEventLogin']
]);
const MANAGEMENT = Object.freeze([
 ['management.tablesPool','management.expectedTablesLogin'],
 ['management.catalogPool','management.expectedCatalogLogin']
]);
const OWNERSHIP = Object.freeze([
 ['management.ownership.pool','management.ownership.expectedLogin']
]);
const COMMUNICATIONS = Object.freeze([
 ['management.communications.adminPool','management.communications.expectedAdminLogin'],
 ['management.communications.publicPool','management.communications.expectedPublicLogin']
]);
const WAITER_CALLS = Object.freeze([
 ['waiterCalls.customerPool','waiterCalls.expectedCustomerLogin'],
 ['waiterCalls.staffPool','waiterCalls.expectedStaffLogin']
]);
const LOGIN = /^[a-z][a-z0-9_]{0,62}$/;
const invalid = () => Error('m2_restaurant_candidate_isolation_required');

const read = (object,path) =>
 path.split('.').reduce((value,key)=>value?.[key],object);

export function describeM2RuntimeSqlSlots({
 management=true,ownership=false,communications=false,waiterCalls=false
}={}){
 if(typeof management!=='boolean'||typeof ownership!=='boolean'||
    typeof communications!=='boolean'||typeof waiterCalls!=='boolean'||
    (!management&&(ownership||communications)))throw invalid();
 const groups=[...CORE,...(management?MANAGEMENT:[]),
  ...(ownership?OWNERSHIP:[]),...(communications?COMMUNICATIONS:[]),
  ...(waiterCalls?WAITER_CALLS:[])];
 return Object.freeze(groups.map(([poolPath,loginPath]) =>
  Object.freeze({poolPath,loginPath})));
}
function duplicateIdentity(left,right){
 if(left.pool===right.pool)return true;
 const x=left.pool.options??{},y=right.pool.options??{};
 return Boolean((x.user&&x.user===y.user)||
  (x.connectionString&&x.connectionString===y.connectionString));
}
export function validateM2RuntimeSqlIdentities(options={}){
 if(!options||typeof options!=='object'||Array.isArray(options))throw invalid();
 const management=options.management!=null;
 const ownership=management&&options.management.ownership!=null;
 const communications=management&&options.management.communications!=null;
 const waiterCalls=options.waiterCalls!=null;
 const requirements=describeM2RuntimeSqlSlots({
  management,ownership,communications,waiterCalls
 });
 const entries=[];
 for(const spec of requirements){
  const pool=read(options,spec.poolPath);
  const login=read(options,spec.loginPath);
  if(!pool||typeof pool.connect!=='function'||typeof login!=='string'||!LOGIN.test(login))throw invalid();
  const entry={pool,login};
  if(entries.some(existing=>existing.login===login||duplicateIdentity(existing,entry)))
   throw invalid();
  entries.push(entry);
 }
 // Notifiers hold dedicated LISTEN connections, not extra data capabilities.
 // They must exist; the live SQL privileges/ownership are checked separately.
 for(const path of ['tableChange.notificationPool','h6.notifierPool']){
  const pool=read(options,path);
  if(!pool||typeof pool.connect!=='function')throw invalid();
 }
 // Only slot names and counts may be returned. Never echo LOGINs, passwords,
 // DSNs, pool options, target hosts, or other injected configuration.
 return Object.freeze({
  capabilityCount:requirements.length,
  notifierCount:2,
  slots:Object.freeze(requirements.map(item=>item.poolPath))
 });
}
