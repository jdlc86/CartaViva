import {useEffect, useRef, useState, type ChangeEvent} from 'react';
import {Icon} from '../components/Icon';
import {LockedButton, StatusBadge} from '../components/Primitives';

type Ratio = 'five-four' | 'four-three' | 'square';

const ratios: ReadonlyArray<{id: Ratio; label: string; dimensions: string}> = [
  {id: 'five-four', label: '5:4', dimensions: '1000 × 800'},
  {id: 'four-three', label: '4:3', dimensions: '1200 × 900'},
  {id: 'square', label: '1:1', dimensions: '400 × 400'},
];

export function ImageStudio() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [ratio, setRatio] = useState<Ratio>('five-four');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return undefined;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const onFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    if (selected && !selected.type.startsWith('image/')) {
      setError('Selecciona un archivo de imagen para la vista previa local.');
      setFile(null);
      event.target.value = '';
      return;
    }
    setError('');
    setFile(selected);
  };

  const clearFile = () => {
    setFile(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const selectedRatio = ratios.find((item) => item.id === ratio) ?? ratios[0];

  return (
    <section className="studio panel" aria-labelledby="image-studio-title">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Google · Sin conexión activa</span>
          <h2 id="image-studio-title">Estudio de imágenes</h2>
          <p>Revisa una fotografía local y prepara sus encuadres sin subirla ni modificar el catálogo.</p>
        </div>
        <StatusBadge tone="warning">Sólo vista previa local</StatusBadge>
      </div>

      <div className="studio-toolbar">
        <div>
          <span className="field-label">Fotografía original</span>
          <div className="button-row">
            <label className="button button--secondary" htmlFor="studio-image-input">
              <Icon name="upload" size={18}/>
              Seleccionar imagen local
            </label>
            <input
              ref={inputRef}
              className="visually-hidden"
              id="studio-image-input"
              type="file"
              accept="image/*"
              onChange={onFileSelected}
            />
            {file ? (
              <button className="button button--ghost" type="button" onClick={clearFile}>
                <Icon name="trash" size={18}/>
                Quitar
              </button>
            ) : null}
          </div>
          <small>La imagen permanece en este dispositivo durante la vista previa.</small>
          {error ? <p className="field-error" role="alert">{error}</p> : null}
        </div>

        <fieldset className="ratio-picker">
          <legend>Formato de revisión</legend>
          <div>
            {ratios.map((item) => (
              <button
                aria-pressed={ratio === item.id}
                className={ratio === item.id ? 'ratio-button ratio-button--active' : 'ratio-button'}
                key={item.id}
                type="button"
                onClick={() => setRatio(item.id)}
              >
                <strong>{item.label}</strong>
                <span>{item.dimensions}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="comparison-grid">
        <article className="comparison-card">
          <div className="comparison-card__heading">
            <div><span>Original</span><strong>{file?.name ?? 'Sin seleccionar'}</strong></div>
            <StatusBadge>{selectedRatio.label}</StatusBadge>
          </div>
          <div className="image-frame" data-ratio={ratio}>
            {previewUrl ? (
              <img src={previewUrl} alt={`Vista previa local de ${file?.name ?? 'la imagen seleccionada'}`}/>
            ) : (
              <div className="image-placeholder">
                <Icon name="image" size={30}/>
                <span>Selecciona una fotografía del plato</span>
              </div>
            )}
          </div>
        </article>

        <article className="comparison-card comparison-card--result">
          <div className="comparison-card__heading">
            <div><span>Versión derivada</span><strong>Pendiente de generación</strong></div>
            <StatusBadge tone="warning">No publicada</StatusBadge>
          </div>
          <div className="image-frame" data-ratio={ratio}>
            <div className="image-placeholder">
              <Icon name="sparkles" size={30}/>
              <span>No hay servicio Google conectado</span>
            </div>
          </div>
        </article>
      </div>

      <div className="studio-review">
        <div className="policy-note">
          <Icon name="info" size={20}/>
          <div>
            <strong>Revisión humana obligatoria</strong>
            <p>Una versión generada deberá compararse con el original para comprobar que no añade ingredientes ni altera ración o composición.</p>
          </div>
        </div>
        <div className="button-row button-row--end">
          <LockedButton icon="sparkles">Mejorar con Google</LockedButton>
          <LockedButton icon="check">Aprobar versión</LockedButton>
          <LockedButton>Aplicar al plato</LockedButton>
        </div>
      </div>
    </section>
  );
}
