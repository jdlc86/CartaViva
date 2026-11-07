import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('../apps/client/node_modules/typescript');
const catalogSource=readFileSync(new URL('../apps/client/src/catalog.ts',import.meta.url),'utf8');
const catalogJavascript=ts.transpileModule(catalogSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const catalogModule={exports:{}};
new Function('module','exports','require',catalogJavascript)(catalogModule,catalogModule.exports,require);
const source=readFileSync(new URL('../apps/client/src/client-state.ts',import.meta.url),'utf8');
const javascript=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
const localRequire=value=>value==='./catalog'?catalogModule.exports:require(value);
new Function('module','exports','require',javascript)(module,module.exports,localRequire);
const {CLIENT_BASKET_STORAGE_KEY,CLIENT_PREFERENCES_STORAGE_KEY,loadClientPreferences,saveClientPreferences,loadBasket,saveBasket,changeBasket,configureBasketLine,reconcileBasket,basketIssues,removeBasketLine,acceptBasketPrice,basketQuantity,basketTotal,basketLineKey}=module.exports;
const id='11111111-1111-4111-8111-111111111111';
const item={id,name:'Arroz meloso',category:'Primeros',priceCents:1290,available:true,allergens:['Apio']};
const selection=()=>({options:{},extras:[]});
const line=(overrides={})=>({itemId:id,name:item.name,priceCents:1290,quantity:1,selection:selection(),...overrides});
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
 assert.deepEqual(one,[line()]);
 assert.deepEqual(two,[line({quantity:2})]);
 assert.deepEqual(changeBasket(two,item,-1),one);
 assert.deepEqual(changeBasket(one,item,-1),[]);
 assert.equal(changeBasket([], {...item,available:false},1).length,0);
 assert.equal(basketQuantity(two),2);
 assert.equal(basketTotal(two),2580);
});

test('basket persistence keeps a display snapshot and catalog reconciliation refreshes it',()=>{
 const target=storage();
 const stale=[line({name:'Nombre anterior',priceCents:100,quantity:2})];
 assert.equal(saveBasket(target,stale),true);
 assert.deepEqual(loadBasket(target),stale);
 assert.deepEqual(reconcileBasket(stale,[item]),[line({name:item.name,priceCents:100,quantity:2})]);
 assert.deepEqual(reconcileBasket(stale,[]),stale);
});

test('selection never persists duplicate, forged or oversized lines',()=>{
 const target=storage();
 const one=line();
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
  name:'Plato',priceCents:100,quantity:1,selection:selection(),
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
 const snapshot=[line({itemId:id.toUpperCase(),name:'Antiguo',priceCents:1,quantity:2})];
 assert.deepEqual(reconcileBasket(snapshot,[item]),[
  line({itemId:id.toUpperCase(),name:item.name,priceCents:1,quantity:2}),
 ]);
});

