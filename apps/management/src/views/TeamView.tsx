import {useCallback, useEffect, useRef, useState} from 'react';
import type {FormEvent} from 'react';
import type {StaffManagementGateway, StaffMaintenanceResult, StaffInvitationResult} from '../staff-management-gateway.js';
import {StaffManagementGatewayError} from '../staff-management-gateway.js';
import type {StaffDirectoryGateway, StaffDirectoryMember, StaffOwnProfile} from '../staff-directory-gateway.js';
import {Icon} from '../components/Icon';
import {ConnectionNotice, EmptyState, LockedButton, PageHeader, StatusBadge} from '../components/Primitives';

const roleCards=[
 {title:'ROOT',badge:'Exactamente uno',description:'Gobierno excepcional y recuperación. No es escritor administrativo ordinario.'},
 {title:'ADMIN',badge:'Varios permitidos',description:'Como máximo un ADMIN activo conserva la titularidad de escritura.'},
 {title:'Camarero',badge:'Permiso operativo',description:'Acceso limitado a las operaciones de sala documentadas.'},
 {title:'Cocina',badge:'Permiso operativo',description:'Acceso limitado a preparación, disponibilidad e incidencias autorizadas.'},
] as const;
const correlation=(prefix:string)=>`${prefix}_${crypto.randomUUID().replaceAll('-','_')}`;

const roleLabel={admin:'Administración',waiter:'Sala',kitchen:'Cocina'} as const;
const stateLabel={invited:'Invitación pendiente',accepted:'Invitación aceptada',registered:'Credencial registrada',
 active:'Activo',suspended:'Suspendido',revoked:'Revocado'} as const;

