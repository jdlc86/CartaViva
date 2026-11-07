import {catalogUnitPrice,type CatalogSelection,type MenuItem} from './catalog';

export type Locale='es'|'en';
export type ClientPreferences=Readonly<{
 locale:Locale;
 alias:string;
 company:string;
 favorites:readonly string[];
}>;
export type BasketLine=Readonly<{
 itemId:string;
 name:string;
 priceCents:number;
 quantity:number;
 selection:CatalogSelection;
}>;

type StorageLike=Pick<Storage,'getItem'|'setItem'>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const control=/[\u0000-\u001f\u007f]/u;
const preferencesKey='sabora.client.preferences.v2';
const basketKey='sabora.client.selection.v1';
const MAX_BASKET_LINES=100;
const MAX_FAVORITES=500;
const MAX_QUANTITY=20;
export const CLIENT_PREFERENCES_STORAGE_KEY=preferencesKey;
export const CLIENT_BASKET_STORAGE_KEY=basketKey;
// Variant identity is the dish plus its *canonical* structured configuration.
// No credentials or server identifiers enter the device's stored selection.
export function basketLineKey(line:Pick<BasketLine,'itemId'|'selection'>):string{
 const options=Object.entries(line.selection.options)
  .filter(([,ids])=>ids.length>0).sort(([a],[b])=>a.localeCompare(b))
  .map(([group,ids])=>[group,[...ids].sort()]);
 return JSON.stringify([line.itemId.toLowerCase(),options,[...line.selection.extras].sort()]);
}

const defaults:ClientPreferences=Object.freeze({locale:'es',alias:'',company:'',favorites:Object.freeze([])});
const plain=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const boundedText=(value:unknown,max:number,required=false)=>typeof value==='string'&&
 (!required||!!value.trim())&&[...value].length<=max&&!control.test(value);
const validId=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(value);
const parseSelection=(value:unknown):CatalogSelection|null=>{
 if(!plain(value)||Reflect.ownKeys(value).length!==2||!plain(value.options)||!Array.isArray(value.extras)||
    value.extras.length>50||!value.extras.every(validId)||new Set(value.extras).size!==value.extras.length||
    Object.keys(value.options).length>32)return null;
 const options:Record<string,readonly string[]>={};
 for(const [key,ids] of Object.entries(value.options)){
  if(!validId(key)||!Array.isArray(ids)||ids.length>20||!ids.every(validId)||new Set(ids).size!==ids.length)return null;
  options[key]=Object.freeze([...ids] as string[]);
 }
 return Object.freeze({options:Object.freeze(options),extras:Object.freeze([...value.extras] as string[])});
};
const emptySelection=():CatalogSelection=>Object.freeze({options:Object.freeze({}),extras:Object.freeze([])});
const safeParse=(storage:StorageLike,key:string,max:number):unknown=>{
 try{
  const raw=storage.getItem(key);
  return raw&&raw.length<=max?JSON.parse(raw):null;
 }catch{return null;}
};

export function loadClientPreferences(storage:StorageLike):ClientPreferences{
 const value=safeParse(storage,preferencesKey,8192);
 if(!plain(value)||!['es','en'].includes(String(value.locale))||
    !boundedText(value.alias,80)||!boundedText(value.company,160)||
    !Array.isArray(value.favorites)||value.favorites.length>MAX_FAVORITES||
    !value.favorites.every(item=>typeof item==='string'&&uuid.test(item)))return defaults;
 return Object.freeze({locale:value.locale as Locale,alias:(value.alias as string).trim(),
  company:(value.company as string).trim(),favorites:Object.freeze([...new Map((value.favorites as string[]).map(id=>[id.toLowerCase(),id])).values()])});
}

export function saveClientPreferences(storage:StorageLike,value:ClientPreferences):boolean{
 if(!['es','en'].includes(value.locale)||!boundedText(value.alias,80)||!boundedText(value.company,160)||
    !Array.isArray(value.favorites)||value.favorites.length>MAX_FAVORITES||
    !value.favorites.every(item=>typeof item==='string'&&uuid.test(item)))return false;
 try{
  storage.setItem(preferencesKey,JSON.stringify({locale:value.locale,alias:value.alias.trim(),
   company:value.company.trim(),favorites:[...new Map(value.favorites.map(id=>[id.toLowerCase(),id])).values()]}));
  return true;
 }catch{return false;}
}

