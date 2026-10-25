import test from 'node:test';
import assert from 'node:assert/strict';
import {createStaffCustodyMaintenanceCandidate,STAFF_CUSTODY_PURGE_SQL}
  from '../apps/api/src/staff-custody-maintenance-candidate.mjs';
const cutoff='2026-10-01T00:00:00Z';
const now=new Date('2026-10-25T12:00:00Z');
const approve=(overrides={})=>({
  action:'purge_terminal_staff_custody',cutoff,maxRows:2,maxBatches:3,
  approved:true,...overrides,
});
test('dry run is default and never calls destructive SQL',async()=>{
  const maintenance=createStaffCustodyMaintenanceCandidate({
    query:async()=>{throw Error('must_not_query');},clock:()=>now,
  });
  assert.deepEqual(await maintenance.run({cutoff,maxRows:2,maxBatches:3}),
    {executed:false,removed:0,batches:0});
  assert.deepEqual(await maintenance.run({cutoff,maxRows:2,maxBatches:3,
    authorization:approve()}),{executed:false,removed:0,batches:0});
});
test('destructive run requires matching explicit approval and valid bounded cutoff',async()=>{
  const maintenance=createStaffCustodyMaintenanceCandidate({
    query:async()=>{throw Error('must_not_query');},clock:()=>now,
  });
  for(const authorization of [undefined,{},approve({approved:false}),
    approve({cutoff:'2026-09-01T00:00:00Z'}),approve({maxRows:500}),
    approve({maxBatches:4}),approve({action:'other'})]){
    await assert.rejects(maintenance.run({
      cutoff,maxRows:2,maxBatches:3,dryRun:false,authorization,
    }),/staff_custody_maintenance_not_authorized/);
  }
  for(const invalid of ['2026-02-30T00:00:00Z','2026-11-01T00:00:00Z',
    '2026-10-01T00:00:00+00:00','bad']){
    await assert.rejects(maintenance.run({cutoff:invalid,dryRun:false}),
      /invalid_staff_custody_maintenance_/);
  }
  for(const maxRows of [0,501,1.5]){
    await assert.rejects(maintenance.run({cutoff,maxRows}),
      /invalid_staff_custody_maintenance_parameters/);
  }
  for(const maxBatches of [0,21,2.5]){
    await assert.rejects(maintenance.run({cutoff,maxBatches}),
      /invalid_staff_custody_maintenance_parameters/);
  }
});
test('authorized purge is bounded, stops early and reports exact counts',async()=>{
  let calls=0;
  const maintenance=createStaffCustodyMaintenanceCandidate({
    query:async(sql,values)=>{
      assert.equal(sql,STAFF_CUSTODY_PURGE_SQL);
      assert.deepEqual(values,[cutoff,2]);
      return {rows:[{removed:[2,2,1][calls++]}]};
    },clock:()=>now,
  });
  assert.deepEqual(await maintenance.run({
    cutoff,maxRows:2,maxBatches:3,dryRun:false,authorization:approve(),
  }),{executed:true,removed:5,batches:3});
  assert.equal(calls,3);
});
test('unexpected SQL result fails closed and does not continue batches',async()=>{
  let calls=0;
  const maintenance=createStaffCustodyMaintenanceCandidate({
    query:async()=>{calls++;return {rows:[{removed:3}]};},clock:()=>now,
  });
  await assert.rejects(maintenance.run({
    cutoff,maxRows:2,maxBatches:3,dryRun:false,authorization:approve(),
  }),/invalid_staff_custody_maintenance_result/);
  assert.equal(calls,1);
});
