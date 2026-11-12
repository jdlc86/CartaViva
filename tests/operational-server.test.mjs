import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFileSecretResolver,startOperationalServerFromFiles}
 from '../apps/api/src/operational-server.mjs';

test('file secret resolver accepts only one bounded regular file below its absolute root',async t=>{
 const root=await mkdtemp(join(tmpdir(),'sabora-secret-resolver-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(join(root,'database_password'),'opaque-value-with-more-than-16-bytes\n');
 await mkdir(join(root,'nested'));await writeFile(join(root,'nested','hidden'),'denied');
 const resolveSecret=createFileSecretResolver(root);
 assert.equal(await resolveSecret('database_password'),'opaque-value-with-more-than-16-bytes');
 for(const ref of ['../database_password','nested/hidden','DATABASE_PASSWORD','x'])
  await assert.rejects(resolveSecret(ref),/sabora_operational_startup_failed/);
});

test('operational server refuses non-production and relative configuration before opening a pool',async()=>{
 let pools=0;
 class Pool{constructor(){pools++;}}
 await assert.rejects(startOperationalServerFromFiles({env:{NODE_ENV:'development'},Pool,
  observability:{}}),/sabora_operational_startup_failed/);
 await assert.rejects(startOperationalServerFromFiles({env:{NODE_ENV:'production',
  SABORA_OPERATIONAL_MANIFEST_FILE:'relative.json',SABORA_OPERATIONAL_SECRETS_DIR:'relative'},
  Pool,observability:{}}),/sabora_operational_startup_failed/);
 assert.equal(pools,0);
});
