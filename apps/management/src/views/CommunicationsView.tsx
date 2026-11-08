import {useEffect,useRef,useState,type ChangeEvent,type FormEvent} from 'react';
import type {M5CommunicationsGateway,M5CommunicationDraft,M5CommunicationRecord} from '../m5-communications-model';

const DAYS=[['L',1],['M',2],['X',3],['J',4],['V',5],['S',6],['D',7]] as const;
function todayInMadrid(){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',year:'numeric',
  month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=(type:string)=>parts.find(x=>x.type===type)?.value??'';
 return [get('year'),get('month'),get('day')].join('-');
}
function emptyDraft():M5CommunicationDraft{
 const now=todayInMadrid();
 return {title:'',body:'',emoji:'',image:null,imageLicense:null,priority:'BAJA',
  schedule:{mode:'daily',startDate:now,endDate:null,weekdays:[],
   startTime:'09:00',endTime:'22:00',timeZone:'Europe/Madrid'}};
}
const isScheduleValid=(d:M5CommunicationDraft)=>{
 const s=d.schedule;
 return d.title.trim().length>0&&d.title.trim().length<=120&&
 d.body.trim().length>0&&d.body.length<=1200&&
 s.startTime<s.endTime&&s.startDate.length===10&&
 (s.endDate===null||s.endDate>=s.startDate)&&
 (s.mode!=='weekly'||s.weekdays.length>0)&&
 (s.mode!=='once'||s.endDate===s.startDate)&&
 (d.image===null||Boolean(d.imageLicense?.trim()));
};
export function CommunicationsView({gateway}:{gateway:M5CommunicationsGateway|null}){
 const [items,setItems]=useState<readonly M5CommunicationRecord[]>([]);
 const [editing,setEditing]=useState<{id:string;revision:number}|null>(null);
 const [draft,setDraft]=useState<M5CommunicationDraft>(emptyDraft);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [failed,setFailed]=useState(false);
 const bodyInput=useRef<HTMLTextAreaElement>(null);
 const insertAtCursor=(before:string,after:string='',fallback:string='')=>{
  const input=bodyInput.current;
  const start=input?.selectionStart??draft.body.length,end=input?.selectionEnd??start;
  const text=draft.body.slice(start,end)||fallback;
  const fragment=before+text+after;
  if(draft.body.length-(end-start)+fragment.length>1200)return;
  setDraft(d=>({...d,body:d.body.slice(0,start)+fragment+d.body.slice(end)}));
  requestAnimationFrame(()=>{input?.focus();input?.setSelectionRange(start+before.length,
   start+before.length+text.length);});
 };
 const load=async()=>{
  if(!gateway){setItems([]);setLoading(false);setFailed(true);
   setMessage('Comunicaciones no habilitadas en este entorno.');return;}
  try{
   const page=await gateway.readCommunications();
   setItems(page.items);setFailed(false);
   setMessage('');
  }catch{setItems([]);setFailed(true);setMessage('No se pudo consultar Comunicaciones.');}
  finally{setLoading(false);}
 };
 useEffect(()=>{void load();},[gateway]);
 const mutate=async(operation:'save'|'publish'|'pause'|'resume'|'withdraw',
  item?:M5CommunicationRecord)=>{
  if(!gateway||busy)return;
  const target=item??(editing?items.find(x=>x.id===editing.id):undefined);
  if(operation!=='save'&&!target)return;
  if(operation==='save'&&!isScheduleValid(draft)){
   setMessage('Revisa título, texto, días, horarios, fecha e imagen/licencia.');setFailed(true);return;
  }
  setBusy(true);setFailed(false);setMessage('');
  try{
   await gateway.manageCommunication({requestId:crypto.randomUUID(),operation,payload:{
    id:target?.id??null,revision:target?.revision??null,
    draft:operation==='save'?draft:null}});
   setMessage(operation==='save'?'Borrador guardado. Publica expresamente para mostrarlo al cliente.':
    operation==='publish'?'Anuncio publicado. Se mostrará únicamente dentro de su programación.':
    operation==='pause'?'Anuncio pausado.':
    operation==='resume'?'Anuncio reactivado.':'Anuncio retirado.');
   const next=await gateway.readCommunications();
   setItems(next.items);
   if(operation==='save'){setEditing(null);setDraft(emptyDraft());}
   else if(editing?.id===target?.id)setEditing(null);
  }catch(error){
   setFailed(true);setMessage(error instanceof Error&&error.message==='m3_management_conflict'?
    'Otro gestor cambió el anuncio. Actualiza la lista y revisa antes de reintentar.':
    'No se pudo aplicar la operación. No se ha confirmado ningún cambio.');
  }finally{setBusy(false);}
 };
 const pickImage=async(event:ChangeEvent<HTMLInputElement>)=>{
  const file=event.target.files?.[0];
  if(!file){setDraft(d=>({...d,image:null,imageLicense:null}));return;}
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>131072||file.size<16){
   setFailed(true);setMessage('Utiliza JPG, PNG o WebP optimizado de hasta 128 KiB.');return;
  }
  try{
   const data=await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));
    reader.onerror=()=>reject(Error('image_unavailable'));reader.readAsDataURL(file);
   });
   setDraft(d=>({...d,image:data,imageLicense:d.imageLicense??''}));
  }catch{setFailed(true);setMessage('No se pudo leer la imagen seleccionada.');}
 };
 const edit=(item:M5CommunicationRecord)=>{
  setEditing({id:item.id,revision:item.revision});
  setDraft(structuredClone(item.draft));setMessage('Editando borrador. Guardar no modifica la versión pública hasta publicar.');
 };
 const form=(e:FormEvent)=>{e.preventDefault();void mutate('save');};
 return <section className="communications-management" aria-labelledby="comms-title">
  <div className="section-title"><span className="eyebrow">Configuración</span>
   <h2 id="comms-title">Comunicaciones</h2>
   <p>Crea avisos del restaurante. Solo se muestran cuando están publicados y dentro de la programación.</p></div>
  {!gateway?<p role="status">Módulo no conectado. No se publicarán anuncios ficticios.</p>:null}
  <form className="communications-editor" onSubmit={form}>
   <h3>{editing?'Editar borrador':'Nuevo anuncio'}</h3>
   <label>Título (máx. 120)
    <input required maxLength={120} value={draft.title}
     onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></label>
   <div className="communications-format-actions" role="toolbar" aria-label="Formato básico del mensaje">
    <button type="button" disabled={busy} onClick={()=>insertAtCursor('**','**','negrita')}>Negrita</button>
    <button type="button" disabled={busy} onClick={()=>insertAtCursor('_','_','cursiva')}>Cursiva</button>
    {['🥘','🌿','🎉','📣'].map(emoji=><button type="button" key={emoji}
     aria-label={'Insertar '+emoji} disabled={busy}
     onClick={()=>insertAtCursor(emoji)}>{emoji}</button>)}
   </div>
   <label>Mensaje (admite saltos de línea y emojis)
    <textarea ref={bodyInput} required rows={4} maxLength={1200} value={draft.body}
     onChange={e=>setDraft(d=>({...d,body:e.target.value}))}/></label>
   <div className="communications-grid">
    <label>Emoji para la banda
     <input maxLength={12} value={draft.emoji} onChange={e=>setDraft(d=>({...d,emoji:e.target.value}))}/></label>
    <label>Prioridad
     <select value={draft.priority}
      onChange={e=>setDraft(d=>({...d,priority:e.target.value as 'ALTA'|'BAJA'}))}>
      <option value="BAJA">Baja</option><option value="ALTA">Alta</option></select></label>
    <label>Repetición
     <select value={draft.schedule.mode} onChange={e=>setDraft(d=>({...d,
      schedule:{...d.schedule,mode:e.target.value as 'once'|'daily'|'weekly',
       endDate:e.target.value==='once'?d.schedule.startDate:d.schedule.endDate,
       weekdays:e.target.value==='weekly'?[1,2,3,4,5,6,7]:[]}}))}>
      <option value="once">Una fecha</option><option value="daily">Cada día</option>
      <option value="weekly">Días de la semana</option></select></label>
    <label>Zona horaria IANA
     <input required maxLength={80} value={draft.schedule.timeZone}
      onChange={e=>setDraft(d=>({...d,schedule:{...d.schedule,timeZone:e.target.value}}))}/></label>
    <label>Fecha desde
     <input type="date" required value={draft.schedule.startDate}
      onChange={e=>setDraft(d=>({...d,schedule:{...d.schedule,startDate:e.target.value,
       endDate:d.schedule.mode==='once'?e.target.value:d.schedule.endDate}}))}/></label>
    <label>Fecha hasta (opcional)
     <input type="date" value={draft.schedule.endDate??''} disabled={draft.schedule.mode==='once'}
      min={draft.schedule.startDate}
      onChange={e=>setDraft(d=>({...d,schedule:{...d.schedule,endDate:e.target.value||null}}))}/></label>
    <label>Hora desde
     <input type="time" required value={draft.schedule.startTime}
      onChange={e=>setDraft(d=>({...d,schedule:{...d.schedule,startTime:e.target.value}}))}/></label>
    <label>Hora hasta
     <input type="time" required value={draft.schedule.endTime}
      onChange={e=>setDraft(d=>({...d,schedule:{...d.schedule,endTime:e.target.value}}))}/></label>
   </div>
   {draft.schedule.mode==='weekly'?<fieldset><legend>Días visibles</legend>
    <div className="communications-weekdays">{DAYS.map(([label,num])=><label key={num}>
     <input type="checkbox" checked={draft.schedule.weekdays.includes(num)}
      onChange={e=>setDraft(d=>({...d,schedule:{...d.schedule,weekdays:e.target.checked?
       [...d.schedule.weekdays,num].sort() : d.schedule.weekdays.filter(v=>v!==num)}}))}/>{label}</label>)}</div>
   </fieldset>:null}
   <label>Fotografía opcional (propia o con licencia; máximo 128 KiB)
    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void pickImage(e)}/></label>
   {draft.image?<div className="communications-image-selected"><img alt="Vista previa de la imagen" src={draft.image}/>
    <button type="button" onClick={()=>setDraft(d=>({...d,image:null,imageLicense:null}))}>Quitar imagen</button></div>:null}
   {draft.image?<label>Procedencia y licencia de la imagen
    <input required maxLength={240} value={draft.imageLicense??''}
     onChange={e=>setDraft(d=>({...d,imageLicense:e.target.value}))}/></label>:null}
   <div className="communications-preview">
    <strong>Vista previa de la banda</strong>
    <p>{draft.emoji} {draft.title||'Título del anuncio'}</p>
    <small>{draft.body||'Texto del anuncio'}</small>
   </div>
   <div className="communications-actions">
    <button disabled={busy||!gateway} type="submit">Guardar borrador</button>
    {editing?<button disabled={busy} type="button" onClick={()=>{setEditing(null);setDraft(emptyDraft());}}>Cancelar edición</button>:null}
   </div>
  </form>
  {message?<p role={failed?'alert':'status'}>{message}</p>:null}
  <div className="communications-items">
   <div className="communications-heading"><h3>Anuncios creados</h3>
    <button type="button" disabled={busy||!gateway} onClick={()=>void load()}>Actualizar</button></div>
   {loading?<p role="status">Consultando anuncios…</p>:!items.length?<p>No hay anuncios creados.</p>:
    items.map(a=><article className="communications-item" key={a.id}>
     <h4>{a.draft.emoji} {a.draft.title}</h4>
     <p>{a.state==='draft'?'Borrador':a.state==='published'?'Publicado/Programado':
      a.state==='paused'?'Pausado':'Retirado'} · Versión {a.revision}</p>
     <small>{a.draft.schedule.mode} · {a.draft.schedule.startDate} · {a.draft.schedule.startTime}–{a.draft.schedule.endTime} · {a.draft.schedule.timeZone}</small>
     <div className="communications-actions">
      <button disabled={busy} onClick={()=>edit(a)}>Editar</button>
      <button disabled={busy} onClick={()=>void mutate('publish',a)}>Publicar borrador</button>
      {a.state==='published'?<button disabled={busy} onClick={()=>void mutate('pause',a)}>Pausar</button>:null}
      {a.state==='paused'?<button disabled={busy} onClick={()=>void mutate('resume',a)}>Reactivar</button>:null}
      {['published','paused'].includes(a.state)?<button disabled={busy}
       onClick={()=>void mutate('withdraw',a)}>Retirar</button>:null}
     </div>
    </article>)}
  </div>
 </section>;
}
