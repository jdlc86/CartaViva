import {X509Certificate} from 'node:crypto';
import {isIP} from 'node:net';
import {describeM2RuntimeSqlSlots} from './m2-runtime-identity-inventory.mjs';
import {isUnsafeProductionSecret} from './production-secret-policy.mjs';
import {createSupabaseJwksProvider} from './jwks.mjs';
import {createOrderOperationCapabilityIssuer} from './order-operation-capability.mjs';
import {createOrderOperationReadCapabilityIssuer} from './order-operation-read-capability.mjs';
import {createH6StaffCapabilityIssuer} from './h6-staff-capability.mjs';
import {createM3ManagementCapabilityIssuer} from './m3-management-capability.mjs';
import {createOwnershipCapabilityIssuer} from './ownership-governance-candidate.mjs';
import {createWaiterCallStaffIssuer} from './waiter-call-candidate.mjs';
import {hashCustomerSessionToken} from './customer-session.mjs';
import {createGatewayJwksFetch} from './gateway-jwks-fetch.mjs';
import {validateSaboraEgressPolicy} from './sabora-egress-gateway.mjs';
import {PILOT_ACTIVATION_REQUIREMENTS} from './pilot-activation-gate.mjs';

const LOGIN=/^[a-z][a-z0-9_]{2,62}$/;
const REF=/^[a-z][a-z0-9_-]{2,63}$/;
const KEY_ID=/^[A-Za-z0-9_-]{8,64}$/;
const RESTAURANT=/^[A-Z0-9_-]{3,32}$/;
const HOST=/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const INTERNAL_HOST=/^[a-z][a-z0-9-]{0,62}$/;
const DATABASE=/^[a-z][a-z0-9_]{0,62}$/;
const RESERVED_LOGIN=/(?:^|_)(?:postgres|service_role|supabase_admin|supabase_auth_admin)(?:_|$)/;
const invalid=()=>Error('operational_activation_manifest_invalid');
const secretFailure=()=>Error('operational_activation_secret_unavailable');
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const exactKeys=(value,required,optional=[])=>plain(value)&&required.every(key=>Object.hasOwn(value,key))&&
 Reflect.ownKeys(value).every(key=>typeof key==='string'&&(required.includes(key)||optional.includes(key)));

const META=Object.freeze({
 'customer.catalogReaderPool':['sabora_catalog_reader','catalog_read'],
 'customer.registrationPool':['sabora_customer_registration_runtime','customer_registration'],
 'customer.sessionPool':['sabora_customer_session_runtime','customer_session'],
 'customer.flowPool':['sabora_customer_flow_runtime','customer_flow'],
 'tableChange.customerPool':['sabora_f12_customer_runtime','table_change_customer'],
 'tableChange.operationsPool':['sabora_f12_operations_runtime','table_change_staff'],
 'tableChange.confirmationPool':['sabora_b3_confirmation_runtime','order_confirmation'],
 'tableChange.h6ReadPool':['sabora_b3_h6_reader_runtime','customer_economic_read'],
 'tableChange.pendingPool':['sabora_f12_pending_reader_runtime','pending_table_change_read'],
 'staff.pool':['sabora_staff_reader','staff_membership_read'],
 'h4.operationsPool':['sabora_b3_h4_transition_runtime','kitchen_waiter_operations'],
 'h6.providerPool':['sabora_h6_provider_runtime','payment_provider_ledger'],
 'h6.operationsPool':['sabora_h6_operations_runtime','h6_staff_operations'],
 'h6.closePool':['sabora_h6_account_close_runtime','account_close'],
 'h6.eventPool':['sabora_m2_customer_event_runtime','customer_event_read'],
 'management.tablesPool':['sabora_m3_tables_runtime','management_tables'],
 'management.catalogPool':['sabora_m3_catalog_runtime','management_catalog_finance'],
 'management.ownership.pool':['sabora_ownership_runtime','admin_ownership_governance'],
 'management.communications.adminPool':['sabora_m5_comms_admin_runtime','communications_admin'],
 'management.communications.publicPool':['sabora_m5_comms_public_runtime','communications_public'],
 'waiterCalls.customerPool':['sabora_waiter_call_customer_runtime','waiter_call_customer'],
 'waiterCalls.staffPool':['sabora_waiter_call_staff_runtime','waiter_call_staff']
});
const NOTIFIERS=Object.freeze([
 Object.freeze({poolPath:'tableChange.notificationPool',credentialSlot:'tableChange.operationsPool',usage:'table_change_listen'}),
 Object.freeze({poolPath:'h6.notifierPool',credentialSlot:'h6.operationsPool',usage:'h6_outbox_listen'})
]);

