#!/usr/bin/env node
// Offline-only owner action. NEVER invoke from GitHub Actions, a VPS or CI.
// No key bytes or signed payload are printed.
import {readFileSync,writeFileSync,lstatSync,realpathSync} from 'node:fs';
import {basename,dirname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {stableStringify,verifyReleaseAuthorization} from '../ci/sabora-release-governor.mjs';
import {verifiedNtfsAclDigest} from './sabora-ntfs-acl-verifier.mjs';

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
const self=process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url));
if(self){
 try{
  if(process.argv.length!==5)throw Error('expected_draft_privatekey_output_prefix');
  const paths=process.argv.slice(2).map(value=>resolve(value));
  const checkout=realpathSync(resolve(fileURLToPath(new URL('../..',import.meta.url))));
  const outputFiles=['.json','.sig','.pub.pem'].map(ext=>paths[2]+ext);
  const actualPaths=[...paths.slice(0,2),...outputFiles];
  // Compare actual output filenames, not just output prefix. Realpath of
  // the parent blocks symlink indirection into the repository.
  const canonical=actualPaths.map((path,index)=>index<2?realpathSync(path):
   resolve(realpathSync(dirname(path)),basename(path)));
  const comparable=value=>process.platform==='win32'?value.toLowerCase():value;
  const inside=value=>comparable(value)===comparable(checkout)||
   comparable(value).startsWith(comparable(checkout)+sep);
  if([...actualPaths,...canonical].some(inside))
   throw Error('secrets_must_remain_outside_checkout');
  if(new Set(canonical.map(comparable)).size!==canonical.length)
   throw Error('duplicate_file_paths');
  for(const path of paths.slice(0,2)){
   const stat=lstatSync(path);
   if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)
    throw Error('protected_input_not_regular');
  }
  const st=lstatSync(paths[1]);
  if(process.platform==='win32'){
   const receipt=process.env.SABORA_RELEASE_NTFS_ACL_RECEIPT_SHA256;
   if(!/^[0-9a-f]{64}$/.test(receipt??''))
    throw Error('ntfs_acl_receipt_required');
   const actual=verifiedNtfsAclDigest(paths[1]);
   if(receipt!==actual)throw Error('ntfs_acl_receipt_mismatch');
   // A protected output directory is required before writing approvals:
   // createWriteStream/file modes alone do not establish Windows DACLs.
   verifiedNtfsAclDigest(dirname(paths[2]));
   verifiedNtfsAclDigest(paths[0]);
  }else if((st.mode&0o077)!==0){
   throw Error('private_key_file_permissions_not_restricted');
  }
  const result=signAuthorizedRelease(JSON.parse(readFileSync(paths[0],'utf8')),readFileSync(paths[1]));
  writeFileSync(paths[2]+'.json',result.raw,{mode:0o600,flag:'wx'});
  writeFileSync(paths[2]+'.sig',result.signatureB64+'\n',{mode:0o600,flag:'wx'});
  writeFileSync(paths[2]+'.pub.pem',result.publicKey,{mode:0o644,flag:'wx'});
  process.stdout.write('Approval signed offline. Keep private key outside CI, VPS and Git.\n');
  process.stdout.write('Store JSON and signature as protected values; publish the public key only after owner approval.\n');
 }catch(e){process.stderr.write('sabora_release_sign_stop:'+
  String(e?.message||'invalid').replace(/[^a-zA-Z0-9:_-]/g,'_')+'\n');process.exitCode=1;}
}