export function loadBasket(storage:StorageLike):readonly BasketLine[]{
 const value=safeParse(storage,basketKey,65536);
 if(!Array.isArray(value)||value.length>MAX_BASKET_LINES)return Object.freeze([]);
 const ids=new Set<string>();
 const valid=value.every(line=>{
  if(!plain(line)||![4,5].includes(Reflect.ownKeys(line).length)||
     !['itemId','name','priceCents','quantity'].every(key=>Object.hasOwn(line,key))||
     (Reflect.ownKeys(line).length===5&&!Object.hasOwn(line,'selection'))||
     (Object.hasOwn(line,'selection')&&!parseSelection(line.selection))||
     typeof line.itemId!=='string'||!uuid.test(line.itemId)||
     !boundedText(line.name,160,true)||typeof line.priceCents!=='number'||
     !Number.isSafeInteger(line.priceCents)||line.priceCents<0||typeof line.quantity!=='number'||
     !Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>MAX_QUANTITY)return false;
  const key=basketLineKey({itemId:line.itemId as string,selection:parseSelection(line.selection)??emptySelection()});
  if(ids.has(key))return false;
  ids.add(key);return true;
 });
 if(!valid)return Object.freeze([]);
 return Object.freeze(value.map(line=>Object.freeze({itemId:line.itemId as string,name:(line.name as string).trim(),
  priceCents:line.priceCents as number,quantity:line.quantity as number,
  selection:parseSelection(line.selection)??emptySelection()})));
}

function validBasketLines(lines:readonly BasketLine[]):boolean{
 if(!Array.isArray(lines)||lines.length>MAX_BASKET_LINES)return false;
 const ids=new Set<string>();
 for(const line of lines){
  const candidate:unknown=line;
  if(!plain(candidate)||Reflect.ownKeys(candidate).length!==5||
     !['itemId','name','priceCents','quantity','selection'].every(key=>Object.hasOwn(candidate,key))||
     typeof candidate.itemId!=='string'||!uuid.test(candidate.itemId)||
     !boundedText(candidate.name,160,true)||typeof candidate.priceCents!=='number'||
     !Number.isSafeInteger(candidate.priceCents)||candidate.priceCents<0||typeof candidate.quantity!=='number'||
     !Number.isSafeInteger(candidate.quantity)||candidate.quantity<1||candidate.quantity>MAX_QUANTITY||
     !parseSelection(candidate.selection))return false;
  const key=basketLineKey(line);
  if(ids.has(key))return false;
  ids.add(key);
 }
 return true;
}

export function saveBasket(storage:StorageLike,lines:readonly BasketLine[]):boolean{
 if(!validBasketLines(lines))return false;
 try{storage.setItem(basketKey,JSON.stringify(lines));return true;}catch{return false;}
}

export function changeBasket(lines:readonly BasketLine[],item:MenuItem,delta:number,lineKey?:string):readonly BasketLine[]{
 if(!Number.isInteger(delta)||Math.abs(delta)!==1||!validBasketLines(lines)||
    typeof item.id!=='string'||!uuid.test(item.id)||!boundedText(item.name,160,true)||
    !Number.isSafeInteger(item.priceCents)||item.priceCents<0)return lines;
 const key=lineKey??basketLineKey({itemId:item.id,selection:emptySelection()});
 const current=lines.find(line=>basketLineKey(line)===key&&
  line.itemId.toLowerCase()===item.id.toLowerCase());
 // A cart action must never silently mutate another variant of this dish.
 if(lineKey!==undefined&&!current)return lines;
 if(delta>0&&!item.available)return lines;
 if(delta<0&&!current)return lines;
 if(delta>0&&!current&&lines.length>=MAX_BASKET_LINES)return lines;
 const quantity=(current?.quantity??0)+delta;
 if(quantity<=0)return Object.freeze(lines.filter(line=>basketLineKey(line)!==key));
 if(quantity>MAX_QUANTITY)return lines;
 const selection=current?.selection??emptySelection();
 let unitPrice:number;
 try{unitPrice=catalogUnitPrice(item,selection);}
 catch{if(delta>0)return lines;unitPrice=current?.priceCents??item.priceCents;}
 const next:BasketLine=Object.freeze({itemId:current?.itemId??item.id,name:current?.name??item.name,
  priceCents:current?.priceCents??unitPrice,quantity,selection});
 return Object.freeze(current?lines.map(line=>basketLineKey(line)===key?next:line):[...lines,next]);
}

