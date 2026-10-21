// Pure integer-cent pricing for the server. Not mounted as an order endpoint.
// Discount applies to base plus selected extras, per approved functional contract.
export function priceCatalogLine({basePriceCents,extras=[],quantity=1,discount=null}){
 if(!Number.isSafeInteger(basePriceCents)||basePriceCents<0||
    !Number.isSafeInteger(quantity)||quantity<1||quantity>20||
    !Array.isArray(extras)||extras.length>50||
    extras.some(v=>!Number.isSafeInteger(v)||v<0))throw Error('invalid_catalog_price');
 // Reject overflow during accumulation rather than relying on the final sum.
 // This keeps every intermediate monetary amount inside safe integer cents.
 let extrasCents=0;
 for(const extra of extras){
  if(extra>Number.MAX_SAFE_INTEGER-extrasCents)throw Error('invalid_catalog_price');
  extrasCents+=extra;
 }
 if(basePriceCents>Number.MAX_SAFE_INTEGER-extrasCents)throw Error('invalid_catalog_price');
 const unitSubtotal=basePriceCents+extrasCents;
 if(!Number.isSafeInteger(unitSubtotal))throw Error('invalid_catalog_price');
 let unitDiscount=0;
 if(discount!==null){
  if(!discount||typeof discount!=='object'||Array.isArray(discount))throw Error('invalid_catalog_discount');
  if(discount.type==='fixed'){
   if(!Number.isSafeInteger(discount.amountCents)||discount.amountCents<0)throw Error('invalid_catalog_discount');
   unitDiscount=Math.min(unitSubtotal,discount.amountCents);
  }else if(discount.type==='percent'){
   // Integer basis points: 10000 = 100%, rounding half up to the nearest cent.
   if(!Number.isSafeInteger(discount.basisPoints)||discount.basisPoints<0||discount.basisPoints>10000)
    throw Error('invalid_catalog_discount');
   const product=unitSubtotal*discount.basisPoints;
   if(!Number.isSafeInteger(product))throw Error('invalid_catalog_price');
   unitDiscount=Math.floor((product+5000)/10000);
  }else throw Error('invalid_catalog_discount');
 }
 const totalCents=(unitSubtotal-unitDiscount)*quantity;
 const subtotalCents=unitSubtotal*quantity;
 const discountCents=unitDiscount*quantity;
 if(![totalCents,subtotalCents,discountCents].every(Number.isSafeInteger))throw Error('invalid_catalog_price');
 return Object.freeze({unitSubtotalCents:unitSubtotal,unitDiscountCents:unitDiscount,
  subtotalCents,discountCents,totalCents,quantity});
}
