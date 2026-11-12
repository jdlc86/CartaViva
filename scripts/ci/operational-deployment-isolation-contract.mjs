import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const OPERATIONAL_COMPOSE='deploy/compose.sabora-operational.yml';

export function inspectOperationalDeploymentIsolation(rootPath,{composeText}={}){
 const root=resolve(rootPath);
 const compose=composeText??readFileSync(resolve(root,OPERATIONAL_COMPOSE),'utf8');
 const violations=[];
 const require=(pattern,code)=>{if(!pattern.test(compose))violations.push(code);};
 const forbid=(pattern,code)=>{if(pattern.test(compose))violations.push(code);};
 require(/^name:\s*sabora-operational-candidate\s*$/m,'operational_project_name_invalid');
 require(/^\s{2}api:\s*$/m,'operational_api_missing');
 require(/^\s{2}sabora-egress:\s*$/m,'operational_egress_gateway_missing');
 require(/command:\s*\["node",\s*"src\/operational-server\.mjs"\]/,
  'operational_entrypoint_missing');
 require(/command:\s*\["node",\s*"src\/sabora-egress-gateway\.mjs"\]/,
  'egress_entrypoint_missing');
 require(/ports:\s*\['127\.0\.0\.1:4100:4100'\]/,'operational_port_not_loopback');
 require(/api:[\s\S]*?networks:\s*\[sabora_runtime_internal\]/,
  'api_has_unrestricted_network');
 require(/sabora-egress:[\s\S]*?networks:\s*\[sabora_runtime_internal, sabora_egress_outbound\]/,
  'egress_network_bridge_missing');
 require(/sabora_runtime_internal:[\s\S]*?driver:\s*bridge[\s\S]*?internal:\s*true/,
  'runtime_network_not_internal');
 require(/SABORA_OPERATIONAL_MANIFEST_FILE:\s*\/run\/sabora\/activation\.json/,
  'manifest_file_injection_missing');
 require(/SABORA_OPERATIONAL_SECRETS_DIR:\s*\/run\/secrets\/sabora/,
  'secret_directory_injection_missing');
 require(/SABORA_EGRESS_POLICY_FILE:\s*\/run\/sabora\/egress-policy\.json/,
  'egress_policy_injection_missing');
 const serviceSection=name=>compose.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z][a-z0-9-]*:\\n|^networks:)`,'m'))?.[0]??'';
 const apiSection=serviceSection('api'),egressSection=serviceSection('sabora-egress');
 const serviceSections=[apiSection,egressSection];
 for(const section of serviceSections){
  for(const [pattern,code] of [
   [/restart:\s*["']?no["']?/,'automatic_restart_enabled'],
   [/read_only:\s*true/,'filesystem_not_read_only'],
   [/security_opt:\s*\[no-new-privileges:true\]/,'new_privileges_not_blocked'],
   [/cap_drop:\s*\[ALL\]/,'capabilities_not_dropped'],
   [/mem_limit:\s*\d+m/,'memory_limit_missing'],
   [/cpus:\s*\d+(?:\.\d+)?/,'cpu_limit_missing'],
   [/pids_limit:\s*\d+/,'pid_limit_missing'],
   [/max-size:\s*["']10m["']/,'log_rotation_missing'],
  ])if(!pattern.test(section))violations.push(`${code}:${section.startsWith('  api:')?'api':'egress'}`);
 }
 forbid(/external:\s*true|network_mode:\s*host|privileged:\s*true|container_name:|env_file:|\/(?:var\/run\/docker\.sock)|fleetia/i,
  'shared_or_foreign_resource');
 forbid(/SABORA_[A-Z0-9_]*(?:PASSWORD|TOKEN|PRIVATE_KEY|CA_PEM|HMAC):/,
  'secret_value_in_compose_environment');
 if(/\bports:/.test(egressSection))violations.push('egress_exposes_host_port');
 if(/sabora_egress_outbound/.test(apiSection))violations.push('api_attached_to_outbound_network');
 return Object.freeze([...new Set(violations)]);
}

const self=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(self){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..','..');
 const violations=inspectOperationalDeploymentIsolation(root);
 if(violations.length){
  process.stderr.write(`operational_deployment_isolation_gate_failed:${violations.join(',')}\n`);
  process.exitCode=1;
 }else process.stdout.write('operational_deployment_isolation_gate_ok\n');
}