export function reconcileBasket(lines:readonly BasketLine[],items:readonly MenuItem[]):readonly BasketLine[]{
 const current=new Map(items.filter(item=>typeof item.id==='string').map(item=>[item.id.toLowerCase(),item]));
 return Object.freeze(lines.map(line=>{
  const item=current.get(line.itemId.toLowerCase());
  return item?Object.freeze({...line,name:item.name}):line;
 }));
}
export function configureBasketLine(lines:readonly BasketLine[],item:MenuItem,selection:CatalogSelection,
 quantity=1,editingKey?:string):readonly BasketLine[]{
 const parsed=parseSelection(selection);
 if(!validBasketLines(lines)||!Number.isSafeInteger(quantity)||quantity<1||quantity>MAX_QUANTITY||
    !item.available||!uuid.test(item.id)||!boundedText(item.name,160,true)||!parsed)return lines;
 let priceCents:number;try{priceCents=catalogUnitPrice(item,parsed);}catch{return lines;}
 const next:BasketLine=Object.freeze({itemId:item.id,name:item.name,priceCents,quantity,selection:parsed});
 const nextKey=basketLineKey(next);
 const existing=lines.find(line=>basketLineKey(line)===nextKey);
 if(editingKey!==undefined){
  const original=lines.find(line=>basketLineKey(line)===editingKey&&
    line.itemId.toLowerCase()===item.id.toLowerCase());
  if(!original)return lines;
  if(existing&&existing!==original){
   const mergedQuantity=existing.quantity+quantity;
   if(mergedQuantity>MAX_QUANTITY)return lines;
   return Object.freeze(lines.filter(line=>basketLineKey(line)!==editingKey)
    .map(line=>basketLineKey(line)===nextKey?
     Object.freeze({...line,name:item.name,priceCents,quantity:mergedQuantity}):line));
  }
  return Object.freeze(lines.map(line=>basketLineKey(line)===editingKey?next:line));
 }
 if(existing){
  const mergedQuantity=existing.quantity+quantity;
  if(mergedQuantity>MAX_QUANTITY)return lines;
  return Object.freeze(lines.map(line=>basketLineKey(line)===nextKey?
   Object.freeze({...line,name:item.name,priceCents,quantity:mergedQuantity}):line));
 }
 if(lines.length>=MAX_BASKET_LINES)return lines;
 return Object.freeze([...lines,next]);
}

export const basketQuantity=(lines:readonly BasketLine[])=>lines.reduce((sum,line)=>sum+line.quantity,0);
export const basketTotal=(lines:readonly BasketLine[])=>lines.reduce((sum,line)=>sum+line.priceCents*line.quantity,0);

export type BasketIssue=Readonly<{itemId:string;reason:'unpublished'|'sold_out'|'price_changed'}>;
export function basketIssues(lines:readonly BasketLine[],items:readonly MenuItem[]):readonly BasketIssue[]{
 const published=new Map(items.filter(item=>typeof item.id==='string').map(item=>[item.id.toLowerCase(),item]));
 return Object.freeze(lines.flatMap<BasketIssue>(line=>{
  const item=published.get(line.itemId.toLowerCase());
  if(!item)return [Object.freeze({itemId:line.itemId,reason:'unpublished' as const})];
  if(!item.available)return [Object.freeze({itemId:line.itemId,reason:'sold_out' as const})];
  let currentPrice:number;try{currentPrice=catalogUnitPrice(item,line.selection);}catch{return [Object.freeze({itemId:line.itemId,reason:'price_changed' as const})];}
  if(currentPrice!==line.priceCents)return [Object.freeze({itemId:line.itemId,reason:'price_changed' as const})];
  return [];
 }));
}
export function removeBasketLine(lines:readonly BasketLine[],itemId:string,lineKey?:string):readonly BasketLine[]{
 if(typeof itemId!=='string'||!uuid.test(itemId))return lines;
 return Object.freeze(lines.filter(line=>line.itemId.toLowerCase()!==itemId.toLowerCase()||
  (lineKey!==undefined&&basketLineKey(line)!==lineKey)));
}

export function acceptBasketPrice(lines:readonly BasketLine[],items:readonly MenuItem[],itemId:string,
 lineKey?:string):readonly BasketLine[]{
 if(typeof itemId!=='string'||!uuid.test(itemId)||!validBasketLines(lines))return lines;
 const item=items.find(candidate=>typeof candidate.id==='string'&&candidate.id.toLowerCase()===itemId.toLowerCase());
 if(!item||!item.available||!Number.isSafeInteger(item.priceCents)||item.priceCents<0)return lines;
 const targets=lines.filter(line=>line.itemId.toLowerCase()===itemId.toLowerCase()&&
  (lineKey===undefined||basketLineKey(line)===lineKey));
 if(!targets.length)return lines;
 const prices=new Map<string,number>();
 try{for(const line of targets)prices.set(basketLineKey(line),catalogUnitPrice(item,line.selection));}
 catch{return lines;}
 return Object.freeze(lines.map(line=>prices.has(basketLineKey(line))?
  Object.freeze({...line,name:item.name,priceCents:prices.get(basketLineKey(line))!}):line));
}
