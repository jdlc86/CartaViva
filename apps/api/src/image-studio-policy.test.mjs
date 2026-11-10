import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareImageStudioRequest,validateImageStudioDerivative,assertImageStudioSource,IMAGE_STUDIO_MAX_SOURCE_BYTES} from './image-studio-policy.mjs';
const source=Object.freeze({id:'dish-photo-1',mimeType:'image/jpeg',byteLength:2048,isPrivate:true,isImmutable:true});
const options=()=>({source,ratio:'five-four',controls:['lighting','background'],authorized:true,quotaAvailable:true,providerAvailable:true});
test('prepare authorized Google image edit with immutable private original and fixed output',()=>{
 const r=prepareImageStudioRequest(options());
 assert.deepEqual(r.output,{width:1000,height:800});
 assert.deepEqual(r.controls,['lighting','background']);
 assert.match(r.instruction,/Never invent/);
 assert.equal(Object.isFrozen(r),true);
 assert.equal(Object.isFrozen(r.controls),true);
});
test('deny absent auth, unavailable provider, exhausted quota',()=>{
 for(const key of ['authorized','providerAvailable','quotaAvailable']){
  assert.throws(()=>prepareImageStudioRequest({...options(),[key]:false}));
  assert.throws(()=>prepareImageStudioRequest({...options(),[key]:'true'}));
 }
});
test('reject non-private, mutable, oversized and invalid source',()=>{
 for(const patch of [{isPrivate:false},{isImmutable:false},{byteLength:0},{byteLength:IMAGE_STUDIO_MAX_SOURCE_BYTES+1},{mimeType:'image/svg+xml'},{id:'../bad'}]){
  assert.throws(()=>assertImageStudioSource({...source,...patch}),/invalid_image_studio_source/);
 }
});
test('reject unknown ratio, unknown and duplicate controls',()=>{
 for(const patch of [{ratio:'16:9'},{controls:[]},{controls:['lighting','lighting']},{controls:['new-ingredients']}])
  assert.throws(()=>prepareImageStudioRequest({...options(),...patch}),/invalid_image_studio_transformation/);
});
test('support three approved dimensions',()=>{
 assert.deepEqual(prepareImageStudioRequest({...options(),ratio:'four-three'}).output,{width:1200,height:900});
 assert.deepEqual(prepareImageStudioRequest({...options(),ratio:'square'}).output,{width:400,height:400});
});
test('only reviewed, approved private Google derivatives are publishable candidates',()=>{
 const base={originalId:'orig',derivedId:'v2',provider:'google',model:'verified-model',privateStorage:true,reviewed:true,approved:true,published:false};
 assert.equal(validateImageStudioDerivative(base).derivedId,'v2');
 for(const patch of [{originalId:'v2'},{provider:'other'},{model:''},{privateStorage:false},{reviewed:false},{approved:false},{published:true}])
  assert.throws(()=>validateImageStudioDerivative({...base,...patch}),/not_publishable/);
});
