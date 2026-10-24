export const MANAGEMENT_AREAS = Object.freeze(['resumen', 'catalogo', 'mesas', 'comandas', 'equipo']);

export function parseManagementArea(hash) {
  if (typeof hash !== 'string') return 'resumen';
  const candidate = hash.startsWith('#') ? hash.slice(1) : hash;
  return MANAGEMENT_AREAS.includes(candidate) ? candidate : 'resumen';
}

export function toManagementHash(area) {
  if (!MANAGEMENT_AREAS.includes(area)) throw new Error('invalid_management_area');
  return `#${area}`;
}
