// Candidate catalog economic snapshot validation. Pure and not wired to publication.
// The current SQL publication guard remains the authoritative fail-closed gate.
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const keys=(value,allowed)=>Object.keys(value).every(key=>allowed.includes(key));
const label=value=>typeof value==='string'&&value.trim().length>0&&
 [...value].length<=100&&!/[\u0000-\u001f\u007f]/u.test(value);
const cents=value=>Number.isSafeInteger(value)&&value>=0&&value<=999999999999999;
const uniqueIds=items=>items.every(item=>plain(item)&&identifier(item.id))&&
 new Set(items.map(item=>item.id)).size===items.length;
const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(value);

export function validateEconomicModifiers(snapshot){
 if(!plain(snapshot))return false;
 const {options=[],extras=[],discount=null}=snapshot;
 if(!Array.isArray(options)||options.length>32||!Array.isArray(extras)||extras.length>50)return false;
 if(!options.every(option=>plain(option)&&keys(option,['id','name','values','required','maxSelections'])&&
   identifier(option.id)&&label(option.name)&&typeof option.required==='boolean'&&
   Number.isSafeInteger(option.maxSelections)&&option.maxSelections>=1&&option.maxSelections<=20&&
   Array.isArray(option.values)&&option.values.length>=1&&option.values.length<=20&&
   option.maxSelections<=option.values.length&&uniqueIds(option.values)&&
   option.values.every(value=>plain(value)&&keys(value,['id','name','priceCents','available','allergens'])&&
     identifier(value.id)&&label(value.name)&&cents(value.priceCents)&&
     typeof value.available==='boolean'&&Array.isArray(value.allergens)&&value.allergens.length<=32&&
     value.allergens.every(label))))return false;
 if(!uniqueIds(options)||!uniqueIds(extras))return false;
 if(!extras.every(extra=>plain(extra)&&keys(extra,['id','name','priceCents','available','allergens'])&&
   identifier(extra.id)&&label(extra.name)&&cents(extra.priceCents)&&
   typeof extra.available==='boolean'&&Array.isArray(extra.allergens)&&extra.allergens.length<=32&&
   extra.allergens.every(label)))return false;
 if(discount!==null&&(!plain(discount)||
  !(discount.type==='fixed'&&keys(discount,['type','amountCents'])&&cents(discount.amountCents)||
    discount.type==='percent'&&keys(discount,['type','basisPoints'])&&
    Number.isSafeInteger(discount.basisPoints)&&discount.basisPoints>=0&&discount.basisPoints<=10000)))return false;
 return true;
}
