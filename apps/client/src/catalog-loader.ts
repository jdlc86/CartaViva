import {parsePublishedCatalog,type CatalogState} from './catalog';
// Same-origin only. No authentication, credentials, or direct Supabase access.
export async function loadPublishedCatalog(fetcher:typeof fetch=fetch,signal?:AbortSignal):Promise<CatalogState>{
 try{
  const response=await fetcher('/api/v1/catalog',{method:'GET',credentials:'omit',cache:'no-store',redirect:'error',signal});
  if(!response.ok||!response.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
   return {status:'error',message:'Inténtalo de nuevo más tarde.'};
  const payload:unknown=await response.json();
  return {status:'ready',items:parsePublishedCatalog(payload)};
 }catch{
  return {status:'error',message:'Inténtalo de nuevo más tarde.'};
 }
}
