// Strict presentation boundary for the published, public catalog DTO.
// Prices, availability, publication and allergen declarations remain server-authoritative.
export type MenuItem = Readonly<{
 id:string;
 name:string;
 category:string;
 priceCents:number;
 available:boolean;
 allergens:readonly string[];
 description?:string;
 imageUrl?:string|null;
 options?:readonly CatalogOptionGroup[];
 extras?:readonly CatalogModifierValue[];
 discount?:CatalogDiscount|null;
 allergenDeclaration?:Readonly<Record<string,unknown>>;
}>;
export type CatalogModifierValue=Readonly<{id:string;name:string;priceCents:number;available:boolean;allergens:readonly string[]}>;
export type CatalogOptionGroup=Readonly<{id:string;name:string;values:readonly CatalogModifierValue[];required:boolean;maxSelections:number}>;
export type CatalogDiscount=Readonly<{type:'fixed';amountCents:number}|{type:'percent';basisPoints:number}>;
export type CatalogSelection=Readonly<{options:Readonly<Record<string,readonly string[]>>;extras:readonly string[]}>;

export type CatalogState =
 | Readonly<{status:'loading'}>
 | Readonly<{status:'error'; message:string}>
 | Readonly<{status:'ready'; items:readonly MenuItem[]}>;

export type CategoryFilter='Todos'|string;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const requiredFields=['id','name','category','priceCents','available','allergens'] as const;
const allowedFields=new Set([...requiredFields,'description','imageUrl','options','extras','discount','allergenDeclaration']);
const plain=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const safeText=(value:unknown,max:number)=>typeof value==='string'&&!!value.trim()&&
 [...value].length<=max&&!/[\u0000-\u001f\u007f]/u.test(value);

export function parsePublishedCatalog(payload:unknown):readonly MenuItem[]{
 if(!Array.isArray(payload)||payload.length>500)throw Error('invalid_catalog');
 const ids=new Set<string>();
 return payload.map((value:unknown)=>{
  if(!plain(value)||requiredFields.some(field=>!Object.hasOwn(value,field))||
     Reflect.ownKeys(value).some(key=>typeof key!=='string'||!allowedFields.has(key)))throw Error('invalid_catalog');
  const item=value;
  if(typeof item.id!=='string'||!uuid.test(item.id)||ids.has(item.id.toLowerCase())||
     !safeText(item.name,160)||!safeText(item.category,80)||(item.category as string).trim()==='Todos'||
     !Number.isSafeInteger(item.priceCents)||(item.priceCents as number)<0||
     typeof item.available!=='boolean'||!Array.isArray(item.allergens)||
     item.allergens.length>32||!item.allergens.every(allergen=>safeText(allergen,100))){
   throw Error('invalid_catalog');
  }
  if((item.description!==undefined&&(typeof item.description!=='string'||
      [...item.description].length>2000||/[\u0000-\u001f\u007f]/u.test(item.description)))||
     (item.imageUrl!==undefined&&item.imageUrl!==null&&
      (typeof item.imageUrl!=='string'||!item.imageUrl.startsWith('https://')||item.imageUrl.length>2048)))
   throw Error('invalid_catalog');
  ids.add(item.id.toLowerCase());
  const modifier=(candidate:unknown):CatalogModifierValue=>{
   if(!plain(candidate)||Reflect.ownKeys(candidate).length!==5||
      !['id','name','priceCents','available','allergens'].every(key=>Object.hasOwn(candidate,key))||
      typeof candidate.id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(candidate.id)||
      !safeText(candidate.name,100)||!Number.isSafeInteger(candidate.priceCents)||
      (candidate.priceCents as number)<0||typeof candidate.available!=='boolean'||
      !Array.isArray(candidate.allergens)||candidate.allergens.length>32||
      !candidate.allergens.every(a=>safeText(a,100)))throw Error('invalid_catalog');
   return Object.freeze({id:candidate.id,name:(candidate.name as string).trim(),
    priceCents:candidate.priceCents as number,available:candidate.available,
    allergens:Object.freeze((candidate.allergens as string[]).map(a=>a.trim()))});
  };
  const options=item.options===undefined?undefined:(()=>{
   if(!Array.isArray(item.options)||item.options.length>32)throw Error('invalid_catalog');
   return Object.freeze(item.options.map(group=>{
    if(!plain(group)||Reflect.ownKeys(group).length!==5||
       !['id','name','values','required','maxSelections'].every(key=>Object.hasOwn(group,key))||
       typeof group.id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(group.id)||!safeText(group.name,100)||
       typeof group.required!=='boolean'||!Number.isSafeInteger(group.maxSelections)||
       (group.maxSelections as number)<1||(group.maxSelections as number)>20||
       !Array.isArray(group.values)||group.values.length<1||group.values.length>20||
       (group.maxSelections as number)>group.values.length)throw Error('invalid_catalog');
    return Object.freeze({id:group.id,name:(group.name as string).trim(),required:group.required,
     maxSelections:group.maxSelections as number,values:Object.freeze(group.values.map(modifier))});
   }));
  })();
  const extras=item.extras===undefined?undefined:(()=>{if(!Array.isArray(item.extras)||item.extras.length>50)
   throw Error('invalid_catalog');return Object.freeze(item.extras.map(modifier));})();
  let discount:CatalogDiscount|null|undefined;
  if(item.discount!==undefined){
   if(item.discount===null)discount=null;
   else if(plain(item.discount)&&item.discount.type==='fixed'&&Number.isSafeInteger(item.discount.amountCents)&&
     (item.discount.amountCents as number)>=0)discount=Object.freeze({type:'fixed',amountCents:item.discount.amountCents as number});
   else if(plain(item.discount)&&item.discount.type==='percent'&&Number.isSafeInteger(item.discount.basisPoints)&&
     (item.discount.basisPoints as number)>=0&&(item.discount.basisPoints as number)<=10000)
    discount=Object.freeze({type:'percent',basisPoints:item.discount.basisPoints as number});
   else throw Error('invalid_catalog');
  }
  let allergenDeclaration:Readonly<{status:'VERIFICADA';taxonomyVersion:1;ids:readonly number[]}>|undefined;
  if(item.allergenDeclaration!==undefined){
   const declaration=item.allergenDeclaration;
   if(!plain(declaration)||Reflect.ownKeys(declaration).length!==3||
      !['status','taxonomyVersion','ids'].every(key=>Object.hasOwn(declaration,key))||
      declaration.status!=='VERIFICADA'||declaration.taxonomyVersion!==1||
      !Array.isArray(declaration.ids)||declaration.ids.length>14||
      !declaration.ids.every(id=>Number.isSafeInteger(id)&&id>=1&&id<=14)||
      new Set(declaration.ids).size!==declaration.ids.length)throw Error('invalid_catalog');
   allergenDeclaration=Object.freeze({status:'VERIFICADA',taxonomyVersion:1,
    ids:Object.freeze([...declaration.ids] as number[])});
  }
  return Object.freeze({
   id:item.id,
   name:(item.name as string).trim(),
   category:(item.category as string).trim(),
   priceCents:item.priceCents as number,
   available:item.available,
   allergens:Object.freeze((item.allergens as string[]).map(value=>value.trim())),
   ...(item.description===undefined?{}:{description:typeof item.description==='string'?item.description:''}),
   ...(item.imageUrl===undefined?{}:{imageUrl:item.imageUrl===null?null:String(item.imageUrl)}),
   ...(options===undefined?{}:{options}),...(extras===undefined?{}:{extras}),
   ...(discount===undefined?{}:{discount}),
   ...(allergenDeclaration===undefined?{}:{allergenDeclaration})
  });
 });
}

