import {useEffect, useRef, useState, type ChangeEvent, type RefObject} from 'react';
import {Icon} from '../components/Icon';
import {LockedButton, StatusBadge} from '../components/Primitives';
import {createImagePreviewController} from '../image-preview-lifecycle.js';
import {
  canNavigateToStudioStep,
  IMAGE_RATIOS,
  STUDIO_STEPS,
  TRANSFORMATION_CONTROLS,
  validateLocalImage,
  validateTransformationSelection,
  type ImageRatio,
  type StudioStep,
  type TransformationId,
} from '../image-studio-model.js';

type LibraryFilter = 'all' | 'original' | 'derived' | 'approved';

const libraryFilters: ReadonlyArray<{id: LibraryFilter; label: string; emptyLabel: string}> = [
  {id: 'all', label: 'Todas', emptyLabel: 'imágenes'},
  {id: 'original', label: 'Originales', emptyLabel: 'imágenes originales'},
  {id: 'derived', label: 'Derivadas', emptyLabel: 'versiones derivadas'},
  {id: 'approved', label: 'Aprobadas', emptyLabel: 'versiones aprobadas'},
];

const resultStates = [
  {title: 'Cargando', detail: 'La solicitud conserva el original mientras espera al proveedor.', tone: 'neutral' as const, icon: 'clock' as const},
  {title: 'Error', detail: 'El fallo no modifica el catálogo y ofrece un mensaje recuperable.', tone: 'danger' as const, icon: 'alert' as const},
  {title: 'Rechazada', detail: 'La versión queda descartada sin sustituir ni borrar el original.', tone: 'warning' as const, icon: 'trash' as const},
  {title: 'Aprobada', detail: 'Puede asociarse a un plato, pero todavía no está publicada.', tone: 'brand' as const, icon: 'check' as const},
];

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImageStudio() {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [previewController] = useState(() => createImagePreviewController());
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [ratio, setRatio] = useState<ImageRatio>('five-four');
  const [activeStep, setActiveStep] = useState<StudioStep>('source');
  const [selectedTransforms, setSelectedTransforms] = useState<TransformationId[]>([]);
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);

  useEffect(() => () => previewController.dispose(), [previewController]);

  const clearFile = (nextError = '') => {
    previewController.clear();
    setFile(null);
    setPreviewUrl('');
    setSelectedTransforms([]);
    setActiveStep('source');
    setError(nextError);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    const validationError = validateLocalImage(selected);
    if (validationError) {
      clearFile(validationError);
      return;
    }

    setError('');
    setFile(selected);
    setPreviewUrl(previewController.replace(selected));
    setSelectedTransforms([]);
    setActiveStep('transform');
  };

  const toggleTransform = (id: TransformationId) => {
    setError('');
    setSelectedTransforms((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  };

  const reviewPreparation = () => {
    const validationError = validateTransformationSelection(selectedTransforms);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setActiveStep('review');
  };

  const navigateToStep = (step: StudioStep) => {
    if (!canNavigateToStudioStep(step, {hasSource: Boolean(file), hasConfiguration: selectedTransforms.length > 0})) return;
    setError('');
    setActiveStep(step);
  };

  const showOriginal = () => {
    if (!previewUrl) return;
    setZoom(1);
    dialogRef.current?.showModal();
  };

  const selectedRatio = IMAGE_RATIOS.find((item) => item.id === ratio) ?? IMAGE_RATIOS[0];
  const hasConfiguration = selectedTransforms.length > 0;
  const selectedControlLabels = TRANSFORMATION_CONTROLS
    .filter((control) => selectedTransforms.includes(control.id))
    .map((control) => control.title);

  return (
    <div className="studio-stack">
      <section className="studio panel" aria-labelledby="image-studio-title">
        <div className="panel-heading studio-heading">
          <div>
            <span className="eyebrow">Google · Integración futura</span>
            <h2 id="image-studio-title">Estudio de imágenes</h2>
            <p>Prepara una mejora fiel al plato, revísala y mantenla separada del catálogo hasta una publicación explícita.</p>
          </div>
          <StatusBadge tone="warning">Sólo preparación local</StatusBadge>
        </div>

        <nav className="studio-progress" aria-label="Flujo del Estudio de imágenes">
          <ol>
            {STUDIO_STEPS.map((step) => {
              const canNavigate = canNavigateToStudioStep(step.id, {hasSource: Boolean(file), hasConfiguration});
              const isActive = activeStep === step.id;
              const isServerStep = step.id === 'approve' || step.id === 'publish';
              return (
                <li key={step.id}>
                  <button
                    aria-current={isActive ? 'step' : undefined}
                    className={isActive ? 'studio-step studio-step--active' : 'studio-step'}
                    disabled={!canNavigate}
                    title={isServerStep ? 'Requiere resultado y autorización del servidor' : undefined}
                    type="button"
                    onClick={() => navigateToStep(step.id)}
                  >
                    <span>{step.shortLabel}</span>
                    <strong>{step.label}</strong>
                    {isServerStep ? <Icon name="lock" size={14}/> : null}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="studio-workspace">
          {activeStep === 'source' ? (
            <SourceStep error={error} file={file} inputRef={inputRef} onFileSelected={onFileSelected}/>
          ) : null}

          {activeStep === 'transform' ? (
            <TransformStep
              error={error}
              file={file}
              previewUrl={previewUrl}
              ratio={ratio}
              selectedTransforms={selectedTransforms}
              onClear={() => clearFile()}
              onOpenOriginal={showOriginal}
              onPreviewError={() => clearFile('El navegador no pudo abrir esta imagen. Selecciona otro archivo.')}
              onRatioChange={setRatio}
              onReview={reviewPreparation}
              onToggleTransform={toggleTransform}
            />
          ) : null}

          {activeStep === 'review' ? (
            <ReviewStep
              file={file}
              previewUrl={previewUrl}
              ratio={ratio}
              selectedControlLabels={selectedControlLabels}
              selectedRatioLabel={`${selectedRatio.label} · ${selectedRatio.dimensions}`}
              onBack={() => navigateToStep('transform')}
              onOpenOriginal={showOriginal}
              onPreviewError={() => clearFile('El navegador no pudo abrir esta imagen. Selecciona otro archivo.')}
            />
          ) : null}
        </div>

        <div className="studio-policy-grid">
          <div className="policy-note">
            <Icon name="info" size={20}/>
            <div>
              <strong>Fidelidad y revisión humana obligatorias</strong>
              <p>Una versión generada deberá compararse con el original. No puede añadir ingredientes ni alterar ración, composición o identidad real.</p>
            </div>
          </div>
          <div className="policy-note policy-note--neutral">
            <Icon name="lock" size={20}/>
            <div>
              <strong>Original protegido</strong>
              <p>La vista previa usa memoria temporal del navegador. Ninguna imagen se sube, sobrescribe o persiste desde esta pantalla.</p>
            </div>
          </div>
        </div>
      </section>

      <ResultStateContract/>
      <ImageLibrary filter={libraryFilter} onFilterChange={setLibraryFilter}/>
      <CatalogAssociation/>

      <dialog className="image-lightbox" ref={dialogRef} aria-labelledby="image-lightbox-title" onClose={() => setZoom(1)}>
        <div className="image-lightbox__header">
          <div>
            <span className="eyebrow">Vista ampliada local</span>
            <h2 id="image-lightbox-title">Fotografía original</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Cerrar vista ampliada" onClick={() => dialogRef.current?.close()}>
            <Icon name="close"/>
          </button>
        </div>
        <div className="image-lightbox__viewport">
          {previewUrl ? <img src={previewUrl} alt={`Vista ampliada de ${file?.name ?? 'la fotografía original'}`} style={{transform: `scale(${zoom})`}}/> : null}
        </div>
        <label className="zoom-control">
          <Icon name="zoom" size={18}/>
          <span>Zoom</span>
          <input type="range" min="1" max="2.5" step="0.25" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}/>
          <output>{Math.round(zoom * 100)} %</output>
        </label>
      </dialog>
    </div>
  );
}

function SourceStep({
  error,
  file,
  inputRef,
  onFileSelected,
}: {
  error: string;
  file: File | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onFileSelected: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <section className="studio-stage" aria-labelledby="source-step-title">
      <div className="studio-stage__intro">
        <span className="eyebrow">Paso 1</span>
        <h3 id="source-step-title">Selecciona la fotografía original</h3>
        <p>Usa una imagen propia o autorizada del plato real. El archivo sólo se abrirá en este dispositivo.</p>
      </div>
      <label className="upload-dropzone" htmlFor="studio-image-input">
        <span className="upload-dropzone__icon"><Icon name="upload" size={26}/></span>
        <strong>{file ? file.name : 'Elegir fotografía local'}</strong>
        <span>El backend definirá y validará los límites definitivos de formato y tamaño.</span>
        <span className="button button--secondary">Seleccionar archivo</span>
      </label>
      <input ref={inputRef} className="visually-hidden" id="studio-image-input" type="file" accept="image/*" onChange={onFileSelected}/>
      {error ? <p className="field-error field-error--box" role="alert"><Icon name="alert" size={18}/>{error}</p> : null}
    </section>
  );
}

function TransformStep({
  error,
  file,
  previewUrl,
  ratio,
  selectedTransforms,
  onClear,
  onOpenOriginal,
  onPreviewError,
  onRatioChange,
  onReview,
  onToggleTransform,
}: {
  error: string;
  file: File | null;
  previewUrl: string;
  ratio: ImageRatio;
  selectedTransforms: TransformationId[];
  onClear: () => void;
  onOpenOriginal: () => void;
  onPreviewError: () => void;
  onRatioChange: (ratio: ImageRatio) => void;
  onReview: () => void;
  onToggleTransform: (id: TransformationId) => void;
}) {
  return (
    <section className="studio-stage" aria-labelledby="transform-step-title">
      <div className="studio-stage__intro studio-stage__intro--row">
        <div>
          <span className="eyebrow">Paso 2</span>
          <h3 id="transform-step-title">Configura una transformación fiel</h3>
          <p>Estas preferencias sólo preparan una futura solicitud; no se envían ni guardan.</p>
        </div>
        <button className="button button--ghost" type="button" onClick={onClear}><Icon name="trash" size={18}/>Cambiar foto</button>
      </div>

      <div className="transform-layout">
        <OriginalPreview file={file} previewUrl={previewUrl} ratio={ratio} onOpen={onOpenOriginal} onPreviewError={onPreviewError}/>
        <div className="transform-settings">
          <fieldset className="transformation-picker">
            <legend>¿Qué quieres mejorar?</legend>
            <div>
              {TRANSFORMATION_CONTROLS.map((control) => (
                <label className="transformation-option" key={control.id}>
                  <input type="checkbox" checked={selectedTransforms.includes(control.id)} onChange={() => onToggleTransform(control.id)}/>
                  <span className="transformation-option__check"><Icon name="check" size={16}/></span>
                  <span><strong>{control.title}</strong><small>{control.description}</small></span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="ratio-picker">
            <legend>Formato de salida previsto</legend>
            <div>
              {IMAGE_RATIOS.map((item) => (
                <button
                  aria-pressed={ratio === item.id}
                  className={ratio === item.id ? 'ratio-button ratio-button--active' : 'ratio-button'}
                  key={item.id}
                  type="button"
                  onClick={() => onRatioChange(item.id)}
                >
                  <strong>{item.label}</strong>
                  <span>{item.dimensions}</span>
                  <small>{item.use}</small>
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
      {error ? <p className="field-error field-error--box" role="alert"><Icon name="alert" size={18}/>{error}</p> : null}
      <div className="studio-stage__actions">
        <button className="button button--secondary" type="button" onClick={onReview}>Revisar preparación <Icon name="chevron" size={18}/></button>
      </div>
    </section>
  );
}

function ReviewStep({
  file,
  previewUrl,
  ratio,
  selectedControlLabels,
  selectedRatioLabel,
  onBack,
  onOpenOriginal,
  onPreviewError,
}: {
  file: File | null;
  previewUrl: string;
  ratio: ImageRatio;
  selectedControlLabels: string[];
  selectedRatioLabel: string;
  onBack: () => void;
  onOpenOriginal: () => void;
  onPreviewError: () => void;
}) {
  return (
    <section className="studio-stage" aria-labelledby="review-step-title">
      <div className="studio-stage__intro studio-stage__intro--row">
        <div>
          <span className="eyebrow">Paso 3</span>
          <h3 id="review-step-title">Revisa antes de solicitar la mejora</h3>
          <p>El resultado permanecerá vacío hasta que exista un servicio Google autorizado y conectado desde backend.</p>
        </div>
        <StatusBadge tone="warning">Generación no disponible</StatusBadge>
      </div>

      <div className="review-summary" aria-label="Configuración preparada">
        <div><span>Formato</span><strong>{selectedRatioLabel}</strong></div>
        <div><span>Ajustes</span><strong>{selectedControlLabels.join(', ')}</strong></div>
        <div><span>Archivo</span><strong>{file ? `${file.name} · ${formatFileSize(file.size)}` : 'Sin archivo'}</strong></div>
      </div>

      <div className="comparison-grid">
        <article className="comparison-card">
          <div className="comparison-card__heading">
            <div><span>Original protegido</span><strong>{file?.name ?? 'Sin seleccionar'}</strong></div>
            <button className="icon-button icon-button--label" type="button" onClick={onOpenOriginal}><Icon name="zoom" size={17}/> Ampliar</button>
          </div>
          <div className="image-frame" data-ratio={ratio}>
            {previewUrl ? <img src={previewUrl} alt={`Vista previa local de ${file?.name ?? 'la fotografía original'}`} onError={onPreviewError}/> : null}
          </div>
        </article>

        <article className="comparison-card comparison-card--result">
          <div className="comparison-card__heading">
            <div><span>Resultado futuro</span><strong>Pendiente de generación</strong></div>
            <StatusBadge tone="warning">No publicado</StatusBadge>
          </div>
          <div className="image-frame" data-ratio={ratio}>
            <div className="image-placeholder">
              <span className="image-placeholder__icon"><Icon name="sparkles" size={28}/></span>
              <strong>No hay resultado de IA</strong>
              <span>La interfaz no simula una imagen ni una respuesta del proveedor.</span>
              <button className="icon-button icon-button--label" type="button" disabled><Icon name="zoom" size={17}/> Ampliar</button>
            </div>
          </div>
        </article>
      </div>

      <div className="studio-stage__actions studio-stage__actions--split">
        <button className="button button--ghost" type="button" onClick={onBack}>Volver a configurar</button>
        <div className="button-row button-row--end">
          <LockedButton icon="sparkles">Mejorar con Google</LockedButton>
          <LockedButton icon="trash">Rechazar resultado</LockedButton>
          <LockedButton icon="check">Aprobar versión</LockedButton>
        </div>
      </div>
    </section>
  );
}

function OriginalPreview({file, previewUrl, ratio, onOpen, onPreviewError}: {file: File | null; previewUrl: string; ratio: ImageRatio; onOpen: () => void; onPreviewError: () => void}) {
  return (
    <article className="source-preview">
      <div className="source-preview__heading">
        <div><span>Original local</span><strong>{file?.name ?? 'Sin archivo'}</strong></div>
        <button className="icon-button" type="button" aria-label="Ampliar fotografía original" onClick={onOpen}><Icon name="zoom"/></button>
      </div>
      <div className="image-frame" data-ratio={ratio}>
        {previewUrl ? <img src={previewUrl} alt={`Vista previa local de ${file?.name ?? 'la fotografía original'}`} onError={onPreviewError}/> : null}
      </div>
      {file ? <small>{file.type || 'Tipo sin identificar'} · {formatFileSize(file.size)}</small> : null}
    </article>
  );
}

function ResultStateContract() {
  return (
    <section className="panel studio-state-contract" aria-labelledby="result-states-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Contrato de interfaz</span>
          <h2 id="result-states-title">Estados del resultado</h2>
          <p>Patrones preparados para representar respuestas reales del backend; no son resultados de demostración.</p>
        </div>
        <StatusBadge>Sin estado activo</StatusBadge>
      </div>
      <div className="result-state-grid">
        {resultStates.map((state) => (
          <article key={state.title}>
            <span className={`result-state-icon result-state-icon--${state.tone}`}><Icon name={state.icon} size={18}/></span>
            <div><strong>{state.title}</strong><p>{state.detail}</p></div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ImageLibrary({filter, onFilterChange}: {filter: LibraryFilter; onFilterChange: (filter: LibraryFilter) => void}) {
  const activeLabel = libraryFilters.find((item) => item.id === filter)?.emptyLabel ?? 'imágenes';
  return (
    <section className="panel studio-library" aria-labelledby="image-library-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Biblioteca futura</span>
          <h2 id="image-library-title">Originales y versiones</h2>
          <p>Inventario visual preparado para originales, derivadas y aprobadas, sin almacenamiento ni registros persistentes.</p>
        </div>
        <LockedButton icon="upload">Añadir original</LockedButton>
      </div>
      <div className="library-toolbar">
        <div className="module-tabs" role="group" aria-label="Filtrar biblioteca de imágenes">
          {libraryFilters.map((item) => (
            <button key={item.id} aria-pressed={filter === item.id} type="button" onClick={() => onFilterChange(item.id)}>{item.label}</button>
          ))}
        </div>
        <label className="search-field search-field--disabled">
          <Icon name="search" size={18}/><span className="visually-hidden">Buscar en biblioteca</span>
          <input type="search" placeholder="Buscar por plato o archivo" disabled/>
        </label>
      </div>
      <div className="image-library-empty">
        <span><Icon name="library" size={26}/></span>
        <div>
          <h3>No hay {activeLabel} conectadas</h3>
          <p>Cuando exista almacenamiento privado autorizado, cada versión mostrará origen, formato, estado, autor y trazabilidad.</p>
        </div>
      </div>
    </section>
  );
}

function CatalogAssociation() {
  return (
    <section className="panel catalog-association" aria-labelledby="catalog-association-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Paso 5 · Contrato pendiente</span>
          <h2 id="catalog-association-title">Preparar publicación</h2>
          <p>Una imagen aprobada podrá asociarse a un plato concreto sin publicarse automáticamente.</p>
        </div>
        <StatusBadge tone="warning">Bloqueado por backend</StatusBadge>
      </div>
      <div className="association-flow" aria-label="Flujo futuro de asociación y publicación">
        <div><span className="association-flow__icon"><Icon name="check"/></span><span>Versión aprobada</span><strong>Sin selección</strong></div>
        <Icon name="chevron" size={20}/>
        <label><span>Plato del catálogo</span><select disabled aria-label="Plato del catálogo"><option>Catálogo no conectado</option></select></label>
        <Icon name="chevron" size={20}/>
        <div><span className="association-flow__icon"><Icon name="catalog"/></span><span>Borrador editorial</span><strong>No preparado</strong></div>
      </div>
      <div className="catalog-association__footer">
        <p><Icon name="info" size={18}/> Asociar una imagen al borrador y publicar el plato son operaciones distintas, autorizadas y auditables.</p>
        <div className="button-row button-row--end">
          <LockedButton>Aplicar al plato</LockedButton>
          <LockedButton icon="check">Preparar publicación</LockedButton>
          <LockedButton icon="lock">Publicar en catálogo</LockedButton>
        </div>
      </div>
    </section>
  );
}
