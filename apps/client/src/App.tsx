import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {catalogUnitPrice,categoriesFor,formatPrice,searchPublishedCatalog,type CatalogSelection,type CatalogState,type MenuItem} from './catalog';
import {loadPublishedCatalog} from './catalog-loader';
import {CLIENT_BASKET_STORAGE_KEY,acceptBasketPrice,basketIssues,basketQuantity,basketTotal,changeBasket,configureBasketLine,removeBasketLine,basketLineKey,loadBasket,loadClientPreferences,reconcileBasket,saveBasket,saveClientPreferences,type BasketLine,type ClientPreferences,type Locale} from './client-state';
import {BottomNav,type ClientArea} from './components/BottomNav';
import {Icon} from './components/Icon';
import {Modal} from './components/Modal';
import {ProductCard} from './components/ProductCard';
import {TableQrScanner} from './components/TableQrScanner';
import {CheckoutPanel,type CheckoutPhase,type PaymentMode} from './components/CheckoutPanel';
import {ThirdPartyCashPanel} from './components/ThirdPartyCashPanel';
import {CommunicationsBar} from './components/CommunicationsBar';
import {createCustomerFlowTransport,CustomerFlowTransportError} from './customer-flow-transport';
import {subscribeCustomerEvents,type CustomerEvent} from './customer-event-stream';
import {subscribeCustomerTableChange} from './customer-table-change-events';
import {configuredRestaurantCode,parseScannedTableQr,type InitialTableQr,type TableQrCredential} from './table-qr';

type Overlay='cart'|'notifications'|'qr'|'checkout'|'revision'|'pay-others'|null;
type CustomerIdentityState={status:'checking'|'guest'|'unavailable'}|{
 status:'authenticated';publicId:string;alias:string;company:string|null;
};
type TableVisit=Readonly<{tableId:string;visitId:string;basketId:string;expiresAt:string;
 paymentPolicy:Readonly<{requirePayAsOrdered:boolean;version:number}>|null}>;
type CheckoutPaymentPolicy=Readonly<{selectedMode:PaymentMode|null;
 requirePayAsOrdered:boolean;version:number}>;
type QuoteLine=Readonly<{quoteId:string;itemId:string;totalCents:number;expiresAt:string;lineKey:string;quantity:number;priceCents:number}>;
type QrState='idle'|'pending'|'identity_required'|'authorizing'|'authorized'|
 'invalid'|'forbidden'|'unavailable'|'checking_change'|'change_prompt'|
 'change_pending'|'change_rejected'|'change_approved'|'change_error';
type TableChangeState=Readonly<{
 state:'unbound'|'bound'|'pending'|'approved'|'rejected';
 boundTableId:string|null;expiresAtMs:number|null;serverNowMs:number;
}>;
type PendingRevision=Readonly<{orderId:string;roundId:string;revisionNumber:number;
 amountCents:number;paymentMode:'pay_now'|'pay_at_end'|null;
 lines:ReadonlyArray<Readonly<{lineNumber:number;itemId:string;itemName:string;
  quantity:number;totalCents:number;affected:boolean}>>}>;
type RevisionChange=Readonly<{lineNumber:number;previousItemName:string;currentItemName:string;
 previousTotalCents:number;currentTotalCents:number;differenceCents:number}>;
type RevisionReplacement=Readonly<{lineNumber:number;quoteId:string;itemId:string;
 selection:Readonly<{options:Readonly<Record<string,string[]>>;extras:readonly string[]}>;
 quantity:number}>;
