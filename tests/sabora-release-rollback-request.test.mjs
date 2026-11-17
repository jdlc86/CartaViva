import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {renderRollbackEnvelope,verifyRollbackEnvelope} from '../scripts/ci/sabora-release-rollback-request.mjs';
import {stableStringify,SABORA_RELEASE_SCOPE,EVIDENCE_KEYS} from '../scripts/ci/sabora-release-governor.mjs';
const sha='b'.repeat(40),current='c'.repeat(40),target='2'.repeat(64),live='1'.repeat(64);
const hash=s=>createHash('sha256').update(s).digest('hex');
test('signed rollback independent of expiring Actions artifacts and rejected on stale/mismatched host ledger',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const pub=publicKey.export({format:'pem',type:'spki'});
 const approval={schema:'sabora-governed-release/v1',repository:'jdlc86/CartaViva',
  operation:'rollback',releaseSha:sha,authorizationId:'SABORA-ROLLBACK-INTEGRAL-01',
  approvedAt:'2026-11-14T10:00:00.000Z',expiresAt:'2026-11-14T10:50:00.000Z',
  server:'146.59.145.64',project:'sabora',port:8443,
  origins:[...SABORA_RELEASE_SCOPE.origins],services:[...SABORA_RELEASE_SCOPE.services],
  bundleManifestSha256:target,
  evidence:Object.fromEntries(EVIDENCE_KEYS.map((k,i)=>[k,hash('gate-'+i)]))};
 const raw=stableStringify(approval),signatureB64=sign(null,Buffer.from(raw),privateKey).toString('base64');
 const wire=renderRollbackEnvelope({approvalB64:Buffer.from(raw).toString('base64'),signatureB64});
 const command='sabora-release-v1 rollback '+sha+' SABORA-ROLLBACK-INTEGRAL-01 '+hash(raw)+' 477';
 const history={schema:'sabora-release-history/v1',project:'sabora',activeReleaseSha:current,
  versions:[{releaseSha:sha,bundleManifestSha256:target,status:'healthy',verifiedAt:'2026-11-13T10:00:00Z'},
   {releaseSha:current,bundleManifestSha256:live,status:'unhealthy',verifiedAt:'2026-11-14T09:00:00Z'}]};
 const observed={schema:'sabora-runtime-observation/v1',project:'sabora',releaseSha:current,
  bundleManifestSha256:live,services:[...SABORA_RELEASE_SCOPE.services],port:8443};
 const args={command,publicKey:pub,history,observed,now:Date.parse('2026-11-14T10:10:00Z')};
 const checked=await verifyRollbackEnvelope(Readable.from([Buffer.from(wire)]),args);
 assert.equal(checked.plan.targetReleaseSha,sha);
 assert.equal(checked.plan.authorizedToExecute,false);
 await assert.rejects(verifyRollbackEnvelope(Readable.from([Buffer.from(wire)]),
   {...args,history:{...history,versions:history.versions.map(x=>x.releaseSha===sha?{...x,status:'unhealthy'}:x)}}),/no_previously_healthy_target/);
 await assert.rejects(verifyRollbackEnvelope(Readable.from([Buffer.from(wire)]),
   {...args,observed:{...observed,releaseSha:sha}}),/live_runtime_does_not_match_history/);
 await assert.rejects(verifyRollbackEnvelope(Readable.from([Buffer.from(wire),Buffer.from('anything')]),args),
   /unexpected_rollback_frame/);
 await assert.rejects(verifyRollbackEnvelope(Readable.from([Buffer.from(wire)]),
   {...args,publicKey:generateKeyPairSync('ed25519').publicKey.export({format:'pem',type:'spki'})}),/signature_invalid/);
});
