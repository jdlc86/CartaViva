import type {MenuItem} from './catalog';

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
}>;

type StorageLike=Pick<Storage,'getItem'|'setItem'>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const control=/[\u0000-\u001f\u007f]/u;
const preferencesKey='sabora.client.preferences.v2';
const basketKey='sabora.client.selection.v1';
const MAX_BASKET_LINES=100;
const MAX_FAVORITES=500;
const MAX_QUANTITY=99;
const defaults:ClientPreferences=Object.freeze({locale:'es',alias:'',company:'',favorites:Object.freeze([])});
const plain=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const boundedText=(value:unknown,max:number,required=false)=>typeof value==='string'&&
 (!required||!!value.trim())&&[...value].length<=max&&!control.test(value);
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
  if(!plain(line)||Reflect.ownKeys(line).length!==4||
     !['itemId','name','priceCents','quantity'].every(key=>Object.hasOwn(line,key))||
     typeof line.itemId!=='string'||!uuid.test(line.itemId)||ids.has(line.itemId.toLowerCase())||
     !boundedText(line.name,160,true)||!Number.isSafeInteger(line.priceCents)||(line.priceCents as number)<0||
     !Number.isSafeInteger(line.quantity)||(line.quantity as number)<1||(line.quantity as number)>MAX_QUANTITY)return false;
  ids.add(line.itemId.toLowerCase());return true;
 });
 if(!valid)return Object.freeze([]);
 return Object.freeze(value.map(line=>Object.freeze({itemId:line.itemId as string,name:(line.name as string).trim(),
  priceCents:line.priceCents as number,quantity:line.quantity as number})));
}

function validBasketLines(lines:readonly BasketLine[]):boolean{
 if(!Array.isArray(lines)||lines.length>MAX_BASKET_LINES)return false;
 const ids=new Set<string>();
 for(const line of lines){
  if(!plain(line)||Reflect.ownKeys(line).length!==4||
     !['itemId','name','priceCents','quantity'].every(key=>Object.hasOwn(line,key))||
     !uuid.test(line.itemId)||ids.has(line.itemId.toLowerCase())||
     !boundedText(line.name,160,true)||!Number.isSafeInteger(line.priceCents)||line.priceCents<0||
     !Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>MAX_QUANTITY)return false;
  ids.add(line.itemId.toLowerCase());
 }
 return true;
}

export function saveBasket(storage:StorageLike,lines:readonly BasketLine[]):boolean{
 if(!validBasketLines(lines))return false;
 try{storage.setItem(basketKey,JSON.stringify(lines));return true;}catch{return false;}
}

export function changeBasket(lines:readonly BasketLine[],item:MenuItem,delta:number):readonly BasketLine[]{
 if(!Number.isInteger(delta)||Math.abs(delta)!==1||!validBasketLines(lines)||
    !uuid.test(item.id)||!boundedText(item.name,160,true)||
    !Number.isSafeInteger(item.priceCents)||item.priceCents<0)return lines;
 const current=lines.find(line=>line.itemId.toLowerCase()===item.id.toLowerCase());
 if(delta>0&&!item.available)return lines;
 if(delta<0&&!current)return lines;
 if(delta>0&&!current&&lines.length>=MAX_BASKET_LINES)return lines;
 const quantity=(current?.quantity??0)+delta;
 if(quantity<=0)return Object.freeze(lines.filter(line=>line.itemId.toLowerCase()!==item.id.toLowerCase()));
 if(quantity>MAX_QUANTITY)return lines;
 const next:BasketLine=Object.freeze({itemId:current?.itemId??item.id,name:item.name,priceCents:item.priceCents,quantity});
 return Object.freeze(current?lines.map(line=>line.itemId.toLowerCase()===item.id.toLowerCase()?next:line):[...lines,next]);
}

export function reconcileBasket(lines:readonly BasketLine[],items:readonly MenuItem[]):readonly BasketLine[]{
 const current=new Map(items.map(item=>[item.id.toLowerCase(),item]));
 return Object.freeze(lines.map(line=>{
  const item=current.get(line.itemId.toLowerCase());
  return item?Object.freeze({...line,name:item.name,priceCents:item.priceCents}):line;
 }));
}

export const basketQuantity=(lines:readonly BasketLine[])=>lines.reduce((sum,line)=>sum+line.quantity,0);
export const basketTotal=(lines:readonly BasketLine[])=>lines.reduce((sum,line)=>sum+line.priceCents*line.quantity,0);
