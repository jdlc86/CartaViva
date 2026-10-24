import test from 'node:test';
import assert from 'node:assert/strict';
import {createCustomerRequestKeyRegistry} from '../packages/customer-consent/src/customer-request-key-registry.mjs';
test('same basket revision retains key across retries and offline ambiguity',()=>{
 let n=0;
 const registry=createCustomerRequestKeyRegistry({createKey:()=> 'request_'+(++n)});
 const basket={basketId:'basket_1',revision:1};
 const first=registry.forBasket(basket);
 registry.begin();
 assert.equal(registry.pending,true);
 assert.equal(registry.forBasket(basket),first);
 assert.throws(()=>registry.forBasket({...basket,revision:2}),/request_key_pending_confirmation/);
 assert.throws(()=>registry.reset(),/request_key_pending_confirmation/);
 registry.end();
 assert.equal(registry.forBasket(basket),first);
 assert.equal(n,1);
 assert.notEqual(registry.forBasket({...basket,revision:2}),first);
 assert.equal(n,2);
});
test('new basket requires new key and reset cannot happen in flight',()=>{
 let n=0;
 const registry=createCustomerRequestKeyRegistry({createKey:()=> 'request_'+(++n)});
 const a=registry.forBasket({basketId:'a',revision:1});
 registry.begin();
 assert.throws(()=>registry.forBasket({basketId:'b',revision:1}),/request_key_pending_confirmation/);
 registry.end();
 const b=registry.forBasket({basketId:'b',revision:1});
 assert.notEqual(a,b);
 registry.reset();
 assert.equal(registry.key,null);
});
test('invalid basket and generated key fail closed',()=>{
 const registry=createCustomerRequestKeyRegistry({createKey:()=> 'x'});
 assert.throws(()=>registry.forBasket({basketId:'basket_1',revision:1}),/invalid_request_key/);
 assert.throws(()=>registry.forBasket({basketId:'',revision:1}),/invalid_request_key_basket/);
});
