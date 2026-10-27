import {createHmac,timingSafeEqual} from 'node:crypto';

const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const canonical=value=>{
 if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
 if(plain(value))return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
 if(value===null||typeof value==='string'||typeof value==='boolean'||Number.isSafeInteger(value))
  return JSON.stringify(value);
 throw Error('invalid_customer_basket_acceptance');
};
const hmac=(key,value)=>createHmac('sha256',key).update(value).digest('hex');
const validSecret=value=>typeof value==='string'&&Buffer.byteLength(value,'utf8')>=32;
const validContext=value=>plain(value)&&Buffer.byteLength(canonical(value),'utf8')<=65536;

export function issueCustomerBasketAcceptance({secretKey,context,nowMs,ttlSeconds=300}={}){
 if(!validSecret(secretKey)||!validContext(context)||!Number.isSafeInteger(nowMs)||nowMs<0||
    !Number.isSafeInteger(ttlSeconds)||ttlSeconds<1||ttlSeconds>600)
  throw Error('invalid_customer_basket_acceptance');
 const expiresAt=nowMs+ttlSeconds*1000;
 if(!Number.isSafeInteger(expiresAt))throw Error('invalid_customer_basket_acceptance');
 const fingerprint=hmac('sabora-basket-reprice-v1-public-fingerprint',canonical(context));
 const body=`bv1.${expiresAt}.${fingerprint}`;
 return Object.freeze({token:`${body}.${hmac(secretKey,body)}`,expiresAt});
}

export function verifyCustomerBasketAcceptance({token,secretKey,context,nowMs}={}){
 if(!validSecret(secretKey)||!validContext(context)||!Number.isSafeInteger(nowMs)||nowMs<0||
    typeof token!=='string'||token.length>256)return false;
 const match=/^bv1\.([0-9]{1,16})\.([a-f0-9]{64})\.([a-f0-9]{64})$/.exec(token);
 if(!match)return false;
 const expiresAt=Number(match[1]);
 if(!Number.isSafeInteger(expiresAt)||nowMs>expiresAt||expiresAt-nowMs>600000)return false;
 const body=`bv1.${match[1]}.${match[2]}`;
 const expected=Buffer.from(hmac(secretKey,body),'hex');
 const received=Buffer.from(match[3],'hex');
 if(expected.length!==received.length||!timingSafeEqual(expected,received))return false;
 return hmac('sabora-basket-reprice-v1-public-fingerprint',canonical(context))===match[2];
}
