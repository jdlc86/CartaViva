import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('../apps/client/node_modules/typescript');
const source=readFileSync(new URL('../apps/client/src/client-state.ts',import.meta.url),'utf8');
const javascript=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
new Function('module','exports','require',javascript)(module,module.exports,require);
const {loadClientPreferences,saveClientPreferences,loadBasket,saveBasket,changeBasket,reconcileBasket,basketIssues,removeBasketLine,acceptBasketPrice,basketQuantity,basketTotal}=module.exports;
const id='11111111-1111-4111-8111-111111111111';
const item={id,name:'Arroz meloso',category:'Primeros',priceCents:1290,available:true,allergens:['Apio']};
const storage=(initial={})=>{
 const values=new Map(Object.entries(initial));
 return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
};

test('versioned client preferences persist only bounded display data',()=>{
 const target=storage();
 assert.equal(saveClientPreferences(target,{locale:'es',alias:'  Ana  ',company:'Allaiso',favorites:[id,id]}),true);
 assert.deepEqual(loadClientPreferences(target),{locale:'es',alias:'Ana',company:'Allaiso',favorites:[id]});
 const serialized=[...target.values.values()].join('');
 assert.equal(/token|session|password|qr/i.test(serialized),false);
});

test('malformed local preferences and selections fail closed',()=>{
 for(const value of ['{',JSON.stringify({locale:'fr',alias:'Ana',company:'',favorites:[]}),JSON.stringify({locale:'es',alias:'A\n',company:'',favorites:[]})]){
  const target=storage({'sabora.client.preferences.v2':value});
  assert.deepEqual(loadClientPreferences(target),{locale:'es',alias:'',company:'',favorites:[]});
 }
 for(const value of ['{',JSON.stringify([{itemId:id,name:'Plato',priceCents:100,quantity:0}]),JSON.stringify([{itemId:id,name:'Plato',priceCents:100,quantity:1,token:'secret'}])]){
  assert.deepEqual(loadBasket(storage({'sabora.client.selection.v1':value})),[]);
 }
});

test('basket quantity changes are immutable, bounded and reject sold-out additions',()=>{
 const one=changeBasket([],item,1);
 const two=changeBasket(one,item,1);
 assert.deepEqual(one,[{itemId:id,name:item.name,priceCents:1290,quantity:1}]);
 assert.deepEqual(two,[{itemId:id,name:item.name,priceCents:1290,quantity:2}]);
 assert.deepEqual(changeBasket(two,item,-1),one);
 assert.deepEqual(changeBasket(one,item,-1),[]);
 assert.equal(changeBasket([], {...item,available:false},1).length,0);
 assert.equal(basketQuantity(two),2);
 assert.equal(basketTotal(two),2580);
});

test('basket persistence keeps a display snapshot and catalog reconciliation refreshes it',()=>{
 const target=storage();
 const stale=[{itemId:id,name:'Nombre anterior',priceCents:100,quantity:2}];
 assert.equal(saveBasket(target,stale),true);
 assert.deepEqual(loadBasket(target),stale);
 assert.deepEqual(reconcileBasket(stale,[item]),[{itemId:id,name:item.name,priceCents:100,quantity:2}]);
 assert.deepEqual(reconcileBasket(stale,[]),stale);
});

test('selection never persists duplicate, forged or oversized lines',()=>{
 const target=storage();
 const one={itemId:id,name:item.name,priceCents:1290,quantity:1};
 const upper={...one,itemId:id.toUpperCase()};
 for(const invalid of [
  [one,upper],
  [{...one,token:'secret'}],
  [{...one,quantity:100}],
  [{...one,priceCents:Number.MAX_SAFE_INTEGER+1}],
  Array.from({length:101},(_,index)=>({...one,itemId:`11111111-1111-4111-8111-${String(index).padStart(12,'0')}`})),
 ]){
  assert.equal(saveBasket(target,invalid),false);
  assert.equal(target.values.size,0);
 }
});

test('selection updates enforce maximum distinct dishes and case-insensitive IDs',()=>{
 const lines=Array.from({length:100},(_,index)=>({
  itemId:`11111111-1111-4111-8111-${String(index).padStart(12,'0')}`,
  name:'Plato',priceCents:100,quantity:1,
 }));
 const extra={...item,id:'22222222-2222-4222-8222-222222222222'};
 assert.equal(changeBasket(lines,extra,1),lines);
 const existing={...item,id:lines[0].itemId.toUpperCase()};
 const updated=changeBasket(lines,existing,1);
 assert.equal(updated.length,100);
 assert.equal(updated[0].quantity,2);
 assert.equal(updated[0].itemId,lines[0].itemId);
 assert.equal(changeBasket(updated,existing,-1)[0].quantity,1);
 assert.equal(changeBasket(lines,extra,-1),lines);
});

