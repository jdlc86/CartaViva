import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {categoriesFor,formatPrice,searchPublishedCatalog,type CatalogState,type MenuItem} from './catalog';
import {loadPublishedCatalog} from './catalog-loader';
import {basketIssues,basketQuantity,basketTotal,changeBasket,removeBasketLine,loadBasket,loadClientPreferences,reconcileBasket,saveBasket,saveClientPreferences,type BasketLine,type ClientPreferences,type Locale} from './client-state';
import {BottomNav,type ClientArea} from './components/BottomNav';
import {Icon} from './components/Icon';
import {Modal} from './components/Modal';
import {ProductCard} from './components/ProductCard';

type Overlay='cart'|'notifications'|'qr'|null;
const text={
 es:{menu:'Nuestra carta',kicker:'SELECCIÓN GASTRONÓMICA',hero:'El placer está en cada detalle.',intro:'Explora la carta publicada de Sabora. Precios, disponibilidad y alérgenos proceden siempre del restaurante.',search:'Buscar platos o alérgenos',available:'Solo disponibles',empty:'No hay platos que coincidan con esta selección.',retry:'Reintentar',loading:'Preparando la carta…',error:'No se ha podido cargar la carta.',later:'Inténtalo de nuevo más tarde.',selection:'Tu selección',view:'Ver selección',notifications:'Notificaciones',cart:'Cesta',searchButton:'Buscar',closeSearch:'Cerrar búsqueda',all:'Todos',info:'Información',allergens:'Alérgenos',favorites:'Favoritos',settings:'Ajustes'},
 en:{menu:'Our menu',kicker:'GASTRONOMIC SELECTION',hero:'Pleasure lives in every detail.',intro:'Explore Sabora’s published menu. Prices, availability and allergens always come from the restaurant.',search:'Search dishes or allergens',available:'Available only',empty:'No dishes match this selection.',retry:'Try again',loading:'Preparing the menu…',error:'The menu could not be loaded.',later:'Please try again later.',selection:'Your selection',view:'View selection',notifications:'Notifications',cart:'Basket',searchButton:'Search',closeSearch:'Close search',all:'All',info:'Information',allergens:'Allergens',favorites:'Favorites',settings:'Settings'}
} as const;

function Header({locale,quantity,searchOpen,onLocale,onSearch,onCart,onNotifications,onHome}:Readonly<{
 locale:Locale;quantity:number;searchOpen:boolean;onLocale:(locale:Locale)=>void;onSearch:()=>void;
 onCart:()=>void;onNotifications:()=>void;onHome:()=>void;
}>){
 const copy=text[locale];
 return <header className="client-header">
  <button className="brand-button" type="button" onClick={onHome} aria-label={locale==='es'?'Sabora — inicio':'Sabora — home'}><img src="/brand/sabora-logo-outline-v3.svg" alt="Sabora by Allaiso"/></button>
  <div className="header-actions">
   <div className="locale-switch" aria-label={locale==='es'?'Idioma':'Language'}><button type="button" aria-pressed={locale==='es'} onClick={()=>onLocale('es')}>ES</button><span>/</span><button type="button" aria-pressed={locale==='en'} onClick={()=>onLocale('en')}>EN</button></div>
   <button className={`icon-button${searchOpen?' active':''}`} type="button" onClick={onSearch} aria-label={searchOpen?copy.closeSearch:copy.searchButton} aria-expanded={searchOpen}><Icon name={searchOpen?'close':'search'}/></button>
   <button className="icon-button" type="button" onClick={onCart} aria-label={`${copy.cart}: ${quantity}`}><Icon name="bag"/>{quantity>0?<span className="count-badge">{quantity}</span>:null}</button>
   <button className="icon-button" type="button" onClick={onNotifications} aria-label={copy.notifications}><Icon name="bell"/></button>
  </div>
 </header>;
}

function EmptyState({children}:Readonly<{children:string}>){
 return <div className="empty-state" role="status"><Icon name="leaf"/><p>{children}</p></div>;
}

