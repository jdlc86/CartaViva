// One SSH -> signed wire -> real installed core/driver -> Docker -> rollback lab.
import assert from 'node:assert/strict';
import {spawnSync,spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,chmodSync,chownSync,existsSync,copyFileSync,
 rmSync,realpathSync,renameSync,symlinkSync,linkSync,unlinkSync,readdirSync,lstatSync,createReadStream,statSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {sign} from 'node:crypto';
import {once} from 'node:events';
import {buildReleaseBundleManifest} from './sabora-release-bundle.mjs';
import {buildControllerArtifact} from './sabora-release-controller-artifact.mjs';
import {sendReleaseBundle} from './sabora-release-transport.mjs';
import {renderRollbackEnvelope} from './sabora-release-rollback-request.mjs';
import {EVIDENCE_KEYS,SABORA_RELEASE_SCOPE,stableStringify} from './sabora-release-governor.mjs';
import {renderIngressFilter} from './sabora-ingress-network-policy.mjs';
import {renderSaboraEgressGuard} from './sabora-egress-network-policy.mjs';
import {canonicalNft,NETWORK_NAMES} from '../ops/sabora-release-local-inspector.mjs';
import {CONTROLLER_PATHS as P,CONTROLLER_TOOLS,deriveInstallationSubject} from '../ops/sabora-release-installation.mjs';
import {sha256} from '../ops/sabora-release-protected-store.mjs';
import {releaseProcessFailureKind} from '../ops/sabora-release-process.mjs';
import {inspectDockerSaveArchive} from '../ops/sabora-release-image-archive.mjs';
import {immutableComposeOverride,validateClosedCompose,RELEASE_USERS} from '../ops/sabora-release-compose-policy.mjs';
import {LAB_ENVIRONMENT,labAuthority,signedLabDocument,labHash,keyIdentity,materialLabDossiers} from './sabora-release-lab-fixtures.mjs';
if(process.platform!=='linux'||process.getuid()!==0||process.env.GITHUB_ACTIONS!=='true'||process.env.CI!=='true'||
 process.env.SABORA_DISPOSABLE_RELEASE_LAB!=='explicitly-authorized-ci')throw Error('sabora_lab_stop:disposable_runner_required');
const sourceSha=process.env.GITHUB_SHA,runId=process.env.GITHUB_RUN_ID,repo=process.cwd();
const work='/var/lib/sabora-release/lab',output=join(process.env.RUNNER_TEMP,'sabora-release-driver-lab');
const account='sabora-release',sudoRule='/etc/sudoers.d/sabora-release-lab',externalNet='sabora_release_fixture_external';
const sinkName='sabora-release-fixture-sink',sentinelName='sabora-release-fixture-sentinel';
const createdNetworks=[],createdImages=[],createdContainers=[],createdRoots=[],checks=[];
let sshd,hostsBefore,addressAdded=false,userCreated=false,nftOwned=false,configuration,installPayload,baselineSentinel,namesVerifiedEmpty=false;
const ok=name=>{checks.push(name);console.log('sabora_controller_lab_pass:'+name);};
function run(bin,args,{input,allowFailure=false,...opts}={}){
 const result=spawnSync(bin,args,{input,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024,...opts});
 if(!allowFailure&&(result.error||result.status!==0))throw Error('lab_command_failed:'+bin+':'+String(result.stderr).slice(0,1500));return result;
}
const docker=(args,opts)=>run('docker',args,opts),json=args=>JSON.parse(docker(args).stdout);
const put=(path,value,mode=0o600)=>{mkdirSync(dirname(path),{recursive:true,mode:0o700});writeFileSync(path,value,{mode});chmodSync(path,mode);};
const parse=path=>JSON.parse(readFileSync(path)),hashFile=path=>sha256(readFileSync(path));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const owner=labAuthority(),allocation=labAuthority(),alert=labAuthority(),authorities=Object.fromEntries(EVIDENCE_KEYS.map(k=>[k,labAuthority()]));
function signedInstall(){put(P.config,JSON.stringify(configuration)+'\n');installPayload.configurationSha256=hashFile(P.config);put(P.installation,signedLabDocument(installPayload,owner));}
function sentinel(){
 const v=json(['container','inspect',sentinelName])[0];
 const identity={id:v.Id,image:v.Image,started:v.State.StartedAt,labels:v.Config.Labels,restarts:v.RestartCount};
 if(baselineSentinel)assert.deepEqual(identity,baselineSentinel);assert.equal(v.State.Running,true);
 assert.equal(run('curl',['--fail','--silent','--max-time','3','http://172.28.242.3:9999']).stdout,'sentinel-alive');return identity;
}
function snapshot(){return [...SABORA_RELEASE_SCOPE.services.map(s=>docker(['container','inspect','--format','{{.Id}} {{.Image}} {{.State.StartedAt}}','sabora-'+s+'-1'],{allowFailure:true}).stdout),
 ...createdImages.map(tag=>docker(['image','inspect','--format','{{.Id}}',tag],{allowFailure:true}).stdout)].join('|');}
const sshBase=()=>['-F','/dev/null','-p','22229','-i',work+'/ssh-client','-o','BatchMode=yes','-o','IdentitiesOnly=yes',
 '-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+work+'/known_hosts','-o','ConnectTimeout=5','sabora-release@127.0.0.1'];
// Capture ONLY bounded, nonsecret state from the disposable lab before its
// cleanup. Never upload raw logs, inspect output, environment or fixture keys.
// An unexpected failed positive session remains a failed test.
function capturePositiveFailure(stderr,exitCode){
 const journalPath=P.ledger+'/transaction.json',historyPath=P.ledger+'/history.json';
 const safeRead=path=>{try{return existsSync(path)?parse(path):null;}catch{return null;}};
 const journal=safeRead(journalPath),history=safeRead(historyPath);
 const enums=(value,allowed)=>allowed.includes(value)?value:'unknown';
 const validSha=value=>typeof value==='string'&&/^[0-9a-f]{40}$/.test(value)?value:null;
 const code=stderr.split('\n').find(line=>/^sabora_[a-z_]+_stop:[a-z0-9_:-]{1,160}$/.test(line))??'unclassified';
 const phase=journal?enums(journal.failedPhase??journal.phase,['admitted','image-load-api','image-load-web','compose-up','readiness','retention','postchecks-committed','reconciliation-required']):null;
 const containers=SABORA_RELEASE_SCOPE.services.map(service=>{
  const name='sabora-'+service+'-1';
  const owner=docker(['container','inspect','--format','{{index .Config.Labels "io.sabora.managed-by"}}',name],{allowFailure:true});
  if(owner.status!==0)return {service,state:'absent-or-unavailable'};
  if(!namesVerifiedEmpty||owner.stdout.trim()!=='release-controller-v1')return {service,state:'ownership-unproven'};
  const result=docker(['container','inspect','--format','{{json .State}}',name],{allowFailure:true});
  if(result.status!==0)return {service,state:'inspection-failed'};
  try{
   const value=JSON.parse(result.stdout),logs=docker(['logs','--tail','25',name],{allowFailure:true});
   return {service,state:enums(value.Status,['created','running','paused','restarting','removing','exited','dead']),
    running:value.Running===true,exitCode:Number.isInteger(value.ExitCode)?value.ExitCode:null,
    health:enums(value.Health?.Status,['starting','healthy','unhealthy','none']),
    oomKilled:value.OOMKilled===true,
    engineErrorKind:value.Error?releaseProcessFailureKind(value.Error):null,
    recentLogKind:releaseProcessFailureKind(String(logs.stderr)+String(logs.stdout)),
    healthFailureKind:value.Health?.Log?.length?releaseProcessFailureKind(value.Health.Log.at(-1).Output):null};
  }catch{return {service,state:'inspection-failed'};}
 });
 const diagnostic={schema:'sabora-controller-disposable-failure/v1',sourceSha,runId,
  code,exitCode,phase,journalState:journal?enums(journal.state,['consumed','in-progress','unknown','healthy']):null,
  journalReleaseSha:validSha(journal?.releaseSha),activeReleaseSha:validSha(history?.activeReleaseSha),
  containers,completedChecks:[...checks],operationalAcceptance:false,labOnly:true};
 put(output+'/failure-diagnostic.json',JSON.stringify(diagnostic,null,2)+'\n',0o644);
 chmodSync(output,0o755);
 console.error('sabora_controller_lab_failure:'+JSON.stringify(diagnostic));
}
async function session(command,feed,{expectSuccess=false}={}){
 const child=spawn('ssh',[...sshBase(),command],{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
 child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.stdin.on('error',()=>{});const exited=once(child,'close');
 try{if(feed)await feed(child.stdin);else child.stdin.end();}catch{child.stdin.destroy();}
 const [code]=await exited;
 if(expectSuccess&&code!==0){
  try{capturePositiveFailure(stderr,code);}catch{console.error('sabora_controller_lab_failure_capture_unavailable');}
  // Do not echo arbitrary SSH stderr even on a failing assertion.
  assert.equal(code,0,'positive session failed; see bounded lab diagnostic');
 }else if(!expectSuccess)assert.notEqual(code,0,'negative session unexpectedly succeeded');
 return {code,stdout,stderr};
}
function approval(bundle,operation,id,{ttl=600000,offset=-1000,evidencePatch,manifestBytes=bundle.manifestBytes}={}){
 const docs=materialLabDossiers({sha:bundle.sha,expected:configuration.expected,keys:authorities});if(evidencePatch)evidencePatch(docs);
 for(const bytes of Object.values(docs))put(join(P.evidence,sha256(bytes)+'.json'),bytes);
 const body={schema:'sabora-governed-release/v1',repository:SABORA_RELEASE_SCOPE.repository,operation,releaseSha:bundle.sha,
  authorizationId:id,approvedAt:new Date(Date.now()+offset).toISOString(),expiresAt:new Date(Date.now()+ttl).toISOString(),
  server:SABORA_RELEASE_SCOPE.host,project:'sabora',port:8443,origins:SABORA_RELEASE_SCOPE.origins,services:SABORA_RELEASE_SCOPE.services,
  bundleManifestSha256:sha256(manifestBytes),evidence:Object.fromEntries(EVIDENCE_KEYS.map(k=>[k,sha256(docs[k])]))};
 const raw=stableStringify(body);return {body,approvalB64:Buffer.from(raw).toString('base64'),signatureB64:sign(null,Buffer.from(raw),owner.privateKey).toString('base64'),manifestBytes,
  command:['sabora-release-v1',operation,bundle.sha,id,sha256(raw),runId].join(' ')};
}
function feed(bundle,a){return stream=>a.body.operation==='rollback'?stream.end(renderRollbackEnvelope(a)):sendReleaseBundle(stream,{...a,paths:bundle.paths});}
async function denied(label,bundle,a,customFeed){const before=snapshot(),result=await session(a.command,customFeed??feed(bundle,a));assert.equal(snapshot(),before,label+' mutated runtime');sentinel();ok(label);return result;}
async function success(label,bundle,a){
 let monitorError;const monitor=setInterval(()=>{try{sentinel();}catch(e){monitorError=e;}},350);let result;
 try{result=await session(a.command,feed(bundle,a),{expectSuccess:true});}finally{clearInterval(monitor);}if(monitorError)throw monitorError;
 const receipt=JSON.parse(result.stdout);assert.equal(receipt.state,'healthy');assert.equal(receipt.releaseSha,bundle.sha);
 assert.equal(parse(P.ledger+'/history.json').activeReleaseSha,bundle.sha);
 for(const s of SABORA_RELEASE_SCOPE.services){
  const info=json(['container','inspect','sabora-'+s+'-1'])[0];
  assert.equal(info.Image,bundle.manifest.images[s==='web'?'web':'api'].imageId);
  assert.equal(info.Config.User,RELEASE_USERS[s]);
  assert.ok(info.Mounts.every(m=>m.RW===false||m.Type==='tmpfs'));
 }
 // The web can read only its TLS pair; no API secret or policy is mounted.
 docker(['exec','sabora-web-1','/bin/sh','-ec','test "$(id -u):$(id -g)" = 10001:10001 && test -r /run/sabora/tls/origin.key && test ! -w /run/sabora/tls/origin.key && test ! -e /run/secrets/sabora/lab-access-probe && test ! -e /run/sabora/activation.json && test ! -e /run/sabora/egress-policy.json']);
 // No shell or Docker authority on the dedicated SSH user. Its host path
 // to the secret is denied even though the API's bind is readable.
 assert.notEqual(run('runuser',['-u',account,'--','test','-r','/etc/sabora/runtime/secrets/lab-access-probe'],{allowFailure:true}).status,0);
 sentinel();ok(label);return receipt;
}
try{
 for(const root of ['/etc/sabora','/var/lib/sabora-release','/srv/sabora']){assert.equal(existsSync(root),false,'exclusive fixture path already exists');mkdirSync(root,{mode:0o755});createdRoots.push(root);}
 for(const path of [P.root,P.root+'/bin',P.evidence,P.ledger,P.staging,P.bundles,P.state,work,'/etc/sabora/runtime/secrets','/srv/sabora/tls',output])mkdirSync(path,{recursive:true,mode:0o700});
 chmodSync('/srv/sabora',0o700);chmodSync(P.root,0o755);chmodSync(P.root+'/bin',0o755);assert.equal(existsSync(sudoRule),false);assert.notEqual(run('id',[account],{allowFailure:true}).status,0);
 const networkReceipt=parse(join(process.env.RUNNER_TEMP,'sabora-network-enforcement/receipt.json'));assert.equal(String(networkReceipt.runId),runId);
 for(const name of [...Object.values(NETWORK_NAMES),externalNet])assert.notEqual(docker(['network','inspect',name],{allowFailure:true}).status,0);
 for(const service of SABORA_RELEASE_SCOPE.services)assert.notEqual(docker(['container','inspect','--format','{{.Id}}','sabora-'+service+'-1'],{allowFailure:true}).status,0);
 namesVerifiedEmpty=true;
 for(const name of ['sabora_ingress_guard','sabora_egress_guard'])assert.notEqual(run('nft',['list','table','inet',name],{allowFailure:true}).status,0);
 assert.equal(run('ip',['-j','address','show']).stdout.includes('146.59.145.64'),false);run('ip',['address','add','146.59.145.64/32','dev','lo']);addressAdded=true;
 hostsBefore=readFileSync('/etc/hosts');writeFileSync('/etc/hosts',Buffer.concat([hostsBefore,Buffer.from('\n146.59.145.64 sabora.allaiso.com gestion-sabora.allaiso.com # sabora-disposable-release-lab\n')]));
 const networks={runtime:{bridge:'br-1234567890ab',cidr:'172.28.200.0/24',gateway:'172.28.200.1'},ingress:{bridge:'br-234567890abc',cidr:'172.28.240.0/24',gateway:'172.28.240.1'},egress:{bridge:'br-34567890abcd',cidr:'172.28.241.0/24',gateway:'172.28.241.1'}};
 const networkIds={};
 for(const [kind,n] of Object.entries(networks)){
  const name=NETWORK_NAMES[kind],args=['network','create','--driver','bridge','--subnet',n.cidr,'--gateway',n.gateway,'--opt','com.docker.network.bridge.name='+n.bridge,'--label','com.docker.compose.project=sabora','--label','io.sabora.managed-by=release-provisioner-v1'];
  if(kind==='runtime')args.push('--internal');args.push(name);networkIds[kind]=docker(args).stdout.trim();createdNetworks.push(name);
 }
 docker(['network','create','--subnet','172.28.242.0/24',externalNet]);createdNetworks.push(externalNet);
 const cloudflareIpv4Cidrs=['172.28.242.3/32','127.0.0.1/32'],allowlisted=[{protocol:'tcp',cidr:'172.28.242.2/32',port:9443},{protocol:'tcp',cidr:'172.28.242.3/32',port:9999}];
 const ingress=renderIngressFilter({bridge:networks.ingress.bridge,cloudflareIpv4Cidrs}),egress=renderSaboraEgressGuard({bridge:networks.egress.bridge,allowlisted});
 // nft opens "-"/stdin as /dev/stdin on this runner and rejects the pipe.
 // Both policy files are created under the private root-owned lab directory.
 // Check the exact regular file before applying; no global ruleset mutation.
 const labNftPolicy=work+'/network-policy.nft',labEgressPolicy=work+'/egress-policy.nft';
 put(labNftPolicy,ingress+egress);put(labEgressPolicy,egress);
 run('nft',['--check','--file',labNftPolicy]);nftOwned=true;
 run('nft',['--file',labNftPolicy]);
 const policy={networks,cloudflareIpv4Cidrs,allowlisted,nftSha256:Object.fromEntries(['ingress','egress'].map(kind=>[kind,sha256(stableStringify(canonicalNft(JSON.parse(run('nft',['--json','list','table','inet','sabora_'+kind+'_guard']).stdout))))]))};
 const reservation=signedLabDocument({schema:'sabora-allocation-reservation/v1',project:'sabora',host:SABORA_RELEASE_SCOPE.host,networkPolicySha256:sha256(stableStringify(policy)),networkNames:NETWORK_NAMES,networkIds,port:8443,scope:'all-active-and-inactive-allocations-and-routes',observedAt:new Date().toISOString(),exclusiveUntil:new Date(Date.now()+3600000).toISOString()},allocation);put(P.state+'/allocation.json',reservation);
 run('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','15','-keyout',work+'/ca.key','-out',work+'/ca.pem','-subj','/CN=Disposable Sabora lab CA','-addext','basicConstraints=critical,CA:TRUE']);
 run('openssl',['req','-newkey','rsa:2048','-nodes','-keyout','/srv/sabora/tls/origin.key','-out',work+'/tls.csr','-subj','/CN=sabora.allaiso.com']);
 put(work+'/tls.ext','subjectAltName=DNS:sabora.allaiso.com,DNS:gestion-sabora.allaiso.com\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\n');
 run('openssl',['x509','-req','-in',work+'/tls.csr','-CA',work+'/ca.pem','-CAkey',work+'/ca.key','-CAcreateserial','-days','15','-out','/srv/sabora/tls/origin.crt','-extfile',work+'/tls.ext']);
 chownSync('/srv/sabora/tls',0,10001);chmodSync('/srv/sabora/tls',0o750);for(const name of ['origin.key','origin.crt']){chownSync('/srv/sabora/tls/'+name,0,10001);chmodSync('/srv/sabora/tls/'+name,0o640);}
 copyFileSync(work+'/ca.pem',P.root+'/origin-ca.pem');copyFileSync(work+'/ca.pem',P.root+'/lab-public-ca.pem');put(work+'/alert-private.pem',alert.privateKey.export({format:'pem',type:'pkcs8'}));
 // The fixture receiver gets a separate key and IP SAN certificate; never
 // reuse the two-origin web private key or broaden its SANs.
 const sinkTls=work+'/sink-tls';mkdirSync(sinkTls,{mode:0o700});
 run('openssl',['req','-newkey','rsa:2048','-nodes','-keyout',sinkTls+'/origin.key','-out',work+'/sink.csr','-subj','/CN=Disposable Sabora receiver']);
 put(work+'/sink.ext','subjectAltName=IP:172.28.242.1\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\n');
 run('openssl',['x509','-req','-in',work+'/sink.csr','-CA',work+'/ca.pem','-CAkey',work+'/ca.key','-CAserial',work+'/ca.srl','-days','1','-out',sinkTls+'/origin.crt','-extfile',work+'/sink.ext']);
 const sinkScript="const https=require('https'),fs=require('fs'),crypto=require('crypto');const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);https.createServer({key:fs.readFileSync('/tls/origin.key'),cert:fs.readFileSync('/tls/origin.crt')},(req,res)=>{let body='';req.on('data',b=>body+=b);req.on('end',()=>{const event=JSON.parse(body);const payload={schema:'sabora-alert-reception/v1',project:'sabora',releaseSha:event.releaseSha,correlation:event.correlation,receivedSha256:crypto.createHash('sha256').update(body).digest('hex'),receivedAt:new Date().toISOString()};const signature=crypto.sign(null,Buffer.from(stable(payload)),fs.readFileSync('/authority/key.pem')).toString('base64');res.end(JSON.stringify({payload,signature}));});}).listen(9443,'0.0.0.0');";
 docker(['run','-d','--name',sinkName,'--network',externalNet,'--ip','172.28.242.2','--publish','172.28.242.1:9443:9443','--read-only','--cap-drop','ALL','-v',sinkTls+':/tls:ro','-v',work+'/alert-private.pem:/authority/key.pem:ro','node:22-alpine','node','-e',sinkScript]);createdContainers.push(sinkName);
 docker(['run','-d','--name',sentinelName,'--label','io.sabora.lab=foreign-sentinel','--network',externalNet,'--ip','172.28.242.3','--read-only','--cap-drop','ALL','node:22-alpine','node','-e',"require('http').createServer((q,r)=>r.end('sentinel-alive')).listen(9999,'0.0.0.0')"]);createdContainers.push(sentinelName);
 for(let i=0;i<30;i++){try{baselineSentinel=sentinel();break;}catch(e){if(i===29)throw e;await pause(200);}}
 // Remaining setup and scenarios are below, using the same production driver.
 buildControllerArtifact(P.code,sourceSha);copyFileSync(process.execPath,P.root+'/bin/node');chmodSync(P.root+'/bin/node',0o755);
 const composePlugin=['/usr/libexec/docker/cli-plugins/docker-compose','/usr/local/lib/docker/cli-plugins/docker-compose','/usr/lib/docker/cli-plugins/docker-compose'].find(existsSync);
 assert.ok(composePlugin,'system Compose plugin required');mkdirSync(P.root+'/docker-config/cli-plugins',{recursive:true,mode:0o700});copyFileSync(composePlugin,CONTROLLER_TOOLS.compose);chmodSync(CONTROLLER_TOOLS.compose,0o700);
 buildControllerArtifact(output+'/controller-artifact',sourceSha);
 const readable=dir=>{chmodSync(dir,0o755);for(const name of readdirSync(dir)){const file=dir+'/'+name;if(lstatSync(file).isDirectory())readable(file);else chmodSync(file,0o644);}};readable(output+'/controller-artifact');
 run(process.execPath,['--test',repo+'/tests/sabora-release-root-storage.test.mjs']);ok('root-storage-tar-replay-crash-tests');
 run('cc',['-O2','-Wall','-Wextra','-Werror','-o',P.root+'/bin/ssh-entry',repo+'/deploy/sabora-release-shell.c']);chmodSync(P.root+'/bin/ssh-entry',0o755);
 // Same C boundary, with a test-only fixed entry OUTSIDE shipped artifact.
 const rootSource=readFileSync(repo+'/deploy/sabora-release-root.c','utf8').replace('/etc/sabora/release/code/scripts/ops/sabora-release-root-entry.mjs','/etc/sabora/release/lab-entry.mjs');
 put(work+'/root-lab.c',rootSource);run('cc',['-O2','-Wall','-Wextra','-Werror','-o',P.root+'/bin/root-entry',work+'/root-lab.c']);chmodSync(P.root+'/bin/root-entry',0o755);
 put(P.root+'/lab-entry.mjs',"import {verifyControllerInstallation} from './code/scripts/ops/sabora-release-installation.mjs';\nimport {runReleaseController,safeReleaseError} from './code/scripts/ops/sabora-release-controller.mjs';\ntry{process.umask(0o077);const installation=verifyControllerInstallation({environment:'disposable-lab'});process.stdout.write(JSON.stringify(await runReleaseController({source:process.stdin,installation}))+'\\n')}catch(e){process.stderr.write(safeReleaseError(e)+'\\n');process.exitCode=1}\n");
 run('useradd',['--no-create-home','--home-dir','/nonexistent','--shell',P.root+'/bin/ssh-entry',account]);userCreated=true;run('usermod',['--password','*',account]);
 put(sudoRule,readFileSync(repo+'/deploy/sabora-release-sudoers.conf'),0o440);run('visudo',['-cf',sudoRule]);assert.equal(run('id',['-nG',account]).stdout.trim(),account);
 run('ssh-keygen',['-q','-t','ed25519','-N','','-f',work+'/ssh-host']);run('ssh-keygen',['-q','-t','ed25519','-N','','-f',work+'/ssh-client']);
 put(P.root+'/authorized_keys','restrict,command="/etc/sabora/release/bin/ssh-entry" '+readFileSync(work+'/ssh-client.pub','utf8').trim()+'\n',0o644);
 put(work+'/known_hosts','[127.0.0.1]:22229 '+readFileSync(work+'/ssh-host.pub','utf8').trim().split(' ').slice(0,2).join(' ')+'\n');
 const sshConfig=readFileSync(repo+'/deploy/sabora-release-sshd.conf','utf8').replace(/^ListenAddress .*$/m,'ListenAddress 127.0.0.1').replace(/^Port .*$/m,'Port 22229').replace(/^HostKey .*$/m,'HostKey '+work+'/ssh-host').replace(/^AuthorizedKeysFile .*$/m,'AuthorizedKeysFile '+P.root+'/authorized_keys');
 put(work+'/sshd.conf',sshConfig);mkdirSync('/run/sshd',{recursive:true,mode:0o755});run('/usr/sbin/sshd',['-t','-f',work+'/sshd.conf']);
 sshd=spawn('/usr/sbin/sshd',['-D','-e','-f',work+'/sshd.conf'],{stdio:['ignore','ignore','pipe']});let sshLog='';sshd.stderr.on('data',b=>sshLog+=b);await pause(300);assert.equal(sshd.exitCode,null,sshLog);
 put(P.publicKey,owner.pem);put(P.runtimeEnv,[
  'SABORA_OPERATIONAL_MANIFEST_FILE=/etc/sabora/runtime/activation.json','SABORA_OPERATIONAL_SECRETS_DIR=/etc/sabora/runtime/secrets','SABORA_EGRESS_POLICY_FILE=/etc/sabora/runtime/egress-policy.json',
  'SABORA_EGRESS_ALLOWLIST_NETWORK=sabora_egress_filtered','SABORA_RESTAURANT_CODE=SABORA','SABORA_INGRESS_BIND_IP=146.59.145.64','SABORA_CLIENT_HOST=sabora.allaiso.com','SABORA_MANAGEMENT_HOST=gestion-sabora.allaiso.com',
  'SABORA_WEB_TLS_DIRECTORY=/srv/sabora/tls','SABORA_INGRESS_FILTERED_NETWORK=sabora_ingress_filtered',''].join('\n'));
 // Synthetic values never enter the operational environment or artifact.
 const fixtureSecret='/etc/sabora/runtime/secrets/lab-access-probe';
 put('/etc/sabora/runtime/activation.json','{"explicitLabFixture":true}\n',0o640);
 put('/etc/sabora/runtime/egress-policy.json','{"explicitLabFixture":true}\n',0o444);
 put(fixtureSecret,'disposable mount access proof\n',0o640);
 chmodSync('/etc/sabora/runtime',0o700);
 chownSync('/etc/sabora/runtime/secrets',0,10002);chmodSync('/etc/sabora/runtime/secrets',0o750);
 chownSync('/etc/sabora/runtime/activation.json',0,10002);chownSync(fixtureSecret,0,10002);
 const expected={subjectSha256:null,databaseIdentitySha256:labHash('database'),migrationTreeSha256:labHash('migration-tree'),appliedLedgerSha256:labHash('ledger'),databaseTlsIdentitySha256:labHash('database-tls'),networkPolicySha256:sha256(stableStringify(policy)),allocationReservationSha256:sha256(reservation),alertReceiverIdentitySha256:keyIdentity(alert.pem)};
 configuration={schema:'sabora-controller-config/v1',environment:LAB_ENVIRONMENT,evidenceKeys:Object.fromEntries(EVIDENCE_KEYS.map(k=>[k,authorities[k].pem])),allocationKey:allocation.pem,alertKey:alert.pem,expected,
  compose:{operational:hashFile(repo+'/deploy/compose.sabora-operational.yml'),web:hashFile(repo+'/deploy/compose.sabora-web.yml')},networkPolicy:policy,reservationSha256:sha256(reservation),runtimeEnvSha256:hashFile(P.runtimeEnv),
  mountHashes:{manifest:hashFile('/etc/sabora/runtime/activation.json'),egress:hashFile('/etc/sabora/runtime/egress-policy.json'),secrets:{'lab-access-probe':hashFile(fixtureSecret)}},tls:{certificateSha256:hashFile('/srv/sabora/tls/origin.crt'),keySha256:hashFile('/srv/sabora/tls/origin.key'),originCaSha256:hashFile(work+'/ca.pem'),publicCaSha256:hashFile(work+'/ca.pem')},alert:{url:'https://172.28.242.1:9443/ack',receiverIdentitySha256:keyIdentity(alert.pem)},quotaBytes:20*1024**3};
 configuration.expected.subjectSha256=deriveInstallationSubject(configuration);
 installPayload={schema:'sabora-controller-installation/v1',repository:SABORA_RELEASE_SCOPE.repository,sourceSha,environment:LAB_ENVIRONMENT,artifactSha256:hashFile(P.code+'/artifact.json'),configurationSha256:'',nodeSha256:hashFile(P.root+'/bin/node'),launcherHashes:Object.fromEntries(['root-entry','ssh-entry'].map(name=>[name,hashFile(P.root+'/bin/'+name)])),toolHashes:Object.fromEntries(Object.entries(CONTROLLER_TOOLS).map(([k,path])=>[k,hashFile(realpathSync(path))])),approvedAt:new Date().toISOString()};signedInstall();
 const production=run(P.root+'/bin/node',[P.code+'/scripts/ops/sabora-release-root-entry.mjs'],{allowFailure:true});assert.notEqual(production.status,0);assert.match(production.stderr,/v2_installation_manifest_invalid/);ok('v1-lab-installation-rejected-by-v2-production-entry');
 const bundles=[];
 for(const [index,sha] of [sourceSha,sha256(sourceSha+':release-B').slice(0,40)].entries()){
  const dir=work+'/bundle-'+index,context=work+'/context-'+index;mkdirSync(dir,{mode:0o700});mkdirSync(context,{mode:0o700});
  put(context+'/Dockerfile','FROM node:22-alpine\nWORKDIR /app\nRUN addgroup -S -g 10002 sabora && adduser -S -u 10002 -G sabora sabora && addgroup -S -g 10003 sabora-egress && adduser -S -u 10003 -G sabora-egress sabora-egress\nCOPY --chown=sabora:sabora src ./src\nRUN chmod -R a+rX /app/src\nUSER sabora\nEXPOSE 4100\nCMD ["node","src/server.mjs"]\nLABEL io.sabora.lab.release="'+sha+'"\n');
  // Exercise the real bind paths and effective identities at service startup.
  const checkAccess="import fs from 'node:fs';const read=p=>{fs.readFileSync(p);};const forbidden=p=>{try{fs.accessSync(p,fs.constants.R_OK)}catch(e){if(['ENOENT','EACCES','ENOTDIR'].includes(e.code))return;throw e}throw Error('unexpected_runtime_access')};const ro=p=>{try{fs.accessSync(p,fs.constants.W_OK)}catch(e){if(['EACCES','EROFS'].includes(e.code))return;throw e}throw Error('unexpected_runtime_write')};";
  put(context+'/src/operational-server.mjs',checkAccess+"if(process.getuid()!==10002||process.getgid()!==10002)process.exit(1);for(const p of ['/run/sabora/activation.json','/run/sabora/egress-policy.json','/run/secrets/sabora/lab-access-probe']){read(p);ro(p)}forbidden('/run/sabora/tls/origin.key');import http from 'node:http';http.createServer((q,r)=>{r.writeHead(200);r.end('ready')}).listen(4100,'0.0.0.0');\n");
  put(context+'/src/sabora-egress-gateway.mjs',checkAccess+"if(process.getuid()!==10003||process.getgid()!==10003)process.exit(1);read('/run/sabora/egress-policy.json');ro('/run/sabora/egress-policy.json');forbidden('/run/sabora/activation.json');forbidden('/run/secrets/sabora/lab-access-probe');forbidden('/run/sabora/tls/origin.key');setInterval(()=>{},1000);\n");
  const apiTag='sabora-api:'+sha,webTag='sabora-web:'+sha;for(const tag of [apiTag,webTag])assert.notEqual(docker(['image','inspect',tag],{allowFailure:true}).status,0);
  docker(['build','-t',apiTag,context]);createdImages.push(apiTag);
  // Fixture source files are created root:root/0600 in a private host
  // context; COPY --chown mirrors Dockerfile.api's real nonroot ownership.
  // Exercise the final image's default user with its actual paths and
  // filesystem restrictions, before exporting or touching the release.
  assert.equal(docker(['image','inspect','--format','{{.Config.User}}',apiTag]).stdout.trim(),'sabora');
  docker(['run','--rm','--network','none','--read-only','--cap-drop','ALL',
   '--security-opt','no-new-privileges','--entrypoint','node',apiTag,'-e',
   "const fs=require('node:fs');if(process.getuid()!==10002||process.getgid()!==10002)process.exit(1);for(const p of ['src/operational-server.mjs','src/sabora-egress-gateway.mjs']){const file=fs.statSync(p);if(!file.isFile()||file.uid!==10002)process.exit(1);fs.accessSync(p,fs.constants.R_OK);fs.readFileSync(p)}"]);
  docker(['run','--rm','--network','none','--read-only','--cap-drop','ALL','--user',RELEASE_USERS['sabora-egress'],
   '--security-opt','no-new-privileges','--entrypoint','node',apiTag,'-e',
   "const fs=require('node:fs');if(process.getuid()!==10003||process.getgid()!==10003)process.exit(1);fs.readFileSync('src/sabora-egress-gateway.mjs')"]);

  put(context+'/Dockerfile.web','FROM sabora-web:ci\nLABEL io.sabora.lab.release="'+sha+'"\n');docker(['build','-f',context+'/Dockerfile.web','-t',webTag,context]);createdImages.push(webTag);
  const apiId=json(['image','inspect',apiTag])[0].Id,webId=json(['image','inspect',webTag])[0].Id,paths=['api.tar','web.tar','operational.yml','web.yml'].map(n=>dir+'/'+n);
  docker(['image','save','--output',paths[0],apiTag]);docker(['image','save','--output',paths[1],webTag]);copyFileSync(repo+'/deploy/compose.sabora-operational.yml',paths[2]);copyFileSync(repo+'/deploy/compose.sabora-web.yml',paths[3]);for(const path of paths)chmodSync(path,0o600);
  const manifest=await buildReleaseBundleManifest({releaseSha:sha,apiArchive:paths[0],webArchive:paths[1],apiImageId:apiId,webImageId:webId,operationalCompose:paths[2],webCompose:paths[3]}),manifestBytes=Buffer.from(JSON.stringify(manifest)+'\n');put(dir+'/manifest.json',manifestBytes);bundles.push({sha,manifest,manifestBytes,paths});docker(['image','rm',apiTag,webTag]);
 }
 ok('api-gateway-fixture-ownership-readable-as-nonroot-in-both-images');
 const [a,b]=bundles;
 for(const bundle of bundles)for(const [i,type] of ['api','web'].entries())
  assert.equal(inspectDockerSaveArchive(bundle.paths[i],bundle.manifest.images[type]).imageId,bundle.manifest.images[type].imageId);
 ok('four-real-docker-archives-verified-before-transport');
 put(work+'/overlay.yml',immutableComposeOverride(a.manifest));
 const resolved=json(['compose','--project-name','sabora','--project-directory',P.root,'--env-file',P.runtimeEnv,'-f',a.paths[2],'-f',a.paths[3],'-f',work+'/overlay.yml','config','--format','json']);
 validateClosedCompose(resolved,a.manifest);
 for(const mutate of [c=>c.services.api.cap_add=['SYS_ADMIN'],c=>c.services.api.devices=['/dev/sda:/dev/sda'],
  c=>c.services.api.privileged=true,c=>c.services.api.pid='host',c=>c.services.api.ipc='host',c=>c.services.api.network_mode='host',
  c=>c.services.api.user='root',c=>c.services['sabora-egress'].user=RELEASE_USERS.api,c=>c.services.web.user=RELEASE_USERS.api,c=>c.services.api.entrypoint=['/bin/sh'],c=>c.services.web.ports.push({target:443,published:'443'}),
  c=>c.services.api.volumes[0].source='/etc/shadow',c=>c.services.api.volumes[0].read_only=false,c=>c.services.api.networks.foreign=null,
  c=>c.services.unexpected=c.services.api,c=>c.secrets={foreign:{file:'/etc/shadow'}},c=>c.services.api.environment.NODE_OPTIONS='--require /bad',
  c=>c.services.api.healthcheck.disable=true,c=>c.services.api.security_opt=[]]){
  const bad=structuredClone(resolved);mutate(bad);assert.throws(()=>validateClosedCompose(bad,a.manifest));
 }ok('real-compose-render-and-19-unsafe-mutations-denied');
 // A signed TAR containing an additional tag must be refused before load.
 docker(['image','load','--input',a.paths[0]]);const foreign='sabora-lab-foreign:forbidden';assert.notEqual(docker(['image','inspect',foreign],{allowFailure:true}).status,0);createdImages.push(foreign);
 docker(['image','tag',a.manifest.images.api.tag,foreign]);const badTar=work+'/foreign-tag.tar';docker(['image','save','--output',badTar,a.manifest.images.api.tag,foreign]);chmodSync(badTar,0o600);
 docker(['image','rm',a.manifest.images.api.tag,foreign]);
 const badManifest=structuredClone(a.manifest);badManifest.images.api.archiveSha256=hashFile(badTar);
 const badBundle={...a,paths:[badTar,...a.paths.slice(1)],manifestBytes:Buffer.from(JSON.stringify(badManifest)+'\n')};
 const badTarResult=await denied('signed-foreign-tag-tar-no-mutation',badBundle,approval(badBundle,'deploy','LAB-FOREIGN-TAR'));
 assert.match(badTarResult.stderr,/archive_(image_scope|multiple_images|foreign_repository|oci_index_ambiguous|oci_foreign_tag)/);
 const badCompose=work+'/foreign-mount.yml';put(badCompose,readFileSync(a.paths[3],'utf8')+'\nsecrets:\n  foreign:\n    file: /etc/shadow\n');
 const badComposeManifest=structuredClone(a.manifest);badComposeManifest.compose.web=hashFile(badCompose);
 const badComposeBundle={...a,paths:[...a.paths.slice(0,3),badCompose],manifestBytes:Buffer.from(JSON.stringify(badComposeManifest)+'\n')};
 const badComposeResult=await denied('signed-unapproved-compose-no-mutation',badComposeBundle,approval(badComposeBundle,'deploy','LAB-FOREIGN-COMPOSE'));
 assert.match(badComposeResult.stderr,/compose_source_not_installation_approved/);
 renameSync(P.installation,P.installation+'.held');await denied('installation-absent-no-mutation',a,approval(a,'deploy','LAB-NOT-PROVISIONED'));renameSync(P.installation+'.held',P.installation);
 await session('id; docker ps');ok('ssh-shell-command-denied');assert.notEqual(run('runuser',['-u',account,'--','sudo','-n','--',P.root+'/bin/root-entry','extra'],{allowFailure:true}).status,0);ok('sudo-arguments-denied');
 const forwarding=run('ssh',['-N','-o','ExitOnForwardFailure=yes','-R','127.0.0.1:22230:127.0.0.1:22229',...sshBase()],{allowFailure:true,timeout:10000});
 assert.notEqual(forwarding.status,0);assert.match(forwarding.stderr,/remote port forwarding failed/);ok('real-ssh-forwarding-denied');
 const pty=run('ssh',['-tt',...sshBase(),'id'],{input:'',allowFailure:true,timeout:10000});assert.notEqual(pty.status,0);assert.match(pty.stderr,/PTY allocation request failed/);ok('real-ssh-pty-denied');
 assert.notEqual(run('runuser',['-u',account,'--','docker','ps'],{allowFailure:true}).status,0);ok('ssh-user-has-no-docker-access');
 await denied('first-install-rollback-denied',a,approval(a,'rollback','LAB-FIRST-ROLLBACK'));
 const forged=approval(a,'deploy','LAB-FORGED-SIGNATURE');forged.signatureB64=Buffer.alloc(64).toString('base64');await denied('forged-signature-no-mutation',a,forged);
 await denied('expired-authority-no-mutation',a,approval(a,'deploy','LAB-EXPIRED-AUTHORITY',{ttl:-1000,offset:-60000}));
 const expiresDuringStage=approval(a,'deploy','LAB-EXPIRES-IN-STAGE',{ttl:1500});
 await denied('expiry-during-ingestion-no-mutation',a,expiresDuringStage,async stream=>{
  stream.write(JSON.stringify({protocol:'sabora-release-wire/v1',approvalB64:expiresDuringStage.approvalB64,signatureB64:expiresDuringStage.signatureB64,manifestB64:a.manifestBytes.toString('base64')})+'\n');
  await pause(2000);for(const path of a.paths){const n=Buffer.alloc(8);n.writeBigUInt64BE(BigInt(statSync(path).size));stream.write(n);for await(const bytes of createReadStream(path)){if(!stream.write(bytes))await once(stream,'drain');}}stream.end();
 });
 const pending=approval(a,'deploy','LAB-CONCURRENT-FIRST');let endPending;
 const first=session(pending.command,stream=>new Promise(resolve=>{endPending=()=>{stream.end();resolve();};}));
 for(let i=0;i<30&&!existsSync(P.state+'/controller.lock');i++)await pause(100);
 assert.ok(existsSync(P.state+'/controller.lock'));await denied('parallel-release-locked-no-mutation',a,approval(a,'deploy','LAB-CONCURRENT-SECOND'));endPending();await first;
 await denied('placeholder-dossier-no-mutation',a,approval(a,'deploy','LAB-PLACEHOLDER-EVIDENCE',{evidencePatch:docs=>{docs.externalRestoreSha256=Buffer.from('{"status":"verified"}');}}));
 const envBytes=readFileSync(P.runtimeEnv);put(P.runtimeEnv,'DOCKER_HOST=tcp://invalid:2375\n');await denied('runtime-env-tamper-no-mutation',a,approval(a,'deploy','LAB-ENV-TAMPER'));put(P.runtimeEnv,envBytes);
 renameSync(P.publicKey,P.publicKey+'.held');symlinkSync(P.publicKey+'.held',P.publicKey);await denied('owner-key-symlink-no-mutation',a,approval(a,'deploy','LAB-SYMLINK-KEY'));unlinkSync(P.publicKey);renameSync(P.publicKey+'.held',P.publicKey);
 linkSync(P.publicKey,P.publicKey+'.hard');await denied('owner-key-hardlink-no-mutation',a,approval(a,'deploy','LAB-HARDLINK-KEY'));unlinkSync(P.publicKey+'.hard');
 // Each negative must stop in the runtime custody verifier, before any
 // Docker mutation or authorization consumption, not just fail generally.
 async function custodyDenied(label,id,expected){
  const result=await denied(label,a,approval(a,'deploy',id));
  assert.match(result.stderr,expected);assert.equal(existsSync(P.ledger+'/'+id+'.json'),false);
 }
 chmodSync(fixtureSecret,0o600);
 try{await custodyDenied('runtime-secret-unreadable-denied','LAB-SECRET-UNREADABLE',/runtime_permissions_mismatch/);}finally{chmodSync(fixtureSecret,0o640);}
 chmodSync(fixtureSecret,0o644);
 try{await custodyDenied('runtime-secret-world-readable-denied','LAB-SECRET-WORLD-READ',/runtime_permissions_mismatch/);}finally{chmodSync(fixtureSecret,0o640);}
 chownSync(fixtureSecret,0,10003);
 try{await custodyDenied('runtime-secret-wrong-group-denied','LAB-SECRET-WRONG-GROUP',/runtime_permissions_mismatch/);}finally{chownSync(fixtureSecret,0,10002);}
 run('setfacl',['-m','u:10003:r--',fixtureSecret]);
 try{await custodyDenied('runtime-secret-extra-acl-denied','LAB-SECRET-EXTRA-ACL',/runtime_acl_not_exclusive/);}finally{run('setfacl',['-b',fixtureSecret]);chmodSync(fixtureSecret,0o640);}
 chmodSync('/etc/sabora/runtime',0o755);
 try{await custodyDenied('runtime-parent-not-private-denied','LAB-RUNTIME-PARENT',/runtime_permissions_mismatch/);}finally{chmodSync('/etc/sabora/runtime',0o700);}
 // Even a valid owner re-signature is insufficient when custodians are
 // aliased or the expected subject no longer describes approved config.
 const originalAlertKey=configuration.alertKey,originalRuntimeHash=configuration.runtimeEnvSha256;
 configuration.alertKey=authorities.reviewEvidenceSha256.pem;signedInstall();
 try{await custodyDenied('authority-key-reuse-denied','LAB-AUTHORITY-REUSE',/custodian_independence_unproven/);}finally{configuration.alertKey=originalAlertKey;signedInstall();}
 configuration.runtimeEnvSha256=labHash('different-runtime');signedInstall();
 try{await custodyDenied('installation-subject-drift-denied','LAB-SUBJECT-DRIFT',/configuration_subject_invalid/);}finally{configuration.runtimeEnvSha256=originalRuntimeHash;signedInstall();}
 const deployA=approval(a,'deploy','LAB-DEPLOY-A-0001');await success('deploy-A-through-real-ssh',a,deployA);await denied('replay-A-no-mutation',a,deployA);
 await success('deploy-B-through-real-ssh',b,approval(b,'deploy','LAB-DEPLOY-B-0001'));
 const history=parse(P.ledger+'/history.json');assert.equal(history.versions.length,2);assert.ok(history.versions.every(v=>v.status==='healthy'));ok('two-healthy-retained-versions');
 const originalHistory=readFileSync(P.ledger+'/history.json'),unhealthy=structuredClone(history);unhealthy.versions.find(v=>v.releaseSha===a.sha).status='unhealthy';put(P.ledger+'/history.json',JSON.stringify(unhealthy)+'\n');
 await denied('unhealthy-rollback-target-denied',a,approval(a,'rollback','LAB-UNHEALTHY-TARGET'));put(P.ledger+'/history.json',originalHistory);
 docker(['network','disconnect',NETWORK_NAMES.ingress,'sabora-web-1']);await denied('disconnected-active-network-denied',a,approval(a,'rollback','LAB-DISCONNECTED-NET'));docker(['network','connect',NETWORK_NAMES.ingress,'sabora-web-1']);
 const rollbackA=approval(a,'rollback','LAB-ROLLBACK-A-0001');await success('rollback-A-through-real-ssh',a,rollbackA);await denied('rollback-replay-no-mutation',a,rollbackA);assert.equal(parse(P.ledger+'/history.json').versions.length,2);
 run('nft',['add','rule','inet','sabora_egress_guard','sabora_egress_forward','counter']);await denied('live-nft-tamper-no-mutation',b,approval(b,'deploy','LAB-NFT-TAMPER'));run('nft',['delete','table','inet','sabora_egress_guard']);run('nft',['--check','--file',labEgressPolicy]);run('nft',['--file',labEgressPolicy]);
 put(P.state+'/controller.lock','{"crashFixture":true}\n');await denied('crashed-lock-no-mutation',b,approval(b,'deploy','LAB-CRASH-LOCK'));unlinkSync(P.state+'/controller.lock');
 const journal=readFileSync(P.ledger+'/transaction.json');put(P.ledger+'/transaction.json',JSON.stringify({...JSON.parse(journal),state:'unknown'})+'\n');await denied('unknown-ledger-no-mutation',b,approval(b,'deploy','LAB-UNKNOWN-LEDGER'));put(P.ledger+'/transaction.json',journal);
 // Intentional failure AFTER real mutation. No healthy commit and no automatic
 // recovery: the next signed request must stop on the durable unknown state.
 docker(['stop',sinkName]);const failedRollback=approval(b,'rollback','LAB-ALERT-FAILURE');
 await session(failedRollback.command,feed(b,failedRollback));assert.equal(parse(P.ledger+'/transaction.json').state,'unknown');
 assert.equal(parse(P.ledger+'/history.json').activeReleaseSha,a.sha);sentinel();ok('real-alert-failure-after-consumption-remains-unknown');
 await denied('unknown-after-real-failure-blocks-next-operation',a,approval(a,'rollback','LAB-AFTER-REAL-FAILURE'));
 put(output+'/receipt.json',JSON.stringify({schema:'sabora-controller-disposable-lab/v1',sourceSha,runId,checks,releases:{a:a.sha,b:b.sha,lastHealthy:a.sha},finalRuntimeState:'unknown-after-intentional-alert-failure',history:parse(P.ledger+'/history.json'),sentinelUnchanged:true,externalAuthorities:'synthetic-lab-only; never operational evidence',operationalAcceptance:false,sqlExecuted:false},null,2)+'\n',0o644);chmodSync(output,0o755);ok('integrated-sequence-complete');
}finally{
 if(sshd&&sshd.exitCode===null){const closed=once(sshd,'close');sshd.kill('SIGTERM');await closed;}
 if(namesVerifiedEmpty)for(const service of SABORA_RELEASE_SCOPE.services){const name='sabora-'+service+'-1',found=docker(['container','inspect','--format','{{index .Config.Labels "io.sabora.managed-by"}}',name],{allowFailure:true});if(found.status===0&&found.stdout.trim()==='release-controller-v1')docker(['rm','-f',name],{allowFailure:true});}
 for(const name of createdContainers.reverse())docker(['rm','-f',name],{allowFailure:true});for(const name of createdNetworks.reverse())docker(['network','rm',name],{allowFailure:true});for(const tag of createdImages)docker(['image','rm',tag],{allowFailure:true});
 if(nftOwned)for(const table of ['sabora_ingress_guard','sabora_egress_guard'])run('nft',['delete','table','inet',table],{allowFailure:true});if(addressAdded)run('ip',['address','del','146.59.145.64/32','dev','lo'],{allowFailure:true});if(hostsBefore)writeFileSync('/etc/hosts',hostsBefore);
 if(userCreated){run('userdel',[account],{allowFailure:true});rmSync(sudoRule,{force:true});}for(const root of createdRoots.reverse())rmSync(root,{recursive:true,force:true});
}
