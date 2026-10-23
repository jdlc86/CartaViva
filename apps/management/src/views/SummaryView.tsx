import {ConnectionNotice, EmptyState, PageHeader, StatusBadge} from '../components/Primitives';

const metrics = [
  {label: 'Ventas netas', detail: 'Importe confirmado, sin propinas'},
  {label: 'Recaudación cobrada', detail: 'Cobros confirmados menos devoluciones'},
  {label: 'Saldo pendiente', detail: 'Deuda exigible abierta'},
  {label: 'Pedidos confirmados', detail: 'Sin duplicar rondas ni reintentos'},
  {label: 'Ticket medio', detail: 'Por cuenta con consumo'},
] as const;

export function SummaryView() {
  return (
    <div className="view-stack">
      <PageHeader
        eyebrow="Resumen"
        title="Centro de operaciones"
        description="Indicadores del restaurante con semántica financiera verificable y sin datos de demostración."
        actions={<StatusBadge tone="warning">Origen de datos sin conectar</StatusBadge>}
      />
      <ConnectionNotice>
        Las métricas aparecerán únicamente cuando una sesión ADMIN autorizada y el contrato de lectura estén disponibles.
      </ConnectionNotice>

      <div className="period-bar" aria-label="Periodo del resumen">
        <span>Periodo</span>
        {['Hoy', 'Últimos 7 días', 'Este mes', 'Mes anterior'].map((period) => (
          <button className="segment-button" type="button" disabled key={period}>{period}</button>
        ))}
      </div>

      <section aria-labelledby="summary-metrics-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Indicadores</span>
            <h2 id="summary-metrics-title">Lectura del periodo</h2>
          </div>
          <span className="muted-label">Última actualización · —</span>
        </div>
        <div className="metric-grid">
          {metrics.map((metric) => (
            <article className="metric-card" key={metric.label}>
              <span>{metric.label}</span>
              <strong>Sin datos</strong>
              <p>{metric.detail}</p>
              <small>Variación · —</small>
            </article>
          ))}
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel panel--wide" aria-labelledby="sales-chart-title">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Tendencia</span>
              <h2 id="sales-chart-title">Ventas netas por día</h2>
            </div>
            <StatusBadge>Sin datos</StatusBadge>
          </div>
          <div className="chart-placeholder" aria-label="Gráfico no disponible porque no hay datos conectados">
            <span aria-hidden="true"/>
            <span aria-hidden="true"/>
            <span aria-hidden="true"/>
            <span aria-hidden="true"/>
            <p>El gráfico se dibujará con importes calculados por el servidor.</p>
          </div>
        </section>

        <section className="panel" aria-labelledby="ranking-title">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Catálogo</span>
              <h2 id="ranking-title">Platos más pedidos</h2>
            </div>
          </div>
          <EmptyState
            compact
            icon="catalog"
            title="Ranking no disponible"
            description="Se mostrará por unidades confirmadas netas de cancelaciones."
          />
        </section>
      </div>

      <section className="state-contract" aria-labelledby="summary-states-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Estados del módulo</span>
            <h2 id="summary-states-title">Respuesta clara ante cada situación</h2>
          </div>
        </div>
        <div className="state-contract__grid">
          <article><StatusBadge>Carga</StatusBadge><p>Esqueletos neutros sin anticipar resultados.</p></article>
          <article><StatusBadge>Vacío</StatusBadge><p>“Sin datos” cuando el servidor devuelve un periodo válido vacío.</p></article>
          <article><StatusBadge tone="danger">Error</StatusBadge><p>Mensaje recuperable sin reutilizar cifras antiguas como vigentes.</p></article>
        </div>
      </section>
    </div>
  );
}
