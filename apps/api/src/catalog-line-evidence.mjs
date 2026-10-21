// Candidate immutable economic evidence builder. Pure and deliberately disconnected
// from order confirmation and persistence. The caller must supply a trusted
// published catalog snapshot/revision and an authenticated order context.
import {quoteCatalogSelection} from './catalog-selection-quote.mjs';

const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const revision=value=>Number.isSafeInteger(value)&&value>0;
const cents=value=>Number.isSafeInteger(value)&&value>=0;
const clone=value=>JSON.parse(JSON.stringify(value));
const freezeDeep=value=>{
 if(value&&typeof value==='object'){
  for(const child of Object.values(value))freezeDeep(child);
  Object.freeze(value);
 }
 return value;
};

export function buildCatalogLineEvidence({itemId,publishedRevision,snapshot,selection,quantity=1}={}){
 if(!uuid(itemId)||!revision(publishedRevision)||!plain(snapshot)||!plain(selection)||
    typeof snapshot.name!=='string'||!snapshot.name.trim()||
    [...snapshot.name].length>160||/[\u0000-\u001f\u007f]/u.test(snapshot.name)||
    !['Bebidas','Primeros','Segundos','Postres'].includes(snapshot.category)||
    !Array.isArray(snapshot.allergens)||snapshot.allergens.length>32||
    !snapshot.allergens.every(a=>typeof a==='string'&&!!a.trim()&&[...a].length<=100&&
     !/[\u0000-\u001f\u007f]/u.test(a)))
  throw Error('invalid_catalog_evidence');
 const quote=quoteCatalogSelection({snapshot,selection,quantity});
 if(!cents(quote.totalCents)||!cents(quote.subtotalCents)||!cents(quote.discountCents))
  throw Error('invalid_catalog_evidence');
 // Capture the exact validated economic inputs. A future order writer must
 // persist this within the same transaction that locks/checks the revision.
 const evidence={
  schemaVersion:1,
  itemId:itemId.toLowerCase(),
  publishedRevision,
  itemName:snapshot.name.trim(),
  category:snapshot.category,
  quantity,
  basePriceCents:quote.basePriceCents,
  selected:quote.selected.map(entry=>({
   id:entry.id,name:entry.name,priceCents:entry.priceCents,allergens:[...entry.allergens]
  })),
  allergens:[...quote.allergens],
  discount:quote.discount===null?null:clone(quote.discount),
  unitSubtotalCents:quote.unitSubtotalCents,
  unitDiscountCents:quote.unitDiscountCents,
  subtotalCents:quote.subtotalCents,
  discountCents:quote.discountCents,
  totalCents:quote.totalCents
 };
 return freezeDeep(evidence);
}

export function validateCatalogLineEvidence(value){
 if(!plain(value))return false;
 const allowed=['schemaVersion','itemId','publishedRevision','itemName','category','quantity',
  'basePriceCents','selected','allergens','discount','unitSubtotalCents','unitDiscountCents',
  'subtotalCents','discountCents','totalCents'];
 if(Object.keys(value).length!==allowed.length||allowed.some(key=>!own(value,key)))return false;
 try{
  if(value.schemaVersion!==1||!uuid(value.itemId)||!revision(value.publishedRevision)||
     !Number.isSafeInteger(value.quantity)||value.quantity<1||value.quantity>20||
     !Array.isArray(value.selected)||value.selected.length>50||
     !Array.isArray(value.allergens)||value.allergens.length>32||
     !value.allergens.every(a=>typeof a==='string'&&a.trim().length>0&&[...a].length<=100)||
     !allowed.slice(9).filter(key=>key.endsWith('Cents')).every(key=>cents(value[key])))
   return false;
  // Rebuild and compare every economic field; no acceptance of caller-provided totals.
  const snapshot={
   name:value.itemName,category:value.category,priceCents:value.basePriceCents,
   allergens:value.allergens,extras:value.selected.map(entry=>({...entry,available:true})),
   options:[],discount:value.discount
  };
  const selection={extras:value.selected.map(entry=>entry.id)};
  const rebuilt=buildCatalogLineEvidence({
   itemId:value.itemId,publishedRevision:value.publishedRevision,
   snapshot,selection,quantity:value.quantity
  });
  return rebuilt.unitSubtotalCents===value.unitSubtotalCents&&
   rebuilt.unitDiscountCents===value.unitDiscountCents&&
   rebuilt.subtotalCents===value.subtotalCents&&
   rebuilt.discountCents===value.discountCents&&rebuilt.totalCents===value.totalCents;
 }catch{return false;}
}