test('catalog reconciliation refreshes IDs regardless of UUID casing',()=>{
 const snapshot=[{itemId:id.toUpperCase(),name:'Antiguo',priceCents:1,quantity:2}];
 assert.deepEqual(reconcileBasket(snapshot,[item]),[
  {itemId:id.toUpperCase(),name:item.name,priceCents:1,quantity:2},
 ]);
});

test('malformed stored selections and invalid write inputs fail closed without exceptions',()=>{
 const target=storage();
 for(const bad of [
  [{itemId:null,name:'Plato',priceCents:100,quantity:1}],
  [{itemId:123,name:'Plato',priceCents:100,quantity:1}],
  [{itemId:id,name:'Plato',priceCents:100,quantity:1}, {itemId:id.toUpperCase(),name:'Otro',priceCents:100,quantity:1}],
 ]){
  target.values.set('sabora.client.selection.v1',JSON.stringify(bad));
  assert.deepEqual(loadBasket(target),[]);
  const original=target.values.get('sabora.client.selection.v1');
  assert.equal(saveBasket(target,bad),false);
  assert.equal(target.values.get('sabora.client.selection.v1'),original);
 }
});

test('favorites persist as a case-insensitive UUID set and reject non-string IDs',()=>{
 const target=storage();
 assert.equal(saveClientPreferences(target,{locale:'es',alias:'Ana',company:'',favorites:[id,id.toUpperCase()]}),true);
 assert.equal(loadClientPreferences(target).favorites.length,1);
 const saved=JSON.parse(target.values.get('sabora.client.preferences.v2'));
 assert.equal(saved.favorites.length,1);
 assert.equal(saveClientPreferences(target,{locale:'es',alias:'Ana',company:'',favorites:[null]}),false);
 assert.equal(saveClientPreferences(target,{locale:'es',alias:'Ana',company:'',favorites:[123]}),false);
 target.values.set('sabora.client.preferences.v2',JSON.stringify({
  locale:'es',alias:'Ana',company:'',favorites:[id,id.toUpperCase()],
 }));
 assert.equal(loadClientPreferences(target).favorites.length,1);
});

test('basket incidences distinguish sold-out and unpublished without deleting selections',()=>{
 const other='22222222-2222-4222-8222-222222222222';
 const lines=[
  {itemId:id,name:'Original',priceCents:1290,quantity:2},
  {itemId:other,name:'Retirado',priceCents:400,quantity:1},
 ];
 const original=JSON.stringify(lines);
 const issues=basketIssues(lines,[{...item,available:false}]);
 assert.deepEqual(issues,[
  {itemId:id,reason:'sold_out'},
  {itemId:other,reason:'unpublished'},
 ]);
 assert.equal(JSON.stringify(lines),original);
 assert.deepEqual(basketIssues(lines,[item,{...item,id:other}]),[]);
 assert.deepEqual(removeBasketLine(lines,other),[lines[0]]);
 assert.deepEqual(removeBasketLine(lines,id.toUpperCase()),[lines[1]]);
 assert.equal(removeBasketLine(lines,'not-a-uuid'),lines);
});

test('catalog price change remains pending until explicit acceptance, including quantity edits',()=>{
 const old=[{itemId:id.toUpperCase(),name:'Original',priceCents:100,quantity:2}];
 const updated=reconcileBasket(old,[item]);
 assert.equal(updated[0].priceCents,100);
 assert.deepEqual(basketIssues(updated,[item]),[{itemId:id.toUpperCase(),reason:'price_changed'}]);
 const changedQuantity=changeBasket(updated,item,1);
 assert.equal(changedQuantity[0].quantity,3);
 assert.equal(changedQuantity[0].priceCents,100);
 const accepted=acceptBasketPrice(changedQuantity,[item],id);
 assert.equal(accepted[0].priceCents,1290);
 assert.equal(accepted[0].quantity,3);
 assert.deepEqual(basketIssues(accepted,[item]),[]);
 assert.equal(acceptBasketPrice(old,[{...item,available:false}],id),old);
 assert.equal(acceptBasketPrice(old,[],id),old);
});
