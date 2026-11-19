// Root-owned release state. No caller-controlled paths or automatic provisioning.
import {constants,openSync,closeSync,fstatSync,lstatSync,readFileSync,writeFileSync,
 fsyncSync,renameSync,unlinkSync,realpathSync} from 'node:fs';
import {resolve,dirname,join,parse} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';

export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function releaseStop(code){throw Error('sabora_controller_stop:'+code);}
export function exactKeys(value,keys){
 return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  Object.keys(value).sort().join('|')===keys.slice().sort().join('|');
}
export function trustedDirectory(path,{uid=0,privateDirectory=false}={}){
 const absolute=resolve(path);
 if(path!==absolute||realpathSync(absolute)!==absolute)releaseStop('noncanonical_directory');
 for(let current=absolute;;current=dirname(current)){
  const st=lstatSync(current);
  if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==uid||
    (st.mode&0o022)!==0)releaseStop('untrusted_directory_chain');
  if(current===absolute&&privateDirectory&&(st.mode&0o077)!==0)
   releaseStop('nonprivate_directory');
  if(current===parse(current).root)break;
 }
 return absolute;
}
export function openProtected(path,{uid=0,maxBytes=1048576,privateFile=false}={}){
 trustedDirectory(dirname(path),{uid});
 const before=lstatSync(path);
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const st=fstatSync(fd);
  if(!st.isFile()||st.nlink!==1||st.uid!==uid||st.size<1||st.size>maxBytes||
    (st.mode&(privateFile?0o077:0o022))!==0||before.dev!==st.dev||before.ino!==st.ino)
   releaseStop('untrusted_file');
  return {fd,stat:st};
 }catch(error){closeSync(fd);throw error;}
}
export function protectedBytes(path,options){
 const {fd,stat}=openProtected(path,options);
 try{
  const bytes=readFileSync(fd),after=fstatSync(fd);
  if(bytes.length!==stat.size||after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||
    after.ctimeMs!==stat.ctimeMs)releaseStop('file_changed_during_read');
  return bytes;
 }finally{closeSync(fd);}
}
export function syncDirectory(directory){
 const fd=openSync(directory,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
 try{fsyncSync(fd);}finally{closeSync(fd);}
}
export function durableExclusive(path,value){
 trustedDirectory(dirname(path),{privateDirectory:true});
 let fd;
 try{
  fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  writeFileSync(fd,JSON.stringify(value)+'\n');fsyncSync(fd);
 }finally{if(fd!==undefined)closeSync(fd);}
 syncDirectory(dirname(path));
}
export function durableReplace(path,value){
 trustedDirectory(dirname(path),{privateDirectory:true});
 const partial=join(dirname(path),'.transaction-'+randomBytes(16).toString('hex'));
 durableExclusive(partial,value);
 // Both the directory and temporary file are inaccessible to the SSH/app user.
 // A failed write/rename is deliberately left for operator reconciliation.
 renameSync(partial,path);syncDirectory(dirname(path));
}
export function acquireReleaseLock(directory){
 trustedDirectory(directory,{privateDirectory:true});
 const path=join(directory,'controller.lock');
 try{durableExclusive(path,{schema:'sabora-release-lock/v1',pid:process.pid});}
 catch(error){if(error.code==='EEXIST')releaseStop('release_locked_or_crashed');throw error;}
 let held=true;
 return ()=>{if(held){unlinkSync(path);syncDirectory(directory);held=false;}};
}
