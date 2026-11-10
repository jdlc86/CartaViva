import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';

const directory=resolve('supabase','migrations');
const migrations=readdirSync(directory).filter(name=>name.endsWith('.sql')).sort()
 .map(name=>({name,sql:readFileSync(join(directory,name),'utf8')}));
const chain=migrations.map(item=>item.sql).join('\n');

test('PG17.11 compatibility audit excludes affected legacy crypto and index constructs',()=>{
 assert.doesNotMatch(chain,/\bpgp_(?:sym|pub)_(?:encrypt|decrypt)(?:_bytea)?\b/i);
 assert.doesNotMatch(chain,/cipher-algo\s*=\s*(?:bf|blowfish|cast5)/i);
 assert.doesNotMatch(chain,/\b(?:ltree|btree_gist)\b/i);
 assert.doesNotMatch(chain,/create\s+operator[\s\S]{0,800}\b(?:restrict|join)\s*=/i);
});

test('pgcrypto is installed in extensions and HMAC calls are schema-qualified',()=>{
 assert.match(chain,/create\s+extension\s+if\s+not\s+exists\s+pgcrypto\s+with\s+schema\s+extensions/i);
 const unqualifiedHmac=chain.match(/(?<![a-z0-9_.])hmac\s*\(/gi)||[];
 assert.deepEqual(unqualifiedHmac,[]);
 for(const item of migrations){
  if(/\bhmac\s*\(/i.test(item.sql))assert.match(item.sql,/extensions\.hmac\s*\(/i,item.name);
 }
});