export function describeOperationalSqlContract(features={}){
 const normalized={management:true,ownership:features.ownership===true,
  communications:features.communications===true,waiterCalls:features.waiterCalls===true};
 const slots=describeM2RuntimeSqlSlots(normalized).map(item=>{
  const meta=META[item.poolPath];
  if(!meta)throw invalid();
  return Object.freeze({poolPath:item.poolPath,loginPath:item.loginPath,
   capabilityRole:meta[0],usage:meta[1],owner:'dba_sabora',custodian:'security_and_dba_sabora',
   tls:'verify_ca_and_hostname',rotation:'new_credential_then_bounded_pool_drain_and_preflight',
   revocation:'revoke_old_login_credential_after_verified_cutover'});
 });
 return Object.freeze({slots:Object.freeze(slots),notifiers:NOTIFIERS,
  capabilityCount:slots.length,notifierCount:NOTIFIERS.length});
}

function assertHttpsOrigin(value,{auth=false}={}){
 let url;
 try{url=new URL(value);}catch{throw invalid();}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||
    (auth?url.pathname!=='/auth/v1':url.pathname!=='/')||!HOST.test(url.hostname)||
    /(?:^|\.)(?:example|invalid|localhost|local)$/.test(url.hostname)||isIP(url.hostname))throw invalid();
 return url;
}

function assertSlot(slot,gatewayHost,production){
 if(!exactKeys(slot,['login','serverName','port','database','mode','passwordRef','caRef'],
  ['connectHost','connectPort']))throw invalid();
 if(!LOGIN.test(slot.login)||RESERVED_LOGIN.test(slot.login)||!HOST.test(slot.serverName)||
    isIP(slot.serverName)||/(?:^|\.)(?:example|invalid|localhost|local)$/.test(slot.serverName)||
    slot.port!==5432||!DATABASE.test(slot.database)||
    !['direct','session_pooler'].includes(slot.mode)||!REF.test(slot.passwordRef)||!REF.test(slot.caRef))throw invalid();
 if(slot.mode==='session_pooler'&&!/\.pooler\.supabase\.com$/.test(slot.serverName))throw invalid();
 if(slot.mode==='direct'&&/\.pooler\.supabase\.com$/.test(slot.serverName))throw invalid();
 const connectHost=slot.connectHost??slot.serverName;
 const connectPort=slot.connectPort??slot.port;
 if((connectHost!==slot.serverName&&!INTERNAL_HOST.test(connectHost))||
    !Number.isSafeInteger(connectPort)||connectPort<1||connectPort>65535)throw invalid();
 if(production&&(connectHost!==gatewayHost||connectPort===slot.port))throw invalid();
 return Object.freeze({...slot,connectHost,connectPort});
}

