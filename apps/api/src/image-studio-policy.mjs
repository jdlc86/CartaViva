// Backend-only, side-effect-free policy for the approved Google image studio.
// No model selection, credentials, requests or route registration.
const RATIOS=Object.freeze({'five-four':Object.freeze({width:1000,height:800}),'four-three':Object.freeze({width:1200,height:900}),square:Object.freeze({width:400,height:400})});
const CONTROLS=Object.freeze(['lighting','framing','background','presentation']);
const MIME=Object.freeze(['image/jpeg','image/png','image/webp']);
export const IMAGE_STUDIO_RATIOS=RATIOS;
export const IMAGE_STUDIO_CONTROLS=CONTROLS;
export const IMAGE_STUDIO_MAX_SOURCE_BYTES=10*1024*1024;
export function assertImageStudioSource(source){
 if(!source||typeof source!=='object'||typeof source.id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(source.id)||
 !MIME.includes(source.mimeType)||!Number.isSafeInteger(source.byteLength)||source.byteLength<1||
 source.byteLength>IMAGE_STUDIO_MAX_SOURCE_BYTES||source.isPrivate!==true||source.isImmutable!==true)
 throw Error('invalid_image_studio_source');
 return Object.freeze({id:source.id,mimeType:source.mimeType,byteLength:source.byteLength});
}
export function prepareImageStudioRequest({source,ratio,controls,authorized,quotaAvailable,providerAvailable}={}){
 if(authorized!==true)throw Error('image_studio_not_authorized');
 if(providerAvailable!==true)throw Error('image_studio_provider_unavailable');
 if(quotaAvailable!==true)throw Error('image_studio_quota_exceeded');
 const original=assertImageStudioSource(source);
 if(!Object.hasOwn(RATIOS,ratio)||!Array.isArray(controls)||controls.length===0||
 controls.length>CONTROLS.length||new Set(controls).size!==controls.length||
 controls.some(control=>!CONTROLS.includes(control)))throw Error('invalid_image_studio_transformation');
 return Object.freeze({original,ratio,output:RATIOS[ratio],controls:Object.freeze([...controls]),
 instruction:'Edit the supplied real dish photograph only. Preserve every ingredient, portion, plating, and dish identity. Never invent, add, remove or replace food. Improve only the selected lighting, framing, background or clarity aspects. Keep a warm natural light and discreet background. Return an image for human comparison and approval; do not publish.'});
}
export function validateImageStudioDerivative({originalId,derivedId,provider,model,privateStorage,reviewed,approved,published}={}){
 if(typeof originalId!=='string'||!originalId||typeof derivedId!=='string'||!derivedId||
 originalId===derivedId||provider!=='google'||typeof model!=='string'||!model.trim()||
 privateStorage!==true||reviewed!==true||approved!==true||published===true)
 throw Error('image_studio_derivative_not_publishable');
 return Object.freeze({originalId,derivedId,provider,model});
}
