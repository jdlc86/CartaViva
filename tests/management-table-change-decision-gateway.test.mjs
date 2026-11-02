import test from 'node:test';
import assert from 'node:assert/strict';
import {createTableChangeDecisionGateway,TableChangeDecisionGatewayError}
 from '../apps/management/src/table-change-decision-gateway.js';
const id='10000000-0000-4000-8000-000000000001';
const json=(status,body)=>new Response(JSON.stringify(body),{
 status,headers:{'content-type':'application/json'}});
test('staff PWA sends only request and decision through caller-owned authenticated adapter',async()=>{
 const calls=[];
 const gateway=createTableChangeDecisionGateway({send:async(path,options)=>{
  calls.push({path,options});
  return json(200,{requestId:id,status:'approved'});
 }});
 assert.deepEqual(await gateway.decide({requestId:id,decision:'approved'}),
  {requestId:id,status:'approved'});
 assert.equal(calls.length,1);
 assert.equal(calls[0].path,'/api/v1/operations/table-change/decisions');
 assert.deepEqual(JSON.parse(calls[0].options.body),{requestId:id,decision:'approved'});
 assert.equal(calls[0].options.credentials,'omit');
 assert.equal(calls[0].options.cache,'no-store');
 assert.equal(calls[0].options.headers.Authorization,undefined);
});
test('staff PWA refuses forged destination, reason and malformed decisions before network',async()=>{
 let calls=0;
 const gateway=createTableChangeDecisionGateway({send:async()=>{calls++;return json(200,{requestId:id,status:'approved'});}});
 for(const value of [{requestId:'forged',decision:'approved'},
  {requestId:id,decision:'pending'},{}]){
  await assert.rejects(gateway.decide(value),/invalid_table_change_decision/);
 }
 assert.equal(calls,0);
});
test('staff PWA propagates denied and expired requests without leaking internal errors',async()=>{
 for(const [status,code] of [[403,'forbidden'],[409,'table_change_request_not_pending'],
  [503,'internal_sql_secret']]){
  const gateway=createTableChangeDecisionGateway({send:async()=>json(status,{error:code})});
  await assert.rejects(gateway.decide({requestId:id,decision:'rejected'}),error=>
   error instanceof TableChangeDecisionGatewayError&&error.status===status&&
   error.code===(status===503?'table_change_unavailable':code));
 }
});
test('staff PWA fails closed on inconsistent or overbroad successful responses',async()=>{
 for(const value of [{requestId:id,status:'rejected'},{
  requestId:id,status:'approved',accountId:'private'},null]){
  const gateway=createTableChangeDecisionGateway({send:async()=>json(200,value)});
  await assert.rejects(gateway.decide({requestId:id,decision:'approved'}),
   /table_change_unavailable/);
 }
});
