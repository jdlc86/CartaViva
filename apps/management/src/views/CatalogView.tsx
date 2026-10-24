import {useEffect, useMemo, useRef, useState} from 'react';
import {
  CATALOG_CATEGORIES,
  formatCatalogPrice,
  loadAdminPublishedCatalog,
  searchAdminPublishedCatalog,
  type AdminCatalogGateway,
  type AdminPublishedCatalogItem,
  type CatalogCategoryFilter,
} from '../catalog-read-model';
import {Icon} from '../components/Icon';
import {
  ConnectionNotice,
  DefinitionRow,
  EmptyState,
  ErrorState,
  LoadingState,
  LockedButton,
  PageHeader,
  StatusBadge,
} from '../components/Primitives';
import {ImageStudio} from './ImageStudio';

type CatalogSection = 'dishes' | 'categories' | 'studio';
type CatalogReadPhase = 'disconnected' | 'loading' | 'ready' | 'error';

type CatalogReadProps = Readonly<{
  phase: CatalogReadPhase;
  items: readonly AdminPublishedCatalogItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
}>;

export function CatalogView({gateway}: {gateway?: AdminCatalogGateway}) {
  const [section, setSection] = useState<CatalogSection>('dishes');
  const [phase, setPhase] = useState<CatalogReadPhase>(gateway ? 'loading' : 'disconnected');
  const [items, setItems] = useState<readonly AdminPublishedCatalogItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const controller = new AbortController();

    if (!gateway) {
      setPhase('disconnected');
      setItems([]);
      setSelectedId(null);
      return () => controller.abort();
    }

    setPhase('loading');
    setItems([]);
    setSelectedId(null);

    void loadAdminPublishedCatalog(gateway, {signal: controller.signal})
      .then((catalog) => {
        if (generationRef.current !== generation || controller.signal.aborted) return;
        setItems(catalog.items);
        setSelectedId(catalog.items[0]?.id ?? null);
        setPhase('ready');
      })
      .catch(() => {
        if (generationRef.current !== generation || controller.signal.aborted) return;
        setPhase('error');
      });

    return () => controller.abort();
  }, [gateway, reloadVersion]);

  const readProps: CatalogReadProps = {
    phase,
    items,
    selectedId,
    onSelect: setSelectedId,
    onRetry: () => setReloadVersion((value) => value + 1),
  };

  return (
    <div className="view-stack">
      <PageHeader
        eyebrow="Catálogo"
        title="Carta y publicación"
        description="Consulta la versión publicada de la carta sin confundirla con borradores, edición o disponibilidad administrativa."
        actions={<LockedButton icon="plus">Nuevo plato</LockedButton>}
      />
      {gateway ? (
        <ConnectionNotice title="Catálogo publicado en modo consulta." tone="brand">
          La proyección no incluye borradores ni habilita edición. Se carga una vez al abrir el área y sólo se reintenta por acción explícita.
        </ConnectionNotice>
      ) : (
        <ConnectionNotice>
          La lectura, el guardado y la publicación permanecen bloqueados hasta conectar una composición autorizada del catálogo.
        </ConnectionNotice>
      )}

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

      {section === 'dishes' ? <DishWorkspace {...readProps}/> : null}
      {section === 'categories' ? <CategoryWorkspace {...readProps}/> : null}
      {section === 'studio' ? <ImageStudio/> : null}
    </div>
  );
}

