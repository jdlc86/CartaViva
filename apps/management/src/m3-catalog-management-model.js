const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL=/[\u0000-\u001f\u007f]/u;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&
 [...value].length<=max&&!CONTROL.test(value);
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&
 keys.every(key=>{
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  return !!descriptor&&descriptor.enumerable===true&&Object.hasOwn(descriptor,'value');
 });
const revision=value=>Number.isSafeInteger(value)&&value>=0;

export function validateM3ManagementCatalog(payload){
 if(!exact(payload,['version','scope','categories','items','allergenTaxonomyVersion','allergens','permissions'])||
    payload.version!==2||payload.scope!=='administrative'||payload.allergenTaxonomyVersion!==1||
    !Array.isArray(payload.categories)||payload.categories.length>500||
    !Array.isArray(payload.items)||payload.items.length>500||
    !Array.isArray(payload.allergens)||payload.allergens.length!==14||
    !exact(payload.permissions,['manage'])||typeof payload.permissions.manage!=='boolean')
  throw Error('invalid_m3_management_catalog');
 const categoryIds=new Set();
 const categories=payload.categories.map(value=>{
  if(!exact(value,['id','name','sortOrder','mandatory','hidden','revision'])||
     typeof value.id!=='string'||!UUID.test(value.id)||categoryIds.has(value.id.toLowerCase())||
     !text(value.name,80)||value.name!==value.name.trim()||
     !Number.isSafeInteger(value.sortOrder)||value.sortOrder<1||value.sortOrder>10000||
     typeof value.mandatory!=='boolean'||typeof value.hidden!=='boolean'||
     !Number.isSafeInteger(value.revision)||value.revision<1)
   throw Error('invalid_m3_management_catalog');
  categoryIds.add(value.id.toLowerCase());return Object.freeze({...value});
 });
 const taxonomyIds=new Set();
 const allergens=payload.allergens.map(value=>{
  if(!exact(value,['id','name'])||!Number.isSafeInteger(value.id)||value.id<1||value.id>14||
     taxonomyIds.has(value.id)||!text(value.name,100))throw Error('invalid_m3_management_catalog');
  taxonomyIds.add(value.id);return Object.freeze({...value});
 });
 const itemIds=new Set();
 const items=payload.items.map(value=>{
  if(!exact(value,['id','categoryId','draft','draftRevision','publishedRevision','publishedSnapshot',
      'publishedAt','withdrawn','soldOut'])||typeof value.id!=='string'||!UUID.test(value.id)||
     itemIds.has(value.id.toLowerCase())||(value.categoryId!==null&&
      (typeof value.categoryId!=='string'||!UUID.test(value.categoryId)||
       !categoryIds.has(value.categoryId.toLowerCase())))||!plain(value.draft)||
     !revision(value.draftRevision)||(value.publishedRevision!==null&&
      (!Number.isSafeInteger(value.publishedRevision)||value.publishedRevision<1))||
     (value.publishedSnapshot!==null&&!plain(value.publishedSnapshot))||
     (value.publishedAt!==null&&(typeof value.publishedAt!=='string'||Number.isNaN(Date.parse(value.publishedAt))))||
     typeof value.withdrawn!=='boolean'||typeof value.soldOut!=='boolean')
   throw Error('invalid_m3_management_catalog');
  itemIds.add(value.id.toLowerCase());
  return Object.freeze({...value,draft:Object.freeze({...value.draft}),
   publishedSnapshot:value.publishedSnapshot===null?null:Object.freeze({...value.publishedSnapshot})});
 });
 return Object.freeze({version:2,scope:'administrative',categories:Object.freeze(categories),
  items:Object.freeze(items),allergenTaxonomyVersion:1,allergens:Object.freeze(allergens),
  permissions:Object.freeze({manage:payload.permissions.manage})});
}

export async function loadM3ManagementCatalog(gateway,{signal}={}){
 if(!gateway||typeof gateway.readManagementCatalog!=='function')
  throw Error('m3_management_catalog_unavailable');
 return validateM3ManagementCatalog(await gateway.readManagementCatalog({signal}));
}

export function catalogDraftFromForm({name,description='',imageUrl=null,priceCents,
 allergenIds=[],allergenStatus='PENDIENTE_DE_VERIFICAR',options=[],extras=[],discount=null}={}){
 if(!text(name,160)||typeof description!=='string'||description.length>2000||CONTROL.test(description)||
    (imageUrl!==null&&(typeof imageUrl!=='string'||!imageUrl.startsWith('https://')||imageUrl.length>2048))||
    !Number.isSafeInteger(priceCents)||priceCents<0||priceCents>999999999999999||
    !Array.isArray(allergenIds)||allergenIds.length>14||new Set(allergenIds).size!==allergenIds.length||
    allergenIds.some(id=>!Number.isSafeInteger(id)||id<1||id>14)||
    !['PENDIENTE_DE_VERIFICAR','VERIFICADA'].includes(allergenStatus)||
    !Array.isArray(options)||!Array.isArray(extras))throw Error('invalid_m3_catalog_draft');
 return Object.freeze({name:name.trim(),description,imageUrl,priceCents,
  allergenIds:Object.freeze([...allergenIds]),allergenStatus,
  options:Object.freeze(options.map(value=>Object.freeze({...value}))),
  extras:Object.freeze(extras.map(value=>Object.freeze({...value}))),
  discount:discount===null?null:Object.freeze({...discount})});
}
