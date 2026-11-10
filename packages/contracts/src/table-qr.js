const RESTAURANT_CODE=/^[A-Z0-9][A-Z0-9_-]{2,31}$/;
const TABLE_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// A 32-byte unpadded Base64URL value is 43 characters. The final character
// has four significant bits, so only canonical encodings are accepted.
export const TABLE_QR_TOKEN_PATTERN=/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
export const TABLE_QR_PATH_PREFIX='/qr/v1/';
const MAX_PAYLOAD_LENGTH=512;

const loopback=hostname=>hostname==='localhost'||hostname==='127.0.0.1'||hostname==='[::1]';

function canonicalOrigin(value,{allowInsecureLoopback=false}={}){
 if(typeof value!=='string'||value.length<1||value.length>255)throw Error('invalid_table_qr_origin');
 let url;
 try{url=new URL(value);}catch{throw Error('invalid_table_qr_origin');}
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||
    (url.protocol!=='https:'&&!(allowInsecureLoopback&&url.protocol==='http:'&&loopback(url.hostname))))
  throw Error('invalid_table_qr_origin');
 return url.origin;
}

function assertContractFields({restaurantCode,tableId,token}){
 if(typeof restaurantCode!=='string'||!RESTAURANT_CODE.test(restaurantCode)||
    typeof tableId!=='string'||!TABLE_ID.test(tableId)||
    typeof token!=='string'||!TABLE_QR_TOKEN_PATTERN.test(token))
  throw Error('invalid_table_qr_payload');
}

export function buildTableQrPayload({origin,restaurantCode,tableId,token,allowInsecureLoopback=false}={}){
 const expectedOrigin=canonicalOrigin(origin,{allowInsecureLoopback});
 assertContractFields({restaurantCode,tableId,token});
 const payload=`${expectedOrigin}${TABLE_QR_PATH_PREFIX}${restaurantCode}/${tableId}#${token}`;
 if(payload.length>MAX_PAYLOAD_LENGTH)throw Error('invalid_table_qr_payload');
 return payload;
}

export function parseTableQrPayload(payload,{expectedOrigin,expectedRestaurantCode,
 allowInsecureLoopback=false}={}){
 if(typeof payload!=='string'||payload.length<1||payload.length>MAX_PAYLOAD_LENGTH||
    typeof expectedRestaurantCode!=='string'||!RESTAURANT_CODE.test(expectedRestaurantCode))
  throw Error('invalid_table_qr_payload');
 const origin=canonicalOrigin(expectedOrigin,{allowInsecureLoopback});
 let url;
 try{url=new URL(payload);}catch{throw Error('invalid_table_qr_payload');}
 const protocolAllowed=url.protocol==='https:'||
  (allowInsecureLoopback&&url.protocol==='http:'&&loopback(url.hostname));
 if(url.origin!==origin||url.username||url.password||url.search||
    !protocolAllowed)
  throw Error('invalid_table_qr_payload');
 const pathPattern=/^\/qr\/v1\/([A-Z0-9][A-Z0-9_-]{2,31})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
 const match=pathPattern.exec(url.pathname);
 const token=url.hash.startsWith('#')?url.hash.slice(1):'';
 if(!match||match[1]!==expectedRestaurantCode)throw Error('invalid_table_qr_payload');
 const result={restaurantCode:match[1],tableId:match[2],token};
 assertContractFields(result);
 // Reject percent-encoding, default-port aliases and every other non-canonical
 // spelling so the same credential has one byte representation.
 if(payload!==buildTableQrPayload({origin,restaurantCode:result.restaurantCode,
   tableId:result.tableId,token:result.token,allowInsecureLoopback}))
  throw Error('invalid_table_qr_payload');
 return Object.freeze(result);
}
