import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {categoriesFor,formatPrice,searchPublishedCatalog,type CatalogState,type MenuItem} from './catalog';
import {loadPublishedCatalog} from './catalog-loader';
import {CLIENT_BASKET_STORAGE_KEY,acceptBasketPrice,basketIssues,basketQuantity,basketTotal,changeBasket,removeBasketLine,loadBasket,loadClientPreferences,reconcileBasket,saveBasket,saveClientPreferences,type BasketLine,type ClientPreferences,type Locale} from './client-state';
import {BottomNav,type ClientArea} from './components/BottomNav';
import {Icon} from './components/Icon';
import {Modal} from './components/Modal';
import {ProductCard} from './components/ProductCard';
import {TableQrScanner} from './components/TableQrScanner';
import {CheckoutPanel,type CheckoutPhase,type PaymentMode} from './components/CheckoutPanel';
import {createCustomerFlowTransport,CustomerFlowTransportError} from './customer-flow-transport';
import {subscribeCustomerEvents,type CustomerEvent} from './customer-event-stream';
import {configuredRestaurantCode,parseScannedTableQr,type InitialTableQr,type TableQrCredential} from './table-qr';

type Overlay='cart'|'notifications'|'qr'|'checkout'|null;
type CustomerIdentityState={status:'checking'|'guest'|'unavailable'}|{
 status:'authenticated';publicId:string;alias:string;company:string|null;
};
type TableVisit=Readonly<{tableId:string;visitId:string;basketId:string;expiresAt:string;
 paymentPolicy:Readonly<{requirePayAsOrdered:boolean;version:number}>|null}>;
type QuoteLine=Readonly<{quoteId:string;itemId:string;totalCents:number;expiresAt:string}>;
type QrState='idle'|'pending'|'identity_required'|'authorizing'|'authorized'|'invalid'|'forbidden'|'unavailable';
const customerTransport=createCustomerFlowTransport();
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