test('malformed stored selections and invalid write inputs fail closed without exceptions',()=>{
 const target=storage();
 for(const bad of [
  [{...line(),itemId:null}],
  [{...line(),itemId:123}],
  [line(), line({itemId:id.toUpperCase(),name:'Otro'})],
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
  line({name:'Original',quantity:2}),
  line({itemId:other,name:'Retirado',priceCents:400}),
 ];
 const original=JSON.stringify(lines);
 const issues=basketIssues(lines,[{...item,available:false}]);
 assert.deepEqual(issues,[
  {itemId:id,reason:'sold_out'},
  {itemId:other,reason:'unpublished'},
 ]);
 assert.equal(JSON.stringify(lines),original);
 assert.deepEqual(basketIssues(lines,[item,{...item,id:other,priceCents:400}]),[]);
 assert.deepEqual(removeBasketLine(lines,other),[lines[0]]);
 assert.deepEqual(removeBasketLine(lines,id.toUpperCase()),[lines[1]]);
 assert.equal(removeBasketLine(lines,'not-a-uuid'),lines);
});

test('catalog price change remains pending until explicit acceptance, including quantity edits',()=>{
 const old=[line({itemId:id.toUpperCase(),name:'Original',priceCents:100,quantity:2})];
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

test('basket review remains blocked until all distinct price and availability incidences are resolved',()=>{
 const second='22222222-2222-4222-8222-222222222222';
 const third='33333333-3333-4333-8333-333333333333';
 const lines=[
  line({name:'Precio anterior',priceCents:100,quantity:2}),
  line({itemId:second,name:'Agotado',priceCents:500}),
  line({itemId:third,name:'Retirado',priceCents:300}),
 ];
 const published=[item,{...item,id:second,priceCents:500,available:false}];
 assert.deepEqual(basketIssues(lines,published),[
  {itemId:id,reason:'price_changed'},
  {itemId:second,reason:'sold_out'},
  {itemId:third,reason:'unpublished'},
 ]);
 const accepted=acceptBasketPrice(lines,published,id);
 assert.deepEqual(basketIssues(accepted,published),[
  {itemId:second,reason:'sold_out'},
  {itemId:third,reason:'unpublished'},
 ]);
 const withoutSoldOut=removeBasketLine(accepted,second);
 const reviewed=removeBasketLine(withoutSoldOut,third);
 assert.deepEqual(basketIssues(reviewed,published),[]);
 assert.equal(basketTotal(reviewed),2580);
 assert.equal(basketQuantity(reviewed),2);
 assert.deepEqual(lines[0],line({name:'Precio anterior',priceCents:100,quantity:2}));
});

test('device sync uses only local selection and preferences keys and rejects malformed mutations',()=>{
 assert.equal(CLIENT_BASKET_STORAGE_KEY,'sabora.client.selection.v1');
 assert.equal(CLIENT_PREFERENCES_STORAGE_KEY,'sabora.client.preferences.v2');
 const existing=[line({name:'Arroz',priceCents:100})];
 assert.equal(changeBasket(existing,{...item,id:null},1),existing);
 assert.equal(changeBasket(existing,{...item,id:123},1),existing);
 assert.equal(saveBasket(storage(),[{...existing[0],itemId:null}]),false);
 assert.deepEqual(basketIssues(existing,[{...item,id:null}]),[{itemId:id,reason:'unpublished'}]);
});

test('one dish retains independent configured variants from local storage through edit, repricing and checkout totals',()=>{
 const configured={...item,options:[{id:'sauce',name:'Salsa',required:true,maxSelections:1,values:[
  {id:'suave',name:'Suave',priceCents:0,available:true,allergens:[]},
  {id:'picante',name:'Picante',priceCents:200,available:true,allergens:[]}
 ]}],extras:[{id:'pan',name:'Pan',priceCents:100,available:true,allergens:[]}]};
 const suave={options:{sauce:['suave']},extras:[]};
 const picante={options:{sauce:['picante']},extras:['pan']};
 const first=configureBasketLine([],configured,suave,2);
 const variants=configureBasketLine(first,configured,picante,1);
 assert.equal(variants.length,2);
 assert.equal(basketQuantity(variants),3);
 assert.equal(basketTotal(variants),2*1290+1590);
 assert.notEqual(basketLineKey(variants[0]),basketLineKey(variants[1]));
 const target=storage();
 assert.equal(saveBasket(target,variants),true);
 assert.deepEqual(loadBasket(target),variants);
 const bumped=changeBasket(variants,configured,1,basketLineKey(variants[1]));
 assert.deepEqual(bumped.map(line=>line.quantity),[2,2]);
 const stale=[...bumped.slice(0,1),{...bumped[1],priceCents:1300}];
 assert.deepEqual(basketIssues(stale,[configured]),[{itemId:id,reason:'price_changed'}]);
 const accepted=acceptBasketPrice(stale,[configured],id,basketLineKey(stale[1]));
 assert.deepEqual(accepted.map(line=>line.priceCents),[1290,1590]);
 const edited=configureBasketLine(accepted,configured,picante,3,basketLineKey(accepted[0]));
 assert.equal(edited.length,1,'editing onto matching variant merges only equal configurations');
 assert.equal(edited[0].quantity,5);
 assert.equal(removeBasketLine(variants,id,basketLineKey(variants[0])).length,1);
 assert.equal(removeBasketLine(variants,id,basketLineKey(variants[0]))[0].priceCents,1590);
 assert.equal(basketLineKey({itemId:id,selection:{options:{sauce:['picante']},extras:['pan']}}),
  basketLineKey({itemId:id.toUpperCase(),selection:{options:{sauce:['picante'],unused:[]},extras:['pan']}}));
 assert.equal(saveBasket(storage(),[variants[0],{...variants[0]}]),false,
  'even with two variants enabled the same exact configuration must not be duplicated');
});