export function validateOperationalActivationManifest(manifest){
 if(!exactKeys(manifest,['schemaVersion','stage','restaurantCode','listener','origins','auth',
  'features','network','database','signing','activationEvidence']))throw invalid();
 if(manifest.schemaVersion!==1||!['lab','production'].includes(manifest.stage)||
    !RESTAURANT.test(manifest.restaurantCode)||
    !exactKeys(manifest.listener,['host','port','exposure'])||
    !['127.0.0.1','0.0.0.0'].includes(manifest.listener.host)||
    !Number.isSafeInteger(manifest.listener.port)||manifest.listener.port<1024||manifest.listener.port>65535||
    !['loopback','container_private'].includes(manifest.listener.exposure)||
    (manifest.listener.host==='0.0.0.0'&&manifest.listener.exposure!=='container_private')||
    (manifest.listener.host==='127.0.0.1'&&manifest.listener.exposure!=='loopback'))throw invalid();
 if(!exactKeys(manifest.features,['ownership','communications','waiterCalls'])||
    Object.values(manifest.features).some(value=>typeof value!=='boolean'))throw invalid();
 if(!exactKeys(manifest.activationEvidence,PILOT_ACTIVATION_REQUIREMENTS)||
    Object.values(manifest.activationEvidence).some(value=>typeof value!=='boolean'))throw invalid();
 if(!exactKeys(manifest.origins,['client','management']))throw invalid();
 const clientOrigin=assertHttpsOrigin(manifest.origins.client);
 const managementOrigin=assertHttpsOrigin(manifest.origins.management);
 if(clientOrigin.origin===managementOrigin.origin)throw invalid();
 if(!exactKeys(manifest.auth,['issuer','connectHost','connectPort'])||!exactKeys(manifest.network,
  ['allowedTlsHosts','egressGatewayHost'])||!Array.isArray(manifest.network.allowedTlsHosts)||
  manifest.network.allowedTlsHosts.length===0||new Set(manifest.network.allowedTlsHosts).size!==
  manifest.network.allowedTlsHosts.length)throw invalid();
 const issuer=assertHttpsOrigin(manifest.auth.issuer,{auth:true});
 const production=manifest.stage==='production';
 if(production&&(manifest.listener.host!=='0.0.0.0'||manifest.listener.port!==4100||
    manifest.listener.exposure!=='container_private'))throw invalid();
 const gatewayHost=manifest.network.egressGatewayHost;
 if((production&&(!INTERNAL_HOST.test(gatewayHost??'')||gatewayHost.includes('.')))||
    (!production&&gatewayHost!==null&&gatewayHost!==undefined&&!INTERNAL_HOST.test(gatewayHost)))throw invalid();
 if(typeof manifest.auth.connectHost!=='string'||
    !(HOST.test(manifest.auth.connectHost)||INTERNAL_HOST.test(manifest.auth.connectHost))||
    !Number.isSafeInteger(manifest.auth.connectPort)||manifest.auth.connectPort<1||
    manifest.auth.connectPort>65535||
    (production&&(manifest.auth.connectHost!==gatewayHost||manifest.auth.connectPort===443))||
    (!production&&(manifest.auth.connectHost!==issuer.hostname||manifest.auth.connectPort!==443)))throw invalid();
 const contract=describeOperationalSqlContract(manifest.features);
 if(!exactKeys(manifest.database,['slots','notifiers'])||!plain(manifest.database.slots)||
    !plain(manifest.database.notifiers))throw invalid();
 const required=contract.slots.map(item=>item.poolPath);
 if(Reflect.ownKeys(manifest.database.slots).length!==required.length||
    required.some(path=>!Object.hasOwn(manifest.database.slots,path)))throw invalid();
 const slots={};
 for(const path of required)slots[path]=assertSlot(manifest.database.slots[path],gatewayHost,production);
 const logins=Object.values(slots).map(item=>item.login);
 const passwordRefs=Object.values(slots).map(item=>item.passwordRef);
 if(new Set(logins).size!==logins.length||new Set(passwordRefs).size!==passwordRefs.length)throw invalid();
 const notifierKeys=NOTIFIERS.map(item=>item.poolPath);
 if(Reflect.ownKeys(manifest.database.notifiers).length!==notifierKeys.length||
    notifierKeys.some(path=>manifest.database.notifiers[path]?.credentialSlot!==
      NOTIFIERS.find(item=>item.poolPath===path).credentialSlot||
      manifest.database.notifiers[path]?.dedicatedPool!==true))throw invalid();
 if(!exactKeys(manifest.signing,['keyId','capabilitySecretRef','customerSecretRef','qrSecretRef'])||
    !KEY_ID.test(manifest.signing.keyId)||
    ![manifest.signing.capabilitySecretRef,manifest.signing.customerSecretRef,
      manifest.signing.qrSecretRef].every(value=>REF.test(value))||
    new Set([manifest.signing.capabilitySecretRef,manifest.signing.customerSecretRef,
      manifest.signing.qrSecretRef]).size!==3)throw invalid();
 const requiredHosts=[issuer.hostname,...new Set(Object.values(slots).map(item=>item.serverName))].sort();
 const allowed=[...manifest.network.allowedTlsHosts].sort();
 if(requiredHosts.length!==allowed.length||requiredHosts.some((host,index)=>host!==allowed[index])||
    allowed.some(host=>!HOST.test(host)||isIP(host)))throw invalid();
 return Object.freeze({manifest:Object.freeze({...manifest,
   database:Object.freeze({slots:Object.freeze(slots),notifiers:manifest.database.notifiers})}),
  contract,summary:Object.freeze({schemaVersion:1,stage:manifest.stage,
   capabilityCount:contract.capabilityCount,notifierCount:contract.notifierCount,
   slots:Object.freeze(required),tlsHostCount:allowed.length})});
}