export function catalogUnitPrice(item:MenuItem,selection:CatalogSelection):number{
 if(!plain(selection)||!plain(selection.options)||!Array.isArray(selection.extras)||
    new Set(selection.extras).size!==selection.extras.length)throw Error('invalid_catalog_selection');
 let subtotal=item.priceCents;
 const add=(value:CatalogModifierValue)=>{if(!value.available||subtotal>Number.MAX_SAFE_INTEGER-value.priceCents)
  throw Error('invalid_catalog_selection');subtotal+=value.priceCents;};
 for(const group of item.options??[]){
  const ids=selection.options[group.id]??[];
  if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.length>group.maxSelections||
     (group.required&&ids.length===0))throw Error('invalid_catalog_selection');
  for(const id of ids){const value=group.values.find(v=>v.id===id);if(!value)throw Error('invalid_catalog_selection');add(value);}
 }
 if(Object.keys(selection.options).some(id=>!(item.options??[]).some(group=>group.id===id)))throw Error('invalid_catalog_selection');
 for(const id of selection.extras){const value=(item.extras??[]).find(v=>v.id===id);if(!value)throw Error('invalid_catalog_selection');add(value);}
 const discount=item.discount??null;
 if(discount?.type==='fixed')subtotal=Math.max(0,subtotal-discount.amountCents);
 if(discount?.type==='percent')subtotal-=Number((BigInt(subtotal)*BigInt(discount.basisPoints)+5000n)/10000n);
 return subtotal;
}

// Category order is the order first supplied by the server projection. Empty
// categories are therefore never invented by the browser; sold-out categories
// remain because sold-out products remain in the published DTO.
export function categoriesFor(items:readonly MenuItem[]):readonly string[]{
 return Object.freeze(['Todos',...new Set(items.map(item=>item.category))]);
}

export function filterCatalog(items:readonly MenuItem[],category:CategoryFilter){
 return category==='Todos'?items:items.filter(item=>item.category===category);
}

export function formatPrice(priceCents:number,locale='es-ES'){
 return new Intl.NumberFormat(locale,{style:'currency',currency:'EUR'}).format(priceCents/100);
}

const normalize=(value:string)=>value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-ES');
export function searchPublishedCatalog(items:readonly MenuItem[],category:CategoryFilter,search:string,onlyAvailable=false):readonly MenuItem[]{
 const normalized=normalize(search);
 return filterCatalog(items,category).filter(item=>(!onlyAvailable||item.available)&&
  (!normalized||[item.name,item.category,...item.allergens].some(value=>normalize(value).includes(normalized))));
}
