#!/usr/bin/env node
// Offline-only owner action. NEVER invoke from GitHub Actions, a VPS or CI.
// No key bytes or signed payload are printed.
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {stableStringify,verifyReleaseAuthorization} from '../ci/sabora-release-governor.mjs';

export function signAuthorizedRelease(approval,privatePem,now=Date.now()){
 const raw=stableStringify(approval);
 const privateKey=createPrivateKey(privatePem);
 if(privateKey.asymmetricKeyType!=='ed25519')throw Error('sabora_release_stop:ed25519_required');
 const pub=createPublicKey(privateKey).export({format:'pem',type:'spki'});
 const signatureB64=sign(null,Buffer.from(raw),privateKey).toString('base64');
 const result=verifyReleaseAuthorization(raw,signatureB64,pub,
  {operation:approval.operation,sha:approval.releaseSha},now);
 return {raw,signatureB64,publicKey:pub,receipt:result};
}
const self=process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname);
if(self){
 try{
  if(process.argv.length!==5)throw Error('expected_draft_privatekey_output_prefix');
  const paths=process.argv.slice(2).map(resolve);
  const cwd=resolve(process.cwd())+sep;
  if(paths.some(p=>p.startsWith(cwd)))throw Error('secrets_must_remain_outside_checkout');
  if(paths[0]===paths[1]||paths[1]===paths[2])throw Error('duplicate_file_paths');
  const st=statSync(paths[1]);
  if(!st.isFile()||(st.mode&0o077)!==0)throw Error('private_key_file_permissions_not_restricted');
  const result=signAuthorizedRelease(JSON.parse(readFileSync(paths[0],'utf8')),readFileSync(paths[1]));
  writeFileSync(paths[2]+'.json',result.raw,{mode:0o600,flag:'wx'});
  writeFileSync(paths[2]+'.sig',result.signatureB64+'\n',{mode:0o600,flag:'wx'});
  writeFileSync(paths[2]+'.pub.pem',result.publicKey,{mode:0o644,flag:'wx'});
  process.stdout.write('Approval signed offline. Keep private key outside CI, VPS and Git.\n');
  process.stdout.write('Store JSON and signature as protected values; publish the public key only after owner approval.\n');
 }catch(e){process.stderr.write('sabora_release_sign_stop:'+
  String(e?.message||'invalid').replace(/[^a-zA-Z0-9:_-]/g,'_')+'\n');process.exitCode=1;}
}
