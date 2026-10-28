// Offline planning only. No database connection, writes, email delivery or identity recovery.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATES=new Set(['invited','accepted','registered','active','suspended','revoked']);
const exact=(object,keys)=>object&&typeof object==='object'&&!Array.isArray(object)&&
 (Object.getPrototypeOf(object)===Object.prototype||Object.getPrototypeOf(object)===null)&&
 Reflect.ownKeys(object).length===keys.length&&keys.every(key=>Object.hasOwn(object,key)&&
 Object.getOwnPropertyDescriptor(object,key)?.enumerable===true);
const valid=(row)=>exact(row,['enrollmentId','state','hasVerifiedContact'])&&
 typeof row.enrollmentId==='string'&&UUID.test(row.enrollmentId)&&
 STATES.has(row.state)&&typeof row.hasVerifiedContact==='boolean';
export function planHistoricalContactReconciliation(rows){
 if(!Array.isArray(rows)||rows.length>100000||!rows.every(valid))
  throw Error('invalid_contact_reconciliation_inventory');
 const seen=new Set(),summary={alreadyVerified:0,pendingVerification:0,revoked:0};
 const pending=[];
 for(const row of rows){
  const id=row.enrollmentId.toLowerCase();
  if(seen.has(id))throw Error('duplicate_contact_reconciliation_identity');
  seen.add(id);
  if(row.state==='revoked'){summary.revoked++;continue;}
  if(row.hasVerifiedContact){summary.alreadyVerified++;continue;}
  summary.pendingVerification++;
  pending.push(Object.freeze({enrollmentId:id,action:'authorized_verification_required'}));
 }
 return Object.freeze({summary:Object.freeze(summary),pending:Object.freeze(pending)});
}
