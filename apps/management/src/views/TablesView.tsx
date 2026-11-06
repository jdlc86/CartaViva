import {useEffect, useMemo, useRef, useState} from 'react';
import {Icon} from '../components/Icon';
import {TableQrOneTime} from '../components/TableQrOneTime';
import {TableChangeRequestsPanel,type TableChangeQueueGateway} from './TableChangeRequestsPanel';
import {
  ConnectionNotice,
  DefinitionRow,
  EmptyState,
  ErrorState,
  LoadingState,
  LockedButton,
  PageHeader,
  SnapshotToolbar,
  StatusBadge,
} from '../components/Primitives';
import {createLatestReadTaskController, type LatestReadTaskController} from '../latest-read-task';
import {
  loadAdminTablesPage,
  mergeAdminTables,
  TABLE_PAGE_SIZE,
  type AdminTable,
  type AdminTablesGateway,
  type TableOrderingState,
  type TableReadinessState,
} from '../tables-read-model';

type ReadPhase = 'disconnected' | 'loading' | 'ready' | 'error';
type BadgeTone = 'neutral' | 'brand' | 'warning' | 'danger';

const tableStates: ReadonlyArray<{
  id: TableOrderingState;
  label: string;
  tone: BadgeTone;
  description: string;
}> = [
  {id: 'open', label: 'ABIERTA', tone: 'brand', description: 'Admite nuevas autorizaciones y pedidos si el resto del contexto es válido.'},
  {id: 'paused', label: 'PAUSADA', tone: 'warning', description: 'Bloquea temporalmente nuevos pedidos sin cerrar la ocupación.'},
  {id: 'closed', label: 'CERRADA', tone: 'neutral', description: 'No admite nuevas autorizaciones ni pedidos.'},
];

function stateMeta(state: TableOrderingState) {
  return tableStates.find((item) => item.id === state) ?? tableStates[2];
}

const readinessStates:ReadonlyArray<{id:TableReadinessState;label:string;tone:BadgeTone;description:string}>=[
 {id:'EN_PREPARACION',label:'EN PREPARACIÓN',tone:'warning',description:'La mesa todavía no admite nuevas entradas ni pedidos.'},
 {id:'LISTA',label:'LISTA',tone:'brand',description:'La mesa puede validar el QR cuando su ocupación también lo permite.'},
 {id:'BLOQUEADA',label:'BLOQUEADA',tone:'danger',description:'Bloquea entradas y pedidos nuevos sin alterar comandas aceptadas.'},
];
const readinessMeta=(state?:TableReadinessState)=>readinessStates.find(value=>value.id===state)??readinessStates[0];

