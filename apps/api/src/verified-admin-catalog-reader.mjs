// Read-only published catalog projection for authenticated management UI.
// The injected reader MUST be the separately provisioned restricted catalog RPC
// adapter, never an administrative or service-role pool. No draft visibility.
export function createVerifiedAdminCatalogReader({readPublishedCatalog}={}){
 if(typeof readPublishedCatalog!=='function')
  throw Error('invalid_admin_catalog_reader');
 return Object.freeze({
  async listPublished(request){
   const identity=request?.verifiedIdentity;
   const staff=request?.verifiedStaff;
   if(!identity||typeof identity.userId!=='string'||
      !staff||staff.userId!==identity.userId||staff.role!=='admin')
    throw Error('admin_catalog_forbidden');
   const items=await readPublishedCatalog();
   if(!Array.isArray(items)||items.length>500||
      items.some(item=>!item||typeof item!=='object'||Array.isArray(item)||
       typeof item.id!=='string'||typeof item.name!=='string'||
       !Number.isSafeInteger(item.priceCents)||item.priceCents<0||
       typeof item.available!=='boolean'||!Array.isArray(item.allergens)))
    throw Error('invalid_admin_catalog_response');
   return Object.freeze({version:1,scope:'published',items});
  }
 });
}