function DishWorkspace({phase, items, selectedId, onSelect, onRetry}: CatalogReadProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CatalogCategoryFilter>('Todos');
  const selectedItem = items.find((item) => item.id === selectedId) ?? null;
  const visibleItems = useMemo(
    () => searchAdminPublishedCatalog(items, {category, query}),
    [category, items, query],
  );

  return (
    <div className="workbench">
      <section className="workbench__master panel" aria-labelledby="dish-list-title" aria-busy={phase === 'loading'}>
        <div className="panel-heading panel-heading--stacked">
          <div className="catalog-list-heading">
            <div><span className="eyebrow">Exploración publicada</span><h2 id="dish-list-title">Platos</h2></div>
            {phase === 'ready' ? <StatusBadge>{items.length} publicados</StatusBadge> : null}
          </div>
          <label className={phase === 'ready' && items.length > 0 ? 'search-field' : 'search-field search-field--disabled'}>
            <Icon name="search" size={18}/>
            <span className="visually-hidden">Filtrar platos publicados</span>
            <input
              disabled={phase !== 'ready' || items.length === 0}
              type="search"
              value={query}
              placeholder="Nombre, categoría o alérgeno"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>

        <div className="catalog-filter-bar" role="group" aria-label="Filtrar por categoría publicada">
          {CATALOG_CATEGORIES.map((filter) => (
            <button
              className="segment-button"
              type="button"
              aria-pressed={category === filter}
              disabled={phase !== 'ready' || items.length === 0}
              onClick={() => setCategory(filter)}
              key={filter}
            >
              {filter}
            </button>
          ))}
        </div>

        {phase === 'disconnected' ? (
          <EmptyState
            icon="catalog"
            title="Sin catálogo conectado"
            description="La aplicación no incluye un transporte ni una sesión administrativa por defecto."
          />
        ) : null}

        {phase === 'loading' ? (
          <LoadingState title="Cargando catálogo" description="Solicitando únicamente la proyección publicada autorizada."/>
        ) : null}

        {phase === 'error' ? (
          <ErrorState
            title="No se pudo cargar el catálogo"
            description="La lectura falló o devolvió un contrato no válido. No se conserva una respuesta parcial."
            onRetry={onRetry}
          />
        ) : null}

        {phase === 'ready' && items.length === 0 ? (
          <EmptyState
            icon="catalog"
            title="No hay platos publicados"
            description="La proyección autorizada respondió correctamente y no contiene versiones públicas."
          />
        ) : null}

        {phase === 'ready' && items.length > 0 && visibleItems.length === 0 ? (
          <EmptyState
            compact
            icon="search"
            title="Sin coincidencias"
            description="Prueba con otro nombre, categoría o alérgeno entre los platos publicados."
          />
        ) : null}

        {phase === 'ready' && visibleItems.length > 0 ? (
          <ul className="catalog-list" aria-label="Platos publicados">
            {visibleItems.map((item) => (
              <li key={item.id}>
                <button
                  className={selectedId === item.id ? 'catalog-list-item catalog-list-item--active' : 'catalog-list-item'}
                  type="button"
                  aria-pressed={selectedId === item.id}
                  onClick={() => onSelect(item.id)}
                >
                  <span className="catalog-list-item__copy">
                    <strong>{item.name}</strong>
                    <small>{item.category} · {formatCatalogPrice(item.priceCents)}</small>
                  </span>
                  <StatusBadge tone={item.available ? 'brand' : 'warning'}>
                    {item.available ? 'DISPONIBLE' : 'AGOTADO'}
                  </StatusBadge>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="workbench__detail panel" aria-labelledby="dish-detail-title">
        <div className="panel-heading">
          <div><span className="eyebrow">Versión pública</span><h2 id="dish-detail-title">{selectedItem?.name ?? 'Selecciona un plato'}</h2></div>
          {selectedItem ? <StatusBadge tone="brand">PUBLICADO</StatusBadge> : <StatusBadge>Sin selección</StatusBadge>}
        </div>
        <div className="catalog-photo-placeholder">
          <Icon name="image" size={28}/>
          <span>{selectedItem ? 'Imagen no incluida en la proyección v1' : 'Fotografía 5:4'}</span>
        </div>
        <dl className="definition-grid">
          <DefinitionRow label="Nombre" value={selectedItem?.name}/>
          <DefinitionRow label="Categoría" value={selectedItem?.category}/>
          <DefinitionRow label="Precio" value={selectedItem ? formatCatalogPrice(selectedItem.priceCents) : undefined}/>
          <DefinitionRow label="Estado editorial" value={selectedItem ? 'Publicado' : 'Sin datos'}/>
          <DefinitionRow label="Disponibilidad" value={selectedItem ? (selectedItem.available ? 'Disponible' : 'Agotado') : 'Sin datos'}/>
          <DefinitionRow
            label="Alérgenos"
            value={selectedItem ? (selectedItem.allergens.length > 0 ? selectedItem.allergens.join(', ') : 'Sin alérgenos declarados') : '—'}
          />
        </dl>
        <div className="detail-block">
          <h3>Publicación explícita</h3>
          <p>Esta lectura sólo refleja el snapshot publicado. No permite deducir ni modificar el borrador editorial.</p>
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

function CategoryWorkspace({phase, items, onRetry}: CatalogReadProps) {
  const visibleCategories = CATALOG_CATEGORIES.slice(1).map((category) => {
    const categoryItems = items.filter((item) => item.category === category);
    return {
      category,
      count: categoryItems.length,
      available: categoryItems.filter((item) => item.available).length,
    };
  }).filter((category) => category.count > 0);

  return (
    <section className="panel catalog-categories" aria-labelledby="category-workspace-title" aria-busy={phase === 'loading'}>
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Proyección publicada</span>
          <h2 id="category-workspace-title">Categorías visibles</h2>
          <p>“Todos” es un filtro virtual. Esta vista agrupa los platos publicados recibidos y no expone el editor de categorías.</p>
        </div>
        <LockedButton icon="plus">Nueva categoría</LockedButton>
      </div>

      {phase === 'disconnected' ? (
        <EmptyState
          icon="overview"
          title="Sin categorías conectadas"
          description="Las categorías se mostrarán únicamente desde una proyección autorizada del catálogo publicado."
        />
      ) : null}
      {phase === 'loading' ? (
        <LoadingState title="Cargando categorías" description="Derivando la estructura exclusivamente de los platos publicados."/>
      ) : null}
      {phase === 'error' ? (
        <ErrorState
          title="No se pudieron cargar las categorías"
          description="La lectura completa del catálogo falló; no se presenta una agrupación parcial."
          onRetry={onRetry}
        />
      ) : null}
      {phase === 'ready' && visibleCategories.length === 0 ? (
        <EmptyState
          icon="overview"
          title="No hay categorías publicadas"
          description="Una categoría sólo aparece en esta proyección cuando contiene al menos un plato publicado."
        />
      ) : null}
      {phase === 'ready' && visibleCategories.length > 0 ? (
        <ul className="catalog-category-grid" aria-label="Categorías con platos publicados">
          {visibleCategories.map((category) => (
            <li key={category.category}>
              <span className="catalog-category-grid__icon"><Icon name="catalog" size={20}/></span>
              <div>
                <strong>{category.category}</strong>
                <span>{category.count} {category.count === 1 ? 'plato publicado' : 'platos publicados'}</span>
              </div>
              <StatusBadge tone={category.available > 0 ? 'brand' : 'warning'}>
                {category.available} disponibles
              </StatusBadge>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
