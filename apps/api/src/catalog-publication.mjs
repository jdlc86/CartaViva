// Pure server-side projection of persisted publication rows.
// Does not query the database or expose draft fields.
const categories=new Set(['Bebidas','Primeros','Segundos','Postres']);
export function projectPublishedCatalog(rows){
 if(!Array.isArray(rows)||rows.length>500)throw Error('invalid_catalog_rows');
 const seen=new Set();
 return rows.flatMap(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('invalid_catalog_row');
  if(row.published_snapshot===null||row.published_snapshot===undefined||row.withdrawn_at!==null&&row.withdrawn_at!==undefined)return [];
  const snapshot=row.published_snapshot;
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||
     typeof row.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id)||
     seen.has(row.id.toLowerCase())||
     typeof snapshot.name!=='string'||!snapshot.name.trim()||[...snapshot.name].length>160||/[\u0000-\u001f\u007f]/u.test(snapshot.name)||
     !categories.has(snapshot.category)||
     !Number.isSafeInteger(snapshot.priceCents)||snapshot.priceCents<0||
     // The current public DTO has no modifiers or discount breakdown.
     // Never silently drop nonempty economic rules from a published snapshot.
     (snapshot.options!==undefined&&(!Array.isArray(snapshot.options)||snapshot.options.length!==0))||
     (snapshot.extras!==undefined&&(!Array.isArray(snapshot.extras)||snapshot.extras.length!==0))||
     (snapshot.discount!==undefined&&snapshot.discount!==null)||
     !Array.isArray(snapshot.allergens)||snapshot.allergens.length>32||
     !snapshot.allergens.every(a=>typeof a==='string'&&!!a.trim()&&[...a].length<=100&&!/[\u0000-\u001f\u007f]/u.test(a))||
     typeof row.sold_out!=='boolean')throw Error('invalid_catalog_row');
  seen.add(row.id.toLowerCase());
  return [{id:row.id,name:snapshot.name.trim(),category:snapshot.category,
   priceCents:snapshot.priceCents,available:!row.sold_out,allergens:[...snapshot.allergens]}];
 });
}
