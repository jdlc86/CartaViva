// Explicit, CI-only launch boundary for the *complete* M3/H3-H6 candidate.
// The live server.mjs remains health-only. This bootstrap never provisions
// roles, reads operational secrets, deploys, or contacts an external database.
// All 17 distinct application SQL identities must pass the existing M2/M3 live preflights.
import {validateM2RuntimeSqlIdentities} from '../../apps/api/src/m2-runtime-identity-inventory.mjs';
import {createSaboraObservability} from '../../apps/api/src/operational-observability.mjs';
import {startOperationalM3Runtime} from '../../apps/api/src/operational-runtime.mjs';
import {isDisposablePgModulePath} from './disposable-pg-module-path.mjs';

const invalid=()=>Error('disposable_m3_bootstrap_required');

function isolatedEnvironment(environment){
 if(!environment||environment.GITHUB_ACTIONS!=='true'||
    environment.NODE_ENV==='production'||
    typeof environment.RUNNER_TEMP!=='string'||!environment.RUNNER_TEMP||
    !isDisposablePgModulePath(environment.SABORA_CI_PG_MODULE))return false;
 try{
  const target=new URL(environment.SABORA_CI_PG_URL);
  return target.protocol==='postgresql:'&&target.hostname==='127.0.0.1'&&
   target.username==='postgres'&&target.password==='sabora_ci_ephemeral_only'&&
   target.pathname==='/postgres'&&/^[0-9]{1,5}$/.test(target.port)&&
   Number(target.port)>0&&target.search===''&&target.hash==='';
 }catch{return false;}
}

