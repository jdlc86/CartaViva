// Legacy diagnostic API stays non-mutating. The installed fixed launcher calls
// executeInstalledHostRequest, which verifies the full root-owned installation.
import {fileURLToPath} from 'node:url';
import {parseForcedReleaseCommand,readProtectedFile,HOST_RELEASE_PATHS,
 authorizeHostOperation} from './sabora-release-host-agent.mjs';
import {receiveReleaseBundle} from './sabora-release-receiver.mjs';
import {verifyRollbackEnvelope} from '../ci/sabora-release-rollback-request.mjs';
export async function executeInstalledHostRequest(source){
 const {verifyControllerInstallation}=await import('./sabora-release-installation.mjs');
 const installation=verifyControllerInstallation({environment:'production'});
 const {runReleaseController}=await import('./sabora-release-controller.mjs');
 return runReleaseController({source,installation});
}
export async function handleSaboraHostRequest({source,command,publicKey,stageRoot,
 readProtectedHistory,observeExclusiveRuntime,now=Date.now()}){
 const operation=parseForcedReleaseCommand(command).operation;
 if(operation==='deploy'){
  const staged=await receiveReleaseBundle(source,{command,publicKey,stageRoot,now});
  return Object.freeze({operation,stage:staged,actuated:false});
 }
 // A rollback never fetches the expiring CI artifact; it can only target a
 // prior Sabora release already retained and independently observed on host.
 const proof=await verifyRollbackEnvelope(source,{command,publicKey,
  readProtectedHistory,observeExclusiveRuntime,now});
 return Object.freeze({operation,proof,actuated:false});
}
const self=process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1];
if(self){
 try{
  const publicKey=readProtectedFile(HOST_RELEASE_PATHS.publicKey,0,65536).toString('utf8');
  const result=await handleSaboraHostRequest({source:process.stdin,
   command:process.env.SSH_ORIGINAL_COMMAND,publicKey,
   stageRoot:HOST_RELEASE_PATHS.bundles});
  process.stderr.write('sabora_'+result.operation+'_verified_no_actuation\n');
  authorizeHostOperation(); // irrevocable STOP until authorized host controller exists
 }catch(error){
  process.stderr.write(String(error?.message||error).replace(/[^a-zA-Z0-9:_-]/g,'_')+'\n');
  process.exitCode=1;
 }
}
