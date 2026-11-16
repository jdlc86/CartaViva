// Postgres 17 synchronized snapshot exporter. The transaction stays open
// until both pg_dump streams and the inventory have imported its exact ID.
// No credentials, SQL output, server connection strings or plaintext dumps are logged.
import {spawn} from 'node:child_process';

const stop=code=>Error('sabora_snapshot_stop:'+code);
const SYSTEM=/^[0-9]{10,20}$/;
const ID=/^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9A-Fa-f]+$/;
const DB=/^[a-z][a-z0-9_]{0,62}$/;
export async function openPostgresBackupSnapshot({command,args,expectedSystemIdentifier,
 expectedDatabase='postgres',timeoutMs=30000}={}){
 if(typeof command!=='string'||!command||!Array.isArray(args)||
    args.some(x=>typeof x!=='string')||!SYSTEM.test(expectedSystemIdentifier??'')||
    !DB.test(expectedDatabase??'')||!Number.isSafeInteger(timeoutMs)||
    timeoutMs<1000||timeoutMs>60000)throw stop('invalid_snapshot_request');
 const env={...process.env};
 delete env.SABORA_BACKUP_KEY_FILE;delete env.SABORA_BACKUP_COMPONENT;
 const child=spawn(command,args,{env,stdio:['pipe','pipe','pipe'],windowsHide:true});
 let finished=false,stderrCount=0;
 child.stderr.on('data',chunk=>{stderrCount+=chunk.length;});
 const close=new Promise((resolve,reject)=>{
  child.once('error',()=>reject(stop('exporter_spawn_failed')));
  child.once('close',(code,signal)=>{finished=true;
   if(code===0&&signal===null)resolve();else reject(stop('exporter_exited'));
  });
 });
 // Observe close early even if the exporter fails before providing the ID.
 close.catch(()=>{});
 let buffer='';
 let response;
 try{
  response=await Promise.race([
   new Promise((resolve,reject)=>{
    child.stdout.setEncoding('utf8');
    child.stdout.on('data',chunk=>{
     buffer+=chunk;
     if(buffer.length>4096){reject(stop('exporter_output_invalid'));return;}
     const line=buffer.indexOf('\n');
     if(line<0)return;
     const match=/^SABORA_SNAPSHOT\|([0-9]{10,20})\|([a-z][a-z0-9_]{0,62})\|([0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9A-Fa-f]+)$/
      .exec(buffer.slice(0,line).trim());
     if(!match){reject(stop('exporter_identity_invalid'));return;}
     resolve({systemIdentifier:match[1],database:match[2],snapshotId:match[3]});
    });
    child.stdin.on('error',()=>reject(stop('exporter_input_closed')));
    child.stdin.write(
     "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"+
     "SELECT 'SABORA_SNAPSHOT|' || (pg_control_system()).system_identifier::text || '|' || current_database() || '|' || pg_export_snapshot();\n"
    );
   }),
   close.then(()=>{throw stop('exporter_closed_before_snapshot');}),
   new Promise((_resolve,reject)=>setTimeout(()=>reject(stop('exporter_timeout')),timeoutMs)),
  ]);
  if(finished||response.systemIdentifier!==expectedSystemIdentifier||
     response.database!==expectedDatabase||!ID.test(response.snapshotId))
   throw stop('source_identity_mismatch');
 }catch(error){child.kill('SIGKILL');throw error;}
 return Object.freeze({...response,
  async close(){
   if(finished)throw stop('exporter_lost_before_capture');
   child.stdin.end('COMMIT;\n');
   await Promise.race([close,new Promise((_resolve,reject)=>setTimeout(()=>{
    child.kill('SIGKILL');reject(stop('exporter_close_timeout'));
   },timeoutMs))]);
  },
  abort(){if(!finished)child.kill('SIGKILL');}
 });
}
