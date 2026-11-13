import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createTableChangeCommitNotifier}
 from '../apps/api/src/table-change-state-stream-candidate.mjs';

function fixture(){
 const connection=new EventEmitter(),queries=[],releases=[];
 connection.query=async sql=>{
  queries.push(sql);
  if(sql.startsWith('SELECT current_user'))return {rows:[{actor:'sabora_ops',login:'sabora_ops'}]};
  return {rows:[]};
 };
 connection.release=broken=>releases.push(broken??false);
 return {connection,queries,releases,pool:{connect:async()=>connection}};
}

for(const event of ['error','end'])test(`table-change notifier fails closed on ${event}`,async()=>{
 const value=fixture(),losses=[];
 const notifier=await createTableChangeCommitNotifier({pool:value.pool,
  expectedLogin:'sabora_ops',onLost:error=>losses.push(error.message)});
 value.connection.emit(event,event==='error'?Error('driver_secret_detail'):undefined);
 assert.deepEqual(losses,['table_change_notification_connection_lost']);
 assert.deepEqual(value.releases,[true]);
 assert.throws(()=>notifier.subscribe(()=>{}),/invalid_table_change_subscription/);
 await notifier.close();
 assert.deepEqual(value.releases,[true]);
});

test('explicit notifier close unlistens and returns a healthy connection once',async()=>{
 const value=fixture(),losses=[];
 const notifier=await createTableChangeCommitNotifier({pool:value.pool,
  expectedLogin:'sabora_ops',onLost:error=>losses.push(error.message)});
 await notifier.close();await notifier.close();
 value.connection.emit('end');
 assert.ok(value.queries.includes('LISTEN sabora_h6_table_change_changed'));
 assert.ok(value.queries.includes('UNLISTEN sabora_h6_table_change_changed'));
 assert.deepEqual(value.releases,[false]);
 assert.deepEqual(losses,[]);
});
