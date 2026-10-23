import {useState} from 'react';
import {Icon} from '../components/Icon';
import {ConnectionNotice, DefinitionRow, EmptyState, LockedButton, PageHeader, StatusBadge} from '../components/Primitives';
import {ImageStudio} from './ImageStudio';

type CatalogSection = 'dishes' | 'categories' | 'studio';

const editorialStates = [
  {label: 'Borrador', tone: 'neutral' as const},
  {label: 'Publicado', tone: 'brand' as const},
  {label: 'Agotado', tone: 'warning' as const},
  {label: 'Retirado', tone: 'danger' as const},
] as const;

export function CatalogView() {
  const [section, setSection] = useState<CatalogSection>('dishes');

  return (
    <div className="view-stack">
      <PageHeader
        eyebrow="Catálogo"
        title="Carta y publicación"
        description="Borradores, versiones publicadas, disponibilidad y fotografía se mantienen como conceptos separados."
        actions={<LockedButton icon="plus">Nuevo plato</LockedButton>}
      />
      <ConnectionNotice>
        La lectura, el guardado y la publicación permanecen bloqueados hasta conectar sesión ADMIN, titularidad y contratos de catálogo.
      </ConnectionNotice>

      <div className="module-tabs" role="group" aria-label="Secciones del catálogo">
        <button aria-pressed={section === 'dishes'} type="button" onClick={() => setSection('dishes')}>
          <Icon name="catalog" size={18}/> Platos
        </button>
        <button aria-pressed={section === 'categories'} type="button" onClick={() => setSection('categories')}>
          <Icon name="overview" size={18}/> Categorías
        </button>
        <button aria-pressed={section === 'studio'} type="button" onClick={() => setSection('studio')}>
          <Icon name="sparkles" size={18}/> Estudio de imágenes
        </button>
      </div>

      {section === 'dishes' ? <DishWorkspace/> : null}
      {section === 'categories' ? <CategoryWorkspace/> : null}
      {section === 'studio' ? <ImageStudio/> : null}
    </div>
  );
}

function DishWorkspace() {
  return (
    <div className="workbench">
      <section className="workbench__master panel" aria-labelledby="dish-list-title">
        <div className="panel-heading panel-heading--stacked">
          <div><span className="eyebrow">Exploración</span><h2 id="dish-list-title">Platos</h2></div>
          <label className="search-field search-field--disabled">
            <Icon name="search" size={18}/>
            <span className="visually-hidden">Buscar plato</span>
            <input type="search" placeholder="Buscar plato" disabled/>
          </label>
        </div>
        <div className="state-legend" aria-label="Estados editoriales documentados">
          {editorialStates.map((state) => <StatusBadge key={state.label} tone={state.tone}>{state.label}</StatusBadge>)}
        </div>
        <EmptyState icon="catalog" title="Sin catálogo conectado" description="No se incluyen platos, precios ni categorías ficticias en la interfaz."/>
      </section>

      <section className="workbench__detail panel" aria-labelledby="dish-detail-title">
        <div className="panel-heading">
          <div><span className="eyebrow">Ficha editorial</span><h2 id="dish-detail-title">Selecciona un plato</h2></div>
          <StatusBadge>Sin selección</StatusBadge>
        </div>
        <div className="catalog-photo-placeholder">
          <Icon name="image" size={28}/>
          <span>Fotografía 5:4</span>
        </div>
        <dl className="definition-grid">
          <DefinitionRow label="Nombre"/>
          <DefinitionRow label="Categoría"/>
          <DefinitionRow label="Precio"/>
          <DefinitionRow label="Estado editorial" value="Sin datos"/>
          <DefinitionRow label="Disponibilidad" value="Sin datos"/>
          <DefinitionRow label="Alérgenos" value="Pendiente de cargar"/>
        </dl>
        <div className="detail-block">
          <h3>Publicación explícita</h3>
          <p>Guardar conserva el borrador; publicar valida y sustituye la versión pública. Agotado no equivale a retirado.</p>
          <div className="button-row">
            <LockedButton>Guardar borrador</LockedButton>
            <LockedButton icon="check">Publicar cambios</LockedButton>
            <LockedButton>Retirar plato</LockedButton>
          </div>
        </div>
      </section>
    </div>
  );
}

function CategoryWorkspace() {
  return (
    <section className="panel catalog-categories" aria-labelledby="category-workspace-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Estructura dinámica</span>
          <h2 id="category-workspace-title">Categorías</h2>
          <p>El orden y los nombres se publican desde gestión; “Todos” es un filtro virtual, no una categoría persistida.</p>
        </div>
        <LockedButton icon="plus">Nueva categoría</LockedButton>
      </div>
      <EmptyState
        icon="overview"
        title="Sin categorías conectadas"
        description="Una categoría sólo será visible al cliente si está publicada y contiene al menos un plato publicado no retirado."
      />
    </section>
  );
}
