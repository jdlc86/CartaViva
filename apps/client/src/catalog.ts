// Strict presentation boundary for the published, public catalog DTO.
// Prices, availability, publication and allergen declarations remain server-authoritative.
export type MenuItem = Readonly<{
 id:string;
 name:string;
 category:string;
 priceCents:number;
 available:boolean;
 allergens:readonly string[];
}>;

export type CatalogState =
 | Readonly<{status:'loading'}>
 | Readonly<{status:'error'; message:string}>
 | Readonly<{status:'ready'; items:readonly MenuItem[]}>;

export type CategoryFilter='Todos'|string;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields=['id','name','category','priceCents','available','allergens'] as const;
const plain=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const safeText=(value:unknown,max:number)=>typeof value==='string'&&!!value.trim()&&
 [...value].length<=max&&!/[\u0000-\u001f\u007f]/u.test(value);

export function parsePublishedCatalog(payload:unknown):readonly MenuItem[]{
 if(!Array.isArray(payload)||payload.length>500)throw Error('invalid_catalog');
 const ids=new Set<string>();
 return payload.map((value:unknown)=>{
  if(!plain(value)||Reflect.ownKeys(value).length!==fields.length||
     fields.some(field=>!Object.hasOwn(value,field)))throw Error('invalid_catalog');
  const item=value;
  if(typeof item.id!=='string'||!uuid.test(item.id)||ids.has(item.id.toLowerCase())||
     !safeText(item.name,160)||!safeText(item.category,80)||(item.category as string).trim()==='Todos'||
     !Number.isSafeInteger(item.priceCents)||(item.priceCents as number)<0||
     typeof item.available!=='boolean'||!Array.isArray(item.allergens)||
     item.allergens.length>32||!item.allergens.every(allergen=>safeText(allergen,100))){
   throw Error('invalid_catalog');
  }
  ids.add(item.id.toLowerCase());
  return Object.freeze({
   id:item.id,
   name:(item.name as string).trim(),
   category:(item.category as string).trim(),
   priceCents:item.priceCents as number,
   available:item.available,
   allergens:Object.freeze((item.allergens as string[]).map(value=>value.trim()))
  });
 });
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
