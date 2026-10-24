import type {ReactNode} from 'react';
import {Icon, type IconName} from './Icon';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function LockedButton({children, icon = 'lock'}: {children: ReactNode; icon?: IconName}) {
  return (
    <button className="button button--locked" type="button" disabled title="Requiere sesión y backend autorizados">
      <Icon name={icon} size={18}/>
      {children}
    </button>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  compact = false,
}: {
  icon: IconName;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'empty-state empty-state--compact' : 'empty-state'}>
      <span className="empty-state__icon"><Icon name={icon} size={24}/></span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

export function ConnectionNotice({
  children,
  title = 'Acceso administrativo no habilitado.',
  tone = 'warning',
}: {
  children: ReactNode;
  title?: string;
  tone?: 'warning' | 'brand';
}) {
  return (
    <div className={`connection-notice connection-notice--${tone}`} role="status">
      <Icon name={tone === 'brand' ? 'info' : 'lock'} size={18}/>
      <p><strong>{title}</strong> {children}</p>
    </div>
  );
}

export function LoadingState({title, description}: {title: string; description: string}) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="loading-state__mark" aria-hidden="true"/>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

export function ErrorState({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <span className="error-state__icon"><Icon name="alert" size={22}/></span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
        {onRetry ? <button className="button" type="button" onClick={onRetry}>Reintentar lectura</button> : null}
      </div>
    </div>
  );
}

export function SnapshotToolbar({
  subject,
  refreshing,
  refreshFailed,
  onRefresh,
}: {
  subject: string;
  refreshing: boolean;
  refreshFailed: boolean;
  onRefresh: () => void;
}) {
  const title = refreshing
    ? 'Actualizando lectura'
    : refreshFailed ? 'Última lectura conservada' : 'Lectura cargada';
  const description = refreshing
    ? `Solicitando una nueva lectura validada de ${subject} sin ocultar los datos visibles.`
    : refreshFailed
      ? 'La actualización falló y no se aplicó una respuesta parcial.'
      : 'Los datos sólo cambian cuando solicitas una actualización; no existe sondeo automático.';

  return (
    <section
      className={refreshFailed ? 'snapshot-toolbar snapshot-toolbar--error' : 'snapshot-toolbar'}
      aria-label={`Estado de la lectura de ${subject}`}
      aria-busy={refreshing}
    >
      <span className="snapshot-toolbar__icon">
        <Icon name={refreshFailed ? 'alert' : 'info'} size={20}/>
      </span>
      <div
        className="snapshot-toolbar__copy"
        role={refreshFailed ? 'alert' : undefined}
        aria-live={refreshFailed ? undefined : 'polite'}
      >
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <button className="button" type="button" disabled={refreshing} onClick={onRefresh}>
        <span className={refreshing ? 'snapshot-toolbar__refresh snapshot-toolbar__refresh--active' : 'snapshot-toolbar__refresh'}>
          <Icon name="refresh" size={18}/>
        </span>
        {refreshing ? 'Actualizando…' : refreshFailed ? 'Reintentar actualización' : 'Actualizar lectura'}
      </button>
    </section>
  );
}

export function StatusBadge({children, tone = 'neutral'}: {children: ReactNode; tone?: 'neutral' | 'brand' | 'warning' | 'danger'}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function DefinitionRow({label, value = '—'}: {label: string; value?: ReactNode}) {
  return (
    <div className="definition-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
