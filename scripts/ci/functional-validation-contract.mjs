import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {dirname, extname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const evidence=(kind,path,...markers)=>Object.freeze({kind,path,markers:Object.freeze(markers)});
const capability=(id,requiredKinds,...entries)=>Object.freeze({
  id,requiredKinds:Object.freeze(requiredKinds),evidence:Object.freeze(entries),
});

export const FUNCTIONAL_VALIDATION_MATRIX=Object.freeze([
 capability('qr',['node','browser-client','postgres17'],
  evidence('node','tests/table-qr-contract.test.mjs','QR V1 has one canonical URL','rejects non-canonical spellings'),
  evidence('browser-client','apps/client/e2e/client-premium.spec.ts','revoked QR or visit fails closed','QR V1 deep link is scrubbed'),
  evidence('postgres17','scripts/ci/catalog-postgres17-driver-integration.test.mjs','PG17 QR rotation waits for active authorization')),
 capability('visit',['browser-client','postgres17'],
  evidence('browser-client','apps/client/e2e/client-premium.spec.ts','Mesa verificada','ya no están autorizados'),
  evidence('postgres17','scripts/ci/customer-production-postgres17.test.mjs','flow.authorizeVisit','createCustomerSessionRevoker')),
 capability('catalog',['browser-client','postgres17'],
  evidence('browser-client','apps/client/e2e/client-premium.spec.ts','premium client flow keeps dynamic catalog','sold-out products remain visible'),
  evidence('postgres17','scripts/ci/catalog-postgres17-driver-integration.test.mjs','PG17 catalog writer transaction persists first/grouped/late kitchen projections')),
 capability('order',['node','browser-client','postgres17'],
  evidence('node','tests/customer-confirmation-flow.test.mjs','network ambiguity does not reopen consent or fabricate order success'),
  evidence('browser-client','apps/client/e2e/client-premium.spec.ts','ambiguous order failure stays unconfirmed','H6 customer completes QR'),
  evidence('postgres17','scripts/ci/customer-production-postgres17.test.mjs','const concurrent=await Promise.all([flow.confirm(request),flow.confirm(request)])')),
 capability('grouping',['browser-client','postgres17'],
  evidence('browser-client','apps/client/e2e/client-premium.spec.ts',"grouping:'first'","roundState:'grouping'"),
  evidence('postgres17','scripts/ci/catalog-postgres17-driver-integration.test.mjs','first/grouped/late kitchen projections','grouping_window_seconds')),
 capability('kitchen',['node','browser-management','postgres17'],
  evidence('node','tests/order-operations-http-lifecycle-acceptance.test.mjs','kitchen'),
  evidence('browser-management','scripts/ci/management-authenticated-browser-smoke.mjs','Iniciar preparación','Marcar lista'),
  evidence('postgres17','scripts/ci/h6-postgres17.test.mjs','kitchen_dispatch_not_acknowledged','acknowledgeDispatch')),
 capability('waiter',['node','browser-management','postgres17'],
  evidence('node','apps/management/tests/order-operations-behavior.test.mjs','Voy a recoger','Cancelo'),
  evidence('browser-management','scripts/ci/management-authenticated-browser-smoke.mjs','Voy a recoger','Cancelo','pickupVersion,3'),
  evidence('postgres17','scripts/ci/h6-postgres17.test.mjs','h6_pickup_claim_waiter_001','h6_pickup_cancel_waiter_001')),
 capability('notifications',['node','browser-client','postgres17'],
  evidence('node','apps/management/tests/order-operations-behavior.test.mjs','gateway streams durable events without polling','Last-Event-ID'),
  evidence('browser-client','apps/client/e2e/client-premium.spec.ts','durable SSE tracking','text/event-stream'),
  evidence('postgres17','scripts/ci/h6-postgres17.test.mjs','Real loopback HTTP SSE','event: sabora.pickup.claimed')),
 capability('error_states',['node','browser-client','browser-management'],
  evidence('node','apps/management/tests/order-operations-behavior.test.mjs','fails closed on private, non-json or contradictory responses'),
  evidence('browser-client','apps/client/e2e/client-premium.spec.ts','No se confirmó el pedido','customer_flow_unavailable'),
  evidence('browser-management','scripts/ci/management-authenticated-browser-smoke.mjs','Estado no disponible','failNextBoard')),
 capability('offline',['node','browser-client'],
  evidence('node','tests/customer-confirmation-flow.test.mjs','network ambiguity does not reopen consent or fabricate order success'),
  evidence('browser-client','apps/client/e2e/client-premium.spec.ts','shell remains available offline without caching API data','context.setOffline(true)')),
 capability('revocations',['node','browser-client','postgres17'],
  evidence('node','apps/management/tests/order-operations-authenticated-gateway.test.mjs','revocation during token acquisition','revocation aborts active management HTTP requests'),
  evidence('browser-client','apps/client/e2e/client-premium.spec.ts','revoked QR or visit fails closed'),
  evidence('postgres17','scripts/ci/h6-postgres17.test.mjs','staff_revoked_in_postgres','event: access-revoked')),
]);

const sourceExtensions=new Set(['.js','.mjs','.ts','.tsx']);
function filesBelow(path){
 if(!existsSync(path))return[];
 const result=[];
 for(const name of readdirSync(path)){
  const child=join(path,name);
  if(statSync(child).isDirectory())result.push(...filesBelow(child));
  else if(sourceExtensions.has(extname(name)))result.push(child);
 }
 return result;
}

export function inspectFunctionalValidation(rootPath,{matrix=FUNCTIONAL_VALIDATION_MATRIX,overrides={}}={}){
 const root=resolve(rootPath),violations=[];
 const read=relative=>Object.hasOwn(overrides,relative)?overrides[relative]:
  readFileSync(join(root,...relative.split('/')),'utf8');
 const requiredIds=['qr','visit','catalog','order','grouping','kitchen','waiter','notifications',
  'error_states','offline','revocations'];
 const ids=matrix.map(item=>item.id);
 if(JSON.stringify(ids)!==JSON.stringify(requiredIds))violations.push('functional_capability_set_changed');
 for(const item of matrix){
  const kinds=new Set(item.evidence.map(entry=>entry.kind));
  for(const kind of item.requiredKinds)if(!kinds.has(kind))
   violations.push(`functional_layer_missing:${item.id}:${kind}`);
  for(const entry of item.evidence){
   const absolute=join(root,...entry.path.split('/'));
   if(!existsSync(absolute)&&!Object.hasOwn(overrides,entry.path)){
    violations.push(`functional_evidence_missing:${item.id}:${entry.path}`);continue;
   }
   const text=read(entry.path);
   for(const marker of entry.markers)if(!text.includes(marker))
    violations.push(`functional_marker_missing:${item.id}:${entry.path}:${marker}`);
  }
 }
 const clientSources=filesBelow(join(root,'apps','client','src')).map(path=>readFileSync(path,'utf8')).join('\n');
 const managementSources=filesBelow(join(root,'apps','management','src')).map(path=>readFileSync(path,'utf8')).join('\n');
 if(/setInterval\s*\(/.test(`${clientSources}\n${managementSources}`))
  violations.push('periodic_business_polling_detected');
 if(/\/api\/v1\/(?:operations|admin|staff)(?:\/|['"`])/.test(clientSources))
  violations.push('client_privileged_route_detected');
 const workflows={
  ci:read('.github/workflows/ci.yml'),
  client:read('.github/workflows/client-browser-conformance.yml'),
  management:read('.github/workflows/management-browser-visual-smoke.yml'),
 };
 for(const marker of ['pnpm test','catalog-postgres17-node-driver-smoke.sh','functional-validation-contract.mjs'])
  if(!workflows.ci.includes(marker))violations.push(`functional_ci_marker_missing:${marker}`);
 if(!workflows.client.includes('pnpm --filter @sabora/client test:e2e'))
  violations.push('client_browser_workflow_missing');
 if(!workflows.management.includes('management-authenticated-browser-smoke.mjs'))
  violations.push('management_browser_workflow_missing');
 return Object.freeze([...new Set(violations)]);
}

const self=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(self){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..','..');
 const violations=inspectFunctionalValidation(root);
 if(violations.length){
  process.stderr.write(`functional_validation_gate_failed:${violations.join(',')}\n`);
  process.exitCode=1;
 }else process.stdout.write(`functional_validation_gate_ok:${FUNCTIONAL_VALIDATION_MATRIX.length}_capabilities\n`);
}