export function SaboraClientApp(){
 const [initial]=useState(()=>loadClientPreferences(localStorage));
 const [locale,setLocale]=useState<Locale>(initial.locale);
 const [alias,setAlias]=useState(initial.alias);
 const [company,setCompany]=useState(initial.company);
 const [favorites,setFavorites]=useState<readonly string[]>(initial.favorites);
 const [basket,setBasket]=useState<readonly BasketLine[]>(()=>loadBasket(localStorage));
 const [catalog,setCatalog]=useState<CatalogState>({status:'loading'});
 const [catalogAttempt,setCatalogAttempt]=useState(0);
 const [category,setCategory]=useState('Todos');
 const [query,setQuery]=useState('');
 const [searchOpen,setSearchOpen]=useState(false);
 const [onlyAvailable,setOnlyAvailable]=useState(false);
 const [area,setArea]=useState<ClientArea>('home');
 const [overlay,setOverlay]=useState<Overlay>(null);
 const [detail,setDetail]=useState<MenuItem|null>(null);
 const [notice,setNotice]=useState('');
 const searchRef=useRef<HTMLInputElement>(null);
 const copy=text[locale];

 useEffect(()=>{
  const controller=new AbortController();
  setCatalog({status:'loading'});
  void loadPublishedCatalog(fetch,controller.signal).then(state=>{if(!controller.signal.aborted)setCatalog(state);});
  return()=>controller.abort();
 },[catalogAttempt]);
 useEffect(()=>{if(searchOpen)searchRef.current?.focus();},[searchOpen]);
 useEffect(()=>{saveClientPreferences(localStorage,{locale,alias,company,favorites});},[locale,alias,company,favorites]);
 useEffect(()=>{saveBasket(localStorage,basket);},[basket]);
 useEffect(()=>{document.documentElement.lang=locale;document.title=locale==='es'?'Sabora · Carta digital':'Sabora · Digital menu';},[locale]);
 useEffect(()=>{if(catalog.status==='ready')setBasket(current=>reconcileBasket(current,catalog.items));},[catalog]);

 const items=catalog.status==='ready'?catalog.items:[];
 const categories=useMemo(()=>categoriesFor(items),[items]);
 useEffect(()=>{if(!categories.includes(category))setCategory('Todos');},[categories,category]);
 const visible=useMemo(()=>searchPublishedCatalog(items,category,query,onlyAvailable),[items,category,query,onlyAvailable]);
 const favoriteItems=useMemo(()=>items.filter(item=>favorites.some(id=>id.toLowerCase()===item.id.toLowerCase())),[items,favorites]);
 const quantities=useMemo(()=>new Map(basket.map(line=>[line.itemId,line.quantity])),[basket]);
 const totalQuantity=basketQuantity(basket);
 const total=basketTotal(basket);
 const issues=useMemo(()=>catalog.status==='ready'?basketIssues(basket,catalog.items):[],[basket,catalog]);
 const canRequestTableOrder=catalog.status==='ready'&&basket.length>0&&issues.length===0;

 const toggleFavorite=useCallback((id:string)=>setFavorites(current=>current.some(value=>value.toLowerCase()===id.toLowerCase())?current.filter(value=>value.toLowerCase()!==id.toLowerCase()):[...current,id]),[]);
 const updateQuantity=useCallback((item:MenuItem,delta:number)=>setBasket(current=>changeBasket(current,item,delta)),[]);
 const removeLine=useCallback((itemId:string)=>setBasket(current=>removeBasketLine(current,itemId)),[]);
 const goHome=useCallback(()=>{setArea('home');setOverlay(null);setNotice('');},[]);
 const closeOverlay=useCallback(()=>{setOverlay(null);if(area==='qr')setArea('home');},[area]);
 const selectArea=useCallback((next:ClientArea)=>{setNotice('');if(next==='qr'){setArea('qr');setOverlay('qr');return;}setOverlay(null);setArea(next);},[]);
 const switchLocale=useCallback((next:Locale)=>setLocale(next),[]);
 const toggleSearch=useCallback(()=>setSearchOpen(open=>!open),[]);
 const openCart=useCallback(()=>setOverlay('cart'),[]);
 const openNotifications=useCallback(()=>setOverlay('notifications'),[]);
 const openDetail=useCallback((item:MenuItem)=>setDetail(item),[]);
 const closeDetail=useCallback(()=>setDetail(null),[]);

 function saveSettings(event:FormEvent){
  event.preventDefault();
  const cleanAlias=alias.trim(),cleanCompany=company.trim();
  if([...cleanAlias].length>80||[...cleanCompany].length>160||/[\u0000-\u001f\u007f]/u.test(cleanAlias+cleanCompany)){
   setNotice(locale==='es'?'Revisa los datos introducidos.':'Check the entered details.');return;
  }
  setAlias(cleanAlias);setCompany(cleanCompany);
  const preferences:ClientPreferences={locale,alias:cleanAlias,company:cleanCompany,favorites};
  setNotice(saveClientPreferences(localStorage,preferences)?(locale==='es'?'Preferencias guardadas en este dispositivo.':'Preferences saved on this device.'):(locale==='es'?'No se han podido guardar las preferencias.':'Preferences could not be saved.'));
 }

 const productGrid=(products:readonly MenuItem[])=>products.length?<div className="product-grid">{products.map(item=><ProductCard key={item.id} item={item} quantity={quantities.get(item.id)??0} favorite={favorites.some(id=>id.toLowerCase()===item.id.toLowerCase())} locale={locale} onFavorite={toggleFavorite} onDetail={openDetail} onChange={updateQuantity}/>)}</div>:<EmptyState>{copy.empty}</EmptyState>;

 return <div className="client-app">
  <Header locale={locale} quantity={totalQuantity} searchOpen={searchOpen} onLocale={switchLocale} onSearch={toggleSearch} onCart={openCart} onNotifications={openNotifications} onHome={goHome}/>
  <div className={`search-panel${searchOpen?' open':''}`} aria-hidden={!searchOpen}><label htmlFor="catalog-search">{copy.search}</label><div><Icon name="search"/><input ref={searchRef} id="catalog-search" type="search" value={query} maxLength={100} placeholder={copy.search} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Escape')setSearchOpen(false);}}/></div></div>
  <main id="main-content" className="client-main">
   {area==='home'?<>
    <div className="announcement-region" aria-label={locale==='es'?'Anuncios vigentes':'Current announcements'} hidden/>
    <section className="menu-intro" aria-labelledby="menu-title"><span className="eyebrow">{copy.kicker}</span><h1 id="menu-title">{copy.menu}</h1><p className="editorial-line">{copy.hero}</p><p>{copy.intro}</p></section>
    {catalog.status==='ready'?<>
     <nav className="category-tabs" aria-label={locale==='es'?'Categorías de la carta':'Menu categories'}>{categories.map(item=><button key={item} type="button" aria-pressed={category===item} onClick={()=>setCategory(item)}>{item==='Todos'?copy.all:item}</button>)}</nav>
     <div className="catalog-filter"><label><input type="checkbox" checked={onlyAvailable} onChange={event=>setOnlyAvailable(event.target.checked)}/><span>{copy.available}</span></label><span>{visible.length} {locale==='es'?'platos':'dishes'}</span></div>
     {productGrid(visible)}
    </>:catalog.status==='loading'?<div className="loading-state" role="status"><span/><p>{copy.loading}</p></div>:<div className="error-state" role="alert"><h2>{copy.error}</h2><p>{copy.later}</p><button type="button" onClick={()=>setCatalogAttempt(value=>value+1)}>{copy.retry}</button></div>}
   </>:null}
   {area==='favorites'?<section className="secondary-page"><span className="eyebrow">SABORA</span><h1>{copy.favorites}</h1><p>{locale==='es'?'Tus platos guardados en este dispositivo. La disponibilidad se actualiza con la carta publicada.':'Dishes saved on this device. Availability refreshes with the published menu.'}</p>{productGrid(favoriteItems)}</section>:null}
   {area==='information'?<section className="secondary-page"><span className="eyebrow">SABORA</span><h1>{copy.info}</h1><div className="prose-card"><h2>{locale==='es'?'Carta digital del restaurante':'The restaurant’s digital menu'}</h2><p>{locale==='es'?'Consulta platos, precios y disponibilidad publicados. La selección que prepares se conserva solo en este dispositivo y se revalidará en el servidor antes de cualquier confirmación.':'Browse published dishes, prices and availability. Your selection is kept only on this device and will be revalidated by the server before any confirmation.'}</p><p className="honest-status">{locale==='es'?'El registro seguro, las reservas y el contexto de mesa todavía no están activados.':'Secure registration, reservations and table context are not active yet.'}</p></div></section>:null}
   {area==='allergens'?<section className="secondary-page"><span className="eyebrow">SABORA</span><h1>{copy.allergens}</h1><div className="prose-card"><h2>{locale==='es'?'Información antes de elegir':'Information before choosing'}</h2><p>{locale==='es'?'Cada ficha muestra los alérgenos declarados por el restaurante. La ausencia de un alérgeno declarado no garantiza la ausencia de trazas o contaminación cruzada.':'Each card shows allergens declared by the restaurant. No declared allergen does not guarantee absence of traces or cross-contamination.'}</p><p>{locale==='es'?'Si tienes una alergia, habla con el personal antes de confirmar tu selección.':'If you have an allergy, speak to the staff before confirming your selection.'}</p></div></section>:null}
   {area==='settings'?<section className="secondary-page"><span className="eyebrow">SABORA</span><h1>{copy.settings}</h1><form className="settings-form" onSubmit={saveSettings}><label htmlFor="alias">{locale==='es'?'Alias o apodo':'Alias or nickname'}</label><input id="alias" maxLength={80} autoComplete="nickname" value={alias} onChange={event=>setAlias(event.target.value)}/><label htmlFor="company">{locale==='es'?'Empresa (opcional)':'Company (optional)'}</label><input id="company" maxLength={160} value={company} onChange={event=>setCompany(event.target.value)}/><button className="primary-action" type="submit">{locale==='es'?'Guardar preferencias':'Save preferences'}</button>{notice?<p className="form-notice" role="status">{notice}</p>:null}<p className="privacy-copy">{locale==='es'?'Son preferencias visuales locales; no crean una cuenta, una identidad ni una sesión autenticada.':'These are local display preferences; they do not create an account, identity or authenticated session.'}</p></form></section>:null}
  </main>
  {totalQuantity>0&&overlay!=='cart'?<aside className="cart-summary" aria-label={copy.selection}><div><strong>{totalQuantity} {locale==='es'?'platos':'dishes'}</strong><span>{formatPrice(total,locale==='es'?'es-ES':'en-IE')}</span></div><button type="button" onClick={openCart}>{copy.view}<Icon name="arrow"/></button></aside>:null}
  <BottomNav locale={locale} active={area} onSelect={selectArea}/>

  {overlay==='notifications'?<Modal title={copy.notifications} onClose={closeOverlay} closeLabel={locale==='es'?'Cerrar':'Close'}><div className="modal-copy"><Icon name="bell"/><p>{locale==='es'?'No hay notificaciones autorizadas. Los avisos se mostrarán aquí cuando exista una suscripción real y consentida.':'There are no authorized notifications. Alerts will appear here once a real, consented subscription exists.'}</p><span className="honest-status">{locale==='es'?'Sin datos simulados':'No simulated data'}</span></div></Modal>:null}
  {overlay==='qr'?<Modal title={locale==='es'?'QR de mesa':'Table QR'} onClose={closeOverlay} closeLabel={locale==='es'?'Cerrar':'Close'}><div className="modal-copy"><Icon name="qr"/><p>{locale==='es'?'Escanea el QR auténtico de una mesa para poder pedir. La selección actual se conservará, pero Sabora no habilitará el pedido hasta que el servidor valide QR, mesa, visita e identidad.':'Scan an authentic table QR to order. Your current selection will be preserved, but Sabora will not enable ordering until the server validates the QR, table, visit and identity.'}</p><span className="honest-status">{locale==='es'?'Validación de QR todavía no activada':'QR validation is not active yet'}</span></div></Modal>:null}
  {overlay==='cart'?<Modal title={copy.selection} onClose={closeOverlay} closeLabel={locale==='es'?'Cerrar':'Close'}><div className="basket-lines">{basket.length?basket.map(line=>{const item=items.find(value=>value.id===line.itemId);return <article key={line.itemId}><div><h3>{line.name}</h3><p>{formatPrice(line.priceCents,locale==='es'?'es-ES':'en-IE')} · {item?(item.available?(locale==='es'?'Disponible':'Available'):(locale==='es'?'Agotado: retira el plato antes de pedir':'Sold out: remove this dish before ordering')):(locale==='es'?'Plato retirado de la carta: retíralo antes de pedir':'Dish no longer published: remove before ordering')}</p>{(!item||!item.available)?<button type="button" onClick={()=>removeLine(line.itemId)}>{locale==='es'?'Retirar de la cesta':'Remove from basket'}</button>:null}</div>{item?<div className="quantity-control"><button type="button" onClick={()=>updateQuantity(item,-1)} aria-label={`${locale==='es'?'Quitar una unidad de':'Remove one unit of'} ${item.name}`}><Icon name="minus"/></button><strong>{line.quantity}</strong><button type="button" disabled={!item.available} onClick={()=>updateQuantity(item,1)} aria-label={`${locale==='es'?'Añadir una unidad de':'Add one unit of'} ${item.name}`}><Icon name="plus"/></button></div>:null}</article>}):<EmptyState>{locale==='es'?'Tu selección está vacía.':'Your selection is empty.'}</EmptyState>}</div>{basket.length?<><div className="basket-total"><span>Total {locale==='es'?'informativo':'for reference'}</span><strong>{formatPrice(total,locale==='es'?'es-ES':'en-IE')}</strong></div><div className="basket-actions"><button type="button" disabled>{locale==='es'?'Reserva no disponible':'Reservation unavailable'}</button><button className="primary-action" type="button" disabled={!canRequestTableOrder} onClick={()=>{setOverlay('qr');setArea('qr');}}>{locale==='es'?'Pedir en mesa':'Order at table'}</button></div>{!canRequestTableOrder?<p role="status" className="privacy-copy">{catalog.status!=='ready'?(locale==='es'?'Espera a que se cargue la carta para revisar la selección.':'Wait for the menu to load before reviewing your selection.'):(locale==='es'?'Revisa y retira los platos agotados o retirados antes de continuar.':'Review and remove sold-out or unpublished dishes before continuing.')}</p>:null}<p className="privacy-copy">{locale==='es'?'Escanea el QR de tu mesa para realizar el pedido. La reserva permanece bloqueada hasta disponer de una API contractual.':'Scan your table QR to place the order. Reservation remains blocked until a contractual API is available.'}</p></>:null}</Modal>:null}
  {detail?<Modal title={detail.name} onClose={closeDetail} closeLabel={locale==='es'?'Cerrar':'Close'}><div className="detail-visual"><Icon name="leaf"/><span>{locale==='es'?'Imagen pendiente de activo autorizado':'Image awaiting an approved asset'}</span></div><p className="detail-category">{detail.category}</p><p>{detail.allergens.length?(locale==='es'?'Alérgenos declarados: ':'Declared allergens: ')+detail.allergens.join(', '):(locale==='es'?'No hay alérgenos declarados. Pregunta por posibles trazas.':'No allergens are declared. Ask about possible traces.')}</p><div className="detail-footer"><strong>{formatPrice(detail.priceCents,locale==='es'?'es-ES':'en-IE')}</strong>{detail.available?<button className="primary-action" type="button" onClick={()=>updateQuantity(detail,1)}>{locale==='es'?'Añadir a la selección':'Add to selection'}</button>:<button type="button" disabled>{locale==='es'?'Agotado':'Sold out'}</button>}</div></Modal>:null}
 </div>;
}
