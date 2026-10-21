// Pure presentation boundary. This module does not fetch or authenticate.
// Server publication, prices, discounts and stock are authoritative.
export type Category = 'Bebidas' | 'Primeros' | 'Segundos' | 'Postres';
export type MenuItem = Readonly<{
 id:string; name:string; category:Category; priceCents:number;
 available:boolean; allergens:readonly string[];
}>;
export type CatalogState =
 | Readonly<{status:'loading'}>
 | Readonly<{status:'error'; message:string}>
 | Readonly<{status:'ready'; items:readonly MenuItem[]}>;
export const categories=['Todos','Bebidas','Primeros','Segundos','Postres'] as const;
export type CategoryFilter=typeof categories[number];
const validCategories=new Set<string>(categories.slice(1));
export function parsePublishedCatalog(payload:unknown):readonly MenuItem[]{
 if(!Array.isArray(payload) || payload.length>500)throw Error('invalid_catalog');
 const ids=new Set<string>();
 return payload.map((value:unknown)=>{
  if(!value || typeof value!=='object' || Array.isArray(value))throw Error('invalid_catalog');
  const item=value as Record<string,unknown>;
  if(typeof item.id!=='string' || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(item.id) || ids.has(item.id) ||
     typeof item.name!=='string' || !item.name.trim() || item.name.length>160 ||
     !validCategories.has(String(item.category)) ||
     !Number.isSafeInteger(item.priceCents) || (item.priceCents as number)<0 ||
     typeof item.available!=='boolean' || !Array.isArray(item.allergens) ||
     item.allergens.length>32 || !item.allergens.every((a:unknown)=>typeof a==='string' && a.length<=100)){
   throw Error('invalid_catalog');
  }
  ids.add(item.id);
  return {id:item.id,name:item.name.trim(),category:item.category as Category,
   priceCents:item.priceCents as number,available:item.available,
   allergens:[...item.allergens] as string[]};
 });
}
export function filterCatalog(items:readonly MenuItem[],category:CategoryFilter){
 return category==='Todos'?items:items.filter(item=>item.category===category);
}
export function formatPrice(priceCents:number){
 return new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(priceCents/100);
}