// The API and the gateway consume separately mounted configuration files.
// Both must describe precisely the SAME outbound connections before any
// credentials are loaded or network listeners are opened. Every app identity
// may reuse one gateway port for a shared PostgreSQL server, but no additional
// destination or mismatched protocol is allowed.
export function validateOperationalEgressBinding(manifest,policy){
 const validated=validateOperationalActivationManifest(manifest);
 if(validated.summary.stage!=='production')throw invalid();
 let gateway;
 try{gateway=validateSaboraEgressPolicy(policy);}catch{throw invalid();}
 const expected=new Map();
 const include=(listenPort,host,port,protocol)=>{
  const item={listenPort,host,port,protocol};
  const previous=expected.get(listenPort);
  if(previous&&(previous.host!==host||previous.port!==port||
     previous.protocol!==protocol))throw invalid();
  expected.set(listenPort,item);
 };
 for(const item of validated.contract.slots){
  const slot=validated.manifest.database.slots[item.poolPath];
  include(slot.connectPort,slot.serverName,slot.port,'postgres_tls');
 }
 const issuer=new URL(validated.manifest.auth.issuer);
 include(validated.manifest.auth.connectPort,issuer.hostname,443,'tls');
 if(gateway.targets.length!==expected.size)throw invalid();
 for(const target of gateway.targets){
  const item=expected.get(target.listenPort);
  if(!item||target.host!==item.host||target.port!==item.port||
     target.protocol!==item.protocol)throw invalid();
 }
 return Object.freeze({targetCount:expected.size,
  capabilityCount:validated.summary.capabilityCount,
  notifierCount:validated.summary.notifierCount});
}

function setPath(target,path,value){
 const parts=path.split('.');let current=target;
 for(const key of parts.slice(0,-1))current=current[key]??={};
 current[parts.at(-1)]=value;
}

function disabledPayments(){
 const denied=async()=>{throw Error('operational_payment_provider_not_enabled');};
 return Object.freeze({authorize:denied,capture:denied,release:denied,refund:denied,retrieve:denied});
}