const APPROVED_CHANGE_MESSAGE='Cambio de mesa aprobado. Ya puedes escanear el código QR de tu nueva mesa y continuar realizando pedidos';
const REJECTED_CHANGE_MESSAGE='Cambio de mesa no autorizado. Tu solicitud de cambio de mesa no ha sido aprobada. Si necesitas más información, consulta al personal del restaurante';
const customerTransport=createCustomerFlowTransport();
const currentCatalogUnitPrice=(item:MenuItem,line:BasketLine):number|null=>{
 try{return catalogUnitPrice(item,line.selection);}catch{return null;}
};
// The same catalog option names and values shown in the detail editor must
// distinguish configured basket rows; no position-based identity is stored.
const basketSelectionDescription=(item:MenuItem,selection:CatalogSelection):string=>[
 ...(item.options??[]).flatMap(group=>(selection.options[group.id]??[]).map(id=>
  group.name+': '+(group.values.find(value=>value.id===id)?.name??id))),
 ...(item.extras??[]).filter(extra=>selection.extras.includes(extra.id)).map(extra=>extra.name)
].join(' · ');
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
 flowContract='h6',enableTableChangeFlow=false}:Readonly<{
 initialTableQr?:InitialTableQr;
 confirmStripePayment?:((clientSecret:string)=>Promise<void>)|null;
 flowContract?:'h6'|'h3-candidate';
 /** Opt-in only for the verified isolated B3 composition, never default H6. */
 enableTableChangeFlow?:boolean;
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
 const [detailEditingKey,setDetailEditingKey]=useState<string|null>(null);
 const [detailSelection,setDetailSelection]=useState<{options:Record<string,string[]>;extras:string[]}>({options:{},extras:[]});
 const [detailQuantity,setDetailQuantity]=useState(1);
 const [notice,setNotice]=useState('');
 const [identity,setIdentity]=useState<CustomerIdentityState>({status:'checking'});
 const [identityBusy,setIdentityBusy]=useState(false);
 const [qrState,setQrState]=useState<QrState>(initialTableQr?.status==='valid'?'pending':initialTableQr?'invalid':'idle');
 const [tableVisit,setTableVisit]=useState<TableVisit|null>(null);
 const [tableChangeState,setTableChangeState]=useState<TableChangeState|null>(null);
 const [tableChangeNotice,setTableChangeNotice]=useState<'approved'|'rejected'|null>(null);
 const [changeClock,setChangeClock]=useState(()=>Date.now());
 const [checkoutPhase,setCheckoutPhase]=useState<CheckoutPhase>('quoting');
 const [paymentMode,setPaymentMode]=useState<PaymentMode>('pay_now');
 const [checkoutPaymentPolicy,setCheckoutPaymentPolicy]=useState<CheckoutPaymentPolicy|null>(null);
 const [quoteLines,setQuoteLines]=useState<readonly QuoteLine[]>([]);
 const [quotedTotal,setQuotedTotal]=useState(0);
 const [checkoutMessage,setCheckoutMessage]=useState<string|null>(null);
 // Payment/confirmation truth must never be replaced by SSE transport notices.
 const [eventFeedNotice,setEventFeedNotice]=useState<string|null>(null);
 const [eventFeedConnected,setEventFeedConnected]=useState(false);
 const [eventScope,setEventScope]=useState<{accountId:string;roundId:string;orderId:string}|null>(null);
 const [customerEvents,setCustomerEvents]=useState<readonly CustomerEvent[]>([]);
 const [pendingRevision,setPendingRevision]=useState<PendingRevision|null>(null);
 const [revisionSelections,setRevisionSelections]=useState<Readonly<Record<number,string>>>({});
 const [revisionPhase,setRevisionPhase]=useState<'idle'|'loading'|'ready'|'submitting'|'blocked'>('idle');
 const [revisionMessage,setRevisionMessage]=useState<string|null>(null);
 const [revisionChanges,setRevisionChanges]=useState<readonly RevisionChange[]>([]);
 const searchRef=useRef<HTMLInputElement>(null);
 const qrCredentialRef=useRef<TableQrCredential|null>(null);
 const scannedCredentialRef=useRef<TableQrCredential|null>(initialTableQr?.status==='valid'?initialTableQr.credential:null);
 const changeStateReceivedAtRef=useRef(Date.now());
 const qrStateRef=useRef<QrState>(qrState);
 const lastStreamStateRef=useRef<TableChangeState|null>(null);
 useEffect(()=>{qrStateRef.current=qrState;},[qrState]);
 const qrAuthorizationRef=useRef<Promise<void>|null>(null);
 const checkoutRequestRef=useRef<string|null>(null);
 const acceptanceTokenRef=useRef<string|null>(null);
 const stripeClientSecretRef=useRef<string|null>(null);
 const pendingPaymentOrderRef=useRef<string|null>(null);
 const revisionRequestRef=useRef<string|null>(null);
 const revisionAcceptanceTokenRef=useRef<string|null>(null);
 const revisionPreparedRef=useRef<readonly RevisionReplacement[]|null>(null);
 const catalogRef=useRef<CatalogState>(catalog);
 useEffect(()=>{catalogRef.current=catalog;},[catalog]);
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

 const applyScannedChangeState=useCallback((state:TableChangeState,credential:TableQrCredential)=>{
  changeStateReceivedAtRef.current=Date.now();
  setChangeClock(changeStateReceivedAtRef.current);
  setTableChangeState(state);
  if(state.state==='unbound'||state.boundTableId===credential.tableId){
   qrCredentialRef.current=credential;
   setTableVisit(null);
   void authorizeTable(credential);
  }else if(state.state==='approved'){
   setQrState('change_approved');
  }else if(state.state==='pending'){
   setQrState('change_pending');
  }else if(state.state==='rejected'){
   setQrState('change_rejected');
  }else setQrState('change_prompt');
 },[authorizeTable]);

 const inspectScannedQr=useCallback(async(credential:TableQrCredential)=>{
  if(flowContract==='h3-candidate'||!enableTableChangeFlow){
   qrCredentialRef.current=credential;setTableVisit(null);
   void authorizeTable(credential);return;
  }
  setQrState('checking_change');
  try{
   const state=await customerTransport.tableChangeState();
   if(scannedCredentialRef.current!==credential)return;
   applyScannedChangeState(state,credential);
  }catch{
   if(scannedCredentialRef.current===credential)setQrState('change_error');
  }
 },[flowContract,enableTableChangeFlow,authorizeTable,applyScannedChangeState]);

 const acceptScannedQr=useCallback((payload:string)=>{
  let credential:TableQrCredential;
  try{credential=parseScannedTableQr(payload);}
  catch{setQrState('invalid');return;}
  // Scanning another QR must not discard the origin visit, its payment context
  // or live events: only the first confirmed destination order moves the account.
  scannedCredentialRef.current=credential;
  if(identity.status==='authenticated')void inspectScannedQr(credential);
  else setQrState(identity.status==='checking'?'pending':
    identity.status==='guest'?'identity_required':'unavailable');
 },[inspectScannedQr,identity.status]);

 const refreshTableChange=useCallback(async()=>{
  const credential=scannedCredentialRef.current;
  if(!credential)return;
  await inspectScannedQr(credential);
 },[inspectScannedQr]);

 const requestTableChange=useCallback(async()=>{
  if(qrState!=='change_prompt'||!scannedCredentialRef.current)return;
  setQrState('checking_change');
  try{
   const receipt=await customerTransport.requestTableChange();
   const now=Date.now();
   changeStateReceivedAtRef.current=now;setChangeClock(now);
   setTableChangeState({state:'pending',
    boundTableId:tableChangeState?.boundTableId??null,
    expiresAtMs:receipt.expiresAtMs,serverNowMs:now});
   setQrState('change_pending');
   setTableChangeNotice(null);
  }catch(error){
   if(error instanceof CustomerFlowTransportError&&error.status===409)
    await refreshTableChange();
   else setQrState('change_error');
  }
 },[qrState,tableChangeState,refreshTableChange]);

 const cancelChangePrompt=useCallback(()=>{
  scannedCredentialRef.current=null;
  setTableChangeState(null);
  // Leave the origin authorization, account, outstanding basket and event scope.
  setQrState('idle');
 },[]);

 const continueAfterApproval=useCallback(()=>{
  const credential=scannedCredentialRef.current;
  if(!credential||tableChangeState?.state!=='approved')return;
  qrCredentialRef.current=credential;setTableVisit(null);
  void authorizeTable(credential);
 },[tableChangeState,authorizeTable]);

 useEffect(()=>{
  if(!tableChangeState||!['pending','rejected'].includes(tableChangeState.state)||
     tableChangeState.expiresAtMs===null||
     tableChangeState.serverNowMs+Date.now()-changeStateReceivedAtRef.current>=tableChangeState.expiresAtMs)return;
  // Local display only; expiry and the decision are always revalidated in PG17.
  const tick=window.setTimeout(()=>setChangeClock(Date.now()),1000);
  return()=>window.clearTimeout(tick);
 },[tableChangeState,changeClock]);
 // Schedule exactly one revalidation at the real server deadline, not a
 // periodic API poll. The SQL state remains authoritative and a rejected
 // decision is immutable; expiry does not require an UPDATE or NOTIFY.
 const refreshedExpiryRef=useRef<string|null>(null);
 useEffect(()=>{
  if(!enableTableChangeFlow||!tableChangeState||
     !['pending','rejected'].includes(tableChangeState.state)||
     tableChangeState.expiresAtMs===null)return;
  const deadline=tableChangeState.expiresAtMs;
  const key=String(deadline)+':'+String(tableChangeState.boundTableId);
  if(refreshedExpiryRef.current===key)return;
  const serverNow=tableChangeState.serverNowMs+Date.now()-changeStateReceivedAtRef.current;
  const remaining=Math.max(0,deadline-serverNow+1000);
  const timer=window.setTimeout(()=>{
   refreshedExpiryRef.current=key;
   void refreshTableChange();
  },remaining);
  return()=>window.clearTimeout(timer);
 },[enableTableChangeFlow,tableChangeState,refreshTableChange]);
 useEffect(()=>{
  if(flowContract!=='h6'||!enableTableChangeFlow||identity.status!=='authenticated')return;
  // The cursor is scoped to the authenticated public identity. A reconnect
  // can recover committed decisions even after the 90-second UI window has
  // expired. Never put the HttpOnly session secret in browser storage.
  const cursorKey='sabora.table-change.cursor.'+identity.publicId;
  const saved=Number(localStorage.getItem(cursorKey)??'0');
  const afterCursor=Number.isSafeInteger(saved)&&saved>=0?saved:0;
  const saveCursor=(cursor:number)=>{
   const previous=Number(localStorage.getItem(cursorKey)??'0');
   if(!Number.isSafeInteger(previous)||cursor>previous)
    localStorage.setItem(cursorKey,String(cursor));
  };
  return subscribeCustomerTableChange({
   afterCursor,
   onState:state=>{
    // A snapshot updates authority; it is not another notification.
    lastStreamStateRef.current=state;
    const credential=scannedCredentialRef.current;
    if(credential&&['checking_change','change_prompt','change_pending',
       'change_rejected','change_approved'].includes(qrStateRef.current))
     applyScannedChangeState(state,credential);
    else{
     changeStateReceivedAtRef.current=Date.now();
     setChangeClock(changeStateReceivedAtRef.current);
     setTableChangeState(state);
    }
   },
   onDecision:event=>{
    const last=Number(localStorage.getItem(cursorKey)??'0');
    if(Number.isSafeInteger(last)&&event.id<=last)return;
    saveCursor(event.id);
    const current=lastStreamStateRef.current;
    // An approval already consumed must not reappear as a usable grant
    // merely because the outbox retains its immutable audit event.
    if(event.type==='sabora.table_change.approved'){
     if(current?.state==='approved')setTableChangeNotice('approved');
    }else if(current?.state!=='approved'&&
      !(current?.state==='pending'&&current.expiresAtMs!==null&&
        current.expiresAtMs>event.expiresAtMs)){
     setTableChangeNotice('rejected');
    }
   },
   onResync:maxCursor=>{
    if(maxCursor!==null)saveCursor(maxCursor);
    setNotice('El historial de avisos no está completo. Se ha recuperado el estado actual autorizado.');
   },
   onRevoked:()=>{
    lastStreamStateRef.current=null;
    setTableChangeState(null);setTableChangeNotice(null);
    setQrState('change_error');
   }
  });
 },[flowContract,enableTableChangeFlow,identity.status,
    identity.status==='authenticated'?identity.publicId:null,applyScannedChangeState]);
 const changeRemainingSeconds=tableChangeState?.expiresAtMs==null?null:Math.max(0,
  Math.ceil((tableChangeState.expiresAtMs-(
   tableChangeState.serverNowMs+changeClock-changeStateReceivedAtRef.current))/1000));

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
  const credential=scannedCredentialRef.current;
  if(identity.status==='authenticated'&&credential&&['pending','identity_required'].includes(qrState))
   void inspectScannedQr(credential);
 },[inspectScannedQr,identity.status,qrState]);
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
  setEventFeedConnected(false);
  setEventFeedNotice(null);
  return subscribeCustomerEvents({tableId:tableVisit.tableId,visitId:tableVisit.visitId,
   accountId:eventScope.accountId,onEvent:event=>{
    setEventFeedConnected(true);
    setEventFeedNotice(null);
    setCustomerEvents(current=>Object.freeze([...current.slice(-49),event]));
    if(pendingPaymentOrderRef.current===eventScope.orderId&&
        event.payload?.orderId===eventScope.orderId){
      if(event.type==='sabora.payment.requires_action')setCheckoutPhase('payment_action');
      if(event.type==='sabora.payment.authorized'){
       setCheckoutPhase('confirmed');setBasket(Object.freeze([]));
       checkoutRequestRef.current=null;acceptanceTokenRef.current=null;
       stripeClientSecretRef.current=null;pendingPaymentOrderRef.current=null;
       setCheckoutMessage(locale==='es'?
        'La autorización está acreditada en servidor; cobro y cocina siguen su propio proceso.':
        'Authorization is verified by the server; capture and kitchen dispatch follow separately.');
      }
      if(['sabora.payment.authorization_unknown','sabora.payment.capture_unknown'].includes(event.type)){
       setCheckoutPhase('uncertain');setCheckoutMessage(locale==='es'?
        'El resultado del proveedor es incierto. No repitas el cargo ni cambies de medio.':
        'The provider result is uncertain. Do not repeat the charge or switch methods.');
      }
     }
     if(event.type==='sabora.kitchen.dispatch_acknowledged')setEventFeedNotice(locale==='es'?
     'Cocina ha recibido un pedido.':'Kitchen has received an order.');
    if(event.type==='sabora.order.revision_invalidated'&&
       event.payload.orderId===eventScope.orderId){
     setRevisionPhase('loading');setRevisionMessage(null);setOverlay('revision');
     void Promise.all([customerTransport.readOrderRevision({tableId:tableVisit.tableId,
      visitId:tableVisit.visitId,orderId:eventScope.orderId}),
      loadPublishedCatalog(fetch)]).then(([value,freshCatalog])=>{
       if(value.state!=='invalidated')return;
       setCatalog(freshCatalog);catalogRef.current=freshCatalog;
       const available=new Set(freshCatalog.status==='ready'?
        freshCatalog.items.filter(item=>item.available).map(item=>item.id.toLowerCase()):[]);
       setPendingRevision(value as PendingRevision);
       setRevisionSelections(Object.freeze(Object.fromEntries(value.lines.filter(line=>line.affected)
        .map(line=>[line.lineNumber,available.has(line.itemId.toLowerCase())?line.itemId:'']))));
       revisionRequestRef.current=`ui_revision_${crypto.randomUUID().replaceAll('-','_')}`;
       revisionAcceptanceTokenRef.current=null;revisionPreparedRef.current=null;
       setRevisionChanges([]);setRevisionPhase('ready');
      }).catch(()=>{setRevisionPhase('blocked');setRevisionMessage(locale==='es'?
       'No se pudo recuperar la revisión. El pedido no se reenviará automáticamente.':
       'The revision could not be recovered. The order will not be resubmitted automatically.');});
    }
    if(event.type==='sabora.order.revision_submitted'&&
       event.payload.orderId===eventScope.orderId){
     setPendingRevision(null);setRevisionSelections({});setRevisionChanges([]);
     revisionRequestRef.current=null;revisionAcceptanceTokenRef.current=null;
     revisionPreparedRef.current=null;
     setRevisionPhase('idle');setOverlay(current=>current==='revision'?null:current);
    }
   },onResync:()=>{
    setEventFeedConnected(false);
    setEventFeedNotice(locale==='es'?'El historial disponible ha caducado; se requiere una recarga segura.':
     'The available history has expired; a secure reload is required.');
   },onUnavailable:()=>{
    setEventFeedConnected(false);
    setEventFeedNotice(locale==='es'?'El canal de seguimiento perdió autorización. Vuelve a validar la mesa.':
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
 const quantities=useMemo(()=>{const totals=new Map<string,number>();for(const line of basket){const key=line.itemId.toLowerCase();totals.set(key,(totals.get(key)??0)+line.quantity);}return totals;},[basket]);
 const totalQuantity=basketQuantity(basket);
 const total=basketTotal(basket);
 const issues=useMemo(()=>catalog.status==='ready'?basketIssues(basket,catalog.items):[],[basket,catalog]);
 const canRequestTableOrder=catalog.status==='ready'&&basket.length>0&&issues.length===0;
 const issueCounts=useMemo(()=>({soldOut:issues.filter(issue=>issue.reason==='sold_out').length,unpublished:issues.filter(issue=>issue.reason==='unpublished').length,priceChanged:issues.filter(issue=>issue.reason==='price_changed').length}),[issues]);

 const toggleFavorite=useCallback((id:string)=>setFavorites(current=>current.some(value=>value.toLowerCase()===id.toLowerCase())?current.filter(value=>value.toLowerCase()!==id.toLowerCase()):[...current,id]),[]);
 const updateQuantity=useCallback((item:MenuItem,delta:number,lineKey?:string)=>setBasket(current=>changeBasket(current,item,delta,lineKey)),[]);
 const removeLine=useCallback((itemId:string,lineKey?:string)=>setBasket(current=>removeBasketLine(current,itemId,lineKey)),[]);
 const acceptPrice=useCallback((itemId:string,lineKey?:string)=>setBasket(current=>acceptBasketPrice(current,items,itemId,lineKey)),[items]);
 const goHome=useCallback(()=>{setArea('home');setOverlay(null);setNotice('');},[]);
 const closeOverlay=useCallback(()=>{setOverlay(null);if(area==='qr')setArea('home');},[area]);
 const selectArea=useCallback((next:ClientArea)=>{setNotice('');if(next==='qr'){setArea('qr');setOverlay('qr');return;}setOverlay(null);setArea(next);},[]);
 const switchLocale=useCallback((next:Locale)=>setLocale(next),[]);
 const toggleSearch=useCallback(()=>setSearchOpen(open=>!open),[]);
 const openCart=useCallback(()=>setOverlay('cart'),[]);
 const openNotifications=useCallback(()=>setOverlay('notifications'),[]);
 const openDetail=useCallback((item:MenuItem,line?:BasketLine)=>{
  if(line)setOverlay(null); // Do not nest two dialogs while editing from the basket.
  setDetailEditingKey(line?basketLineKey(line):null);
  setDetailSelection(line?{options:Object.fromEntries(Object.entries(line.selection.options)
   .map(([key,value])=>[key,[...value]])),extras:[...line.selection.extras]}:
   {options:{},extras:[]});
  setDetailQuantity(line?.quantity??1);setDetail(item);
 },[]);
 const closeDetail=useCallback(()=>{setDetail(null);setDetailEditingKey(null);
  if(detailEditingKey!==null)setOverlay('cart');},[detailEditingKey]);
 const changeFromCard=useCallback((item:MenuItem,delta:number)=>{
  const configurable=(item.options?.length??0)>0||(item.extras?.length??0)>0;
  if(configurable){
   // Product-level +/- cannot choose which customized variant to subtract.
   if(delta>0)openDetail(item);else openCart();
   return;
  }
  updateQuantity(item,delta);
 },[openCart,openDetail,updateQuantity]);

 const prepareCheckout=useCallback(async()=>{
  if(pendingPaymentOrderRef.current){
   setOverlay('checkout');setCheckoutPhase('payment_action');
   setCheckoutMessage(locale==='es'?
    'Esta operación sigue pendiente. Consulta su estado antes de crear otro pedido.':
    'This payment is pending. Check its state before creating another order.');
   return;
  }
  const credential=qrCredentialRef.current;
  if(!tableVisit||!credential||identity.status!=='authenticated'){
   setOverlay('qr');setArea('qr');return;
  }
  setOverlay('checkout');setCheckoutPhase('quoting');setCheckoutMessage(null);setQuoteLines([]);
  setCheckoutPaymentPolicy(null);
  checkoutRequestRef.current=`ui_${crypto.randomUUID().replaceAll('-','_')}`;
  acceptanceTokenRef.current=null;stripeClientSecretRef.current=null;
  try{
   const quote=await customerTransport.quote({tableId:tableVisit.tableId,qrToken:credential.token,
    visitId:tableVisit.visitId,basketId:tableVisit.basketId,
    lines:basket.map(line=>({itemId:line.itemId,selection:line.selection,quantity:line.quantity}))});
   // Quote arrays are returned in request order. Verify this contract and
   // preserve a per-variant snapshot to prevent cross-tab/stale-row confusion.
   if(quote.lines.length!==basket.length||!quote.lines.every((line,index)=>
      line.itemId.toLowerCase()===basket[index].itemId.toLowerCase()))
    throw Error('customer_variant_quote_order_mismatch');
   const nextTotal=quote.lines.reduce((sum,line)=>sum+line.totalCents,0);
   setQuoteLines(Object.freeze(quote.lines.map((line,index)=>Object.freeze({...line,
    lineKey:basketLineKey(basket[index]),quantity:basket[index].quantity,
    priceCents:basket[index].priceCents}))));setQuotedTotal(nextTotal);
   // A signed reader checks the *current* account after every quote. The
   // previous device's choice, a refreshed QR or a table transfer never
   // authorizes this browser to choose again.
   const policy=flowContract==='h6'?await customerTransport.paymentPolicy({
    tableId:tableVisit.tableId,visitId:tableVisit.visitId}):null;
   if(flowContract==='h6'&&!policy)throw Error('payment_policy_unavailable');
   setCheckoutPaymentPolicy(policy);
   setPaymentMode(policy?.selectedMode??(policy?.requirePayAsOrdered||
    tableVisit.paymentPolicy?.requirePayAsOrdered?'pay_now':paymentMode));
   if(nextTotal>0&&policy?.selectedMode==='pay_at_end'&&policy.requirePayAsOrdered)
    setCheckoutMessage(locale==='es'?
     'La política de la mesa exige pago inmediato, pero tu cuenta mantiene «Pagar al terminar». Consulta al personal para conciliar antes de realizar otro pedido.':
     'The table requires immediate payment, but your account remains set to pay at the end. Please consult staff before ordering again.');
   setCheckoutPhase('ready');
  }catch{
   setCheckoutPhase('error');setCheckoutMessage(locale==='es'?
    'No se pudo revalidar la selección. La cesta no se ha confirmado.':
    'The selection could not be revalidated. The basket was not confirmed.');
  }
 },[basket,flowContract,identity.status,locale,paymentMode,tableVisit]);

 const refreshPaymentState=useCallback(async(orderId:string)=>{
  if(!tableVisit||pendingPaymentOrderRef.current!==orderId)return false;
  setCheckoutPhase('confirming');
  try{
   const state=await customerTransport.paymentState({
    tableId:tableVisit.tableId,visitId:tableVisit.visitId,orderId});
   if(pendingPaymentOrderRef.current!==orderId)return false;
   if(state.paymentMode!=='pay_now')throw Error('invalid_payment_mode');
   if(['grouping','capture_requested','captured','dispatch_requested',
       'kitchen_acknowledged'].includes(state.roundState)){
    setBasket(Object.freeze([]));checkoutRequestRef.current=null;
    acceptanceTokenRef.current=null;stripeClientSecretRef.current=null;
    pendingPaymentOrderRef.current=null;setCheckoutPhase('confirmed');
    setCheckoutMessage(locale==='es'?
     'Autorización verificada en servidor. El cargo y el envío a cocina se acreditan separadamente.':
     'Authorization verified by the server. Capture and kitchen dispatch are separate.');
   }else if(['payment_unknown','compensation_required'].includes(state.roundState)){
    setCheckoutPhase('uncertain');setCheckoutMessage(locale==='es'?
     'Pago incierto. No crees otro cargo ni cambies de medio; consulta al personal.':
     'Payment status uncertain. Do not create another charge or switch methods; ask staff.');
   }else if(['payment_failed','cancelled'].includes(state.roundState)){
    setCheckoutPhase('error');setCheckoutMessage(locale==='es'?
     'El servidor registra una incidencia económica. Consulta al personal antes de volver a pedir.':
     'The server recorded a payment issue. Ask staff before trying again.');
   }else{
    setCheckoutPhase('payment_action');setCheckoutMessage(locale==='es'?
     'La autorización sigue pendiente en el servidor. No hay cobro acreditado.':
     'Authorization is still pending at the server. No capture has been verified.');
    return true;
   }
   return false;
  }catch{
   if(pendingPaymentOrderRef.current!==orderId)return false;
   setCheckoutPhase('uncertain');setCheckoutMessage(locale==='es'?
    'No se pudo consultar el estado. Se conserva el pedido original; solicita ayuda.':
    'Unable to check the state. The original order is preserved; ask staff.');
   return false;
  }
 },[locale,tableVisit]);

 const retryPaymentAction=useCallback(async()=>{
  const orderId=pendingPaymentOrderRef.current;
  if(!orderId)return;
  const safeToRetry=await refreshPaymentState(orderId);
  if(safeToRetry!==true||pendingPaymentOrderRef.current!==orderId||
     !stripeClientSecretRef.current||!confirmStripePayment)return;
  setCheckoutPhase('confirming');
  try{
   await confirmStripePayment(stripeClientSecretRef.current);
   await refreshPaymentState(orderId);
  }catch{
   if(pendingPaymentOrderRef.current!==orderId)return;
   setCheckoutPhase('payment_action');setCheckoutMessage(locale==='es'?
    'La autenticación sigue pendiente. Se reutiliza la misma operación, sin crear otra.':
    'Authentication remains pending. The same operation is reused, not recreated.');
  }
 },[confirmStripePayment,locale,refreshPaymentState]);

 const reconcileCheckout=useCallback(async()=>{
  const credential=qrCredentialRef.current,requestKey=checkoutRequestRef.current;
  if(!tableVisit||!credential||!requestKey)return;
  setCheckoutPhase('confirming');
  try{
   const result=await customerTransport.lookupConfirmation({
    tableId:tableVisit.tableId,qrToken:credential.token,visitId:tableVisit.visitId,
    basketId:tableVisit.basketId,requestKey});
   if(result.status==='confirmed'){
    if(flowContract==='h6'&&quotedTotal>0&&
       (checkoutPaymentPolicy?.selectedMode??paymentMode)==='pay_now'){
     pendingPaymentOrderRef.current=result.orderId;
     await refreshPaymentState(result.orderId);return;
    }
    setBasket(Object.freeze([]));checkoutRequestRef.current=null;acceptanceTokenRef.current=null;
    setCheckoutPhase('confirmed');setCheckoutMessage(locale==='es'?
     'Pedido recuperado sin duplicarlo. La confirmación del pedido no acredita el pago ni el despacho a cocina; consulta su estado con el personal si está pendiente.':
     'Order recovered without duplication. Order confirmation does not prove payment or kitchen dispatch; ask staff for its status if pending.');
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
 },[checkoutPaymentPolicy,flowContract,locale,paymentMode,quotedTotal,refreshPaymentState,tableVisit]);

 const confirmCheckout=useCallback(async()=>{
  if(pendingPaymentOrderRef.current){
   await refreshPaymentState(pendingPaymentOrderRef.current);return;
  }
  const credential=qrCredentialRef.current,requestKey=checkoutRequestRef.current;
  if(!tableVisit||!credential||!requestKey||quoteLines.length!==basket.length||
     (flowContract==='h6'&&(!checkoutPaymentPolicy||
       (quotedTotal>0&&checkoutPaymentPolicy.selectedMode==='pay_at_end'&&
        checkoutPaymentPolicy.requirePayAsOrdered))))return;
  const quotedRows=quoteLines.map(quote=>basket.find(line=>basketLineKey(line)===quote.lineKey));
  if(quotedRows.some((line,index)=>!line||
    line.itemId.toLowerCase()!==quoteLines[index].itemId.toLowerCase()||
    line.quantity!==quoteLines[index].quantity||line.priceCents!==quoteLines[index].priceCents)){
   setQuoteLines([]);setCheckoutPhase('error');
   setCheckoutMessage(locale==='es'?
    'La selección cambió en este u otro dispositivo. Vuelve a validar antes de confirmar.':
    'The selection changed. Revalidate it before confirming.');return;
  }
  setCheckoutPhase('confirming');setCheckoutMessage(null);
  try{
   const result=await customerTransport.confirm({tableId:tableVisit.tableId,qrToken:credential.token,
    visitId:tableVisit.visitId,basketId:tableVisit.basketId,requestKey,
    ...(flowContract==='h6'?{paymentMode:quotedTotal===0||
     checkoutPaymentPolicy?.selectedMode!==null?null:paymentMode}:{}),
    lines:quoteLines.map((quote,index)=>({quoteId:quote.quoteId,itemId:quote.itemId,
     selection:quotedRows[index]!.selection,quantity:quotedRows[index]!.quantity})),
    ...(acceptanceTokenRef.current?{acceptanceToken:acceptanceTokenRef.current}:null)});
   if(typeof result.accountId==='string'&&typeof result.roundId==='string')
    setEventScope({accountId:result.accountId,roundId:result.roundId,orderId:result.orderId});
   if(result.requiresPaymentAction===true&&typeof result.clientSecret==='string'){
    pendingPaymentOrderRef.current=result.orderId;
    stripeClientSecretRef.current=result.clientSecret;
    // Browser SCA is not proof of a provider charge or kitchen dispatch.
    if(confirmStripePayment){
     try{await confirmStripePayment(result.clientSecret);
      await refreshPaymentState(result.orderId);}
     catch{setCheckoutPhase('payment_action');setCheckoutMessage(locale==='es'?
      'Stripe no acreditó la autorización. Consulta o reintenta la misma operación.':
      'Stripe authorization was not verified. Check or retry the same operation.');}
    }else{
     setCheckoutPhase('payment_action');setCheckoutMessage(locale==='es'?
      'Esta compilación no tiene integrado Stripe autorizado. El pedido sigue pendiente; no se crea otro cargo.':
      'This build has no authorized Stripe integration. The order remains pending; no new charge is created.');
    }
   }else if(result.paymentMode==='pay_now'&&
     !['grouping','capture_requested','captured','dispatch_requested','kitchen_acknowledged'].includes(result.roundState??'')){
    pendingPaymentOrderRef.current=result.orderId;
    setCheckoutPhase(result.roundState==='payment_unknown'?'uncertain':
      result.roundState==='payment_failed'?'error':'payment_action');
    setCheckoutMessage(locale==='es'?
     'Pedido registrado; el estado económico no está acreditado. Consulta su estado, sin crear otro pedido.':
     'Order registered; the economic state is not verified. Check its status without another order.');
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
 },[basket,checkoutPaymentPolicy,confirmStripePayment,flowContract,locale,paymentMode,quoteLines,quotedTotal,refreshPaymentState,tableVisit]);

 const resubmitRevision=useCallback(async()=>{
  const credential=qrCredentialRef.current,requestKey=revisionRequestRef.current;
  if(!pendingRevision||!tableVisit||!credential||!requestKey||catalog.status!=='ready')return;
  const affected=pendingRevision.lines.filter(line=>line.affected);
  const selected=affected.map(line=>({lineNumber:line.lineNumber,
   item:catalog.items.find(item=>item.id===revisionSelections[line.lineNumber]&&item.available&&
    !(item.options??[]).some(group=>group.required)),
   quantity:line.quantity}));
  if(selected.some(value=>!value.item)){
   setRevisionMessage(locale==='es'?'Elige una alternativa disponible sin configuración obligatoria para cada línea afectada.':
    'Choose an available alternative without mandatory configuration for every affected line.');return;
  }
  setRevisionPhase('submitting');setRevisionMessage(null);
  try{
   let replacements=revisionPreparedRef.current;
   if(!replacements){
    const quote=await customerTransport.quote({tableId:tableVisit.tableId,qrToken:credential.token,
     visitId:tableVisit.visitId,basketId:tableVisit.basketId,
     lines:selected.map(value=>({itemId:value.item!.id,selection:{options:{},extras:[]},quantity:value.quantity}))});
    replacements=Object.freeze(selected.map(value=>{const quoted=quote.lines.find(line=>
     line.itemId===value.item!.id);
     if(!quoted)throw Error('missing_revision_quote');
     return Object.freeze({lineNumber:value.lineNumber,quoteId:quoted.quoteId,itemId:value.item!.id,
      selection:Object.freeze({options:Object.freeze({}),extras:Object.freeze([])}),
      quantity:value.quantity});}));
    revisionPreparedRef.current=replacements;
   }
   await customerTransport.resubmitOrderRevision(pendingRevision.orderId,{
    tableId:tableVisit.tableId,qrToken:credential.token,visitId:tableVisit.visitId,
    basketId:tableVisit.basketId,expectedRevision:pendingRevision.revisionNumber,requestKey,
    replacements,...(revisionAcceptanceTokenRef.current?
     {acceptanceToken:revisionAcceptanceTokenRef.current}:null)});
   setRevisionPhase('idle');setRevisionMessage(locale==='es'?
    'La nueva revisión se ha enviado a cocina sin abrir otra ventana de agrupación.':
    'The new revision was sent to the kitchen without opening another grouping window.');
   setPendingRevision(null);setOverlay(null);revisionRequestRef.current=null;
   revisionAcceptanceTokenRef.current=null;revisionPreparedRef.current=null;setRevisionChanges([]);
  }catch(error){
   if(error instanceof CustomerFlowTransportError&&error.message==='revision_acceptance_required'&&
      typeof error.details?.acceptanceToken==='string'&&Array.isArray(error.details?.changes)){
    revisionAcceptanceTokenRef.current=error.details.acceptanceToken;
    setRevisionChanges(error.details.changes as unknown as readonly RevisionChange[]);
    setRevisionPhase('ready');setRevisionMessage(locale==='es'?
     'El precio o descuento cambió. Revisa el importe anterior, el nuevo y la diferencia antes de reenviar.':
     'The price or discount changed. Review the previous amount, the new amount and the difference before resubmitting.');
   }else{
    setRevisionPhase('blocked');setRevisionMessage(error instanceof CustomerFlowTransportError&&
     error.message==='revision_payment_review_required'?(locale==='es'?
      'El importe autorizado con pago inmediato no puede modificarse sin conciliación del proveedor. Pide ayuda al personal.':
      'The pay-now authorized amount cannot be changed without provider reconciliation. Ask staff for help.'):(locale==='es'?
      'La revisión no se ha enviado. Conservamos el aviso y no se creará otro pedido.':
      'The revision was not submitted. The notice is retained and no other order will be created.'));
   }
  }
 },[catalog,locale,pendingRevision,revisionSelections,tableVisit]);

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
   qrCredentialRef.current=null;scannedCredentialRef.current=null;setTableVisit(null);
   setTableChangeState(null);setTableChangeNotice(null);lastStreamStateRef.current=null;
   setQrState('idle');setEventScope(null);setCustomerEvents([]);
   setNotice(locale==='es'?'Sesión cerrada en este dispositivo.':'Session closed on this device.');}
  catch{setNotice(locale==='es'?'No se ha podido cerrar la sesión con seguridad.':'The session could not be closed securely.');}
  finally{setIdentityBusy(false);}
 }

 const productGrid=(products:readonly MenuItem[])=>products.length?<div className="product-grid">{products.map(item=><ProductCard key={item.id} item={item} quantity={quantities.get(item.id.toLowerCase())??0} favorite={favorites.some(id=>id.toLowerCase()===item.id.toLowerCase())} locale={locale} onFavorite={toggleFavorite} onDetail={openDetail} onChange={changeFromCard}/>)}</div>:<EmptyState>{copy.empty}</EmptyState>;

 return <div className="client-app">
  <Header locale={locale} quantity={totalQuantity} searchOpen={searchOpen} onLocale={switchLocale} onSearch={toggleSearch} onCart={openCart} onNotifications={openNotifications} onHome={goHome}/>
  {tableChangeNotice?<aside className="table-change-live-notice" role="status" aria-live="polite">
   <p>{tableChangeNotice==='approved'?APPROVED_CHANGE_MESSAGE:REJECTED_CHANGE_MESSAGE}</p>
   <div>
    <button type="button" onClick={()=>{setTableChangeNotice(null);setArea('qr');setOverlay('qr');}}>Ver cambio de mesa</button>
    <button type="button" onClick={()=>setTableChangeNotice(null)} aria-label="Cerrar aviso">Cerrar</button>
   </div>
  </aside>:null}
  <div className={`search-panel${searchOpen?' open':''}`} aria-hidden={!searchOpen}><label htmlFor="catalog-search">{copy.search}</label><div><Icon name="search"/><input ref={searchRef} id="catalog-search" type="search" value={query} maxLength={100} placeholder={copy.search} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Escape')setSearchOpen(false);}}/></div></div>
  <main id="main-content" className="client-main">
   {area==='home'?<>
    <CommunicationsBar locale={locale}/>
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

  {overlay==='notifications'?<Modal title={copy.notifications} onClose={closeOverlay} closeLabel={locale==='es'?'Cerrar':'Close'}><div className="modal-copy"><Icon name="bell"/>{customerEvents.length?<ol className="customer-event-list">{[...customerEvents].reverse().map(event=><li key={`${event.id}-${event.type}`}><strong>{event.type.replace('sabora.','').replaceAll('_',' ')}</strong><span>{new Date(event.createdAt).toLocaleTimeString(locale==='es'?'es-ES':'en-GB',{hour:'2-digit',minute:'2-digit'})}</span></li>)}</ol>:<p>{locale==='es'?'Todavía no hay eventos autorizados para esta cuenta.':'There are no authorized events for this account yet.'}</p>}<span className="honest-status">{eventScope?(eventFeedConnected?(locale==='es'?'Canal SSE durable conectado, sin sondeo periódico':'Durable SSE channel connected, without periodic polling'):(locale==='es'?'Canal de seguimiento pendiente o no disponible; no se presume conexión':'Tracking channel pending or unavailable; connection is not assumed')):(locale==='es'?'El canal se abre al confirmar un pedido':'The channel opens after confirming an order')}</span>{eventFeedNotice?<p className="honest-status" role="status">{eventFeedNotice}</p>:null}</div></Modal>:null}
  {overlay==='qr'?<Modal title={locale==='es'?'QR de mesa':'Table QR'} onClose={closeOverlay} closeLabel={locale==='es'?'Cerrar':'Close'}><div className="modal-copy qr-flow"><Icon name="qr"/><p>{locale==='es'?'Escanea el QR auténtico de la mesa. Sabora conservará tu selección y el servidor comprobará identidad, credencial revocable, estado y visita antes de habilitar el pedido.':'Scan the authentic table QR. Sabora keeps your selection, and the server verifies identity, revocable credential, state and visit before enabling ordering.'}</p>
   {qrState==='checking_change'?<span className="honest-status" role="status">Comprobando tu vinculación y las solicitudes con el restaurante…</span>:
    qrState==='change_prompt'?<div className="table-change-client-notice" role="group" aria-label="Cambio de mesa">
      <strong>Cambio de mesa</strong>
      <p>Tienes una consumición activa en otra mesa. Para cambiar de mesa necesitas la autorización del personal. Hasta entonces puedes seguir pidiendo y pagando en tu mesa actual.</p>
      <div className="table-change-client-actions">
       <button className="primary-action" type="button" onClick={()=>void requestTableChange()}>Solicitar cambio de mesa</button>
       <button type="button" onClick={cancelChangePrompt}>Cancelar</button>
      </div>
    </div>:
    qrState==='change_pending'||qrState==='change_rejected'?<div className="table-change-client-notice" role="status">
      <strong>{qrState==='change_pending'?'Solicitud enviada al personal':'Cambio de mesa no autorizado'}</strong>
      <p>{qrState==='change_rejected'?REJECTED_CHANGE_MESSAGE:
       'Puedes seguir consumiendo y pagando en tu mesa actual mientras el personal responde.'}</p>
      <p>{changeRemainingSeconds!==null&&changeRemainingSeconds>0?
       `Podrás realizar una nueva solicitud en ${changeRemainingSeconds} segundos`:
       'Consulta el estado para comprobar si puedes solicitar de nuevo.'}</p>
      <div className="table-change-client-actions">
       <button className="primary-action" type="button" onClick={()=>void refreshTableChange()}>Consultar respuesta</button>
       <button type="button" onClick={cancelChangePrompt}>Volver a mi mesa</button>
      </div>
    </div>:
    qrState==='change_approved'?<div className="table-change-client-notice" role="status">
      <strong>Cambio de mesa aprobado</strong><p>{APPROVED_CHANGE_MESSAGE}</p>
      <p>El consumo seguirá en tu mesa actual hasta confirmar un pedido en la nueva mesa.</p>
      <div className="table-change-client-actions">
       <button className="primary-action" type="button" onClick={continueAfterApproval}>Continuar con la mesa escaneada</button>
       <button type="button" onClick={cancelChangePrompt}>Seguir en mi mesa</button>
      </div>
    </div>:
    qrState==='change_error'?<div className="table-change-client-notice" role="alert">
      <strong>No se puede comprobar el cambio de mesa</strong>
      <p>Por seguridad no se habilitará otra mesa. Tu consumición anterior se conserva.</p>
      <div className="table-change-client-actions">
       <button type="button" onClick={()=>void refreshTableChange()}>Reintentar</button>
       <button type="button" onClick={cancelChangePrompt}>Cancelar</button>
      </div>
    </div>:
    qrState==='authorized'&&tableVisit?<><div className="qr-success" role="status"><Icon name="check"/><div><strong>{locale==='es'?'Mesa verificada':'Table verified'}</strong><span>{locale==='es'?`Autorización válida hasta ${new Date(tableVisit.expiresAt).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}.`:`Authorization valid until ${new Date(tableVisit.expiresAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}.`}</span></div></div>{basket.length&&issues.length===0?<button className="primary-action" type="button" onClick={()=>void prepareCheckout()}>{locale==='es'?'Continuar con el pedido':'Continue with order'}</button>:null}{flowContract==='h6'?<button type="button" onClick={()=>setOverlay('pay-others')}>{locale==='es'?'Pagar consumos y propinas en caja':'Pay consumption and tips at the cashier'}</button>:null}<button type="button" onClick={()=>{qrCredentialRef.current=null;setTableVisit(null);setQrState('idle');}}> {locale==='es'?'Escanear de nuevo':'Scan again'}</button></>:
    qrState==='authorizing'?<span className="honest-status" role="status">{locale==='es'?'Validando mesa y visita…':'Validating table and visit…'}</span>:
    qrState==='identity_required'?<><span className="honest-status" role="status">{locale==='es'?'Crea tu identidad segura para validar esta mesa. El QR queda pendiente solo en memoria.':'Create your secure identity to validate this table. The QR remains pending in memory only.'}</span><button className="primary-action" type="button" onClick={()=>{setOverlay(null);setArea('settings');}}>{locale==='es'?'Crear identidad':'Create identity'}</button></>:
    qrState==='invalid'?<><span className="qr-error" role="alert">{locale==='es'?'Este QR no cumple el contrato seguro de Sabora o pertenece a otra instalación.':'This QR does not meet Sabora’s secure contract or belongs to another installation.'}</span><button type="button" onClick={()=>setQrState('idle')}>{locale==='es'?'Intentar otro QR':'Try another QR'}</button></>:
    qrState==='forbidden'?<><span className="qr-error" role="alert">{locale==='es'?'El QR, la mesa o la sesión ya no están autorizados. Solicita ayuda al personal.':'The QR, table or session is no longer authorized. Ask staff for help.'}</span><button type="button" onClick={()=>setQrState('idle')}>{locale==='es'?'Escanear otro QR':'Scan another QR'}</button></>:
    qrState==='unavailable'?<><span className="qr-error" role="alert">{locale==='es'?'No se ha podido verificar la mesa. No se ha habilitado ningún pedido.':'The table could not be verified. Ordering has not been enabled.'}</span><button type="button" onClick={()=>{const credential=qrCredentialRef.current;if(identity.status==='authenticated'&&credential)void authorizeTable(credential);else setQrState('idle');}}>{locale==='es'?'Reintentar':'Try again'}</button></>:
    configuredRestaurantCode()?<TableQrScanner locale={locale} onScan={acceptScannedQr}/>:
    <span className="qr-error" role="alert">{locale==='es'?'Esta instalación aún no tiene configurado su código de restaurante.':'This installation does not have its restaurant code configured yet.'}</span>}
   <p className="privacy-copy">{locale==='es'?'El token no se guarda en el historial ni en el almacenamiento del navegador. El QR identifica contexto de mesa; no acredita presencia física ni permite ver cuentas ajenas.':'The token is not kept in browser history or storage. The QR identifies table context; it does not prove physical presence or grant access to other accounts.'}</p></div></Modal>:null}
  {overlay==='cart'?<Modal title={copy.selection} onClose={closeOverlay} closeLabel={locale==='es'?'Cerrar':'Close'}><div className="basket-lines">{basket.length?basket.map(line=>{const item=items.find(value=>value.id.toLowerCase()===line.itemId.toLowerCase());const currentPrice=item?currentCatalogUnitPrice(item,line):null;const changed=currentPrice===null||currentPrice!==line.priceCents;const lineKey=basketLineKey(line);const variant=item?basketSelectionDescription(item,line.selection):'';return <article key={lineKey}><div className="basket-line-main"><h3>{line.name}</h3>{variant?<p className="privacy-copy">{variant}</p>:null}<p>{formatPrice(line.priceCents,locale==='es'?'es-ES':'en-IE')} · {item?(item.available?(locale==='es'?'Disponible':'Available'):(locale==='es'?'Agotado: retira el plato antes de pedir':'Sold out: remove this dish before ordering')):(locale==='es'?'Plato retirado de la carta: retíralo antes de pedir':'Dish no longer published: remove before ordering')}</p>{item&&item.available&&changed&&currentPrice!==null?<p className="basket-price-notice" role="status">{locale==='es'?'El precio ha cambiado a ':'The price has changed to '}{formatPrice(currentPrice,locale==='es'?'es-ES':'en-IE')}<button type="button" onClick={()=>acceptPrice(line.itemId,lineKey)}>{locale==='es'?'Aceptar nuevo precio':'Accept new price'}</button></p>:null}<div className="basket-line-actions"><button type="button" onClick={()=>removeLine(line.itemId,lineKey)}>{locale==='es'?'Retirar de la cesta':'Remove from basket'}</button>{item&&item.available?<button type="button" onClick={()=>openDetail(item,line)}>{locale==='es'?'Editar detalles':'Edit details'}</button>:null}</div></div>{item?<div className="quantity-control"><button type="button" onClick={()=>updateQuantity(item,-1,lineKey)} aria-label={`${locale==='es'?'Quitar una unidad de':'Remove one unit of'} ${item.name}${variant?' · '+variant:''}`}><Icon name="minus"/></button><strong>{line.quantity}</strong><button type="button" disabled={!item.available} onClick={()=>updateQuantity(item,1,lineKey)} aria-label={`${locale==='es'?'Añadir una unidad de':'Add one unit of'} ${item.name}${variant?' · '+variant:''}`}><Icon name="plus"/></button></div>:null}</article>}):<EmptyState>{locale==='es'?'Tu selección está vacía.':'Your selection is empty.'}</EmptyState>}</div>{basket.length?<><div className="basket-total"><span>Total {locale==='es'?'informativo':'for reference'}</span><strong>{formatPrice(total,locale==='es'?'es-ES':'en-IE')}</strong></div>{issues.length>0?<div className="prose-card" role="status" aria-live="polite"><h3>{locale==='es'?'Selección pendiente de revisión':'Selection needs review'}</h3><p>{locale==='es'?`${issues.length} plato(s) requieren una decisión antes de continuar.`:`${issues.length} dish(es) need your decision before continuing.`}</p><ul>{issueCounts.soldOut>0?<li>{locale==='es'?`${issueCounts.soldOut} agotado(s)`: `${issueCounts.soldOut} sold out`}</li>:null}{issueCounts.unpublished>0?<li>{locale==='es'?`${issueCounts.unpublished} retirado(s)`: `${issueCounts.unpublished} unpublished`}</li>:null}{issueCounts.priceChanged>0?<li>{locale==='es'?`${issueCounts.priceChanged} con precio actualizado`: `${issueCounts.priceChanged} with updated prices`}</li>:null}</ul></div>:null}<div className="basket-actions"><button type="button" disabled>{locale==='es'?'Reserva no disponible':'Reservation unavailable'}</button><button className="primary-action" type="button" disabled={!canRequestTableOrder} onClick={()=>{if(tableVisit)void prepareCheckout();else {setOverlay('qr');setArea('qr');}}}>{tableVisit?(locale==='es'?'Revalidar y continuar':'Revalidate and continue'):(locale==='es'?'Validar mesa para pedir':'Validate table to order')}</button></div>{!canRequestTableOrder?<p role="status" className="privacy-copy">{catalog.status!=='ready'?(locale==='es'?'Espera a que se cargue la carta para revisar la selección.':'Wait for the menu to load before reviewing your selection.'):(locale==='es'?'Revisa los platos agotados, retirados o con cambios de precio. Retira los no disponibles o acepta expresamente los nuevos precios.':'Review sold-out, unpublished or repriced dishes. Remove unavailable dishes or expressly accept the updated configured price.')}</p>:null}<p className="privacy-copy">{locale==='es'?'El servidor revalida la cesta antes de elegir pago. Las reservas permanecen en un circuito separado.':'The server revalidates the basket before payment choice. Reservations remain in a separate flow.'}</p></>:null}</Modal>:null}
  {overlay==='pay-others'&&tableVisit?<Modal title={locale==='es'?'Pagar deudas ajenas':'Pay another diner’s debt'} onClose={closeOverlay}><ThirdPartyCashPanel locale={locale} tableId={tableVisit.tableId} visitId={tableVisit.visitId} transport={customerTransport}/></Modal>:null}
  {overlay==='checkout'?<Modal title={locale==='es'?'Confirmar pedido':'Confirm order'} onClose={closeOverlay} closeLabel={locale==='es'?'Cerrar':'Close'}><CheckoutPanel locale={locale} totalCents={quotedTotal} phase={checkoutPhase} paymentMode={paymentMode} requirePayAsOrdered={checkoutPaymentPolicy?.requirePayAsOrdered??tableVisit?.paymentPolicy?.requirePayAsOrdered??false} fixedPaymentMode={checkoutPaymentPolicy?.selectedMode??null} policyConflict={quotedTotal>0&&checkoutPaymentPolicy?.selectedMode==='pay_at_end'&&checkoutPaymentPolicy.requirePayAsOrdered} paymentsEnabled={flowContract==='h6'} message={checkoutMessage} onPaymentMode={setPaymentMode} onConfirm={()=>void confirmCheckout()} onRetry={()=>{if(pendingPaymentOrderRef.current){if(checkoutPhase==='payment_action')void retryPaymentAction();else void refreshPaymentState(pendingPaymentOrderRef.current);}else if(checkoutPhase==='uncertain')void reconcileCheckout();else if(checkoutPhase==='error')void prepareCheckout();else if(quoteLines.length&&checkoutRequestRef.current)void confirmCheckout();else void prepareCheckout();}}/></Modal>:null}
  {overlay==='revision'?<Modal title={locale==='es'?'Corregir pedido':'Correct order'} onClose={closeOverlay} closeLabel={locale==='es'?'Cerrar':'Close'}><div className="revision-correction" aria-busy={revisionPhase==='loading'||revisionPhase==='submitting'}><span className="eyebrow">{locale==='es'?'REVISIÓN NECESARIA':'REVISION REQUIRED'}</span><p>{locale==='es'?'El snapshot original se conserva. Solo las líneas señaladas necesitan una alternativa antes del despacho.':'The original snapshot is preserved. Only the marked lines need an alternative before dispatch.'}</p>{pendingRevision?<ul>{pendingRevision.lines.map(line=><li key={line.lineNumber}><div><strong>{line.itemName}</strong><span>{line.quantity} × {formatPrice(line.totalCents,locale==='es'?'es-ES':'en-IE')}</span></div>{line.affected?<label><span>{locale==='es'?'Alternativa disponible':'Available alternative'}</span><select aria-label={`${locale==='es'?'Alternativa para':'Alternative for'} ${line.itemName}`} value={revisionSelections[line.lineNumber]??''} onChange={event=>{revisionPreparedRef.current=null;revisionAcceptanceTokenRef.current=null;setRevisionChanges([]);setRevisionSelections(current=>Object.freeze({...current,[line.lineNumber]:event.target.value}));}}><option value="">{locale==='es'?'Seleccionar…':'Select…'}</option>{catalog.status==='ready'?catalog.items.filter(item=>item.available&&!(item.options??[]).some(group=>group.required)).map(item=><option key={item.id} value={item.id}>{item.name} · {formatPrice(item.priceCents,locale==='es'?'es-ES':'en-IE')}</option>):null}</select></label>:<span className="revision-preserved">{locale==='es'?'Se conserva sin cambios':'Preserved unchanged'}</span>}</li>)}</ul>:null}{revisionChanges.length?<div className="revision-price-review" role="status"><strong>{locale==='es'?'Revisión económica':'Economic review'}</strong>{revisionChanges.map(change=><p key={change.lineNumber}>{change.previousItemName}: {formatPrice(change.previousTotalCents,locale==='es'?'es-ES':'en-IE')} → {change.currentItemName}: {formatPrice(change.currentTotalCents,locale==='es'?'es-ES':'en-IE')} <b>({change.differenceCents>=0?'+':''}{formatPrice(change.differenceCents,locale==='es'?'es-ES':'en-IE')})</b></p>)}</div>:null}{revisionMessage?<p className="honest-status" role="status">{revisionMessage}</p>:null}<button className="button button--primary" type="button" disabled={!pendingRevision||revisionPhase==='loading'||revisionPhase==='submitting'} onClick={()=>void resubmitRevision()}>{revisionPhase==='submitting'?(locale==='es'?'Reenviando…':'Resubmitting…'):(locale==='es'?'Reenviar pedido':'Resubmit order')}</button><p className="privacy-copy">{locale==='es'?'No se crea una segunda cuenta ni un segundo pedido. Con pago inmediato, cualquier cambio de importe queda bloqueado hasta conciliación segura.':'No second account or order is created. With pay-now, any amount change remains blocked until safe reconciliation.'}</p></div></Modal>:null}
  {detail?<Modal title={detail.name} onClose={closeDetail} closeLabel={locale==='es'?'Cerrar':'Close'}>
   <div className="detail-visual">{detail.imageUrl?<img src={detail.imageUrl} alt=""/>:<><Icon name="leaf"/><span>{locale==='es'?'Imagen pendiente de activo autorizado':'Image awaiting an approved asset'}</span></>}</div>
   <p className="detail-category">{detail.category}</p>{detail.description?<p>{detail.description}</p>:null}
   <p>{detail.allergens.length?(locale==='es'?'Alérgenos declarados: ':'Declared allergens: ')+detail.allergens.join(', '):(locale==='es'?'Declaración verificada sin alérgenos listados; consulta posibles trazas.':'Verified declaration with no listed allergens; ask about possible traces.')}</p>
   {(detail.options?.length??0)>0?<div className="catalog-configurator">{detail.options!.map(group=><fieldset key={group.id}><legend>{group.name}{group.required?' *':''}</legend>
    {group.values.map(value=>{const checked=(detailSelection.options[group.id]??[]).includes(value.id);return <label key={value.id}><input type="checkbox" checked={checked} disabled={!value.available}
     onChange={event=>setDetailSelection(current=>{const selected=current.options[group.id]??[];const next=event.target.checked?
      (group.maxSelections===1?[value.id]:[...selected,value.id].slice(0,group.maxSelections)):selected.filter(id=>id!==value.id);
      return {...current,options:{...current.options,[group.id]:next}}})}/><span>{value.name}{value.priceCents?` · +${formatPrice(value.priceCents,locale==='es'?'es-ES':'en-IE')}`:''}</span></label>})}</fieldset>)}</div>:null}
   {(detail.extras?.length??0)>0?<fieldset className="catalog-configurator"><legend>{locale==='es'?'Extras':'Extras'}</legend>{detail.extras!.map(extra=><label key={extra.id}><input type="checkbox" disabled={!extra.available}
    checked={detailSelection.extras.includes(extra.id)} onChange={event=>setDetailSelection(current=>({...current,extras:event.target.checked?[...current.extras,extra.id]:current.extras.filter(id=>id!==extra.id)}))}/>
    <span>{extra.name}{extra.priceCents?` · +${formatPrice(extra.priceCents,locale==='es'?'es-ES':'en-IE')}`:''}</span></label>)}</fieldset>:null}
   <label className="detail-quantity">{locale==='es'?'Cantidad':'Quantity'}<input type="number" min="1" max="20" value={detailQuantity} onChange={event=>setDetailQuantity(Number(event.target.value))}/></label>
   <div className="detail-footer"><strong>{(()=>{try{return formatPrice(catalogUnitPrice(detail,detailSelection as CatalogSelection)*detailQuantity,locale==='es'?'es-ES':'en-IE')}catch{return formatPrice(detail.priceCents,locale==='es'?'es-ES':'en-IE')}})()}</strong>
    {detail.available?<button className="primary-action" type="button" disabled={!Number.isSafeInteger(detailQuantity)||detailQuantity<1||detailQuantity>20||
      (detail.options??[]).some(group=>group.required&&(detailSelection.options[group.id]?.length??0)===0)} onClick={()=>{
       setBasket(current=>configureBasketLine(current,detail,detailSelection as CatalogSelection,detailQuantity,detailEditingKey??undefined));closeDetail();}}>{locale==='es'?'Guardar en la selección':'Save selection'}</button>:
     <button type="button" disabled>{locale==='es'?'Agotado':'Sold out'}</button>}</div>
  </Modal>:null}
 </div>;
}
