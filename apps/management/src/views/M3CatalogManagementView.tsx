import {useEffect,useMemo,useState} from 'react';
import {Icon} from '../components/Icon';
import {ConnectionNotice,EmptyState,ErrorState,LoadingState,PageHeader,StatusBadge} from '../components/Primitives';
import {catalogDraftFromForm,loadM3ManagementCatalog,type M3CatalogGateway,
 type M3ManagementCatalog} from '../m3-catalog-management-model.js';
import type {OrderOperationsGateway} from '../order-operations-gateway.js';

type Extra={id:string;name:string;price:string;available:boolean};
type OptionValue=Extra;
type OptionGroup={id:string;name:string;required:boolean;maxSelections:number;values:OptionValue[]};
const slug=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,48)||crypto.randomUUID().slice(0,8);
const cents=(value:string)=>{
 const match=/^(0|[1-9][0-9]{0,12})(?:[,.]([0-9]{1,2}))?$/.exec(value.trim());
 if(!match)throw Error('invalid_price');return Number(match[1])*100+Number((match[2]??'').padEnd(2,'0'));
};
const euro=(value:unknown)=>Number.isSafeInteger(value)?(Number(value)/100).toFixed(2).replace('.',','):'0,00';
const emptyForm=()=>({name:'',description:'',imageUrl:'',categoryId:'',price:'0,00',
 allergenIds:[] as number[],allergenStatus:'PENDIENTE_DE_VERIFICAR',
 discountType:'none',discountValue:'',extras:[] as Extra[],options:[] as OptionGroup[]});

