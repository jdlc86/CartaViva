import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {handleSaboraHostRequest} from '../scripts/ops/sabora-release-host-router.mjs';
import {renderRollbackEnvelope} from '../scripts/ci/sabora-release-rollback-request.mjs';
import {SABORA_RELEASE_SCOPE,stableStringify,EVIDENCE_KEYS} from '../scripts/ci/sabora-release-governor.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
test('host router: signed rollback checks host history only after authentication; no Docker',async()=>{
 const target='a'.repeat(40),active='b'.repeat(40),targetHash='1'.repeat(64),activeHash='2'.repeat(64);
 const pair=generateKeyPairSync('ed25519');
 const raw=stableStringify({schema:'sabora-governed-release/v1',repository:'jdlc86/CartaViva',
  operation:'rollback',releaseSha:target,authorizationId:'SABORA-ROLLBACK-HOST-01',
  approvedAt:'2026-11-14T10:00:00.000Z',expiresAt:'2026-11-14T10:45:00.000Z',
  server:SABORA_RELEASE_SCOPE.host,project:'sabora',port:8443,
  origins:[...SABORA_RELEASE_SCOPE.origins],services:[...SABORA_RELEASE_SCOPE.services],
  bundleManifestSha256:targetHash,
  evidence:Object.fromEntries(EVIDENCE_KEYS.map((key,i)=>[key,hash('routed-evidence-'+i)]))});
 const sig=sign(null,Buffer.from(raw),pair.privateKey).toString('base64');
 const data=renderRollbackEnvelope({approvalB64:Buffer.from(raw).toString('base64'),signatureB64:sig});
 const command='sabora-release-v1 rollback '+target+' SABORA-ROLLBACK-HOST-01 '+hash(raw)+' 5555';
 const history={schema:'sabora-release-history/v1',project:'sabora',activeReleaseSha:active,
  versions:[{releaseSha:target,bundleManifestSha256:targetHash,status:'healthy',verifiedAt:'2026-11-13T10:00:00Z'},
   {releaseSha:active,bundleManifestSha256:activeHash,status:'unhealthy',verifiedAt:'2026-11-14T09:00:00Z'}]};
 const observed={schema:'sabora-runtime-observation/v1',project:'sabora',
  releaseSha:active,bundleManifestSha256:activeHash,
  services:[...SABORA_RELEASE_SCOPE.services],port:8443};
 let reads=0;
 const factory=()=>({source:Readable.from([Buffer.from(data)]),command,
  publicKey:pair.publicKey.export({format:'pem',type:'spki'}),
  now:Date.parse('2026-11-14T10:10:00Z'),
  readProtectedHistory:()=>{reads++;return history;},
  observeExclusiveRuntime:()=>{reads++;return observed;}});
 const verified=await handleSaboraHostRequest(factory());
 assert.equal(verified.actuated,false);
 assert.equal(verified.operation,'rollback');
 assert.equal(verified.proof.plan.targetReleaseSha,target);
 assert.equal(reads,2);
 await assert.rejects(handleSaboraHostRequest({...factory(),
   publicKey:generateKeyPairSync('ed25519').publicKey.export({format:'pem',type:'spki'})}),/signature_invalid/);
 assert.equal(reads,2); // no host observations performed before authentication
 await assert.rejects(handleSaboraHostRequest({...factory(),
   readProtectedHistory:undefined,observeExclusiveRuntime:undefined}),/trusted_history_unavailable/);
 await assert.rejects(handleSaboraHostRequest({...factory(),
   observeExclusiveRuntime:()=>({...observed,port:443})}),/live_runtime_does_not_match_history/);
});
