import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {Modal} from './Modal';

export type PublishedAnnouncement=Readonly<{
 id:string;title:string;body:string;emoji:string;priority:'ALTA'|'BAJA';image:string|null;
}>;
const IMAGE=/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGE_DATA=175_000;
/** Restricted inline markup is rendered as React text nodes; never interpret HTML. */
const formattedText=(body:string):ReactNode[]=>
 body.split(/(\*\*[^*\n]+\*\*|_[^_\n]+_)/g).map((part,i)=>
  part.startsWith('**')&&part.endsWith('**')?
   <strong key={i}>{part.slice(2,-2)}</strong>:
  part.startsWith('_')&&part.endsWith('_')?
   <em key={i}>{part.slice(1,-1)}</em>:
   part);

export function parsePublicCommunications(value:unknown):readonly PublishedAnnouncement[]{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid_public_comms');
 const envelope=value as {version?:unknown;items?:unknown};
 if(envelope.version!==1||!Array.isArray(envelope.items)||envelope.items.length>100)
  throw Error('invalid_public_comms');
 return Object.freeze(envelope.items.map((v:unknown)=>{
  if(!v||typeof v!=='object'||Array.isArray(v))throw Error('invalid_public_comms_item');
  const a=v as Record<string,unknown>;
  if(typeof a.id!=='string'||!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(a.id)||
   typeof a.title!=='string'||a.title.length>120||
   typeof a.body!=='string'||a.body.length>1200||
   typeof a.emoji!=='string'||a.emoji.length>12||
   (a.priority!=='ALTA'&&a.priority!=='BAJA')||
   (a.image!==null&&(typeof a.image!=='string'||a.image.length>MAX_IMAGE_DATA||!IMAGE.test(a.image))))
   throw Error('invalid_public_comms_item');
  return Object.freeze({id:a.id,title:a.title,body:a.body,emoji:a.emoji,
   priority:a.priority,image:a.image}) as PublishedAnnouncement;
 }));
}
export function CommunicationsBar({locale}:{locale:'es'|'en'}){
 const [items,setItems]=useState<readonly PublishedAnnouncement[]>([]);
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [index,setIndex]=useState(0);
 const requestNumber=useRef(0);
 useEffect(()=>{
  let mounted=true;
  const controller=new AbortController();
  const read=async()=>{
   const revision=++requestNumber.current;
   try{
    const response=await fetch('/api/v1/public/communications',{
     credentials:'omit',redirect:'error',cache:'no-store',signal:controller.signal,
     headers:{Accept:'application/json'}});
    if(!response.ok||!response.headers.get('content-type')?.startsWith('application/json'))
     throw Error('unavailable');
    const value=parsePublicCommunications(await response.json());
    if(mounted&&revision===requestNumber.current)setItems(value);
   }catch{
    if(mounted&&revision===requestNumber.current){setItems([]);setSelectedId(null);}
   }
  };
  void read();
  if(typeof EventSource==='undefined')return()=>{mounted=false;controller.abort();};
  const stream=new EventSource('/api/v1/public/communications/events',{withCredentials:false});
  const change=()=>{void read();};
  const unavailable=()=>{if(mounted){setItems([]);setSelectedId(null);}};
  stream.addEventListener('changed',change);
  stream.addEventListener('error',unavailable);
  return()=>{mounted=false;requestNumber.current++;controller.abort();
   stream.removeEventListener('changed',change);stream.removeEventListener('error',unavailable);stream.close();};
 },[]);
 useEffect(()=>{
  setIndex(i=>items.length?i%items.length:0);
  if(selectedId&&!items.some(x=>x.id===selectedId))setSelectedId(null);
 },[items,selectedId]);
 // High-priority ads have twice the dwell time, but all published ads appear
 // once per cycle, with no consecutive repeats. Candidate timing is not a
 // final human approval of animation or placement.
 useEffect(()=>{
  if(items.length<2||selectedId||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const item=items[index%items.length];
  const timer=window.setTimeout(()=>setIndex(i=>(i+1)%items.length),
   item.priority==='ALTA'?9_000:4_500);
  return()=>window.clearTimeout(timer);
 },[items,index,selectedId]);
 const current=items.length?items[index%items.length]:null;
 const detail=useMemo(()=>items.find(x=>x.id===selectedId)??null,[items,selectedId]);
 if(!current)return null;
 return <section className="communication-section" aria-label={locale==='es'?'Anuncios del restaurante':'Restaurant announcements'}>
  <button type="button" className="announcement-band" onClick={()=>setSelectedId(current.id)}
   aria-label={(locale==='es'?'Abrir anuncio: ':'Read announcement: ')+current.title}>
   <span className="announcement-emoji" aria-hidden="true">{current.emoji||'✦'}</span>
   <span className="announcement-copy"><strong>{current.title}</strong>
    <span>{current.body}</span></span>
   <span className="announcement-more" aria-hidden="true">›</span>
  </button>
  {detail?<Modal title={detail.title} onClose={()=>setSelectedId(null)}>
   <div className="announcement-details">
    {detail.image?<img src={detail.image} alt={detail.title} decoding="async"/>:null}
    <p>{formattedText(detail.body)}</p>
   </div>
  </Modal>:null}
 </section>;
}
