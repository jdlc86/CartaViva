import {validateEconomicModifiers} from './catalog-economic-modifiers.mjs';
// Pure server-side projection of persisted publication rows.
// Does not query the database or expose draft fields.
export function projectPublishedCatalog(rows){
 if(!Array.isArray(rows)||rows.length>500)throw Error('invalid_catalog_rows');
 const seen=new Set();
 return rows.flatMap(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('invalid_catalog_row');
  if(row.published_snapshot===null||row.published_snapshot===undefined||row.withdrawn_at!==null&&row.withdrawn_at!==undefined)return [];
  const snapshot=row.published_snapshot;
  const declaration=snapshot?.allergenDeclaration;
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||
     typeof row.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id)||
     seen.has(row.id.toLowerCase())||
     typeof snapshot.name!=='string'||!snapshot.name.trim()||[...snapshot.name].length>160||/[\u0000-\u001f\u007f]/u.test(snapshot.name)||
     typeof snapshot.category!=='string'||!snapshot.category.trim()||
     [...snapshot.category].length>80||snapshot.category.trim()==='Todos'||
     /[\u0000-\u001f\u007f]/u.test(snapshot.category)||
     !Number.isSafeInteger(snapshot.priceCents)||snapshot.priceCents<0||
     !validateEconomicModifiers(snapshot)||
     (snapshot.description!==undefined&&(typeof snapshot.description!=='string'||
       [...snapshot.description].length>2000||/[\u0000-\u001f\u007f]/u.test(snapshot.description)))||
     (snapshot.imageUrl!==undefined&&snapshot.imageUrl!==null&&
       (typeof snapshot.imageUrl!=='string'||!snapshot.imageUrl.startsWith('https://')||
        snapshot.imageUrl.length>2048))||
     (declaration!==undefined&&(!declaration||typeof declaration!=='object'||Array.isArray(declaration)||
       declaration.status!=='VERIFICADA'||declaration.taxonomyVersion!==1||
       !Array.isArray(declaration.ids)||declaration.ids.length>14||
       declaration.ids.some(id=>!Number.isSafeInteger(id)||id<1||id>14)||
       new Set(declaration.ids).size!==declaration.ids.length))||
     !Array.isArray(snapshot.allergens)||snapshot.allergens.length>32||
     !snapshot.allergens.every(a=>typeof a==='string'&&!!a.trim()&&[...a].length<=100&&!/[\u0000-\u001f\u007f]/u.test(a))||
     typeof row.sold_out!=='boolean')throw Error('invalid_catalog_row');
  seen.add(row.id.toLowerCase());
  const item={id:row.id,name:snapshot.name.trim(),category:snapshot.category.trim(),
   priceCents:snapshot.priceCents,available:!row.sold_out,allergens:[...snapshot.allergens]};
  if(snapshot.description!==undefined)item.description=snapshot.description;
  if(snapshot.imageUrl!==undefined)item.imageUrl=snapshot.imageUrl;
  if(snapshot.options!==undefined)item.options=structuredClone(snapshot.options);
  if(snapshot.extras!==undefined)item.extras=structuredClone(snapshot.extras);
  if(snapshot.discount!==undefined)item.discount=snapshot.discount===null?null:structuredClone(snapshot.discount);
  if(declaration!==undefined)item.allergenDeclaration=Object.freeze({status:'VERIFICADA',
   taxonomyVersion:1,ids:Object.freeze([...declaration.ids])});
  return [item];
 });
}
