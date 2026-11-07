import {useEffect,useMemo,useRef,useState} from 'react';
import {EmptyState,ErrorState,LoadingState,PageHeader,SnapshotToolbar,StatusBadge} from '../components/Primitives';
import type {FinanceDashboardGateway,FinancePeriod,FinanceSnapshot} from '../finance-dashboard-model';

const currency=(value:number)=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(value/100);
const money=(value:number|null)=>value===null?'Sin datos':currency(value);
const label:Record<FinancePeriod,string>={
 today:'Hoy',last7:'Últimos 7 días',thisMonth:'Este mes',previousMonth:'Mes anterior'
};
const compare=(value:number|null,previous:number|null)=>{
 if(value===null||previous===null||previous===0)return '—';
 const change=100*(value-previous)/Math.abs(previous);
 return (change>0?'+':'')+new Intl.NumberFormat('es-ES',{maximumFractionDigits:1}).format(change)+' %';
};

export function FinanceDashboardView({gateway}:{gateway:FinanceDashboardGateway}){
 const [period,setPeriod]=useState<FinancePeriod>('today');
 const [selectedMonth,setSelectedMonth]=useState('');
 const [snapshot,setSnapshot]=useState<FinanceSnapshot|null>(null);
 const [phase,setPhase]=useState<'loading'|'ready'|'error'>('loading');
 const [refreshing,setRefreshing]=useState(false);
 const [refreshFailed,setRefreshFailed]=useState(false);
 const [revision,setRevision]=useState(0);
 const requestRef=useRef<AbortController|null>(null);
 useEffect(()=>{
  const controller=new AbortController();
  requestRef.current?.abort();requestRef.current=controller;
  setPhase('loading');setSnapshot(null);setRefreshing(true);setRefreshFailed(false);
  void gateway.readFinancialDashboard({period,
    month:period==='thisMonth'&&selectedMonth?selectedMonth:null,signal:controller.signal})
   .then(value=>{if(!controller.signal.aborted){
    setSnapshot(value);setPhase('ready');setRefreshFailed(false);
   }})
   .catch(()=>{if(!controller.signal.aborted){setSnapshot(null);setPhase('error');setRefreshFailed(true);}})
   .finally(()=>{if(!controller.signal.aborted)setRefreshing(false);});
  return()=>controller.abort();
 },[gateway,period,selectedMonth,revision]);
 const reload=()=>setRevision(v=>v+1);
 const maxSales=useMemo(()=>Math.max(1,...(snapshot?.dailySales.map(x=>Math.abs(x.netSalesCents))??[])),[snapshot]);
 return <div className="view-stack">
  <PageHeader eyebrow="Configuración · Finanzas" title="Dashboard financiero"
   description="Información del restaurante calculada en servidor: ventas netas y recaudación confirmada no son la misma magnitud."
   actions={<StatusBadge tone={phase==='ready'?'brand':'warning'}>{phase==='ready'?'Lectura autorizada':'Sin lectura vigente'}</StatusBadge>}/>
  <div className="period-bar" aria-label="Periodo del dashboard financiero">
   <span>Periodo</span>
   {(Object.keys(label) as FinancePeriod[]).map(value=><button key={value} type="button"
    className="segment-button" aria-pressed={period===value} disabled={refreshing}
    onClick={()=>{setPeriod(value);setSelectedMonth('');}}>{label[value]}</button>)}
   {period==='thisMonth'?<label className="finance-month">Mes
    <input type="month" aria-label="Mes de tendencia" value={selectedMonth}
     disabled={refreshing} onChange={event=>setSelectedMonth(event.target.value)}/></label>:null}
  </div>
  {phase==='loading'?<LoadingState title="Consultando indicadores"
   description="Leyendo datos económicos autorizados y fechas del restaurante."/>:null}
  {phase==='error'?<ErrorState title="Dashboard no disponible"
   description="No existe una lectura financiera fiable. Comprueba los permisos y la zona horaria configurada; no se reutilizan importes obsoletos."
   onRetry={reload}/>:null}
  {snapshot&&phase==='ready'?<>
   <SnapshotToolbar subject="indicadores económicos" refreshing={refreshing}
    refreshFailed={refreshFailed} onRefresh={reload}/>
   <div className="finance-snapshot-time"><span>Última actualización: {new Date(snapshot.asOf).toLocaleString('es-ES',{timeZone:snapshot.timeZone})} · {snapshot.timeZone}</span>
    <span>Periodo: {new Date(snapshot.from).toLocaleDateString('es-ES',{timeZone:snapshot.timeZone})} – {new Date(snapshot.to).toLocaleDateString('es-ES',{timeZone:snapshot.timeZone})} (fin exclusivo)</span></div>
   {snapshot.historicalCoverage==='incomplete'?<div className="connection-notice connection-notice--warning" role="status">
    <p><strong>Recaudación digital histórica no verificable.</strong> Existen cobros o devoluciones anteriores sin fecha inmutable de confirmación. La recaudación total y su comparación permanecen en «Sin datos»; no se calculan cifras aproximadas.</p>
   </div>:null}
   <section aria-label="Indicadores financieros">
    <div className="metric-grid">
     <article className="metric-card"><span>Ventas netas · periodo</span><strong>{currency(snapshot.salesCents)}</strong><p>Consumo confirmado menos ajustes; sin propinas.</p><small>Vs. periodo anterior: {compare(snapshot.salesCents,snapshot.previousSalesCents)}</small></article>
     <article className="metric-card"><span>Recaudación confirmada · periodo</span><strong>{money(snapshot.collectedCents)}</strong><p>Efectivo y capturas Stripe menos devoluciones realmente ejecutadas.</p><small>Vs. anterior: {compare(snapshot.collectedCents,snapshot.previousCollectedCents)}</small></article>
     <article className="metric-card"><span>Saldo pendiente · actual</span><strong>{currency(snapshot.outstandingCents)}</strong><p>Deuda abierta exigible; nunca incluye autorizaciones como recaudación.</p></article>
     <article className="metric-card"><span>Pedidos con consumo · periodo</span><strong>{snapshot.ordersCount}</strong><p>Pedidos confirmados sin contabilizar reintentos.</p></article>
     <article className="metric-card"><span>Ticket medio · periodo</span><strong>{money(snapshot.averageTicketCents)}</strong><p>Por {snapshot.consumingAccounts} cuenta(s) con consumo; métrica operativa, no fiscal.</p></article>
    </div>
   </section>
   <div className="dashboard-grid">
    <section className="panel panel--wide" aria-labelledby="finance-trend-title">
     <div className="panel-heading"><div><span className="eyebrow">Tendencia</span>
      <h2 id="finance-trend-title">Ventas netas por día · {snapshot.month}</h2></div></div>
     <div className="finance-trend" role="img" aria-label={'Ventas diarias del mes '+snapshot.month}>
      {snapshot.dailySales.map(entry=><div className="finance-trend-day" key={entry.date}
       title={entry.date+': '+currency(entry.netSalesCents)}>
       <span className="finance-trend-plot"><span
        className={entry.netSalesCents<0?'finance-trend-bar finance-trend-bar--negative':'finance-trend-bar'}
        style={{height:Math.max(entry.netSalesCents===0?1:5,100*Math.abs(entry.netSalesCents)/maxSales)+'%'}}/></span>
       <small>{entry.date.slice(-2)}</small>
      </div>)}
     </div>
     <p className="privacy-copy">Importes al cliente, IVA incluido. Ajustes aprobados se atribuyen a su fecha de confirmación. No es una liquidación fiscal.</p>
    </section>
    <section className="panel" aria-labelledby="finance-ranking-title">
     <div className="panel-heading"><div><span className="eyebrow">Carta</span>
      <h2 id="finance-ranking-title">Top 10 platos · {label[period]}</h2></div></div>
     {!snapshot.rankingComplete?<EmptyState compact icon="catalog" title="Ranking no verificable"
      description="Existen pedidos históricos o ajustes sin asignación fiable por plato; no se estima el ranking."/>:
      !snapshot.topItems?.length?<EmptyState compact icon="catalog" title="Sin pedidos"
       description="Ningún consumo con desglose por plato en este periodo."/>:
       <ol className="finance-ranking">{snapshot.topItems.map(item=><li key={item.itemId}>
        <span>{item.name}</span><strong>{item.units} ud.</strong><small>{currency(item.netSalesCents)}</small>
       </li>)}</ol>}
    </section>
   </div>
   <section className="panel" aria-label="Desglose de cobros">
    <div className="panel-heading"><div><span className="eyebrow">Cobros</span>
     <h2>Medios y propinas</h2></div></div>
    <div className="finance-channels">
     <p><strong>Efectivo registrado:</strong> {currency(snapshot.cashCollectedCents)}</p>
     <p><strong>Tarjeta confirmada:</strong> {money(snapshot.stripeCollectedCents)}</p>
     <p><strong>Propinas:</strong> Sin datos — el módulo de propinas sigue pendiente y no se imputa a ventas.</p>
    </div>
   </section>
  </>:null}
 </div>;
}
