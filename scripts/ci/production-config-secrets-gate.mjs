import {existsSync,readdirSync,readFileSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join,relative,resolve} from 'node:path';

const SENSITIVE_NAME = /SABORA_[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|PRIVATE|KEY|CA_PEM)/;
const CREDENTIAL = /(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]{16,}|whsec_[A-Za-z0-9_]{16,}|postgres(?:ql)?:\/\/[^\s:/]+:[^\s@]+@/i;
const GLOBAL_CONTROL = /docker\s+(?:system|volume|network|builder)\s+prune|docker\s+compose\s+(?:down|up|restart|kill|rm)\b|docker\s+(?:stop|restart|rm)\s+(?:--force\s+)?(?:\$?\([^)]*docker|\$?\{?all|\*)/i;

const text = path => readFileSync(path,'utf8');
const filesBelow = path => {
  if(!existsSync(path))return [];
  const output=[];
  for(const name of readdirSync(path)){
    const child=join(path,name);
    if(statSync(child).isDirectory())output.push(...filesBelow(child));
    else output.push(child);
  }
  return output;
};

export function inspectProductionConfig(rootPath){
  const root=resolve(rootPath);const violations=[];
  const compose=text(join(root,'deploy','compose.sabora.yml'));
  const workflow=text(join(root,'.github','workflows','ci.yml'));
  const example=text(join(root,'.env.example'));
  const server=text(join(root,'apps','api','src','server.mjs'));

  const requireMatch=(value,pattern,code)=>{if(!pattern.test(value))violations.push(code);};
  const forbidMatch=(value,pattern,code)=>{if(pattern.test(value))violations.push(code);};

  requireMatch(compose,/^name:\s*sabora\s*$/m,'compose_project_not_isolated');
  requireMatch(compose,/127\.0\.0\.1:4100:4100/,'compose_port_not_loopback');
  requireMatch(compose,/sabora_private:[\s\S]*driver:\s*bridge[\s\S]*internal:\s*true/,'compose_network_not_internal');
  requireMatch(compose,/restart:\s*["']?no["']?/,'compose_restart_not_manual');
  requireMatch(compose,/read_only:\s*true/,'compose_root_not_read_only');
  requireMatch(compose,/cap_drop:\s*\[ALL\]/,'compose_capabilities_not_dropped');
  forbidMatch(compose,/external:\s*true|network_mode:\s*host|privileged:\s*true|container_name:|\/var\/run\/docker\.sock/i,'compose_shared_or_privileged');
  forbidMatch(compose,/fleetia/i,'compose_foreign_reference');
  forbidMatch(compose,/SABORA_[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|PRIVATE_KEY|CA_PEM)/,'compose_secret_reference');
  forbidMatch(workflow,/\$\{\{\s*secrets\.|workflow_dispatch|docker\s+login|\bssh\b/i,'ci_requests_operational_secret');

  for(const path of [join(root,'scripts'),join(root,'.github','workflows'),join(root,'deploy')]){
    for(const file of filesBelow(path)){
      const value=text(file);
      if(GLOBAL_CONTROL.test(value))violations.push(`global_control:${relative(root,file)}`);
    }
  }

  for(const path of [join(root,'apps','client','src'),join(root,'apps','management','src'),
    join(root,'apps','client','dist'),join(root,'apps','management','dist')]){
    for(const file of filesBelow(path)){
      const value=text(file);
      if(SENSITIVE_NAME.test(value)||CREDENTIAL.test(value))
        violations.push(`frontend_secret:${relative(root,file)}`);
    }
  }

  requireMatch(example,/SABORA_API_MODE=health-only/,'example_missing_runtime_mode');
  requireMatch(example,/__INJECT_SECRET_AT_RUNTIME__/,'example_missing_injection_marker');
  forbidMatch(example,CREDENTIAL,'example_contains_credential');
  forbidMatch(server,/h6-candidate-composition|h4-h6-integrated-candidate|staff-lifecycle-composition|customer-production-composition/,'server_mounts_dormant_candidate');
  return Object.freeze([...new Set(violations)]);
}

const self=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(self){
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..','..');
  const violations=inspectProductionConfig(root);
  if(violations.length){
    process.stderr.write(`production_config_gate_failed:${violations.join(',')}\n`);
    process.exitCode=1;
  }else process.stdout.write('production_config_gate_ok\n');
}
