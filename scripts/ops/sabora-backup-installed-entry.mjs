// Separate entry for the production candidate. No production fallback to
// the laboratory receiver. Signed material is checked inside the rotation
// wrapper; no caller-supplied paths, configuration, key or command.
import {receiveInstalledVpsReplica} from './sabora-vps-backup-rotation.mjs';
try{
 const result=await receiveInstalledVpsReplica({source:process.stdin});
 process.stdout.write(JSON.stringify(result)+'\n');
}catch(error){
 const value=String(error?.message??'');
 process.stderr.write((/^sabora_backup_installed_receiver_stop:[a-z_]+$/.test(value)?
  value:'sabora_backup_installed_receiver_stop:rejected')+'\n');
 process.exitCode=1;process.stdin.destroy();
}
