// Internal catalog read boundary. This module does not register public routes.
// Query source must be a trusted, server-owned PostgreSQL client.
export const PUBLISHED_CATALOG_SQL = `
SELECT id, name, category, price_cents, available, allergens
FROM sabora.published_catalog_items
WHERE published = TRUE AND withdrawn = FALSE
ORDER BY category, name, id
LIMIT 501
`;

// Do not trust a caller-supplied visibility flag: this boundary deliberately
// never accepts a category, publication state or SQL fragment as input.
export function createPublishedCatalogReader({query}={}){
 if(typeof query!=='function')throw Error('invalid_catalog_query');
 return async function readPublishedCatalog(){
  const result=await query(PUBLISHED_CATALOG_SQL,[]);
  if(!result || !Array.isArray(result.rows) || result.rows.length>500)throw Error('invalid_catalog_result');
  return result.rows.map(row=>{
   if(!row || typeof row!=='object' || typeof row.id!=='string' ||
      typeof row.name!=='string' || typeof row.category!=='string' ||
      !Number.isSafeInteger(row.price_cents) || row.price_cents<0 ||
      typeof row.available!=='boolean' || !Array.isArray(row.allergens))throw Error('invalid_catalog_result');
   return {id:row.id,name:row.name,category:row.category,
    priceCents:row.price_cents,available:row.available,allergens:[...row.allergens]};
  });
 };
}
