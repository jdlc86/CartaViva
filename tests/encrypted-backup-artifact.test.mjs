import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decryptBackupArtifact,encryptBackupArtifact}
 from '../scripts/ci/encrypted-backup-artifact.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));

test('Sabora backup fixture is authenticated, checksummed and restorable with separate key custody',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'sabora-encrypted-backup-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const source=join(dir,'sabora.dump'),encrypted=join(dir,'sabora.dump.aesgcm');
 const manifestPath=join(dir,'sabora.manifest.json'),keyPath=join(dir,'key');
 const output=join(dir,'restored.dump');
 const payload=Buffer.concat([Buffer.from('PGDMP\0sabora-only\n'),randomBytes(65536)]);
 await writeFile(source,payload);await writeFile(keyPath,randomBytes(32).toString('hex')+'\n');
 const manifest=await encryptBackupArtifact({source,encrypted,manifestPath,keyPath,rootPath:root});
 assert.equal(manifest.algorithm,'aes-256-gcm');
 assert.equal(manifest.databaseScope,'sabora_only');
 assert.equal(manifest.postgresMajor,17);
 assert.match(manifest.migrationManifestSha256,/^[a-f0-9]{64}$/);
 assert.equal((await readFile(encrypted)).includes(payload.subarray(0,16)),false);
 await decryptBackupArtifact({encrypted,manifestPath,output,keyPath});
 assert.deepEqual(await readFile(output),payload);
});

test('corrupted ciphertext and wrong keys fail without leaving a plaintext output',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'sabora-encrypted-backup-negative-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const source=join(dir,'source'),encrypted=join(dir,'encrypted'),manifestPath=join(dir,'manifest');
 const keyPath=join(dir,'key'),wrongKey=join(dir,'wrong-key'),output=join(dir,'output');
 await writeFile(source,randomBytes(2048));await writeFile(keyPath,randomBytes(32).toString('hex'));
 await writeFile(wrongKey,randomBytes(32).toString('hex'));
 await encryptBackupArtifact({source,encrypted,manifestPath,keyPath,rootPath:root});
 const corrupt=await readFile(encrypted);corrupt[10]^=0xff;await writeFile(encrypted,corrupt);
 await assert.rejects(decryptBackupArtifact({encrypted,manifestPath,output,keyPath}),
  /encrypted_backup_artifact_failed/);
 await assert.rejects(readFile(output));
 const encrypted2=join(dir,'encrypted2'),manifest2=join(dir,'manifest2');
 await encryptBackupArtifact({source,encrypted:encrypted2,manifestPath:manifest2,keyPath,rootPath:root});
 await assert.rejects(decryptBackupArtifact({encrypted:encrypted2,manifestPath:manifest2,
  output,keyPath:wrongKey}),/encrypted_backup_artifact_failed/);
 await assert.rejects(readFile(output));
});
