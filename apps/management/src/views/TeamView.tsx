import {useState} from 'react';
import type {FormEvent} from 'react';
import type {StaffManagementGateway, StaffMaintenanceResult, StaffInvitationResult} from '../staff-management-gateway.js';
import {StaffManagementGatewayError} from '../staff-management-gateway.js';
import {Icon} from '../components/Icon';
import {ConnectionNotice, EmptyState, LockedButton, PageHeader, StatusBadge} from '../components/Primitives';

const roleCards=[
 {title:'ROOT',badge:'Exactamente uno',description:'Gobierno excepcional y recuperación. No es escritor administrativo ordinario.'},
 {title:'ADMIN',badge:'Varios permitidos',description:'Como máximo un ADMIN activo conserva la titularidad de escritura.'},
 {title:'Camarero',badge:'Permiso operativo',description:'Acceso limitado a las operaciones de sala documentadas.'},
 {title:'Cocina',badge:'Permiso operativo',description:'Acceso limitado a preparación, disponibilidad e incidencias autorizadas.'},
] as const;
const correlation=(prefix:string)=>`${prefix}_${crypto.randomUUID().replaceAll('-','_')}`;

export function TeamView({gateway}:{gateway?:StaffManagementGateway}){
 const [givenName,setGivenName]=useState('');const [familyName,setFamilyName]=useState('');
 const [email,setEmail]=useState('');const [role,setRole]=useState<'admin'|'waiter'|'kitchen'>('waiter');
 const [pending,setPending]=useState(false);const [error,setError]=useState<string|null>(null);
 const [invited,setInvited]=useState<StaffInvitationResult|null>(null);
 const [maintenance,setMaintenance]=useState<StaffMaintenanceResult|null>(null);
 const [reason,setReason]=useState('');const [confirmed,setConfirmed]=useState(false);

 const invite=async(event:FormEvent)=>{event.preventDefault();if(!gateway||pending)return;
  setPending(true);setError(null);setInvited(null);
  try{const result=await gateway.invite({email,givenName,familyName,requestedRole:role,
    correlationId:correlation('staff_invite')});setInvited(result);setGivenName('');setFamilyName('');setEmail('');}
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
   actions={gateway?<StatusBadge tone="brand">Canal administrativo restringido</StatusBadge>:
    <LockedButton icon="plus">Invitar persona</LockedButton>}/>
  {!gateway?<ConnectionNotice>Una sesión o Passkey válida no concede acceso empresarial. La membresía, el estado y la titularidad deben revalidarse en servidor.</ConnectionNotice>:null}
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
  <section className="panel team-directory" aria-labelledby="directory-title"><div className="panel-heading"><div><span className="eyebrow">Directorio</span><h2 id="directory-title">Miembros del equipo</h2></div></div><EmptyState icon="team" title="Sin personal conectado" description="El alta no inventa un listado: la futura proyección deberá respetar RLS y no exponer secretos de invitación."/><div className="button-row button-row--end"><LockedButton>Activar acceso</LockedButton><LockedButton>Suspender acceso</LockedButton></div></section>

  <section className="panel staff-maintenance" id="mantenimiento-codigos" aria-labelledby="maintenance-title"><div className="panel-heading"><div><span className="eyebrow">Mantenimiento global</span><h2 id="maintenance-title">Recuperación del pool de códigos</h2></div>{gateway?<button className="filter-button" type="button" disabled={pending} onClick={()=>void preview()}>Previsualizar elegibilidad</button>:<LockedButton>Previsualizar elegibilidad</LockedButton>}</div><p>Única vía de recuperación: revisa globalmente bajas revocadas, dependencias y asignaciones activas. No existe una acción individual para liberar códigos.</p>
   {maintenance?<div className="maintenance-summary" role="status"><div><span>Elegibles</span><strong>{maintenance.eligibleCount}</strong></div><div><span>Bloqueados</span><strong>{maintenance.blockedCount}</strong></div><div><span>Disponibles</span><strong>{maintenance.availableCount}</strong></div><div><span>Recuperados</span><strong>{maintenance.releasedCount}</strong></div></div>:null}
   {gateway?<div className="staff-maintenance__confirmation"><label>Motivo auditado<textarea maxLength={500} value={reason} onChange={event=>setReason(event.target.value)} placeholder="Motivo obligatorio para la recuperación global"/></label><label className="confirmation-check"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/><span>Confirmo la recuperación global de todos los códigos actualmente elegibles.</span></label><button className="button button--danger" type="button" disabled={pending||!confirmed||!reason.trim()} onClick={()=>void recover()}>Recuperar códigos elegibles</button></div>:null}
  </section>
 </div>;
}
