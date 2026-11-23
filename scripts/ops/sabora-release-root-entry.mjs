// No command-line flags, environment switches, lab imports or enable boolean.
import {executeInstalledHostRequestV2} from './sabora-release-host-router.mjs';
import {safeReleaseError} from './sabora-release-controller.mjs';
try{
 if(process.argv.length!==2)throw Error('sabora_controller_stop:arguments_denied');
 process.umask(0o077);
 process.stdout.write(JSON.stringify(await executeInstalledHostRequestV2(process.stdin))+'\n');
}catch(error){process.stderr.write(safeReleaseError(error)+'\n');process.exitCode=1;}
