// Candidate runtime custody: root controls the bytes; each service has a
// distinct numeric identity and only the read-only mounts it actually needs.
// No chmod/chown/ACL modification is performed by this verifier.
import {lstatSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {protectedBytes,trustedDirectory,sha256,exactKeys,releaseStop as stop} from './sabora-release-protected-store.mjs';
import {RELEASE_MOUNTS,RELEASE_USERS} from './sabora-release-compose-policy.mjs';
const hash=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)&&!/^0+$/.test(v);
const apiGid=Number(RELEASE_USERS.api.split(':')[1]),webGid=Number(RELEASE_USERS.web.split(':')[1]);
const bits=n=>['r','w','x'].map((char,i)=>n&(4>>i)?char:'-').join('');
function exactAccess(path,{gid=0,mode,directory=false},run){
 const check=()=>{
  const st=lstatSync(path);
  if(st.uid!==0||st.gid!==gid||(st.mode&0o7777)!==mode||
   (directory?!st.isDirectory():!st.isFile()||st.nlink!==1)||st.isSymbolicLink())
   stop('runtime_permissions_mismatch');
  return st;
 };
 const before=check();
 // No extended named-user/group ACLs, default ACLs or unexpected mask.
 // The pinned read-only executable is part of the signed installation.
 const acl=run('getfacl',['-c','-n','-E','--',path],{timeout:5000}).stdout.trim();
 const expected=['user::'+bits((mode>>6)&7),'group::'+bits((mode>>3)&7),'other::'+bits(mode&7)].join('\n');
 if(acl!==expected)stop('runtime_acl_not_exclusive');
 const after=check();
 if(before.dev!==after.dev||before.ino!==after.ino||before.ctimeMs!==after.ctimeMs)
  stop('runtime_permissions_changed');
 return after;
}
function directory(path,options,run){
 trustedDirectory(path);return exactAccess(path,{...options,directory:true},run);
}
function file(path,options,run,maxBytes){
 const before=exactAccess(path,options,run);
 const bytes=protectedBytes(path,{maxBytes});
 const after=exactAccess(path,options,run);
 if(before.dev!==after.dev||before.ino!==after.ino||before.ctimeMs!==after.ctimeMs)
  stop('runtime_file_changed');
 return bytes;
}
export function verifyRuntimeMounts(config,run,{requireGenesis=false}={}){
 const h=config.mountHashes;
 if(!exactKeys(h,['manifest','egress','secrets'])||!hash(h.manifest)||!hash(h.egress)||
  !h.secrets||typeof h.secrets!=='object'||Array.isArray(h.secrets)||
  !Object.keys(h.secrets).length||Object.keys(h.secrets).length>128||
  !Object.entries(h.secrets).every(([name,digest])=>/^[a-z][a-z0-9_-]{2,63}$/.test(name)&&hash(digest)))
  stop('runtime_mount_inventory_invalid');
 // Root-only parent prevents unrelated host principals (including a matching
 // numeric UID/GID elsewhere) from reading any mount through its host path.
 directory('/etc/sabora/runtime',{mode:0o700},run);
 directory(RELEASE_MOUNTS.secrets,{gid:apiGid,mode:0o750},run);
 const names=readdirSync(RELEASE_MOUNTS.secrets).sort();
 if(names.join('|')!==Object.keys(h.secrets).sort().join('|'))stop('secret_inventory_changed');
 const manifestBytes=file(RELEASE_MOUNTS.manifest,{gid:apiGid,mode:0o640},run,262144);
 if(sha256(manifestBytes)!==h.manifest||
  sha256(file(RELEASE_MOUNTS.egress,{mode:0o444},run,65536))!==h.egress)stop('mount_content_changed');
 // V2 currently admits only genesis; reject an inconsistent runtime scope
 // even if the root-owned file and its configured digest agree. The real
 // SQL receipt and one-use state are verified separately by the driver.
 if(requireGenesis){
  let manifest;try{manifest=JSON.parse(manifestBytes);}catch{stop('runtime_genesis_scope_invalid');}
  const scope=manifest?.activationScope, evidence=manifest?.activationEvidence;
  const required={"mode":"deferred-first-test-activation","testDataOnly":true,"realUsersAllowed":false,"backupPerformed":false,"restorePerformed":false};
  if(!exactKeys(scope,Object.keys(required))||
     !Object.entries(required).every(([key,value])=>scope[key]===value)||
     evidence?.backupRestoreVerified!==false||evidence?.rollbackVerified!==false)
   stop('runtime_genesis_scope_invalid');
 }
 for(const name of names)if(sha256(file(join(RELEASE_MOUNTS.secrets,name),{gid:apiGid,mode:0o640},run,16384))!==h.secrets[name])stop('secret_changed');
 // Both API and egress receive the same nonsecret destination policy as an
 // individual RO bind; no other runtime file/directory is mounted to egress.
 // The web requires only its TLS pair. The historical host parent is NOT
 // converted by this code; it must be separately approved and provisioned.
 directory('/srv/sabora',{mode:0o700},run);
 directory(RELEASE_MOUNTS.tls,{gid:webGid,mode:0o750},run);
 if(readdirSync(RELEASE_MOUNTS.tls).sort().join('|')!=='origin.crt|origin.key')stop('tls_inventory_changed');
 for(const name of ['origin.crt','origin.key'])file(join(RELEASE_MOUNTS.tls,name),{gid:webGid,mode:0o640},run,1048576);
 // Recheck the private parent directories after traversing their contents.
 directory('/etc/sabora/runtime',{mode:0o700},run);
 directory('/srv/sabora',{mode:0o700},run);
 return true;
}
