// In-memory idempotency identity for one basket revision. Never persist tokens,
// and never rotate the request key after an ambiguous network outcome.
const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const validKey=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(v);
export function createCustomerRequestKeyRegistry({createKey}={}){
 if(typeof createKey!=='function')throw Error('invalid_request_key_registry');
 let current=null;
 let pending=false;
 return Object.freeze({
  forBasket(basket){
   if(!basket||typeof basket!=='object'||!validId(basket.basketId)||
      !Number.isSafeInteger(basket.revision)||basket.revision<1)
    throw Error('invalid_request_key_basket');
   const identity=basket.basketId+':'+basket.revision;
   if(current?.identity===identity)return current.key;
   if(pending)throw Error('request_key_pending_confirmation');
   const key=createKey();
   if(!validKey(key))throw Error('invalid_request_key');
   current=Object.freeze({identity,key});
   return key;
  },
  begin(){
   if(!current||pending)throw Error('request_key_pending_confirmation');
   pending=true;
  },
  end(){pending=false;},
  get pending(){return pending;},
  get key(){return current?.key??null;},
  reset(){
   if(pending)throw Error('request_key_pending_confirmation');
   current=null;
  }
 });
}
