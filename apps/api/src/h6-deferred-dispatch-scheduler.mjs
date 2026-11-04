// Dormant B3 grouping scheduler. Durable PostgreSQL is the source of truth;
// notifications merely wake a re-read, never authorize dispatch. No polling.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DELAY=2147483647;
export function createH6DeferredDispatchScheduler({
 listSchedulable,dispatchDue,subscribeCommitted,onFailure=()=>{},
 schedule=setTimeout,cancel=clearTimeout
}={}){
 if(typeof listSchedulable!=='function'||typeof dispatchDue!=='function'||
    typeof subscribeCommitted!=='function'||typeof onFailure!=='function'||
    typeof schedule!=='function'||typeof cancel!=='function')
  throw Error('invalid_h6_deferred_dispatch_scheduler');
 let active=false,closed=false,timer=null,unsubscribe=null,running=null,dirty=false;
 const clear=()=>{if(timer!==null){cancel(timer);timer=null;}};
 const arm=ms=>{
  clear();
  if(closed)return;
  timer=schedule(()=>{timer=null;void wake().catch(()=>{});},
    Math.max(1,Math.min(MAX_DELAY,Math.ceil(ms))));
  timer?.unref?.();
 };
 const wake=async()=>{
  if(closed||!active)return;
  if(running){dirty=true;return running;}
  running=(async()=>{
   do{
    dirty=false;clear();
    // Bounded synchronous batches, not repeated queries while waiting.
    for(let batch=0;batch<256&&!closed;batch++){
     const entries=await listSchedulable({limit:100});
     if(!Array.isArray(entries)||entries.length>100)
      throw Error('invalid_h6_dispatch_schedule');
     if(entries.length===0)break;
     for(const item of entries)
      if(!UUID.test(item?.orderId??'')||
         !(item?.groupingDeadline instanceof Date)||
         !(item?.serverNow instanceof Date)||
         !Number.isFinite(item.groupingDeadline.getTime())||
         !Number.isFinite(item.serverNow.getTime()))
       throw Error('invalid_h6_dispatch_schedule');
     const due=entries.filter(item=>item.groupingDeadline<=item.serverNow);
     if(due.length===0){
      const first=entries[0];
      arm(first.groupingDeadline.getTime()-first.serverNow.getTime()+10);
      break;
     }
     for(const item of due)await dispatchDue({orderId:item.orderId});
     if(batch===255)arm(1);
    }
   }while(dirty&&!closed);
  })();
  try{await running;}catch(error){
   try{onFailure(error);}catch{}
   // Fail closed. No loop against a failing database/provider: an explicit
   // wake, new committed event or process restart is required to resume.
   throw error;
  }finally{running=null;}
 };
 return Object.freeze({
  async start(){
   if(active||closed)throw Error('h6_dispatch_scheduler_already_started');
   active=true;
   try{unsubscribe=subscribeCommitted(()=>{void wake().catch(()=>{});});
    if(typeof unsubscribe!=='function')throw Error('invalid_h6_dispatch_subscription');
    await wake();
   }catch(error){await this.close();throw error;}
  },
  wake,
  async close(){
   if(closed)return;
   closed=true;active=false;clear();
   try{unsubscribe?.();}catch{}
   if(running)try{await running;}catch{}
  }
 });
}
