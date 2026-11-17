// Only positive, exact PostgreSQL bigint cents enter the Stripe API.
export function safeProviderCents(value){
 if(typeof value==='number'&&Number.isSafeInteger(value)&&value>0)return value;
 if(typeof value==='string'&&/^[1-9][0-9]*$/.test(value)){
  const amount=BigInt(value);
  if(amount<=BigInt(Number.MAX_SAFE_INTEGER))return Number(amount);
 }
 throw Error('invalid_provider_amount');
}
export function providerMatchesMoney(result,expected){
 return Number.isSafeInteger(expected)&&expected>0&&
  Number.isSafeInteger(result?.amountCents)&&result.amountCents===expected&&
  result.currency==='eur';
}