export async function startDisposableM3Runtime({options,environment=process.env}={}){
 // The environment check runs BEFORE calling any injected pool or factory.
 if(!isolatedEnvironment(environment)||!options||typeof options!=='object'||
    options.customer?.allowedOrigin!=='https://sabora.example'||
    options.management?.qr?.origin!=='https://sabora.example'||
    options.management?.qr?.restaurantCode!=='SABORA_CI'||
    options.h6?.stripe?.testOnlyDisabled!==true||
    !Object.isFrozen(options.h6.stripe)||
    options.h6.webhook!==undefined)
  throw invalid();

 let candidate;
 try{
  // An injected marker is not a payment sandbox. Replace the adapter
  // unconditionally with an inert, fail-closed provider: no authorization,
  // capture, refund, release or retrieval can contact Stripe during this
  // disposable acceptance. The real provider is NEVER invoked or retained.
  const paymentDisabled=()=>{throw Error('disposable_h6_payment_provider_disabled');};
  const noProvider=Object.freeze({authorize:paymentDisabled,capture:paymentDisabled,
   release:paymentDisabled,refund:paymentDisabled,retrieve:paymentDisabled});
  const diagnosticEvents=[];
  const diagnostics=createSaboraObservability({emit:record=>diagnosticEvents.push(record)});
  // Exercise a real PG17-backed readiness transition when the *trusted*
  // JWKS provider becomes unavailable. No external Auth or operational URL.
  let jwksAvailable=true;
  const originalGetTrustedKeys=options.staff?.getTrustedKeys;
  if(typeof originalGetTrustedKeys!=='function')throw invalid();
  const staff={...options.staff,getTrustedKeys:(...args)=>{
   if(!jwksAvailable)throw Error('disposable_jwks_temporarily_unavailable');
   return originalGetTrustedKeys.apply(options.staff,args);
  }};
  const isolatedOptions={...options,staff,observability:diagnostics,
   h6:{...options.h6,stripe:noProvider},
   enableDeferredDispatch:false,requireTrustedKeysOnReadiness:true};
  // Internal factory checks 17 unique, least-privileged application SQL logins and
  // all exact SQL capability grants before it registers an HTTP route.
  // Exercise the *same* identity inventory as the HTTP assembly in the
  // disposable PG17 end-to-end acceptance. No login names are emitted.
  const inventory=validateM2RuntimeSqlIdentities(isolatedOptions);
  const expected=17+(isolatedOptions.management?.ownership?1:0)+
   (isolatedOptions.management?.communications?2:0)+
   (isolatedOptions.waiterCalls?2:0);
  if(inventory.capabilityCount!==expected||inventory.notifierCount!==2)
   throw invalid();
  candidate=await startOperationalM3Runtime({options:isolatedOptions,
   listener:{host:'127.0.0.1',port:0},observability:diagnostics});
  if(candidate.mode!=='operational-h3-h6-m3-candidate')throw invalid();
  // The lab entrypoint permits only loopback. Port 0 eliminates fixed host binds.
  const origin=candidate.origin;
  if(!/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(origin))throw invalid();
  const probe=async path=>fetch(origin+path,{
   method:'GET',cache:'no-store',signal:AbortSignal.timeout(30000)
  });
  const health=await probe('/health');
  const ready=await probe('/ready');
  const catalog=await probe('/api/v1/catalog');
  const denied=await probe('/api/v1/operations/table-change/pending');
  if(health.status!==200||ready.status!==200||catalog.status!==200||
     ![401,403].includes(denied.status))throw invalid();
  const [healthJson,readyJson,catalogJson]=await Promise.all([
   health.json(),ready.json(),catalog.json()
  ]);
  if(healthJson.mode!=='opt-in'||readyJson.mode!=='opt-in'||
     healthJson.service!=='sabora-m3-candidate'||
     readyJson.service!=='sabora-m3-candidate'||
     !Array.isArray(catalogJson))throw invalid();
  jwksAvailable=false;
  const unavailable=await probe('/ready');
  const alive=await probe('/health');
  jwksAvailable=true;
  const restored=await probe('/ready');
  if(unavailable.status!==503||alive.status!==200||restored.status!==200)
   throw invalid();
  // E2E on the real SQL-backed candidate must emit sanitized, low-cardinality
  // HTTP telemetry without ever logging request headers, cookies or raw URLs.
  const summary=diagnostics.snapshot();
  const httpFields=new Set(['schema','source','service','level','event','at',
   'requestId','route','method','statusClass','durationMs']);
  const operationFields=new Set(['schema','source','service','level','event','at',
   'component','operation','outcome','durationMs']);
  const lifecycleFields=new Set(['schema','source','service','level','event','at','code']);
  const dependencyFields=new Set(['schema','source','service','level','event','at','component','code']);
  const safeHttp=diagnosticEvents.filter(v=>v.event==='http_request');
  const safeOps=diagnosticEvents.filter(v=>v.event==='operation');
  const failedOps=safeOps.filter(v=>v.outcome==='failure');
  const failures=diagnosticEvents.filter(v=>v.event==='dependency_failed');
  if(summary.requests<7||summary.byRoute['/health']<2||
     summary.byRoute['/ready']<3||summary.byRoute.other<2||
     !safeHttp.some(v=>v.statusClass==='4xx')||
     !safeHttp.some(v=>v.statusClass==='5xx'&&v.route==='/ready')||
     !safeOps.some(v=>v.component==='database'&&v.operation==='check'&&
       v.outcome==='success')||
     failedOps.length!==1||failedOps[0].component!=='database'||
     failedOps[0].operation!=='check'||
     failures.length!==1||failures[0].component!=='staff'||
     failures[0].code!=='dependency_unavailable'||
     diagnosticEvents.some(v=>v.event==='http_request'?
       ((v.route!=='/health'&&v.route!=='/ready'&&v.route!=='other')||
        Object.keys(v).some(key=>!httpFields.has(key))):v.event==='operation'?
       (v.component!=='database'||v.operation!=='check'||
        !['success','failure'].includes(v.outcome)||
        Object.keys(v).some(key=>!operationFields.has(key))):
       v.event==='dependency_failed'?
       (v.component!=='staff'||v.code!=='dependency_unavailable'||
        Object.keys(v).some(key=>!dependencyFields.has(key))):
       (v.event!=='lifecycle'||v.code!=='started_operational_candidate'||
        Object.keys(v).some(key=>!lifecycleFields.has(key)))))
     throw invalid();
  return Object.freeze({
   app:candidate.app,mode:candidate.mode,origin,
   close:()=>candidate.close()
  });
 }catch(error){
  if(candidate)try{await candidate.close();}catch{}
  // Never serialize SQL credentials, HMAC material or provider internals.
  if(error?.message==='disposable_m3_bootstrap_required')throw error;
  throw Error('disposable_m3_bootstrap_failed');
 }
}
