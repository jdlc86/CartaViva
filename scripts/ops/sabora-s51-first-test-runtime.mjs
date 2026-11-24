// Generates an offline candidate from the provisioner's non-secret inventory.
// It does not read secret files, access the network or install configuration.
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describeOperationalSqlContract,validateOperationalEgressBinding}
 from '../../apps/api/src/operational-activation-manifest.mjs';
import {PILOT_ACTIVATION_REQUIREMENTS} from '../../apps/api/src/pilot-activation-gate.mjs';

const project='byhvmumqivmunkmomhup';
const issuerHost=project+'.supabase.co';
const pooler='aws-1-eu-central-1.pooler.supabase.com';
const origins={client:'https://sabora.allaiso.com:8443',management:'https://gestion-sabora.allaiso.com:8443'};
const gateway='sabora-egress';
const productionEvidence=new Set(PILOT_ACTIVATION_REQUIREMENTS.filter(key=>
 !['backupRestoreVerified','rollbackVerified','operationalBootstrapVerified','twoPwasValidated'].includes(key)));

export function firstTestRuntime(inventory,restaurantCode,evidence){
 const features={ownership:true,communications:true,waiterCalls:true};
 const {slots,notifiers}=describeOperationalSqlContract(features);
 if(inventory?.schema!=='sabora-runtime-provision-inventory/v1'||inventory.project!=='sabora'||
  inventory.genesisFictitiousOnly!==true||!Array.isArray(inventory.slots)||inventory.slots.length!==slots.length||
  typeof inventory.validUntil!=='string'||!(Date.parse(inventory.validUntil)>Date.now())||
  !evidence||typeof evidence!=='object'||Array.isArray(evidence)||Object.keys(evidence).length!==productionEvidence.size||
  ![...productionEvidence].every(key=>Object.hasOwn(evidence,key)&&evidence[key]===true))
  throw Error('first_test_runtime_inventory_or_evidence_invalid');
 const provided=new Map(inventory.slots.map(slot=>[slot.slot,slot]));
 const database={
  slots:Object.fromEntries(slots.map(({poolPath,capabilityRole})=>{
   const item=provided.get(poolPath);
   if(item?.role!==capabilityRole||!/^sql_password_(?:0[0-9]|1[0-9]|2[0-2])$/.test(item.passwordRef))
    throw Error('first_test_runtime_slot_mismatch');
   return [poolPath,{login:item.login,serverName:pooler,port:5432,database:'postgres',
    mode:'session_pooler',passwordRef:item.passwordRef,caRef:'trusted_ca',connectHost:gateway,connectPort:15432}];
  })),
  notifiers:Object.fromEntries(notifiers.map(({poolPath,credentialSlot})=>[poolPath,{credentialSlot,dedicatedPool:true}]))
 };
 const activation={
  schemaVersion:1,stage:'production',restaurantCode,
  listener:{host:'0.0.0.0',port:4100,exposure:'container_private'},origins,
  auth:{issuer:'https://'+issuerHost+'/auth/v1',connectHost:gateway,connectPort:14443},features,
  network:{allowedTlsHosts:[pooler,issuerHost],egressGatewayHost:gateway},database,
  signing:{keyId:inventory.keyId,capabilitySecretRef:'capability_hmac',
   customerSecretRef:'customer_hmac',qrSecretRef:'qr_hmac'},
  activationScope:{mode:'deferred-first-test-activation',testDataOnly:true,
   realUsersAllowed:false,backupPerformed:false,restorePerformed:false},
  activationEvidence:{...evidence,backupRestoreVerified:false,rollbackVerified:false,
   operationalBootstrapVerified:false,twoPwasValidated:false}
 };
 const egress={schemaVersion:1,bindHost:'0.0.0.0',targets:[
  {id:'restaurant_sql',listenPort:15432,host:pooler,port:5432,protocol:'postgres_tls'},
  {id:'restaurant_jwks',listenPort:14443,host:issuerHost,port:443,protocol:'tls'}
 ]};
 validateOperationalEgressBinding(activation,egress);
 const runtimeEnv={
  SABORA_OPERATIONAL_MANIFEST_FILE:'/etc/sabora/runtime/activation.json',
  SABORA_OPERATIONAL_SECRETS_DIR:'/etc/sabora/runtime/secrets',
  SABORA_EGRESS_POLICY_FILE:'/etc/sabora/runtime/egress-policy.json',
  SABORA_EGRESS_ALLOWLIST_NETWORK:'sabora_egress_filtered',
  SABORA_RESTAURANT_CODE:restaurantCode,SABORA_INGRESS_BIND_IP:'146.59.145.64',
  SABORA_CLIENT_HOST:new URL(origins.client).hostname,SABORA_MANAGEMENT_HOST:new URL(origins.management).hostname,
  SABORA_WEB_TLS_DIRECTORY:'/srv/sabora/tls',SABORA_INGRESS_FILTERED_NETWORK:'sabora_ingress_filtered'
 };
 return {activation,egress,runtimeEnv};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [inventoryFile,code,evidenceFile,destination]=process.argv.slice(2);
 if(process.argv.length!==6)throw Error('usage: node sabora-s51-first-test-runtime.mjs INVENTORY RESTAURANT_CODE EVIDENCE NEW_OUTPUT');
 const readJson=path=>JSON.parse(readFileSync(path,'utf8'));
 const {activation,egress,runtimeEnv}=firstTestRuntime(readJson(inventoryFile),code,readJson(evidenceFile));
 mkdirSync(destination,{mode:0o700});
 const put=(name,bytes)=>writeFileSync(join(destination,name),bytes,{flag:'wx',mode:0o600});
 put('activation.json',JSON.stringify(activation,null,2)+'\n');
 put('egress-policy.json',JSON.stringify(egress,null,2)+'\n');
 put('runtime.env',Object.entries(runtimeEnv).map(([key,value])=>key+'='+value).join('\n')+'\n');
}