export function M3CatalogManagementView({gateway,operationsGateway}:{gateway:M3CatalogGateway;operationsGateway?:OrderOperationsGateway}){
 const [catalog,setCatalog]=useState<M3ManagementCatalog|null>(null);
 const [phase,setPhase]=useState<'loading'|'ready'|'error'>('loading');
 const [reload,setReload]=useState(0);const [pending,setPending]=useState(false);
 const [message,setMessage]=useState<string|null>(null);const [selectedId,setSelectedId]=useState<string|null>(null);
 const [newItem,setNewItem]=useState(false);const [form,setForm]=useState(emptyForm);
 const [categoryName,setCategoryName]=useState('');const [categorySort,setCategorySort]=useState('600');
 const refresh=async()=>{const value=await loadM3ManagementCatalog(gateway);setCatalog(value);setPhase('ready');
  setSelectedId(current=>value.items.some(item=>item.id===current)?current:value.items[0]?.id??null);};
 useEffect(()=>{let active=true;setPhase('loading');void loadM3ManagementCatalog(gateway).then(value=>{
  if(!active)return;setCatalog(value);setSelectedId(value.items[0]?.id??null);setPhase('ready');
 }).catch(()=>active&&setPhase('error'));return()=>{active=false};},[gateway,reload]);
 const selected=catalog?.items.find(item=>item.id===selectedId)??null;
 useEffect(()=>{
  // New-item initialization happens in the button's own event handler.
  // A post-render effect can otherwise race with fast typing and preserve
  // the previous item's modifiers in a newly published draft (B3 evidence).
  // Category refreshes must not reset an in-progress new-item form.
  if(newItem)return;
  const draft=selected?.draft;if(!draft){setForm(emptyForm());return;}
  const declaration=draft.allergenDeclaration as Record<string,unknown>|undefined;
  const discount=draft.discount as Record<string,unknown>|null|undefined;
  setForm({name:String(draft.name??''),description:String(draft.description??''),imageUrl:String(draft.imageUrl??''),
   categoryId:selected?.categoryId??'',price:euro(draft.priceCents),
   allergenIds:Array.isArray(declaration?.ids)?declaration!.ids.filter(Number.isSafeInteger) as number[]:[],
   allergenStatus:declaration?.status==='VERIFICADA'?'VERIFICADA':'PENDIENTE_DE_VERIFICAR',
   discountType:discount?.type==='fixed'||discount?.type==='percent'?discount.type:'none',
   discountValue:discount?.type==='fixed'?euro(discount.amountCents):discount?.type==='percent'?
    String(Number(discount.basisPoints??0)/100):'',
   extras:Array.isArray(draft.extras)?draft.extras.map((x:any)=>({id:String(x.id),name:String(x.name),
    price:euro(x.priceCents),available:x.available===true})):[],
   options:Array.isArray(draft.options)?draft.options.map((g:any)=>({id:String(g.id),name:String(g.name),
    required:g.required===true,maxSelections:Number(g.maxSelections)||1,
    values:Array.isArray(g.values)?g.values.map((x:any)=>({id:String(x.id),name:String(x.name),
     price:euro(x.priceCents),available:x.available===true})):[]})):[]});
 },[catalog?.categories,newItem,selected]);
 const mutate=async(operation:string,payload:Record<string,unknown>,success:string)=>{
  if(pending)return;setPending(true);setMessage(null);
  let committed=false;
  try{
   const result=await gateway.manageCatalog({requestId:crypto.randomUUID(),operation,payload});
   committed=true;
   if(operation==='item_save'){
    if(result&&typeof result==='object'&&'itemId' in result&&typeof result.itemId==='string')
     setSelectedId(result.itemId);
    setNewItem(false);
   }
   await refresh();
   setMessage(success);
  }catch{
   setMessage(committed
    ?'El servidor confirmó el cambio, pero no se pudo actualizar el catálogo. Recarga antes de repetir la operación.'
    :'No se pudo confirmar el cambio. Comprueba el estado del catálogo antes de reintentarlo.');
  }finally{setPending(false);}
 };
 const availability=async()=>{
  if(!operationsGateway||!selected||pending)return;setPending(true);setMessage(null);
  let committed=false;
  try{
   await operationsGateway.setCatalogSoldOut({itemId:selected.id,soldOut:!selected.soldOut,
    correlationId:`m3_catalog_${crypto.randomUUID().replaceAll('-','_')}`});
   committed=true;
   await refresh();
   setMessage(selected.soldOut?'Disponibilidad restaurada.':'Plato marcado como agotado sin retirar su publicación.');
  }catch{
   setMessage(committed
    ?'El cambio de disponibilidad fue confirmado, pero no se pudo actualizar la lista. Recarga antes de repetirlo.'
    :'No se pudo confirmar la disponibilidad. Comprueba su estado antes de reintentar.');
  }finally{setPending(false);}
 };
 const save=()=>{
  const itemId=newItem?crypto.randomUUID():selected?.id;if(!itemId||!form.categoryId)return;
  let discount=null;
  if(form.discountType==='fixed')discount={type:'fixed',amountCents:cents(form.discountValue)};
  if(form.discountType==='percent'){
   const value=Number(form.discountValue.replace(',','.'));
   if(!Number.isFinite(value)||value<0||value>100)throw Error('invalid_discount');
   discount={type:'percent',basisPoints:Math.round(value*100)};
  }
  const allergenNames=new Set((catalog?.allergens??[]).filter(a=>form.allergenIds.includes(a.id)).map(a=>a.name));
  const normalizeValue=(value:Extra)=>({id:value.id||slug(value.name),name:value.name.trim(),priceCents:cents(value.price),
   available:value.available,allergens:[...allergenNames]});
  const draft=catalogDraftFromForm({name:form.name,description:form.description,imageUrl:form.imageUrl||null,
   priceCents:cents(form.price),allergenIds:form.allergenIds,allergenStatus:form.allergenStatus,
   extras:form.extras.map(normalizeValue),options:form.options.map(group=>({id:group.id||slug(group.name),
    name:group.name.trim(),required:group.required,maxSelections:group.maxSelections,
    values:group.values.map(normalizeValue)})),discount});
  return mutate('item_save',{itemId,expectedRevision:newItem?0:selected!.draftRevision,
   categoryId:form.categoryId,draft},'Borrador guardado. La versión pública no ha cambiado.');
 };
 const published=useMemo(()=>catalog?.items.filter(item=>item.publishedSnapshot&&!item.withdrawn)??[],[catalog]);
 if(phase==='loading')return <LoadingState title="Cargando editor" description="Leyendo borradores y publicaciones con autorización administrativa."/>;
 if(phase==='error'||!catalog)return <ErrorState title="Editor no disponible" description="No se recibió una proyección administrativa válida." onRetry={()=>setReload(v=>v+1)}/>;
 return <div className="view-stack">
  <PageHeader eyebrow="Catálogo" title="Editor de carta" description="Borrador y publicación explícita, categorías dinámicas y precios calculados en céntimos."
   actions={<button className="button button--primary" type="button" onClick={()=>{
      const categoryId=catalog.categories.find(c=>!c.hidden&&c.id===form.categoryId)?.id
       ??catalog.categories.find(c=>!c.hidden)?.id??'';
      // Clear every editable field as a single user action, BEFORE any fast
      // Playwright/user input can reach the next render. Do not inherit
      // allergens, discount, optional extras or required option groups.
      setForm({...emptyForm(),categoryId});
      setNewItem(true);setSelectedId(null);
    }}><Icon name="plus" size={18}/> Nuevo plato</button>}/>
  <ConnectionNotice title="Editor transaccional conectado." tone="brand">Los clientes solo reciben snapshots publicados. No hay sondeo periódico ni publicación automática.</ConnectionNotice>
  {message?<p className="honest-operational-note" role="status">{message}</p>:null}
  <section className="panel catalog-categories">
   <div className="panel-heading"><div><span className="eyebrow">Orden visible</span><h2>Categorías</h2><p>“Todos” sigue siendo virtual.</p></div>
    <form className="management-category-create" onSubmit={event=>{event.preventDefault();void mutate('category_create',{
     categoryId:crypto.randomUUID(),name:categoryName,sortOrder:Number(categorySort)},'Categoría creada.');}}>
     <input aria-label="Nombre de nueva categoría" required maxLength={80} value={categoryName} onChange={e=>setCategoryName(e.target.value)}/>
     <input aria-label="Orden de nueva categoría" required min="1" max="10000" type="number" value={categorySort} onChange={e=>setCategorySort(e.target.value)}/>
     <button className="button" type="submit" disabled={pending}>Añadir</button></form></div>
   <ul className="catalog-category-grid">{catalog.categories.map(category=><li key={category.id}>
    <span className="catalog-category-grid__icon"><Icon name="catalog" size={20}/></span><div><strong>{category.name}</strong><span>Orden {category.sortOrder}</span></div>
    <StatusBadge tone={category.hidden?'warning':'brand'}>{category.hidden?'OCULTA':'VISIBLE'}</StatusBadge>
    <input aria-label={`Orden de ${category.name}`} type="number" min="1" max="10000" defaultValue={category.sortOrder}
     onBlur={event=>{const next=Number(event.currentTarget.value);if(next!==category.sortOrder)void mutate('category_reorder',{
      categoryId:category.id,expectedRevision:category.revision,sortOrder:next},'Orden actualizado.')}}/>
    {!category.mandatory?<button className="button" disabled={pending} type="button" onClick={()=>void mutate('category_visibility',{
     categoryId:category.id,expectedRevision:category.revision,hidden:!category.hidden},'Visibilidad actualizada.')}>
     {category.hidden?'Mostrar':'Ocultar'}</button>:null}</li>)}</ul>
  </section>
  <div className="workbench">
   <section className="workbench__master panel"><div className="panel-heading"><div><span className="eyebrow">Versiones</span><h2>Platos</h2></div>
    <StatusBadge>{published.length} publicados</StatusBadge></div>
    {catalog.items.length===0&&!newItem?<EmptyState icon="catalog" title="Sin platos" description="Crea el primer borrador."/>:
     <ul className="catalog-list">{catalog.items.map(item=><li key={item.id}><button className={selectedId===item.id?'catalog-list-item catalog-list-item--active':'catalog-list-item'}
      type="button" onClick={()=>{setNewItem(false);setSelectedId(item.id)}}><span className="catalog-list-item__copy"><strong>{String(item.draft.name??'Borrador sin nombre')}</strong>
      <small>r{item.draftRevision} · {item.publishedRevision?`publicado r${item.publishedRevision}`:'sin publicar'}</small></span>
      <StatusBadge tone={item.withdrawn?'warning':item.publishedRevision?'brand':'neutral'}>{item.withdrawn?'RETIRADO':item.publishedRevision?'PUBLICADO':'BORRADOR'}</StatusBadge></button></li>)}</ul>}
   </section>
   <section className="workbench__detail panel"><div className="panel-heading"><div><span className="eyebrow">Ficha maestra</span><h2>{newItem?'Nuevo plato':form.name||'Selecciona un plato'}</h2></div></div>
    {(newItem||selected)?<form className="catalog-editor-form" onSubmit={event=>{event.preventDefault();try{void save()}catch{setMessage('Revisa precios, descuento y opciones antes de guardar.')}}}>
     <label>Nombre<input required maxLength={160} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
     <label>Descripción<textarea maxLength={2000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
     <label>Imagen HTTPS opcional<input type="url" value={form.imageUrl} onChange={e=>setForm({...form,imageUrl:e.target.value})}/></label>
     <div className="management-form-grid"><label>Categoría<select required value={form.categoryId} onChange={e=>setForm({...form,categoryId:e.target.value})}>
      <option value="">Selecciona</option>{catalog.categories.filter(c=>!c.hidden).map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
      <label>Precio EUR<input required inputMode="decimal" value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></label></div>
     <fieldset><legend>Declaración de alérgenos</legend><select value={form.allergenStatus} onChange={e=>setForm({...form,allergenStatus:e.target.value})}>
      <option value="PENDIENTE_DE_VERIFICAR">Pendiente de verificar</option><option value="VERIFICADA">Verificada por esta acción</option></select>
      <div className="allergen-selector">{catalog.allergens.map(a=><label key={a.id}><input type="checkbox" checked={form.allergenIds.includes(a.id)}
       onChange={e=>setForm({...form,allergenIds:e.target.checked?[...form.allergenIds,a.id]:form.allergenIds.filter(id=>id!==a.id)})}/>{a.name}</label>)}</div></fieldset>
     <fieldset><legend>Descuento del plato y extras</legend><select value={form.discountType} onChange={e=>setForm({...form,discountType:e.target.value,discountValue:''})}>
      <option value="none">Sin descuento</option><option value="percent">Porcentaje</option><option value="fixed">Importe fijo EUR</option></select>
      {form.discountType!=='none'?<input aria-label="Valor de descuento" value={form.discountValue} onChange={e=>setForm({...form,discountValue:e.target.value})}/>:null}</fieldset>
     <fieldset><legend>Extras</legend>{form.extras.map((extra,index)=><div className="modifier-row" key={`${extra.id}-${index}`}>
      <input aria-label="Nombre del extra" required value={extra.name} onChange={e=>setForm({...form,extras:form.extras.map((v,i)=>i===index?{...v,name:e.target.value,id:v.id||slug(e.target.value)}:v)})}/>
      <input aria-label="Precio del extra" required value={extra.price} onChange={e=>setForm({...form,extras:form.extras.map((v,i)=>i===index?{...v,price:e.target.value}:v)})}/>
      <label><input type="checkbox" checked={extra.available} onChange={e=>setForm({...form,extras:form.extras.map((v,i)=>i===index?{...v,available:e.target.checked}:v)})}/>Disponible</label>
      <button type="button" onClick={()=>setForm({...form,extras:form.extras.filter((_,i)=>i!==index)})}>Quitar</button></div>)}
      <button className="button" type="button" onClick={()=>setForm({...form,extras:[...form.extras,{id:'',name:'',price:'0,00',available:true}]})}>Añadir extra</button></fieldset>
     <fieldset><legend>Grupos de opciones</legend>{form.options.map((group,gIndex)=><div className="option-editor" key={`${group.id}-${gIndex}`}>
      <input aria-label="Nombre del grupo" required value={group.name} onChange={e=>setForm({...form,options:form.options.map((g,i)=>i===gIndex?{...g,name:e.target.value,id:g.id||slug(e.target.value)}:g)})}/>
      <label><input type="checkbox" checked={group.required} onChange={e=>setForm({...form,options:form.options.map((g,i)=>i===gIndex?{...g,required:e.target.checked}:g)})}/>Obligatorio</label>
      <label>Máximo<input type="number" min="1" max="20" value={group.maxSelections} onChange={e=>setForm({...form,options:form.options.map((g,i)=>i===gIndex?{...g,maxSelections:Number(e.target.value)}:g)})}/></label>
      {group.values.map((value,vIndex)=><div className="modifier-row" key={`${value.id}-${vIndex}`}><input aria-label="Nombre de opción" required value={value.name}
       onChange={e=>setForm({...form,options:form.options.map((g,i)=>i===gIndex?{...g,values:g.values.map((v,j)=>j===vIndex?{...v,name:e.target.value,id:v.id||slug(e.target.value)}:v)}:g)})}/>
       <input aria-label="Precio de opción" required value={value.price} onChange={e=>setForm({...form,options:form.options.map((g,i)=>i===gIndex?{...g,values:g.values.map((v,j)=>j===vIndex?{...v,price:e.target.value}:v)}:g)})}/>
       <button type="button" onClick={()=>setForm({...form,options:form.options.map((g,i)=>i===gIndex?{...g,values:g.values.filter((_,j)=>j!==vIndex)}:g)})}>Quitar</button></div>)}
      <button className="button" type="button" onClick={()=>setForm({...form,options:form.options.map((g,i)=>i===gIndex?{...g,values:[...g.values,{id:'',name:'',price:'0,00',available:true}]}:g)})}>Añadir opción</button>
      <button type="button" onClick={()=>setForm({...form,options:form.options.filter((_,i)=>i!==gIndex)})}>Eliminar grupo</button></div>)}
      <button className="button" type="button" onClick={()=>setForm({...form,options:[...form.options,{id:'',name:'',required:false,maxSelections:1,values:[]}]})}>Añadir grupo</button></fieldset>
     <div className="button-row"><button className="button button--primary" disabled={pending} type="submit">Guardar borrador</button>
      {!newItem&&selected?<><button className="button" disabled={pending||form.allergenStatus!=='VERIFICADA'} type="button" onClick={()=>void mutate('item_publish',{
       itemId:selected.id,expectedRevision:selected.draftRevision},'Nueva versión publicada.')}>Publicar</button>
       <button className="button" disabled={pending||!selected.publishedRevision||selected.withdrawn} type="button" onClick={()=>void mutate('item_withdraw',{
       itemId:selected.id,expectedRevision:selected.draftRevision},'Plato retirado del catálogo público.')}>Retirar</button></>:null}</div>
      {!newItem&&selected?.publishedRevision&&operationsGateway?<button className="button" disabled={pending} type="button" onClick={()=>void availability()}>
       {selected.soldOut?'Restaurar disponibilidad':'Marcar agotado'}</button>:null}
    </form>:<EmptyState icon="catalog" title="Sin selección" description="Selecciona un plato o crea uno nuevo."/>}
   </section>
  </div>
 </div>;
}
