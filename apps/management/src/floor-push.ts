import {StaffAuthenticationError} from './staff-passkey';

const PATH='/api/v1/operations/floor-push';

export function supportsFloorPush(){
 return window.isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
}

export async function readFloorPushKey(send:typeof fetch){
 const response=await send(PATH,{cache:'no-store'});
 const {publicKey}=response.ok?await response.json():{};
 if(typeof publicKey!=='string'||!/^[A-Za-z0-9_-]{87}$/.test(publicKey))throw Error('floor_push_unavailable');
 return Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')),character=>character.charCodeAt(0));
}

export async function manageFloorPush(send:typeof fetch,action:'status'|'enable'|'disable',subscription:PushSubscription){
 const {endpoint,keys}=subscription.toJSON();
 const response=await send(PATH,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({action,endpoint,...(action==='enable'?keys:{})})});
 if(!response.ok)throw new StaffAuthenticationError(response.status);
 return (await response.json()).enabled===true;
}

export async function clearFloorPushForSignOut(send:typeof fetch){
 if(!supportsFloorPush())return;
 const registration=await navigator.serviceWorker.getRegistration();
 const subscription=await registration?.pushManager.getSubscription();
 if(!subscription)return;
 await manageFloorPush(send,'disable',subscription);
 await subscription.unsubscribe();
}
