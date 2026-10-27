export const API_HEALTH_PATH: string;
export const SERVICE_NAME: string;
export const TABLE_QR_PATH_PREFIX: '/qr/v1/';
export const TABLE_QR_TOKEN_PATTERN: RegExp;

export type TableQrCredential=Readonly<{
 restaurantCode:string;
 tableId:string;
 token:string;
}>;

export function buildTableQrPayload(input:{
 origin:string;
 restaurantCode:string;
 tableId:string;
 token:string;
 allowInsecureLoopback?:boolean;
}):string;

export function parseTableQrPayload(payload:string,configuration:{
 expectedOrigin:string;
 expectedRestaurantCode:string;
 allowInsecureLoopback?:boolean;
}):TableQrCredential;