export async function materializeOperationalM3Options({manifest,Pool,resolveSecret,
 fetchImpl,observability=null,observeFailure=()=>{}}={}){
 if(typeof Pool!=='function'||typeof resolveSecret!=='function'||
    (fetchImpl!==undefined&&typeof fetchImpl!=='function')||
    typeof observeFailure!=='function')throw invalid();
 const validated=validateOperationalActivationManifest(manifest);
 const config=validated.manifest;
 const values=new Map();
 const readSecret=async ref=>{
  if(values.has(ref))return values.get(ref);
  let value;
  try{value=await resolveSecret(ref);}catch{throw secretFailure();}
  if(typeof value!=='string'||value.length<16||value.length>16384||value.includes('\0'))throw secretFailure();
  values.set(ref,value);return value;
 };
 const pools=[];
 const poolBySlot=new Map();
 const options={};
 const close=(()=>{let promise=null;return ()=>{
  if(!promise)promise=Promise.allSettled([...pools].reverse().map(pool=>pool.end())).then(results=>{
   if(results.some(result=>result.status==='rejected'))throw Error('operational_pool_close_failed');
  });
  return promise;
 };})();
 try{
  for(const item of validated.contract.slots){
   const slot=config.database.slots[item.poolPath];
   const [password,ca]=await Promise.all([readSecret(slot.passwordRef),readSecret(slot.caRef)]);
   if(password!==password.trim()||/[\r\n]/.test(password)||
      (config.stage==='production'&&isUnsafeProductionSecret(password)))throw secretFailure();
   try{new X509Certificate(ca);}catch{throw secretFailure();}
   const pool=new Pool({host:slot.connectHost,port:slot.connectPort,database:slot.database,
    user:slot.login,password,ssl:{ca,rejectUnauthorized:true,servername:slot.serverName},
    max:item.poolPath.endsWith('operationsPool')?5:3,min:0,
    idleTimeoutMillis:10_000,connectionTimeoutMillis:5_000,
    statement_timeout:15_000,query_timeout:20_000,allowExitOnIdle:false,
    application_name:'sabora_'+item.usage});
   if(!pool||typeof pool.connect!=='function'||typeof pool.end!=='function')throw invalid();
   pools.push(pool);poolBySlot.set(item.poolPath,pool);
   setPath(options,item.poolPath,pool);setPath(options,item.loginPath,slot.login);
  }
  for(const notifier of NOTIFIERS){
   const source=config.database.slots[notifier.credentialSlot];
   const [password,ca]=await Promise.all([readSecret(source.passwordRef),readSecret(source.caRef)]);
   const pool=new Pool({host:source.connectHost,port:source.connectPort,database:source.database,
    user:source.login,password,ssl:{ca,rejectUnauthorized:true,servername:source.serverName},
    max:1,min:0,idleTimeoutMillis:10_000,connectionTimeoutMillis:5_000,
    statement_timeout:15_000,query_timeout:20_000,allowExitOnIdle:false,
    application_name:'sabora_'+notifier.usage});
   if(!pool||pool===poolBySlot.get(notifier.credentialSlot)||
      typeof pool.connect!=='function'||typeof pool.end!=='function')throw invalid();
   pools.push(pool);setPath(options,notifier.poolPath,pool);
  }
  const [capabilityValue,customerSecret,qrSecret]=await Promise.all([
   readSecret(config.signing.capabilitySecretRef),readSecret(config.signing.customerSecretRef),
   readSecret(config.signing.qrSecretRef)]);
  const capabilitySecret=Buffer.from(capabilityValue,'utf8');
  if([capabilityValue,customerSecret,qrSecret].some(value=>value!==value.trim()||/[\r\n]/.test(value))||
     (config.stage==='production'&&[capabilityValue,customerSecret,qrSecret]
      .some(value=>isUnsafeProductionSecret(value)))||
     capabilitySecret.byteLength<32||capabilitySecret.byteLength>64||
     Buffer.byteLength(customerSecret)<32||Buffer.byteLength(qrSecret)<32)throw secretFailure();
  const login=path=>config.database.slots[path].login;
  options.customer.allowedOrigin=config.origins.client;
  options.customer.secretKey=customerSecret;
  options.tableChange.hashSession=hashCustomerSessionToken;
  options.staff.issuer=config.auth.issuer;
  const trustedFetch=fetchImpl??createGatewayJwksFetch({issuer:config.auth.issuer,
   connectHost:config.auth.connectHost,connectPort:config.auth.connectPort});
  options.staff.getTrustedKeys=createSupabaseJwksProvider({issuer:config.auth.issuer,
   fetchImpl:trustedFetch});
  options.h4.issueTransitionCapability=createOrderOperationCapabilityIssuer({
   keyId:config.signing.keyId,secret:capabilitySecret,databaseRole:login('h4.operationsPool')});
  options.h4.issueReadCapability=createOrderOperationReadCapabilityIssuer({
   keyId:config.signing.keyId,secret:capabilitySecret,databaseRole:login('h4.operationsPool')});
  options.h6.stripe=disabledPayments();
  options.h6.issueStaffCapability=createH6StaffCapabilityIssuer({
   keyId:config.signing.keyId,secret:capabilitySecret,databaseRole:login('h6.operationsPool')});
  options.h6.issueCloseCapability=createH6StaffCapabilityIssuer({
   keyId:config.signing.keyId,secret:capabilitySecret,databaseRole:login('h6.closePool')});
  options.management.issueTablesCapability=createM3ManagementCapabilityIssuer({
   keyId:config.signing.keyId,secret:capabilitySecret,databaseRole:login('management.tablesPool')});
  options.management.issueCatalogCapability=createM3ManagementCapabilityIssuer({
   keyId:config.signing.keyId,secret:capabilitySecret,databaseRole:login('management.catalogPool')});
  options.management.dashboardTimeZone='Europe/Madrid';
  options.management.qr={secret:qrSecret,origin:config.origins.client,
   restaurantCode:config.restaurantCode};
  if(config.features.ownership){
   options.management.ownership.issueCapability=createOwnershipCapabilityIssuer({
    keyId:config.signing.keyId,secret:capabilitySecret,
    databaseRole:login('management.ownership.pool')});
  }
  if(config.features.communications){
   options.management.communications.issueCapability=createM3ManagementCapabilityIssuer({
    keyId:config.signing.keyId,secret:capabilitySecret,
    databaseRole:login('management.communications.adminPool')});
  }
  if(config.features.waiterCalls){
   options.waiterCalls.issueStaffCapability=createWaiterCallStaffIssuer({
    keyId:config.signing.keyId,secret:capabilitySecret,
    databaseRole:login('waiterCalls.staffPool')});
  }
  options.enableDeferredDispatch=false;
  options.observability=observability;
  options.observeFailure=observeFailure;
  return Object.freeze({options,listener:config.listener,summary:validated.summary,close});
 }catch(error){
  try{await close();}catch{}
  if(error?.message==='operational_activation_manifest_invalid'||
     error?.message==='operational_activation_secret_unavailable')throw error;
  throw secretFailure();
 }
}
