export type ManagementArea = 'resumen' | 'catalogo' | 'mesas' | 'comandas' | 'equipo';
export const MANAGEMENT_AREAS: readonly ManagementArea[];
export function parseManagementArea(hash: unknown): ManagementArea;
export function toManagementHash(area: ManagementArea): `#${ManagementArea}`;
