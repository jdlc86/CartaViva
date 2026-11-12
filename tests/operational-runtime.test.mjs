import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {
 installOperationalSignalHandlers,
 startOperationalM3Runtime,
} from '../apps/api/src/operational-runtime.mjs';

const jwk={kty:'RSA',alg:'RS256',use:'sig',kid:'test',n:'abc',e:'AQAB'};

function fixture({ready=200,listenFailure=false}={}){
 const calls=[];
 const app={
  async listen(value){calls.push(['listen',value]);if(listenFailure)throw Error('private');return 'http://127.0.0.1:43123';},
  async inject(){calls.push(['ready']);return {statusCode:ready};},
 };
 const candidate={mode:'opt-in-h3-h6-m3-candidate',app,async close(){calls.push(['candidate_close']);}};
 const resources={async close(){calls.push(['resource_close']);}};
 const options={staff:{async getTrustedKeys(){calls.push(['jwks']);return [jwk];}}};
 return {calls,candidate,resources,options};
}

test('operational runtime verifies JWKS and readiness before exposing a successful candidate',async()=>{
 const value=fixture();const lifecycle=[];
 const runtime=await startOperationalM3Runtime({options:value.options,
  listener:{host:'127.0.0.1',port:0},resources:value.resources,
  createCandidate:async()=>value.candidate,observability:{lifecycle:event=>lifecycle.push(event)}});
 assert.equal(runtime.mode,'operational-h3-h6-m3-candidate');
 assert.deepEqual(value.calls.slice(0,3),[['jwks'],['listen',{host:'127.0.0.1',port:0}],['ready']]);
 assert.deepEqual(lifecycle,['started_operational_candidate']);
 await runtime.close();await runtime.close();
 assert.deepEqual(value.calls.slice(-2),[['candidate_close'],['resource_close']]);
 assert.deepEqual(lifecycle,['started_operational_candidate','stopped_operational_candidate']);
});

test('JWKS, listener and readiness failures close every acquired dependency and stay generic',async()=>{
 for(const scenario of ['jwks','listen','ready']){
  const value=fixture({listenFailure:scenario==='listen',ready:scenario==='ready'?503:200});
  if(scenario==='jwks')value.options.staff.getTrustedKeys=async()=>[];
  await assert.rejects(startOperationalM3Runtime({options:value.options,
   listener:{host:'127.0.0.1',port:0},resources:value.resources,
   createCandidate:async()=>value.candidate}),/operational_runtime_startup_failed/);
  assert.equal(value.calls.filter(call=>call[0]==='resource_close').length,1);
  if(scenario!=='jwks')assert.equal(value.calls.filter(call=>call[0]==='candidate_close').length,1);
 }
});

test('signal handlers close once and can be removed without process termination',async()=>{
 const processRef=new EventEmitter();processRef.exitCode=undefined;
 let closes=0;let release;
 const runtime={close:()=>{closes++;return new Promise(resolve=>{release=resolve;});}};
 const handlers=installOperationalSignalHandlers(runtime,{processRef});
 processRef.emit('SIGTERM');processRef.emit('SIGINT');
 assert.equal(closes,1);release();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(processRef.exitCode,0);handlers.remove();
});
