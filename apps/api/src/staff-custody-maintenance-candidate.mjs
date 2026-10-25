// Candidate-only maintenance adapter. No timer, cron, credentials, or operational wiring.
// Approval must be provided per invocation by the caller; no implicit retention policy.
const SQL = 'SELECT sabora.purge_terminal_staff_invitation_custody_candidate($1::timestamptz,$2::integer) AS removed';
const ISO_UTC=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
export const STAFF_CUSTODY_PURGE_SQL=SQL;
export function createStaffCustodyMaintenanceCandidate({query,clock=()=>new Date(),approvalAuthority}={}){
  if(typeof query!=='function'||typeof clock!=='function'||
    (approvalAuthority!==undefined && typeof approvalAuthority.verifyAndConsume!=='function'))
    throw Error('invalid_staff_custody_maintenance_config');
  return Object.freeze({
    async run({cutoff,maxRows=100,maxBatches=1,authorization,dryRun=true}={}){
      if(typeof cutoff!=='string'||!ISO_UTC.test(cutoff)||
        !Number.isFinite(Date.parse(cutoff))||
        new Date(cutoff).toISOString().slice(0,19)!==cutoff.slice(0,19) ||
        !Number.isSafeInteger(maxRows)||maxRows<1||maxRows>500||
        !Number.isSafeInteger(maxBatches)||maxBatches<1||maxBatches>20)
        throw Error('invalid_staff_custody_maintenance_parameters');
      const now=clock();
      if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
        Date.parse(cutoff)>now.getTime())
        throw Error('invalid_staff_custody_maintenance_cutoff');
      if(dryRun!==false)return Object.freeze({executed:false,removed:0,batches:0});
      const verified=approvalAuthority
        ? await approvalAuthority.verifyAndConsume(authorization,{cutoff,maxRows,maxBatches})
        : authorization;
      if(!verified||verified.action!=='purge_terminal_staff_custody'||
        verified.cutoff!==cutoff||
        verified.maxRows!==maxRows||
        verified.maxBatches!==maxBatches||
        verified.approved!==true)
        throw Error('staff_custody_maintenance_not_authorized');
      let removed=0,batches=0;
      for(let i=0;i<maxBatches;i++){
        const result=await query(SQL,[cutoff,maxRows]);
        const count=result?.rows?.length===1?result.rows[0]?.removed:null;
        if(!Number.isSafeInteger(count)||count<0||count>maxRows)
          throw Error('invalid_staff_custody_maintenance_result');
        removed+=count;batches++;
        if(count<maxRows)break;
      }
      return Object.freeze({executed:true,removed,batches});
    },
  });
}