export function SaboraClientApp({initialTableQr=null,confirmStripePayment=null,
 flowContract='h6'}:Readonly<{
 initialTableQr?:InitialTableQr;
 confirmStripePayment?:((clientSecret:string)=>Promise<void>)|null;
 flowContract?:'h6'|'h3-candidate';
}>){
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
 const [area,setArea]=useState<ClientArea>(initialTableQr?'qr':'home');
 const [overlay,setOverlay]=useState<Overlay>(initialTableQr?'qr':null);
 const [detail,setDetail]=useState<MenuItem|null>(null);
 const [notice,setNotice]=useState('');
 const [identity,setIdentity]=useState<CustomerIdentityState>({status:'checking'});
 const [identityBusy,setIdentityBusy]=useState(false);
 const [qrState,setQrState]=useState<QrState>(initialTableQr?.status==='valid'?'pending':initialTableQr?'invalid':'idle');
 const [tableVisit,setTableVisit]=useState<TableVisit|null>(null);
 const [checkoutPhase,setCheckoutPhase]=useState<CheckoutPhase>('quoting');
 const [paymentMode,setPaymentMode]=useState<PaymentMode>('pay_now');
 const [quoteLines,setQuoteLines]=useState<readonly QuoteLine[]>([]);
 const [quotedTotal,setQuotedTotal]=useState(0);
 const [checkoutMessage,setCheckoutMessage]=useState<string|null>(null);
 const [eventScope,setEventScope]=useState<{accountId:string;roundId:string;orderId:string}|null>(null);
 const [customerEvents,setCustomerEvents]=useState<readonly CustomerEvent[]>([]);
 const searchRef=useRef<HTMLInputElement>(null);
 const qrCredentialRef=useRef<TableQrCredential|null>(initialTableQr?.status==='valid'?initialTableQr.credential:null);
 const qrAuthorizationRef=useRef<Promise<void>|null>(null);
 const checkoutRequestRef=useRef<string|null>(null);
 const acceptanceTokenRef=useRef<string|null>(null);
 const stripeClientSecretRef=useRef<string|null>(null);
 const copy=text[locale];

 const authorizeTable=useCallback((credential:TableQrCredential)=>{
  if(qrAuthorizationRef.current)return qrAuthorizationRef.current;
  setQrState('authorizing');
  const pending=customerTransport.authorizeVisit({tableId:credential.tableId,qrToken:credential.token})
   .then(visit=>{setTableVisit(visit);setQrState('authorized');})
   .catch(error=>{
    setTableVisit(null);
    setQrState(error instanceof CustomerFlowTransportError&&[401,403].includes(error.status)?'forbidden':'unavailable');
   })
   .finally(()=>{qrAuthorizationRef.current=null;});
  qrAuthorizationRef.current=pending;
  return pending;
 },[]);

 const acceptScannedQr=useCallback((payload:string)=>{
  let credential:TableQrCredential;
  try{credential=parseScannedTableQr(payload);}
  catch{setTableVisit(null);setQrState('invalid');return;}
  qrCredentialRef.current=credential;setTableVisit(null);
  if(identity.status==='authenticated')void authorizeTable(credential);
  else setQrState(identity.status==='checking'?'pending':identity.status==='guest'?'identity_required':'unavailable');
 },[authorizeTable,identity.status]);

 useEffect(()=>{
  const controller=new AbortController();
  setCatalog({status:'loading'});
  void loadPublishedCatalog(fetch,controller.signal).then(state=>{if(!controller.signal.aborted)setCatalog(state);});
  return()=>controller.abort();
 },[catalogAttempt]);
 useEffect(()=>{
  let active=true;
  void customerTransport.session().then(profile=>{
   if(!active)return;
   setIdentity({status:'authenticated',...profile});
   setAlias(profile.alias);setCompany(profile.company??'');
  }).catch(error=>{
   if(!active)return;
   setIdentity(error instanceof CustomerFlowTransportError&&error.status===401?
    {status:'guest'}:{status:'unavailable'});
  });
  return()=>{active=false;};
 },[]);
 useEffect(()=>{
  const credential=qrCredentialRef.current;
  if(identity.status==='authenticated'&&credential&&['pending','identity_required'].includes(qrState))
   void authorizeTable(credential);
 },[authorizeTable,identity.status,qrState]);
 useEffect(()=>{if(searchOpen)searchRef.current?.focus();},[searchOpen]);
 useEffect(()=>{saveClientPreferences(localStorage,{locale,alias,company,favorites});},[locale,alias,company,favorites]);
 useEffect(()=>{saveBasket(localStorage,basket);},[basket]);
 useEffect(()=>{
  const onStorage=(event:StorageEvent)=>{
   if(event.storageArea!==localStorage||event.key!==CLIENT_BASKET_STORAGE_KEY)return;
   const latest=loadBasket(localStorage);
   setBasket(current=>JSON.stringify(current)===JSON.stringify(latest)?current:latest);
  };
  window.addEventListener('storage',onStorage);
  return()=>window.removeEventListener('storage',onStorage);
 },[]);
 useEffect(()=>{
  if(!eventScope||!tableVisit)return;
  return subscribeCustomerEvents({tableId:tableVisit.tableId,visitId:tableVisit.visitId,
   accountId:eventScope.accountId,onEvent:event=>{
    setCustomerEvents(current=>Object.freeze([...current.slice(-49),event]));
    if(event.type==='sabora.payment.requires_action')setCheckoutPhase('payment_action');
    if(event.type==='sabora.payment.authorized'){
     setCheckoutPhase('confirmed');setBasket(Object.freeze([]));
     checkoutRequestRef.current=null;acceptanceTokenRef.current=null;stripeClientSecretRef.current=null;
    }
    if(event.type==='sabora.payment.authorization_unknown'||event.type==='sabora.payment.capture_unknown'){
     setCheckoutPhase('error');setCheckoutMessage(locale==='es'?
      'El resultado del proveedor es incierto. No intentes otro medio de pago; pide ayuda al personal.':
      'The provider result is uncertain. Do not try another payment method; ask staff for help.');
    }
    if(event.type==='sabora.kitchen.dispatch_acknowledged')setCheckoutMessage(locale==='es'?
     'Cocina ha recibido el pedido.':'The kitchen has received the order.');
   },onResync:()=>{
    setCheckoutMessage(locale==='es'?'El historial disponible ha caducado; se requiere una recarga segura.':
     'The available history has expired; a secure reload is required.');
   },onUnavailable:()=>{
    setCheckoutMessage(locale==='es'?'El canal de seguimiento perdió autorización. Vuelve a validar la mesa.':
     'The tracking channel lost authorization. Validate the table again.');
   }});
 },[eventScope,locale,tableVisit]);

 useEffect(()=>{document.documentElement.lang=locale;document.title=locale==='es'?'Sabora · Carta digital':'Sabora · Digital menu';},[locale]);
 useEffect(()=>{if(catalog.status==='ready')setBasket(current=>reconcileBasket(current,catalog.items));},[catalog]);

 const items=catalog.status==='ready'?catalog.items:[];
 const categories=useMemo(()=>categoriesFor(items),[items]);
 useEffect(()=>{if(!categories.includes(category))setCategory('Todos');},[categories,category]);
 const visible=useMemo(()=>searchPublishedCatalog(items,category,query,onlyAvailable),[items,category,query,onlyAvailable]);
 const favoriteItems=useMemo(()=>items.filter(item=>favorites.some(id=>id.toLowerCase()===item.id.toLowerCase())),[items,favorites]);
 const quantities=useMemo(()=>new Map(basket.map(line=>[line.itemId.toLowerCase(),line.quantity])),[basket]);
 const totalQuantity=basketQuantity(basket);
 const total=basketTotal(basket);
 const issues=useMemo(()=>catalog.status==='ready'?basketIssues(basket,catalog.items):[],[basket,catalog]);
 const canRequestTableOrder=catalog.status==='ready'&&basket.length>0&&issues.length===0;
 const issueCounts=useMemo(()=>({soldOut:issues.filter(issue=>issue.reason==='sold_out').length,unpublished:issues.filter(issue=>issue.reason==='unpublished').length,priceChanged:issues.filter(issue=>issue.reason==='price_changed').length}),[issues]);

 const toggleFavorite=useCallback((id:string)=>setFavorites(current=>current.some(value=>value.toLowerCase()===id.toLowerCase())?current.filter(value=>value.toLowerCase()!==id.toLowerCase()):[...current,id]),[]);
 const updateQuantity=useCallback((item:MenuItem,delta:number)=>setBasket(current=>changeBasket(current,item,delta)),[]);
 const removeLine=useCallback((itemId:string)=>setBasket(current=>removeBasketLine(current,itemId)),[]);
 const acceptPrice=useCallback((itemId:string)=>setBasket(current=>acceptBasketPrice(current,items,itemId)),[items]);
 const goHome=useCallback(()=>{setArea('home');setOverlay(null);setNotice('');},[]);
 const closeOverlay=useCallback(()=>{setOverlay(null);if(area==='qr')setArea('home');},[area]);
 const selectArea=useCallback((next:ClientArea)=>{setNotice('');if(next==='qr'){setArea('qr');setOverlay('qr');return;}setOverlay(null);setArea(next);},[]);
 const switchLocale=useCallback((next:Locale)=>setLocale(next),[]);
 const toggleSearch=useCallback(()=>setSearchOpen(open=>!open),[]);
 const openCart=useCallback(()=>setOverlay('cart'),[]);
 const openNotifications=useCallback(()=>setOverlay('notifications'),[]);
 const openDetail=useCallback((item:MenuItem)=>setDetail(item),[]);
 const closeDetail=useCallback(()=>setDetail(null),[]);

 const prepareCheckout=useCallback(async()=>{
  const credential=qrCredentialRef.current;
  if(!tableVisit||!credential||identity.status!=='authenticated'){
   setOverlay('qr');setArea('qr');return;
  }
  setOverlay('checkout');setCheckoutPhase('quoting');setCheckoutMessage(null);
  checkoutRequestRef.current=`ui_${crypto.randomUUID().replaceAll('-','_')}`;
  acceptanceTokenRef.current=null;stripeClientSecretRef.current=null;
  try{
   const quote=await customerTransport.quote({tableId:tableVisit.tableId,qrToken:credential.token,
    visitId:tableVisit.visitId,basketId:tableVisit.basketId,
    lines:basket.map(line=>({itemId:line.itemId,selection:{options:{},extras:[]},quantity:line.quantity}))});
   const nextTotal=quote.lines.reduce((sum,line)=>sum+line.totalCents,0);
   setQuoteLines(quote.lines);setQuotedTotal(nextTotal);
   setPaymentMode(tableVisit.paymentPolicy?.requirePayAsOrdered?'pay_now':paymentMode);
   setCheckoutPhase('ready');
  }catch{
   setCheckoutPhase('error');setCheckoutMessage(locale==='es'?
    'No se pudo revalidar la selección. La cesta no se ha confirmado.':
    'The selection could not be revalidated. The basket was not confirmed.');
  }
 },[basket,identity.status,locale,paymentMode,tableVisit]);

 const reconcileCheckout=useCallback(async()=>{
  const credential=qrCredentialRef.current,requestKey=checkoutRequestRef.current;
  if(!tableVisit||!credential||!requestKey)return;
  setCheckoutPhase('confirming');
  try{
   const result=await customerTransport.lookupConfirmation({
    tableId:tableVisit.tableId,qrToken:credential.token,visitId:tableVisit.visitId,
    basketId:tableVisit.basketId,requestKey});
   if(result.status==='confirmed'){
    setBasket(Object.freeze([]));checkoutRequestRef.current=null;acceptanceTokenRef.current=null;
    setCheckoutPhase('confirmed');setCheckoutMessage(locale==='es'?
     'Pedido recuperado y confirmado sin volver a enviarlo.':
     'Order recovered and confirmed without resubmitting.');
   }else{
    setCheckoutPhase('uncertain');setCheckoutMessage(locale==='es'?
     'No consta una confirmación. Conservamos la cesta: no se reenviará automáticamente. Consulta de nuevo o solicita ayuda al personal.':
     'No confirmation was found. Your basket is retained; it will not be automatically resubmitted. Check again or ask staff.');
   }
  }catch{
   setCheckoutPhase('uncertain');setCheckoutMessage(locale==='es'?
    'No es posible verificar el pedido ahora. No se reenviará automáticamente.':
    'Unable to verify the order now. It will not be automatically resubmitted.');
  }
 },[locale,tableVisit]);

 const confirmCheckout=useCallback(async()=>{
  const credential=qrCredentialRef.current,requestKey=checkoutRequestRef.current;
  if(!tableVisit||!credential||!requestKey||quoteLines.length!==basket.length)return;
  setCheckoutPhase('confirming');setCheckoutMessage(null);
  try{
   const result=await customerTransport.confirm({tableId:tableVisit.tableId,qrToken:credential.token,
    visitId:tableVisit.visitId,basketId:tableVisit.basketId,requestKey,
    ...(flowContract==='h6'?{paymentMode:quotedTotal===0?null:paymentMode}:{}),
    lines:quoteLines.map(quote=>{const line=basket.find(item=>item.itemId.toLowerCase()===quote.itemId.toLowerCase());
     return {quoteId:quote.quoteId,itemId:quote.itemId,selection:{options:{},extras:[]},quantity:line?.quantity??0};}),
    ...(acceptanceTokenRef.current?{acceptanceToken:acceptanceTokenRef.current}:null)});
   if(typeof result.accountId==='string'&&typeof result.roundId==='string')
    setEventScope({accountId:result.accountId,roundId:result.roundId,orderId:result.orderId});
   if(result.requiresPaymentAction===true&&typeof result.clientSecret==='string'){
    stripeClientSecretRef.current=result.clientSecret;
    if(confirmStripePayment){
     try{await confirmStripePayment(result.clientSecret);
      setBasket(Object.freeze([]));checkoutRequestRef.current=null;acceptanceTokenRef.current=null;
      stripeClientSecretRef.current=null;
      setCheckoutPhase('confirmed');setCheckoutMessage(locale==='es'?
       'La autenticación del pago se completó; el estado definitivo llegará por el canal seguro.':
       'Payment authentication completed; final state will arrive through the secure channel.');}
     catch{setCheckoutPhase('payment_action');setCheckoutMessage(locale==='es'?
      'Stripe no confirmó la acción. Reintenta con la misma operación; no se creará un cobro nuevo.':
      'Stripe did not confirm the action. Retry the same operation; no new charge will be created.');}
    }else{
     setCheckoutPhase('payment_action');setCheckoutMessage(locale==='es'?
      'Esta compilación no tiene conectado el componente autorizado de Stripe. El pedido queda pendiente, sin inventar un pago correcto.':
      'This build has no authorized Stripe component connected. The order remains pending without inventing payment success.');
    }
   }else{
    setBasket(Object.freeze([]));checkoutRequestRef.current=null;acceptanceTokenRef.current=null;
    setCheckoutPhase('confirmed');setCheckoutMessage(locale==='es'?
     'Pedido registrado. El envío a cocina respetará la ventana y la política de pago.':
     'Order recorded. Kitchen dispatch will respect the grouping window and payment policy.');
   }
  }catch(error){
   if(error instanceof CustomerFlowTransportError&&error.message==='acceptance_required'&&
      typeof error.details?.acceptanceToken==='string'){
    acceptanceTokenRef.current=error.details.acceptanceToken;
    setCheckoutPhase('ready');setCheckoutMessage(locale==='es'?
     'El precio cambió durante la confirmación. Revisa el total y confirma expresamente de nuevo.':
     'The price changed during confirmation. Review the total and explicitly confirm again.');
    return;
   }
   if(error instanceof CustomerFlowTransportError&&error.status===503){
    setCheckoutPhase('uncertain');setCheckoutMessage(locale==='es'?
     'La respuesta se perdió o el servidor no está disponible. Consulta el resultado antes de cualquier nuevo intento.':
     'The response was lost or the server is unavailable. Check the result before attempting again.');
    return;
   }
   setCheckoutPhase('error');setCheckoutMessage(error instanceof CustomerFlowTransportError&&
    error.message==='payment_policy_conflict'?(locale==='es'?
     'La política de pago de la mesa cambió. Vuelve a validar el pedido.':
     'The table payment policy changed. Validate the order again.'):(locale==='es'?
     'No se confirmó el pedido. Puedes reintentar sin duplicarlo.':
     'The order was not confirmed. You can retry without duplicating it.'));
  }
 },[basket,confirmStripePayment,flowContract,locale,paymentMode,quoteLines,quotedTotal,tableVisit]);

 async function saveSettings(event:FormEvent){
  event.preventDefault();
  const cleanAlias=alias.trim(),cleanCompany=company.trim();
  if(!cleanAlias||[...cleanAlias].length>80||[...cleanCompany].length>160||/[\u0000-\u001f\u007f]/u.test(cleanAlias+cleanCompany)){
   setNotice(locale==='es'?'Revisa los datos introducidos.':'Check the entered details.');return;
  }
  setAlias(cleanAlias);setCompany(cleanCompany);
  const preferences:ClientPreferences={locale,alias:cleanAlias,company:cleanCompany,favorites};
  const localSaved=saveClientPreferences(localStorage,preferences);
  if(identity.status==='authenticated'){
   setNotice(localSaved?(locale==='es'?'Preferencias guardadas en este dispositivo. La identidad autenticada no se modifica.':'Preferences saved on this device. The authenticated identity is unchanged.'):(locale==='es'?'No se han podido guardar las preferencias.':'Preferences could not be saved.'));
   return;
  }
  if(identity.status==='unavailable'){
   setNotice(locale==='es'?'Preferencias locales guardadas; la identidad segura no está disponible.':'Local preferences saved; secure identity is unavailable.');
   return;
  }
  if(identity.status==='checking'||identityBusy){return;}
  setIdentityBusy(true);setNotice(locale==='es'?'Creando identidad segura…':'Creating secure identity…');
  try{
   const profile=await customerTransport.register({alias:cleanAlias,company:cleanCompany||null});
   setIdentity({status:'authenticated',...profile});
   setNotice(locale==='es'?`Identidad creada: ${profile.publicId}`:`Identity created: ${profile.publicId}`);
  }catch{
   setNotice(locale==='es'?'No se ha podido crear la identidad. Inténtalo de nuevo.':'The identity could not be created. Try again.');
   setIdentity({status:'unavailable'});
  }finally{setIdentityBusy(false);}
 }

 async function logout(){
  if(identity.status!=='authenticated'||identityBusy)return;
  setIdentityBusy(true);
  try{await customerTransport.logout();setIdentity({status:'guest'});
   qrCredentialRef.current=null;setTableVisit(null);setQrState('idle');setEventScope(null);setCustomerEvents([]);
   setNotice(locale==='es'?'Sesión cerrada en este dispositivo.':'Session closed on this device.');}
  catch{setNotice(locale==='es'?'No se ha podido cerrar la sesión con seguridad.':'The session could not be closed securely.');}
  finally{setIdentityBusy(false);}
 }

 const productGrid=(products:readonly MenuItem[])=>products.length?<div className="product-grid">{products.map(item=><ProductCard key={item.id} item={item} quantity={quantities.get(item.id.toLowerCase())??0} favorite={favorites.some(id=>id.toLowerCase()===item.id.toLowerCase())} locale={locale} onFavorite={toggleFavorite} onDetail={openDetail} onChange={updateQuantity}/>)}</div>:<EmptyState>{copy.empty}</EmptyState>;

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
   {area==='information'?<section className="secondary-page"><span className="eyebrow">SABORA</span><h1>{copy.info}</h1><div className="prose-card"><h2>{locale==='es'?'Carta digital del restaurante':'The restaurant’s digital menu'}</h2><p>{locale==='es'?'Consulta platos, precios y disponibilidad publicados. La selección que prepares se conserva solo en este dispositivo y se revalidará en el servidor antes de cualquier confirmación.':'Browse published dishes, prices and availability. Your selection is kept only on this device and will be revalidated by the server before any confirmation.'}</p><p className="honest-status">{locale==='es'?'La identidad, el QR, el importe y la política de pago se validan en servidor. Pagar ahora requiere el componente Stripe autorizado de la instalación.':'Identity, QR, amount and payment policy are validated by the server. Pay now requires the installation’s authorized Stripe component.'}</p></div></section>:null}
   {area==='allergens'?<section className="secondary-page"><span className="eyebrow">SABORA</span><h1>{copy.allergens}</h1><div className="prose-card"><h2>{locale==='es'?'Información antes de elegir':'Information before choosing'}</h2><p>{locale==='es'?'Cada ficha muestra los alérgenos declarados por el restaurante. La ausencia de un alérgeno declarado no garantiza la ausencia de trazas o contaminación cruzada.':'Each card shows allergens declared by the restaurant. No declared allergen does not guarantee absence of traces or cross-contamination.'}</p><p>{locale==='es'?'Si tienes una alergia, habla con el personal antes de confirmar tu selección.':'If you have an allergy, speak to the staff before confirming your selection.'}</p></div></section>:null}
   {area==='settings'?<section className="secondary-page"><span className="eyebrow">SABORA</span><h1>{copy.settings}</h1><form className="settings-form" onSubmit={saveSettings}><label htmlFor="alias">{locale==='es'?'Alias o apodo':'Alias or nickname'}</label><input id="alias" required maxLength={80} autoComplete="nickname" value={alias} onChange={event=>setAlias(event.target.value)}/><label htmlFor="company">{locale==='es'?'Empresa (opcional)':'Company (optional)'}</label><input id="company" maxLength={160} value={company} onChange={event=>setCompany(event.target.value)}/><button className="primary-action" type="submit" disabled={identityBusy||identity.status==='checking'||identity.status==='unavailable'}>{identity.status==='authenticated'?(locale==='es'?'Guardar preferencias':'Save preferences'):identity.status==='unavailable'?(locale==='es'?'Identidad no disponible':'Identity unavailable'):(locale==='es'?'Crear identidad segura':'Create secure identity')}</button>{identity.status==='authenticated'?<button type="button" disabled={identityBusy} onClick={()=>void logout()}>{locale==='es'?'Cerrar sesión':'Sign out'}</button>:null}{notice?<p className="form-notice" role="status">{notice}</p>:null}<p className="privacy-copy">{identity.status==='authenticated'?(locale==='es'?`Sesión segura activa · ${identity.publicId}. La credencial permanece en una cookie HttpOnly y no se guarda en la PWA.`:`Secure session active · ${identity.publicId}. The credential remains in an HttpOnly cookie and is not stored by the PWA.`):(locale==='es'?'El alias es obligatorio y la empresa opcional. La sesión segura se crea en el servidor; favoritos y preferencias visuales permanecen en este dispositivo.':'Alias is required and company is optional. The secure session is created on the server; favorites and visual preferences stay on this device.')}</p></form></section>:null}
  </main>
  {totalQuantity>0&&overlay!=='cart'?<aside className="cart-summary" aria-label={copy.selection}><div><strong>{totalQuantity} {locale==='es'?'platos':'dishes'}</strong><span>{formatPrice(total,locale==='es'?'es-ES':'en-IE')}</span></div><button type="button" onClick={openCart}>{copy.view}<Icon name="arrow"/></button></aside>:null}
  <BottomNav locale={locale} active={area} onSelect={selectArea}/>

  {overlay==='notifications'?<Modal title={copy.notifications} onClose={closeOverlay} closeLabel={locale==='es'?'Cerrar':'Close'}><div className="modal-copy"><Icon name="bell"/>{customerEvents.length?<ol className="customer-event-list">{[...customerEvents].reverse().map(event=><li key={`${event.id}-${event.type}`}><strong>{event.type.replace('sabora.','').replaceAll('_',' ')}</strong><span>{new Date(event.createdAt).toLocaleTimeString(locale==='es'?'es-ES':'en-GB',{hour:'2-digit',minute:'2-digit'})}</span></li>)}</ol>:<p>{locale==='es'?'Todavía no hay eventos autorizados para esta cuenta.':'There are no authorized events for this account yet.'}</p>}<span className="honest-status">{eventScope?(locale==='es'?'Canal SSE durable conectado, sin sondeo periódico':'Durable SSE channel connected, without periodic polling'):(locale==='es'?'El canal se abre al confirmar un pedido':'The channel opens after confirming an order')}</span></div></Modal>:null}
  {overlay==='qr'?<Modal title={locale==='es'?'QR de mesa':'Table QR'} onClose={closeOverlay} closeLabel={locale==='es'?'Cerrar':'Close'}><div className="modal-copy qr-flow"><Icon name="qr"/><p>{locale==='es'?'Escanea el QR auténtico de la mesa. Sabora conservará tu selección y el servidor comprobará identidad, credencial revocable, estado y visita antes de habilitar el pedido.':'Scan the authentic table QR. Sabora keeps your selection, and the server verifies identity, revocable credential, state and visit before enabling ordering.'}</p>
   {qrState==='authorized'&&tableVisit?<><div className="qr-success" role="status"><Icon name="check"/><div><strong>{locale==='es'?'Mesa verificada':'Table verified'}</strong><span>{locale==='es'?`Autorización válida hasta ${new Date(tableVisit.expiresAt).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}.`:`Authorization valid until ${new Date(tableVisit.expiresAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}.`}</span></div></div>{basket.length&&issues.length===0?<button className="primary-action" type="button" onClick={()=>void prepareCheckout()}>{locale==='es'?'Continuar con el pedido':'Continue with order'}</button>:null}<button type="button" onClick={()=>{qrCredentialRef.current=null;setTableVisit(null);setQrState('idle');}}>{locale==='es'?'Escanear de nuevo':'Scan again'}</button></>:
    qrState==='authorizing'?<span className="honest-status" role="status">{locale==='es'?'Validando mesa y visita…':'Validating table and visit…'}</span>:
    qrState==='identity_required'?<><span className="honest-status" role="status">{locale==='es'?'Crea tu identidad segura para validar esta mesa. El QR queda pendiente solo en memoria.':'Create your secure identity to validate this table. The QR remains pending in memory only.'}</span><button className="primary-action" type="button" onClick={()=>{setOverlay(null);setArea('settings');}}>{locale==='es'?'Crear identidad':'Create identity'}</button></>:
    qrState==='invalid'?<><span className="qr-error" role="alert">{locale==='es'?'Este QR no cumple el contrato seguro de Sabora o pertenece a otra instalación.':'This QR does not meet Sabora’s secure contract or belongs to another installation.'}</span><button type="button" onClick={()=>setQrState('idle')}>{locale==='es'?'Intentar otro QR':'Try another QR'}</button></>:
    qrState==='forbidden'?<><span className="qr-error" role="alert">{locale==='es'?'El QR, la mesa o la sesión ya no están autorizados. Solicita ayuda al personal.':'The QR, table or session is no longer authorized. Ask staff for help.'}</span><button type="button" onClick={()=>setQrState('idle')}>{locale==='es'?'Escanear otro QR':'Scan another QR'}</button></>:
    qrState==='unavailable'?<><span className="qr-error" role="alert">{locale==='es'?'No se ha podido verificar la mesa. No se ha habilitado ningún pedido.':'The table could not be verified. Ordering has not been enabled.'}</span><button type="button" onClick={()=>{const credential=qrCredentialRef.current;if(identity.status==='authenticated'&&credential)void authorizeTable(credential);else setQrState('idle');}}>{locale==='es'?'Reintentar':'Try again'}</button></>:
    configuredRestaurantCode()?<TableQrScanner locale={locale} onScan={acceptScannedQr}/>:
    <span className="qr-error" role="alert">{locale==='es'?'Esta instalación aún no tiene configurado su código de restaurante.':'This installation does not have its restaurant code configured yet.'}</span>}
   <p className="privacy-copy">{locale==='es'?'El token no se guarda en el historial ni en el almacenamiento del navegador. El QR identifica contexto de mesa; no acredita presencia física ni permite ver cuentas ajenas.':'The token is not kept in browser history or storage. The QR identifies table context; it does not prove physical presence or grant access to other accounts.'}</p></div></Modal>:null}
  {overlay==='cart'?<Modal title={copy.selection} onClose={closeOverlay} closeLabel={locale==='es'?'Cerrar':'Close'}><div className="basket-lines">{basket.length?basket.map(line=>{const item=items.find(value=>value.id.toLowerCase()===line.itemId.toLowerCase());return <article key={line.itemId}><div><h3>{line.name}</h3><p>{formatPrice(line.priceCents,locale==='es'?'es-ES':'en-IE')} · {item?(item.available?(locale==='es'?'Disponible':'Available'):(locale==='es'?'Agotado: retira el plato antes de pedir':'Sold out: remove this dish before ordering')):(locale==='es'?'Plato retirado de la carta: retíralo antes de pedir':'Dish no longer published: remove before ordering')}</p>{item&&item.available&&item.priceCents!==line.priceCents?<p role="status">{locale==='es'?'El precio ha cambiado a ':'The price has changed to '}{formatPrice(item.priceCents,locale==='es'?'es-ES':'en-IE')}<button type="button" onClick={()=>acceptPrice(line.itemId)}>{locale==='es'?'Aceptar nuevo precio':'Accept new price'}</button></p>:null}{(!item||!item.available||item.priceCents!==line.priceCents)?<button type="button" onClick={()=>removeLine(line.itemId)}>{locale==='es'?'Retirar de la cesta':'Remove from basket'}</button>:null}</div>{item?<div className="quantity-control"><button type="button" onClick={()=>updateQuantity(item,-1)} aria-label={`${locale==='es'?'Quitar una unidad de':'Remove one unit of'} ${item.name}`}><Icon name="minus"/></button><strong>{line.quantity}</strong><button type="button" disabled={!item.available} onClick={()=>updateQuantity(item,1)} aria-label={`${locale==='es'?'Añadir una unidad de':'Add one unit of'} ${item.name}`}><Icon name="plus"/></button></div>:null}</article>}):<EmptyState>{locale==='es'?'Tu selección está vacía.':'Your selection is empty.'}</EmptyState>}</div>{basket.length?<><div className="basket-total"><span>Total {locale==='es'?'informativo':'for reference'}</span><strong>{formatPrice(total,locale==='es'?'es-ES':'en-IE')}</strong></div>{issues.length>0?<div className="prose-card" role="status" aria-live="polite"><h3>{locale==='es'?'Selección pendiente de revisión':'Selection needs review'}</h3><p>{locale==='es'?`${issues.length} plato(s) requieren una decisión antes de continuar.`:`${issues.length} dish(es) need your decision before continuing.`}</p><ul>{issueCounts.soldOut>0?<li>{locale==='es'?`${issueCounts.soldOut} agotado(s)`: `${issueCounts.soldOut} sold out`}</li>:null}{issueCounts.unpublished>0?<li>{locale==='es'?`${issueCounts.unpublished} retirado(s)`: `${issueCounts.unpublished} unpublished`}</li>:null}{issueCounts.priceChanged>0?<li>{locale==='es'?`${issueCounts.priceChanged} con precio actualizado`: `${issueCounts.priceChanged} with updated prices`}</li>:null}</ul></div>:null}<div className="basket-actions"><button type="button" disabled>{locale==='es'?'Reserva no disponible':'Reservation unavailable'}</button><button className="primary-action" type="button" disabled={!canRequestTableOrder} onClick={()=>{if(tableVisit)void prepareCheckout();else {setOverlay('qr');setArea('qr');}}}>{tableVisit?(locale==='es'?'Revalidar y continuar':'Revalidate and continue'):(locale==='es'?'Validar mesa para pedir':'Validate table to order')}</button></div>{!canRequestTableOrder?<p role="status" className="privacy-copy">{catalog.status!=='ready'?(locale==='es'?'Espera a que se cargue la carta para revisar la selección.':'Wait for the menu to load before reviewing your selection.'):(locale==='es'?'Revisa los platos agotados, retirados o con cambios de precio. Retira los no disponibles o acepta expresamente los nuevos precios.':'Review sold-out, unpublished or repriced dishes. Remove unavailable dishes or explicitly accept new prices.')}</p>:null}<p className="privacy-copy">{locale==='es'?'El servidor revalida la cesta antes de elegir pago. Las reservas permanecen en un circuito separado.':'The server revalidates the basket before payment choice. Reservations remain in a separate flow.'}</p></>:null}</Modal>:null}
  {overlay==='checkout'?<Modal title={locale==='es'?'Confirmar pedido':'Confirm order'} onClose={closeOverlay} closeLabel={locale==='es'?'Cerrar':'Close'}><CheckoutPanel locale={locale} totalCents={quotedTotal} phase={checkoutPhase} paymentMode={paymentMode} requirePayAsOrdered={tableVisit?.paymentPolicy?.requirePayAsOrdered??false} paymentsEnabled={flowContract==='h6'} message={checkoutMessage} onPaymentMode={setPaymentMode} onConfirm={()=>void confirmCheckout()} onRetry={()=>{if(checkoutPhase==='uncertain')void reconcileCheckout();else if(quoteLines.length&&checkoutRequestRef.current)void confirmCheckout();else void prepareCheckout();}}/></Modal>:null}
  {detail?<Modal title={detail.name} onClose={closeDetail} closeLabel={locale==='es'?'Cerrar':'Close'}><div className="detail-visual"><Icon name="leaf"/><span>{locale==='es'?'Imagen pendiente de activo autorizado':'Image awaiting an approved asset'}</span></div><p className="detail-category">{detail.category}</p><p>{detail.allergens.length?(locale==='es'?'Alérgenos declarados: ':'Declared allergens: ')+detail.allergens.join(', '):(locale==='es'?'No hay alérgenos declarados. Pregunta por posibles trazas.':'No allergens are declared. Ask about possible traces.')}</p><div className="detail-footer"><strong>{formatPrice(detail.priceCents,locale==='es'?'es-ES':'en-IE')}</strong>{detail.available?<button className="primary-action" type="button" onClick={()=>updateQuantity(detail,1)}>{locale==='es'?'Añadir a la selección':'Add to selection'}</button>:<button type="button" disabled>{locale==='es'?'Agotado':'Sold out'}</button>}</div></Modal>:null}
 </div>;
}
