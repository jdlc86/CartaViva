// Pure candidate server-side line quotation from a trusted published snapshot.
// Not connected to orders, payments, public routes or operational database.
import {validateEconomicModifiers} from './catalog-economic-modifiers.mjs';
import {priceCatalogLine} from './catalog-pricing.mjs';

const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const keys=(value,allowed)=>Object.keys(value).every(key=>allowed.includes(key));
const validIds=items=>Array.isArray(items)&&items.every(id=>typeof id==='string')&&
 new Set(items).size===items.length;

export function quoteCatalogSelection({snapshot,selection,quantity=1}={}){
 if(!plain(snapshot)||!validateEconomicModifiers(snapshot)||
    !Number.isSafeInteger(snapshot.priceCents)||snapshot.priceCents<0||
    !plain(selection)||!keys(selection,['options','extras']))
  throw Error('invalid_catalog_selection');
 const options=selection.options??{};
 const extras=selection.extras??[];
 if(!plain(options)||!validIds(extras)||extras.length>50||
    !Object.values(options).every(validIds)||
    Object.keys(options).length>32)
  throw Error('invalid_catalog_selection');
 const groups=snapshot.options??[];
 const allowedGroupIds=new Set(groups.map(group=>group.id));
 if(Object.keys(options).some(id=>!allowedGroupIds.has(id)))
  throw Error('invalid_catalog_selection');
 const chosen=[];
 const add=item=>chosen.push(Object.freeze({
  id:item.id,name:item.name,priceCents:item.priceCents,allergens:Object.freeze([...item.allergens])
 }));
 for(const group of groups){
  const selected=options[group.id]??[];
  if(selected.length>group.maxSelections||(group.required&&selected.length===0))
   throw Error('invalid_catalog_selection');
  const available=new Map(group.values.map(value=>[value.id,value]));
  for(const id of selected){
   const value=available.get(id);
   if(!value||!value.available)throw Error('invalid_catalog_selection');
   add(value);
  }
 }
 const availableExtras=new Map((snapshot.extras??[]).map(extra=>[extra.id,extra]));
 for(const id of extras){
  const extra=availableExtras.get(id);
  if(!extra||!extra.available)throw Error('invalid_catalog_selection');
  add(extra);
 }
 const price=priceCatalogLine({
  basePriceCents:snapshot.priceCents,extras:chosen.map(item=>item.priceCents),
  discount:snapshot.discount??null,quantity
 });
 const allergens=[...new Set([...(snapshot.allergens??[]),...chosen.flatMap(item=>item.allergens)])];
 return Object.freeze({
  basePriceCents:snapshot.priceCents,
  selected:Object.freeze(chosen),
  allergens:Object.freeze(allergens),
  discount:snapshot.discount===undefined||snapshot.discount===null?null:Object.freeze({...snapshot.discount}),
  ...price
 });
}
