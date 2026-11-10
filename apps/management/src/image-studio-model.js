export const STUDIO_STEPS = Object.freeze([
  {id: 'source', label: 'Seleccionar', shortLabel: '1'},
  {id: 'transform', label: 'Configurar', shortLabel: '2'},
  {id: 'review', label: 'Revisar', shortLabel: '3'},
  {id: 'approve', label: 'Aprobar', shortLabel: '4'},
  {id: 'publish', label: 'Preparar publicación', shortLabel: '5'},
]);

export const IMAGE_RATIOS = Object.freeze([
  {id: 'five-four', label: '5:4', dimensions: '1000 × 800', use: 'Tarjeta de carta'},
  {id: 'four-three', label: '4:3', dimensions: '1200 × 900', use: 'Detalle de plato'},
  {id: 'square', label: '1:1', dimensions: '400 × 400', use: 'Formato compacto'},
]);

export const TRANSFORMATION_CONTROLS = Object.freeze([
  {
    id: 'lighting',
    title: 'Iluminación',
    description: 'Equilibrar luz, color y contraste conservando el aspecto real de los ingredientes.',
  },
  {
    id: 'framing',
    title: 'Encuadre',
    description: 'Optimizar el recorte sin ocultar partes del plato ni deformar su presentación.',
  },
  {
    id: 'background',
    title: 'Fondo',
    description: 'Limpiar distracciones con un fondo discreto, sin añadir atrezzo ni elementos nuevos.',
  },
  {
    id: 'presentation',
    title: 'Presentación',
    description: 'Mejorar claridad y nitidez sin cambiar ración, composición o ingredientes.',
  },
]);

export function validateLocalImage(file) {
  if (!file) return 'Selecciona una fotografía para continuar.';
  if (typeof file.type !== 'string' || !file.type.startsWith('image/')) {
    return 'Selecciona un archivo de imagen para la vista previa local.';
  }
  return '';
}

export function canNavigateToStudioStep(step, {hasSource, hasConfiguration = false}) {
  if (step === 'source') return true;
  if (step === 'transform') return hasSource;
  if (step === 'review') return hasSource && hasConfiguration;
  return false;
}

export function validateTransformationSelection(selectedIds) {
  return selectedIds.length > 0 ? '' : 'Selecciona al menos un ajuste antes de revisar la preparación.';
}
