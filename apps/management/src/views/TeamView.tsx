import {Icon} from '../components/Icon';
import {ConnectionNotice, EmptyState, LockedButton, PageHeader, StatusBadge} from '../components/Primitives';

const roleCards = [
  {title: 'ROOT', badge: 'Exactamente uno', description: 'Gobierno excepcional y recuperación. No es escritor administrativo ordinario.'},
  {title: 'ADMIN', badge: 'Varios permitidos', description: 'Como máximo un ADMIN activo conserva la titularidad de escritura.'},
  {title: 'Camarero', badge: 'Permiso operativo', description: 'Acceso limitado a las operaciones de sala documentadas.'},
  {title: 'Cocina', badge: 'Permiso operativo', description: 'Acceso limitado a preparación, disponibilidad e incidencias autorizadas.'},
] as const;

export function TeamView() {
  return (
    <div className="view-stack">
      <PageHeader
        eyebrow="Equipo"
        title="Personal y accesos"
        description="Roles durables, activación explícita y una sola titularidad administrativa efectiva."
        actions={<LockedButton icon="plus">Invitar persona</LockedButton>}
      />
      <ConnectionNotice>
        Una sesión o Passkey válida no concede acceso empresarial. La membresía, el estado y la titularidad deben revalidarse en servidor.
      </ConnectionNotice>

      <section className="governance-card panel" aria-labelledby="ownership-title">
        <div className="governance-card__icon"><Icon name="lock" size={24}/></div>
        <div>
          <span className="eyebrow">Gobierno administrativo</span>
          <h2 id="ownership-title">Titularidad de escritura</h2>
          <p>El titular actual no puede mostrarse sin una lectura autorizada de membresía y ownership.</p>
        </div>
        <div className="governance-card__status">
          <span>Titular actual</span>
          <strong>Sin datos conectados</strong>
          <LockedButton>Gestionar titularidad</LockedButton>
        </div>
      </section>

      <section aria-labelledby="roles-title">
        <div className="section-heading">
          <div><span className="eyebrow">Modelo de acceso</span><h2 id="roles-title">Roles documentados</h2></div>
        </div>
        <div className="role-grid">
          {roleCards.map((role) => (
            <article className="role-card" key={role.title}>
              <div className="role-card__heading"><h3>{role.title}</h3><StatusBadge>{role.badge}</StatusBadge></div>
              <p>{role.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel team-directory" aria-labelledby="directory-title">
        <div className="panel-heading">
          <div><span className="eyebrow">Directorio</span><h2 id="directory-title">Miembros del equipo</h2></div>
          <div className="button-row">
            <button className="filter-button" type="button" disabled>Rol</button>
            <button className="filter-button" type="button" disabled>Estado</button>
          </div>
        </div>
        <EmptyState
          icon="team"
          title="Sin personal conectado"
          description="No se muestran nombres, invitaciones ni estados ficticios."
        />
        <div className="button-row button-row--end">
          <LockedButton>Activar acceso</LockedButton>
          <LockedButton>Suspender acceso</LockedButton>
        </div>
      </section>
    </div>
  );
}
