import {parseTableQrPayload,type TableQrCredential} from '../../../packages/contracts/src/index.js';

export type {TableQrCredential};
export type InitialTableQr=Readonly<{status:'valid';credential:TableQrCredential}>|
 Readonly<{status:'invalid'}>|null;

const pathIsQr=(pathname:string)=>pathname.startsWith('/qr/');
const RESTAURANT_CODE=/^[A-Z0-9][A-Z0-9_-]{2,31}$/;

export function configuredRestaurantCode():string{
 const value=import.meta.env.VITE_SABORA_RESTAURANT_CODE;
 if(typeof value!=='string'||!RESTAURANT_CODE.test(value))throw Error('invalid_client_public_config');
 return value;
}

export function parseScannedTableQr(payload:string):TableQrCredential{
 return parseTableQrPayload(payload,{
  expectedOrigin:window.location.origin,
  expectedRestaurantCode:configuredRestaurantCode(),
  allowInsecureLoopback:import.meta.env.DEV||['localhost','127.0.0.1','[::1]'].includes(window.location.hostname)
 });
}

// Runs before React mounts. Every recognized QR path is scrubbed immediately,
// valid or not, so the bearer fragment does not remain in browser history.
export function consumeInitialTableQr(location:Pick<Location,'href'|'pathname'>=window.location,
 history:Pick<History,'replaceState'>=window.history):InitialTableQr{
 if(!pathIsQr(location.pathname))return null;
 try{return Object.freeze({status:'valid' as const,credential:parseScannedTableQr(location.href)});}
 catch{return Object.freeze({status:'invalid' as const});}
 finally{history.replaceState(null,'','/');}
}
