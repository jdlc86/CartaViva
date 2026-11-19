// Bounded Docker-save inspection. Never extracts files or invokes Docker.
import {readSync,closeSync,fstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {openProtected,releaseStop as stop,sha256,exactKeys} from './sabora-release-protected-store.mjs';
const BLOCK=512,MAX_ARCHIVE=768*1024*1024,MAX_METADATA=4*1024*1024;
const HEX=/^[0-9a-f]{64}$/;
function text(block,start,length){
 const part=block.subarray(start,start+length),zero=part.indexOf(0);
 if(zero>=0&&part.subarray(zero).some(b=>b!==0))stop('tar_noncanonical_string');
 return part.subarray(0,zero<0?part.length:zero).toString('utf8');
}
function octal(block,start,length){
 const raw=block.subarray(start,start+length).toString('ascii').replace(/\0.*$/,'').trim();
 if(!/^[0-7]+$/.test(raw))stop('tar_invalid_number');
 const value=parseInt(raw,8);if(!Number.isSafeInteger(value))stop('tar_number_overflow');return value;
}
function safePath(name){
 return typeof name==='string'&&name.length>0&&name.length<=240&&
  /^[A-Za-z0-9_./-]+$/.test(name)&&!name.startsWith('/')&&
  name.split('/').every(p=>p!=='.'&&p!=='..')&&!name.includes('//');
}
function readAt(fd,offset,size){
 const bytes=Buffer.alloc(size);let done=0;
 while(done<size){const n=readSync(fd,bytes,done,size-done,offset+done);if(!n)stop('tar_truncated');done+=n;}
 return bytes;
}
function regionHash(fd,start,size){
 const h=createHash('sha256');
 for(let offset=0;offset<size;offset+=65536)h.update(readAt(fd,start+offset,Math.min(65536,size-offset)));
 return h.digest('hex');
}
export function inspectDockerSaveArchive(path,expected,{uid=0}={}){
 if(!expected||!/^sabora-(?:api|web):[0-9a-f]{40}$/.test(expected.tag)||
  !/^sha256:[0-9a-f]{64}$/.test(expected.imageId)||!HEX.test(expected.archiveSha256))stop('archive_expected_identity_invalid');
 const {fd,stat}=openProtected(path,{uid,maxBytes:MAX_ARCHIVE,privateFile:true});
 try{
  if(stat.size%BLOCK!==0||regionHash(fd,0,stat.size)!==expected.archiveSha256)stop('archive_hash_mismatch');
  const entries=new Map();let offset=0,ended=false;
  while(offset<stat.size){
   if(entries.size>4096)stop('tar_too_many_entries');
   const block=readAt(fd,offset,BLOCK);offset+=BLOCK;
   if(block.every(b=>b===0)){
    if(offset+BLOCK>stat.size||!readAt(fd,offset,BLOCK).every(b=>b===0))stop('tar_missing_terminator');
    for(let tail=offset;tail<stat.size;tail+=65536)
     if(readAt(fd,tail,Math.min(65536,stat.size-tail)).some(b=>b!==0))stop('tar_trailing_payload');
    ended=true;break;
   }
   const sum=block.reduce((n,b,i)=>n+(i>=148&&i<156?32:b),0);
   if(sum!==octal(block,148,8)||text(block,257,6)!=='ustar')stop('tar_header_invalid');
   const prefix=text(block,345,155),leaf=text(block,0,100);
   const name=prefix?prefix+'/'+leaf:leaf,type=block[156];
   if(!safePath(name)||entries.has(name)||![0,48,53].includes(type)||text(block,157,100)!=='')
    stop('tar_path_type_or_duplicate');
   const size=octal(block,124,12),directory=type===53;
   if(directory&&size!==0)stop('tar_directory_payload');
   if(size>MAX_ARCHIVE||offset+Math.ceil(size/BLOCK)*BLOCK>stat.size)stop('tar_entry_size');
   entries.set(name,{offset,size,directory});offset+=Math.ceil(size/BLOCK)*BLOCK;
  }
  if(!ended)stop('tar_unterminated');
  const readJson=name=>{
   const entry=entries.get(name);
   if(!entry||entry.directory||entry.size<2||entry.size>MAX_METADATA)stop('archive_metadata_missing');
   try{return JSON.parse(readAt(fd,entry.offset,entry.size).toString('utf8'));}
   catch{stop('archive_metadata_invalid');}
  };
  const manifests=readJson('manifest.json');
  if(!Array.isArray(manifests)||manifests.length!==1)stop('archive_multiple_images');
  const item=manifests[0];
  if(!item||!safePath(item.Config)||!Array.isArray(item.RepoTags)||item.RepoTags.length!==1||
    item.RepoTags[0]!==expected.tag||!Array.isArray(item.Layers)||!item.Layers.length||
    item.Layers.length>128||new Set(item.Layers).size!==item.Layers.length||
    item.Layers.some(p=>!safePath(p)))stop('archive_image_scope');
  const configEntry=entries.get(item.Config),config=readJson(item.Config);
  if(sha256(readAt(fd,configEntry.offset,configEntry.size))!==expected.imageId.slice(7))stop('archive_config_digest');
  if(config.os!=='linux'||!['amd64','arm64'].includes(config.architecture)||
    config.rootfs?.type!=='layers'||!Array.isArray(config.rootfs.diff_ids)||
    config.rootfs.diff_ids.length!==item.Layers.length)stop('archive_config_invalid');
  // Docker save supplies uncompressed layer TARs. A different format must be
  // explicitly reviewed; do not feed an ambiguous signed archive to load.
  for(let i=0;i<item.Layers.length;i++){
   const entry=entries.get(item.Layers[i]);
   if(!entry||entry.directory||entry.size<1024||
    'sha256:'+regionHash(fd,entry.offset,entry.size)!==config.rootfs.diff_ids[i])stop('archive_layer_digest');
  }
  const references=new Set(['manifest.json',item.Config,...item.Layers]);
  // Legacy Docker saves may include a repositories map and per-layer json / VERSION.
  if(entries.has('repositories')){
   const repo=readJson('repositories'),[name,tag]=expected.tag.split(':');
   if(!exactKeys(repo,[name])||!exactKeys(repo[name],[tag])||!HEX.test(repo[name][tag]))stop('archive_foreign_repository');
   references.add('repositories');
  }
  // OCI index metadata from Docker's containerd image store: only the one
  // approved image descriptor is allowed, and all referenced blobs are hashed.
  if(entries.has('index.json')){
   const index=readJson('index.json');
   if(index.schemaVersion!==2||!Array.isArray(index.manifests)||index.manifests.length!==1)
    stop('archive_oci_index_ambiguous');
   const descriptor=index.manifests[0];
   if(!/^sha256:[0-9a-f]{64}$/.test(descriptor.digest))stop('archive_oci_descriptor');
   const descriptorPath='blobs/sha256/'+descriptor.digest.slice(7),entry=entries.get(descriptorPath);
   if(!entry||regionHash(fd,entry.offset,entry.size)!==descriptor.digest.slice(7))stop('archive_oci_digest');
   const image=readJson(descriptorPath);
   if(image.config?.digest!==expected.imageId||!Array.isArray(image.layers)||
     image.layers.length!==item.Layers.length||image.layers.some((layer,i)=>
      'blobs/sha256/'+String(layer.digest).slice(7)!==item.Layers[i]))stop('archive_oci_image_disagrees');
   const tag=descriptor.annotations?.['io.containerd.image.name'];
   if(tag&&tag!==expected.tag&&tag!=='docker.io/library/'+expected.tag)stop('archive_oci_foreign_tag');
   references.add('index.json');references.add(descriptorPath);
  }
  if(entries.has('oci-layout')){
   if(readJson('oci-layout').imageLayoutVersion!=='1.0.0')stop('archive_oci_layout');
   references.add('oci-layout');
  }
  for(const [name,entry] of entries){
   if(entry.directory)continue;
   if(references.has(name))continue;
   if(/^[0-9a-f]{64}\/(?:json|VERSION)$/.test(name)&&item.Layers.includes(name.split('/')[0]+'/layer.tar'))continue;
   stop('archive_unreferenced_payload');
  }
  const after=fstatSync(fd);
  if(after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||after.ctimeMs!==stat.ctimeMs)stop('archive_changed');
  return {imageId:expected.imageId,tag:expected.tag,archiveSha256:expected.archiveSha256,
   configuration:config.config,architecture:config.architecture,layerCount:item.Layers.length};
 }finally{closeSync(fd);}
}
