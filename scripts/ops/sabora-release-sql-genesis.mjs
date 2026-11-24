import {join} from 'node:path';
import {readdirSync,lstatSync} from 'node:fs';
import {durableExclusive,exactKeys,protectedBytes,releaseStop as stop,sha256} from './sabora-release-protected-store.mjs';
import {SABORA_RELEASE_SCOPE,stableStringify} from '../ci/sabora-release-governor.mjs';

export const GENESIS_PROJECT_ID='byhvmumqivmunkmomhup';
const RESULT_FIELDS=['schema','repository','projectId','sourceSha','database','postgresMajor',
 'sourceSystemIdSha256','databaseTlsIdentitySha256','migration','catalogSha256','originalCatalogCustodied',
 'observedAt','startedAt','completedAt','status','ledgerValidated','appliedLedgerSha256',
 'backupPerformed','restorePerformed','realUsersAllowed','operationalGo','runtimeHmacValidated'];
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&!/^0+$/.test(value);
const sha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const when=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&
 new Date(Date.parse(value)).toISOString()===value;

// An explicit, root-owned installation binding may admit the original
// immutable genesis receipt for exactly one corrected first release. Never
// infer equivalence from a different SHA, a hash alone or an SSH payload.
export function genesisSourceSha({releaseSha,expected,resultSha256,binding}){
 if(!sha(releaseSha))stop('v2_sql_binding_scope');
 if(binding===undefined)return releaseSha;
 if(!exactKeys(binding,['schema','sourceSha','releaseSha','migrationManifestSha256','appliedLedgerSha256','sqlResultSha256'])||
    binding.schema!=='sabora-genesis-release-binding/v1'||
    !sha(binding.sourceSha)||binding.sourceSha===releaseSha||binding.releaseSha!==releaseSha||
    !hash(binding.migrationManifestSha256)||binding.migrationManifestSha256!==expected.migrationTreeSha256||
    !hash(binding.appliedLedgerSha256)||binding.appliedLedgerSha256!==expected.appliedLedgerSha256||
    !hash(binding.sqlResultSha256)||binding.sqlResultSha256!==resultSha256)
  stop('v2_sql_binding_scope');
 return binding.sourceSha;
}

export function verifyGenesisSqlResult(bytes,{releaseSha,expected,resultSha256,binding,now=Date.now()}){
 const sourceSha=genesisSourceSha({releaseSha,expected,resultSha256,binding});
 if(sha256(bytes)!==resultSha256)stop('v2_sql_result_digest');
 let result;
 try{result=JSON.parse(bytes.toString('utf8'));}catch{stop('v2_sql_result_invalid');}
 if(!exactKeys(result,RESULT_FIELDS)||result.schema!=='sabora-genesis-result/v2'||
    result.repository!==SABORA_RELEASE_SCOPE.repository||result.projectId!==GENESIS_PROJECT_ID||
    !sha(result.sourceSha)||result.sourceSha!==sourceSha||
    result.database!=='postgres'||result.postgresMajor!==17||
    result.status!=='catalog-ledger-verified'||result.ledgerValidated!==true||
    result.originalCatalogCustodied!==true||!hash(result.catalogSha256)||
    result.runtimeHmacValidated!==false||result.operationalGo!==false||
    result.backupPerformed!==false||result.restorePerformed!==false||result.realUsersAllowed!==false)
  stop('v2_sql_result_scope');
 const migration=result.migration;
 if(!exactKeys(migration,['schema','sourceSha','count','manifestSha256'])||
    migration.schema!=='sabora-s46-migration-inventory/v1'||migration.sourceSha!==sourceSha||
    migration.count!==103||!hash(migration.manifestSha256)||
    migration.manifestSha256!==expected.migrationTreeSha256||result.catalogSha256!==expected.initialCatalogSha256||
    !hash(result.appliedLedgerSha256)||result.appliedLedgerSha256!==expected.appliedLedgerSha256||
    !hash(result.sourceSystemIdSha256)||result.sourceSystemIdSha256!==expected.databaseIdentitySha256||
    !hash(result.databaseTlsIdentitySha256)||result.databaseTlsIdentitySha256!==expected.databaseTlsIdentitySha256)
  stop('v2_sql_result_identity');
 if(![result.observedAt,result.startedAt,result.completedAt].every(when)||
    Date.parse(result.startedAt)<Date.parse(result.observedAt)||
    Date.parse(result.startedAt)-Date.parse(result.observedAt)>600000||
    Date.parse(result.completedAt)<Date.parse(result.startedAt)||
    Date.parse(result.completedAt)>now)
  stop('v2_sql_result_chronology');
 return Object.freeze({sqlSourceSha:sourceSha,sqlResultSha256:resultSha256,catalogSha256:result.catalogSha256,
  migrationTreeSha256:migration.manifestSha256,appliedLedgerSha256:result.appliedLedgerSha256,
  backupPerformed:false,restorePerformed:false,realUsersAllowed:false});
}

// Only the controller under its release lock can spend the genesis exception.
// This marker lives separately from the release ledger and survives failure.
export function createV2GenesisGate({config,receipt,ledger,paths}){
 const marker=join(paths.state,'genesis-exception-consumed.json');
 const identity=stableStringify({schema:'sabora-genesis-exception-use/v1',releaseSha:receipt.releaseSha,
  authorizationId:receipt.authorizationId,sqlResultSha256:config.sqlGenesisSha256});
 let claimed=false;
 const verify=()=>{
  if(claimed){
   if(stableStringify(JSON.parse(protectedBytes(marker,{privateFile:true})))!==identity)
    stop('v2_genesis_marker_changed');
  }else{
   const history=ledger.assertReconciled();
   if(receipt.operation!=='deploy'||history.activeReleaseSha!==null||
      !Array.isArray(history.versions)||history.versions.length||
      readdirSync(paths.ledger).length||readdirSync(paths.bundles).length||
      readdirSync(paths.state).some(name=>name.startsWith('retained-'))||
      lstatSync(marker,{throwIfNoEntry:false}))
    stop('v2_ordinary_recovery_required');
  }
  const binding=config.sqlGenesisBinding;
  const sourceSha=genesisSourceSha({releaseSha:receipt.releaseSha,expected:config.expected,
   resultSha256:config.sqlGenesisSha256,binding});
  const file=join(paths.evidence,'sql-genesis-'+sourceSha+'.json');
  let bytes;
  try{bytes=protectedBytes(file,{privateFile:true});}
  catch(error){if(error.code==='ENOENT')stop('v2_sql_result_missing');throw error;}
  return verifyGenesisSqlResult(bytes,{releaseSha:receipt.releaseSha,expected:config.expected,
   resultSha256:config.sqlGenesisSha256,binding});
 };
 return {verify,claim(){
  const proof=verify();
  durableExclusive(marker,JSON.parse(identity));
  claimed=true;
  return proof;
 }};
}
