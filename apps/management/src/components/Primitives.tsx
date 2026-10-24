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
