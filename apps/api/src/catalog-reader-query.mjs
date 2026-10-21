// Restricted catalog RPC adapter; accepts an injected, dedicated reader client.
// Never use an administrative pool or interpolate SQL identifiers.
import {projectPublishedCatalog} from './catalog-publication.mjs';
const SQL='SELECT id,published_snapshot,sold_out FROM sabora.read_published_catalog()';
export function createCatalogReaderSql(){return SQL;}
export async function readPublishedCatalog(query){
 if(typeof query!=='function')throw Error('catalog_reader_unavailable');
 const result=await query(SQL,[]);
 if(!result||!Array.isArray(result.rows))throw Error('invalid_catalog_rows');
 // This RPC must return published rows only. A null snapshot is a broken
 // reader contract, not a draft row to silently omit.
 if(result.rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)||
    row.published_snapshot===null||row.published_snapshot===undefined))
  throw Error('invalid_catalog_row');
 return projectPublishedCatalog(result.rows.map(row=>({...row,withdrawn_at:null})));
}
