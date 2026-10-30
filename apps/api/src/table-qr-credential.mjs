import {createHash,randomBytes} from 'node:crypto';
import {buildTableQrPayload} from '../../../packages/contracts/src/index.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Server-side issuer primitive. The caller must persist tokenHash and render
// payload in the same authorized operation; token and payload are one-time
// secret material and must never be logged or returned by table read models.
export function createTableQrCredential({origin,restaurantCode,tableId,
 randomBytesImpl=randomBytes,allowInsecureLoopback=false}={}){
 if(typeof randomBytesImpl!=='function'||typeof tableId!=='string'||!UUID.test(tableId)||
    typeof allowInsecureLoopback!=='boolean')
  throw Error('invalid_table_qr_credential_input');
 let entropy;
 try{entropy=randomBytesImpl(32);}catch{throw Error('table_qr_entropy_unavailable');}
 if(!(entropy instanceof Uint8Array)||entropy.byteLength!==32)
  throw Error('table_qr_entropy_unavailable');
 const token=Buffer.from(entropy).toString('base64url');
 let payload;
 try{payload=buildTableQrPayload({origin,restaurantCode,tableId,token,allowInsecureLoopback});}
 catch{throw Error('invalid_table_qr_credential_input');}
 const tokenHash=createHash('sha256').update(token,'utf8').digest();
 return Object.freeze({tableId,token,payload,tokenHash});
}