export function TablesView({gateway,tableChangeGateway}: {gateway?: AdminTablesGateway;tableChangeGateway?: TableChangeQueueGateway}) {
  const [phase, setPhase] = useState<ReadPhase>(gateway ? 'loading' : 'disconnected');
  const [tables, setTables] = useState<readonly AdminTable[]>([]);
  const [nextAfterNumber, setNextAfterNumber] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedTable, setFocusedTable] = useState<AdminTable | null>(null);
  const [filter, setFilter] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [paginationError, setPaginationError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [createOpen,setCreateOpen]=useState(false);
  const [createNumber,setCreateNumber]=useState('');
  const [createCapacity,setCreateCapacity]=useState('2');
  const [createDescription,setCreateDescription]=useState('');
  const [editNumber,setEditNumber]=useState('');
  const [editCapacity,setEditCapacity]=useState('');
  const [editDescription,setEditDescription]=useState('');
  const [actionPending,setActionPending]=useState(false);
  const [actionMessage,setActionMessage]=useState<string|null>(null);
  const [qrPayload,setQrPayload]=useState<string|null>(null);
  const readControllerRef = useRef<LatestReadTaskController | null>(null);
  if (readControllerRef.current === null) readControllerRef.current = createLatestReadTaskController();
  const readController = readControllerRef.current;

  useEffect(() => {
    const task = readController.start();
    setLoadingMore(false);
    setRefreshing(false);
    setRefreshError(false);

    if (!gateway) {
      setPhase('disconnected');
      setTables([]);
      setNextAfterNumber(null);
      setSelectedId(null);
      setFilter('');
      setPaginationError(false);
      task.finish();
      return () => readController.cancel();
    }

    setPhase('loading');
    setTables([]);
    setNextAfterNumber(null);
    setSelectedId(null);
    setFocusedTable(null);
    setPaginationError(false);

    void loadAdminTablesPage(gateway, {afterNumber: 0, limit: TABLE_PAGE_SIZE, signal: task.signal})
      .then((page) => {
        if (!task.isCurrent()) return;
        setTables(page.items);
        setNextAfterNumber(page.nextAfterNumber);
        setSelectedId(page.items[0]?.id ?? null);
        setPhase('ready');
      })
      .catch(() => {
        if (!task.isCurrent()) return;
        setPhase('error');
      })
      .finally(() => {
        task.finish();
      });

    return () => readController.cancel();
  }, [gateway, readController, reloadVersion]);

  const selectedTable = tables.find((table) => table.id === selectedId) ??
    (focusedTable?.id===selectedId ? focusedTable : null);
  const canManage=typeof gateway?.manageTable==='function'&&typeof gateway?.transitionOccupancy==='function';
  useEffect(()=>{
   setEditNumber(selectedTable?String(selectedTable.number):'');
   setEditCapacity(selectedTable?String(selectedTable.capacity):'');
   setEditDescription(selectedTable?.description??'');
  },[selectedTable?.id,selectedTable?.number,selectedTable?.capacity,selectedTable?.description]);
  const visibleTables = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase('es');
    // A freshly created/rotated table can lie outside the first paginated page.
    // Keep its independently authorized projection visible without corrupting
    // the server cursor or assigning a one-time QR to another table.
    const loaded=focusedTable&&!tables.some(table=>table.id===focusedTable.id)
      ? [focusedTable,...tables] : tables;
    if (!query) return loaded;
    return loaded.filter((table) => {
      const state = stateMeta(table.orderingState).label.toLocaleLowerCase('es');
      return String(table.number).includes(query) ||
        (table.description?.toLocaleLowerCase('es').includes(query) ?? false) || state.includes(query);
    });
  }, [filter, tables, focusedTable]);

  const loadMore = async () => {
    if (!gateway || nextAfterNumber === null || loadingMore || refreshing) return;
    const task = readController.start();
    setLoadingMore(true);
    setPaginationError(false);
    try {
      const page = await loadAdminTablesPage(gateway, {
        afterNumber: nextAfterNumber,
        limit: TABLE_PAGE_SIZE,
        signal: task.signal,
      });
      if (!task.isCurrent()) return;
      setTables((current) => mergeAdminTables(current, page.items));
      setNextAfterNumber(page.nextAfterNumber);
    } catch {
      if (task.isCurrent()) setPaginationError(true);
    } finally {
      const isCurrent = task.isCurrent();
      task.finish();
      if (isCurrent) setLoadingMore(false);
    }
  };

  const refreshTables = async (focus?:Readonly<{id:string;number:number}>):Promise<boolean> => {
    if (!gateway || phase !== 'ready' || refreshing) return false;
    const task = readController.start();
    setLoadingMore(false);
    setPaginationError(false);
    setRefreshing(true);
    setRefreshError(false);

    try {
      const page = await loadAdminTablesPage(gateway, {
        afterNumber: 0,
        limit: TABLE_PAGE_SIZE,
        signal: task.signal,
      });
      const expected=focus??(focusedTable?{id:focusedTable.id,number:focusedTable.number}:null);
      let verified:AdminTable|null=null;
      if(expected&&!page.items.some(table=>table.id===expected.id)){
        if(!Number.isSafeInteger(expected.number)||expected.number<1)throw Error('invalid_focus_table_number');
        const precise=await loadAdminTablesPage(gateway,{
          afterNumber:expected.number-1,limit:1,signal:task.signal,
        });
        const row=precise.items[0];
        if(row?.id!==expected.id||row.number!==expected.number)
          throw Error('focused_table_projection_mismatch');
        verified=row;
      }
      if (!task.isCurrent()) return false;
      setTables(page.items);
      setFocusedTable(verified);
      setNextAfterNumber(page.nextAfterNumber);
      setSelectedId((current) => {
        const requested=focus?.id??current;
        return page.items.some(table=>table.id===requested)||verified?.id===requested
          ? requested : page.items[0]?.id??null;
      });
      return true;
    } catch {
      if (task.isCurrent()) setRefreshError(true);
      return false;
    } finally {
      const isCurrent = task.isCurrent();
      task.finish();
      if (isCurrent) setRefreshing(false);
    }
  };

  const manage=async(operation:'create'|'update'|'readiness'|'qr_rotate'|'qr_revoke',payload:Record<string,unknown>)=>{
   if(!gateway?.manageTable||actionPending||refreshing||phase!=='ready')return;
   setActionPending(true);setActionMessage(null);
   let committed=false;
   try{
    const result=await gateway.manageTable({requestId:crypto.randomUUID(),operation,payload});
    if(!result||typeof result!=='object'||Array.isArray(result))throw Error('invalid_table_management_result');
    const value=result as Record<string,unknown>;
    committed=true;
    const nextId=value.tableId;
    const nextNumber=value.number;
    if(typeof nextId!=='string'||typeof nextNumber!=='number'||
      !Number.isSafeInteger(nextNumber)||nextNumber<1)throw Error('invalid_table_management_result');
    if(!await refreshTables({id:nextId,number:nextNumber})){
      setQrPayload(null);
      setActionMessage('Cambio confirmado en el servidor, pero no se pudo verificar la ficha actualizada. Actualiza la lista antes de otra operación; si era un QR nuevo, deberás rotarlo para obtener una nueva copia imprimible.');
      return;
    }
    // Only reveal the one-time QR AFTER the selected, authorized table is loaded.
    setQrPayload(typeof value.qrPayload==='string'?value.qrPayload:null);
    setActionMessage(operation==='create'?'Mesa creada en preparación. Imprime ahora su QR o rótalo después.':
     operation==='qr_rotate'?'QR rotado. La credencial anterior ya no autoriza acciones nuevas.':
     operation==='qr_revoke'?'QR revocado sin alterar pedidos ni cuentas históricas.':'Cambio confirmado y auditado.');
    if(operation==='create'){setCreateOpen(false);setCreateNumber('');setCreateDescription('');}
   }catch{setQrPayload(null);setActionMessage(committed?
     'La operación fue aceptada, pero la respuesta no pudo verificarse. Consulta el estado real antes de reintentar.':
     'No se aplicó el cambio. El estado persistido se conserva.');}
   finally{setActionPending(false);}
  };
  const transitionOccupancy=async(target:TableOrderingState)=>{
   if(!gateway?.transitionOccupancy||!selectedTable||actionPending)return;
   setActionPending(true);setActionMessage(null);setQrPayload(null);
   try{await gateway.transitionOccupancy({requestId:crypto.randomUUID(),tableId:selectedTable.id,
    target,pauseUntil:null});
    if(!await refreshTables({id:selectedTable.id,number:selectedTable.number}))
      throw Error('table_occupancy_refresh_failed');
    setActionMessage('Ocupación actualizada con la política económica vigente.');}
   catch{setActionMessage('No se cambió la ocupación. Revisa la transición y las cuentas pendientes.');}
   finally{setActionPending(false);}
  };

  return (
    <div className="view-stack">
      {tableChangeGateway ? <TableChangeRequestsPanel gateway={tableChangeGateway}/> : null}
      <PageHeader
        eyebrow="Mesas y QR"
        title="Control de mesas"
        description="Administra preparación y ocupación como ejes separados, con credenciales QR revocables y auditoría."
        actions={canManage?<button className="button button--primary" type="button"
          disabled={phase!=='ready'||refreshing||actionPending}
          onClick={()=>setCreateOpen(value=>!value)}>
          <Icon name="plus" size={18}/> {createOpen?'Cancelar alta':'Crear mesa'}</button>:
          <LockedButton icon="plus">Crear mesa</LockedButton>}
      />

      {createOpen&&canManage&&phase==='ready'?<form className="panel management-inline-form" onSubmit={event=>{
       event.preventDefault();void manage('create',{number:Number(createNumber),capacity:Number(createCapacity),
        description:createDescription});}}>
       <div className="panel-heading"><div><span className="eyebrow">Alta segura</span><h2>Nueva mesa</h2>
        <p>El alta siempre comienza EN PREPARACIÓN y con ocupación cerrada.</p></div></div>
       <div className="management-form-grid">
        <label>Número<input required min="1" max="100000" inputMode="numeric" value={createNumber}
         onChange={event=>setCreateNumber(event.target.value)}/></label>
        <label>Capacidad<input required min="1" max="1000" type="number" value={createCapacity}
         onChange={event=>setCreateCapacity(event.target.value)}/></label>
        <label className="management-form-grid__wide">Descripción<input maxLength={240} value={createDescription}
         onChange={event=>setCreateDescription(event.target.value)}/></label>
       </div>
       <button className="button button--primary" disabled={actionPending} type="submit">
        {actionPending?'Creando…':'Crear y emitir QR'}</button>
      </form>:null}

      {gateway ? (
        <ConnectionNotice title={canManage?'Canal transaccional de mesas conectado.':'Proyección de mesas en modo consulta.'} tone="brand">
          No existe sondeo automático. Los listados nunca contienen secretos QR; una emisión se entrega una sola vez para imprimirla.
        </ConnectionNotice>
      ) : (
        <ConnectionNotice>
          No se cargarán mesas ni se emitirán credenciales hasta disponer de identidad verificada y composición backend autorizada.
        </ConnectionNotice>
      )}

      {phase === 'ready' ? (
        <SnapshotToolbar
          subject="mesas"
          refreshing={refreshing}
          refreshFailed={refreshError}
          onRefresh={() => void refreshTables()}
        />
      ) : null}

      <div className="workbench">
        <section className="workbench__master panel" aria-labelledby="table-list-title" aria-busy={phase === 'loading' || refreshing}>
          <div className="panel-heading panel-heading--stacked">
            <div className="table-list-heading">
              <div>
                <span className="eyebrow">Inventario</span>
                <h2 id="table-list-title">Mesas</h2>
              </div>
              {phase === 'ready' ? <StatusBadge>{tables.length} cargadas</StatusBadge> : null}
            </div>
            <label className={phase === 'ready' && tables.length > 0 ? 'search-field' : 'search-field search-field--disabled'}>
              <Icon name="search" size={18}/>
              <span className="visually-hidden">Filtrar mesas cargadas</span>
              <input
                disabled={phase !== 'ready' || tables.length === 0}
                type="search"
                value={filter}
                placeholder="Número, ubicación o estado"
                onChange={(event) => setFilter(event.target.value)}
              />
            </label>
          </div>

          <div className="state-legend" aria-label="Estados operativos de mesa">
            {tableStates.map((state) => <StatusBadge key={state.id} tone={state.tone}>{state.label}</StatusBadge>)}
          </div>

          {phase === 'disconnected' ? (
            <EmptyState
              icon="tables"
              title="Sin mesas conectadas"
              description="La aplicación no incluye un transporte ni una sesión administrativa por defecto."
            />
          ) : null}

          {phase === 'loading' ? (
            <LoadingState title="Cargando mesas" description="Solicitando únicamente la proyección administrativa autorizada."/>
          ) : null}

          {phase === 'error' ? (
            <ErrorState
              title="No se pudieron cargar las mesas"
              description="La lectura falló o devolvió un contrato no válido. No se conserva una respuesta parcial."
              onRetry={() => setReloadVersion((value) => value + 1)}
            />
          ) : null}

          {phase === 'ready' && tables.length === 0 ? (
            <EmptyState
              icon="tables"
              title="No hay mesas disponibles"
              description="La proyección autorizada respondió correctamente y no contiene registros."
            />
          ) : null}

          {phase === 'ready' && tables.length > 0 && visibleTables.length === 0 ? (
            <EmptyState
              compact
              icon="search"
              title="Sin coincidencias"
              description="Prueba con otro número, ubicación o estado entre las mesas ya cargadas."
            />
          ) : null}

          {phase === 'ready' && visibleTables.length > 0 ? (
            <ul className="table-list" aria-label="Mesas cargadas">
              {visibleTables.map((table) => {
                const meta = stateMeta(table.orderingState);
                return (
                  <li key={table.id}>
                    <button
                      className={selectedId === table.id ? 'table-list-item table-list-item--active' : 'table-list-item'}
                      type="button"
                      aria-pressed={selectedId === table.id}
                      onClick={() => {setSelectedId(table.id);setQrPayload(null);setActionMessage(null);}}
                    >
                      <span className="table-list-item__number">{table.number}</span>
                      <span className="table-list-item__copy">
                        <strong>Mesa {table.number}</strong>
                        <small>{table.description || `${table.capacity} plazas · Sin descripción`}</small>
                      </span>
                      <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {phase === 'ready' && nextAfterNumber !== null ? (
            <div className="table-pagination">
              {paginationError ? <p role="alert">No se pudo cargar la página siguiente. Las mesas visibles se conservan.</p> : null}
              <button className="button" type="button" disabled={loadingMore || refreshing} onClick={() => void loadMore()}>
                {loadingMore ? 'Cargando…' : paginationError ? 'Reintentar más mesas' : 'Cargar más mesas'}
              </button>
            </div>
          ) : null}
        </section>

        <section className="workbench__detail panel" aria-labelledby="table-detail-title">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Ficha de mesa</span>
              <h2 id="table-detail-title">{selectedTable ? `Mesa ${selectedTable.number}` : 'Selecciona una mesa'}</h2>
            </div>
            {selectedTable ? (
              <StatusBadge tone={stateMeta(selectedTable.orderingState).tone}>{stateMeta(selectedTable.orderingState).label}</StatusBadge>
            ) : <StatusBadge>Sin selección</StatusBadge>}
          </div>

          <dl className="definition-grid">
            <DefinitionRow label="Número" value={selectedTable?.number}/>
            <DefinitionRow label="Capacidad" value={selectedTable ? `${selectedTable.capacity} plazas` : undefined}/>
            <DefinitionRow label="Descripción" value={selectedTable?.description || undefined}/>
            <DefinitionRow label="Preparación" value={selectedTable ? readinessMeta(selectedTable.readinessState).label : 'Sin datos'}/>
            <DefinitionRow label="Ocupación" value={selectedTable ? stateMeta(selectedTable.orderingState).label : 'Sin datos'}/>
            <DefinitionRow label="Versión QR" value={selectedTable?.qrVersion}/>
          </dl>

          {selectedTable&&canManage?<form className="detail-block" onSubmit={event=>{
           event.preventDefault();void manage('update',{tableId:selectedTable.id,
            expectedRevision:selectedTable.revision,number:Number(editNumber),capacity:Number(editCapacity),
            description:editDescription});}}>
           <div className="detail-block__heading"><div><h3>Ficha administrativa</h3>
            <p>Los cambios compiten mediante revisión; una edición concurrente se rechaza sin sobrescribirla.</p></div></div>
           <div className="management-form-grid">
            <label>Número<input required min="1" max="100000" type="number" value={editNumber}
             onChange={event=>setEditNumber(event.target.value)}/></label>
            <label>Capacidad<input required min="1" max="1000" type="number" value={editCapacity}
             onChange={event=>setEditCapacity(event.target.value)}/></label>
            <label className="management-form-grid__wide">Descripción<input maxLength={240} value={editDescription}
             onChange={event=>setEditDescription(event.target.value)}/></label>
           </div>
           <button className="button" type="submit" disabled={actionPending}>Guardar ficha</button>
          </form>:null}

          <div className="detail-block">
            <div className="detail-block__heading"><div><h3>Preparación administrativa</h3>
             <p>{selectedTable?readinessMeta(selectedTable.readinessState).description:'Selecciona una mesa.'} No modifica comandas aceptadas.</p>
            </div></div>
            <div className="state-control" aria-label="Cambiar preparación de la mesa">
             {readinessStates.map(state=><button className={selectedTable?.readinessState===state.id?'state-control__current':undefined}
              type="button" disabled={!canManage||!selectedTable||actionPending||selectedTable.readinessState===state.id}
              onClick={()=>selectedTable&&void manage('readiness',{tableId:selectedTable.id,
               expectedRevision:selectedTable.revision,state:state.id})} key={state.id}>{state.label}</button>)}
            </div>
          </div>

          <div className="detail-block">
            <div className="detail-block__heading">
              <div>
                <h3>Estado operativo</h3>
                <p>{selectedTable ? stateMeta(selectedTable.orderingState).description : 'Selecciona una mesa para consultar el estado persistido.'} Cerrar conserva la historia económica y aplica la regla aprobada de coste cero.</p>
              </div>
            </div>
            <div className="state-control" aria-label="Cambiar estado de la mesa">
              {tableStates.map((state) => (
                <button
                  className={selectedTable?.orderingState === state.id ? 'state-control__current' : undefined}
                  type="button"
                  disabled={!canManage||!selectedTable||actionPending||selectedTable.orderingState===state.id||
                   (state.id==='paused'&&selectedTable.orderingState==='closed')}
                  onClick={()=>void transitionOccupancy(state.id)}
                  key={state.id}
                >
                  {state.label}
                </button>
              ))}
            </div>
          </div>

          <div className="detail-block qr-block">
            <div className="detail-block__heading">
              <div>
                <h3>Acceso QR</h3>
                <p>El QR identifica la mesa, no a una persona ni su presencia física.</p>
              </div>
              <StatusBadge tone={selectedTable?.qrEnabled?'brand':'warning'}>{selectedTable?.qrEnabled?'VIGENTE':'REVOCADO'}</StatusBadge>
            </div>
            <div className="qr-layout">
              {qrPayload&&selectedTable?<TableQrOneTime payload={qrPayload} tableNumber={selectedTable.number}/>:
               <div className="qr-placeholder" aria-label="La proyección no incluye ningún código QR">
                <Icon name="lock" size={28}/><span>Dato protegido</span></div>}
              <div className="qr-copy">
                <strong>{qrPayload?'Entrega temporal lista para imprimir':'La lectura no expone secretos QR'}</strong>
                <p>{qrPayload?'Al salir o realizar otra acción no se podrá recuperar este contenido; una nueva entrega exige rotación.':
                 'La rotación invalida visitas antiguas para acciones nuevas y devuelve el contenido solo en esa respuesta.'}</p>
              </div>
            </div>
            <div className="button-row">
              {canManage&&selectedTable?<>
               <button className="button" type="button" disabled={actionPending} onClick={()=>void manage('qr_rotate',{
                tableId:selectedTable.id,expectedRevision:selectedTable.revision})}>{selectedTable.qrEnabled?'Rotar QR':'Emitir QR'}</button>
               <button className="button" type="button" disabled={actionPending||!selectedTable.qrEnabled}
                onClick={()=>void manage('qr_revoke',{tableId:selectedTable.id,expectedRevision:selectedTable.revision})}>Revocar QR</button>
               <button className="button button--primary" type="button" disabled={!qrPayload}
                onClick={()=>window.print()}>Imprimir</button></>:<><LockedButton>Rotar QR</LockedButton><LockedButton>Revocar QR</LockedButton></>}
            </div>
          </div>

          {actionMessage?<p className="honest-operational-note" role="status">{actionMessage}</p>:null}

          <div className="policy-note">
            <Icon name="info" size={20}/>
            <div>
              <strong>Pago conforme se pide</strong>
              <p>Esta política no forma parte de la proyección de mesas v1 y no se infiere. Su edición permanece bloqueada.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
