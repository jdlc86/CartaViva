import test from 'node:test';
import assert from 'node:assert/strict';
import {createH4H6IntegratedCandidate} from '../../apps/api/src/h4-h6-integrated-candidate.mjs';

const pool=()=>({connect:async()=>{},query:async()=>{}});
const h4=()=>({staffPool:pool(),operationsPool:pool()});
const h6=()=>({customerPool:pool(),providerPool:pool(),operationsPool:pool()});

test('integrated H4/H6 candidate rejects missing and aliased SQL identities before startup',async()=>{
 await assert.rejects(createH4H6IntegratedCandidate(),/invalid_h4_h6_candidate_isolation/);
 const cases=[
  ({a,b})=>{b.operationsPool=a.operationsPool;},
  ({a,b})=>{b.operationsPool=a.staffPool;},
  ({a,b})=>{b.providerPool=b.customerPool;},
  ({a,b})=>{b.operationsPool=b.customerPool;},
  ({a,b})=>{b.operationsPool=b.providerPool;},
  ({a,b})=>{b.customerPool=a.staffPool;},
  ({a,b})=>{b.providerPool=a.staffPool;},
  ({a,b})=>{b.customerPool=a.operationsPool;},
  ({a,b})=>{b.providerPool=a.operationsPool;},
  ({a,b})=>{b.forRoles=()=>[];},
  ({a,b})=>{b.notifierPool=a.staffPool;},
  ({a,b})=>{b.notifierPool=a.operationsPool;},
  ({a,b})=>{b.notifierPool=b.customerPool;},
  ({a,b})=>{b.notifierPool=b.providerPool;},
  ({a,b})=>{delete b.customerPool;},
  ({a,b})=>{delete b.providerPool;},
 ];
 for(const change of cases){
  const a=h4(),b=h6();change({a,b});
  await assert.rejects(createH4H6IntegratedCandidate({h4:a,h6:b}),
   /invalid_h4_h6_candidate_isolation/);
 }
});