export function TeamView({gateway,directoryGateway}:{gateway?:StaffManagementGateway;directoryGateway?:StaffDirectoryGateway}){
 const [givenName,setGivenName]=useState('');const [familyName,setFamilyName]=useState('');
 const [email,setEmail]=useState('');const [role,setRole]=useState<'admin'|'waiter'|'kitchen'>('waiter');
 const [pending,setPending]=useState(false);const [error,setError]=useState<string|null>(null);
 const [invited,setInvited]=useState<StaffInvitationResult|null>(null);
 const [maintenance,setMaintenance]=useState<StaffMaintenanceResult|null>(null);
 const [reason,setReason]=useState('');const [confirmed,setConfirmed]=useState(false);
 const [profile,setProfile]=useState<StaffOwnProfile|null>(null);
 const [profilePhase,setProfilePhase]=useState<'idle'|'loading'|'ready'|'error'>('idle');
 const [members,setMembers]=useState<ReadonlyArray<StaffDirectoryMember>>([]);
 const [directoryPhase,setDirectoryPhase]=useState<'idle'|'loading'|'ready'|'error'>('idle');
 const [directoryError,setDirectoryError]=useState<string|null>(null);
 const [searchInput,setSearchInput]=useState('');const [search,setSearch]=useState<string|null>(null);
 const [cursor,setCursor]=useState(0);const [nextCursor,setNextCursor]=useState<number|null>(null);
 const [selected,setSelected]=useState<StaffDirectoryMember|null>(null);
 const readEpoch=useRef(0);

 const loadDirectory=useCallback(async(nextSearch:string|null,nextCursor=0)=>{
  if(!directoryGateway)return;const epoch=++readEpoch.current;
  setDirectoryPhase('loading');setDirectoryError(null);setSelected(null);
  try{const page=await directoryGateway.list({search:nextSearch,cursor:nextCursor,limit:20});
   if(epoch!==readEpoch.current)return;setMembers(page.items);setCursor(nextCursor);
   setNextCursor(page.nextCursor);setDirectoryPhase('ready');}
  catch{if(epoch!==readEpoch.current)return;setMembers([]);setDirectoryPhase('error');
   setDirectoryError('No se pudo recuperar el directorio autorizado. No se muestran datos anteriores.');}
 },[directoryGateway]);

 useEffect(()=>{let active=true;readEpoch.current+=1;
  if(!directoryGateway){setProfile(null);setProfilePhase('idle');setMembers([]);setDirectoryPhase('idle');return;}
  setProfilePhase('loading');
  void directoryGateway.self().then(result=>{if(!active)return;setProfile(result.profile);setProfilePhase('ready');
   if(result.profile.role==='admin')void loadDirectory(null,0);})
   .catch(()=>{if(active){setProfile(null);setProfilePhase('error');setDirectoryPhase('idle');}});
  return()=>{active=false;readEpoch.current+=1;};
 },[directoryGateway,loadDirectory]);

 const invite=async(event:FormEvent)=>{event.preventDefault();if(!gateway||pending)return;
  setPending(true);setError(null);setInvited(null);
  try{const result=await gateway.invite({email,givenName,familyName,requestedRole:role,
    correlationId:correlation('staff_invite')});setInvited(result);setGivenName('');setFamilyName('');setEmail('');
    if(directoryGateway&&profile?.role==='admin')void loadDirectory(search,0);}
  catch(failure){if(failure instanceof StaffManagementGatewayError&&failure.code==='staff_employee_codes_exhausted')
    setError('No quedan códigos de empleado disponibles. Revisa el mantenimiento global para recuperar códigos de personal dado de baja');
   else setError('El alta no quedó confirmada. No se ha reservado ningún código parcial.');}
  finally{setPending(false);}};
 const preview=async()=>{if(!gateway||pending)return;setPending(true);setError(null);
  try{setMaintenance(await gateway.previewCodeMaintenance({correlationId:correlation('staff_code_preview')}));}
  catch{setError('No se pudo obtener una previsualización confirmada del mantenimiento global.');}
  finally{setPending(false);}};
 const recover=async()=>{if(!gateway||pending||!confirmed||!reason.trim())return;setPending(true);setError(null);
  try{const result=await gateway.recoverCodes({reason,confirmed:true,
    correlationId:correlation('staff_code_recover')});setMaintenance(result);setConfirmed(false);setReason('');}
  catch{setError('La recuperación global no quedó confirmada; el pool permanece sin cambios parciales.');}
  finally{setPending(false);}};

 return <div className="view-stack">
  <PageHeader eyebrow="Equipo" title="Personal y accesos"
   description="Alta trazable, identidad operativa compacta y recuperación global controlada."
   actions={gateway||directoryGateway?<StatusBadge tone="brand">Lectura y acciones separadas por capacidad</StatusBadge>:
    <LockedButton icon="plus">Invitar persona</LockedButton>}/>
  {!gateway&&!directoryGateway?<ConnectionNotice>Una sesión o Passkey válida no concede acceso empresarial. La membresía, el estado y la titularidad deben revalidarse en servidor.</ConnectionNotice>:null}
  {error?<div className="field-error field-error--box" role="alert"><Icon name="alert" size={18}/><span>{error}</span></div>:null}

  {gateway?<section className="panel staff-enrollment" aria-labelledby="staff-enrollment-title">
   <div className="panel-heading"><div><span className="eyebrow">Alta de empleado</span><h2 id="staff-enrollment-title">Identidad personal y operativa</h2></div></div>
   <form className="staff-enrollment__form" onSubmit={invite}>
    <label>Nombre<input required maxLength={80} autoComplete="given-name" value={givenName} onChange={event=>setGivenName(event.target.value)}/></label>
    <label>Apellidos<input required maxLength={160} autoComplete="family-name" value={familyName} onChange={event=>setFamilyName(event.target.value)}/></label>
    <label>Correo de invitación<input required maxLength={254} type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)}/></label>
    <label>Rol<select value={role} onChange={event=>setRole(event.target.value as typeof role)}><option value="waiter">Camarero</option><option value="kitchen">Cocina</option><option value="admin">Administración</option></select></label>
    <button className="button button--primary" disabled={pending} type="submit">{pending?'Confirmando alta…':'Invitar y reservar código'}</button>
   </form>
   {invited?<div className="staff-enrollment__result" role="status"><Icon name="check" size={20}/><div><strong>{invited.givenName} {invited.familyName}</strong><span>Identificador operativo <b>{invited.operationalDisplayId}</b> · código {invited.employeeCode}</span></div></div>:null}
  </section>:null}

  <section className="governance-card panel" aria-labelledby="ownership-title"><div className="governance-card__icon"><Icon name="lock" size={24}/></div><div><span className="eyebrow">Gobierno administrativo</span><h2 id="ownership-title">Titularidad de escritura</h2><p>El titular actual se revalida en la misma transacción de cada operación.</p></div><div className="governance-card__status"><span>Titular actual</span><strong>{gateway?'Sesión administrativa verificada':'Sin datos conectados'}</strong><LockedButton>Gestionar titularidad</LockedButton></div></section>
  <section aria-labelledby="roles-title"><div className="section-heading"><div><span className="eyebrow">Modelo de acceso</span><h2 id="roles-title">Roles documentados</h2></div></div><div className="role-grid">{roleCards.map(item=><article className="role-card" key={item.title}><div className="role-card__heading"><h3>{item.title}</h3><StatusBadge>{item.badge}</StatusBadge></div><p>{item.description}</p></article>)}</div></section>
  <section className="panel own-staff-profile" aria-labelledby="own-profile-title">
   <div className="panel-heading"><div><span className="eyebrow">Datos propios</span><h2 id="own-profile-title">Mi ficha operativa</h2></div></div>
   {!directoryGateway?<EmptyState icon="lock" title="Ficha no conectada" description="La consulta propia requiere identidad activa y una proyección SQL dedicada."/>:
    profilePhase==='loading'?<div className="directory-loading" role="status"><span aria-hidden="true"/><p>Verificando tu ficha…</p></div>:
    profilePhase==='error'?<EmptyState icon="alert" title="Ficha no disponible" description="No se conservan datos en el navegador cuando la autorización falla."/>:
    profile?<div className="own-profile-card"><div className="staff-avatar" aria-hidden="true">{profile.givenName.slice(0,1)}{profile.familyName.slice(0,1)}</div><div><strong>{profile.givenName} {profile.familyName}</strong><span>{profile.email}</span></div><StatusBadge tone="brand">{profile.operationalDisplayId}</StatusBadge><span>{roleLabel[profile.role]}</span></div>:null}
  </section>

  <section className="panel team-directory" aria-labelledby="directory-title"><div className="panel-heading"><div><span className="eyebrow">Directorio administrativo</span><h2 id="directory-title">Miembros del equipo</h2></div>
   {directoryGateway&&profile?.role==='admin'?<form className="directory-search" role="search" onSubmit={event=>{event.preventDefault();const normalized=searchInput.trim()||null;setSearch(normalized);void loadDirectory(normalized,0);}}><label className="visually-hidden" htmlFor="staff-directory-search">Buscar personal</label><input id="staff-directory-search" maxLength={80} value={searchInput} onChange={event=>setSearchInput(event.target.value)} placeholder="Nombre, correo o código"/><button className="filter-button" type="submit" disabled={directoryPhase==='loading'}>Buscar</button></form>:null}</div>
       {!directoryGateway?<EmptyState icon="team" title="Sin personal conectado" description="La interfaz no inventa miembros: necesita la proyección RLS autorizada."/>:
    profilePhase==='loading'?<div className="directory-loading" role="status"><span aria-hidden="true"/><p>Comprobando el ámbito autorizado…</p></div>:
    profile&&profile.role!=='admin'?<ConnectionNotice>Tu ficha propia está disponible, pero sala y cocina no disponen de un directorio general de compañeros.</ConnectionNotice>:
    directoryPhase==='loading'?<div className="directory-loading" role="status"><span aria-hidden="true"/><p>Recuperando personal autorizado…</p></div>:
    directoryPhase==='error'?<EmptyState icon="alert" title="Directorio no disponible" description={directoryError??'La lectura autorizada no pudo completarse.'}/>:
    directoryPhase==='ready'&&members.length===0?<EmptyState icon="team" title={search?'Sin coincidencias':'Sin personal registrado'} description={search?'Prueba una búsqueda distinta.':'El directorio confirmado está vacío; no se muestran datos ficticios.'}/>:
    directoryPhase==='ready'?<><ul className="staff-directory-list">{members.map(member=><li key={member.enrollmentId}><button className="staff-directory-row" type="button" onClick={()=>void directoryGateway.detail(member.enrollmentId).then(result=>setSelected(result.member)).catch(()=>setDirectoryError('No se pudo abrir la ficha seleccionada.'))}><span className="staff-avatar" aria-hidden="true">{member.givenName.slice(0,1)}{member.familyName.slice(0,1)}</span><span><strong>{member.givenName} {member.familyName}</strong><small>{member.email}</small></span><b>{member.operationalDisplayId??'Sin código'}</b><span>{roleLabel[member.role]}</span><StatusBadge tone={member.state==='active'?'brand':member.state==='revoked'?'danger':'warning'}>{stateLabel[member.state]}</StatusBadge></button></li>)}</ul><div className="directory-pagination" aria-label="Paginación del directorio"><button className="filter-button" type="button" disabled={cursor===0} onClick={()=>void loadDirectory(search,Math.max(0,cursor-20))}>Anterior</button><span>Registros {members.length?cursor+1:0}–{cursor+members.length}</span><button className="filter-button" type="button" disabled={nextCursor===null} onClick={()=>void loadDirectory(search,nextCursor??0)}>Siguiente</button></div></>:null}
   {selected?<aside className="staff-directory-detail" aria-label="Ficha administrativa"><button type="button" aria-label="Cerrar ficha" onClick={()=>setSelected(null)}>×</button><span className="eyebrow">Ficha autorizada</span><h3>{selected.givenName} {selected.familyName}</h3><dl><div><dt>Correo</dt><dd>{selected.email}</dd></div><div><dt>Identificador</dt><dd>{selected.operationalDisplayId??'Sin código asignado'}</dd></div><div><dt>Rol</dt><dd>{roleLabel[selected.role]}</dd></div><div><dt>Estado</dt><dd>{stateLabel[selected.state]}</dd></div><div><dt>Alta durable</dt><dd>{new Date(selected.createdAt).toLocaleDateString('es-ES')}</dd></div></dl><p>Esta ficha es de solo lectura. Las capacidades de escritura se autorizan por separado.</p></aside>:null}
   {gateway?<div className="button-row button-row--end"><LockedButton>Activar acceso</LockedButton><LockedButton>Suspender acceso</LockedButton></div>:null}
  </section>

  <section className="panel staff-maintenance" id="mantenimiento-codigos" aria-labelledby="maintenance-title"><div className="panel-heading"><div><span className="eyebrow">Mantenimiento global</span><h2 id="maintenance-title">Recuperación del pool de códigos</h2></div>{gateway?<button className="filter-button" type="button" disabled={pending} onClick={()=>void preview()}>Previsualizar elegibilidad</button>:<LockedButton>Previsualizar elegibilidad</LockedButton>}</div><p>Única vía de recuperación: revisa globalmente bajas revocadas, dependencias y asignaciones activas. No existe una acción individual para liberar códigos.</p>
   {maintenance?<div className="maintenance-summary" role="status"><div><span>Elegibles</span><strong>{maintenance.eligibleCount}</strong></div><div><span>Bloqueados</span><strong>{maintenance.blockedCount}</strong></div><div><span>Disponibles</span><strong>{maintenance.availableCount}</strong></div><div><span>Recuperados</span><strong>{maintenance.releasedCount}</strong></div></div>:null}
   {gateway?<div className="staff-maintenance__confirmation"><label>Motivo auditado<textarea maxLength={500} value={reason} onChange={event=>setReason(event.target.value)} placeholder="Motivo obligatorio para la recuperación global"/></label><label className="confirmation-check"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/><span>Confirmo la recuperación global de todos los códigos actualmente elegibles.</span></label><button className="button button--danger" type="button" disabled={pending||!confirmed||!reason.trim()} onClick={()=>void recover()}>Recuperar códigos elegibles</button></div>:null}
  </section>
 </div>;
}
